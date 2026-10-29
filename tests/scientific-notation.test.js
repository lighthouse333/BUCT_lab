const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { notationSegments, isScientific } = require('../utils/scientific-notation')
const { definitions } = require('../utils/experiment-forms')
const { fixture } = require('./report-fixtures')
const { collectInput } = require('../utils/experiment-input')
const { calculateReport } = require('../utils/experiment-report')

test('PN、霍尔、RLC等全体实验的标签支持大小写下标、数字和单位次方', () => {
  assert.deepEqual(notationSegments('I_F/μA').map(s => [s.kind, s.text]), [['normal', 'I'], ['sub', 'F'], ['normal', '/μA']])
  assert.deepEqual(notationSegments('R_H^2').map(s => [s.kind, s.text]), [['normal', 'R'], ['sub', 'H'], ['sup', '2']])
  assert.deepEqual(notationSegments('m^(-3)').map(s => [s.kind, s.text]), [['normal', 'm'], ['sup', '−3']])
  assert.deepEqual(notationSegments('D_{k−1}²').filter(s => s.kind !== 'normal').map(s => s.text), ['k−1', '2'])
  for (const d of Object.values(definitions)) {
    for (const label of [...d.parameters.map(p => p.label), ...d.tables.flatMap(t => t.columns.map(c => c.label))]) {
      assert.ok(!notationSegments(label).some(s => s.kind === 'normal' && /[_^]/.test(s.text)), label)
    }
  }
})

test('科学计数法保留尾零与符号，只转换显示；不误认普通标识符或未填完的数据', () => {
  const raw = '+1.3800E-023'
  assert.equal(isScientific(raw), true)
  assert.deepEqual(notationSegments(raw).map(s => [s.kind, s.text]), [['normal', '+1.3800 × 10'], ['sup', '−23']])
  assert.equal(raw, '+1.3800E-023')
  assert.deepEqual(notationSegments('2.00e+3').map(s => s.text), ['2.00 × 10', '3'])
  assert.deepEqual(notationSegments('1.38 × 10⁻²³').map(s => s.text), ['1.38 × 10', '−23'])
  assert.equal(isScientific('1.38e-'), false)
  assert.equal(isScientific('NaN'), false)
  assert.equal(notationSegments('sensor1e23id')[0].text, 'sensor1e23id')
})

function inputHarness(value) {
  const filename = path.resolve(__dirname, '../components/scientific-input/index.js')
  let definition
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { Component: d => { definition = d }, require: createRequire(filename) })
  const events = [], instance = { properties: { value }, data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch) }, triggerEvent(type, detail) { events.push({ type, detail }); if (type === 'input') { this.properties.value = detail.value; this.refresh(detail.value) } } }
  Object.assign(instance, definition.methods)
  definition.lifetimes.attached.call(instance)
  return { instance, events, definition }
}

test('科学数值点击编辑、输入、失焦及恢复模板时始终回传原始字符串', () => {
  const { instance: c, events, definition } = inputHarness('1.38e-23')
  assert.equal(c.data.scientific, true); assert.equal(c.data.editing, false)
  c.onBeginEdit(); assert.equal(c.data.editing, true)
  c.onInput({ detail: { value: '+1.3800E-23' } })
  assert.equal(events[0].detail.value, '+1.3800E-23')
  c.onBlur({ detail: { value: '+1.3800E-23' } })
  assert.equal(c.data.editing, false); assert.equal(c.data.scientific, true)
  assert.equal(c.properties.value, '+1.3800E-23')
  definition.methods.refresh.call(c, '')
  assert.equal(c.data.scientific, false)
  c.onFocus({ detail: { value: '' } })
  c.onInput({ detail: { value: '1.0e-' } })
  assert.equal(c.data.editing, true); assert.equal(c.data.scientific, false)
  assert.equal(events.at(-1).detail.value, '1.0e-')
})

test('普通十进制数值不被改写或在输入过程中切换显示格式', () => {
  const { instance: c, events } = inputHarness('0.00000')
  assert.equal(c.data.scientific, false)
  c.onFocus({ detail: { value: '0.00000' } })
  c.onInput({ detail: { value: '-0.0012000' } })
  c.onBlur({ detail: { value: '-0.0012000' } })
  assert.equal(c.data.scientific, false)
  assert.equal(events.find(e => e.type === 'input').detail.value, '-0.0012000')
})

test('PN页参考值美化后，原始导出和计算结果保持相同精度，单缝仍固定3级', () => {
  const f = fixture('pn-junction'), p = f.form.parameters.find(p => p.key === 'boltzmannReference')
  p.value = '1.3800e-23'
  const before = collectInput(f.form), expected = calculateReport(before)
  f.form.parameters.forEach(p => notationSegments(p.value))
  const after = collectInput(f.form), actual = calculateReport(after)
  assert.deepEqual(after, before)
  assert.equal(after.parameters.boltzmannReference, '1.3800e-23')
  assert.deepEqual(actual.results, expected.results)
  assert.equal(fixture('single-slit').input.parameters.order, '3')
})
