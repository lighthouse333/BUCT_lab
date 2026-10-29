// 供原生小程序排版的轻量公式树：分式、根号及上下标，不依赖网页或远程渲染。
const text = value => ({ kind: 'text', value: String(value) })
const row = children => ({ kind: 'row', children })
const fraction = (numerator, denominator) => ({ kind: 'fraction', numerator, denominator })
const script = (base, upper, lower) => ({ kind: 'script', base, upper: upper || null, lower: lower || null })
function splitTop(value, operator) {
  const parts = []; let depth = 0, start = 0, absolute = false
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (c === '|') absolute = !absolute
    if ('([{'.includes(c)) depth++
    if (')]}'.includes(c)) depth--
    if (c === operator && depth === 0 && !absolute) { parts.push(value.slice(start, i)); start = i + 1 }
  }
  if (!parts.length) return null
  parts.push(value.slice(start)); return parts
}
function unwrap(value) {
  value = value.trim()
  const closing = { '(': ')', '[': ']', '{': '}' }
  if (closing[value[0]] !== value[value.length - 1]) return value
  let depth = 0
  for (let i = 0; i < value.length - 1; i++) { if ('([{'.includes(value[i])) depth++; if (')]}'.includes(value[i])) depth--; if (depth === 0) return value }
  return value.slice(1, -1)
}
function binaryParts(value, operators) {
  const parts = [], signs = []; let depth = 0, absolute = false, start = 0
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (c === '|') absolute = !absolute
    if ('([{（'.includes(c)) depth++
    if (')]}）'.includes(c)) depth--
    if (depth || absolute || !operators.includes(c)) continue
    const previous = value.slice(0, i).trim().slice(-1)
    // 保留负号、10^-6等指数和科学计数法中的符号。
    if ('+-−'.includes(c) && (!previous || '+-−×·/=^('.includes(previous) || /\d[eE]$/.test(value.slice(0, i)))) continue
    parts.push(value.slice(start, i)); signs.push(c); start = i + 1
  }
  if (!parts.length) return null
  parts.push(value.slice(start))
  return { parts, signs }
}
function groupEnd(value, start) {
  const pairs = { '(': ')', '[': ']', '{': '}', '|': '|' }, close = pairs[value[start]]
  if (!close) return -1
  if (value[start] === '|') return value.indexOf('|', start + 1)
  let depth = 0
  for (let i = start; i < value.length; i++) {
    if (value[i] === value[start]) depth++
    if (value[i] === close && --depth === 0) return i
  }
  return -1
}
function parse(value) {
  value = String(value == null ? '' : value).trim().replace(/\*/g, '·')
  if (!value) return text('')
  const equal = splitTop(value, '=')
  if (equal) return row(equal.reduce((all, part, i) => all.concat(i ? [text(' = '), parse(part)] : [parse(part)]), []))
  // 先拆较低优先级运算，避免a/b×100%把100%错误排进分母。
  for (const operators of ['+−-', '×·']) {
    const expression = binaryParts(value, operators)
    if (expression) return row(expression.parts.reduce((all, part, i) => all.concat(i ? [text(' ' + expression.signs[i - 1] + ' '), parse(part)] : [parse(part)]), []))
  }
  const division = splitTop(value, '/')
  if (division) return division.slice(1).reduce((numerator, denominator) => fraction(numerator, parse(unwrap(denominator))), parse(unwrap(division[0])))
  const rootAt = value.indexOf('√')
  if (rootAt >= 0) {
    const bodyAt = rootAt + 1, end = value[bodyAt] === '(' ? groupEnd(value, bodyAt) : value.length - 1
    if (end >= bodyAt) {
      const root = { kind: 'root', body: parse(value[bodyAt] === '(' ? value.slice(bodyAt + 1, end) : value.slice(bodyAt, end + 1)) }
      if (rootAt === 0 && end === value.length - 1) return root
      return row([parse(value.slice(0, rootAt)), root, parse(value.slice(end + 1))])
    }
  }
  if (value.startsWith('sqrt(')) return parse('√' + value.slice(4))
  for (let i = 0; i < value.length; i++) {
    if (!'([|'.includes(value[i])) continue
    const end = groupEnd(value, i)
    if (end < 0) continue
    const body = value.slice(i + 1, end)
    if (/[/_^√+−]/.test(body)) return row([parse(value.slice(0, i)), text(value[i]), parse(body), text(value[end]), parse(value.slice(end + 1))])
    i = end
  }
  const index = value.match(/^(.*?)([a-zA-ZΑ-ω])_([a-zA-Z0-9Σ]+|\{[^}]+\})(.*)$/)
  if (index) return row([parse(index[1]), script(text(index[2]), null, text(index[3].replace(/[{}]/g, ''))), parse(index[4])])
  const power = value.match(/^(.*?)([a-zA-ZΑ-ω0-9]+)\^([+-]?\d+|[a-zA-Z]|\([^()]+\))(.*)$/)
  if (power) return row([parse(power[1]), script(text(power[2]), parse(unwrap(power[3])), null), parse(power[4])])
  return text(value)
}
function identify(node, prefix = 'm') {
  const result = { ...node, id: prefix }
  if (node.children) result.children = node.children.map((c, i) => identify(c, prefix + '-' + i))
  for (const key of ['numerator', 'denominator', 'body', 'base', 'upper', 'lower']) if (node[key]) result[key] = identify(node[key], prefix + '-' + key)
  return result
}
const formula = value => identify(parse(value))
module.exports = { text, row, fraction, script, formula, identify }
