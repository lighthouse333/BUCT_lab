const { definitions } = require('./experiment-forms')
const { experiments } = require('./experiments')
const { requirements } = require('./experiment-requirements')
const { ReportContext } = require('./report-context')
const { CalculationError, numeric } = require('./report-math')
const { reportQuantity, displayResult } = require('./report-units')
const { uncertaintyDetails } = require('./uncertainty-presentation')
const calculators = {
  ...require('./calculators/mechanics'),
  ...require('./calculators/electricity'),
  ...require('./calculators/thermal'),
  ...require('./calculators/optics'),
}

function cloneData(value) {
  if (value === undefined) throw new CalculationError('NON_JSON_INPUT', '接口只接受普通JSON数据', 'input')
  const ancestors = new Set()
  function inspect(item, path, depth = 0) {
    if (depth > 50) throw new CalculationError('INPUT_TOO_DEEP', '数据嵌套超过允许深度', path)
    if (item == null || ['string', 'boolean'].includes(typeof item)) return
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new CalculationError('INVALID_NUMBER', '输入不能包含NaN或Infinity', path)
      return
    }
    if (typeof item !== 'object' || (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)) throw new CalculationError('NON_JSON_INPUT', '接口只接受普通JSON数据', path)
    if (ancestors.has(item)) throw new CalculationError('CYCLIC_INPUT', '输入不能包含循环引用', path)
    ancestors.add(item)
    Object.keys(item).forEach(key => inspect(item[key], path + '.' + key, depth + 1))
    ancestors.delete(item)
  }
  inspect(value, 'input')
  return JSON.parse(JSON.stringify(value))
}

function baseReport() {
  return { reportSchemaVersion: 2, formulaVersion: '2026-10-28-report', inputSchemaVersion: null, experiment: null,
    status: 'partial', kind: 'quantitative', reportReady: false, reportFinished: false,
    info: {}, rawInput: null, processingOptions: {}, assumptions: [], issues: [], results: [], tables: [], charts: [],
    steps: [], observations: [], referenceMaterial: [], rawTableSchemas: [], reportTables: [], tasks: [], requirements: { processing: [], submission: [], notes: [] } }
}

function validateShape(input, options) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CalculationError('INVALID_INPUT', '输入须为原始实验数据对象')
  if (input.schemaVersion !== 3) throw new CalculationError('UNSUPPORTED_INPUT_VERSION', '仅接受报告处理表schemaVersion=3；旧版单缝扫描表、声速合表等须重新按报告表填写，不能直接混算', 'schemaVersion')
  if (!calculators[input.experimentId] || !experiments.some(e => e.id === input.experimentId)) throw new CalculationError('UNKNOWN_EXPERIMENT', '未支持的实验名称标识', 'experimentId')
  if (!input.parameters || typeof input.parameters !== 'object' || Array.isArray(input.parameters)) throw new CalculationError('INVALID_PARAMETERS', 'parameters须为参数对象', 'parameters')
  if (!Array.isArray(input.tables)) throw new CalculationError('INVALID_TABLES', 'tables须为数组', 'tables')
  if (input.info != null && (typeof input.info !== 'object' || Array.isArray(input.info))) throw new CalculationError('INVALID_INFO', 'info须为实验信息对象', 'info')
  if (input.tables.some(t => !t || typeof t !== 'object' || typeof t.id !== 'string' || !Array.isArray(t.rows) || t.rows.some(r => !r || typeof r !== 'object' || Array.isArray(r)))) throw new CalculationError('INVALID_TABLES', '每张表须有id及对象行数组rows', 'tables')
  const ids = input.tables.map(t => t.id)
  if (new Set(ids).size !== ids.length) throw new CalculationError('DUPLICATE_TABLE', '同一数据表id不能重复', 'tables')
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new CalculationError('INVALID_OPTIONS', '计算补充条件须为对象', 'options')
  if (options.uncertaintyPolicy != null && !['course', 'standard'].includes(options.uncertaintyPolicy)) throw new CalculationError('UNKNOWN_UNCERTAINTY_POLICY', '不确定度口径只能为course或standard', 'options.uncertaintyPolicy')
  if (options.coverageFactor != null) numeric(options.coverageFactor, 'options.coverageFactor', { positive: true })
  const definition = definitions[input.experimentId]
  if (definition && definition.modes && !definition.modes.some(m => m.id === input.mode)) throw new CalculationError('UNKNOWN_MODE', '请选择该实验支持的记录方案', 'mode')
  const allowed = definition ? definition.tables.filter(t => !t.modes || t.modes.includes(input.mode)).map(t => t.id) : ['spectral-readings']
  if (ids.some(id => !allowed.includes(id))) throw new CalculationError('UNEXPECTED_TABLE', '输入含不属于当前实验/方案的表格', 'tables')
}

