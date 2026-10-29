const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, spectralFixture } = require('./report-fixtures')
const { calculateReport, supportedExperiments, formatReport } = require('../utils/experiment-report')
const { uncertaintyDetails } = require('../utils/uncertainty-presentation')
const { reportView } = require('../utils/report-view')
const { displayResult } = require('../utils/report-units')
const near = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(1e-14, Math.abs(b) * 1e-10), a + ' != ' + b)

test('用户截图的3次同值不再只显示U=Δ：展示散布、A类为0、B类、报告式和未采用的普通公式', () => {
  const f = fixture('single-slit')
  f.input.tables.find(t => t.id === 'distances').rows.forEach(r => { r.z = '76.00' })
  const report = calculateReport(f.input), r = report.results.find(r => r.id === 'distance'), d = uncertaintyDetails(report, r)
  assert.equal(d.kind, 'identical')
  assert.match(d.reason, /3个数值完全相同/)
  assert.equal(d.steps.find(s => s.id === 'sd').result.source, 's=0 cm')
  assert.equal(d.steps.find(s => s.id === 'a').result.source, 'u_A=0 cm')
  assert.equal(d.steps.find(s => s.id === 'b').result.source, 'u_B=0.050 cm')
  assert.match(d.steps.find(s => s.id === 'reported').note, /不额外乘2/)
  assert.match(d.steps.find(s => s.id === 'reported').result.source, /76.000 ± 0.050/)
  assert.ok(d.referenceFormulas.some(e => e.source === 'U=2√(u_A²+u_B²)'))
  assert.ok(reportView(report).results[0].relativeUncertaintySubstitution)
  assert.match(formatReport(report), /公式：u_B≈Δ_ins/)
})

test('只有一个有效值时不伪造样本标准差，仍提供本组公式、代入和理论对照', () => {
  const report = calculateReport(fixture('single-slit').input), r = report.results.find(r => r.id === 'darkDistance'), d = uncertaintyDetails(report, r)
  assert.equal(d.kind, 'single')
  assert.match(d.reason, /无法估计重复测量/)
  assert.ok(!d.steps.some(s => s.id === 'sd' || s.id === 'a'))
  assert.equal(d.steps[0].id, 'b')
  assert.ok(d.steps[0].substitutions.length)
  assert.equal(d.referenceFormulas.length, 3)
})

test('有散布的重复测量完整保留A/B/合成/扩展的原式、数值代入和结果', () => {
  const f = fixture('single-slit')
  f.input.tables.find(t => t.id === 'distances').rows.forEach((r, i) => { r.z = ['76.11', '76.16', '76.22'][i] })
  const report = calculateReport(f.input), r = report.results.find(r => r.id === 'distance'), d = uncertaintyDetails(report, r)
  assert.equal(d.kind, 'repeated')
  for (const id of ['sd', 'a', 'b', 'combined', 'reported']) {
    const s = d.steps.find(s => s.id === id)
    assert.ok(s.formulas.length && s.substitutions.length && s.result)
  }
  assert.equal(d.referenceFormulas.length, 0)
  assert.equal(d.steps.find(s => s.id === 'reported').formulas[0].source, 'U=2u_c')
})

test('代入式的单位位于整个数值式之后，不进入分母或根号内', () => {
  const f = fixture('single-slit')
  f.input.tables.find(t => t.id === 'distances').rows.forEach((r, i) => { r.z = ['76.11', '76.16', '76.22'][i] })
  const report = calculateReport(f.input), d = uncertaintyDetails(report, report.results.find(r => r.id === 'distance'))
  for (const id of ['sd', 'a', 'b']) {
    const m = d.steps.find(s => s.id === id).substitutions[0].math
    assert.equal(m.kind, 'row')
    assert.equal(m.children.at(-1).value, ' cm')
    assert.ok(!JSON.stringify(m.children[0]).includes(' cm'))
  }
})

test('所有现有间接量均有具体物理敏感系数，单位换算后的各项贡献重建原合成值', () => {
  let indirect = 0
  for (const id of supportedExperiments) {
    const f = id === 'spectral-analysis' ? spectralFixture() : fixture(id), report = calculateReport(f.input), before = JSON.stringify(report)
    for (const r of report.results.filter(r => r.uncertainty)) {
      const d = uncertaintyDetails(report, r)
      if (d.kind !== 'propagation') continue
      indirect++
      const terms = d.steps.filter(s => s.id.startsWith('term-'))
      terms.forEach(s => {
        assert.ok(s.data.concrete, id + ':' + r.id + ':' + s.title)
        near(s.data.contribution, Math.abs(s.data.coefficient * s.data.inputU))
        assert.ok(s.formulas[0].source.includes('u('))
        assert.ok(s.substitutions.length && s.result)
      })
      near(Math.hypot(...terms.map(s => s.data.contribution)), displayResult(id, r).uncertainty.combined)
      assert.ok(d.steps.find(s => s.id === 'combined').substitutions.length)
    }
    assert.equal(JSON.stringify(report), before)
  }
  assert.ok(indirect >= 10)
})

test('缺少仪器误差时公式仍可见，缺项不当成0，也不输出完整报告不确定度', () => {
  const f = fixture('young-modulus'); f.input.parameters.extensionLimitMm = ''
  const report = calculateReport(f.input), r = report.results.find(r => r.id === 'extension'), d = uncertaintyDetails(report, r)
  assert.equal(d.complete, false)
  assert.ok(d.steps.find(s => s.id === 'b').formulas.length)
  assert.equal(d.steps.find(s => s.id === 'b').result, null)
  assert.equal(d.steps.find(s => s.id === 'reported').result, null)
  assert.match(d.reason, /仅展示已知项与公式/)
})

test('极小传播项的平方使用科学计数法，显示过程不把浮点下溢误写成0', () => {
  const report = calculateReport(fixture('single-slit').input), r = report.results.find(r => r.id === 'wavelength')
  r.uncertainty = { ...r.uncertainty, combined: 1e-200, reported: 2e-200, components: [{ name: '单缝宽度', sensitivity: 1, u: 1e-200 }] }
  const d = uncertaintyDetails(report, r), s = d.steps.find(s => s.id === 'sum')
  assert.match(s.result.source, /10⁻⁴⁰⁰/)
  assert.notEqual(s.result.source, 'S=0 (nm)²')
  assert.ok(!JSON.stringify(d).includes('Infinity'))
})
