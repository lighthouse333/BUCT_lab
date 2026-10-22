const { experiments } = require('./experiments')
const { definitions } = require('./experiment-forms')
const { buildTableView } = require('./table-layout')
const { requirements } = require('./experiment-requirements')

const infoFields = [
  ['studentClass', '班级'], ['studentName', '姓名'], ['studentId', '学号'],
  ['date', '实验日期'], ['teacher', '指导教师'],
]
const toObject = pairs => pairs.reduce((result, [key, value]) => { result[key] = value; return result }, {})

function makeRow(definition, tableIndex, rowIndex, values = []) {
  return {
    id: 'row-' + rowIndex,
    cells: definition.columns.map((column, columnIndex) => ({
      ...column,
      id: `cell-${tableIndex}-${rowIndex}-${columnIndex}`,
      value: String(values[columnIndex] == null ? (column.key === 'number' ? rowIndex + 1 : '') : values[columnIndex]),
      error: '',
      ...(definition.fixedCells && Object.prototype.hasOwnProperty.call(definition.fixedCells, rowIndex + ':' + columnIndex)
        ? { kind: 'fixed', template: true, value: definition.fixedCells[rowIndex + ':' + columnIndex] } : {}),
    })),
  }
}

function createForm(experimentId) {
  const definition = definitions[experimentId]
  const experiment = experiments.find(item => item.id === experimentId)
  if (!definition || !experiment) return null
  const mode = definition.modes ? definition.modes[0].id : ''
  const report = requirements[experimentId] || { processing: [], submission: [], notes: [] }
  return {
    experiment: { id: experiment.id, name: experiment.name, category: experiment.category },
    note: definition.note,
    source: definition.source,
    introSections: definition.introSections || [],
    derivedParameters: (definition.derivedParameters || []).map(item => ({ ...item, value: '待填写支杆位置' })),
    observationOnly: !!definition.observationOnly,
    reportRequirements: report.processing.slice(),
    reportSubmission: report.submission.slice(),
    reportNotes: report.notes.slice(),
    reportSource: report.source || '',
    modes: definition.modes || [],
    mode,
    info: infoFields.map(([key, label]) => ({ key, label, value: '' })),
    parameters: definition.parameters.map((field, i) => ({ ...field, visible: !field.modes || field.modes.includes(mode), id: 'parameter-' + i, error: '' })),
    tables: definition.tables.map((item, tableIndex) => {
      const result = {
        id: item.id, title: item.title, columns: item.columns, hint: item.hint || '',
        layout: item.layout, skipEmptyRows: !!item.skipEmptyRows,
        sourceNumber: item.unnumbered ? '' : item.sourceNumber || String(tableIndex + 1),
        adjustable: !!item.adjustable, maxRows: item.maxRows || 60, modes: item.modes || [],
        visible: !item.modes || item.modes.includes(mode),
        scrollTarget: '',
        rows: item.rows.map((values, rowIndex) => makeRow(item, tableIndex, rowIndex, values)),
      }
      return { ...result, ...buildTableView(result, tableIndex) }
    }),
    checked: false, message: '', errorCount: 0,
  }
}

function validateField(field) {
  const value = field.value.trim()
  if (!value) return field.optional ? '' : '请填写此项'
  if (field.kind !== 'number') return ''
  // 不把空值、十六进制或 Infinity 当作测量数值；保留原始输入的小数位。
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) return '请输入有效数值'
  const numeric = Number(value)
  if (field.integer && !Number.isInteger(numeric)) return '请输入整数'
  if (field.positive && numeric <= 0) return '数值须大于 0'
  if (field.min != null && numeric < field.min) return '数值须不小于 ' + field.min
  return ''
}

function validateForm(form) {
  const errors = []
  form.parameters.forEach((field, index) => {
    if (field.visible === false) return
    const message = validateField(field)
    if (message) errors.push({ id: field.id, label: field.label, message, path: `parameters[${index}].error` })
  })
  form.tables.forEach((item, tableIndex) => {
    if (!item.visible) return
    const noRecords = item.skipEmptyRows && item.rows.every(isEmptyRow)
    item.rows.forEach((row, rowIndex) => {
      if (item.skipEmptyRows && isEmptyRow(row) && !(noRecords && rowIndex === 0)) return
      row.cells.forEach((cell, columnIndex) => {
        if (cell.kind === 'fixed' || cell.kind === 'computed') return
        const message = validateField(cell)
        if (message) errors.push({ id: cell.id, tableIndex, label: `${item.title}第 ${rowIndex + 1} 行 ${cell.label}`, message, path: `tables[${tableIndex}].rows[${rowIndex}].cells[${columnIndex}].error` })
      })
    })
  })
  return errors
}

function isEmptyRow(row) {
  return row.cells.filter(cell => cell.kind === 'number' || cell.kind === 'text').every(cell => !cell.value.trim())
}

function deriveParameters(parameters, fields) {
  const p = toObject(parameters.map(field => [field.key, field]))
  return (fields || []).map(field => {
    const valid = ['slitPosition', 'eyepiecePosition', 'distanceCorrection'].every(key => p[key] && !validateField(p[key]))
    return { ...field, value: valid ? String(Number((Math.abs(Number(p.slitPosition.value) - Number(p.eyepiecePosition.value)) + Number(p.distanceCorrection.value)).toPrecision(12))) : '待填写支杆位置' }
  })
}

// 未来计算接口可直接使用此结构；所有原始值仍为字符串，不含处理列。
function collectInput(form) {
  return {
    experimentId: form.experiment.id, schemaVersion: 2, templateVersion: '2026-10-22', mode: form.mode,
    info: toObject(form.info.map(field => [field.key, field.value])),
    parameters: toObject(form.parameters.filter(field => field.visible !== false).map(field => [field.key, field.value])),
    tables: form.tables.filter(item => item.visible).map(item => ({
      id: item.id,
      rows: item.rows.filter(row => !item.skipEmptyRows || !isEmptyRow(row)).map(row => toObject(row.cells.filter(cell => cell.kind !== 'computed' && !cell.template).map(cell => [cell.key, cell.value]))),
    })),
  }
}

function formatInput(form) {
  const selectedMode = form.modes.find(item => item.id === form.mode)
  const lines = [form.experiment.name]
  if (selectedMode) lines.push('记录方案：' + selectedMode.label)
  form.info.forEach(field => lines.push(`${field.label}：${field.value || '未填写'}`))
  if (form.parameters.length) lines.push('\n实验参数')
  form.parameters.filter(field => field.visible !== false).forEach(field => lines.push(`${field.label}：${field.value || '未填写'}`))
  form.tables.filter(item => item.visible).forEach(item => {
    const columns = item.columns.filter(column => column.kind !== 'computed')
    if (!columns.length || !columns.some(column => column.kind !== 'fixed')) return
    lines.push('\n' + item.title, columns.map(column => column.label).join('\t'))
    item.rows.filter(row => !item.skipEmptyRows || !isEmptyRow(row)).forEach(row => lines.push(row.cells.filter(cell => cell.kind !== 'computed').map(cell => cell.template && cell.value !== '—' ? '原表预印：' + cell.value : cell.value || '未填写').join('\t')))
  })
  lines.push(form.observationOnly ? '\n以上为实验观察记录，请按实验报告要求整理并分析现象。' : '\n以上为原始录入数据，尚未进行数据处理。')
  return lines.join('\n')
}

module.exports = { createForm, makeRow, validateField, validateForm, collectInput, formatInput, deriveParameters }
