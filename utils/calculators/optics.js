const { CalculationError, numeric, mean, finite, decimalDifference, flatMap } = require('../report-math')
const { calculateGroup, statistics } = require('../spectral-analysis')
const LIGHT_SPEED = 299792458
const col = (key, label, unit = '') => ({ key, label, unit })

function fresnel(c) {
  const distance = c.run('distance', () => {
    const cm = Math.abs(c.param('slitPosition') - c.param('eyepiecePosition')) + c.param('distanceCorrection')
    c.requirePositive(cm, 'distance')
    return c.estimate('distance', '虚光源到目镜分划板距离', [cm], c.limit('distanceCm'), 'm', 1e-2)
  })
  const values = {}
  for (const [id, label, key, divide] of [['fringe-spacing', '条纹间距', 'fringeSpanMm', 5], ['image-l1', '放大像间距', 'image1Mm', 1], ['image-l2', '缩小像间距', 'image2Mm', 1]]) {
    values[id] = c.run(id, () => {
      const rows = c.rows(id, ['start', 'end'], { count: 4 }).map(r => ({ ...r, difference: c.requirePositive(Math.abs(decimalDifference(r.end, r.start)), 'tables.' + id + '.difference') }))
      c.table(id + '-processed', label + '处理表', [col('sourceRow', '序号'), col('start', '起始', 'mm'), col('end', '终止', 'mm'), col('difference', divide === 5 ? '跨5间隔的差值' : '差值', 'mm')], rows)
      return c.estimate(id + '-mean', label, rows.map(r => r.difference), c.limit(key), 'm', 1e-3 / divide)
    })
  }
  c.run('wavelength', () => {
    const a = values['image-l1'], b = values['image-l2'], spacing = values['fringe-spacing']
    if (!a || !b || !spacing || !distance) return
    const l = Math.sqrt(a.value * b.value)
    const ul = c.propagate([{ name: 'l₁', derivative: l / (2 * a.value), u: a.u }, { name: 'l₂', derivative: l / (2 * b.value), u: b.u }])
    c.metric('sourceSeparation', '两个虚光源的间距', l, 'm', 'l=√(l₁l₂)', { uncertainty: ul })
    const lambda = l * spacing.value / distance.value * 1e9
    c.metric('wavelength', '钠光波长', lambda, 'nm', 'λ=lΔx/d', { reference: c.param('reference', { positive: true }), uncertainty: c.propagate([
      { name: '虚光源间距', derivative: lambda / l, u: ul.combined }, { name: '条纹间距', derivative: lambda / spacing.value, u: spacing.u }, { name: '传播距离', derivative: -lambda / distance.value, u: distance.u }]),
    inputs: { sourceSeparationM: l, fringeSpacingM: spacing.value, distanceM: distance.value } })
    c.assume('各测量间的相关性忽略；各误差限指相应差值/距离的有效误差限，包含所采用的固定修正条件。')
  })
}

function polarization(c) {
  c.report.kind = 'observation'
  const rows = c.rawRows('quarter-wave-plate')
  if (rows.length !== 7) throw new CalculationError('ROW_COUNT', '波片表应有7个角度', 'tables.quarter-wave-plate')
  const processed = rows.map((r, i) => {
    const angle = [0, 15, 30, 45, 60, 75, 90][i]
    let actual = null
    c.run('actualAngle-' + i, () => { actual = numeric(r.actualAngle, 'tables.quarter-wave-plate.rows[' + i + '].actualAngle') })
    for (const key of angle === 45 ? [] : ['brightAxes', 'darkAxes']) if (!r[key] || !String(r[key]).trim()) c.issue('OBSERVATION_REQUIRED', '请填写第' + (i + 1) + '行' + key, 'tables.quarter-wave-plate.rows[' + i + '].' + key)
    return { nominalAngle: angle, actualAngle: actual, brightAxes: angle === 45 ? null : r.brightAxes || '', darkAxes: angle === 45 ? null : r.darkAxes || '' }
  })
  c.table('polarization-record', '波片观察与实际填空', [col('nominalAngle', '名义角', '°'), col('actualAngle', '实际角', '°'), col('brightAxes', '最亮时Q与A关系'), col('darkAxes', '最暗/消光时Q与A关系')], processed)
  if (c.p.additionalObservation) c.report.observations.push({ id: 'additional', source: 'user', text: c.p.additionalObservation })
  c.manual('polarization-analysis', '依据实际观察手工整理起偏、检偏、布鲁斯特窗及1/4波片现象，并完成分析。')
  c.assume('本实验无数值回归和不确定度任务；理论预印内容与实际观察分开保存，不替用户填写实验现象。')
}

