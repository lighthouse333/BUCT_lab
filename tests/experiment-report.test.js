const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, spectralFixture } = require('./report-fixtures')
const { calculateReport, calculateFormReport, collectSpectralInput, formatReport, serializeReport, supportedExperiments } = require('../utils/experiment-report')
const { measurement, fitLine, numeric, decimalDifference, formatQuantity } = require('../utils/report-math')

const result = (report, id) => { const r = report.results.find(r => r.id === id); assert.ok(r, id); return r }
const near = (actual, expected, relative = 1e-9) => assert.ok(Math.abs(actual - expected) <= Math.max(Math.abs(expected) * relative, 1e-25), actual + ' != ' + expected)
const reportFor = (id, mode) => { const f = fixture(id, mode); return calculateReport(f.input, f.options) }

test('16个实验均可生成JSON报告数据；不修改原始字符串或计算条件', () => {
  assert.equal(supportedExperiments.length, 16)
  for (const id of supportedExperiments) {
    const f = id === 'spectral-analysis' ? spectralFixture() : fixture(id)
    const before = JSON.stringify(f)
    const report = calculateReport(f.input, f.options)
    assert.equal(report.status, 'complete', id + ': ' + JSON.stringify(report.issues))
    assert.equal(report.reportReady, true)
    assert.equal(report.reportFinished, false)
    assert.ok(report.tables.length)
    assert.ok(report.requirements.processing.length)
    assert.equal(JSON.stringify(f), before)
    assert.deepEqual(JSON.parse(serializeReport(report)), report)
    assert.ok(!/NaN|Infinity/.test(serializeReport(report)))
    assert.ok(formatReport(report).includes('实验报告'))
  }
})

test('杨氏模量区分直接伸长与光杠杆，质量g和长度cm/mm换SI', () => {
  const f = fixture('young-modulus')
  const direct = calculateReport(f.input, f.options)
  near(result(direct, 'youngModulus').value, 1.5915494309189534e9)
  assert.equal(result(direct, 'extension').statistics.inputToOutputScale, 1e-3)
  assert.equal(result(direct, 'extension').statistics.outputUnit, 'm')
  assert.equal(direct.tables.find(t => t.id === 'differences').rows[0].force, 5)
  const optical = calculateReport(f.input, { ...f.options, extensionModel: 'optical-lever', leverDistanceM: 1, leverArmM: .1, limits: { ...f.options.limits, leverDistanceM: .001, leverArmM: .0001 } })
  near(result(optical, 'youngModulus').value, 3.1830988618379068e10)
  f.input.parameters.leverDistanceM = ''
  const missing = calculateReport(f.input, { limits: f.options.limits })
  assert.equal(missing.status, 'partial')
  assert.ok(!missing.results.some(r => r.id === 'youngModulus'))
})

test('开尔文默认0.1倍率，不能使用R1/R2；图解与回归分开', () => {
  const f = fixture('kelvin-bridge')
  const r = calculateReport(f.input, f.options)
  near(result(r, 'bridgeRatio').value, .1)
  near(result(r, 'resistivity').value, 7.853981633974482e-7)
  near(result(r, 'resistivityGraphical').value, 7.853981633974482e-7)
  assert.equal(result(r, 'resistivityGraphical').method, 'graphical')
  const partial = calculateReport(f.input, { ...f.options, graphical: {} })
  assert.ok(partial.results.some(r => r.id === 'resistivityFit'))
  assert.ok(result(partial, 'resistivityGraphical').fit.automatic)
  assert.equal(partial.status, 'complete')
  f.input.parameters.r2 = '200'
  assert.equal(calculateReport(f.input, f.options).status, 'invalid')
})

