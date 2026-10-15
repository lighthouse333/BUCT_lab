const {
  createForm, evaluateForm, resizeTable, collectPayload, makeDraft, restoreDraft,
  PERSONAL_KEYS, NOTE_KEYS, blank,
} = require('../../utils/experiment-input')

const draftKey = id => `buct-lab:experiment-input:v1:${id}`
const identifiedErrors = errors => errors.map((error, index) => ({ ...error, id: `error-${index}` }))

Page({
  data: { form: null, loadError: '', showErrors: false, validationErrors: [], status: '', saved: false },

  onLoad(options) {
    try {
      const id = options.id
      let form = createForm(id), status = ''
      try {
        const saved = wx.getStorageSync(draftKey(id))
        if (saved) { form = restoreDraft(id, saved); status = '已恢复这项实验的本机草稿' }
      } catch (error) { status = '草稿无法恢复，已打开空白模板；请核对后重新填写。' }
      this._dirty = false
      this.setData({ form, status })
      wx.setNavigationBarTitle({ title: `${form.number} · 数据录入` })
    } catch (error) { this.setData({ loadError: error.message }) }
  },

  onInfoInput(e) {
    const key = e.currentTarget.dataset.key
    if (!PERSONAL_KEYS.includes(key)) return
    this._dirty = true
    this.setData({ [`form.personal.${key}`]: e.detail.value, saved: false })
    if (this.data.showErrors) this.refresh()
  },

  onDateChange(e) {
    this._dirty = true
    this.setData({ 'form.personal.experimentDate': e.detail.value, saved: false })
  },

  onParameterInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.form.parameters[index]) return
    this._dirty = true
    this.setData({ [`form.parameters[${index}].value`]: e.detail.value, saved: false })
    this.refresh()
  },

  onNoteInput(e) {
    const key = e.currentTarget.dataset.key
    if (!NOTE_KEYS.includes(key)) return
    this._dirty = true
    this.setData({ [`form.notes.${key}`]: e.detail.value, saved: false })
  },

  onCellInput(e) {
    const ti = Number(e.currentTarget.dataset.table), ri = Number(e.currentTarget.dataset.row), ci = Number(e.currentTarget.dataset.column)
    if (![ti, ri, ci].every(Number.isInteger)) return
    const table = this.data.form.tables[ti], row = table && table.rows[ri], cell = row && row.cells[ci]
    if (!cell || !cell.editable) return
    this._dirty = true
    this.setData({ [`form.tables[${ti}].rows[${ri}].cells[${ci}].value`]: e.detail.value, saved: false })
    this.refresh()
  },

  refresh() {
    const form = evaluateForm(this.data.form)
    const result = this.data.showErrors ? collectPayload(form) : null
    this.setData({ form, validationErrors: result && !result.ok ? identifiedErrors(result.errors) : [] })
  },

  onAddRow(e) {
    const index = Number(e.currentTarget.dataset.table), table = this.data.form.tables[index]
    if (!table || table.derived) return
    if (resizeTable(this.data.form, index, table.addStep)) {
      this._dirty = true
      this.setData({ form: this.data.form, saved: false })
      this.refresh()
    }
  },

  onRemoveRow(e) {
    const index = Number(e.currentTarget.dataset.table), table = this.data.form.tables[index]
    if (!table || table.derived || table.rows.length - table.addStep < table.minRows) return
    const remove = () => {
      resizeTable(this.data.form, index, -table.addStep)
      this._dirty = true
      this.setData({ form: this.data.form, saved: false })
      this.refresh()
    }
    const tail = table.rows.slice(-table.addStep)
    if (tail.some(row => row.cells.some(cell => cell.editable && !blank(cell.value)))) {
      wx.showModal({ title: `删除最后 ${table.addStep} 行？`, content: '这些行中的读数将被删除，其他表格保持原样。',
        success: res => { if (res.confirm) remove() } })
    } else remove()
  },

  saveDraft(silent) {
    if (!this.data.form) return
    try {
      wx.setStorageSync(draftKey(this.data.form.experimentId), makeDraft(this.data.form))
      this._dirty = false
      this.setData({ saved: true, status: '草稿已保存在本机；不同实验分别保存。' })
      if (!silent) wx.showToast({ title: '草稿已保存', icon: 'success' })
    } catch (error) {
      this.setData({ status: '本机草稿保存失败，请检查设备存储，或先复制已填写的数据。' })
      if (!silent) wx.showToast({ title: '草稿保存失败', icon: 'none' })
    }
  },
  onSaveDraft() { this.saveDraft(false) },
  onHide() { if (this._dirty) this.saveDraft(true) },
  onUnload() { if (this._dirty) this.saveDraft(true) },

  onCopyData() {
    const result = collectPayload(this.data.form)
    this.setData({ form: this.data.form, showErrors: true, validationErrors: result.ok ? [] : identifiedErrors(result.errors) })
    if (!result.ok) {
      wx.showToast({ title: `还有 ${result.errors.length} 项需要核对`, icon: 'none' })
      const first = result.errors[0]
      wx.pageScrollTo({ selector: first.section === 'personal' ? '#personal' : first.section === 'parameters' ? '#parameters' : `#table-${first.section}`, duration: 250 })
      return
    }
    wx.setClipboardData({ data: JSON.stringify(result.payload, null, 2),
      success: () => {
        this.saveDraft(true)
        this.setData({ status: '数据检查通过，JSON 已复制。可交给数据处理模块；当前页面尚未生成完整报告。' })
      }, fail: () => wx.showToast({ title: '复制失败，请先保存草稿', icon: 'none' }) })
  },

  onClear() {
    wx.showModal({ title: '清空本实验的草稿？', content: '将清空个人信息和实测读数，恢复模板预设值。其他实验草稿不受影响。',
      success: res => {
        if (!res.confirm) return
        const id = this.data.form.experimentId
        try { wx.removeStorageSync(draftKey(id)) }
        catch (error) { wx.showToast({ title: '清除草稿失败，请稍后重试', icon: 'none' }); return }
        this._dirty = false
        this.setData({ form: createForm(id), showErrors: false, validationErrors: [], saved: false, status: '已恢复空白记录模板' })
      } })
  },
})
