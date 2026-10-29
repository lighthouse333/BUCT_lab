// 固定教材方法。这里不提供口径、模型或人工图解点选择。
// 仪器误差与装置尺寸来自录入页；未知实测量不默认为0。
function textbookOptions(input) {
  const p = input.parameters || {}, id = input.experimentId
  const limits = {}
  const copyLimit = (option, parameter) => { if (p[parameter] != null && String(p[parameter]).trim() !== '') limits[option] = p[parameter] }
  const options = { uncertaintyPolicy: 'course', coverageFactor: 2, autoGraph: true, limits }
  if (id === 'young-modulus') {
    options.extensionModel = 'optical-lever' // 教材P71–72，式3.1.6。
    options.leverDistanceM = p.leverDistanceM
    options.leverArmM = p.leverArmM
    copyLimit('extensionMm', 'extensionLimitMm'); copyLimit('diameterMm', 'diameterLimit')
    copyLimit('leverDistanceM', 'leverDistanceLimitM'); copyLimit('leverArmM', 'leverArmLimitM')
  } else if (id === 'kelvin-bridge') {
    copyLimit('diameterMm', 'diameterLimitMm'); copyLimit('resistanceReadingOhm', 'resistanceLimitOhm')
  } else if (id === 'torsion-pendulum') {
    options.sliderAssembly = 'tray-removed'; options.sliderMassReference = 'single'
    copyLimit('massKg', 'massLimitKg')
  } else if (id === 'sound-speed') {
    options.lissajousStep = 'same-phase'; options.frequencyExact = true
    copyLimit('differenceMm', 'division')
  } else if (id === 'ballistic-galvanometer') {
    // 有正反异号实测量时用带符号半差；两向均为幅值时用幅值平均。
    const charges = input.tables.filter(t => t.id.startsWith('capacitance-')).reduce((all, t) => all.concat(t.rows.reduce((a, r) => a.concat(r.standardForward, r.standardReverse, r.unknownForward, r.unknownReverse), [])), [])
    options.chargeConvention = charges.some(v => Number(v) < 0) ? 'signed' : 'magnitudes'
  } else if (id === 'thermal-conductivity') {
    options.sharedTemperatureCalibration = true
    options.autoCoolingTangent = true
  } else if (id === 'rlc') {
    options.peakDefinition = 'component-voltage'; options.autoFeatures = true
  } else if (id === 'hall-effect') {
    options.carrierModel = 'textbook'
    for (const key of ['longitudinalVoltageMv', 'longitudinalCurrentMa', 'voltageContactDistanceMm', 'sampleWidthMm']) if (p[key] != null) options[key] = p[key]
  } else if (id === 'fresnel-biprism') {
    for (const [option, parameter] of [['distanceCm', 'distanceLimitCm'], ['fringeSpanMm', 'fringeSpanLimitMm'], ['image1Mm', 'image1LimitMm'], ['image2Mm', 'image2LimitMm']]) copyLimit(option, parameter)
  } else if (id === 'pn-junction') options.bandgapModel = 'linear'
  else if (id === 'zeeman-effect') {
    options.ringUnit = 'mm'
    if (input.mode === 'combined') options.components = { a: p.componentA, b: p.componentB }
    options.excitationCoefficientTA = p.excitationCoefficientTA
    options.excitationCurrentA = p.excitationCurrentA
  } else if (id === 'michelson') {
    options.instrumentLimitTarget = 'single-reading'
    options.countUncertaintyKind = 'expanded-relative'; options.countCoverageFactor = 2
  }
  return options
}
module.exports = { textbookOptions }