test('扭摆累计时间除10/5，双滑块斜率除2，质量比较支持两块总质量', () => {
  const f = fixture('torsion-pendulum')
  const r = calculateReport(f.input, f.options)
  near(result(r, 'cylinderInertia').value, .0001)
  near(result(r, 'torsionConstant').value, .0039478417604357436)
  near(result(r, 'sliderMassGraphical').value, .02)
  near(result(r, 'T0').value, 1)
  f.input.parameters.sliderMass = '.04'
  const total = calculateReport(f.input, { ...f.options, sliderMassReference: 'pair' })
  assert.ok(result(total, 'sliderMassGraphical').percentDifference < 1e-10)
})

test('驻波与同相行波/李萨如系数不同，仅驻波附不确定度', () => {
  const f = fixture('sound-speed')
  const r = calculateReport(f.input, f.options)
  for (const id of ['standingSpeed', 'travelingSpeed', 'lissajousSpeed']) near(result(r, id).value, 340)
  assert.ok(result(r, 'standingSpeed').uncertainty.complete)
  assert.ok(!result(r, 'travelingSpeed').uncertainty)
  const alternate = calculateReport(f.input, { ...f.options, lissajousStep: 'alternating-line' })
  near(result(alternate, 'lissajousSpeed').value, 680)
  const missing = calculateReport(f.input, { ...f.options, lissajousStep: '' })
  assert.equal(missing.status, 'partial')
  assert.ok(missing.issues.some(i => i.path === 'options.lissajousStep'))
})

test('应变按原件极差法与各循环最大滞后，并返回所用原始格', () => {
  const r = reportFor('strain-sensor')
  for (const id of ['single-arm', 'full-bridge']) {
    near(result(r, id + '-sensitivity').value, 2)
    assert.ok(result(r, id + '-nonlinearity').value < 1e-10)
    near(result(r, id + '-hysteresis').value, .0625)
    near(result(r, id + '-repeatabilityForward').value, .025)
    assert.ok(result(r, id + '-hysteresis').selectedData.row >= 1)
  }
})

test('积分电流计比较法算2μF，RC斜率-0.01和1μF算100MΩ，Q0恢复15μC', () => {
  const r = reportFor('ballistic-galvanometer')
  near(result(r, 'capacitance1Graphical').value, 2)
  near(result(r, 'forwardResistanceGraphical').value, 100)
  near(result(r, 'reverseInitialChargeGraphical').value, 15)
  const f = fixture('ballistic-galvanometer')
  for (const t of f.input.tables.filter(t => t.id.startsWith('capacitance'))) t.rows.forEach(r => { r.standardReverse = '-' + r.standardReverse; r.unknownReverse = '-' + r.unknownReverse })
  const signed = calculateReport(f.input, { ...f.options, chargeConvention: 'signed' })
  near(result(signed, 'capacitance1Graphical').value, 2)
  assert.equal(calculateReport(f.input, f.options).status, 'invalid')
})

test('导热按每分钟斜率除60；未确认共同温标、切线温度错误均不冒充完整结果', () => {
  const f = fixture('thermal-conductivity')
  const r = calculateReport(f.input, f.options)
  const expected = .9 * 390 * (5 / 60) / 20 * ((.065 + 2 * .00742) / (.13 + 2 * .00742)) * .008 / (Math.PI * .065 ** 2)
  near(result(r, 'thermalConductivity').value, expected)
  const without = { ...f.options, sharedTemperatureCalibration: false }
  const missing = calculateReport(f.input, without)
  assert.equal(missing.status, 'partial')
  assert.ok(!missing.results.some(r => r.id === 'thermalConductivity'))
  assert.equal(calculateReport(f.input, { ...f.options, tangent: { slopeMvPerMin: -5, atVoltageMv: 29 } }).status, 'invalid')
})

