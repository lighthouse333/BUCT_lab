const { CalculationError, numeric, finite, mean, measurement, decimalDifference } = require('../report-math')

const col = (key, label, unit = '') => ({ key, label, unit })
const optionalParameter = (c, key) => c.p[key] == null || String(c.p[key]).trim() === '' ? null : c.param(key, { min: 0 })

function young(c) {
  const loading = c.run('loading', () => {
    const rows = c.rows('loading', ['mass', 'loading', 'unloading'], { count: 10, rules: { mass: { min: 0 } } })
    const gravity = c.param('gravity', { positive: true })
    const averaged = rows.map(r => ({ ...r, average: (r.loading + r.unloading) / 2 }))
    c.table('loading-mean', '加载卸载平均读数', [col('sourceRow', '序号'), col('mass', '质量', 'g'), col('loading', '加载', 'mm'), col('unloading', '卸载', 'mm'), col('average', '平均标尺读数', 'mm')], averaged)
    const pairs = averaged.slice(0, 5).map((r, i) => ({ pair: (i + 1) + '→' + (i + 6), force: Math.abs(decimalDifference(averaged[i + 5].mass, r.mass)) * 1e-3 * gravity, extension: Math.abs(decimalDifference(averaged[i + 5].average, r.average)) }))
    pairs.forEach(r => { c.requirePositive(r.force, 'loading.force'); c.requirePositive(r.extension, 'loading.extension') })
    c.table('differences', '五组逐差', [col('pair', '配对'), col('force', '外力差', 'N'), col('extension', '标尺位移差', 'mm')], pairs)
    if (pairs.some(r => Math.abs(r.force - pairs[0].force) > Math.abs(pairs[0].force) * 1e-9)) throw new CalculationError('UNEQUAL_FORCE_STEPS', '当前五组平均逐差公式要求外力差相同，请核对质量点', 'tables.loading')
    c.chart('loading', '加载卸载曲线', '质量', 'g', '标尺读数', 'mm', ['loading', 'unloading'].map(key => ({ id: key, label: key === 'loading' ? '加载' : '卸载', points: rows.map(r => ({ x: r.mass, y: r[key] })) })))
    return { force: pairs[0].force, displacement: c.estimate('extension', '平均标尺位移差', pairs.map(r => r.extension), c.limit('extensionMm'), 'm', 1e-3) }
  })
  const diameter = c.run('diameter', () => {
    const zero = c.param('micrometerZero')
    const values = c.rows('diameters', ['diameter'], { count: 5 }).map(r => c.requirePositive(r.diameter - zero, 'diameter.corrected'))
    c.table('diameter-corrected', '直径零点修正', [col('number', '序号'), col('corrected', '修正直径', 'mm')], values.map((v, i) => ({ number: i + 1, corrected: v })))
    return c.estimate('diameter', '平均钢丝直径', values, c.limit('diameterMm', optionalParameter(c, 'diameterLimit')), 'm', 1e-3)
  })
  const length = c.run('length', () => c.estimate('length', '钢丝原长', [c.param('wireLength', { positive: true })], c.limit('lengthCm', c.param('division', { positive: true }) / 20), 'm', 1e-2))
  c.run('young-modulus', () => {
    const model = c.choice('extensionModel', ['direct', 'optical-lever'])
    if (!loading || !diameter || !length) return
    const f = loading.force, C = loading.displacement, d = diameter, L = length
    let factor = 1, D = null, arm = null
    if (model === 'optical-lever') {
      D = c.estimate('lever-distance', '镜面到标尺距离', [c.option('leverDistanceM', { positive: true })], c.limit('leverDistanceM'), 'm')
      arm = c.estimate('lever-arm', '光杠杆臂长', [c.option('leverArmM', { positive: true })], c.limit('leverArmM'), 'm')
      factor = 2 * D.value / arm.value
    }
    const value = finite(4 * f * L.value * factor / (Math.PI * d.value ** 2 * C.value))
    const terms = [{ name: '原长', derivative: value / L.value, u: L.u }, { name: '直径', derivative: -2 * value / d.value, u: d.u }, { name: '逐差位移', derivative: -value / C.value, u: C.u }]
    if (D) terms.push({ name: '镜尺距离', derivative: value / D.value, u: D.u }, { name: '光杠杆臂长', derivative: -value / arm.value, u: arm.u })
    c.assume('外力按原件作为给定量；质量g换kg后计算。直径误差限应包含所采用零点修正的误差预算。')
    c.metric('youngModulus', '杨氏模量', value, 'Pa', model === 'direct' ? 'E=4FL/(πd²C)' : 'E=8FLD/(πd²bC)',
      { uncertainty: c.propagate(terms), reference: c.options.referenceModulusPa == null ? 2e11 : c.option('referenceModulusPa', { positive: true }), inputs: { forceN: f, lengthM: L.value, diameterM: d.value, displacementM: C.value, opticalAmplification: factor } })
  })
}

