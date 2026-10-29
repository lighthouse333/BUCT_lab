const { CalculationError, numeric, finite, measurement, combineUncertainty, scaledUncertainty, fitLine, graphicalLine, automaticGraphicalLine, fmt, percentDifference } = require('./report-math')

class ReportContext {
  constructor(input, options, report) { this.input = input; this.p = input.parameters || {}; this.options = options; this.report = report }
  issue(code, message, path = '', severity = 'missing') {
    if (!this.report.issues.some(i => i.code === code && i.path === path && i.message === message)) this.report.issues.push({ code, message, path, severity })
  }
  run(id, callback) {
    try { return callback() } catch (e) {
      if (!(e instanceof CalculationError)) throw e
      this.issue(e.code, e.message, e.path || id, e.severity)
      return null
    }
  }
  param(key, rules = {}) { return numeric(this.p[key], 'parameters.' + key, rules) }
  option(key, rules = {}) { return numeric(this.options[key], 'options.' + key, rules) }
  limit(key, fallback = null) {
    const v = (this.options.limits || {})[key]
    if ((v == null || v === '') && fallback == null) this.issue('INSTRUMENT_LIMIT_REQUIRED', '请补充相应测量量的仪器误差限：' + key, 'options.limits.' + key)
    return v == null || v === '' ? fallback : numeric(v, 'options.limits.' + key, { min: 0 })
  }
  choice(key, choices) {
    const value = this.options[key]
    if (value == null || value === '') throw new CalculationError('MODEL_REQUIRED', '请选择' + key + '：' + choices.join(' / '), 'options.' + key, 'missing')
    if (!choices.includes(value)) throw new CalculationError('UNKNOWN_MODEL', key + '不属于支持的选项：' + choices.join(' / '), 'options.' + key)
    const descriptions = {
      extensionModel: { direct: '以真实伸长量计算杨氏模量。', 'optical-lever': '按教材光杠杆公式计算杨氏模量，使用实测镜尺距离D和光杠杆常数b。' },
      sliderAssembly: { 'tray-removed': '按教材测细杆时卸下托盘处理。', 'tray-retained': '计算细杆滑块惯量时扣除保留托盘的惯量。' },
      sliderMassReference: { single: '天平参考值为单块滑块质量。', pair: '天平参考值为两块滑块总质量。' },
      lissajousStep: { 'same-phase': '按教材每次记录同向直线重复位置，间隔为一个波长。', 'alternating-line': '每次直线出现均记录，间隔为半个波长。' },
      instrumentLimitTarget: { difference: '仪器误差限对应镜面位移差。', 'single-reading': '仪器误差限对应单次镜位置，两个位置对位移差的影响按独立量合成。' },
      countUncertaintyKind: { 'expanded-relative': '原单0.5%计数项按报告层次的相对不确定度处理，除2换为标准分量再合成；原单没有进一步说明覆盖含义，此项为程序的固定约定。', 'standard-relative': '计数项作为标准相对分量合成。' },
    }
    const description = (descriptions[key] || {})[value]
    if (description) this.assume(description)
    return value
  }
  rows(id, keys, options = {}) {
    const t = (this.input.tables || []).find(t => t.id === id)
    if (!t) throw new CalculationError('MISSING_TABLE', '缺少数据表：' + id, 'tables.' + id, 'missing')
    if (!Array.isArray(t.rows)) throw new CalculationError('INVALID_TABLE', '表格rows须为数组', 'tables.' + id)
    const entries = t.rows.map((row, index) => ({ row, index }))
    const source = options.skipEmpty ? entries.filter(entry => keys.some(k => entry.row[k] != null && String(entry.row[k]).trim() !== '')) : entries
    if (source.length < (options.min || 1)) throw new CalculationError('INSUFFICIENT_ROWS', id + '测量记录不足', 'tables.' + id, 'missing')
    if (options.count != null && source.length !== options.count) throw new CalculationError('ROW_COUNT', id + '须有' + options.count + '组记录', 'tables.' + id)
    return source.map(({ row, index }) => {
      const result = { sourceRow: row.number == null ? index + 1 : numeric(row.number, 'tables.' + id + '.rows[' + index + '].number', { positive: true, integer: true }) }
      keys.forEach(key => { result[key] = numeric(row[key], 'tables.' + id + '.rows[' + index + '].' + key, (options.rules || {})[key] || {}) })
      return result
    })
  }
  rawRows(id) { return ((this.input.tables || []).find(t => t.id === id) || { rows: [] }).rows }
  table(id, title, columns, rows) { this.report.tables.push({ id, title, columns: columns.map(c => typeof c === 'string' ? { key: c, label: c, unit: '' } : c), rows }); return rows }
  metric(id, label, value, unit, formula, details = {}) {
    finite(value, label)
    const item = { id, label, value, unit, formula, ...details, display: fmt(value) + (unit ? ' ' + unit : '') }
    if (details.reference != null) item.percentDifference = percentDifference(value, details.reference)
    this.report.results.push(item)
    this.report.steps.push({ id, label, formula, value, unit, method: details.method || 'formula', inputs: details.inputs || {},
      ...(details.fit ? { fit: details.fit } : {}) })
    if (details.uncertainty && !details.uncertainty.complete) this.issue('UNCERTAINTY_INCOMPLETE', label + '不确定度未齐备：' + details.uncertainty.missing.join('、'), 'results.' + id + '.uncertainty')
    return item
  }
  estimate(id, label, values, limit, unit, scale = 1) {
    const e = measurement(values, limit, { policy: this.options.uncertaintyPolicy || 'course', coverageFactor: this.options.coverageFactor })
    const uncertainty = scaledUncertainty(e.uncertainty, scale)
    this.metric(id, label, e.mean * scale, unit, 'x̄=Σxᵢ/n', { uncertainty,
      statistics: { ...e, inputToOutputScale: scale, outputUnit: unit },
      inputs: { count: values.length, instrumentLimit: limit, inputToOutputScale: scale } })
    return { ...e, value: e.mean * scale, u: uncertainty.combined, uncertainty }
  }
  propagate(terms) { return combineUncertainty(terms, { policy: this.options.uncertaintyPolicy || 'course', coverageFactor: this.options.coverageFactor }) }
  fit(id, points, plotId) {
    const f = fitLine(points)
    this.report.steps.push({ id, label: id + '最小二乘', method: 'least-squares', formula: 'b=S_xy/S_xx; a=ȳ−bx̄', fit: f })
    if (plotId) this.addLine(plotId, id, f)
    return f
  }
  graph(id, key, plotId) {
    const manual = (this.options.graphical || {})[key]
    const chart = this.report.charts.find(c => c.id === plotId)
    const points = chart && chart.series.find(s => s.type === 'points')
    const f = manual ? graphicalLine(manual, 'options.graphical.' + key) : automaticGraphicalLine(points ? points.points : [])
    this.report.steps.push({ id, label: id + (f.automatic ? '自动辅助图解' : '图解'), method: 'graphical', formula: 'b=(y₂−y₁)/(x₂−x₁)', fit: f })
    if (plotId) this.addLine(plotId, id, f)
    if (f.automatic && chart) chart.series.push({ id: id + '-selected', label: '程序选取的图解点P₁/P₂/P₃', type: 'selected-points', points: f.selectedPoints })
    return f
  }
  chart(id, title, xLabel, xUnit, yLabel, yUnit, series, presentation = 'computer') {
    const chart = { id, title, xAxis: { label: xLabel, unit: xUnit }, yAxis: { label: yLabel, unit: yUnit }, presentation,
      series: series.map(s => ({ type: 'points', ...s })) }
    this.report.charts.push(chart); return chart
  }
  addLine(plotId, id, fit) {
    const chart = this.report.charts.find(c => c.id === plotId)
    if (chart) chart.series.push({ id, label: fit.method === 'graphical' ? fit.automatic ? '程序辅助图解趋势线' : '图解趋势线' : '最小二乘拟合线', type: 'line', method: fit.method,
      points: fit.range.map(x => ({ x, y: finite(fit.intercept + fit.slope * x) })) })
  }
  assume(text) { if (!this.report.assumptions.includes(text)) this.report.assumptions.push(text) }
  manual(id, label) { this.report.tasks.push({ id, label, status: 'manual' }) }
  requirePositive(value, path) { return numeric(value, path, { positive: true }) }
}

module.exports = { ReportContext }
