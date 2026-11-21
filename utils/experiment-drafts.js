const { createForm, makeRow, deriveParameters, parameterVisibility } = require('./experiment-input')

const prefix = 'buct:experiment-draft:v1:'
const text = value => typeof value === 'string' && value.length <= 2000
const read = (id, storage) => {
  if (!storage || typeof storage.getStorageSync !== 'function') return null
  try {
    const draft = storage.getStorageSync(prefix + id)
    return draft && draft.version === 1 && draft.experimentId === id ? draft : null
  } catch (e) { return null }
}
const write = (id, data, storage) => {
  if (!storage || typeof storage.setStorageSync !== 'function') return ''
  try {
    storage.setStorageSync(prefix + id, { version: 1, experimentId: id, savedAt: Date.now(), ...data })
    return '已自动保存在本机，下次打开可继续填写。'
  } catch (e) { return '本机保存失败，请先复制记录，避免丢失。' }
}

function saveFormDraft(form, storage) {
  if (!form.experiment) return ''
  const fields = list => list.reduce((result, field) => { if (text(field.value)) result[field.key] = field.value; return result }, {})
  return write(form.experiment.id, {
    schemaVersion: 3, mode: form.mode, info: fields(form.info), parameters: fields(form.parameters),
    // 保留未选方案，计算列和预印格不存成实测值。
    tables: form.tables.map(t => ({ id: t.id, rows: t.rows.map(row => fields(row.cells.filter(c => c.kind !== 'computed' && c.kind !== 'fixed'))) })),
  }, storage)
}

function restoreFormDraft(id, storage) {
  const draft = read(id, storage), form = createForm(id)
  if (!draft || !form || draft.schemaVersion !== 3) return null
  try {
    if (form.modes.some(m => m.id === draft.mode)) form.mode = draft.mode
    for (const list of ['info', 'parameters']) for (const field of form[list]) {
      const value = (draft[list] || {})[field.key]
      if (text(value) && !field.readOnly && (!field.choices || field.choices.some(c => c.value === value))) field.value = value
    }
    const { definitions } = require('./experiment-forms')
    form.tables.forEach((table, index) => {
      table.visible = !table.modes.length || table.modes.includes(form.mode)
      const saved = (Array.isArray(draft.tables) ? draft.tables : []).find(t => t && t.id === table.id)
      if (!saved || !Array.isArray(saved.rows)) return
      const min = table.minRows || 1
      if (saved.rows.length > table.maxRows || (table.adjustable ? saved.rows.length < min : saved.rows.length !== table.rows.length)) return
      const definition = definitions[id].tables[index]
      table.rows = saved.rows.map((row, i) => {
        const original = makeRow(definition, index, i, definition.rows[i] || [])
        original.cells.forEach(cell => { if (row && cell.kind !== 'computed' && cell.kind !== 'fixed' && text(row[cell.key])) cell.value = row[cell.key] })
        return original
      })
    })
    form.parameters = parameterVisibility(form.parameters, form.mode)
    form.derivedParameters = deriveParameters(form.parameters, form.derivedParameters)
    return form
  } catch (e) { return null }
}

const spectralKeys = ['studentClass', 'studentName', 'studentId', 'teacher', 'lineName', 'density', 'relativeGratingUncertainty', 'angularInstrumentUncertainty', 'reference', 'observedPhenomenon', 'elementAnalysis']
const readingKeys = ['minusLeft', 'minusRight', 'plusLeft', 'plusRight']
function saveSpectralDraft(data, storage) {
  const values = {}
  spectralKeys.forEach(key => { if (text(data[key])) values[key] = data[key] })
  values.groups = data.groups.map(g => readingKeys.reduce((r, key) => { r[key] = g[key]; return r }, {}))
  return write('spectral-analysis', values, storage)
}
function restoreSpectralDraft(storage) {
  const draft = read('spectral-analysis', storage)
  if (!draft || !Array.isArray(draft.groups) || !draft.groups.length || draft.groups.length > 30 || draft.groups.some(g => !g || readingKeys.some(key => !text(g[key])))) return null
  const values = { groups: draft.groups.map((g, i) => ({ id: i + 1, label: String(i + 1), ...readingKeys.reduce((r, key) => { r[key] = g[key]; return r }, {}) })) }
  spectralKeys.forEach(key => { if (text(draft[key])) values[key] = draft[key] })
  return values
}

module.exports = { saveFormDraft, restoreFormDraft, saveSpectralDraft, restoreSpectralDraft }