function kelvin(c) {
  const ratio = c.run('bridge-ratio', () => {
    const a = c.param('r1', { positive: true }) / c.param('r3', { positive: true })
    const b = c.param('r2', { positive: true }) / c.param('r4', { positive: true })
    if (Math.abs(a - b) > Math.max(a, b) * 1e-9) throw new CalculationError('BRIDGE_UNBALANCED_RATIO', '须满足R₁/R₃=R₂/R₄，否则不能忽略附加电阻修正', 'parameters.r1')
    c.metric('bridgeRatio', '电桥倍率', a, '', 'α=R₁/R₃', { inputs: { r1: c.p.r1, r3: c.p.r3 } })
    c.assume('所给桥臂电阻/倍率作为给定常数；若需倍率不确定度，须另补桥臂校准误差。')
    return a
  })
  const d = c.run('diameter', () => {
    const zero = c.param('micrometerZero')
    return c.estimate('diameter', '铜棒平均直径', c.rows('diameters', ['diameter'], { count: 5 }).map(r => c.requirePositive(r.diameter - zero, 'diameter.corrected')), c.limit('diameterMm'), 'm', 1e-3)
  })
  const length = c.run('length', () => c.estimate('length', '定长铜棒长度', [c.param('fixedLength', { positive: true })], c.limit('lengthCm', c.param('lengthDivision', { positive: true }) / 20), 'm', 1e-2))
  const fixed = c.run('fixed-resistance', () => {
    const rows = c.rows('fixed-resistance', ['forward', 'reverse'], { count: 5, rules: { forward: { positive: true }, reverse: { positive: true } } })
    const r = rows.map(row => ({ ...row, average: (row.forward + row.reverse) / 2, resistance: ratio == null ? null : ratio * (row.forward + row.reverse) / 2 }))
    c.table('fixed-processed', '正反向换向平均与电阻', [col('sourceRow', '序号'), col('forward', '正向R_N', 'Ω'), col('reverse', '反向R_N', 'Ω'), col('average', '换向均值R_N', 'Ω'), col('resistance', '被测电阻R_x', 'Ω')], r)
    return c.estimate('resistanceReading', '电阻箱平均读数', r.map(r => r.average), c.limit('resistanceReadingOhm'), 'Ω')
  })
  c.run('resistivity', () => {
    if (ratio == null || !d || !length || !fixed) return
    const value = ratio * fixed.value * Math.PI * d.value ** 2 / (4 * length.value)
    c.metric('resistivity', '定长法电阻率', value, 'Ω·m', 'ρ=αR_Nπd²/(4L)', { uncertainty: c.propagate([
      { name: '电阻箱均值', derivative: value / fixed.value, u: fixed.u }, { name: '直径', derivative: 2 * value / d.value, u: d.u }, { name: '长度', derivative: -value / length.value, u: length.u }]),
    ...(c.options.referenceResistivity == null ? {} : { reference: c.option('referenceResistivity', { positive: true }) }) })
  })
  c.run('variable-length', () => {
    if (ratio == null) return
    const vr = c.options.variableRatio == null ? ratio : c.option('variableRatio', { positive: true })
    c.assume('变长度表采用倍率' + vr + '，须与该表实际接线一致。')
    const rows = c.rows('variable-length', ['length', 'forward', 'reverse'], { min: 2, rules: { length: { positive: true }, forward: { positive: true }, reverse: { positive: true } } })
      .map(r => ({ ...r, lengthM: r.length * 1e-2, average: (r.forward + r.reverse) / 2, resistance: vr * (r.forward + r.reverse) / 2 }))
    c.table('variable-processed', '变长度铜棒电阻', [col('length', '长度', 'cm'), col('forward', '正向R_N', 'Ω'), col('reverse', '反向R_N', 'Ω'), col('average', '换向均值', 'Ω'), col('resistance', 'R_x', 'Ω')], rows)
    const pts = rows.map(r => ({ x: r.lengthM, y: r.resistance }))
    c.chart('resistance-length', '电阻与长度关系', '长度', 'm', '电阻', 'Ω', [{ id: 'measured', label: '换向测量值', points: pts }], 'graph-paper')
    const fit = c.fit('resistivity-auxiliary-fit', pts, 'resistance-length')
    if (d) c.metric('resistivityFit', '回归辅助电阻率', fit.slope * Math.PI * d.value ** 2 / 4, 'Ω·m', 'ρ=bπd²/4', { method: 'least-squares', fit })
    const graph = c.graph('resistivity-graph', 'resistivity', 'resistance-length')
    c.requirePositive(graph.slope, 'options.graphical.resistivity')
    if (d) c.metric('resistivityGraphical', '图解法电阻率', graph.slope * Math.PI * d.value ** 2 / 4, 'Ω·m', 'ρ=bπd²/4', { method: 'graphical', fit: graph,
      ...(c.options.referenceResistivity == null ? {} : { reference: c.option('referenceResistivity', { positive: true }) }) })
  })
}