function validateProvidedValues(c) {
  const def = definitions[c.input.experimentId]
  if (!def) return
  const check = (value, field, path) => {
    // 缺数交给各计算分支列待补项；此处先发现所有已给但不合法的数值。
    if (value != null && String(value).trim() !== '' && field.kind === 'number') c.run(path, () => numeric(value, path, field))
  }
  def.parameters.filter(p => !p.modes || p.modes.includes(c.input.mode)).forEach(p => check(c.p[p.key], p, 'parameters.' + p.key))
  def.tables.filter(t => !t.modes || t.modes.includes(c.input.mode)).forEach(t => {
    if (t.columns.some(c => c.kind === 'number' || c.kind === 'text') && !c.input.tables.some(inputTable => inputTable.id === t.id)) c.issue('MISSING_TABLE', '缺少测量输入表：' + t.title, 'tables.' + t.id)
  })
  c.input.tables.forEach(t => {
    const template = def.tables.find(d => d.id === t.id)
    if (!template) return
    if (!template.adjustable && t.rows.length !== template.rows.length) c.issue('ROW_COUNT', template.title + '应保留原表的' + template.rows.length + '组记录', 'tables.' + t.id, 'error')
    if (template.adjustable && t.rows.length > (template.maxRows || 60)) c.issue('ROW_LIMIT', template.title + '超过录入容量', 'tables.' + t.id, 'error')
    if (template.skipEmptyRows) {
      let lastNumber = 0
      t.rows.forEach((row, i) => {
        if (row.number == null) return
        c.run('tables.' + t.id, () => {
          const number = numeric(row.number, 'tables.' + t.id + '.rows[' + i + '].number', { positive: true, integer: true })
          if (number <= lastNumber || number > (template.maxRows || 60)) throw new CalculationError('INVALID_SOURCE_ROW', '原始序号须递增且在表格容量内，可保留未使用空行造成的间隔', 'tables.' + t.id)
          lastNumber = number
        })
      })
    }
    t.rows.forEach((row, r) => template.columns.forEach((field, column) => {
      const path = 'tables.' + t.id + '.rows[' + r + '].' + field.key
      check(row[field.key], field, path)
      if (field.kind === 'computed' && row[field.key] != null) c.issue('COMPUTED_INPUT', '计算列不能作为测量输入，请只传递实际测量值', path, 'error')
      if (field.kind !== 'fixed' || row[field.key] == null) return
      if (field.key === 'number' && template.skipEmptyRows) return
      const original = (template.rows[r] || [])[column]
      const expected = original == null && field.key === 'number' ? String(r + 1) : original
      if (expected != null && String(row[field.key]) !== String(expected)) c.issue('FIXED_TEMPLATE_CHANGED', '原表固定字段' + field.key + '与模板不一致', path, 'error')
    }))
  })
}

function ensureFiniteOutput(report) {
  let failed = false
  function visit(item, path) {
    if (!item || typeof item !== 'object') return
    Object.keys(item).forEach(key => {
      const value = item[key]
      if (typeof value === 'number' && !Number.isFinite(value)) {
        item[key] = null; failed = true
        report.issues.push({ code: 'NON_FINITE_RESULT', message: '计算数值越界，相关位置已置为不可用', path: path + '.' + key, severity: 'error' })
      } else if (key !== 'issues') visit(value, path + '.' + key)
    })
  }
  visit(report, 'report')
  return failed
}

