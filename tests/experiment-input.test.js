const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { definitions } = require('../utils/experiment-forms')
const { experiments } = require('../utils/experiments')
const { createForm, validateField, validateForm, collectInput, formatInput } = require('../utils/experiment-input')

const ids = ['hall-effect', 'sound-speed', 'strain-sensor', 'fresnel-biprism', 'zeeman-effect', 'michelson', 'polarization', 'single-slit',
  'young-modulus', 'kelvin-bridge', 'ballistic-galvanometer', 'thermal-conductivity', 'rlc', 'torsion-pendulum', 'pn-junction']

function pageHarness(id, source = 'pages/experiment-input/index.js') {
  const filename = path.resolve(__dirname, '..', source)
  let definition
  const calls = { modals: [], scrolls: [], clipboard: [], routes: [], titles: [] }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename),
    Page: value => { definition = value },
    wx: {
      setNavigationBarTitle: options => calls.titles.push(options.title),
      showModal: options => calls.modals.push(options),
      pageScrollTo: options => calls.scrolls.push(options),
      setClipboardData: options => calls.clipboard.push(options.data),
      navigateTo: options => calls.routes.push(options.url),
      showToast: () => {},
    },
  })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)) }
  page.setData = (updates, callback) => {
    for (const [key, value] of Object.entries(updates)) {
      const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let target = page.data
      keys.slice(0, -1).forEach(part => { target = target[part] })
      target[keys[keys.length - 1]] = value
    }
    if (callback) callback()
  }
  if (page.onLoad) page.onLoad({ id })
  return { page, calls }
}

const cellEvent = (table, row, column, value) => ({ currentTarget: { dataset: { table, row, column } }, detail: { value } })

function fillRequired(form) {
  form.parameters.forEach(field => { if (!field.optional && !field.value) field.value = field.kind === 'text' ? '按实际记录' : '1' })
  form.tables.filter(table => table.visible).forEach(table => table.rows.forEach(row => row.cells.forEach(cell => {
    if (cell.kind === 'number' && !cell.optional && !cell.value) cell.value = cell.positive ? '1' : '0'
    if (cell.kind === 'text' && !cell.optional && !cell.value) cell.value = '实测记录'
  })))
}

test('所有实验都有原始录入版式和报告配置；每个输入在版式中恰好对应一格', () => {
  ids.forEach(id => {
    const form = createForm(id)
    assert.ok(form.source && form.reportRequirements.length)
    form.tables.forEach(table => {
      assert.ok(table.width > 0 && table.height > 0)
      const refs = table.displayCells.filter(c => c.field).map(c => [c.row, c.column])
      table.displayCells.forEach(c => (c.parts || []).filter(p => p.input).forEach(p => refs.push([p.row, p.column])))
      const idsInView = refs.map(([r, c]) => table.rows[r].cells[c].id)
      assert.equal(new Set(idsInView).size, idsInView.length, id + ':' + table.id)
      table.rows.forEach((row, r) => row.cells.forEach((cell, c) => {
        if (cell.kind === 'number' || cell.kind === 'text') assert.ok(idsInView.includes(cell.id), id + ':' + cell.id)
      }))
    })
    assert.ok(validateForm(form).length)
    fillRequired(form)
    assert.deepEqual(validateForm(form), [])
  })
  assert.equal(createForm('unknown'), null)
})

test('数值检查区分零与空，保留符号、小数位和科学计数法', () => {
  const field = value => ({ value, kind: 'number' })
  for (const value of ['0', '-1.20', '+1.2', '.5', '2.25e-3', '1E+4']) assert.equal(validateField(field(value)), '')
  for (const value of ['', ' ', '-', '1..2', 'NaN', 'Infinity', '0x10', '1e999', '1abc']) assert.ok(validateField(field(value)))
  assert.equal(validateField({ ...field(''), optional: true }), '')
  assert.ok(validateField({ ...field('1.5'), integer: true }))
  assert.ok(validateField({ ...field('-1'), min: 0 }))
  assert.ok(validateField({ ...field('0'), positive: true }))
})