test('RLC电压峰值频率不是半功率频率，相位arcsin仅生成幅值直到给定符号', () => {
  const f = fixture('rlc')
  const r = calculateReport(f.input, f.options)
  near(result(r, 'resonanceFrequencyTheory').value, 795.7747154594767)
  near(result(r, 'inductorPeakFrequencyTheory').value, 1125.3953951963827)
  near(result(r, 'capacitorPeakFrequencyTheory').value, 562.6976975981913)
  near(result(r, 'qualityFactor1').value, 1)
  near(result(r, 'qualityFactor2').value, 10)
  const opts = { ...f.options }; delete opts.phaseSigns
  const partial = calculateReport(f.input, opts)
  assert.equal(partial.status, 'complete')
  assert.equal(partial.tables.find(t => t.id === 'rlc-phase').rows[0].phase, null)
  f.input.tables.find(t => t.id === 'phase-200').rows[0].b = '2'
  assert.equal(calculateReport(f.input, f.options).status, 'invalid')
})

test('霍尔换向、mA/T-A、8/3π浓度、迁移率及不同螺线管KH均正确', () => {
  const f = fixture('hall-effect')
  const r = calculateReport(f.input, f.options)
  near(result(r, 'hallCoefficient').value, .0002)
  near(result(r, 'workingMagneticField').value, .01125)
  near(result(r, 'carrierDensity').value, (8 / (3 * Math.PI)) / (1.602176634e-19 * .0002))
  near(result(r, 'conductivity').value, 3333.3333333333335)
  near(result(r, 'hallMobility').value, 2 / 3)
  near(result(r, 'driftMobility').value, Math.PI / 4)
  near(r.tables.find(t => t.id === 'axial-field-processed').rows[0].magneticField, .01)
  const simple = calculateReport(f.input, { ...f.options, carrierModel: 'simple' })
  near(result(simple, 'carrierDensity').value / result(r, 'carrierDensity').value, 3 * Math.PI / 8)
})

test('PN对数基准μA换回A；摄氏截距须换0K，图解和回归各保留一套', () => {
  const r = reportFor('pn-junction')
  near(result(r, 'boltzmannFit').value, 1.38e-23)
  near(result(r, 'boltzmannGraphical').value, 1.38e-23)
  near(result(r, 'saturationCurrentFit').value, 1e-12)
  near(result(r, 'temperatureSensitivityFit').value, -2)
  near(result(r, 'bandgapFit').value, 1.21)
  near(result(r, 'bandgapGraphical').value, 1.21)
  const f = fixture('pn-junction'); f.input.tables[0].rows[0].current = '0'
  assert.equal(calculateReport(f.input, f.options).status, 'invalid')
})

test('菲涅尔：5间隔除5、l1l2开方、cm/mm换米后得到600nm', () => {
  const r = reportFor('fresnel-biprism')
  near(result(r, 'distance').value, 1)
  near(result(r, 'sourceSeparation').value, .001)
  near(result(r, 'wavelength').value, 600)
  assert.ok(result(r, 'wavelength').uncertainty.complete)
})

test('光的偏振仅整理实际记录，45°无多余填空，预印分析与实测分开', () => {
  const r = reportFor('polarization')
  assert.equal(r.kind, 'observation')
  assert.equal(r.results.length, 0)
  assert.equal(r.tables[0].rows[3].brightAxes, null)
  assert.ok(r.referenceMaterial.length)
  assert.ok(!r.observations.some(o => o.source === 'preprinted'))
})

test('单缝直接由报告表3计算，左右平均消去中心位置，固定k=3给600nm；须满足位置次序', () => {
  const f = fixture('single-slit')
  near(result(calculateReport(f.input, f.options), 'wavelength').value, 600)
  f.input.tables.find(t => t.id === 'minima').rows[0].center = '.5'
  const shifted = calculateReport(f.input, f.options)
  near(result(shifted, 'wavelength').value, 600)
  f.input.tables.find(t => t.id === 'minima').rows[0].right = '-20'
  const invalid = calculateReport(f.input, f.options)
  assert.equal(invalid.status, 'invalid')
})

