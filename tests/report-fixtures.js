// 人工构造、可独立手算的校验数据；不是学生实测数据。
const { createForm, collectInput } = require('../utils/experiment-input')

function fixture(id, mode = '') {
  const form = createForm(id)
  if (mode) {
    form.mode = mode
    form.parameters.forEach(p => { p.visible = !p.modes || p.modes.includes(mode) })
    form.tables.forEach(t => { t.visible = !t.modes.length || t.modes.includes(mode) })
  }
  const p = (key, value) => { form.parameters.find(p => p.key === key).value = String(value) }
  const t = (key, setter) => {
    const table = form.tables.find(t => t.id === key)
    table.rows.forEach((row, i) => row.cells.forEach(cell => {
      if (cell.kind === 'number' || cell.kind === 'text') {
        const value = setter(cell.key, i, row.cells)
        if (value != null) cell.value = String(value)
      }
    }))
  }
  const fillObservations = () => {
    form.tables.filter(t => t.visible).forEach(table => table.rows.forEach(row => row.cells.forEach(cell => { if (cell.kind === 'text') cell.value = '测试用观察记录，非实测' })))
  }
  let options = {}
  if (id === 'young-modulus') {
    p('wireLength', 100); p('gravity', 10); p('micrometerZero', .01); p('diameterLimit', .004)
    p('leverDistanceM', 1); p('leverArmM', .1); p('extensionLimitMm', .01); p('leverDistanceLimitM', .001); p('leverArmLimitM', .0001)
    t('diameters', key => key === 'diameter' ? 2.01 : null)
    t('loading', (key, i) => key === 'loading' || key === 'unloading' ? (i * .2).toFixed(3) : null)
    options = { extensionModel: 'direct', limits: { extensionMm: .01 } }
  } else if (id === 'kelvin-bridge') {
    p('micrometerZero', .01)
    p('diameterLimitMm', .004); p('resistanceLimitOhm', .001)
    t('diameters', key => key === 'diameter' ? 2.01 : null)
    t('fixed-resistance', () => 1)
    t('variable-length', (key, i) => key === 'length' ? 20 + i * 5 : (20 + i * 5) / 40)
    options = { limits: { diameterMm: .004, resistanceReadingOhm: .001 }, graphical: { resistivity: [{ x: .2, y: .05 }, { x: .4, y: .1 }] } }
  } else if (id === 'torsion-pendulum') {
    p('cylinderMass', .08); p('sliderMass', .02); p('caliperDivision', .02)
    p('massLimitKg', .0001)
    t('diameters', () => 100)
    t('period-timing', key => key === 'tenT0' ? 10 : 10 * Math.sqrt(2))
    t('slider-timing', (key, i) => { const group = Math.floor(i / 5); const inertia = .0002 + (group ? .04 * (group * .05) ** 2 : 0); return 5 * Math.sqrt(inertia / .0001) })
    options = { sliderAssembly: 'tray-removed', sliderMassReference: 'single', limits: { massKg: .0001 }, graphical: { mass: [{ x: .0025, y: .0003 }, { x: .0625, y: .0027 }] } }
  } else if (id === 'sound-speed') {
    p('frequency', 40); p('temperature', 20)
    p('division', .01)
    for (const method of ['standing', 'traveling', 'lissajous']) t('positions-' + method, (key, i) => (i * (method === 'standing' ? 4.25 : 8.5)).toFixed(5))
    options = { lissajousStep: 'same-phase', frequencyExact: true, limits: { differenceMm: .01 } }
  } else if (id === 'strain-sensor') {
    for (const table of ['single-arm', 'full-bridge']) t(table, (key, i) => {
      if (key === 'x') return (i * .5).toFixed(3)
      const cycle = Number(key.slice(-1)), shift = (cycle - 2) * .002
      return (i + shift + (key.startsWith('forward') ? .005 : -.005)).toFixed(3)
    })
  } else if (id === 'ballistic-galvanometer') {
    for (const key of ['standardCapacitance1', 'standardCapacitance2', 'dischargeCapacitanceForward', 'dischargeCapacitanceReverse']) p(key, 1)
    for (const table of ['capacitance-1', 'capacitance-2']) t(table, (key, i) => key === 'voltage' ? 11 + i : (11 + i) * (key.startsWith('unknown') ? 2 : 1))
    for (const table of ['discharge-forward', 'discharge-reverse']) t(table, (key, i) => key === 'charge' ? 15 * Math.exp(-.01 * [5, 10, 20, 30, 40][i]) : [5, 10, 20, 30, 40][i])
    options = { chargeConvention: 'magnitudes', graphical: { capacitance1: [{ x: 11, y: 22 }, { x: 18, y: 36 }], capacitance2: [{ x: 11, y: 22 }, { x: 18, y: 36 }],
      dischargeForward: [{ x: 5, y: Math.log(15) - .05 }, { x: 40, y: Math.log(15) - .4 }], dischargeReverse: [{ x: 5, y: Math.log(15) - .05 }, { x: 40, y: Math.log(15) - .4 }] } }
  } else if (id === 'thermal-conductivity') {
    p('steadyU1', 50); p('steadyU2', 30)
    t('heating', (key, i) => i < 3 ? key === 'time' ? i : key === 'u1' ? 40 + i * 5 : 20 + i * 5 : '')
    t('cooling', (key, i) => i < 3 ? key === 'time' ? i : 35 - i * 5 : '')
    options = { sharedTemperatureCalibration: true, tangent: { slopeMvPerMin: -5, atVoltageMv: 30 } }
  } else if (id === 'rlc') {
    const phase = []
    for (const [table, r] of [['amplitude-200', 200], ['amplitude-20', 20]]) t(table, (key, i) => {
      const f = (i + 1) * 200, w = 2 * Math.PI * f, z = Math.hypot(r, w * .04 - 1 / (w * 1e-6)), current = 6 / z
      return { frequency: f / 1000, ul: current * w * .04, uc: current / (w * 1e-6), ur: current * r, us: 6 }[key]
    })
    t('phase-200', (key, i) => {
      const w = 2 * Math.PI * (i + 1) * 200, phi = Math.atan((w * .04 - 1 / (w * 1e-6)) / 200)
      phase[i] = Math.sign(phi)
      return key === 'frequency' ? (i + 1) / 5 : key === 'a' ? 1 : Math.sin(Math.abs(phi))
    })
    options = { peakDefinition: 'component-voltage', phaseSigns: phase, features: { f0Hz: 795.7747154594767, fLHz: 1125.3953951963827, fCHz: 562.6976975981913 } }
  } else if (id === 'hall-effect') {
    p('hallSensitivity', 1); p('solenoidHallSensitivity', 2); p('polarity', '教材U1-U2+U3-U4')
    p('longitudinalVoltageMv', 10); p('longitudinalCurrentMa', 2); p('voltageContactDistanceMm', 5); p('sampleWidthMm', 1.5)
    for (const table of ['working-current', 'magnet-current', 'axial-field']) t(table, (key, i) => {
      const uh = table === 'working-current' ? .01125 * (1.5 + .5 * i) : table === 'magnet-current' ? 3.5 * .0225 * (i + 1) * .1 : .06
      if (!key.startsWith('u')) return null
      return key === 'u2' || key === 'u4' ? -uh : uh
    })
    options = { polaritySequence: 'textbook', longitudinalVoltageMv: 10, longitudinalCurrentMa: 2, voltageContactDistanceMm: 5, sampleWidthMm: 1.5,
      graphical: { hallWorking: [{ x: 1.5, y: .016875 }, { x: 3.5, y: .039375 }], hallMagnet: [{ x: 100, y: .007875 }, { x: 500, y: .039375 }] } }
  } else if (id === 'pn-junction') {
    p('constantTemperature', 26.85); p('constantCurrent', 50)
    const slope = 1.602176634e-19 / (1.38e-23 * 300), intercept = Math.log(1e-6)
    t('constant-temperature', (key, i) => key === 'current' ? Math.exp(intercept + slope * ((35 + i) / 100)) : null)
    t('constant-current', (key, i) => key === 'temperature' ? (i + 1) * 10 : .6637 - .002 * (i + 1) * 10)
    options = { graphical: { pnCurrent: [{ x: .35, y: intercept + slope * .35 }, { x: .54, y: intercept + slope * .54 }], pnTemperature: [{ x: 10, y: .6437 }, { x: 40, y: .5837 }] } }
  } else if (id === 'fresnel-biprism') {
    p('slitPosition', 0); p('eyepiecePosition', 97.5)
    p('distanceLimitCm', .05); p('fringeSpanLimitMm', .004); p('image1LimitMm', .004); p('image2LimitMm', .004)
    for (const [table, width] of [['fringe-spacing', 3], ['image-l1', 2], ['image-l2', .5]]) t(table, (key, i) => key === 'start' ? 10 + i : 10 + i + width)
    options = { limits: { distanceCm: .05, fringeSpanMm: .004, image1Mm: .004, image2Mm: .004 } }
  } else if (id === 'polarization') {
    fillObservations(); t('quarter-wave-plate', (key, i) => key === 'actualAngle' ? [0, 15, 30, 45, 60, 75, 90][i] : null)
  } else if (id === 'single-slit') {
    p('slitWidth', .1); t('distances', () => 100)
    t('minima', key => ({ left: -18, center: 0, right: 18 })[key])
  } else if (id === 'zeeman-effect') {
    p('excitationCoefficientTA', 1); p('excitationCurrentA', 1); p('magneticField', 1); p('fpSpacing', .002); p('componentA', 4); p('componentB', 6)
    fillObservations()
    const da = Math.sqrt(96.4), db = Math.sqrt(103.6), ds3 = Math.sqrt(92.8), ds7 = Math.sqrt(107.2)
    const positions = form.mode === 'pi' ? { 'pi-rings': [15 - db / 2, 10, 15 - da / 2, 11, 19, 15 + da / 2, 20, 15 + db / 2] }
      : form.mode === 'sigma' ? { 'sigma-field': [15 - ds7 / 2, 15 - ds3 / 2, 15 + ds3 / 2, 15 + ds7 / 2], 'sigma-zero': [10, 11, 19, 20] }
        : { 'combined-rings': [10, 20, 11, 19, 15 - da / 2, 15 + da / 2, 15 - db / 2, 15 + db / 2] }
    for (const [table, values] of Object.entries(positions)) t(table, key => values[Number(key.replace('position', '')) - 1])
    options = { components: { a: 4, b: 6 }, ringUnit: 'mm' }
  } else if (id === 'michelson') {
    p('step', 50); p('zeroPosition', 51.23); p('whiteCenterPosition', 51.234)
    t('positions', (key, i) => key === 'order' ? i * 50 : (51.23492 + i * .01625).toFixed(5))
    fillObservations()
    options = { instrumentLimitTarget: 'difference', countUncertaintyKind: 'standard-relative' }
  }
  return { form, input: collectInput(form), options }
}

function spectralFixture() {
  return { input: { schemaVersion: 3, experimentId: 'spectral-analysis', mode: '', info: {},
    parameters: { density: '1000', relativeGratingUncertainty: '.1', angularInstrumentUncertainty: '.001', reference: '500', observedPhenomenon: '测试用谱线记录', elementAnalysis: '测试用分析' },
    tables: [{ id: 'spectral-readings', rows: Array.from({ length: 3 }, () => ({ minusLeft: '0', minusRight: '180', plusLeft: '60', plusRight: '240' })) }] }, options: {} }
}

module.exports = { fixture, spectralFixture }
