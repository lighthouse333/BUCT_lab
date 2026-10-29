// 纯计算工具；无微信、网络或文件系统依赖，可在小程序和Node中共用。
const { TP } = require('./spectral-analysis')

class CalculationError extends Error {
  constructor(code, message, path = '', severity = 'error') {
    super(message)
    this.code = code
    this.path = path
    this.severity = severity
  }
}

function numeric(value, path = '', rules = {}) {
  if (value == null || String(value).trim() === '') throw new CalculationError('MISSING_VALUE', '请补充数值', path, 'missing')
  const text = String(value).trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(Number(text))) {
    throw new CalculationError('INVALID_NUMBER', '须为有限的十进制数值', path)
  }
  const result = Number(text)
  if (rules.integer && !Number.isSafeInteger(result)) throw new CalculationError('INVALID_INTEGER', '须为安全范围内的整数', path)
  if (rules.positive && result <= 0) throw new CalculationError('NON_POSITIVE', '数值须大于0', path)
  if (rules.min != null && result < rules.min) throw new CalculationError('OUT_OF_RANGE', '数值须不小于' + rules.min, path)
  return result
}

function finite(value, label = '计算结果') {
  if (!Number.isFinite(value)) throw new CalculationError('NON_FINITE_RESULT', label + '超出数值范围，请检查量级与单位')
  return value
}

function mean(values) {
  if (!values.length || values.some(v => !Number.isFinite(v))) throw new CalculationError('EMPTY_SAMPLE', '需要有效测量数据')
  // 增量均值避免有限输入求和时过早溢出。
  return values.reduce((m, x, i) => finite(m + (x - m) / (i + 1)), 0)
}

function sample(values) {
  const average = mean(values)
  const variance = values.length < 2 ? null : finite(values.reduce((sum, x) => sum + (x - average) ** 2, 0) / (values.length - 1))
  if (variance === 0 && values.some(x => x !== average)) throw new CalculationError('VARIANCE_UNDERFLOW', '非零散布小于当前数值表示范围，请先换用合适单位')
  const sd = variance == null ? null : Math.sqrt(variance)
  const deviations = values.map((value, index) => ({ index: index + 1, value, deviation: value - average, squaredDeviation: (value - average) ** 2,
    exceedsThreeSigma: sd == null ? false : Math.abs(value - average) > 3 * sd }))
  return { n: values.length, mean: average, variance, sd,
    sem: variance == null ? null : Math.sqrt(variance / values.length), min: Math.min(...values), max: Math.max(...values),
    sumSquaredDeviations: finite(deviations.reduce((sum, d) => sum + d.squaredDeviation, 0)),
    threeSigmaThreshold: sd == null ? null : 3 * sd, deviations }
}

const flatMap = (values, callback) => values.reduce((all, value, index) => all.concat(callback(value, index)), [])

function decimalDifference(a, b) {
  finite(a); finite(b)
  const places = value => {
    const parts = String(value).toLowerCase().split('e')
    return Math.max(0, ((parts[0].split('.')[1] || '').length) - Number(parts[1] || 0))
  }
  const digits = Math.max(places(a), places(b))
  const scale = 10 ** digits
  // 常见毫米/厘米读数用安全整数作差，避免51.x相减产生不同的末位噪声，
  // 进而错误改变“多次结果相同”的课程不确定度分支。超精细输入仍保留浮点精度。
  if (digits <= 12 && Number.isSafeInteger(Math.round(a * scale)) && Number.isSafeInteger(Math.round(b * scale))) {
    return finite((Math.round(a * scale) - Math.round(b * scale)) / scale)
  }
  return finite(a - b)
}

function combineUncertainty(terms, options = {}) {
  const k = options.coverageFactor == null ? 2 : numeric(options.coverageFactor, 'options.coverageFactor', { positive: true })
  const active = terms.filter(t => t.derivative !== 0)
  const complete = active.every(t => t.u != null && Number.isFinite(t.u) && t.u >= 0)
  const known = finite(Math.hypot(...active.filter(t => t.u != null).map(t => finite(t.derivative * t.u))))
  return { complete, combined: complete ? known : null, known, expanded: complete ? finite(k * known) : null,
    reported: complete ? finite(k * known) : null, coverageFactor: k, policy: options.policy || 'course',
    components: terms.map(t => ({ name: t.name, sensitivity: t.derivative, u: t.u == null ? null : t.u })),
    missing: active.filter(t => t.u == null).map(t => t.name) }
}

function measurement(values, limit = null, options = {}) {
  const stats = sample(values)
  const policy = options.policy || 'course'
  if (!['course', 'standard'].includes(policy)) throw new CalculationError('UNKNOWN_UNCERTAINTY_POLICY', '不确定度口径只能为course或standard', 'options.uncertaintyPolicy')
  if (limit != null) limit = numeric(limit, 'instrumentLimit', { min: 0 })
  const single = stats.n === 1 || stats.min === stats.max
  const tp = policy === 'standard' ? 1 : (TP[stats.n] == null ? null : TP[stats.n])
  const a = single ? 0 : tp == null ? null : tp * stats.sem
  const b = limit == null ? null : limit / (single && policy === 'course' ? 1 : Math.sqrt(3))
  const uncertainty = combineUncertainty([{ name: 'A类项', derivative: 1, u: a }, { name: '仪器项', derivative: 1, u: b }], { ...options, policy })
  Object.assign(uncertainty, { a, b, tp, instrumentLimit: limit, singleMeasurementRule: single && policy === 'course' })
  if (uncertainty.singleMeasurementRule) {
    // 教材P21单次/同值读数按Δ_ins报告，不再将这一报告值翻倍。
    uncertainty.expanded = null
    uncertainty.coverageFactor = 1
    uncertainty.reported = uncertainty.combined
  }
  return { ...stats, uncertainty }
}

