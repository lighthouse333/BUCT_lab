const test = require('node:test')
const assert = require('node:assert/strict')
const { calculateReport, supportedExperiments, formatReport } = require('../utils/experiment-report')
const { reportView } = require('../utils/report-view')
const { displayResult, reportQuantity } = require('../utils/report-units')
const { fixture, spectralFixture } = require('./report-fixtures')
const near = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(1e-15, Math.abs(b) * 1e-10), a + ' != ' + b)

test('截图中的距离与不确定度同时从m换成cm，末位对齐且不改原值', () => {
  const r = { id: 'distance', value: .76163, unit: 'm', uncertainty: { complete: true, reported: .00092 } }
  const before = JSON.stringify(r), shown = reportQuantity('single-slit', r)
  assert.equal(shown.expression, '(76.163 ± 0.092) cm')
  assert.equal(shown.scale, 100)
  assert.equal(shown.sourceUnit, 'm')
  assert.equal(JSON.stringify(r), before)
})

test('16个实验显示单位换算保持相对误差、相对不确定度和分量合成值，不改变SI数据', () => {
  for (const id of supportedExperiments) {
    const f = id === 'spectral-analysis' ? spectralFixture() : fixture(id), report = calculateReport(f.input)
    const before = JSON.stringify(report)
    for (const r of report.results) {
      const d = displayResult(id, r)
      near(d.value / d.scale, r.value)
      assert.equal(r.formatted.unit, d.unit)
      if (r.reference != null) near(d.reference / d.scale, r.reference)
      if (r.uncertainty && r.uncertainty.complete) {
        near(d.uncertainty.reported / d.scale, r.uncertainty.reported)
        if (r.value !== 0) near(d.uncertainty.reported / Math.abs(d.value), r.uncertainty.reported / Math.abs(r.value))
        near(Math.hypot(...d.uncertainty.components.map(c => c.sensitivity * c.u)), d.uncertainty.combined)
      }
    }
    assert.equal(JSON.stringify(report), before)
  }
})

test('直接测量分步显示A/B/合成/报告值，均为cm，不把厘米换米的系数混进代入式', () => {
  const f = fixture('single-slit'), rows = f.input.tables.find(t => t.id === 'distances').rows
  rows.forEach((r, i) => { r.z = ['76.11', '76.16', '76.22'][i] })
  const report = calculateReport(f.input), view = reportView(report), d = view.results.find(r => r.id === 'distance')
  assert.equal(d.expanded, false)
  assert.deepEqual(d.uncertaintyMath.steps.map(r => r.id), ['sd', 'a', 'b', 'combined', 'reported'])
  assert.ok(d.uncertaintyMath.steps.every(r => r.result.source.endsWith(' cm')))
  assert.equal(d.uncertaintyMath.kind, 'repeated')
  assert.ok(!JSON.stringify(d.uncertaintyMath.steps).includes('0.01000'))
  assert.ok(!JSON.stringify(d.uncertaintyMath).includes('ᵦ'))
  const raw = report.results.find(r => r.id === 'distance')
  assert.equal(d.relativeUncertainty, require('../utils/report-precision').significantText(raw.uncertainty.reported / raw.value * 100, 2) + '%')
})

test('传播贡献逐项换为结果单位，复制出的单缝过程与页面使用cm/mm/nm', () => {
  const report = calculateReport(fixture('single-slit').input), view = reportView(report)
  const lambda = view.results.find(r => r.id === 'wavelength')
  assert.ok(lambda.uncertaintyMath.steps.filter(s => s.id.startsWith('term-')).every(c => c.result.source.endsWith(' nm')))
  assert.ok(lambda.uncertaintyMath.steps.filter(s => s.id.startsWith('term-')).every(c => c.data.concrete))
  assert.ok(lambda.uncertaintyMath.steps.find(s => s.id === 'combined').substitutions.length)
  const copy = formatReport(report)
  assert.match(copy, /平均衍射距离 = .* cm/)
  assert.match(copy, /平均暗纹至中央距离 = .* mm/)
  assert.match(copy, /报告不确定度=.* cm/)
  assert.match(copy, /报告不确定度=.* mm/)
  assert.match(copy, /单缝测得激光波长 = .* nm/)
})