function torsion(c) {
  const diameter = c.run('diameter', () => c.estimate('diameter', '圆柱平均直径', c.rows('diameters', ['diameter'], { count: 5, rules: { diameter: { positive: true } } }).map(r => r.diameter), c.limit('diameterMm', c.param('caliperDivision', { positive: true })), 'm', 1e-3))
  const mass = c.run('mass', () => c.estimate('cylinderMass', '圆柱质量', [c.param('cylinderMass', { positive: true })], c.limit('massKg'), 'kg'))
  const periods = c.run('periods', () => {
    const rows = c.rows('period-timing', ['tenT0', 'tenT1'], { count: 5, rules: { tenT0: { positive: true }, tenT1: { positive: true } } })
    const limit = c.param('stopwatchPrecision', { positive: true }) / 10
    c.table('single-periods', '累计计时换算单周期', [col('sourceRow', '序号'), col('t0', 'T₀', 's'), col('t1', 'T₁', 's')], rows.map(r => ({ sourceRow: r.sourceRow, t0: r.tenT0 / 10, t1: r.tenT1 / 10 })))
    return { t0: c.estimate('T0', '空托盘周期', rows.map(r => r.tenT0 / 10), limit, 's'), t1: c.estimate('T1', '托盘加圆柱周期', rows.map(r => r.tenT1 / 10), limit, 's') }
  })
  const calibration = c.run('torsion-calibration', () => {
    if (!diameter || !mass || !periods) return null
    const D = diameter.value, M = mass.value, t0 = periods.t0.value, t1 = periods.t1.value
    const den = t1 ** 2 - t0 ** 2
    c.requirePositive(den, 'periods.T1²−T0²')
    const ic = M * D ** 2 / 8
    const ui = c.propagate([{ name: '质量', derivative: D ** 2 / 8, u: mass.u }, { name: '直径', derivative: M * D / 4, u: diameter.u }])
    c.metric('cylinderInertia', '塑料圆柱转动惯量', ic, 'kg·m²', 'I_c=MD²/8', { uncertainty: ui })
    const K = 4 * Math.PI ** 2 * ic / den
    const uk = c.propagate([{ name: '圆柱惯量', derivative: K / ic, u: ui.combined }, { name: 'T₁', derivative: -2 * K * t1 / den, u: periods.t1.u }, { name: 'T₀', derivative: 2 * K * t0 / den, u: periods.t0.u }])
    c.metric('torsionConstant', '扭摆常数', K, 'N·m/rad', 'K=4π²I_c/(T₁²−T₀²)', { uncertainty: uk })
    return { ic, ui, K, den }
  })
  c.run('slider', () => {
    const raw = c.rawRows('slider-timing')
    const values = c.rows('slider-timing', ['fiveTx'], { count: 30, rules: { fiveTx: { positive: true } } })
    const groups = []
    for (let i = 0; i < 6; i++) {
      const group = values.slice(i * 5, i * 5 + 5)
      const position = raw[i * 5].position
      if (raw.slice(i * 5, i * 5 + 5).some(r => r.position !== position)) throw new CalculationError('MIXED_POSITIONS', '每个位置的5次计时必须具有相同位置标记', 'tables.slider-timing')
      const x = i === 0 && position === '金属细杆' ? null : numeric(position, 'tables.slider-timing.position', { positive: true }) * 1e-2
      if (i === 0 && x != null) throw new CalculationError('ROD_BASELINE_REQUIRED', '第一组应为金属细杆基线', 'tables.slider-timing.position')
      const e = measurement(group.map(r => r.fiveTx / 5), c.param('stopwatchPrecision', { positive: true }) / 5, { policy: c.options.uncertaintyPolicy || 'course', coverageFactor: c.options.coverageFactor })
      groups.push({ position, x, xSquared: x == null ? null : x * x, meanFiveTx: e.mean * 5, period: e.mean, uncertainty: e.uncertainty,
        totalInertia: calibration ? calibration.K * e.mean ** 2 / (4 * Math.PI ** 2) : null })
    }
    const assembly = c.run('sliderAssembly', () => c.choice('sliderAssembly', ['tray-removed', 'tray-retained']))
    if (calibration && assembly) groups.forEach(g => {
      const A = g.period ** 2 - (assembly === 'tray-retained' ? periods.t0.value ** 2 : 0)
      c.requirePositive(A, 'slider.period')
      g.inertia = calibration.ic * A / calibration.den
      const t0 = periods.t0.value, t1 = periods.t1.value, den = calibration.den
      g.inertiaUncertainty = c.propagate([{ name: '圆柱惯量', derivative: A / den, u: calibration.ui.combined },
        { name: 'T_x', derivative: 2 * calibration.ic * g.period / den, u: g.uncertainty.combined },
        { name: 'T₁', derivative: -2 * calibration.ic * A * t1 / den ** 2, u: periods.t1.u },
        { name: 'T₀', derivative: 2 * calibration.ic * t0 * (assembly === 'tray-retained' ? A - den : A) / den ** 2, u: periods.t0.u }])
    })
    c.table('slider-processed', '细杆与滑块位置处理表', [col('position', '位置', 'cm'), col('meanFiveTx', '平均5T_x', 's'), col('period', 'T_x', 's'), col('xSquared', 'x²', 'm²'), col('totalInertia', '测得总惯量', 'kg·m²'), col('inertia', '细杆滑块惯量', 'kg·m²')], groups)
    if (!calibration) return
    const pts = groups.filter(g => g.x != null).map(g => ({ x: g.xSquared, y: assembly ? g.inertia : g.totalInertia }))
    c.chart('inertia-position', '惯量与位置平方', 'x²', 'm²', assembly ? '细杆与滑块惯量' : '总惯量', 'kg·m²', [{ id: 'measured', label: '测量计算值', points: pts }], 'graph-paper')
    c.assume('两块相同滑块对称放置，x为单块质心到转轴距离；横向不变的托盘/基线惯量不影响质量斜率。')
    const f = c.fit('slider-mass-fit', pts, 'inertia-position')
    c.requirePositive(f.slope, 'slider.mass-slope')
    c.metric('sliderMassFit', '回归辅助单块滑块质量', f.slope / 2, 'kg', 'm=b/2', { fit: f, method: 'least-squares' })
    const graph = c.graph('slider-mass-graph', 'mass', 'inertia-position')
    c.requirePositive(graph.slope, 'options.graphical.mass')
    const convention = c.choice('sliderMassReference', ['single', 'pair'])
    const reference = c.param('sliderMass', { positive: true }) / (convention === 'pair' ? 2 : 1)
    c.metric('sliderMassGraphical', '图解法单块滑块质量', graph.slope / 2, 'kg', 'm=b/2', { method: 'graphical', fit: graph, reference })
  })
}