test('霍尔原件单位T/A和2.25e-2保留，500mA对应0.01125T；两个装置K_H独立', () => {
  const form = createForm('hall-effect')
  const p = Object.fromEntries(form.parameters.map(f => [f.key, f]))
  assert.equal(p.magnetCoefficient.value, '2.25e-2')
  assert.match(p.magnetCoefficient.label, /T\/A/)
  assert.ok(Math.abs(Number(p.magnetCoefficient.value) * 500 / 1000 - 0.01125) < 1e-12)
  assert.ok(p.hallSensitivity && p.solenoidHallSensitivity)
  assert.deepEqual(form.tables[0].rows.map(r => r.cells[0].value), ['1.50', '2.00', '2.50', '3.00', '3.50'])
  assert.deepEqual(form.tables[2].rows.map(r => r.cells[0].value), ['115', '125', '135', '145', '155', '165', '175', '180', '185', '190', '195', '200', '205', '210', '215', '220', '225', '230'])
  const { page } = pageHarness('hall-effect')
  page.onCellInput(cellEvent(0, 0, 1, '-1.200'))
  assert.equal(collectInput(page.data).tables[0].rows[0].u1, '-1.200')
})

test('应变17个位移三位小数，3循环均有正反与滞后；不让用户编辑计算格', () => {
  const { page, calls } = pageHarness('strain-sensor')
  const table = page.data.tables[0]
  assert.deepEqual(table.rows.map(r => r.cells[0].value), Array.from({ length: 17 }, (_, i) => (i * 0.5).toFixed(3)))
  assert.deepEqual(table.columns.filter(c => c.key.startsWith('hysteresis')).map(c => c.key), ['hysteresis1', 'hysteresis2', 'hysteresis3'])
  assert.equal(table.columns.at(-1).label, '校准平均值')
  page.onCellInput(cellEvent(0, 0, 3, '999'))
  assert.equal(table.rows[0].cells[3].value, '')
  page.onCheck(); page.onCheck()
  assert.equal(calls.scrolls.length, 2)
  assert.equal(calls.scrolls.at(-1).selector, '#cell-0-0-1')
  fillRequired(page.data); page.onCheck()
  assert.equal(page.data.errorCount, 0)
  assert.equal(page.data.tables[0].rows[0].cells[1].error, '')
  assert.match(page.data.message, /数值格式检查通过/)
})

test('塞曼报告四行方向交替、各检偏角完整；现象实填并保留分析栏', () => {
  const { page } = pageHarness('zeeman-effect')
  page.onCellInput(cellEvent(0, 0, 1, '12.300'))
  page.onModeChange({ detail: { value: 'sigma' } })
  assert.deepEqual(Array.from(page.data.tables.filter(t => t.visible), t => t.id), ['sigma-field', 'sigma-zero', 'polarization'])
  assert.deepEqual(Array.from(page.data.tables[2].rows, r => r.cells[0].value), ['→', '←', '→', '←'])
  assert.equal(page.data.parameters.find(f => f.key === 'componentA').visible, false)
  const operations = page.data.tables[4].rows.map(r => r.cells[1].value).join('\n')
  for (const angle of ['0°（360°）', '90°', '180°', '270°', '45°（225°）', '135°（315°）']) assert.ok(operations.includes(angle))
  fillRequired(page.data)
  assert.deepEqual(validateForm(page.data), [])
  const payload = collectInput(page.data)
  assert.ok(!('componentA' in payload.parameters))
  assert.equal(payload.tables.at(-1).rows[0].phenomenon, '实测记录')
  assert.ok(page.data.tables[4].columns.some(c => c.key === 'analysis'))
  assert.ok(!formatInput(page.data).includes('12.300'))
  assert.match(formatInput(page.data), /分析及结论/)
  page.onModeChange({ detail: { value: 'combined' } })
  assert.equal(page.data.tables[0].rows[0].cells[1].value, '12.300')
  assert.equal(page.data.parameters.find(f => f.key === 'componentA').visible, true)
})

