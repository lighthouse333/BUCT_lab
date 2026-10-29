const { calculateGroup, statistics, propagateWavelength } = require('../../utils/spectral-analysis')
const { collectSpectralInput } = require('../../utils/experiment-report')
const { openReport } = require('../../utils/report-navigation')
const fields = ['minusLeft', 'minusRight', 'plusLeft', 'plusRight']
const fmt = value => value == null ? '—' : Number(value.toPrecision(8)).toString()
const angle = value => {
  if (value == null) return '—'
  const minutes = Math.round(value * 60 * 10000) / 10000
  return `${Math.floor(minutes / 60)}° ${fmt(minutes % 60)}′`
}
const makeGroup = index => ({ id: index + 1, label: String(index + 1), minusLeft: '', minusRight: '', plusLeft: '', plusRight: '' })

Page({
  data: {
    groups: [makeGroup(0), makeGroup(1), makeGroup(2)],
    rows: [], tableWidth: 1150,
    studentClass: '', studentName: '', studentId: '', teacher: '', lineName: '',
    density: '300', relativeGratingUncertainty: '0.1', angularInstrumentUncertainty: '',
    reference: '', observedPhenomenon: '', elementAnalysis: '', result: null, message: '', parameterError: '',
    calculating: false,
  },
  onLoad() { this.recalculate() },
  onInfoInput(e) {
    const key = e.currentTarget.dataset.key
    if (!['studentClass', 'studentName', 'studentId', 'teacher', 'lineName', 'density', 'reference', 'relativeGratingUncertainty', 'angularInstrumentUncertainty', 'observedPhenomenon', 'elementAnalysis'].includes(key)) return
    this.setData({ [key]: e.detail.value })
    if (['density', 'reference', 'relativeGratingUncertainty', 'angularInstrumentUncertainty'].includes(key)) this.recalculate()
  },
  onReadingInput(e) {
    const { index, field } = e.currentTarget.dataset
    if (!fields.includes(field) || !this.data.groups[index]) return
    this.setData({ [`groups[${index}].${field}`]: e.detail.value })
    this.recalculate()
  },
  onAddGroup() {
    if (this.data.groups.length >= 30) return
    this.setData({ groups: this.data.groups.concat(makeGroup(this.data.groups.length)) })
    this.recalculate()
  },
  onRemoveGroup() {
    if (this.data.groups.length <= 1) return
    const remove = () => { this.setData({ groups: this.data.groups.slice(0, -1) }); this.recalculate() }
    const last = this.data.groups[this.data.groups.length - 1]
    if (fields.some(key => last[key].trim())) {
      wx.showModal({ title: '删除最后一组？', content: '该组已填写的读数会被删除。', success: res => { if (res.confirm) remove() } })
    } else remove()
  },
  recalculate() {
    const calculated = this.data.groups.map(calculateGroup)
    const rows = calculated.map((item, index) => ({
      id: index + 1, label: this.data.groups[index].label,
      left: angle(item.left), right: angle(item.right), corrected: angle(item.corrected), theta: angle(item.theta),
      error: item.error || '', warning: item.warning || '',
    }))
    const blocked = calculated.some(item => item.state === 'invalid' || item.state === 'incomplete')
    const valid = calculated.filter(item => item.state === 'valid')
    let message = blocked ? '有测量组未填完整或格式错误，补齐后再生成汇总，避免漏算测量次数。' : ''
    let parameterError = ''
    const relativeDText = this.data.relativeGratingUncertainty.trim()
    const ubText = this.data.angularInstrumentUncertainty.trim()
    const numericPattern = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
    const relativeD = Number(relativeDText), ub = ubText ? Number(ubText) : null
    if (!numericPattern.test(relativeDText) || !Number.isFinite(relativeD) || relativeD < 0) parameterError = '请填写光栅常数的非负相对标准不确定度（%）。'
    if (ubText && (!numericPattern.test(ubText) || !Number.isFinite(ub) || ub < 0)) parameterError = '角度仪器标准不确定度须为非负数，单位rad。'
    let result = null
    if (!blocked && valid.length) {
      const stats = statistics(valid.map(item => item.theta))
      result = {
        n: stats.n, mean: angle(stats.mean), meanDegrees: fmt(stats.mean),
        variance: fmt(stats.variance), sd: fmt(stats.sd), sem: fmt(stats.sem), tp: fmt(stats.tp), ua: fmt(stats.ua),
        meanRadians: fmt(stats.mean * Math.PI / 180), uaRadians: fmt(stats.ua == null ? null : stats.ua * Math.PI / 180),
        wavelength: '—', wavelengthUncertainty: '—', thetaUncertainty: '—', gratingContribution: '—', complete: false, relativeError: '—',
      }
      if (stats.n === 1) message = '仅有1次测量：可计算衍射角与波长，不能估计实验方差及A类不确定度。'
      else if (stats.tp == null) message = `教材表1.1.2未列出n=${stats.n}的系数，暂不计算A类不确定度，不自动插值或套用邻近值。`
      if (this.data.density.trim()) {
        const density = Number(this.data.density)
        if (!Number.isFinite(density) || density <= 0) parameterError = '光栅刻线密度须为大于0的数值。'
        else if (!parameterError) {
          const propagation = propagateWavelength(stats.mean, density, stats.ua, relativeD, ub)
          const lambda = propagation.lambda
          result.wavelength = fmt(lambda)
          result.wavelengthUncertainty = fmt(propagation.knownUncertainty)
          result.thetaUncertainty = fmt(propagation.thetaUncertainty)
          result.gratingContribution = fmt(propagation.gratingContribution)
          result.complete = propagation.complete
          if (this.data.reference.trim()) {
            const reference = Number(this.data.reference)
            if (!Number.isFinite(reference) || reference <= 0) parameterError = '参考波长须为大于0的数值。'
            else result.relativeError = fmt(Math.abs(lambda - reference) / reference * 100)
          }
        }
      }
    }
    this.setData({ rows, result, message, parameterError, tableWidth: 1150 })
  },
  onCopy() {
    const r = this.data.result
    if (!r || this.data.parameterError) return
    const text = [
      '光谱定性分析（±1级，同一谱线重复测量）',
      `班级：${this.data.studentClass} 姓名：${this.data.studentName} 学号：${this.data.studentId}`,
      `任课教师：${this.data.teacher} 谱线：${this.data.lineName}`,
      ...this.data.groups.map((g, i) => `${g.label}: -1级左=${g.minusLeft}，右=${g.minusRight}；+1级左=${g.plusLeft}，右=${g.plusRight}；θ=${this.data.rows[i].theta}`),
      `n=${r.n}；p=0.683；tp=${r.tp}`,
      `平均衍射角=${r.mean}（${r.meanDegrees}°）`,
      `实验方差s²=${r.variance} °²；实验标准差s=${r.sd}°；均值标准差=${r.sem}°`,
      `A类不确定度uA(θ)=${r.ua}°`,
      `平均θ=${r.meanRadians} rad；uA(θ)=${r.uaRadians} rad；合成u(θ)=${r.thetaUncertainty} rad`,
      `光栅刻线密度=${this.data.density || '未填写'} 条/mm；波长=${r.wavelength} nm`,
      `光栅常数相对标准不确定度=${this.data.relativeGratingUncertainty}%；角度仪器标准不确定度=${this.data.angularInstrumentUncertainty || '未提供'} rad`,
      `${r.complete ? '合成波长标准不确定度' : '波长不确定度已知项合成值（不完整）'}=${r.wavelengthUncertainty} nm；相对误差=${r.relativeError}%`,
      r.complete ? '按各项独立的条件合成；以上为计算值，报告最终修约另行处理。' : '缺少角度仪器项或可估计的A类项，不能作为完整总不确定度。',
      `实验现象：${this.data.observedPhenomenon || '未填写'}`,
      `结合现象及计算结果分析发光元素：${this.data.elementAnalysis || '未填写'}`,
      this.data.message,
      ...this.data.rows.filter(row => row.warning).map(row => `${row.label}：${row.warning}`),
    ].filter(Boolean).join('\n')
    wx.setClipboardData({ data: text })
  },
  onStartCalculation() {
    if (this.data.calculating) return
    this.recalculate()
    if (!this.data.result || this.data.parameterError || !this.data.density.trim()) {
      wx.showToast({ title: '请先补齐并检查原始读数和光栅参数', icon: 'none' })
      return
    }
    openReport(this, collectSpectralInput(this.data))
  },
})