test('塞曼π(4/6)和σ(3/7)正确选不同系数，综合版按实际成分选择系数', () => {
  for (const mode of ['combined', 'pi', 'sigma']) {
    const r = reportFor('zeeman-effect', mode)
    assert.equal(r.status, 'complete', mode + JSON.stringify(r.issues))
    near(result(r, 'electronChargeMassRatio').value, 1.8836515673088534e11)
  }
  const f = fixture('zeeman-effect')
  f.input.parameters.componentA = ''
  const missing = calculateReport(f.input, {})
  assert.equal(missing.status, 'partial')
  assert.ok(!missing.results.some(r => r.id === 'electronChargeMassRatio'))
})

test('迈克尔孙N=3h非h/5h，三组逐差得650nm；首点非0和回转序列被拒绝', () => {
  const f = fixture('michelson')
  const r = calculateReport(f.input, f.options)
  near(result(r, 'wavelength').value, 650)
  assert.equal(result(r, 'wavelength').inputs.count, 150)
  assert.ok(result(r, 'wavelength').uncertainty.complete)
  f.input.tables[0].rows[0].order = '100'
  assert.equal(calculateReport(f.input, f.options).status, 'invalid')
  f.input.tables[0].rows[0].order = '0'
  f.input.tables[0].rows[2].position = '50'
  assert.equal(calculateReport(f.input, f.options).status, 'invalid')
})

test('光谱500nm；0.1%光栅项0.5nm与角度项合成1nm；半组不生成漏算汇总', () => {
  const f = spectralFixture()
  const r = calculateReport(f.input, f.options)
  near(result(r, 'wavelength').value, 500)
  near(result(r, 'wavelength').uncertainty.combined, 1)
  const opts = { ...f.input.parameters }; delete opts.angularInstrumentUncertainty
  const partial = calculateReport({ ...f.input, parameters: opts })
  assert.equal(partial.status, 'partial')
  assert.equal(result(partial, 'wavelength').uncertainty.complete, false)
  f.input.tables[0].rows[0].minusLeft = ''
  assert.ok(!calculateReport(f.input).results.some(r => r.id === 'wavelength'))
})

test('缺少仪器误差不是0；标准口径与课程口径、单次规则和相关系数有区别', () => {
  const empty = measurement([1, 2, 3], null)
  assert.equal(empty.uncertainty.complete, false)
  assert.equal(empty.uncertainty.combined, null)
  const course = measurement([1, 2, 3], .03)
  assert.equal(course.sumSquaredDeviations, 2)
  assert.deepEqual(course.deviations.map(d => d.deviation), [-1, 0, 1])
  near(course.uncertainty.a, 1.32 / Math.sqrt(3))
  near(measurement([1, 1, 1], .03).uncertainty.reported, .03)
  near(measurement([1, 1, 1], .03, { policy: 'standard' }).uncertainty.combined, .03 / Math.sqrt(3))
  assert.equal(measurement([1], 1e-200).uncertainty.combined, 1e-200)
  near(fitLine([{ x: 1, y: 2 }, { x: 2, y: 1 }]).r, -1)
  assert.equal(fitLine([{ x: 1, y: 2 }, { x: 2, y: 2 }]).rSquared, null)
  assert.throws(() => fitLine([{ x: 1, y: 1 }, { x: 1, y: 2 }]))
  for (const v of ['', '0x10', 'NaN', 'Infinity', '1e999']) assert.throws(() => numeric(v))
})

test('旧版/未知实验/重复表/非JSON/非有限值不会产生伪结果', () => {
  const f = fixture('young-modulus')
  const bad = [undefined, null, { ...f.input, schemaVersion: 1 }, { ...f.input, schemaVersion: 2 }, { ...f.input, experimentId: 'unknown' }, { ...f.input, tables: f.input.tables.concat(f.input.tables[0]) }, { ...f.input, parameters: { ...f.input.parameters, wireLength: Infinity } }]
  for (const input of bad) {
    const r = calculateReport(input)
    assert.equal(r.status, 'invalid')
    assert.equal(r.results.length, 0)
    assert.doesNotThrow(() => JSON.stringify(r))
  }
  const cyclic = {}; cyclic.self = cyclic
  assert.equal(calculateReport(cyclic).status, 'invalid')
})

