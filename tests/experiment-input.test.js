const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { definitions } = require('../utils/experiment-forms')
const { createForm, validateField, validateForm, collectInput, formatInput } = require('../utils/experiment-input')

const ids = ['hall-effect', 'sound-speed', 'strain-sensor', 'fresnel-biprism', 'zeeman-effect', 'michelson']

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
    if (cell.kind === 'number' && !cell.optional && !cell.value) cell.value = '0'
  })))
}

test('六份模板与 Excel 行列数、测量点及预填参数一致', () => {
  const expectedRows = [[5, 5, 18], [10, 5], [17, 17], [4, 4, 4], [4, 4, 4, 4, 12], [6, 3, 3]]
  const expectedColumns = [[7, 7, 8], [4, 6], [11, 11], [4, 4, 4], [13, 9, 5, 5, 4], [3, 5, 3]]
  ids.forEach((id, i) => {
    const form = createForm(id)
    assert.deepEqual(form.tables.map(table => table.rows.length), expectedRows[i])
    assert.deepEqual(form.tables.map(table => table.columns.length), expectedColumns[i])
    assert.ok(form.tables.every(table => table.rows.every(row => row.cells.length === table.columns.length)))
  })
  const hall = createForm('hall-effect')
  assert.deepEqual(hall.tables[0].rows.map(row => row.cells[1].value), ['1.5', '2', '2.5', '3', '3.5'])
  assert.deepEqual(hall.tables[2].rows.map(row => row.cells[1].value), ['115', '125', '135', '145', '155', '165', '175', '180', '185', '190', '195', '200', '205', '210', '215', '220', '225', '230'])
  assert.deepEqual(createForm('strain-sensor').tables[0].rows.map(row => row.cells[1].value), Array.from({ length: 17 }, (_, i) => String(i * 0.5)))
  const michelson = createForm('michelson')
  assert.equal(michelson.tables[0].rows[0].cells[1].value, '0')
  assert.deepEqual(michelson.tables[1].rows.map(row => row.cells.slice(0, 3).map(cell => cell.value)), [['1', '1', '4'], ['2', '2', '5'], ['3', '3', '6']])
  assert.equal(michelson.parameters.find(field => field.key === 'instrumentLimit').value, '0.00004')
  assert.equal(createForm('fresnel-biprism').parameters.find(field => field.key === 'reference').value, '589.3')
})

test('数值校验区分空值与零，保留负数、小数和科学计数法；拒绝非数值', () => {
  const field = value => ({ value, kind: 'number' })
  for (const value of ['0', '-1.20', '+1.2', '.5', '2.25e-3', '1E+4']) assert.equal(validateField(field(value)), '')
  for (const value of ['', ' ', '-', '1..2', 'NaN', 'Infinity', '0x10', '1e999', '1abc']) assert.ok(validateField(field(value)))
  assert.equal(validateField({ ...field(''), optional: true }), '')
  assert.ok(validateField({ ...field('1.5'), integer: true }))
  assert.ok(validateField({ ...field('-1'), min: 0 }))
  assert.ok(validateField({ ...field('0'), positive: true }))
})

test('检查只要求原始测量值，跳过处理列及选填现象；表单之间互不污染', () => {
  ids.forEach(id => {
    const form = createForm(id)
    assert.ok(validateForm(form).length)
    fillRequired(form)
    assert.deepEqual(validateForm(form), [])
  })
  const first = createForm('michelson')
  first.tables[0].rows[0].cells[2].value = '12.3400'
  assert.equal(createForm('michelson').tables[0].rows[0].cells[2].value, '')
  assert.equal(createForm('unknown'), null)
})

test('输入事件保留字符串与末尾零，并阻止编辑序号、处理列及无效索引', () => {
  const { page } = pageHarness('hall-effect')
  page.onCellInput(cellEvent(0, 0, 2, '-1.200'))
  assert.equal(page.data.tables[0].rows[0].cells[2].value, '-1.200')
  page.onCellInput(cellEvent(0, 0, 0, '999'))
  page.onCellInput(cellEvent(0, 0, 6, '999'))
  page.onCellInput(cellEvent(-1, 0, 0, '999'))
  assert.equal(page.data.tables[0].rows[0].cells[0].value, '1')
  assert.equal(page.data.tables[0].rows[0].cells[6].value, '')
  page.onCellInput(cellEvent(0, 0, 2, 'abc'))
  page.onCellBlur(cellEvent(0, 0, 2))
  assert.ok(page.data.tables[0].rows[0].cells[2].error)
  page.onCellInput(cellEvent(0, 0, 2, '0'))
  assert.equal(page.data.tables[0].rows[0].cells[2].error, '')
})

