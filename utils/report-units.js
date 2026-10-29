// 计算值保持原单位；报告显示按实验表格选择明确的单位，同时换算不确定度。
const { scaledUncertainty } = require('./report-math')
const { quantityText, unitText } = require('./report-precision')
const profiles = {
  'single-slit': { distance: ['cm', 100], darkDistance: ['mm', 1000] },
  'young-modulus': { extension: ['mm', 1000], diameter: ['mm', 1000], length: ['cm', 100], 'lever-distance': ['m', 1], 'lever-arm': ['m', 1] },
  'kelvin-bridge': { diameter: ['mm', 1000], length: ['cm', 100] },
  'torsion-pendulum': { diameter: ['mm', 1000] },
  'fresnel-biprism': { distance: ['cm', 100], 'fringe-spacing-mean': ['mm', 1000], 'image-l1-mean': ['mm', 1000], 'image-l2-mean': ['mm', 1000], sourceSeparation: ['mm', 1000] },
  'sound-speed': { standingDifference: ['mm', 1000], standingWavelength: ['mm', 1000], travelingWavelength: ['mm', 1000], lissajousWavelength: ['mm', 1000] },
  rlc: { resonanceFrequencyTheory: ['kHz', .001], inductorPeakFrequencyTheory: ['kHz', .001], capacitorPeakFrequencyTheory: ['kHz', .001], f0Hz: ['kHz', .001], fLHz: ['kHz', .001], fCHz: ['kHz', .001] },
}
const notes = {
  'single-slit': '衍射距离 cm · 暗纹距离 mm · 波长 nm',
  'young-modulus': '原长 cm · 直径与标尺逐差 mm · 杨氏模量 Pa',
  'kelvin-bridge': '长度 cm · 直径 mm · 电阻 Ω · 电阻率 Ω·m',
  'torsion-pendulum': '直径 mm · 周期 s · 惯量 kg·m²',
  'fresnel-biprism': '传播距离 cm · 条纹与像间距 mm · 波长 nm',
  'sound-speed': '逐差与波长 mm · 声速 m/s',
  rlc: '频率 kHz · 电压 V · 品质因数无量纲',
}
function displayResult(experimentId, result) {
  const profile = (profiles[experimentId] || {})[result.id]
  const unit = profile ? profile[0] : result.unit, scale = profile ? profile[1] : 1
  return { ...result, value: result.value * scale, unit: unitText(unit), scale,
    reference: result.reference == null ? null : result.reference * scale,
    uncertainty: result.uncertainty ? scaledUncertainty(result.uncertainty, scale) : null }
}
function reportQuantity(experimentId, result) {
  const d = displayResult(experimentId, result)
  return { ...quantityText(d.value, d.unit, d.uncertainty), scale: d.scale, sourceUnit: result.unit }
}
const unitNote = experimentId => notes[experimentId] || '结果值与不确定度使用同一单位，单位随物理量标注。'
module.exports = { displayResult, reportQuantity, unitNote }
