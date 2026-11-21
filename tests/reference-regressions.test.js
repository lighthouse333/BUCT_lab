const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, spectralFixture } = require('./report-fixtures')
const { calculateReport } = require('../utils/experiment-report')
const { createForm, collectInput, makeRow, parameterVisibility, validateForm } = require('../utils/experiment-input')
const { definitions } = require('../utils/experiment-forms')
const { refreshFormTables } = require('../utils/report-tables')
const { textbookOptions } = require('../utils/textbook-profile')
const { saveFormDraft, restoreFormDraft, saveSpectralDraft, restoreSpectralDraft } = require('../utils/experiment-drafts')
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * tolerance, `${actual} != ${expected}`)
const result = (report, id) => { const r = report.results.find(r => r.id === id); assert.ok(r, JSON.stringify(report.issues)); return r }
const table = (input, id) => input.tables.find(t => t.id === id)
const memory = () => { const map = new Map(); return { getStorageSync: k => map.get(k), setStorageSync: (k, v) => map.set(k, JSON.parse(JSON.stringify(v))) } }

test('A12霍尔115mm实测四电压先消差：1.065mV、2.10059mT，不能按绝对值给7.71mT', () => {
  const f = fixture('hall-effect')
  f.input.parameters.solenoidHallSensitivity = '169'; f.input.parameters.axialIS = '3'
  Object.assign(table(f.input, 'axial-field').rows[0], { x: '115', u1: '4.86', u2: '-5.08', u3: '-2.95', u4: '2.73' })
  const report = calculateReport(f.input)
  assert.equal(report.status, 'complete')
  const row = report.tables.find(t => t.id === 'axial-field-processed').rows[0]
  close(row.hallVoltage, 1.065); close(row.magneticField * 1000, 2.100591715976331)
  // 将后两次换向交换时，须同时声明另一种实际记录顺序。
  f.input.parameters.hallSequence = 'paired'
  Object.assign(table(f.input, 'axial-field').rows[0], { u3: '2.73', u4: '-2.95' })
  close(calculateReport(f.input).tables.find(t => t.id === 'axial-field-processed').rows[0].magneticField, row.magneticField)
})

test('霍尔共同零偏使四读数全为正时仍能正确消差', () => {
  const f = fixture('hall-effect'), before = calculateReport(f.input)
  for (const t of f.input.tables) for (const row of t.rows) for (const key of ['u1', 'u2', 'u3', 'u4']) row[key] = String(Number(row[key]) + 5)
  const after = calculateReport(f.input)
  close(result(after, 'hallCoefficientFit').value, result(before, 'hallCoefficientFit').value)
})

test('A07的带符号椭圆读数B=-5.76、A=6.12给-1.226095rad；超域不得给伪结果', () => {
  const f = fixture('rlc'); f.input.parameters.phaseReading = 'signed'
  Object.assign(table(f.input, 'phase-200').rows[0], { a: '6.12', b: '-5.76' })
  const report = calculateReport(f.input)
  close(report.tables.find(t => t.id === 'rlc-phase').rows[0].phase, Math.asin(-5.76 / 6.12))
  const projected = require('../utils/report-tables').reportTables(f.input, textbookOptions(f.input))
  close(projected.find(t => t.id === 'phase-200').rows[0].phase, Math.asin(-5.76 / 6.12))
  table(f.input, 'phase-200').rows[0].b = '7'
  assert.ok(calculateReport(f.input).issues.some(i => i.code === 'ELLIPSE_RATIO'))
})

test('A11双棱镜保留5次l1测量，均值4.909mm，按其余正文输入得590.08445nm', () => {
  const f = fixture('fresnel-biprism')
  Object.assign(f.input.parameters, { slitPosition: '0', eyepiecePosition: '142', distanceCorrection: '2.5' })
  for (const [id, differences] of [['image-l1', [4.917, 4.861, 4.889, 4.878, 5]], ['image-l2', Array(5).fill(2.1122)], ['fringe-spacing', Array(5).fill(1.324)]]) {
    table(f.input, id).rows = differences.map((difference, i) => ({ number: String(i + 1), start: '0', end: String(difference) }))
  }
  const report = calculateReport(f.input)
  assert.equal(report.status, 'complete', JSON.stringify(report.issues))
  const l1 = result(report, 'image-l1-mean')
  close(l1.value, .004909); assert.equal(l1.statistics.n, 5); assert.equal(l1.statistics.uncertainty.tp, 1.14)
  close(result(report, 'wavelength').value, 590.0844526780025, 1e-6)
})

