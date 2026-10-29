const test = require('node:test')
const assert = require('node:assert/strict')
const { roundEven, decimalText, significantText, quantityText } = require('../utils/report-precision')
const { automaticGraphicalLine, percentDifference } = require('../utils/report-math')
const { formula } = require('../utils/formula-layout')
const { calculateReport, supportedExperiments, formatReport } = require('../utils/experiment-report')
const { reportView } = require('../utils/report-view')
const { fixture, spectralFixture } = require('./report-fixtures')

const near = (a, b) => assert.ok(Math.abs(a - b) < Math.max(1e-12, Math.abs(b) * 1e-10), a + ' != ' + b)
const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return
  if (node.kind) visit(node)
  Object.values(node).forEach(value => { if (Array.isArray(value)) value.forEach(v => walk(v, visit)); else if (value && typeof value === 'object') walk(value, visit) })
}
const plain = node => { const values = []; walk(node, n => { if (n.kind === 'text') values.push(n.value) }); return values.join('') }
const depth = node => !node || typeof node !== 'object' ? 0 : Math.max(0, ...Object.values(node).filter(v => typeof v === 'object').map(v => Array.isArray(v) ? Math.max(0, ...v.map(depth)) : depth(v))) + (node.kind ? 1 : 0)

test('教材P30–31的四舍六入五凑偶示例与正负恰好半数均正确', () => {
  assert.equal(decimalText(9.8065, -3), '9.806')
  assert.equal(decimalText(3.1415, -3), '3.142')
  assert.equal(decimalText(2.7182, -3), '2.718')
  assert.equal(decimalText(1.245, -2), '1.24')
  assert.equal(decimalText(1.255, -2), '1.26')
  assert.equal(decimalText(-1.245, -2), '-1.24')
  assert.equal(decimalText(1.24501, -2), '1.25')
  assert.equal(roundEven(1234, 1), 1230)
  assert.equal(decimalText(.0002500, -4), '0.0002')
})

test('教材P21–22结果末位与两位有效数字不确定度对齐，保留有效零', () => {
  assert.equal(quantityText(6.0303, 'cm', { complete: true, reported: .0072 }).expression, '(6.0303 ± 0.0072) cm')
  assert.equal(quantityText(41.72, 'cm', { complete: true, reported: .54 }).expression, '(41.72 ± 0.54) cm')
  assert.equal(quantityText(372.8, 'cm', { complete: true, reported: 8.9 }).expression, '(372.8 ± 8.9) cm')
  assert.equal(significantText(1.2, 2), '1.2')
  assert.equal(significantText(.1, 2), '0.10')
})

test('截图中的长串e指数改成科学计数法与负指数单位，展示修约不改原数值', () => {
  const value = 4.303062773e-22
  assert.equal(quantityText(value, 'J/K').expression, '4.303 × 10⁻²² J·K⁻¹')
  assert.equal(value, 4.303062773e-22)
  const tiny = quantityText(1.38e-23, 'J/K', { complete: true, reported: .02e-23 })
  assert.equal(tiny.expression, '(1.380 ± 0.020) × 10⁻²³ J·K⁻¹')
  assert.doesNotMatch(tiny.expression, /e[-+]?\d/i)
})

test('自动选取教材要求的非测量点，两点相距较远，第三点用于截距', () => {
  const measured = [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }]
  const before = JSON.stringify(measured)
  const fit = automaticGraphicalLine(measured)
  assert.equal(fit.selectedPoints.length, 3)
  near(fit.slope, 2); near(fit.intercept, 1)
  assert.ok(fit.selectedPoints[1].x - fit.selectedPoints[0].x > 3 * .7)
  fit.selectedPoints.forEach(p => { assert.ok(!measured.some(r => r.x === p.x)); assert.equal(p.isMeasurement, false); near(p.y, 1 + 2 * p.x) })
  assert.equal(JSON.stringify(measured), before)
})

test('不把稀疏或退化数据当作可图解直线，冷却切线不超出实测温度', () => {
  assert.throws(() => automaticGraphicalLine([{ x: 1, y: 1 }]))
  assert.throws(() => automaticGraphicalLine([{ x: 1, y: 1 }, { x: 1, y: 2 }]))
  const f = fixture('thermal-conductivity'), report = calculateReport(f.input)
  const tangent = report.results.find(r => r.id === 'coolingTangentSlope')
  assert.ok(tangent.fit.automatic)
  assert.deepEqual(tangent.fit.sourceRows, [1, 2, 3])
  near(tangent.value, -5)
  f.input.parameters.steadyU2 = '35'
  const endpoint = calculateReport(f.input).results.find(r => r.id === 'coolingTangentSlope')
  assert.ok(endpoint.fit.selectedPoints.every(p => p.x > 0 && p.x < 2 && ![0, 1, 2].includes(p.x)))
  f.input.parameters.steadyU2 = '200'
  assert.equal(calculateReport(f.input).status, 'invalid')
})

test('S=dU_F/dt实际排成分式和F下标，指数与根式也有结构', () => {
  const tree = formula('S=dU_F/dt'), kinds = []
  walk(tree, n => kinds.push(n.kind))
  assert.ok(kinds.includes('fraction'))
  assert.ok(kinds.includes('script'))
  assert.equal(plain(tree), 'S = dUFdt')
  assert.ok(JSON.stringify(formula('I_S=e^a')).includes('upper'))
  assert.equal(formula('√(L/C)').kind, 'root')
})

test('复合公式按优先级排版，百分数因子不进入分母，乘数后的根号仍有根式结构', () => {
  const percent = formula('E=|x−x₀|/|x₀|×100%'), fractions = []
  walk(percent, node => { if (node.kind === 'fraction') fractions.push(node) })
  assert.equal(fractions.length, 1)
  assert.equal(plain(fractions[0].denominator), '|x₀|')
  assert.match(plain(percent), /100%$/)
  const sound = formula('v=331.45√(1+t/273.15)'), kinds = []
  walk(sound, node => kinds.push(node.kind))
  assert.ok(kinds.includes('root'))
  assert.ok(kinds.includes('fraction'))
  assert.equal(plain(formula('I_S=e^a×10^-6 A')), 'IS = ea × 10-6A')
  near(percentDifference(-9, -10), 10)
  assert.throws(() => percentDifference(1, 0))
})

test('全部实验的公式树深度可由原生模板完整排版；百分差包括分母、100%和代入结果', () => {
  for (const id of supportedExperiments) {
    const f = id === 'spectral-analysis' ? spectralFixture() : fixture(id)
    const report = calculateReport(f.input), view = reportView(report)
    assert.equal(report.status, 'complete', id + ':' + JSON.stringify(report.issues))
    for (const r of view.results) for (const key of ['valueMath', 'formulaMath', 'comparisonMath', 'comparisonSubstitution', 'relativeUncertaintyMath']) {
      if (r[key]) assert.ok(depth(r[key]) < 16, id + ':' + r.id + ':' + key)
    }
    for (const r of view.results) if (r.uncertaintyMath) for (const expression of Object.values(r.uncertaintyMath)) if (expression) assert.ok(depth(expression) < 16)
    const comparison = view.results.find(r => r.comparisonMath)
    if (comparison) {
      assert.match(plain(comparison.comparisonMath), /100%/)
      assert.match(plain(comparison.comparisonSubstitution), /100% = /)
      assert.match(formatReport(report), /百分差公式/)
    }
    if (view.graphSelections.length) assert.ok(view.graphSelections[0].points.length >= 2)
    report.results.forEach(r => assert.doesNotMatch(r.formatted.expression, /\d(?:e[-+]\d)/i))
  }
})
