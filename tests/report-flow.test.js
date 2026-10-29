const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { fixture, spectralFixture } = require('./report-fixtures')
const { validateForm } = require('../utils/experiment-input')
const { supportedExperiments, calculateReport } = require('../utils/experiment-report')

function harness(file, channel) {
  const filename = path.resolve(__dirname, '..', file)
  let definition
  const calls = { routes: [], clipboard: [], toasts: [], scrolls: [], back: [], titles: [], modals: [] }
  const wx = {
    navigateTo: options => calls.routes.push(options), showToast: options => calls.toasts.push(options),
    setClipboardData: options => calls.clipboard.push(options.data),
    pageScrollTo: options => calls.scrolls.push(options),
    setNavigationBarTitle: options => calls.titles.push(options.title),
    navigateBack: options => calls.back.push(options), redirectTo: options => calls.routes.push(options),
    showModal: options => calls.modals.push(options),
  }
  // 导航辅助模块使用运行时wx；按小程序实际调用方式在测试期间提供。
  global.wx = wx
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require: createRequire(filename), Page: value => { definition = value }, wx })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), getOpenerEventChannel: () => channel }
  page.setData = (updates, callback) => {
    for (const [key, value] of Object.entries(updates)) {
      const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let target = page.data
      keys.slice(0, -1).forEach(k => { target = target[k] })
      target[keys[keys.length - 1]] = value
    }
    if (callback) callback()
  }
  return { page, calls, wx }
}

function eventChannel() {
  const listeners = {}, events = []
  return { events, on: (name, listener) => { listeners[name] = listener }, emit: (name, payload) => { events.push({ name, payload }); if (listeners[name]) listeners[name](payload) } }
}

function resultPage(f) {
  const channel = eventChannel()
  const h = harness('pages/experiment-report/index.js', channel)
  h.page.onLoad()
  channel.emit('reportInput', { input: f.input })
  return { ...h, channel }
}

