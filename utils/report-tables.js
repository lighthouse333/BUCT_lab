const { definitions } = require('./experiment-forms')
const { numeric, mean, decimalDifference, fitLine } = require('./report-math')
const { significantText } = require('./report-precision')
const { makeRow } = require('./experiment-input')
const { buildTableView } = require('./table-layout')

const read = value => { try { return numeric(value) } catch (e) { return null } }
const derived = (values, fn) => {
  const numbers = values.map(read)
  if (numbers.some(n => n == null)) return null
  try { const result = fn(...numbers); return Number.isFinite(result) ? result : null } catch (e) { return null }
}
const average = values => values.length ? derived(values, (...numbers) => mean(numbers)) : null
const show = value => value == null ? '' : typeof value === 'number' ? significantText(value, 4) : String(value)

function reportTables(input, options = {}) {
  const def = definitions[input.experimentId]
  if (!def) {
    if (input.experimentId !== 'spectral-analysis') return []
    const { calculateGroup } = require('./spectral-analysis')
    const source = (input.tables.find(t => t.id === 'spectral-readings') || { rows: [] }).rows
    const calculated = source.map(calculateGroup)
    const valid = calculated.filter(c => c.state === 'valid')
    const thetaMean = calculated.some(c => c.state === 'invalid' || c.state === 'incomplete') ? null : average(valid.map(c => c.theta))
    const column = (key, label, kind = 'computed') => ({ key, label, kind, width: 210 })
    return [
      { id: 'spectral-source', title: '±1级谱线位置记录表', sourceNumber: '1', columns: [column('number', '测量次数', 'fixed'), ...['minusLeft', 'minusRight', 'plusLeft', 'plusRight'].map((key, i) => column(key, i % 2 ? '右游标读数' : '左游标读数', 'number'))],
        layout: { type: 'vertical', groups: [{ label: '−1级谱线位置', span: 2 }, { label: '+1级谱线位置', span: 2 }] }, fixedCells: {}, averages: {},
        rows: source.map((r, i) => ({ number: String(i + 1), ...r })) },
      { id: 'spectral-theta', title: 'θ数据处理记录表', sourceNumber: '2', columns: [column('number', '测量次数', 'fixed'), column('left', '左'), column('right', '右'), column('corrected', '消除偏心差后的2θ'), column('theta', 'θ')],
        layout: { type: 'spectral-results', averageKeys: ['theta'] }, fixedCells: {}, averages: { theta: thetaMean },
        rows: calculated.map((r, i) => ({ number: String(i + 1), left: r.state === 'valid' ? r.left : null, right: r.state === 'valid' ? r.right : null, corrected: r.state === 'valid' ? r.corrected : null, theta: r.state === 'valid' ? r.theta : null })) },
    ]
  }
  const tables = def.tables.filter(t => !t.modes || t.modes.includes(input.mode)).map(t => {
    const raw = input.tables.find(r => r.id === t.id)
    const rows = raw ? raw.rows : t.rows.map(() => ({}))
    return { id: t.id, title: t.title, sourceNumber: t.unnumbered ? '' : t.sourceNumber || String(def.tables.indexOf(t) + 1),
      columns: t.columns.map(c => ({ ...c })), layout: { ...(t.layout || { type: 'vertical' }) }, hint: t.hint || '',
      fixedCells: { ...(t.fixedCells || {}) }, averages: {},
      rows: rows.map((r, index) => t.columns.reduce((row, c, column) => {
        const templateKey = index + ':' + column
        row[c.key] = Object.prototype.hasOwnProperty.call(t.fixedCells || {}, templateKey) ? t.fixedCells[templateKey]
          : c.kind === 'computed' ? null : r[c.key] == null ? c.kind === 'fixed' ? (t.rows[index] || [])[column] || (c.key === 'number' ? String(index + 1) : '') : '' : r[c.key]
        return row
      }, {})) }
  })
  const find = id => tables.find(t => t.id === id)
  const rows = id => (find(id) || { rows: [] }).rows
  const p = input.parameters
  const id = input.experimentId
  if (id === 'young-modulus') {
    rows('loading').forEach(r => { r.mean = derived([r.loading, r.unloading], (a, b) => (a + b) / 2) })
    rows('force-extension').forEach((r, i) => {
      const a = rows('loading')[i], b = rows('loading')[i + 5]
      r.force = i >= 5 ? '—' : a && b ? derived([a.mass, b.mass, p.gravity], (x, y, g) => Math.abs(decimalDifference(y, x)) * 1e-3 * g) : null
      r.extension = i >= 5 ? '—' : a && b ? derived([a.mean, b.mean], (x, y) => Math.abs(decimalDifference(y, x))) : null
    })
  }
  if (id === 'kelvin-bridge') rows('fixed-resistance').forEach(r => { r.mean = derived([r.forward, r.reverse], (a, b) => (a + b) / 2) })
  if (id === 'sound-speed') for (const method of ['standing', 'traveling', 'lissajous']) {
    const series = rows('positions-' + method)
    series.forEach((r, i) => { r.difference = i >= 5 ? '—' : series[i + 5] ? derived([r.position, series[i + 5].position], (a, b) => Math.abs(decimalDifference(b, a))) : null })
  }
  if (id === 'strain-sensor') for (const arm of ['single-arm', 'full-bridge']) {
    const measured = rows(arm), processed = rows(arm + '-nonlinearity')
    measured.forEach(r => {
      for (let cycle = 1; cycle <= 3; cycle++) r['hysteresis' + cycle] = derived([r['forward' + cycle], r['reverse' + cycle]], (a, b) => decimalDifference(a, b))
      r.mean = average([r.forward1, r.reverse1, r.forward2, r.reverse2, r.forward3, r.reverse3])
    })
    let fit = null
    if (measured.length === 17 && measured.every(r => read(r.x) != null && r.mean != null)) {
      try { fit = fitLine(measured.map(r => ({ x: Number(r.x), y: r.mean }))) } catch (e) { /* 退化数据由计算器诊断。 */ }
    }
    processed.forEach((r, i) => {
      const source = measured[i]
      r.x = source ? read(source.x) : null
      r.mean = source ? source.mean : null
      r.fitted = fit ? fit.residuals[i].fitted : null
      r.residual = fit ? fit.residuals[i].residual : null
    })
  }
  if (id === 'fresnel-biprism') for (const key of ['fringe-spacing', 'image-l1', 'image-l2']) rows(key).forEach(r => { r.difference = derived([r.start, r.end], (a, b) => Math.abs(decimalDifference(b, a))) })
  if (id === 'pn-junction') rows('constant-temperature').forEach(r => { r.logCurrent = derived([r.current], value => value > 0 ? Math.log(value) : NaN) })
  if (id === 'single-slit') rows('minima').forEach(r => {
    const valid = derived([r.left, r.center, r.right], (a, b, c) => a < b && b < c ? 1 : NaN)
    r.distanceLeft = valid ? derived([r.center, r.left], decimalDifference) : null
    r.distanceRight = valid ? derived([r.right, r.center], decimalDifference) : null
    r.meanDistance = valid ? derived([r.right, r.left], (a, b) => decimalDifference(a, b) / 2) : null
  })
  if (id === 'zeeman-effect') rows('combined-rings').forEach(r => {
    for (let ring = 0; ring < 4; ring++) r['diameter' + ring] = derived([r['position' + (ring * 2 + 1)], r['position' + (ring * 2 + 2)]], (a, b) => Math.abs(decimalDifference(b, a)))
  })
  if (id === 'michelson') rows('positions').forEach((r, i, list) => { if (i >= 3) r.difference = derived([r.position, list[i - 3].position], (a, b) => Math.abs(decimalDifference(a, b))) })
  if (id === 'rlc') rows('phase-200').forEach((r, i) => {
    r.phase = derived([r.a, r.b], (a, b) => a > 0 && b >= 0 && b <= a ? Math.asin(b / a) : NaN)
    if (r.phase != null && Array.isArray(options.phaseSigns) && [-1, 0, 1].includes(options.phaseSigns[i])) r.phase *= options.phaseSigns[i]
  })
  if (id === 'ballistic-galvanometer') {
    const convention = options.chargeConvention
    for (const key of ['capacitance-1', 'capacitance-2']) rows(key).forEach(r => {
      const charge = (a, b) => convention === 'signed' && a * b < 0 ? Math.abs(decimalDifference(a, b)) / 2 : convention === 'magnitudes' && a > 0 && b > 0 ? (a + b) / 2 : NaN
      r.standardMean = derived([r.standardForward, r.standardReverse], charge)
      r.unknownMean = derived([r.unknownForward, r.unknownReverse], charge)
    })
    for (const key of ['discharge-forward', 'discharge-reverse']) rows(key).forEach(r => {
      r.logCharge = derived([r.charge], q => convention === 'signed' && q !== 0 ? Math.log(Math.abs(q)) : convention === 'magnitudes' && q > 0 ? Math.log(q) : NaN)
    })
  }
  tables.forEach(t => {
    if (t.layout.average || t.layout.averageKeys) for (const key of t.layout.averageKeys || t.layout.fields) t.averages[key] = average(t.rows.map(r => r[key]))
    if (t.layout.type === 'torsion') for (let group = 0; group < 6; group++) t.averages[String(group)] = average(t.rows.slice(group * 5, group * 5 + 5).map(r => r.fiveTx))
  })
  return tables
}

