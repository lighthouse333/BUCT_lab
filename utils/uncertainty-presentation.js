// 完整展示适用规则、原式、数值代入与结果。只读计算输出，不重算或覆盖报告值。
const { formula, identify, row, text } = require('./formula-layout')
const { significantText, superscript } = require('./report-precision')
const { displayResult } = require('./report-units')
const line = source => ({ source, math: formula(source) })
// 单位在整个数值式之后独立排版，不能被分式解析进分母或根号。
const quantityLine = (source, unit) => ({ source: source + unit,
  math: identify(row([formula(source), text(unit)])) })
const short = value => Number.isFinite(value) ? Number(value.toPrecision(12)).toString() : '待补充'
const num = (value, digits = 4) => significantText(value, digits)
function squareText(value) {
  const squared = value * value
  if (Number.isFinite(squared) && (squared !== 0 || value === 0)) return num(squared)
  const parts = value.toExponential().split('e')
  return num(Number(parts[0]) ** 2) + ' × 10' + superscript(Number(parts[1]) * 2)
}
const term = (symbol, derivative, unit, scale = 1) => ({ symbol, derivative, unit, scale })
const recipes = {
  'young-modulus/youngModulus': { symbol: 'E', terms: {
    '原长': term('L', 'E/L', 'cm', 100), '直径': term('d', '−2E/d', 'mm', 1000), '逐差位移': term('C', '−E/C', 'mm', 1000),
    '镜尺距离': term('D', 'E/D', 'm'), '光杠杆臂长': term('b', '−E/b', 'm'),
  } },
  'kelvin-bridge/resistivity': { symbol: 'ρ', terms: {
    '电阻箱均值': term('R_N', 'ρ/R_N', 'Ω'), '直径': term('d', '2ρ/d', 'mm', 1000), '长度': term('L', '−ρ/L', 'cm', 100),
  } },
  'torsion-pendulum/cylinderInertia': { symbol: 'I_c', terms: { '质量': term('M', 'D²/8', 'kg'), '直径': term('D', 'MD/4', 'mm', 1000) } },
  'torsion-pendulum/torsionConstant': { symbol: 'K', terms: {
    '圆柱惯量': term('I_c', 'K/I_c', 'kg·m²'), 'T₁': term('T₁', '−2KT₁/(T₁²−T₀²)', 's'), 'T₀': term('T₀', '2KT₀/(T₁²−T₀²)', 's'),
  } },
  'sound-speed/standingWavelength': { symbol: 'λ', terms: { '平均逐差': term('ΔL', '2/5', 'mm', 1000) } },
  'sound-speed/standingSpeed': { symbol: 'v', terms: { '频率': term('f', 'λ', 'kHz', .001), '波长': term('λ', 'f', 'mm', 1000) } },
  'fresnel-biprism/sourceSeparation': { symbol: 'l', terms: { 'l₁': term('l₁', 'l/(2l₁)', 'mm', 1000), 'l₂': term('l₂', 'l/(2l₂)', 'mm', 1000) } },
  'fresnel-biprism/wavelength': { symbol: 'λ', terms: {
    '虚光源间距': term('l', 'λ/l', 'mm', 1000), '条纹间距': term('Δx', 'λ/Δx', 'mm', 1000), '传播距离': term('d', '−λ/d', 'cm', 100),
  } },
  'single-slit/wavelength': { symbol: 'λ', terms: {
    '单缝宽度': term('a', 'x̄₃/(3z̄)', 'mm', 1000), '平均暗纹距离': term('x̄₃', 'a/(3z̄)', 'mm', 1000), '衍射距离': term('z̄', '−a x̄₃/(3z̄²)', 'cm', 100),
  } },
  'michelson/wavelength': { symbol: 'λ', terms: { '逐差位移': term('Δd̄', '2/N', 'mm'), '条纹数': term('N', '−λ/N', '') } },
  'spectral-analysis/meanAngle': { symbol: 'θ', terms: { '角度A类项': term('θ_A', '1', 'rad'), '已换算到θ的仪器标准项': term('θ_B', '1', 'rad') } },
  'spectral-analysis/wavelength': { symbol: 'λ', terms: { '光栅常数': term('d', 'sinθ', 'nm'), '衍射角': term('θ', 'd cosθ', 'rad') } },
}
const measurementSymbols = {
  'single-slit': { distance: 'z', darkDistance: 'x̄₃' },
  'young-modulus': { extension: 'C', diameter: 'd', length: 'L', 'lever-distance': 'D', 'lever-arm': 'b' },
  'kelvin-bridge': { diameter: 'd', length: 'L', resistanceReading: 'R_N' },
  'torsion-pendulum': { diameter: 'D', cylinderMass: 'M', T0: 'T₀', T1: 'T₁' },
  'sound-speed': { standingDifference: 'ΔL' },
  'fresnel-biprism': { distance: 'd', 'fringe-spacing-mean': 'Δx', 'image-l1-mean': 'l₁', 'image-l2-mean': 'l₂' },
  michelson: { displacement: 'Δd' },
}

