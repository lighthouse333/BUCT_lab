const { calculateReport, formatReport } = require('../../utils/experiment-report')
const { reportView } = require('../../utils/report-view')

Page({
  data: { loaded: false, loadError: '', title: '', summary: null, calculating: false, calculationError: '', showCoordinates: false },

  onLoad() {
    const channel = this.getOpenerEventChannel()
    if (!channel || !channel.on) { this.setData({ loadError: '请从实验表格页点击“开始计算”进入。' }); return }
    this.channel = channel
    channel.on('reportInput', payload => {
      if (this.data.loaded) return
      if (!payload || !payload.input || !payload.input.experimentId) { this.setData({ loadError: '未收到实验数据，请返回表格页重新计算。' }); return }
      this.input = payload.input
      this.setData({ loaded: true, loadError: '' })
      this.onCalculate()
    })
  },

  onReady() {
    if (!this.data.loaded && !this.data.loadError) this.setData({ loadError: '未收到实验记录，请从表格页点击“开始计算”进入。' })
  },

  onCalculate() {
    if (!this.input || this.data.calculating) return
    this.setData({ calculating: true, calculationError: '', summary: null })
    try {
      const report = calculateReport(this.input)
      this.report = report
      if (!report.experiment) { this.setData({ loadError: '实验数据不受支持，请返回表格页重新进入。', summary: null }); return }
      this.setData({ title: report.experiment.name, summary: reportView(report) })
      wx.setNavigationBarTitle({ title: report.kind === 'observation' ? '实验记录整理' : '实验计算结果' })
    } catch (e) {
      this.report = null
      this.setData({ summary: null, calculationError: '暂时无法完成计算，请核对数据后重试；也可返回修改原始记录。' })
    } finally { this.setData({ calculating: false }) }
  },

  onCopy() {
    if (!this.report || this.data.calculating || this.report.status === 'invalid') return
    wx.setClipboardData({ data: formatReport(this.report) })
  },

  onToggleCoordinates() { this.setData({ showCoordinates: !this.data.showCoordinates }) },
  onToggleResult(e) {
    const index = Number(e.currentTarget.dataset.index)
    const result = this.data.summary && this.data.summary.results[index]
    if (!Number.isInteger(index) || !result) return
    this.setData({ ['summary.results[' + index + '].expanded']: !result.expanded })
  },
  onBack() { wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/index/index' }) }) },
})