test('结果卡片分别展开计算过程，折叠不删除数据，复制始终包含完整过程', () => {
  const { page, calls } = resultPage(fixture('single-slit'))
  assert.ok(page.data.summary.results.every(r => r.expanded === false))
  const original = JSON.stringify(page.report)
  page.onToggleResult({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(page.data.summary.results[0].expanded, true)
  assert.equal(page.data.summary.results[1].expanded, false)
  page.onToggleResult({ currentTarget: { dataset: { index: 0 } } })
  page.onToggleResult({ currentTarget: { dataset: { index: 'bad' } } })
  assert.equal(page.data.summary.results[0].expanded, false)
  assert.equal(JSON.stringify(page.report), original)
  page.onCopy()
  assert.match(calls.clipboard[0], /公式：/)
  assert.match(calls.clipboard[0], /报告不确定度=/)
})

test('16个实验直接按教材计算，无结果页条件选择，视图数据小于小程序单次传输上限', () => {
  for (const id of supportedExperiments) {
    const f = id === 'spectral-analysis' ? spectralFixture() : fixture(id)
    const before = JSON.stringify(f)
    const { page } = resultPage(f)
    assert.equal(page.data.summary.status, 'complete', id)
    assert.equal(page.data.fields, undefined)
    assert.equal(page.report.processingOptions.uncertaintyPolicy, 'course')
    assert.equal(page.report.processingOptions.coverageFactor, 2)
    assert.ok(page.data.summary.requirements.processing.length)
    assert.ok(Buffer.byteLength(JSON.stringify(page.data)) < 1024 * 1024)
    assert.equal(JSON.stringify(f), before)
  }
})

test('表格未填完时定位原表错误，填写完整后传原始字符串进入结果页', () => {
  const h = harness('pages/experiment-input/index.js')
  h.page.onLoad({ id: 'young-modulus' })
  h.page.onStartCalculation()
  assert.ok(h.page.data.errorCount > 0)
  assert.equal(h.calls.routes.length, 0)
  assert.ok(h.calls.scrolls.length)
  assert.ok(h.calls.toasts.length)
  const f = fixture('young-modulus')
  assert.equal(validateForm(f.form).length, 0)
  h.page.setData(f.form)
  h.page.onStartCalculation()
  const nav = h.calls.routes[0], channel = eventChannel()
  assert.equal(nav.url, '/pages/experiment-report/index')
  assert.equal(h.page.data.calculating, true)
  h.page.onStartCalculation()
  assert.equal(h.calls.routes.length, 1)
  nav.success({ eventChannel: channel })
  nav.complete()
  assert.equal(h.page.data.calculating, false)
  const received = channel.events[0].payload
  assert.equal(received.input.tables[0].rows[1].loading, '0.200')
  assert.equal(received.input.info.studentName, '')
  h.page.data.tables[0].rows[1].cells[2].value = '0.210'
  h.page.onStartCalculation()
  h.calls.routes[1].success({ eventChannel: channel })
  h.calls.routes[1].complete()
  assert.equal(channel.events[1].payload.input.tables[0].rows[1].loading, '0.210')
  assert.equal(channel.events[1].payload.settings, undefined)
})

test('导航失败可重试；恢复空白模板会清空测量与派生值', () => {
  const h = harness('pages/experiment-input/index.js')
  h.page.onLoad({ id: 'young-modulus' })
  h.page.setData(fixture('young-modulus').form)
  h.page.onStartCalculation()
  h.calls.routes[0].fail()
  h.calls.routes[0].complete()
  assert.equal(h.page.data.calculating, false)
  assert.match(h.calls.toasts[0].title, /失败/)
  h.page.onStartCalculation()
  assert.equal(h.calls.routes.length, 2)
  h.calls.routes[1].complete()
  h.page.onReset()
  h.calls.modals[0].success({ confirm: true })
  assert.equal(h.page.data.tables[0].rows[0].cells[2].value, '')
})

test('15个通用表格均能前进，塞曼切换方案只传所选报告表', () => {
  for (const id of supportedExperiments.filter(id => id !== 'spectral-analysis')) {
    const h = harness('pages/experiment-input/index.js')
    h.page.onLoad({ id })
    h.page.setData(fixture(id).form)
    h.page.onStartCalculation()
    assert.equal(h.calls.routes.length, 1, id + ':' + h.page.data.message)
  }
  const h = harness('pages/experiment-input/index.js'), channel = eventChannel()
  h.page.onLoad({ id: 'zeeman-effect' })
  h.page.setData(fixture('zeeman-effect').form)
  h.page.onStartCalculation()
  h.calls.routes[0].complete()
  h.page.setData(fixture('zeeman-effect', 'pi').form)
  h.page.onStartCalculation()
  h.calls.routes[1].success({ eventChannel: channel })
  h.calls.routes[1].complete()
  assert.equal(channel.events[0].payload.input.mode, 'pi')
  assert.ok(!channel.events[0].payload.input.tables.some(t => t.id === 'combined-rings'))
  h.page.setData(fixture('zeeman-effect').form)
  h.page.onStartCalculation()
  h.calls.routes[2].success({ eventChannel: channel })
  h.calls.routes[2].complete()
  assert.equal(channel.events[1].payload.input.mode, 'combined')
  assert.equal(channel.events[1].payload.input.parameters.componentA, '4')
})

test('直接显示教材结果，返回保留原始值；缺真实尺寸仍提示回表核对，不编造装置参数', () => {
  const h = resultPage(fixture('young-modulus'))
  assert.equal(h.page.data.summary.status, 'complete')
  assert.equal(h.page.report.processingOptions.extensionModel, 'optical-lever')
  h.page.onCopy()
  assert.match(h.calls.clipboard[0], /杨氏模量/)
  h.page.onBack()
  assert.equal(h.calls.back.length, 1)
  assert.equal(h.page.input.tables[0].rows[1].loading, '0.200')
  const incomplete = fixture('young-modulus')
  incomplete.input.parameters.leverDistanceM = ''
  const partial = resultPage(incomplete)
  assert.equal(partial.page.data.summary.status, 'partial')
  assert.ok(!partial.page.report.results.some(r => r.id === 'youngModulus'))
  assert.equal(partial.page.data.fields, undefined)
})

test('结果页没有口径或补充条件选择，旧口径参数也不能改变教材不确定度', () => {
  const f = fixture('sound-speed')
  const report = calculateReport(f.input, { uncertaintyPolicy: 'standard', coverageFactor: 3 })
  assert.equal(report.processingOptions.uncertaintyPolicy, 'course')
  assert.equal(report.processingOptions.coverageFactor, 2)
  const markup = fs.readFileSync(path.resolve(__dirname, '../pages/experiment-report/index.wxml'), 'utf8')
  assert.doesNotMatch(markup, /<picker|补充计算条件|onSettingPick/)
})

test('图解点自动选择并在结果页列出，RLC最大读数点标记原始行', () => {
  const kelvin = resultPage(fixture('kelvin-bridge'))
  assert.ok(kelvin.page.data.summary.graphSelections.length)
  assert.equal(kelvin.page.data.summary.graphSelections[0].points.length, 3)
  const rlc = resultPage(fixture('rlc'))
  assert.ok(rlc.page.report.results.find(r => r.id === 'f0Hz').selectedData.sourceRow > 0)
  assert.ok(rlc.page.report.tasks.some(t => t.id === 'phase-direction'))
})

test('光谱也能进入报告页；空组或半填组阻止前进，缺仪器项只标记部分结果', () => {
  const h = harness('pages/spectral-analysis/index.js')
  h.page.onLoad()
  h.page.onStartCalculation()
  assert.equal(h.calls.routes.length, 0)
  const f = spectralFixture()
  h.page.setData({ ...f.input.parameters, groups: f.input.tables[0].rows })
  h.page.onStartCalculation()
  assert.equal(h.calls.routes.length, 1)
  const channel = eventChannel()
  h.calls.routes[0].success({ eventChannel: channel })
  h.calls.routes[0].complete()
  assert.equal(channel.events[0].payload.input.experimentId, 'spectral-analysis')
  h.page.data.groups[0].minusLeft = ''
  h.page.onStartCalculation()
  assert.equal(h.calls.routes.length, 1)
  const input = spectralFixture()
  input.input.parameters.angularInstrumentUncertainty = ''
  assert.equal(resultPage(input).page.data.summary.status, 'partial')
})

test('光的偏振进入记录整理页，不生成数值结果；物理错误结果不能复制', () => {
  const observation = resultPage(fixture('polarization'))
  assert.equal(observation.page.data.summary.kind, 'observation')
  assert.equal(observation.page.data.fields, undefined)
  assert.equal(observation.page.data.summary.results.length, 0)
  observation.page.onCopy()
  assert.match(observation.calls.clipboard[0], /实际角/)
  const f = fixture('michelson')
  f.input.tables.find(t => t.id === 'positions').rows[0].order = '100'
  const bad = resultPage(f)
  assert.equal(bad.page.data.summary.status, 'invalid')
  bad.page.onCopy()
  assert.equal(bad.calls.clipboard.length, 0)
})

test('直接打开、未知实验及延迟收到数据均有明确状态，页面事件和路由注册完整', () => {
  const empty = harness('pages/experiment-report/index.js', eventChannel())
  empty.page.onLoad(); empty.page.onReady()
  assert.match(empty.page.data.loadError, /表格页/)
  empty.page.onBack()
  assert.equal(empty.calls.back.length, 1)
  const f = fixture('strain-sensor')
  empty.page.channel.emit('reportInput', { input: f.input, settings: {} })
  assert.equal(empty.page.data.loadError, '')
  assert.equal(empty.page.data.summary.status, 'complete')
  const bad = fixture('young-modulus'); bad.input.experimentId = 'unknown'
  assert.match(resultPage(bad).page.data.loadError, /不受支持/)
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../app.json'), 'utf8'))
  assert.ok(config.pages.includes('pages/experiment-report/index'))
  for (const pagePath of ['experiment-input', 'spectral-analysis', 'experiment-report']) {
    const h = harness('pages/' + pagePath + '/index.js', eventChannel())
    const template = fs.readFileSync(path.resolve(__dirname, '../pages/' + pagePath + '/index.wxml'), 'utf8')
    for (const match of template.matchAll(/bind(?:tap|input|blur|change)="([^"]+)"/g)) assert.equal(typeof h.page[match[1]], 'function', pagePath + ':' + match[1])
  }
})