function singleSlit(c) {
  const z = c.run('distance', () => c.estimate('distance', '平均衍射距离', c.rows('distances', ['z'], { count: 3, rules: { z: { positive: true } } }).map(r => r.z), c.limit('distanceCm', c.param('distanceLimit', { positive: true })), 'm', 1e-2))
  c.run('selected-minima', () => {
    const selected = c.rows('minima', ['left', 'center', 'right'], { count: 1 })[0]
    const k = c.param('order', { positive: true, integer: true })
    if (k !== 3) throw new CalculationError('FIXED_DIFFRACTION_ORDER', '本实验固定测量第3级暗纹，k须为3', 'parameters.order')
    const { left, center, right } = selected
    if (!(left < center && center < right)) throw new CalculationError('MINIMA_ORDER', '须满足左暗纹<中央位置<右暗纹', 'tables.minima')
    const x = decimalDifference(right, left) / 2
    c.table('selected-minima', '第3级暗纹距离', [col('order', 'k级'), col('left', '左侧第3级暗纹位置', 'mm'), col('center', '中央位置', 'mm'), col('right', '右侧第3级暗纹位置', 'mm'), col('distanceLeft', '左侧至中央 xₖ左', 'mm'), col('distanceRight', '右侧至中央 xₖ右', 'mm'), col('averageDistance', '平均暗纹距离 x̄ₖ', 'mm')],
      [{ order: k, left, center, right, distanceLeft: center - left, distanceRight: right - center, averageDistance: x }])
    const dark = c.estimate('darkDistance', '平均暗纹至中央距离', [x], c.limit('darkDistanceMm', c.param('positionLimit', { positive: true })), 'm', 1e-3)
    c.assume('按实验要求固定k=3，左右均使用第3级暗纹位置。Δxₖ按原表已给的暗纹平均距离误差限处理；中心误差在左右对称平均距离中相消，不重复计入。')
    if (!z) return
    const a = c.param('slitWidth', { positive: true }) * 1e-3
    const ua = c.options.slitWidthUncertaintyMm == null ? 0 : c.option('slitWidthUncertaintyMm', { min: 0 }) * 1e-3
    if (ua === 0) c.assume('单缝宽度按给定常数处理；未额外计入宽度校准不确定度。')
    const lambda = a * dark.value / (k * z.value) * 1e9
    c.metric('wavelength', '单缝测得激光波长', lambda, 'nm', 'λ=a x̄ₖ/(3z)', { uncertainty: c.propagate([
      { name: '单缝宽度', derivative: lambda / a, u: ua }, { name: '平均暗纹距离', derivative: lambda / dark.value, u: dark.u }, { name: '衍射距离', derivative: -lambda / z.value, u: z.u }]),
    inputs: { slitWidthM: a, order: k, darkDistanceM: dark.value, distanceM: z.value },
    ...(c.options.referenceWavelengthNm == null ? {} : { reference: c.option('referenceWavelengthNm', { positive: true }) }) })
  })
  c.manual('single-slit-intensity-plot', '用原始光强扫描数据绘制并提交光强分布图；报告不必誊录表2。表3位置应从该实测图读取，程序不凭空生成扫描曲线。')
}

function zeemanObservations(c) {
  const rows = c.rawRows('polarization')
  const observations = rows.map((r, i) => {
    if (!r.phenomenon || !String(r.phenomenon).trim()) c.issue('OBSERVATION_REQUIRED', '塞曼报告现象表第' + (i + 1) + '行尚未记录实际观察', 'tables.polarization.rows[' + i + '].phenomenon')
    return { direction: r.direction, operation: r.operation, phenomenon: r.phenomenon || '', analysis: r.analysis || '' }
  })
  c.table('zeeman-observations', '实际现象记录与分析', [col('direction', '传播方向'), col('operation', '实验操作'), col('phenomenon', '实际观察'), col('analysis', '分析及结论')], observations)
  c.manual('zeeman-polarization', '分析π/σ偏振性质、ΔM对应关系及观察方向，按学生版要求手写报告内容。')
}