function calculateReport(input, options = {}) {
  const report = baseReport()
  try {
    const snapshot = cloneData(input), provided = cloneData(options)
    validateShape(snapshot, provided)
    const defaults = require('./textbook-profile').textbookOptions(snapshot)
    const settings = cloneData({ ...defaults, ...provided, limits: { ...defaults.limits, ...(provided.limits || {}) }, uncertaintyPolicy: 'course', coverageFactor: 2 })
    report.rawInput = snapshot
    report.processingOptions = settings
    report.inputSchemaVersion = snapshot.schemaVersion
    const experiment = experiments.find(e => e.id === snapshot.experimentId)
    report.experiment = { id: experiment.id, name: experiment.name, category: experiment.category }
    report.info = snapshot.info || {}
    report.requirements = cloneData(requirements[snapshot.experimentId] || { processing: [], submission: [], notes: [] })
    const def = definitions[snapshot.experimentId]
    if (def) {
      report.source = def.source
      report.tableBasis = def.reportBasis
      if (def.introSections) report.referenceMaterial.push({ kind: 'preprinted', sections: cloneData(def.introSections) })
      def.tables.filter(t => !t.modes || t.modes.includes(snapshot.mode)).forEach(t => {
        report.rawTableSchemas.push({ id: t.id, title: t.title, columns: cloneData(t.columns), layout: cloneData(t.layout || { type: 'vertical' }),
          fixedCells: cloneData(t.fixedCells || {}), sourceNumber: t.unnumbered ? '' : t.sourceNumber || String(def.tables.indexOf(t) + 1) })
        if (t.fixedCells) report.referenceMaterial.push({ kind: 'preprinted-cells', tableId: t.id, cells: { ...t.fixedCells } })
      })
    }
    const c = new ReportContext(snapshot, settings, report)
    validateProvidedValues(c)
    // 对无效实测值不继续输出可能误导的数值；输入结构正确但缺测量时可返回部分处理表。
    if (!report.issues.some(i => i.severity === 'error')) c.run(snapshot.experimentId, () => calculators[snapshot.experimentId](c))
    c.manual('actual-steps', '根据本人实际操作写实验步骤。')
    if (!def || !def.observationOnly) c.manual('analysis', '结合实际现象、数值、图表完成结果及误差分析；计算数据不等于报告已完成。')
    ensureFiniteOutput(report)
    report.reportTables = require('./report-tables').reportTables(snapshot, settings)
  } catch (error) {
    if (error instanceof CalculationError) report.issues.push({ code: error.code, path: error.path, message: error.message, severity: error.severity })
    else throw error
  }
  report.status = report.issues.some(i => i.severity === 'error') ? 'invalid' : report.issues.some(i => i.severity === 'missing') ? 'partial' : 'complete'
  report.reportReady = report.status === 'complete'
  report.results.forEach(r => { r.formatted = reportQuantity(report.experiment.id, r) })
  report.missingInputs = report.issues.filter(i => i.severity === 'missing').map(i => ({ code: i.code, path: i.path, message: i.message }))
  return report
}

function calculateFormReport(form, options = {}) {
  const { collectInput } = require('./experiment-input')
  if (!form || !form.experiment || !Array.isArray(form.tables) || !Array.isArray(form.parameters) || !Array.isArray(form.info)) return calculateReport(null, options)
  return calculateReport(collectInput(form), options)
}

function collectSpectralInput(data = {}) {
  data = data || {}
  return { schemaVersion: 3, templateVersion: '2026-10-28-report', experimentId: 'spectral-analysis', mode: '',
    info: { studentClass: data.studentClass || '', studentName: data.studentName || '', studentId: data.studentId || '', teacher: data.teacher || '', lineName: data.lineName || '' },
    parameters: { density: data.density, relativeGratingUncertainty: data.relativeGratingUncertainty, angularInstrumentUncertainty: data.angularInstrumentUncertainty || '', reference: data.reference || '',
      observedPhenomenon: data.observedPhenomenon || '', elementAnalysis: data.elementAnalysis || '' },
    tables: [{ id: 'spectral-readings', rows: (data.groups || []).map(g => ({ minusLeft: g.minusLeft, minusRight: g.minusRight, plusLeft: g.plusLeft, plusRight: g.plusRight })) }] }
}

