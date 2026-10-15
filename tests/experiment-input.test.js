const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const { definitions } = require('../utils/experiment-input-config')
const { supportedIds, createForm, evaluateForm, parseReading, resizeTable, collectPayload, makeDraft, restoreDraft } = require('../utils/experiment-input')
const cell = (form, ti, ri, key) => form.tables[ti].rows[ri].cells.find(item => item.key === key)
const parameter = (form, key) => form.parameters.find(item => item.key === key)
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`)

function fillForm(id) {
  const form = createForm(id)
  Object.assign(form.personal, { studentClass: '测试班', studentName: '测试用户', studentId: 'TEST-001', experimentDate: '2026-10-15' })
  form.parameters.forEach(p => { if (!p.optional && !p.value) p.value = p.key.includes('Zero') ? '0' : '1' })
  form.tables.filter(t => !t.derived).forEach(table => table.rows.forEach((row, ri) => row.cells.forEach(c => {
    if (!c.editable || c.optional || c.value) return
    c.value = c.key === 'b' ? '1' : c.key === 'a' ? '2' : String(ri + 1)
  })))
  return evaluateForm(form)
}

test('七项实验与汇总表的编号、单位、行数和字段一致', () => {
  assert.deepEqual(supportedIds, ['young-modulus', 'kelvin-bridge', 'ballistic-galvanometer', 'thermal-conductivity', 'rlc', 'torsion-pendulum', 'pn-junction'])
  assert.deepEqual(supportedIds.map(id => createForm(id).tables.length), [3, 3, 4, 2, 3, 3, 2])
  assert.equal(parameter(createForm('young-modulus'), 'wireLength').unit, 'mm')
  assert.equal(parameter(createForm('torsion-pendulum'), 'cylinderMass').unit, 'kg')
  assert.equal(createForm('thermal-conductivity').tables[1].rows.length, 20)
  assert.equal(createForm('pn-junction').tables[1].rows.length, 20)
  assert.equal(createForm('pn-junction').parameters[1].value, '')
  assert.equal(createForm('rlc').tables[1].columns.find(c => c.key === 'phaseRadians').unit, 'rad')
  assert.equal(createForm('rlc').tables[1].columns.at(-1).key, 'phaseNote')
  assert.equal(createForm('kelvin-bridge').tables[2].columns.at(-1).key, 'rx')
})

test('读数区分空白与零，允许负零差和科学计数法，拒绝非法输入', () => {
  assert.equal(parseReading('').value, null)
  assert.ok(parseReading('').error)
  assert.equal(parseReading('0').value, 0)
  near(parseReading('-0.009').value, -.009)
  near(parseReading('1.20e-3').value, .0012)
  for (const value of ['NaN', 'Infinity', '1e999', '0x10', '1,2', '3V', 'true']) assert.ok(parseReading(value).error)
  assert.ok(parseReading('0', { min: 0, exclusiveMin: true }).error)
  assert.ok(parseReading('0', { nonzero: true }).error)
})

test('全新表单没有伪造实测数据；表单实例之间互不污染', () => {
  const a = createForm('pn-junction'), b = createForm('pn-junction')
  assert.equal(cell(a, 0, 0, 'voltage').value, '0.350')
  assert.equal(cell(a, 0, 0, 'current').value, '')
  assert.equal(cell(a, 0, 0, 'lnCurrent').display, '—')
  cell(a, 0, 0, 'current').value = '10'
  assert.equal(cell(b, 0, 0, 'current').value, '')
  assert.throws(() => createForm('sound-speed'))
})

test('杨氏模量正确进行加卸载均值及前后半组逐差，清空后移除旧结果', () => {
  const f = createForm('young-modulus')
  for (let i = 0; i < 10; i++) { cell(f, 0, i, 'loading').value = String(i * .1); cell(f, 0, i, 'unloading').value = String(i * .1 + .02) }
  evaluateForm(f)
  near(cell(f, 0, 0, 'meanReading').numeric, .01)
  near(cell(f, 2, 0, 'force').numeric, 4.9005)
  near(cell(f, 2, 0, 'extension').numeric, .5)
  assert.equal(cell(f, 2, 0, 'startIndex').numeric, 1)
  assert.equal(cell(f, 2, 0, 'endIndex').numeric, 6)
  cell(f, 0, 5, 'unloading').value = ''; evaluateForm(f)
  assert.equal(cell(f, 2, 0, 'extension').numeric, null)
})

test('RLC 相位采用 rad，B>A 明确报错，修正后立即恢复', () => {
  const f = createForm('rlc')
  cell(f, 1, 0, 'a').value = '2'; cell(f, 1, 0, 'b').value = '1'; evaluateForm(f)
  near(cell(f, 1, 0, 'phaseRadians').numeric, Math.PI / 6)
  cell(f, 1, 0, 'b').value = '3'; evaluateForm(f)
  assert.ok(cell(f, 1, 0, 'phaseRadians').error)
  assert.equal(cell(f, 1, 0, 'phaseRadians').numeric, null)
  cell(f, 1, 0, 'b').value = '0'; evaluateForm(f)
  assert.equal(cell(f, 1, 0, 'phaseRadians').numeric, 0)
  assert.equal(cell(f, 1, 0, 'phaseRadians').error, '')
})

test('反向放电保留负电荷，取自然对数绝对值；零电荷不静默处理', () => {
  const f = createForm('ballistic-galvanometer')
  cell(f, 3, 0, 'charge').value = '-2'; evaluateForm(f)
  near(cell(f, 3, 0, 'lnAbsCharge').numeric, Math.log(2))
  cell(f, 3, 0, 'charge').value = '0'; evaluateForm(f)
  assert.ok(cell(f, 3, 0, 'charge').error)
  assert.equal(cell(f, 3, 0, 'lnAbsCharge').numeric, null)
})

test('扭摆分别处理十周期与五周期，金属细杆基线不要求填写位置', () => {
  const f = createForm('torsion-pendulum')
  cell(f, 1, 0, 'tenT0').value = '20'; evaluateForm(f)
  assert.equal(cell(f, 1, 0, 't0').numeric, 2)
  for (let i = 1; i <= 5; i++) cell(f, 2, 0, `time${i}`).value = String(i + 2)
  evaluateForm(f)
  assert.equal(cell(f, 2, 0, 'position').editable, false)
  assert.equal(cell(f, 2, 0, 'meanFiveTx').numeric, 5)
  assert.equal(cell(f, 2, 0, 'tx').numeric, 1)
})

test('增减行遵守最小、最大行数，新增行不会复制实测值，逐差表随之更新', () => {
  const f = createForm('young-modulus')
  cell(f, 0, 9, 'loading').value = '123'
  assert.equal(resizeTable(f, 0, 2), true)
  assert.equal(f.tables[0].rows.length, 12)
  assert.equal(f.tables[2].rows.length, 6)
  assert.equal(cell(f, 0, 10, 'mass').value, '1000')
  assert.equal(cell(f, 0, 10, 'loading').value, '')
  assert.equal(resizeTable(f, 0, 1), false)
  while (resizeTable(f, 0, -2)) {}
  assert.equal(f.tables[0].rows.length, 4)
  assert.equal(resizeTable(f, 2, 1), false)
})

test('七个实验可导出带单位的数据，保留原始字符串；半填与非法行均阻止导出', () => {
  for (const id of supportedIds) {
    const f = fillForm(id), result = collectPayload(f)
    assert.equal(result.ok, true, `${id}: ${JSON.stringify(result.errors)}`)
    assert.equal(result.payload.personal.student_id, 'TEST-001')
    assert.equal(result.payload.tables.length, f.tables.length)
    assert.doesNotThrow(() => JSON.stringify(result.payload))
  }
  const f = fillForm('pn-junction')
  cell(f, 0, 0, 'current').value = '1.20'; evaluateForm(f)
  let result = collectPayload(f)
  assert.equal(result.payload.raw_input.tables.iv[0].current, '1.20')
  assert.equal(result.payload.tables[0].rows[0].current, 1.2)
  cell(f, 0, 0, 'current').value = ''; result = collectPayload(f)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(e => e.field === 'current'))
  f.personal.studentName = ''; assert.ok(collectPayload(f).errors.some(e => e.field === 'studentName'))
})

test('备注为文本，缺失可选备注不阻止完整行；非递增测量点会提示核查', () => {
  const f = fillForm('rlc')
  cell(f, 1, 0, 'phaseNote').value = '电压超前，请结合示波器核查'
  const r = collectPayload(f)
  assert.equal(r.ok, true)
  assert.equal(r.payload.tables[1].rows[0].phaseNote, '电压超前，请结合示波器核查')
  assert.equal(f.tables[1].completedRows, 10)
  cell(f, 0, 1, 'frequency').value = '0.20'; evaluateForm(f)
  assert.ok(cell(f, 0, 1, 'frequency').error)
})

test('PN 导出同时提供现有 Python 后端所需的温度、电流与个人信息结构', () => {
  const f = fillForm('pn-junction')
  parameter(f, 'ivTemperature').value = '30'
  parameter(f, 'constantCurrent').value = '50'
  const payload = collectPayload(f).payload.backend_input
  assert.equal(payload.personal.class_name, '测试班')
  assert.equal(payload.iv.temperature_c, '30')
  assert.equal(payload.iv.current_unit, 'uA')
  assert.equal(payload.iv.points.length, 20)
  assert.equal(payload.temperature_runs[0].voltage_mode, 'absolute')
  assert.equal(payload.temperature_runs[0].current, '50')
})

test('草稿按实验隔离，保留未完成读数及动态行数，不信任保存的计算值', () => {
  const f = createForm('pn-junction')
  cell(f, 0, 0, 'current').value = '1.200'
  resizeTable(f, 0, 1)
  const draft = makeDraft(f)
  draft.tables[0].rows[0].lnCurrent = '999'
  const restored = restoreDraft('pn-junction', draft)
  assert.equal(restored.tables[0].rows.length, 21)
  assert.equal(cell(restored, 0, 0, 'current').value, '1.200')
  near(cell(restored, 0, 0, 'lnCurrent').numeric, Math.log(1.2))
  assert.equal(cell(restored, 0, 1, 'current').value, '')
  assert.throws(() => restoreDraft('rlc', draft))
  draft.tables[0].rows = Array(1001).fill({})
  assert.throws(() => restoreDraft('pn-junction', draft))
})

function pageHarness(id, storage = {}) {
  let definition
  const calls = { clipboard: null, toasts: [], scroll: null, modal: null }
  global.Page = value => { definition = value }
  global.wx = {
    getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = JSON.parse(JSON.stringify(value)) },
    removeStorageSync: key => { delete storage[key] }, setNavigationBarTitle() {},
    showToast: value => calls.toasts.push(value), pageScrollTo: value => { calls.scroll = value },
    showModal: value => { calls.modal = value }, setClipboardData: value => { calls.clipboard = value.data; value.success() },
  }
  delete require.cache[require.resolve('../pages/experiment-input/index')]
  require('../pages/experiment-input/index')
  delete global.Page
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)) }
  page.setData = patch => {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let target = page.data
      for (const p of parts.slice(0, -1)) target = target[p]
      target[parts.at(-1)] = value
    }
  }
  page.onLoad({ id })
  return { page, calls, storage }
}

test('页面可录入和复制，不能改写只读格；不完整时不给旧数据，离开时保存草稿', () => {
  const { page, calls, storage } = pageHarness('pn-junction')
  page.onCellInput({ currentTarget: { dataset: { table: 0, row: 0, column: 1 } }, detail: { value: '2' } })
  near(cell(page.data.form, 0, 0, 'lnCurrent').numeric, Math.log(2))
  page.onCellInput({ currentTarget: { dataset: { table: 0, row: 0, column: 2 } }, detail: { value: '999' } })
  near(cell(page.data.form, 0, 0, 'lnCurrent').numeric, Math.log(2))
  page.onCopyData(); assert.equal(calls.clipboard, null); assert.ok(page.data.validationErrors.length)
  page.onHide(); assert.ok(storage['buct-lab:experiment-input:v1:pn-junction'])
  page.data.form = fillForm('pn-junction')
  page.onCopyData(); assert.equal(JSON.parse(calls.clipboard).experiment_id, 'pn-junction')
  assert.equal(page.data.validationErrors.length, 0)
  delete global.wx
})

test('删除有值行先确认，取消保留数据；清空不删除其他实验草稿', () => {
  const { page, calls, storage } = pageHarness('rlc', { 'buct-lab:experiment-input:v1:pn-junction': { sentinel: true } })
  page.onRemoveRow({ currentTarget: { dataset: { table: 0 } } })
  calls.modal.success({ confirm: false }); assert.equal(page.data.form.tables[0].rows.length, 10)
  page.onRemoveRow({ currentTarget: { dataset: { table: 0 } } }); calls.modal.success({ confirm: true })
  assert.equal(page.data.form.tables[0].rows.length, 9)
  page.onSaveDraft(); assert.ok(storage['buct-lab:experiment-input:v1:rlc'])
  page.onClear(); calls.modal.success({ confirm: true })
  assert.equal(page.data.form.tables[0].rows.length, 10)
  assert.equal(storage['buct-lab:experiment-input:v1:rlc'], undefined)
  assert.equal(storage['buct-lab:experiment-input:v1:pn-junction'].sentinel, true)
  delete global.wx
})

test('首页七个入口均可到达共用页面，路由注册且事件处理函数存在', () => {
  let definition, url
  global.Page = value => { definition = value }
  global.wx = { navigateTo: value => { url = value.url } }
  delete require.cache[require.resolve('../pages/index/index')]; require('../pages/index/index')
  for (const id of supportedIds) {
    definition.onConfirmSelection.call({ data: { selectedExperiment: { id } } })
    assert.equal(url, `/pages/experiment-input/index?id=${id}`)
  }
  delete global.Page; delete global.wx
  const root = path.join(__dirname, '..')
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages.includes('pages/experiment-input/index'))
  const { page } = pageHarness('rlc')
  const markup = fs.readFileSync(path.join(root, 'pages/experiment-input/index.wxml'), 'utf8')
  for (const match of markup.matchAll(/bind(?:input|tap|change)="(\w+)"/g)) assert.equal(typeof page[match[1]], 'function', match[1])
  delete global.wx
})