test('光的偏振按4列原表呈现，7个方向图、填空和预印文字保留；45°不强制填不存在的答案', () => {
  const { page, calls } = pageHarness('polarization')
  const table = page.data.tables[0]
  assert.equal(page.data.tables.length, 1)
  assert.equal(table.visibleColumnCount, 4)
  assert.deepEqual(table.rows.map(r => r.cells[0].value), ['0', '15', '30', '45', '60', '75', '90'])
  assert.deepEqual(table.displayCells.filter(c => c.diagram).map(c => c.diagram), ['line', 'narrow', 'wide', 'circle', 'wide', 'narrow', 'line'])
  assert.equal(table.rows[3].cells[2].kind, 'fixed')
  assert.match(table.displayCells.find(c => c.parts).parts[0].text, /且有两次消光/)
  assert.match(page.data.introSections[1].title, /布鲁斯特窗/)
  assert.equal(page.data.reportRequirements.length, 3)
  assert.ok(page.data.reportSubmission.some(s => s.includes('不允许退回')))
  page.onCellInput(cellEvent(0, 0, 1, '1.200'))
  page.onCellInput(cellEvent(0, 0, 2, '平行'))
  fillRequired(page.data); page.onCheck(); page.onCopy()
  assert.equal(page.data.errorCount, 0)
  assert.match(calls.clipboard[0], /1\.200/)
  assert.match(calls.clipboard[0], /平行/)
  assert.doesNotMatch(calls.clipboard[0], /尚未进行数据处理/)
  assert.ok(!('brightAxes' in collectInput(page.data).tables[0].rows[3]))
})

test('迈克尔孙6组原始位置和后3格逐差，调零与n=0输入独立，白光中央位置及现象必填', () => {
  const { page, calls } = pageHarness('michelson')
  assert.equal(page.data.tables[0].rows.length, 6)
  assert.equal(page.data.tables[0].rows[0].cells[1].value, '0')
  assert.deepEqual(page.data.tables[0].rows.slice(0, 3).map(r => r.cells[3].value), ['—', '—', '—'])
  const p = Object.fromEntries(page.data.parameters.map(f => [f.key, f]))
  assert.equal(p.relativeCountUncertainty.value, '0.5')
  assert.equal(p.instrumentLimit.value, '0.00004')
  assert.ok(!p.whiteCenterPosition.optional)
  page.onCellInput(cellEvent(0, 0, 2, '0.12000'))
  page.onCellInput(cellEvent(0, 0, 0, '999'))
  page.onCopy()
  assert.match(calls.clipboard[0], /0\.12000/)
  const payload = collectInput(page.data)
  assert.equal(payload.schemaVersion, 3)
  assert.equal(payload.tables[0].rows[0].position, '0.12000')
  assert.equal(payload.tables[0].rows[0].number, '1')
  assert.ok(!('difference' in payload.tables[0].rows[0]))
  assert.ok(validateForm(page.data).some(e => e.label.includes('中央条纹')))
  assert.ok(page.data.tables[1].rows.every(r => !r.cells[1].optional))
})

test('原件省略号支持按实际记录：全空行不计入数据，零值有效，半填行不能漏过', () => {
  for (const id of ['thermal-conductivity', 'pn-junction']) {
    const form = createForm(id)
    fillRequired(form)
    const t = form.tables.findIndex(item => item.skipEmptyRows)
    form.tables[t].rows.forEach(r => r.cells.forEach(c => { if (c.kind === 'number' || c.kind === 'text') c.value = '' }))
    assert.ok(validateForm(form).some(e => e.tableIndex === t))
    const cells = form.tables[t].rows[0].cells.filter(c => c.kind === 'number')
    cells[0].value = '0'
    assert.ok(validateForm(form).some(e => e.tableIndex === t))
    cells.slice(1).forEach(c => { c.value = '0' })
    assert.deepEqual(validateForm(form), [])
    assert.equal(collectInput(form).tables[t].rows.length, 1)
  }
})