test('A03四组逐差重建的7位置序列全部保留，得689.29167nm，不自动舍弃第二差值', () => {
  const f = fixture('michelson'); f.input.parameters.step = '40'
  const positions = [0, .013, .026, .03938, .05638, .06796, .08009]
  table(f.input, 'positions').rows = positions.map((position, i) => ({ number: String(i + 1), order: String(i * 40), position: String(position) }))
  const report = calculateReport(f.input)
  assert.equal(report.status, 'complete', JSON.stringify(report.issues))
  close(result(report, 'wavelength').value, 689.2916666666667)
  assert.equal(report.tables.find(t => t.id === 'michelson-differences').rows.length, 4)
})

test('B05原始四游标三组给591.07770nm及扩展不确定度5.00160nm', () => {
  const f = spectralFixture()
  Object.assign(f.input.parameters, { density: '300', angularInstrumentUncertainty: String(Math.PI / 180 / 60 / (2 * Math.sqrt(3))) })
  table(f.input, 'spectral-readings').rows = [
    ['342:42', '162:40', '322:24', '142:22'], ['348:53', '168:50', '328:23', '148:21'], ['350:47', '170:46', '330:18', '150:16'],
  ].map(values => Object.fromEntries(['minusLeft', 'minusRight', 'plusLeft', 'plusRight'].map((key, i) => [key, values[i]])))
  const report = calculateReport(f.input)
  close(result(report, 'wavelength').value, 591.077702874037)
  close(result(report, 'wavelength').uncertainty.reported, 5.00160417499786)
})

test('A06 PN实测电流对数以微安为基准，拟合后换A；温度表给1.27361eV', () => {
  const f = fixture('pn-junction')
  const currents = [.026,.040,.061,.090,.131,.192,.291,.419,.626,.902,1.31,1.92,2.73,4.02,5.93,8.46,12.5,18.3,26.6,38.4]
  table(f.input, 'constant-temperature').rows.forEach((r, i) => { r.current = String(currents[i]) })
  table(f.input, 'constant-current').rows = [.541,.529,.517,.506,.494,.481,.469,.457].map((voltage, i) => ({ number: String(i + 1), temperature: String(32 + i * 5), voltage: String(voltage) }))
  const report = calculateReport(f.input)
  close(result(report, 'saturationCurrentFit').value / 1e-14, 4.5426316677304894)
  close(result(report, 'bandgapFit').value, 1.27361)
  table(f.input, 'constant-temperature').rows[0].current = '0'
  assert.equal(calculateReport(f.input).status, 'invalid')
})

test('A09和B03单缝中心波长分别651.10565与662.36132nm，不照抄错误正文', () => {
  for (const [z, x, expected] of [[81.4, 7.95, 651.1056511056511], [80.52, 8, 662.3613184716013]]) {
    const f = fixture('single-slit'); f.input.parameters.slitWidth = '.2'
    table(f.input, 'distances').rows.forEach(r => { r.z = String(z) })
    Object.assign(table(f.input, 'minima').rows[0], { left: String(-x), center: '0', right: String(x) })
    close(result(calculateReport(f.input), 'wavelength').value, expected)
  }
})

test('A09完整原始距离81.40、81.40、81.42cm及原始暗纹坐标给651.05233nm', () => {
  const f = fixture('single-slit'); f.input.parameters.slitWidth = '.2'
  table(f.input, 'distances').rows.forEach((r, i) => { r.z = ['81.40', '81.40', '81.42'][i] })
  Object.assign(table(f.input, 'minima').rows[0], { left: '31.650', center: '39.800', right: '47.550' })
  const report = calculateReport(f.input)
  close(result(report, 'wavelength').value, .2 * 7.95 / (3 * (81.40 + 81.40 + 81.42) / 3 * 10) * 1e6)
  assert.equal(report.status, 'complete')
})

test('应变输入单位mV转换为V只改变电压量纲，不改变非线性百分数', () => {
  const f = fixture('strain-sensor'), volts = calculateReport(f.input)
  f.input.parameters.outputVoltageUnit = 'mV'
  for (const t of f.input.tables.filter(t => ['single-arm', 'full-bridge'].includes(t.id))) for (const r of t.rows) for (const key of Object.keys(r).filter(k => /^(forward|reverse)/.test(k))) r[key] = String(Number(r[key]) * 1000)
  const millivolts = calculateReport(f.input)
  close(result(millivolts, 'full-bridge-sensitivity').value, result(volts, 'full-bridge-sensitivity').value)
  close(result(millivolts, 'single-arm-nonlinearity').value, result(volts, 'single-arm-nonlinearity').value)
})