function zeeman(c) {
  zeemanObservations(c)
  c.run('zeeman-rings', () => {
    const mode = c.input.mode
    const unit = mode === 'combined' ? 'mm' : c.choice('ringUnit', ['mm', 'cm', 'm', 'um'])
    if (c.options.fpMedium != null && c.options.fpMedium !== 'air') throw new CalculationError('FP_MEDIUM_UNSUPPORTED', '本公式为已给教材的空气隙标准具，固体隙需另给光学厚度模型', 'options.fpMedium')
    c.assume('使用空气隙F-P标准具；所有参与平方比的直径采用同一单位。')
    const diameters = (id, pairs) => {
      const keys = Array.from(new Set(flatMap(pairs, p => [p[1], p[2]]))).map(i => 'position' + i)
      const rows = c.rows(id, keys, { count: 4 }).map(r => {
        const next = { sourceRow: r.sourceRow }
        pairs.forEach(([name, left, right]) => { next[name] = c.requirePositive(Math.abs(decimalDifference(r['position' + right], r['position' + left])), id + '.' + name) })
        return next
      })
      c.table(id + '-diameters', id + '各次直径', [col('sourceRow', '序号'), ...pairs.map(p => col(p[0], p[0], unit))], rows)
      const averages = {}; pairs.forEach(([name]) => { averages[name] = mean(rows.map(r => r[name])) })
      c.table(id + '-mean', id + '平均直径', pairs.map(p => col(p[0], p[0], unit)), [averages])
      return averages
    }
    let outer, inner, a, b, separation
    if (mode === 'pi') {
      const d = diameters('pi-rings', [['D6', 1, 8], ['D5outer', 2, 7], ['D4', 3, 6], ['D5inner', 4, 5]])
      outer = d.D5outer; inner = d.D5inner; a = d.D4; b = d.D6; separation = 1
    } else if (mode === 'sigma') {
      const field = diameters('sigma-field', [['D7', 1, 4], ['D3', 2, 3]])
      const zero = diameters('sigma-zero', [['Douter', 1, 4], ['Dinner', 2, 3]])
      outer = zero.Douter; inner = zero.Dinner; a = field.D3; b = field.D7; separation = 2
    } else if (mode === 'combined') {
      const d = diameters('combined-rings', [['Douter', 1, 2], ['Dinner', 3, 4], ['Da', 5, 6], ['Db', 7, 8]])
      outer = d.Douter; inner = d.Dinner; a = d.Da; b = d.Db
      const components = c.options.components
      if (!components) throw new CalculationError('COMPONENTS_REQUIRED', '综合版需明确a、b环编号，才能决定系数', 'options.components', 'missing')
      const ac = numeric(components.a, 'options.components.a', { positive: true, integer: true }), bc = numeric(components.b, 'options.components.b', { positive: true, integer: true })
      if (ac > 9 || bc > 9 || ac === bc) throw new CalculationError('INVALID_COMPONENTS', '汞546.1nm的a、b须为1–9中的不同成分', 'options.components')
      const shifts = [-2, -1.5, -1, -.5, 0, .5, 1, 1.5, 2]
      separation = Math.abs(shifts[ac - 1] - shifts[bc - 1])
    } else throw new CalculationError('UNKNOWN_MODE', '请选择combined、pi或sigma方案', 'mode')
    const denominator = c.requirePositive(outer ** 2 - inner ** 2, 'rings.referenceSquaredDifference')
    const numerator = c.requirePositive(b ** 2 - a ** 2, 'rings.splitSquaredDifference')
    const ratio = numerator / denominator
    c.metric('diameterSquaredRatio', '直径平方差比', ratio, '', 'R=(D_b²−D_a²)/(D_{k−1}²−D_k²)', { inputs: { meanOuter: outer, meanInner: inner, meanA: a, meanB: b, numerator, denominator, diameterUnit: unit } })
    const d = c.param('fpSpacing', { positive: true })
    const B = c.p.magneticField != null && String(c.p.magneticField).trim() !== '' ? c.param('magneticField', { positive: true })
      : c.option('excitationCoefficientTA', { positive: true }) * c.option('excitationCurrentA', { positive: true })
    c.metric('magneticField', '测量时磁感应强度', B, 'T', 'B=实测值或K_M I_M（采用明确单位的输入）')
    c.metric('wavenumberDifference', '选定成分波数差', ratio / (2 * d), 'm^-1', 'Δν̃=R/(2d)')
    c.metric('electronChargeMassRatio', '电子荷质比大小', 2 * Math.PI * LIGHT_SPEED * ratio / (B * d * separation), 'C/kg', 'e/m=2πcR/(Bd q_ab)', { reference: 1.76e11,
      inputs: { magneticFieldT: B, fpSpacingM: d, componentSeparationLorentzUnits: separation, ratio, speedOfLight: LIGHT_SPEED } })
  })
}