test('增删、取消与恢复模板后版式和数据保持同步，横向表新增测量列可编辑', () => {
  const { page, calls } = pageHarness('rlc')
  page.onAddRow({ currentTarget: { dataset: { table: 0 } } })
  assert.equal(page.data.tables[0].rows.length, 11)
  const ref = page.data.tables[0].displayCells.find(c => c.field && c.row === 10 && c.column === 1)
  assert.ok(ref)
  page.onCellInput(cellEvent(0, 10, 1, '0.7950'))
  page.onRemoveRow({ currentTarget: { dataset: { table: 0 } } })
  calls.modals.at(-1).success({ confirm: false })
  assert.equal(page.data.tables[0].rows.length, 11)
  calls.modals.at(-1).success({ confirm: true })
  assert.equal(page.data.tables[0].rows.length, 10)
  assert.ok(!page.data.tables[0].displayCells.some(c => c.field && c.row === 10))
  page.onReset(); calls.modals.at(-1).success({ confirm: false })
  page.onReset(); calls.modals.at(-1).success({ confirm: true })
  assert.equal(page.data.tables[0].rows[0].cells[1].value, '0.20')
  assert.equal(page.data.parameters.find(f => f.key === 'sourceVpp').value, '6.00')
})

test('单缝按报告只列表1和表3；位置填在表3，距离自动算，扫描不再是必填表', () => {
  const { page } = pageHarness('single-slit')
  const orderIndex = page.data.parameters.findIndex(p => p.key === 'order')
  const order = page.data.parameters[orderIndex]
  assert.equal(order.value, '3')
  assert.equal(order.readOnly, true)
  page.onParameterInput({ currentTarget: { dataset: { index: orderIndex } }, detail: { value: '1' } })
  assert.equal(collectInput(page.data).parameters.order, '3')
  assert.match(validateField({ ...order, value: '2' }), /固定为 3/)
  assert.equal(page.data.tables.length, 2)
  assert.ok(page.data.tables[0].displayCells.some(c => c.content === '平均值'))
  assert.equal(page.data.tables[1].sourceNumber, '3')
  assert.equal(page.data.tables[1].rows.length, 1)
  page.onCellInput(cellEvent(1, 0, 0, '-6.00000'))
  page.onCellInput(cellEvent(1, 0, 1, '0.000'))
  page.onCellInput(cellEvent(1, 0, 2, '6.00000'))
  page.onAddRow({ currentTarget: { dataset: { table: 1 } } })
  assert.equal(page.data.tables[1].rows.length, 1)
  const rows = collectInput(page.data).tables[1].rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].left, '-6.00000')
  assert.equal(rows[0].center, '0.000')
  assert.equal(page.data.tables[1].rows[0].cells[5].value, '6.000')
  assert.ok(!('meanDistance' in rows[0]))
})

test('杨氏、开尔文、PN保留单位、小数位，并包含报告要求的自动处理列', () => {
  const young = createForm('young-modulus')
  assert.equal(young.parameters.find(f => f.key === 'wireLength').value, '89.00')
  assert.match(young.parameters.find(f => f.key === 'wireLength').label, /cm/)
  assert.deepEqual(young.tables[0].rows.map(r => r.cells[1].value), ['0', '100', '200', '300', '400', '500', '600', '700', '800', '900'])
  assert.ok(young.tables[1].displayCells.some(c => c.content === '平均值'))
  const kelvin = createForm('kelvin-bridge')
  assert.deepEqual(kelvin.tables[2].rows.map(r => r.cells[1].value), ['20.00', '25.00', '30.00', '35.00', '40.00'])
  assert.ok(!kelvin.tables[1].columns.some(c => c.key === 'resistance'))
  const pn = createForm('pn-junction')
  assert.equal(pn.tables[0].rows[0].cells[1].value, '0.350')
  assert.equal(pn.tables[0].rows.at(-1).cells[1].value, '0.540')
  assert.ok(pn.tables[0].columns.some(c => c.key === 'logCurrent' && c.kind === 'computed'))
  assert.ok(young.tables[0].columns.some(c => c.key === 'mean' && c.kind === 'computed'))
  assert.ok(young.tables.some(t => t.id === 'force-extension'))
  assert.ok(kelvin.tables[1].columns.some(c => c.key === 'mean' && c.kind === 'computed'))
})