test('B02传感器17点真实六次读数给滞后2.90625%，不沿用正文错误的6mV', () => {
  const f = fixture('strain-sensor'), data = require('./data/sensor-report.json')
  f.input.parameters.outputVoltageUnit = 'mV'
  for (const id of ['single-arm', 'full-bridge']) table(f.input, id).rows = data.tables[id].map((row, i) => ({ number: String(i + 1), ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)])) }))
  const report = calculateReport(f.input)
  assert.equal(report.status, 'complete', JSON.stringify(report.issues))
  close(result(report, 'full-bridge-sensitivity').value, .13317483660130716)
  close(result(report, 'full-bridge-hysteresis').value, 2.90625)
  close(result(report, 'full-bridge-nonlinearity').value, .6090686274509732)
})

test('直接测量杨氏模量不要求光杠杆D和b，按报告中心量得1.87755e11Pa', () => {
  const f = fixture('young-modulus'), form = f.form
  const set = (key, value) => { form.parameters.find(p => p.key === key).value = value }
  set('extensionMethod', 'direct'); set('wireLength', '89'); set('gravity', '9.801'); set('micrometerZero', '0')
  set('leverDistanceM', ''); set('leverArmM', ''); set('leverDistanceLimitM', ''); set('leverArmLimitM', '')
  form.parameters = parameterVisibility(form.parameters, form.mode)
  form.tables.find(t => t.id === 'diameters').rows.forEach(r => { r.cells.find(c => c.key === 'diameter').value = '.2974' })
  form.tables.find(t => t.id === 'loading').rows.forEach((r, i) => r.cells.filter(c => ['loading', 'unloading'].includes(c.key)).forEach(c => { c.value = String(i * .3344 / 5) }))
  assert.equal(validateForm(form).length, 0)
  close(result(calculateReport(collectInput(form)), 'youngModulus').value, 1.8775535e11, 1e-7)
})

test('没有观察到白光时不要求虚构中央镜位置，单色光波长仍可算', () => {
  const f = fixture('michelson')
  f.input.parameters.whiteObserved = 'not-observed'
  delete f.input.parameters.whiteCenterPosition
  const report = calculateReport(f.input)
  close(result(report, 'wavelength').value, 650)
  assert.ok(report.issues.some(i => i.code === 'WHITE_LIGHT_NOT_OBSERVED'))
  assert.ok(!report.results.some(r => r.id === 'whiteCentralPosition'))
  f.input.parameters.whiteObserved = 'fabricated'
  assert.equal(calculateReport(f.input).status, 'invalid')
})

test('全部15个通用实验保存后重新创建页面仍保留原始字符串，计算列不会当实测恢复', () => {
  const storage = memory()
  for (const id of Object.keys(definitions)) {
    const form = fixture(id).form
    form.info[0].value = '测试班级'
    assert.match(saveFormDraft(form, storage), /已自动保存/)
    const restored = restoreFormDraft(id, storage)
    assert.equal(JSON.stringify(collectInput(restored)), JSON.stringify(collectInput(form)), id)
    assert.ok(restored.tables.every(t => t.rows.every(r => r.cells.filter(c => c.kind === 'computed').every(c => c.value === '' || c.value === '—'))))
  }
})

test('草稿恢复5次双棱镜并重新生成差值；隐藏的塞曼方案读数也保留', () => {
  const storage = memory(), form = fixture('fresnel-biprism').form
  form.tables[0].rows.push(makeRow(definitions['fresnel-biprism'].tables[0], 0, 4, ['5', '10.000', '11.324']))
  saveFormDraft(form, storage)
  const restored = restoreFormDraft('fresnel-biprism', storage)
  assert.equal(restored.tables[0].rows.length, 5)
  const refreshed = refreshFormTables(restored, textbookOptions(collectInput(restored)))
  assert.equal(refreshed[0].rows[4].cells.find(c => c.key === 'difference').value, '1.324')
  const z = fixture('zeeman-effect').form
  z.tables[1].rows[0].cells[1].value = '12.30000'
  saveFormDraft(z, storage)
  assert.equal(restoreFormDraft('zeeman-effect', storage).tables[1].rows[0].cells[1].value, '12.30000')
})

test('光谱草稿保存不丢精度；损坏存储和存储满不使计算崩溃', () => {
  const storage = memory(), data = { groups: [{ minusLeft: '342:42', minusRight: '162:40', plusLeft: '322:24', plusRight: '142:22' }], density: '300.000', observedPhenomenon: '测试观察' }
  saveSpectralDraft(data, storage)
  assert.equal(restoreSpectralDraft(storage).density, '300.000')
  assert.equal(restoreSpectralDraft(storage).groups[0].minusLeft, '342:42')
  const broken = { getStorageSync: () => { throw Error('unavailable') }, setStorageSync: () => { throw Error('quota') } }
  assert.equal(restoreFormDraft('rlc', broken), null)
  assert.match(saveFormDraft(createForm('rlc'), broken), /保存失败/)
  assert.equal(restoreSpectralDraft(broken), null)
})
