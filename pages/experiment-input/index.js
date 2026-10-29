const { definitions } = require('../../utils/experiment-forms')
const { createForm, makeRow, validateField, validateForm, collectInput, formatInput, deriveParameters } = require('../../utils/experiment-input')
const { buildTableView } = require('../../utils/table-layout')
const { openReport } = require('../../utils/report-navigation')
const { refreshFormTables } = require('../../utils/report-tables')
const { textbookOptions } = require('../../utils/textbook-profile')

Page({
  data: { experiment: null, loadError: '', parameters: [], tables: [], info: [], modes: [], mode: '', observationOnly: false, introSections: [], derivedParameters: [], reportRequirements: [], reportSubmission: [], checked: false, message: '', errorCount: 0, calculating: false },

  onLoad(options = {}) {
    const form = createForm(options.id)
    if (!form) {
      this.setData({ loadError: '未找到对应的实验输入表，请返回首页重新选择。' })
      return
    }
    this.setData(form)
    this.refreshCalculations()
    wx.setNavigationBarTitle({ title: form.experiment.name })
  },

  onShow() { if (this.data.experiment) this.refreshCalculations() },

  refreshCalculations() {
    const input = collectInput(this.data)
    this.setData({ tables: refreshFormTables(this.data, textbookOptions(input)) })
  },

  onInfoInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.info[index]) return
    this.setData({ [`info[${index}].value`]: e.detail.value })
  },

  onParameterInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.parameters[index] || this.data.parameters[index].readOnly) return
    this.setData({ [`parameters[${index}].value`]: e.detail.value, [`parameters[${index}].error`]: '', checked: false, message: '', errorCount: 0 })
    this.setData({ derivedParameters: deriveParameters(this.data.parameters, this.data.derivedParameters) })
    this.refreshCalculations()
  },

  onParameterBlur(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = this.data.parameters[index]
    if (Number.isInteger(index) && field) this.setData({ [`parameters[${index}].error`]: validateField(field) })
  },

  findCell(dataset) {
    const indexes = [dataset.table, dataset.row, dataset.column].map(Number)
    if (!indexes.every(index => Number.isInteger(index) && index >= 0)) return null
    const [tableIndex, rowIndex, columnIndex] = indexes
    const table = this.data.tables[tableIndex]
    const cell = table && table.visible && table.rows[rowIndex] && table.rows[rowIndex].cells[columnIndex]
    if (!cell || cell.kind === 'fixed' || cell.kind === 'computed') return null
    return { cell, path: `tables[${tableIndex}].rows[${rowIndex}].cells[${columnIndex}]` }
  },

  onCellInput(e) {
    const target = this.findCell(e.currentTarget.dataset)
    if (!target) return
    this.setData({ [`${target.path}.value`]: e.detail.value, [`${target.path}.error`]: '', checked: false, message: '', errorCount: 0 })
    this.refreshCalculations()
  },

  onCellBlur(e) {
    const target = this.findCell(e.currentTarget.dataset)
    if (target) this.setData({ [`${target.path}.error`]: validateField(target.cell) })
  },

  onModeChange(e) {
    const mode = e.detail.value
    if (!this.data.modes.some(item => item.id === mode)) return
    this.setData({
      mode,
      parameters: this.data.parameters.map(field => ({ ...field, visible: !field.modes || field.modes.includes(mode), error: '' })),
      tables: this.data.tables.map(item => ({ ...item, visible: !item.modes.length || item.modes.includes(mode), scrollTarget: '' })),
      checked: false, message: '', errorCount: 0,
    })
    this.refreshCalculations()
  },

  onAddRow(e) {
    const index = Number(e.currentTarget.dataset.table)
    const table = this.data.tables[index]
    if (!Number.isInteger(index) || !table || !table.visible || !table.adjustable || table.rows.length >= table.maxRows) return
    const definition = definitions[this.data.experiment.id].tables[index]
    const next = { ...table, rows: table.rows.concat(makeRow(definition, index, table.rows.length)) }
    this.setData({ [`tables[${index}]`]: { ...next, ...buildTableView(next, index) }, checked: false, message: '', errorCount: 0 })
    this.refreshCalculations()
  },

  onRemoveRow(e) {
    const index = Number(e.currentTarget.dataset.table)
    const table = this.data.tables[index]
    if (!Number.isInteger(index) || !table || !table.visible || !table.adjustable || table.rows.length <= 1) return
    const remove = () => {
      const next = { ...table, rows: table.rows.slice(0, -1) }
      this.setData({ [`tables[${index}]`]: { ...next, ...buildTableView(next, index) }, checked: false, message: '', errorCount: 0 })
      this.refreshCalculations()
    }
    const last = table.rows[table.rows.length - 1]
    if (last.cells.some(cell => cell.kind !== 'fixed' && cell.kind !== 'computed' && cell.value.trim())) {
      wx.showModal({ title: '删除最后一行？', content: '该行已填写的读数会被删除。', success: res => { if (res.confirm) remove() } })
    } else remove()
  },

  onCheck() {
    const errors = validateForm(this.data)
    const successMessage = this.data.observationOnly ? '实验记录已填写完整，实际角度的数值格式检查通过。请结合报告要求核对现象分析。' : '当前方案的原始数据已填完整，数值格式检查通过。'
    const updates = { checked: true, errorCount: errors.length, message: errors.length ? `有 ${errors.length} 处需要检查，已定位到第一处。` : successMessage }
    this.data.parameters.forEach((field, i) => { updates[`parameters[${i}].error`] = '' })
    this.data.tables.forEach((table, t) => {
      updates[`tables[${t}].scrollTarget`] = ''
      table.rows.forEach((row, r) => row.cells.forEach((cell, c) => { if (cell.error) updates[`tables[${t}].rows[${r}].cells[${c}].error`] = '' }))
    })
    errors.forEach(error => { updates[error.path] = error.message })
    const first = errors[0]
    this.setData(updates, () => {
      if (!first) return
      const scrollToError = () => wx.pageScrollTo({ selector: '#' + first.id, duration: 250 })
      if (first.tableIndex == null) scrollToError()
      else this.setData({ [`tables[${first.tableIndex}].scrollTarget`]: first.id }, scrollToError)
    })
  },

  onCopy() {
    wx.setClipboardData({ data: formatInput(this.data) })
  },

  onStartCalculation() {
    if (this.data.calculating || !this.data.experiment) return
    this.onCheck()
    if (this.data.errorCount) {
      wx.showToast({ title: '请先补齐或修正标红的数据', icon: 'none' })
      return
    }
    openReport(this, collectInput(this.data))
  },

  onReset() {
    wx.showModal({
      title: '恢复空白模板？',
      content: '这会清空实验信息及所有方案的已填读数，并恢复模板参数和测量点。',
      success: res => { if (res.confirm) { this.setData(createForm(this.data.experiment.id)); this.refreshCalculations() } },
    })
  },

  onGoBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/index/index' }) })
  },
})