function scaledUncertainty(uncertainty, factor) {
  const result = { ...uncertainty }
  for (const key of ['combined', 'known', 'expanded', 'reported', 'a', 'b', 'instrumentLimit']) {
    if (result[key] != null) result[key] = finite(result[key] * Math.abs(factor))
  }
  if (result.components) result.components = result.components.map(c => ({ ...c, sensitivity: c.sensitivity * factor }))
  return result
}

function fitLine(points) {
  if (!Array.isArray(points) || points.length < 2) throw new CalculationError('INSUFFICIENT_POINTS', '至少需要两个作图/拟合点', '', 'missing')
  const xs = points.map(p => numeric(p.x)), ys = points.map(p => numeric(p.y))
  const xMean = mean(xs), yMean = mean(ys)
  const sxx = finite(xs.reduce((s, x) => s + (x - xMean) ** 2, 0))
  if (sxx <= 0) throw new CalculationError('DEGENERATE_X', '横坐标全相同，不能求斜率')
  const sxy = finite(xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0))
  const syy = finite(ys.reduce((s, y) => s + (y - yMean) ** 2, 0))
  const slope = finite(sxy / sxx), intercept = finite(yMean - slope * xMean)
  const residuals = xs.map((x, i) => ({ x, y: ys[i], fitted: finite(intercept + slope * x), residual: finite(ys[i] - intercept - slope * x) }))
  const sse = finite(residuals.reduce((s, p) => s + p.residual ** 2, 0))
  const residualVariance = points.length > 2 ? sse / (points.length - 2) : null
  return { method: 'least-squares', n: points.length, slope, intercept, xMean, yMean, sxx, sxy, syy, sse,
    r: syy === 0 ? null : Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx) / Math.sqrt(syy))),
    rSquared: syy === 0 ? null : Math.max(0, Math.min(1, 1 - sse / syy)),
    slopeStandardError: residualVariance == null ? null : Math.sqrt(residualVariance / sxx),
    residuals, range: [Math.min(...xs), Math.max(...xs)] }
}

function graphicalLine(points, path) {
  if (!Array.isArray(points) || points.length !== 2) throw new CalculationError('GRAPHICAL_POINTS_REQUIRED', '请提供人工趋势线上选定的两个点；不以回归代替图解法', path, 'missing')
  if (points.some(p => !p || typeof p !== 'object' || Array.isArray(p))) throw new CalculationError('INVALID_GRAPHICAL_POINT', '每个图解点须为{x,y}对象', path)
  const result = fitLine(points.map((p, i) => ({ x: numeric(p.x, path + '[' + i + '].x'), y: numeric(p.y, path + '[' + i + '].y') })))
  return { ...result, method: 'graphical', selectedPoints: points.map(p => ({ x: Number(p.x), y: Number(p.y) })) }
}

function automaticGraphicalLine(points) {
  const trend = fitLine(points)
  const min = trend.range[0], span = trend.range[1] - min
  const xs = points.map(p => Number(p.x))
  const nonDataX = fraction => {
    for (let i = 0; i < 40; i++) {
      const x = min + span * (fraction + i * 0.000137)
      if (!xs.some(original => Math.abs(original - x) < span * 1e-10)) return x
    }
    throw new CalculationError('GRAPH_POINT_SELECTION', '无法在趋势线上选取非测量点')
  }
  const selected = [.13, .87, .47].map((fraction, index) => {
    const x = nonDataX(fraction)
    return { label: ['P₁', 'P₂', 'P₃'][index], x, y: finite(trend.intercept + trend.slope * x), source: 'trend-line', isMeasurement: false }
  })
  const line = fitLine(selected.slice(0, 2))
  return { ...line, method: 'graphical', automatic: true, selectedPoints: selected, trend,
    selectionRule: '教材P38–39：在趋势线上取相距较远的两个非测量点P₁、P₂求斜率；用第三个非测量点P₃求截距。程序以全部实测点最小二乘趋势线辅助实现，未将选点伪装成原始测量值。' }
}

function percentDifference(value, reference) {
  const baseline = numeric(reference, 'reference')
  if (baseline === 0) throw new CalculationError('ZERO_REFERENCE', '百分差的参考值不能为0', 'reference')
  return finite(Math.abs(value - baseline) / Math.abs(baseline) * 100)
}

function fmt(value) {
  return value == null ? '待补充' : Number(value.toPrecision(10)).toString()
}

function formatQuantity(value, unit, uncertainty) {
  return require('./report-precision').quantityText(value, unit, uncertainty)
}

module.exports = { CalculationError, numeric, finite, mean, sample, measurement, combineUncertainty, scaledUncertainty, decimalDifference,
  fitLine, graphicalLine, automaticGraphicalLine, percentDifference, fmt, formatQuantity, flatMap }