function michelson(c) {
  c.run('michelson-observations', () => {
    const rows = c.rawRows('observations')
    if (rows.length !== 3) c.issue('OBSERVATION_REQUIRED', '应记录等倾、单色等厚、白光条纹三类现象', 'tables.observations')
    rows.forEach((r, i) => { if (!r.analysis || !String(r.analysis).trim()) c.issue('OBSERVATION_REQUIRED', '请补充迈克尔孙现象记录第' + (i + 1) + '项', 'tables.observations.rows[' + i + '].analysis') })
    c.table('michelson-observations', '实验现象与分析', [col('item', '项目'), col('analysis', '使用者实际记录')], rows.map(r => ({ item: r.item, analysis: r.analysis || '' })))
    c.metric('whiteCentralPosition', '白光中央条纹时镜位置', c.param('whiteCenterPosition'), 'mm', '直接记录')
    c.metric('zeroPosition', '独立调零后镜位置', c.param('zeroPosition'), 'mm', '直接记录，不替代n=0时位置')
  })
  c.run('michelson-wavelength', () => {
    const rows = c.rows('positions', ['order', 'position'], { count: 6, rules: { order: { min: 0, integer: true } } })
    const h = c.param('step', { positive: true, integer: true })
    if (rows[0].order !== 0 || rows.some((r, i) => r.order !== i * h)) throw new CalculationError('FRINGE_COUNT_SEQUENCE', '首点n应为0，其后每点级次差须与记录的h一致', 'tables.positions')
    const direction = Math.sign(rows[1].position - rows[0].position)
    if (direction === 0 || rows.slice(1).some((r, i) => Math.sign(r.position - rows[i].position) !== direction)) throw new CalculationError('MIRROR_DIRECTION', '同一序列镜位置应沿同一方向变化，不能包含停滞或回转', 'tables.positions')
    const paired = rows.slice(0, 3).map((r, i) => ({ pair: (i + 1) + '→' + (i + 4), firstPosition: r.position, lastPosition: rows[i + 3].position, count: rows[i + 3].order - r.order, difference: Math.abs(decimalDifference(rows[i + 3].position, r.position)) }))
    c.table('michelson-differences', '三组逐差位移及实际条纹数', [col('pair', '配对'), col('firstPosition', '起始镜位置', 'mm'), col('lastPosition', '终止镜位置', 'mm'), col('count', '跨越条纹数'), col('difference', '位移差', 'mm')], paired)
    const count = 3 * h
    const average = mean(paired.map(r => r.difference))
    const lambda = 2 * average / count * 1e6
    const result = c.metric('wavelength', '迈克尔孙测得波长', lambda, 'nm', 'λ=2Δd̄/(3h)', { reference: c.param('reference', { positive: true }), inputs: { count, step: h, averageDisplacementMm: average } })
    const target = c.choice('instrumentLimitTarget', ['difference', 'single-reading'])
    const rawLimit = c.param('instrumentLimit', { positive: true })
    const delta = c.estimate('displacement', '平均逐差位移', paired.map(r => r.difference), rawLimit * (target === 'single-reading' ? Math.sqrt(2) : 1), 'mm')
    c.assume(target === 'single-reading' ? '位置仪器项按两个独立读数传播；共同零点相消。' : 'Δ_ins明确按成对位移的有效误差限使用。')
    const kind = c.choice('countUncertaintyKind', ['standard-relative', 'expanded-relative'])
    let relative = c.param('relativeCountUncertainty', { min: 0 }) / 100
    if (kind === 'expanded-relative') relative /= c.option('countCoverageFactor', { positive: true })
    result.uncertainty = c.propagate([{ name: '逐差位移', derivative: 2e6 / count, u: delta.u }, { name: '条纹数', derivative: -lambda / count, u: relative * count }])
    if (!result.uncertainty.complete) c.issue('UNCERTAINTY_INCOMPLETE', '波长不确定度分量不完整', 'results.wavelength.uncertainty')
    c.assume('计数相对项是三组共同项，只合成一次，不再除√3。')
  })
}

