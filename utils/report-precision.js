// 谢超然《大学物理实验》2015：P21–22、P30–33。
// 原始运算不修约；仅输出时执行四舍六入五凑偶，保留末尾有效零。
const superscripts = { '-': '⁻', '+': '⁺', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
const superscript = value => String(value).split('').map(c => superscripts[c] || c).join('')
function roundEven(value, place) {
  if (!Number.isFinite(value) || !Number.isInteger(place)) throw new Error('修约值须为有限数值')
  if (value === 0) return 0
  const sign = value < 0 ? -1 : 1
  const parts = String(Math.abs(value)).toLowerCase().split('e')
  const decimal = parts[0].split('.')
  const digits = decimal.join('')
  const count = decimal[0].length + Number(parts[1] || 0) - place
  if (count >= digits.length) return value
  const kept = count > 0 ? digits.slice(0, count) : '0'
  const tail = count >= 0 ? digits.slice(count) : '0'.repeat(-count) + digits
  const first = Number(tail[0] || 0)
  const up = first > 5 || (first === 5 && (/[1-9]/.test(tail.slice(1)) || Number(kept.slice(-1)) % 2 === 1))
  // 此整数来自JS可表示值的十进制短表示，不需要BigInt或平台专用库。
  return sign * (Number(kept) + (up ? 1 : 0)) * 10 ** place
}
function decimalText(value, place) {
  const rounded = roundEven(value, place)
  if (place <= 0 && place >= -100 && Math.abs(rounded) < 1e21) return rounded.toFixed(-place)
  return String(rounded)
}
function significantText(value, digits = 4) {
  if (value == null) return '待补充'
  if (value === 0) return '0'
  let exponent = Math.floor(Math.log10(Math.abs(value)))
  let rounded = roundEven(value, exponent - digits + 1)
  if (rounded === 0) return '0'
  exponent = Math.floor(Math.log10(Math.abs(rounded)))
  const place = exponent - digits + 1
  if (exponent < -3 || exponent >= 5) {
    const coefficient = rounded / 10 ** exponent
    return coefficient.toFixed(digits - 1) + ' × 10' + superscript(exponent)
  }
  return decimalText(rounded, place)
}
function unitText(unit) {
  return ({ 'J/K': 'J·K⁻¹', 'J/(kg·K)': 'J·kg⁻¹·K⁻¹', 'm^-1': 'm⁻¹', 'm^-3': 'm⁻³', 'm³/C': 'm³·C⁻¹', 'C/kg': 'C·kg⁻¹',
    'W/(m·K)': 'W·m⁻¹·K⁻¹', 'm²/(V·s)': 'm²·V⁻¹·s⁻¹', 'mV/(mA·T)': 'mV·mA⁻¹·T⁻¹', 'V/mm': 'V·mm⁻¹', 'mV/℃': 'mV·℃⁻¹' })[unit] || unit
}
function quantityText(value, unit, uncertainty, significantDigits = 4) {
  const u = uncertainty && uncertainty.complete ? uncertainty.reported : null
  const unitDisplay = unitText(unit)
  if (u == null || u === 0) return { value: significantText(value, significantDigits), uncertainty: u == null ? null : '0', unit: unitDisplay,
    expression: significantText(value, significantDigits) + (u === 0 ? ' ± 0' : '') + (unitDisplay ? ' ' + unitDisplay : '') }
  const uPlace = Math.floor(Math.log10(u)) - 1
  const uRounded = roundEven(u, uPlace)
  const place = Math.floor(Math.log10(uRounded)) - 1
  const vRounded = roundEven(value, place)
  const exponent = vRounded === 0 ? Math.floor(Math.log10(uRounded)) : Math.floor(Math.log10(Math.abs(vRounded)))
  if (exponent < -3 || exponent >= 5) {
    const digits = Math.max(0, Math.min(100, exponent - place)), scale = 10 ** exponent
    const v = (vRounded / scale).toFixed(digits), error = (uRounded / scale).toFixed(digits)
    return { value: v, uncertainty: error, exponent, unit: unitDisplay,
      expression: '(' + v + ' ± ' + error + ') × 10' + superscript(exponent) + (unitDisplay ? ' ' + unitDisplay : '') }
  }
  const v = decimalText(value, place), error = decimalText(u, place)
  return { value: v, uncertainty: error, unit: unitDisplay, expression: '(' + v + ' ± ' + error + ')' + (unitDisplay ? ' ' + unitDisplay : '') }
}
module.exports = { roundEven, decimalText, significantText, quantityText, superscript, unitText }
