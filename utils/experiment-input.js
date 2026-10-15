const { definitions, supportedIds } = require('./experiment-input-config')
const { experiments } = require('./experiments')

const PERSONAL_KEYS = ['studentClass', 'studentName', 'studentId', 'teacher', 'experimentDate', 'partners']
const NOTE_KEYS = ['actualSteps', 'observations', 'errorNotes']
const blank = value => String(value == null ? '' : value).trim() === ''
const clone = value => JSON.parse(JSON.stringify(value))
const format = value => value == null || !Number.isFinite(value) ? '—' : Number(value.toPrecision(8)).toString()

function parseReading(value, spec = {}) {
  if (blank(value)) return { value: null, error: spec.optional ? '' : '请填写读数' }
  const text = String(value).trim()
  if (spec.type === 'text') return text.length <= 150 ? { value: text, error: '' } : { value: null, error: '文字请控制在 150 字以内' }
  if (text.length > 64 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return { value: null, error: '请输入有效数字，可使用负号和科学计数法' }
  const number = Number(text)
  if (!Number.isFinite(number)) return { value: null, error: '数值超出有效范围' }
  if (spec.nonzero && number === 0) return { value: null, error: '此读数不能为 0，否则无法取对数' }
  if (spec.min != null && (spec.exclusiveMin ? number <= spec.min : number < spec.min)) {
    return { value: null, error: `须${spec.exclusiveMin ? '大于' : '不小于'} ${spec.min}` }
  }
  return { value: number, error: '' }
}

function makeRow(definition, index) {
  const override = (definition.rowOverrides || {})[index] || {}
  return {
    id: index + 1,
    cells: definition.columns.map(column => {
      let value = column.value == null ? '' : String(column.value)
      const seed = (definition.presets || {})[column.key]
      if (Array.isArray(seed)) value = seed[index] == null ? '' : seed[index]
      else if (seed) value = (seed.start + index * seed.step).toFixed(seed.digits)
      if (override.values && Object.prototype.hasOwnProperty.call(override.values, column.key)) value = override.values[column.key]
      const locked = (override.locked || []).includes(column.key)
      return { key: column.key, label: column.label, unit: column.unit, value, display: '', numeric: null,
        computed: !!column.computed, optional: !!column.optional, inputType: column.type || 'number',
        placeholder: column.placeholder || '填写读数', editable: !column.computed && !column.fixed && !locked, error: '' }
    }),
  }
}

function createForm(experimentId) {
  const definition = definitions[experimentId]
  const experiment = experiments.find(item => item.id === experimentId)
  if (!definition || !experiment) throw new Error('该实验的数据录入页暂未开放')
  const state = {
    experimentId, name: experiment.name, number: experiment.number, category: experiment.category,
    subtitle: definition.subtitle, hint: definition.hint,
    personal: Object.fromEntries(PERSONAL_KEYS.map(key => [key, ''])),
    notes: Object.fromEntries(NOTE_KEYS.map(key => [key, ''])),
    parameters: definition.parameters.map(item => ({ key: item.key, label: item.label, unit: item.unit,
      value: item.value || '', optional: !!item.optional, inputType: item.type || 'number', error: '' })),
    tables: definition.tables.map(item => ({
      id: item.id, title: item.title, hint: item.hint || '', derived: !!item.derived,
      minRows: item.minRows, maxRows: item.maxRows, addStep: item.addStep,
      columns: item.columns.map(column => ({ key: column.key, label: column.label, unit: column.unit,
        type: column.type === 'text' || column.fixed ? 'text' : 'number', computed: !!column.computed })),
      rows: item.derived ? [] : Array.from({ length: item.defaultRows }, (_, index) => makeRow(item, index)),
      width: 90 + item.columns.length * 210, summaries: [],
    })),
  }
  return evaluateForm(state)
}

function calculate(operation, values) {
  if (operation === 'backend') return null
  if (values.some(value => value == null)) return null
  if (operation === 'mean') return values.reduce((sum, value) => sum + value / values.length, 0)
  if (operation === 'divide-10') return values[0] / 10
  if (operation === 'divide-5') return values[0] / 5
  if (operation === 'celsius') return values[0] + 273.15
  if (operation === 'ln' || operation === 'ln-abs') {
    const v = operation === 'ln-abs' ? Math.abs(values[0]) : values[0]
    return v > 0 ? Math.log(v) : null
  }
  if (operation === 'asin-ratio') {
    if (values[1] <= 0 || values[0] > values[1]) throw new Error('请核对 A、B：A 须大于 0，且 B 不能大于 A')
    return Math.asin(values[0] / values[1])
  }
  throw new Error('未配置的派生公式')
}

function evaluateForm(state) {
  const definition = definitions[state.experimentId]
  if (!definition) throw new Error('未知实验')
  const issues = []
  const params = {}
  let filled = 0, total = 0
  state.parameters.forEach((field, i) => {
    const result = parseReading(field.value, definition.parameters[i])
    field.numeric = result.value; field.error = result.error
    params[field.key] = result.value
    if (!field.optional) { total++; if (!blank(field.value)) filled++ }
    if (result.error) issues.push({ section: 'parameters', field: field.key, message: `${field.label}：${result.error}` })
  })
  state.tables.forEach((table, ti) => {
    const td = definition.tables[ti]
    if (td.derived) return
    table.rows.forEach((row, ri) => {
      const values = {}
      row.cells.forEach((cell, ci) => {
        const column = td.columns[ci]
        cell.error = ''; cell.numeric = null
        if (column.computed) {
          try {
            cell.numeric = calculate(column.computed.operation, column.computed.sources.map(key => values[key]))
            if (cell.numeric != null && !Number.isFinite(cell.numeric)) { cell.numeric = null; cell.error = '结果超出数值范围，请核查输入' }
          } catch (error) { cell.error = error.message }
          cell.value = ''; cell.display = column.computed.operation === 'backend' ? '待计算' : format(cell.numeric)
        } else if (cell.editable) {
          const result = parseReading(cell.value, column)
          cell.numeric = result.value; cell.error = result.error
          if (!column.optional) { total++; if (!blank(cell.value)) filled++ }
        }
        values[cell.key] = cell.numeric
        if (cell.error) issues.push({ section: table.id, row: ri, field: cell.key,
          message: `${table.title} · 第 ${ri + 1} 行 ${column.label}：${cell.error}` })
      })
    })
    if (td.increasing) {
      let previous = null
      table.rows.forEach((row, ri) => {
        const cell = row.cells.find(item => item.key === td.increasing)
        if (cell.numeric == null) return
        if (previous != null && cell.numeric <= previous) {
          cell.error = '读数须按测量点严格递增，不能重复或倒序'
          issues.push({ section: table.id, row: ri, field: cell.key, message: `${table.title} · 第 ${ri + 1} 行 ${cell.label}：${cell.error}` })
        }
        previous = cell.numeric
      })
    }
    table.summaries = (td.summaries || []).map(key => {
      const column = td.columns.find(item => item.key === key)
      const cells = table.rows.map(row => row.cells.find(cell => cell.key === key))
      const valid = cells.every(cell => cell.numeric != null && !cell.error)
      const mean = valid ? cells.reduce((sum, cell) => sum + cell.numeric / cells.length, 0) : null
      return { key, label: `${column.label}的平均值`, value: mean, display: format(mean), unit: column.unit }
    })
    table.completedRows = table.rows.filter(row => row.cells.filter(cell => cell.editable && !cell.optional).every(cell => cell.numeric != null && !cell.error)).length
  })
  if (state.experimentId === 'young-modulus') {
    const source = state.tables[0], target = state.tables[2], half = source.rows.length / 2
    target.rows = []
    if (Number.isInteger(half)) {
      for (let i = 0; i < half; i++) {
        const a = source.rows[i], b = source.rows[i + half]
        const get = (row, key) => { const c = row.cells.find(cell => cell.key === key); return c.error ? null : c.numeric }
        const ma = get(a, 'mass'), mb = get(b, 'mass'), na = get(a, 'meanReading'), nb = get(b, 'meanReading')
        const force = ma == null || mb == null || params.gravity == null ? null : (mb - ma) / 1000 * params.gravity
        const extension = na == null || nb == null ? null : Math.abs(nb - na)
        target.rows.push({ id: i + 1, cells: [i + 1, i + 1 + half, force, extension].map((v, ci) => ({
          key: target.columns[ci].key, numeric: v, value: '', display: format(v), computed: true, editable: false, error: '',
        })) })
      }
    } else issues.push({ section: source.id, field: '', message: '加载表需要偶数行才能逐差配对' })
  }
  state.progress = { filled, total }
  state.issues = issues
  return state
}

function resizeTable(state, tableIndex, delta) {
  const td = definitions[state.experimentId].tables[tableIndex], table = state.tables[tableIndex]
  if (!td || td.derived || ![td.addStep, -td.addStep].includes(delta)) return false
  const next = table.rows.length + delta
  if (next < td.minRows || next > td.maxRows) return false
  if (delta > 0) for (let i = table.rows.length; i < next; i++) table.rows.push(makeRow(td, i))
  else table.rows = table.rows.slice(0, next)
  evaluateForm(state)
  return true
}

function personalIssues(personal) {
  return [['studentClass', '班级'], ['studentName', '姓名'], ['studentId', '学号']]
    .filter(([key]) => blank(personal[key])).map(([field, label]) => ({ section: 'personal', field, message: `请填写${label}` }))
}

function collectPayload(state) {
  evaluateForm(state)
  const errors = personalIssues(state.personal).concat(state.issues)
  if (errors.length) return { ok: false, errors }
  const parameters = {}, rawParameters = {}, rawTables = {}
  state.parameters.forEach(field => {
    parameters[field.key] = { value: field.numeric, unit: field.unit }
    rawParameters[field.key] = field.value
  })
  const tables = state.tables.map(table => {
    const rows = table.rows.map((row, index) => {
      const record = { index: index + 1 }, original = {}
      row.cells.forEach(cell => {
        record[cell.key] = cell.editable || cell.computed ? cell.numeric : (blank(cell.value) ? null : cell.value)
        if (!cell.computed) original[cell.key] = cell.value
      })
      if (!table.derived) {
        if (!rawTables[table.id]) rawTables[table.id] = []
        rawTables[table.id].push(original)
      }
      return record
    })
    return { id: table.id, title: table.title, derived: table.derived, columns: clone(table.columns), rows }
  })
  const p = state.personal
  const personal = { name: p.studentName.trim(), class_name: p.studentClass.trim(), student_id: p.studentId.trim(),
    experiment_date: p.experimentDate, partners: p.partners.trim(), instructor: p.teacher.trim() }
  const payload = { schema_version: 'lab-input-1', experiment_id: state.experimentId, title: state.name,
    personal, parameters, tables, notes: { actual_steps: state.notes.actualSteps,
      observations: state.notes.observations, confirmed_error_notes: state.notes.errorNotes },
    raw_input: { parameters: rawParameters, tables: rawTables }, collected_at: new Date().toISOString() }
  if (state.experimentId === 'pn-junction') {
    payload.backend_input = {
      is_demo: false, personal, notes: payload.notes,
      iv: { temperature_c: rawParameters.ivTemperature, voltage_unit: 'V', current_unit: 'uA',
        points: rawTables.iv.map(row => ({ voltage: row.voltage, current: row.current })) },
      temperature_runs: [{ id: 'run-1', label: `${rawParameters.constantCurrent} μA 恒流组`,
        current: rawParameters.constantCurrent, current_unit: 'uA', temperature_unit: 'C', voltage_unit: 'V', voltage_mode: 'absolute',
        points: rawTables.temperature.map(row => ({ temperature: row.temperature, voltage: row.voltage })) }],
    }
  }
  return { ok: true, payload }
}

function makeDraft(state) {
  return { version: 1, experimentId: state.experimentId, personal: clone(state.personal), notes: clone(state.notes),
    savedAt: new Date().toISOString(), parameters: Object.fromEntries(state.parameters.map(item => [item.key, item.value])),
    tables: state.tables.filter(table => !table.derived).map(table => ({ id: table.id,
      rows: table.rows.map(row => Object.fromEntries(row.cells.filter(cell => cell.editable).map(cell => [cell.key, cell.value]))) })) }
}

function restoreDraft(experimentId, draft) {
  if (!draft || draft.version !== 1 || draft.experimentId !== experimentId || !Array.isArray(draft.tables)) throw new Error('草稿格式不匹配')
  const state = createForm(experimentId)
  const safe = value => typeof value === 'string' && value.length <= 3000
  for (const key of PERSONAL_KEYS) if (draft.personal && safe(draft.personal[key])) state.personal[key] = draft.personal[key]
  for (const key of NOTE_KEYS) if (draft.notes && safe(draft.notes[key])) state.notes[key] = draft.notes[key]
  state.parameters.forEach(field => { if (draft.parameters && safe(draft.parameters[field.key])) field.value = draft.parameters[field.key] })
  state.tables.forEach((table, ti) => {
    if (table.derived) return
    const saved = draft.tables.find(item => item && item.id === table.id)
    const td = definitions[experimentId].tables[ti]
    if (!saved || !Array.isArray(saved.rows) || saved.rows.length < td.minRows || saved.rows.length > td.maxRows ||
        (saved.rows.length - td.defaultRows) % td.addStep !== 0) throw new Error('草稿表格行数不符合当前模板')
    table.rows = saved.rows.map((values, index) => {
      if (!values || typeof values !== 'object') throw new Error('草稿行格式错误')
      const row = makeRow(td, index)
      row.cells.forEach(cell => { if (cell.editable && safe(values[cell.key])) cell.value = values[cell.key] })
      return row
    })
  })
  return evaluateForm(state)
}

module.exports = { supportedIds, PERSONAL_KEYS, NOTE_KEYS, createForm, evaluateForm, parseReading,
  resizeTable, collectPayload, makeDraft, restoreDraft, personalIssues, blank }