function spectral(c) {
  const groups = c.rawRows('spectral-readings')
  const processed = [], theta = []
  groups.forEach((g, i) => {
    const result = calculateGroup(g)
    if (result.state === 'empty') return
    if (result.state !== 'valid') { c.issue(result.state === 'invalid' ? 'INVALID_ANGLE_GROUP' : 'INCOMPLETE_ANGLE_GROUP', result.error, 'tables.spectral-readings.rows[' + i + ']', result.state === 'invalid' ? 'error' : 'missing'); return }
    if (result.warning) c.issue('VERNIER_ALIGNMENT', result.warning, 'tables.spectral-readings.rows[' + i + ']', 'warning')
    processed.push({ sourceRow: i + 1, ...g, left: result.left, right: result.right, corrected: result.corrected, theta: result.theta, thetaRad: result.theta * Math.PI / 180 })
    theta.push(result.theta)
  })
  c.table('spectral-angles', '一级谱线角度处理表', [col('sourceRow', '测次'), col('minusLeft', '−1左'), col('minusRight', '−1右'), col('plusLeft', '+1左'), col('plusRight', '+1右'), col('left', '左2θ', '°'), col('right', '右2θ', '°'), col('corrected', '消偏2θ', '°'), col('theta', 'θ', '°'), col('thetaRad', 'θ', 'rad')], processed)
  for (const [key, label] of [['observedPhenomenon', '实际谱线现象'], ['elementAnalysis', '结合现象和波长分析发光元素']]) {
    if (c.p[key]) c.report.observations.push({ id: key, source: 'user', text: c.p[key] })
    else c.manual(key, label)
  }
  if (!theta.length) { c.issue('INSUFFICIENT_ANGLES', '至少需一组完整的四游标读数', 'tables.spectral-readings'); return }
  // 缺半组时保留有效组处理表，不用子集伪装全部测量的汇总。
  if (c.report.issues.some(i => ['INVALID_ANGLE_GROUP', 'INCOMPLETE_ANGLE_GROUP'].includes(i.code))) return
  const stats = statistics(theta)
  const radians = stats.mean * Math.PI / 180
  const uA = c.options.uncertaintyPolicy === 'standard' ? stats.sem : stats.ua
  const aRad = uA == null ? null : uA * Math.PI / 180
  const ub = c.p.angularInstrumentUncertainty == null || String(c.p.angularInstrumentUncertainty).trim() === '' ? null : c.param('angularInstrumentUncertainty', { min: 0 })
  const angular = c.propagate([{ name: '角度A类项', derivative: 1, u: aRad }, { name: '已换算到θ的仪器标准项', derivative: 1, u: ub }])
  c.metric('meanAngle', '平均一级衍射角', radians, 'rad', 'θ̄=Σθᵢ/n（度→rad）', { uncertainty: angular,
    statistics: { ...stats, inputUnit: '°', inputToOutputScale: Math.PI / 180, outputUnit: 'rad' } })
  const density = c.param('density', { positive: true }), relative = c.param('relativeGratingUncertainty', { min: 0 }) / 100
  const dNm = 1e6 / density
  const lambda = dNm * Math.sin(radians)
  c.metric('wavelength', '一级特征谱线波长', lambda, 'nm', 'λ=d sinθ', { uncertainty: c.propagate([
    { name: '光栅常数', derivative: Math.sin(radians), u: dNm * relative }, { name: '衍射角', derivative: dNm * Math.cos(radians), u: angular.combined }]),
  inputs: { densityLinesPerMm: density, gratingSpacingNm: dNm, thetaRad: radians, relativeGratingStandardUncertainty: relative },
  ...(c.p.reference == null || String(c.p.reference).trim() === '' ? {} : { reference: c.param('reference', { positive: true }) }) })
  c.assume('光栅相对不确定度按标准相对项输入；角度仪器项已换算到平均θ的标准项，各项独立。')
}

module.exports = { 'fresnel-biprism': fresnel, polarization, 'single-slit': singleSlit, 'zeeman-effect': zeeman, michelson, 'spectral-analysis': spectral }