function formatReport(report) {
  const fmt = require('./report-precision').significantText
  const text = [report.experiment ? report.experiment.name : '实验数据处理', '计算状态：' + ({ complete: '计算数据齐备', partial: '部分完成，存在待补项', invalid: '输入或计算有错误，请先修正' }[report.status] || report.status)]
  text.push('此输出用于整理实验报告，不表示实验报告或人工分析已完成。')
  Object.entries(report.info || {}).forEach(([key, value]) => { if (value) text.push(key + '：' + value) })
  if (report.issues.length) {
    text.push('\n需要核对/补充')
    report.issues.forEach(i => text.push('[' + i.severity + '] ' + i.message + (i.path ? '（' + i.path + '）' : '')))
  }
  if (report.assumptions.length) text.push('\n计算条件', ...report.assumptions.map(s => '· ' + s))
  for (const t of report.reportTables.length ? report.reportTables : report.tables) {
    text.push('\n' + (t.sourceNumber ? '表' + t.sourceNumber + ' ' : '') + t.title, t.columns.map(col => col.label + (col.unit ? '/' + col.unit : '')).join('\t'))
    t.rows.forEach(row => text.push(t.columns.map(col => {
      const value = row[col.key]
      return value == null ? '待补充/不适用' : typeof value === 'number' ? fmt(value) : String(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' / ')
    }).join('\t')))
    if (t.averages && Object.keys(t.averages).length) text.push('平均值：' + Object.entries(t.averages).map(([key, value]) => ((t.columns.find(c => c.key === key) || {}).label || key) + '=' + (value == null ? '待补充' : fmt(value))).join('；'))
  }
  text.push('\n计算结果与公式')
  for (const r of report.results) {
    const shown = displayResult(report.experiment.id, r)
    text.push(r.label + ' = ' + r.formatted.expression, '公式：' + r.formula)
    if (r.method) text.push('方法：' + (r.method === 'least-squares' ? '最小二乘回归' : r.fit && r.fit.automatic ? '程序辅助图解（教材趋势线非测量点）' : '图解'))
    if (r.inputs) text.push('代入参数：' + JSON.stringify(r.inputs))
    if (r.statistics) {
      const s = r.statistics
      const outputScale = s.inputToOutputScale * shown.scale
      if (s.inputToOutputScale != null && outputScale !== 1) text.push('统计量使用原始读数单位：均值、标准差、偏差乘' + fmt(outputScale) + '换为' + shown.unit + '；方差和偏差平方和乘' + fmt(outputScale ** 2) + '换为相应单位的平方。')
      text.push('统计：n=' + s.n + '；平均值=' + fmt(s.mean) + '；样本方差=' + fmt(s.variance) + '；标准差=' + fmt(s.sd) + '；均值标准差=' + fmt(s.sem))
      if (s.sumSquaredDeviations != null) text.push('偏差平方和=' + fmt(s.sumSquaredDeviations) + '；3s阈值=' + fmt(s.threeSigmaThreshold))
      if (s.deviations) s.deviations.forEach(d => text.push('第' + d.index + '次：值=' + fmt(d.value) + '；偏差=' + fmt(d.deviation) + '；偏差平方=' + fmt(d.squaredDeviation) + '；' + (d.exceedsThreeSigma ? '超过3s，仅标记待人工核对' : '未超过3s')))
    }
    if (r.percentDifference != null) text.push('百分差公式：E₀=|x̄−x₀|/|x₀|×100%', '参考值：' + fmt(shown.reference) + ' ' + shown.unit, '代入：E₀=' + fmt(Math.abs(shown.value - shown.reference)) + '/' + fmt(Math.abs(shown.reference)) + '×100%=' + fmt(r.percentDifference, 2) + '%')
    if (r.uncertainty) {
      const u = shown.uncertainty
      if (u.complete) text.push(u.singleMeasurementRule ? '报告不确定度=' + fmt(u.reported, 2) + ' ' + shown.unit + '（本组采用单次规则的u_B，不额外乘2）。' : '合成项u=' + fmt(u.combined) + ' ' + shown.unit + '；报告不确定度=' + fmt(u.reported, 2) + ' ' + shown.unit + '；按谢超然版教材处理。')
      else text.push('不确定度尚不完整；已知项合成值=' + fmt(u.known) + ' ' + shown.unit + '，不得作为完整总不确定度。')
      if (u.a != null || u.b != null) text.push('A类项=' + fmt(u.a) + ' ' + shown.unit + '；B类项=' + fmt(u.b) + ' ' + shown.unit + '；t_p=' + fmt(u.tp))
      if (u.complete && shown.value !== 0) text.push('相对不确定度公式：E(x)=' + (u.singleMeasurementRule ? 'u_B' : 'U(x)') + '/|x|×100%=' + fmt(Math.abs(u.reported / shown.value) * 100, 2) + '%（与百分差区分）')
      ;(u.components || []).forEach(term => text.push('传播分量：' + term.name + '；输入不确定度=' + fmt(term.u) + '；敏感系数=' + fmt(term.sensitivity)))
      const details = uncertaintyDetails(report, r)
      text.push('不确定度评定依据：' + details.reason, ...details.facts)
      details.steps.forEach((step, i) => {
        text.push((i + 1) + '. ' + step.title, ...step.formulas.map(e => '公式：' + e.source), ...step.substitutions.map(e => '代入：' + e.source))
        if (step.result) text.push('结果：' + step.result.source)
        if (step.note) text.push(step.note)
      })
      if (details.referenceFormulas.length) text.push(details.referenceTitle, details.referenceNote, ...details.referenceFormulas.map(e => e.source))
    }
    if (r.fit) text.push('拟合：斜率=' + fmt(r.fit.slope) + '；截距=' + fmt(r.fit.intercept) + '；r=' + fmt(r.fit.r) + '；R²=' + fmt(r.fit.rSquared))
    if (r.selectedData) text.push('极值所在原始格：' + JSON.stringify(r.selectedData))
  }
  const selections = report.steps.filter(s => s.fit && s.fit.automatic && s.fit.selectedPoints)
  const used = new Set()
  for (const s of selections) {
    const key = JSON.stringify(s.fit.selectedPoints)
    if (used.has(key)) continue
    used.add(key)
    text.push('\n自动图解选点：' + s.label, s.fit.selectionRule)
    s.fit.selectedPoints.forEach((p, i) => text.push((p.label || 'P' + (i + 1)) + '=(' + fmt(p.x) + ', ' + fmt(p.y) + ')，趋势线点，不是原始测量点'))
    text.push('斜率公式：b=(y₂−y₁)/(x₂−x₁)=' + fmt(s.fit.slope), '截距公式：a=y₃−b·x₃=' + fmt(s.fit.intercept))
  }
  for (const chart of report.charts) {
    text.push('\n作图数据：' + chart.title + '（' + chart.presentation + '）', 'X=' + chart.xAxis.label + '/' + chart.xAxis.unit + '；Y=' + chart.yAxis.label + '/' + chart.yAxis.unit)
    chart.series.forEach(series => { text.push(series.label || series.id); series.points.forEach(p => text.push(fmt(p.x) + '\t' + fmt(p.y))) })
  }
  if (report.observations.length) text.push('\n观察/分析记录', ...report.observations.map(o => o.text))
  text.push('\n人工报告任务', ...report.tasks.map(t => '· ' + t.label))
  for (const [key, title] of [['processing', '实验报告处理要求'], ['submission', '实验报告提交要求'], ['notes', '来源及待核对说明']]) {
    if ((report.requirements[key] || []).length) text.push('\n' + title, ...report.requirements[key].map(s => '· ' + s))
  }
  return text.join('\n')
}

function serializeReport(report, space = 2) { return JSON.stringify(report, null, space) }

module.exports = { calculateReport, calculateFormReport, collectSpectralInput, formatReport, serializeReport,
  supportedExperiments: Object.keys(calculators) }