function sound(c) {
  const frequency = c.run('frequency', () => c.param('frequency', { positive: true }) * 1e3)
  const reference = c.run('temperature', () => {
    const t = c.param('temperature')
    c.requirePositive(t + 273.15, 'parameters.temperature')
    return c.metric('referenceSpeed', '当前温度理论声速', 331.45 * Math.sqrt(1 + t / 273.15), 'm/s', 'v_t=331.45√(1+t/273.15)').value
  })
  for (const [key, label, defaultFactor] of [['standing', '驻波法', 2], ['traveling', '行波法', 1], ['lissajous', '李萨如法', null]]) {
    c.run(key, () => {
      const rows = c.rows('positions-' + key, ['position'], { count: 10 })
      const differences = rows.slice(0, 5).map((r, i) => ({ pair: (i + 1) + '→' + (i + 6), first: r.position, last: rows[i + 5].position, difference: Math.abs(decimalDifference(rows[i + 5].position, r.position)) }))
      differences.forEach(r => c.requirePositive(r.difference, 'tables.positions.' + key))
      c.table(key + '-differences', label + '逐差', [col('pair', '配对'), col('first', '起始位置', 'mm'), col('last', '终止位置', 'mm'), col('difference', '逐差', 'mm')], differences)
      const delta = key === 'standing' ? c.estimate('standingDifference', '驻波平均逐差', differences.map(r => r.difference), c.limit('differenceMm'), 'm', 1e-3) : { value: mean(differences.map(r => r.difference)) * 1e-3 }
      let factor = defaultFactor
      if (factor == null) factor = c.choice('lissajousStep', ['same-phase', 'alternating-line']) === 'same-phase' ? 1 : 2
      const lambda = factor * delta.value / 5
      c.assume(label + '：5个记录间隔跨越的波长系数=' + factor + '/5。')
      const ul = key === 'standing' ? c.propagate([{ name: '平均逐差', derivative: factor / 5, u: delta.u }]) : null
      c.metric(key + 'Wavelength', label + '波长', lambda, 'm', 'λ=' + factor + 'ΔL/5', ul ? { uncertainty: ul } : {})
      if (frequency == null) return
      const value = frequency * lambda
      let uncertainty = null
      if (ul) {
        const uf = c.options.frequencyExact === true ? 0 : c.options.frequencyUncertaintyHz == null ? null : c.option('frequencyUncertaintyHz', { min: 0 })
        if (uf === 0) c.assume('声速频率不确定度按使用者明确指定的0处理。')
        uncertainty = c.propagate([{ name: '频率', derivative: lambda, u: uf }, { name: '波长', derivative: frequency, u: ul.combined }])
      }
      c.metric(key + 'Speed', label + '声速', value, 'm/s', 'v=fλ', { ...(uncertainty ? { uncertainty } : {}), ...(reference == null ? {} : { reference }), inputs: { frequencyHz: frequency, wavelengthM: lambda } })
    })
  }
}

module.exports = { 'young-modulus': young, 'kelvin-bridge': kelvin, 'torsion-pendulum': torsion, 'sound-speed': sound }