function gridView(table, tableIndex, editable) {
  const result = { ...table, averages: Object.keys(table.averages).reduce((all, key) => { all[key] = table.averages[key] == null ? null : show(table.averages[key]); return all }, {}),
    rows: table.rows.map((r, i) => makeRow(table, tableIndex, i, table.columns.map(c => show(r[c.key])))) }
  const view = buildTableView(result, tableIndex)
  if (!editable) view.displayCells = view.displayCells.map(cell => {
    if (cell.parts) return { ...cell, parts: cell.parts.map(p => p.input ? { text: p.prefix + (result.rows[p.row].cells[p.column].value || '—') + p.suffix } : p) }
    if (!cell.field) return cell
    const field = result.rows[cell.row].cells[cell.column]
    return { ...cell, field: false, computed: field.kind === 'computed', content: field.value || (field.kind === 'computed' ? '待计算' : '—') }
  })
  return { ...result, ...view }
}

function refreshFormTables(form, options = {}) {
  const { collectInput } = require('./experiment-input')
  const projected = reportTables(collectInput(form), options)
  return form.tables.map((t, index) => {
    const update = projected.find(p => p.id === t.id)
    if (!update) return t
    const next = { ...t, averages: Object.keys(update.averages).reduce((a, k) => { a[k] = update.averages[k] == null ? null : show(update.averages[k]); return a }, {}),
      rows: t.rows.map((row, r) => ({ ...row, cells: row.cells.map(cell => cell.kind === 'computed' ? { ...cell, value: show((update.rows[r] || {})[cell.key]) } : cell) })) }
    return { ...next, ...buildTableView(next, index) }
  })
}

module.exports = { reportTables, gridView, refreshFormTables }