test('直接接当前通用页面数据，光谱页面适配器保持0和原始精度', () => {
  const f = fixture('young-modulus')
  const r = calculateFormReport(f.form, f.options)
  assert.equal(r.status, 'complete')
  assert.equal(r.rawInput.tables[0].rows[0].loading, '0.000')
  const p = spectralFixture().input.parameters
  const input = collectSpectralInput({ ...p, groups: spectralFixture().input.tables[0].rows })
  assert.equal(input.tables[0].rows[0].minusLeft, '0')
  assert.equal(calculateReport(input).status, 'complete')
})

test('空白页面可返回待补项；固定次数表不能通过截掉未填行冒充完成', () => {
  const { createForm, collectInput } = require('../utils/experiment-input')
  for (const id of supportedExperiments.filter(id => id !== 'spectral-analysis')) {
    let report
    assert.doesNotThrow(() => { report = calculateReport(collectInput(createForm(id))) }, id)
    assert.equal(report.status, 'partial', id + JSON.stringify(report.issues))
    assert.ok(report.missingInputs.length)
  }
  const f = fixture('pn-junction')
  f.input.tables[0].rows = f.input.tables[0].rows.slice(0, 2)
  assert.equal(calculateReport(f.input, f.options).status, 'invalid')
})

test('零、空格、负电量、退化数据和损坏的人工图解点均给结构化诊断', () => {
  const cases = [
    ['kelvin-bridge', f => { f.input.tables[1].rows[0].forward = '0x10' }],
    ['ballistic-galvanometer', f => { f.input.tables[2].rows[0].charge = '0' }],
    ['pn-junction', f => { f.input.tables[0].rows[0].current = ' ' }],
    ['kelvin-bridge', f => { f.options.graphical.resistivity = [null, { x: 1, y: 2 }] }],
    ['strain-sensor', f => { f.input.tables[0].rows.forEach(r => { r.x = '1' }) }],
  ]
  for (const [id, change] of cases) {
    const f = fixture(id); change(f)
    let report
    assert.doesNotThrow(() => { report = calculateReport(f.input, f.options) }, id)
    assert.notEqual(report.status, 'complete')
    assert.ok(report.issues.length)
    assert.ok(!/NaN|Infinity/.test(serializeReport(report)))
  }
})

test('十进制读数作差保持相同位移；最终表达式修约不改计算值', () => {
  assert.equal(decimalDifference(51.28367, 51.23492), .04875)
  assert.equal(decimalDifference(51.29992, 51.25117), .04875)
  const formatted = formatQuantity(649.689, 'nm', { complete: true, reported: 4.123 })
  assert.equal(formatted.expression, '(649.7 ± 4.1) nm')
  const f = fixture('michelson'), r = calculateReport(f.input, f.options)
  const delta = result(r, 'displacement')
  assert.equal(delta.uncertainty.singleMeasurementRule, true)
  assert.equal(delta.uncertainty.combined, .00004)
  assert.equal(result(r, 'wavelength').value, 650)
})

test('可续录表忽略中间全空行后保留原始序号，错误路径仍指向原输入数组', () => {
  const f = fixture('pn-junction')
  const table = f.form.tables.find(t => t.id === 'constant-current')
  table.rows[1].cells.filter(c => c.kind === 'number').forEach(c => { c.value = '' })
  const report = calculateFormReport(f.form, f.options)
  assert.equal(report.status, 'complete', JSON.stringify(report.issues))
  assert.deepEqual(report.tables.find(t => t.id === 'pn-temperature').rows.map(r => r.sourceRow), Array.from({ length: table.rows.length }, (_, i) => i + 1).filter(n => n !== 2))
  const duplicate = JSON.parse(JSON.stringify(report.rawInput))
  duplicate.tables[1].rows[1].number = '1'
  assert.equal(calculateReport(duplicate, f.options).status, 'invalid')
})