function uncertaintyDetails(report, raw) {
  if (!raw.uncertainty) return null
  const r = displayResult(report.experiment.id, raw), stats = raw.statistics
  const angular = report.experiment.id === 'spectral-analysis' && raw.id === 'meanAngle'
  const u = angular ? { ...r.uncertainty, a: r.uncertainty.components[0].u, b: r.uncertainty.components[1].u, tp: stats.tp } : r.uncertainty
  const recipe = recipes[report.experiment.id + '/' + raw.id]
  const symbol = (measurementSymbols[report.experiment.id] || {})[raw.id] || (recipe || {}).symbol || 'y'
  const unit = r.unit ? ' ' + r.unit : '', steps = [], facts = []
  const resultLine = (s, value, digits = 4) => value == null ? null : quantityLine(s + '=' + num(value, digits), unit)
  const add = (id, title, formulas, substitutions, result, note = '', data = null) => steps.push({ id, title,
    formulas: formulas.map(line), substitutions: substitutions.filter(Boolean).map(e => typeof e === 'string' ? line(e) : e), result, note, data })
  const direct = Object.prototype.hasOwnProperty.call(u, 'a')
  const complete = u.complete
  let kind = direct ? u.singleMeasurementRule ? stats && stats.n > 1 ? 'identical' : 'single' : 'repeated' : 'propagation'
  let reason = ''
  if (stats) facts.push('有效测量次数 n = ' + stats.n)
  if (u.instrumentLimit != null) facts.push('本量有效仪器误差限 Δ_ins = ' + short(u.instrumentLimit) + unit)

  if (direct) {
    const n = stats.n, scale = stats.inputToOutputScale * r.scale
    const sd = stats.sd == null ? null : stats.sd * scale
    const sourceSS = stats.sumSquaredDeviations == null ? stats.variance == null ? null : stats.variance * (n - 1) : stats.sumSquaredDeviations
    const ss = sourceSS == null ? null : sourceSS * scale * scale
    if (kind === 'identical') reason = '本组用于统计的' + n + '个数值完全相同，均为' + short(stats.mean * scale) + unit + '。教材P21规定按单次测量处理，仪器项仍须保留。'
    else if (kind === 'single') reason = '本量只有1个有效值，无法估计重复测量的散布；按教材P21的单次测量规则评定。'
    else reason = angular ? '衍射角由四游标读数计算；其仪器项已经按标准不确定度输入，与A类项合成。这里不套用单个原始读数的误差限规则。' : '本组重复测量存在读数散布，分别评定A类、B类，再按教材规定合成。'
    if (n > 1) {
      add('sd', '计算样本标准差', ['s=√(Σ(xᵢ−x̄)²/(n−1))'],
        ss == null ? [] : [quantityLine('s=√(' + num(ss) + '/' + (n - 1) + ')', unit)], resultLine('s', sd))
      add('a', '评定A类不确定度', ['u_A=tₚ·s/√(n)'],
        u.tp == null || sd == null ? [] : [quantityLine('u_A=' + short(u.tp) + '·' + num(sd) + '/√(' + n + ')', unit)], resultLine('u_A', u.a, 2),
        u.tp == null ? '教材表未列出当前测次的tₚ，A类项待补充，不能当作0。' : kind === 'identical' ? '散布为0，所以本组A类项为0；这不表示总不确定度为0。' : '', { value: u.a })
    } else if (!u.singleMeasurementRule) {
      add('a', 'A类不确定度（测次不足）', ['u_A=tₚ·s/√(n)'], [], null, '至少需要两次有效测量才能估计散布，当前A类项待补充。')
    }
    if (u.singleMeasurementRule) {
      add('b', '按单次测量规则保留仪器项', ['u_B≈Δ_ins'],
        u.instrumentLimit == null ? [] : ['u_B=' + short(u.instrumentLimit) + unit], resultLine('u_B', u.b, 2),
        '教材采用取偏大的原则，本组用有效仪器误差限评定；不再套用Δ_ins/√3。')
      add('reported', '写出本组报告结果', [symbol + '=x̄±u_B'], [],
        complete ? line(symbol + '=' + raw.formatted.expression) : null,
        '本组报告的是u_B，不额外乘2。一般重复测量的扩展公式列在下方供对照。', { reported: u.reported })
    } else {
      add('b', '评定B类不确定度', [angular ? 'u_B(θ)=u_{仪器}(θ)' : 'u_B=Δ_ins/√(3)'],
        angular ? [u.b == null ? null : quantityLine('u_B(θ)=' + num(u.b), unit)] : u.instrumentLimit == null ? [] : [quantityLine('u_B=' + short(u.instrumentLimit) + '/√(3)', unit)], resultLine('u_B', u.b, 2),
        angular ? '该项已经是换算到θ的仪器标准不确定度，不再除以√3。' : '')
      add('combined', '合成标准不确定度', ['u_c=√(u_A²+u_B²)'],
        u.a == null || u.b == null ? [] : ['u_c=√((' + num(u.a) + ')²+(' + num(u.b) + ')²)' + unit], resultLine('u_c', u.combined))
      add('reported', '计算报告用的扩展不确定度', ['U=' + u.coverageFactor + 'u_c'],
        u.combined == null ? [] : ['U=' + u.coverageFactor + '×' + num(u.combined) + unit], resultLine('U', u.reported, 2),
        '结果值与不确定度使用同一单位，最终不确定度取2位有效数字。')
    }
  } else {
    reason = '由本实验的测量公式逐项传播，以下列出各输入量的具体敏感系数及数值代入。各输入量按独立量处理。'
    const all = raw.uncertainty.components.filter(c => c.sensitivity !== 0)
    const contributionSymbols = [], contributions = []
    all.forEach((c, index) => {
      const spec = recipe && recipe.terms[c.name]
      const x = spec ? spec.symbol : 'x' + (index + 1), inputScale = spec ? spec.scale : 1, inputUnit = spec ? spec.unit : ''
      const coefficient = c.sensitivity * r.scale / inputScale, inputU = c.u == null ? null : c.u * inputScale
      const contribution = inputU == null ? null : Math.abs(coefficient * inputU), cs = 'c_' + (index + 1)
      contributionSymbols.push(cs); contributions.push(contribution)
      const derivative = spec ? spec.derivative : '∂' + symbol + '/∂' + x
      const coefficientUnit = inputUnit ? '(' + r.unit + ')/(' + inputUnit + ')' : r.unit
      const note = inputU == null ? '该输入项不确定度尚未给出，不能作为0处理。' : 'u(' + x + ')=' + num(inputU) + (inputUnit ? ' ' + inputUnit : '') + '；敏感系数已换算为' + coefficientUnit + '。' + (inputU === 0 ? '本项输入的不确定度为0，因此当前传播贡献为0。' : '')
      add('term-' + index, c.name + '的传播项', [cs + '=|' + derivative + '|·u(' + x + ')'],
        contribution == null ? [] : [cs + '=|' + num(coefficient) + '|×' + num(inputU) + unit], resultLine(cs, contribution), note,
        { symbol: x, coefficient, inputU, inputUnit, contribution, unit: r.unit, concrete: !!spec })
    })
    const symbolicSum = contributionSymbols.map(s => '(' + s + ')²').join('+')
    const squaredSum = complete ? u.combined * u.combined : null
    const sumText = complete ? squareText(u.combined) : null
    add('sum', '求传播项的平方和', ['S=' + (symbolicSum || '0')],
      complete ? [quantityLine('S=' + (contributions.map(c => '(' + num(c) + ')²').join('+') || '0'), r.unit ? ' (' + r.unit + ')²' : '')] : [],
      sumText == null ? null : line('S=' + sumText + (r.unit ? ' (' + r.unit + ')²' : '')),
      '各cᵢ已经是当前结果单位，先求平方和，再开方。', { squaredSum: Number.isFinite(squaredSum) && (squaredSum !== 0 || u.combined === 0) ? squaredSum : null })
    add('combined', '计算合成标准不确定度', ['u_c(' + symbol + ')=√(S)'],
      sumText == null ? [] : ['u_c(' + symbol + ')=√(' + sumText + ')' + unit], resultLine('u_c(' + symbol + ')', u.combined))
    add('reported', '计算报告用的扩展不确定度', ['U(' + symbol + ')=' + u.coverageFactor + 'u_c(' + symbol + ')'],
      u.combined == null ? [] : ['U(' + symbol + ')=' + u.coverageFactor + '×' + num(u.combined) + unit], resultLine('U(' + symbol + ')', u.reported, 2),
      '传播时使用同一覆盖层次的输入分量；最终报告值在合成后处理。')
  }
  if (!complete) reason += ' 当前还缺：' + u.missing.join('、') + '；仅展示已知项与公式，不输出完整总不确定度。'
  return { kind, symbol, complete, reason, facts, steps,
    referenceTitle: u.singleMeasurementRule ? '一般重复测量公式（本组未采用）' : '',
    referenceNote: u.singleMeasurementRule ? '存在读数散布的多次测量采用下列公式；本组按上面的单次规则报告，不重复套用。' : '',
    referenceFormulas: u.singleMeasurementRule ? ['u_A=tₚ·s/√(n)', 'u_B=Δ_ins/√(3)', 'U=2√(u_A²+u_B²)'].map(line) : [],
  }
}
module.exports = { uncertaintyDetails }
