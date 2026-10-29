const { gridView } = require('./report-tables')
const { significantText } = require('./report-precision')
const { formula, row, text, fraction, identify } = require('./formula-layout')
const { displayResult, unitNote } = require('./report-units')
const { uncertaintyDetails } = require('./uncertainty-presentation')

function percentMath(numerator, denominator, suffix = '') {
  return identify(row([text('E₀ = '), fraction(formula(numerator), formula(denominator)), text(' × 100%' + suffix)]))
}

const display = value => value == null ? '—' : typeof value === 'number' ? significantText(value, 4) : String(value)
function reportView(report, settings = []) {
  const locations = {}
  settings.forEach(f => { locations['options.' + f.path] = f.label })
  const definition = require('./experiment-forms').definitions[report.experiment.id]
  if (definition) {
    definition.parameters.forEach(p => { locations['parameters.' + p.key] = p.label })
    definition.tables.forEach(t => { locations['tables.' + t.id] = t.title })
    const parameterSources = { 'limits.extensionMm': 'extensionLimitMm', 'limits.diameterMm': report.experiment.id === 'young-modulus' ? 'diameterLimit' : 'diameterLimitMm',
      'limits.resistanceReadingOhm': 'resistanceLimitOhm', 'limits.massKg': 'massLimitKg', 'limits.differenceMm': 'division',
      'limits.distanceCm': 'distanceLimitCm', 'limits.fringeSpanMm': 'fringeSpanLimitMm', 'limits.image1Mm': 'image1LimitMm', 'limits.image2Mm': 'image2LimitMm',
      'limits.leverDistanceM': 'leverDistanceLimitM', 'limits.leverArmM': 'leverArmLimitM', leverDistanceM: 'leverDistanceM', leverArmM: 'leverArmM',
      'components.a': 'componentA', 'components.b': 'componentB', excitationCoefficientTA: 'excitationCoefficientTA', excitationCurrentA: 'excitationCurrentA' }
    Object.keys(parameterSources).forEach(key => { const label = locations['parameters.' + parameterSources[key]]; if (label) locations['options.' + key] = label })
  }
  const locate = path => {
    if (locations[path]) return locations[path]
    const key = Object.keys(locations).filter(key => path.startsWith(key + '.') || path.startsWith(key + '[')).sort((a, b) => b.length - a.length)[0]
    return key ? locations[key] : path.startsWith('options.graphical.') ? '人工图解选点' : path.startsWith('results.') ? '结果所需的不确定度' : '原始数据或计算条件'
  }
  return {
    status: report.status, kind: report.kind, reportReady: report.reportReady,
    unitNote: unitNote(report.experiment.id),
    statusTitle: report.status === 'invalid' ? '有数据需要修正' : report.status === 'partial' ? '已完成部分处理，请核对测量记录' : report.kind === 'observation' ? '实验记录已整理' : '计算完成',
    issues: report.issues.map((issue, i) => ({ id: i, message: issue.message, where: locate(issue.path), severity: issue.severity })),
    results: report.results.map(r => {
      const shown = displayResult(report.experiment.id, r)
      return { id: r.id, label: r.label.replace(/single-arm/g, '单臂').replace(/full-bridge/g, '全桥'), expression: r.formatted.expression, formula: r.formula, expanded: false,
      valueMath: formula(r.formatted.expression), formulaMath: formula(r.formula),
      comparisonMath: r.percentDifference == null ? null : percentMath('|x̄−x₀|', '|x₀|'),
      comparisonSubstitution: r.percentDifference == null ? null : percentMath(significantText(Math.abs(shown.value - shown.reference)), significantText(Math.abs(shown.reference)), ' = ' + significantText(r.percentDifference, 2) + '%'),
      relativeUncertaintyMath: !r.uncertainty || !r.uncertainty.complete || r.value === 0 ? null : identify(row([text('E(x) = '), fraction(text(r.uncertainty.singleMeasurementRule ? 'u_B' : 'U(x)'), text('|x̄|')), text(' × 100% = ' + significantText(Math.abs(r.uncertainty.reported / r.value) * 100, 2) + '%')])),
      relativeUncertaintySubstitution: !r.uncertainty || !r.uncertainty.complete || r.value === 0 ? null : identify(row([text('E(x) = '), fraction(text(significantText(shown.uncertainty.reported) + ' ' + shown.unit), text(significantText(Math.abs(shown.value)) + ' ' + shown.unit)), text(' × 100%')])),
      uncertaintyMath: uncertaintyDetails(report, r),
      relativeUncertainty: r.uncertainty && r.uncertainty.complete && r.value !== 0 ? significantText(Math.abs(r.uncertainty.reported / r.value) * 100, 2) + '%' : '',
      percentDifference: r.percentDifference == null ? '' : significantText(r.percentDifference, 2) + '%',
      selectionNote: !r.selectedData ? '' : r.selectedData.sourceRow ? '程序选中原表第' + r.selectedData.sourceRow + '行：f=' + significantText(r.selectedData.frequencyKHz) + ' kHz，U=' + significantText(r.selectedData.voltageV) + ' V。' : '本项所用原始数据：第' + r.selectedData.row + '行' + (r.selectedData.cycle ? '，第' + r.selectedData.cycle + '次循环' : '') + '。',
      method: r.method === 'graphical' ? r.fit && r.fit.automatic ? '程序辅助图解' : '图解' : r.method === 'least-squares' ? '最小二乘回归' : '',
      uncertaintyNote: r.uncertainty && !r.uncertainty.complete ? '不确定度条件尚未齐备，当前数值为部分结果。' : '',
      comparison: r.percentDifference == null ? '' : '参考值：' + display(shown.reference) + ' ' + shown.unit }
    }),
    sourceTables: (report.reportTables || []).map((t, i) => {
      const grid = gridView(t, i, false)
      return { id: t.id, title: t.title, sourceNumber: t.sourceNumber, width: grid.width, height: grid.height, displayCells: grid.displayCells }
    }),
    tables: report.tables.map(t => ({ id: t.id, title: t.title, width: Math.max(600, t.columns.length * 220),
      headings: t.columns.map(c => c.label + (c.unit ? ' / ' + c.unit : '')),
      rows: t.rows.map((row, i) => ({ id: i, cells: t.columns.map(c => display(row[c.key])) })) })),
    graphSelections: report.steps.filter(s => s.fit && s.fit.automatic && s.fit.selectedPoints).filter((s, i, all) => all.findIndex(other => other.fit === s.fit || JSON.stringify(other.fit.selectedPoints) === JSON.stringify(s.fit.selectedPoints)) === i).map(s => {
      const fit = s.fit, chart = report.charts.find(chart => chart.series.some(series => series.points.some(p => fit.selectedPoints.some(q => p.x === q.x && p.y === q.y))))
      const first = fit.selectedPoints[0], second = fit.selectedPoints[1], third = fit.selectedPoints[2] || first
      return { id: s.id, title: chart ? chart.title : s.label, rule: fit.selectionRule,
        sourceRows: fit.sourceRows ? fit.sourceRows.join('、') : '',
        axes: chart ? 'x：' + chart.xAxis.label + ' / ' + chart.xAxis.unit + '；y：' + chart.yAxis.label + ' / ' + chart.yAxis.unit : '',
        points: fit.selectedPoints.map((p, i) => ({ label: p.label || 'P' + (i + 1), x: significantText(p.x), y: significantText(p.y) })),
        slopeMath: formula('b=(y₂−y₁)/(x₂−x₁)=' + significantText(fit.slope)),
        slopeSubstitution: identify(row([text('b = '), fraction(text(significantText(second.y - first.y)), text(significantText(second.x - first.x))), text(' = ' + significantText(fit.slope))])),
        interceptMath: formula('a=y₃−b·x₃=' + significantText(third.y - fit.slope * third.x)),
        substitution: { x1: first.x, y1: first.y, x2: second.x, y2: second.y } }
    }),
    charts: report.charts.map(chart => ({ id: chart.id, title: chart.title,
      instruction: chart.presentation === 'graph-paper' ? '请按实验要求在坐标纸上作图。' : '以下坐标可用于绘制实验曲线。',
      xLabel: chart.xAxis.label + (chart.xAxis.unit ? ' / ' + chart.xAxis.unit : ''),
      yLabel: chart.yAxis.label + (chart.yAxis.unit ? ' / ' + chart.yAxis.unit : ''),
      series: chart.series.map((s, i) => ({ id: s.id || i, label: s.label || '测量点', points: s.points.map((p, j) => ({ id: j, x: display(p.x), y: display(p.y) })) })) })),
    observations: report.observations, assumptions: report.assumptions, tasks: report.tasks, requirements: report.requirements,
  }
}

module.exports = { reportView }