test('积分电流计正反向电容独立，保留Q符号和实测时间，预印小数位完整', () => {
  const { page } = pageHarness('ballistic-galvanometer')
  assert.ok(page.data.parameters.some(f => f.key === 'dischargeCapacitanceForward'))
  assert.ok(page.data.parameters.some(f => f.key === 'dischargeCapacitanceReverse'))
  page.onCellInput(cellEvent(0, 0, 2, '+1.200'))
  page.onCellInput(cellEvent(0, 0, 3, '-1.210'))
  page.onCellInput(cellEvent(0, 0, 4, '999'))
  page.onCellInput(cellEvent(2, 0, 2, '4.9700'))
  page.onCellInput(cellEvent(2, 0, 3, '-0.0500'))
  const input = collectInput(page.data)
  assert.equal(input.tables[0].rows[0].voltage, '11.00')
  assert.equal(input.tables[0].rows[0].standardReverse, '-1.210')
  assert.equal(input.tables[2].rows[0].setTime, '5.00')
  assert.equal(input.tables[2].rows[0].actualTime, '4.9700')
  assert.equal(input.tables[2].rows[0].charge, '-0.0500')
  assert.ok(!('standardMean' in input.tables[0].rows[0]))
})

test('扭摆各位置5次计时及平均位置保留，累计时间不提前换算', () => {
  const { page } = pageHarness('torsion-pendulum')
  for (const [i, pos] of ['金属细杆', '5.00', '10.00', '15.00', '20.00', '25.00'].entries()) {
    assert.ok(page.data.tables[2].rows.slice(i * 5, i * 5 + 5).every(r => r.cells[0].value === pos))
  }
  assert.ok(page.data.tables[2].displayCells.some(c => c.content === '平均周期\n5T_x/s'))
  page.onCellInput(cellEvent(1, 0, 1, '20.3400'))
  assert.equal(collectInput(page.data).tables[1].rows[0].tenT0, '20.3400')
})

test('菲涅尔d由两支杆位置加2.50cm得到，空白时不伪造结果', () => {
  const { page } = pageHarness('fresnel-biprism')
  assert.match(page.data.derivedParameters[0].value, /待填写/)
  const input = (key, value) => page.onParameterInput({ currentTarget: { dataset: { index: page.data.parameters.findIndex(f => f.key === key) } }, detail: { value } })
  input('slitPosition', '20.00'); input('eyepiecePosition', '80.00')
  assert.equal(page.data.derivedParameters[0].value, '62.5')
  input('slitPosition', '0x10')
  assert.match(page.data.derivedParameters[0].value, /待填写/)
  input('slitPosition', '')
  assert.match(page.data.derivedParameters[0].value, /待填写/)
})

test('报告要求逐实验保存，保留PN拍照图、塞曼手写、光谱迟交及迈克尔孙缺件边界', () => {
  const { requirements } = require('../utils/experiment-requirements')
  assert.equal(Object.keys(requirements).length, 16)
  assert.ok(requirements['pn-junction'].submission.some(s => /拍照.*切勿扫描/.test(s)))
  assert.ok(requirements['zeeman-effect'].processing.some(s => s.includes('不可提交打印稿')))
  assert.ok(requirements['strain-sensor'].processing.some(s => s.includes('电脑')))
  assert.ok(requirements['spectral-analysis'].submission.some(s => s.includes('1–2分')))
  assert.deepEqual(requirements.michelson.submission, [])
})

test('全部16个实验入口及页面事件可用，错误实验给出返回提示', () => {
  const { page, calls } = pageHarness(null, 'pages/index/index.js')
  assert.deepEqual(new Set(ids.concat('spectral-analysis')), new Set(experiments.map(e => e.id)))
  ids.forEach(id => { page.data.selectedExperiment = { id }; page.onConfirmSelection(); assert.equal(calls.routes.at(-1), '/pages/experiment-input/index?id=' + id) })
  page.data.selectedExperiment = { id: 'spectral-analysis' }; page.onConfirmSelection()
  assert.equal(calls.routes.at(-1), '/pages/spectral-analysis/index')
  const { page: inputPage } = pageHarness('michelson')
  const wxml = fs.readFileSync(path.resolve(__dirname, '../pages/experiment-input/index.wxml'), 'utf8')
  for (const match of wxml.matchAll(/bind(?:input|blur|change|tap)="([^"]+)"/g)) assert.equal(typeof inputPage[match[1]], 'function')
  assert.ok(pageHarness('missing').page.data.loadError)
})