test('塞曼切换方案保留读数，σ方案显示两张表；检查和复制忽略隐藏表', () => {
  const { page } = pageHarness('zeeman-effect')
  page.onCellInput(cellEvent(0, 0, 1, '12.300'))
  page.onModeChange({ detail: { value: 'sigma' } })
  assert.deepEqual(Array.from(page.data.tables.filter(table => table.visible), table => table.id), ['sigma-field', 'sigma-zero', 'polarization'])
  fillRequired(page.data)
  assert.deepEqual(validateForm(page.data), [])
  const payload = collectInput(page.data)
  assert.deepEqual(payload.tables.map(table => table.id), ['sigma-field', 'sigma-zero', 'polarization'])
  assert.ok(!formatInput(page.data).includes('12.300'))
  page.onModeChange({ detail: { value: 'combined' } })
  assert.equal(page.data.tables[0].rows[0].cells[1].value, '12.300')
  assert.ok(validateForm(page.data).length)
})

test('核对可重复定位首个错误，修正后清除错误反馈；不把格式通过视作计算完成', () => {
  const { page, calls } = pageHarness('strain-sensor')
  page.onCheck()
  assert.equal(calls.scrolls[0].selector, '#cell-0-0-2')
  assert.equal(page.data.tables[0].scrollTarget, 'cell-0-0-2')
  assert.ok(page.data.tables[0].rows[0].cells[2].error)
  page.onCheck()
  assert.equal(calls.scrolls.length, 2)
  fillRequired(page.data)
  page.onCheck()
  assert.equal(page.data.errorCount, 0)
  assert.equal(page.data.tables[0].rows[0].cells[2].error, '')
  assert.match(page.data.message, /数值格式检查通过/)
})

test('增删测量行、删除确认及恢复模板确认均保留取消操作', () => {
  const { page, calls } = pageHarness('fresnel-biprism')
  page.onAddRow({ currentTarget: { dataset: { table: 0 } } })
  assert.equal(page.data.tables[0].rows.length, 5)
  page.onCellInput(cellEvent(0, 4, 1, '0.1200'))
  page.onRemoveRow({ currentTarget: { dataset: { table: 0 } } })
  calls.modals.at(-1).success({ confirm: false })
  assert.equal(page.data.tables[0].rows.length, 5)
  calls.modals.at(-1).success({ confirm: true })
  assert.equal(page.data.tables[0].rows.length, 4)
  page.onCellInput(cellEvent(0, 0, 1, '0.1200'))
  page.onReset()
  calls.modals.at(-1).success({ confirm: false })
  assert.equal(page.data.tables[0].rows[0].cells[1].value, '0.1200')
  calls.modals.at(-1).success({ confirm: true })
  assert.equal(page.data.tables[0].rows[0].cells[1].value, '')
  assert.equal(page.data.parameters[2].value, '2.50')
})

test('复制与计算输入接口保留字符串精度，处理列不作为用户输入导出', () => {
  const { page, calls } = pageHarness('michelson')
  page.onCellInput(cellEvent(0, 0, 2, '0.12000'))
  page.onCopy()
  assert.match(calls.clipboard[0], /0\.12000/)
  assert.match(calls.clipboard[0], /尚未进行数据处理/)
  const payload = collectInput(page.data)
  assert.equal(payload.tables[0].rows[0].position, '0.12000')
  assert.ok(!('distance' in payload.tables[1].rows[0]))
  assert.equal(payload.experimentId, 'michelson')
})

test('首页分别跳转六个模板，保留光谱路由和未接入实验提示；页面注册齐全', () => {
  const { page, calls } = pageHarness(null, 'pages/index/index.js')
  ids.forEach(id => {
    page.data.selectedExperiment = { id }
    page.onConfirmSelection()
    assert.equal(calls.routes.at(-1), '/pages/experiment-input/index?id=' + id)
  })
  page.data.selectedExperiment = { id: 'spectral-analysis' }
  page.onConfirmSelection()
  assert.equal(calls.routes.at(-1), '/pages/spectral-analysis/index')
  page.data.selectedExperiment = { id: 'rlc', name: 'RLC' }
  page.onConfirmSelection()
  assert.ok(calls.modals.length)
  const app = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../app.json'), 'utf8'))
  assert.ok(app.pages.includes('pages/experiment-input/index'))
  for (const extension of ['js', 'json', 'wxml', 'wxss']) assert.ok(fs.existsSync(path.resolve(__dirname, '../pages/experiment-input/index.' + extension)))
  const { page: invalid } = pageHarness('missing')
  assert.ok(invalid.data.loadError)
  const wxml = fs.readFileSync(path.resolve(__dirname, '../pages/experiment-input/index.wxml'), 'utf8')
  const { page: inputPage } = pageHarness('michelson')
  for (const match of wxml.matchAll(/bind(?:input|blur|change|tap)="([^"]+)"/g)) assert.equal(typeof inputPage[match[1]], 'function')
  assert.equal(Object.keys(definitions).length, 6)
})
