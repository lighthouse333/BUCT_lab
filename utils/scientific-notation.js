// 只转换显示，不解析为Number、不修约，也不改写测量字符串。
const lower = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '−', '₌': '=', '₍': '(', '₎': ')', 'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o', 'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't', 'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x', 'ᵦ': 'β', 'ᵧ': 'γ', 'ᵨ': 'ρ', 'ᵩ': 'φ', 'ᵪ': 'χ' }
const upper = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '−', '⁺': '+', '⁼': '=', '⁽': '(', '⁾': ')' }
const SCIENTIFIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+$/
const isScientific = value => SCIENTIFIC.test(String(value == null ? '' : value).trim())
function exponentText(value) {
  const sign = /^[-−]/.test(value) ? '−' : ''
  const digits = value.replace(/^[+−-]/, '').replace(/^0+(?=\d)/, '')
  return digits === '0' ? '0' : sign + digits
}
function notationSegments(value) {
  const input = String(value == null ? '' : value), segments = []
  function add(kind, content) {
    if (!content) return
    const last = segments[segments.length - 1]
    if (last && last.kind === kind) last.text += content
    else segments.push({ id: segments.length, kind, text: content })
  }
  for (let i = 0; i < input.length;) {
    const rest = input.slice(i)
    // 科学计数法只在数值边界识别；不会把文件名或标识符里的e误当指数。
    const scientific = (!i || !/[A-Za-z0-9_.]/.test(input[i - 1])) && rest.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))[eE]([+-]?\d+)(?![A-Za-z0-9_.])/)
    if (scientific) {
      add('normal', scientific[1] + ' × 10'); add('sup', exponentText(scientific[2])); i += scientific[0].length; continue
    }
    if (lower[input[i]] || upper[input[i]]) {
      const kind = lower[input[i]] ? 'sub' : 'sup', map = kind === 'sub' ? lower : upper
      let content = ''
      while (i < input.length && map[input[i]]) content += map[input[i++]]
      add(kind, content); continue
    }
    if (input[i] === '_' || input[i] === '^') {
      const isLower = input[i] === '_'
      const script = rest.slice(1).match(isLower ? /^(?:\{([^{}]+)\}|([A-Za-zΑ-ω0-9]+))/ : /^(?:\{([^{}]+)\}|\(([^()]+)\)|([+−-]?\d+(?:\.\d+)?|[A-Za-zΑ-ω]))/)
      if (script) {
        add(isLower ? 'sub' : 'sup', (script[1] || script[2] || script[3]).replace(/-/g, '−'))
        i += script[0].length + 1; continue
      }
    }
    add('normal', input[i++])
  }
  return segments
}
module.exports = { notationSegments, isScientific }
