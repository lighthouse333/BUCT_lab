// 谢超然《大学物理实验》(2015)，表1.1.2，p=0.683；表头为测量次数n。
const TP = { 2: 1.84, 3: 1.32, 4: 1.20, 5: 1.14, 6: 1.11, 7: 1.09, 8: 1.08, 9: 1.07, 10: 1.06, 15: 1.05, 20: 1.04, 30: 1.03 }
const blank = value => String(value == null ? '' : value).trim() === ''

function parseAngle(value) {
  const text = String(value).trim()
  // 接受十进制度，或“度:分”、度分符号；不把12.30解释成12°30′。
  let degrees
  if (/^\d+(?:\.\d+)?$/.test(text)) degrees = Number(text)
  else {
    const match = text.match(/^(\d+)\s*(?:°|度|:)\s*(\d+(?:\.\d+)?)\s*(?:′|'|分)?$/)
    if (!match || Number(match[2]) >= 60) throw new Error('请输入十进制度或度:分，分必须小于60')
    degrees = Number(match[1]) + Number(match[2]) / 60
  }
  if (!Number.isFinite(degrees) || degrees < 0 || degrees >= 360) throw new Error('角度必须在0°（含）至360°（不含）之间')
  return degrees
}

function separation(a, b) {
  const delta = Math.abs(a - b) % 360
  return Math.min(delta, 360 - delta)
}

function calculateGroup(group) {
  const fields = ['minusLeft', 'minusRight', 'plusLeft', 'plusRight']
  if (fields.every(key => blank(group[key]))) return { state: 'empty' }
  if (fields.some(key => blank(group[key]))) return { state: 'incomplete', error: '请补齐本组四个游标读数' }
  try {
    const values = fields.map(key => parseAngle(group[key]))
    const left = separation(values[0], values[2])
    const right = separation(values[1], values[3])
    const corrected = (left + right) / 2
    if (corrected <= 0 || corrected >= 180) throw new Error('衍射角须大于0°且小于90°，请检查谱线读数')
    const warning = [separation(values[0], values[1]), separation(values[2], values[3])]
      .some(value => Math.abs(value - 180) > 1) ? '左右游标相差偏离180°超过1°，请核对读数' : ''
    return { state: 'valid', left, right, corrected, theta: corrected / 2, warning }
  } catch (error) { return { state: 'invalid', error: error.message } }
}

function statistics(values) {
  const n = values.length
  if (!n || values.some(value => !Number.isFinite(value))) throw new Error('需要有效测量值')
  const mean = values.reduce((sum, value) => sum + value, 0) / n
  if (n === 1) return { n, mean, variance: null, sd: null, sem: null, tp: null, ua: null }
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)
  const sd = Math.sqrt(variance)
  const sem = sd / Math.sqrt(n)
  const tp = TP[n] == null ? null : TP[n]
  return { n, mean, variance, sd, sem, tp, ua: tp == null ? null : tp * sem }
}

function wavelength(theta, linesPerMm) {
  if (!Number.isFinite(linesPerMm) || linesPerMm <= 0) throw new Error('光栅刻线密度必须为正数')
  return 1e6 / linesPerMm * Math.sin(theta * Math.PI / 180)
}

module.exports = { TP, parseAngle, separation, calculateGroup, statistics, wavelength }
