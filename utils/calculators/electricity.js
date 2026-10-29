const { CalculationError, numeric, mean, finite, flatMap } = require('../report-math')
const E = 1.602176634e-19
const col = (key, label, unit = '') => ({ key, label, unit })

function ballistic(c) {
  const convention = c.run('chargeConvention', () => c.choice('chargeConvention', ['signed', 'magnitudes']))
  const magnitude = (value, path) => {
    if (convention === 'magnitudes') return numeric(value, path, { positive: true })
    return c.requirePositive(Math.abs(value), path)
  }
  for (const i of [1, 2]) c.run('capacitance-' + i, () => {
    const rows = c.rows('capacitance-' + i, ['voltage', 'standardForward', 'standardReverse', 'unknownForward', 'unknownReverse'], { min: 2, rules: { voltage: { positive: true } } })
    if (!convention) return
    const averageCharge = (a, b) => {
      if (convention === 'signed') {
        if (a * b >= 0) throw new CalculationError('CHARGE_POLARITY', '带符号模式要求正反读数异号；请核对极性或选择幅值模式', 'tables.capacitance-' + i)
        return Math.abs(a - b) / 2
      }
      return (magnitude(a, 'charge.forward') + magnitude(b, 'charge.reverse')) / 2
    }
    const processed = rows.map(r => ({ ...r, standardMean: averageCharge(r.standardForward, r.standardReverse), unknownMean: averageCharge(r.unknownForward, r.unknownReverse) }))
    c.table('capacitance-' + i + '-processed', '电容表' + i + '换向处理', [col('voltage', '电压', 'V'), col('standardMean', '标准电容电量', 'μC'), col('unknownMean', '待测电容电量', 'μC')], processed)
    const points = processed.map(r => ({ x: r.standardMean, y: r.unknownMean }))
    c.chart('capacitance-' + i, '电容比较图' + i, '标准电容电量', 'μC', '待测电容电量', 'μC', [{ id: 'measured', label: '换向处理值', points }], 'graph-paper')
    c.chart('charge-voltage-' + i, '电量与电压' + i, '电压', 'V', '电量', 'μC', ['standardMean', 'unknownMean'].map(key => ({ id: key, label: key === 'standardMean' ? '标准电容' : '待测电容', points: processed.map(r => ({ x: r.voltage, y: r[key] })) })))
    const cn = c.param('standardCapacitance' + i, { positive: true })
    const f = c.fit('capacitance-' + i + '-fit', points, 'capacitance-' + i)
    c.requirePositive(f.slope, 'capacitance.slope')
    c.metric('capacitance' + i + 'Fit', '表' + i + '回归辅助电容', cn * f.slope, 'μF', 'C_x=bC_N', { method: 'least-squares', fit: f, inputs: { standardCapacitanceMicrofarad: cn } })
    const graph = c.graph('capacitance-' + i + '-graph', 'capacitance' + i, 'capacitance-' + i)
    c.requirePositive(graph.slope, 'options.graphical.capacitance' + i)
    c.metric('capacitance' + i + 'Graphical', '表' + i + '图解法电容', cn * graph.slope, 'μF', 'C_x=bC_N', { method: 'graphical', fit: graph })
  })
  for (const [direction, label] of [['forward', '正向'], ['reverse', '反向']]) c.run('discharge-' + direction, () => {
    const rows = c.rows('discharge-' + direction, ['setTime', 'actualTime', 'charge'], { min: 2, rules: { actualTime: { min: 0 }, setTime: { min: 0 } } })
    if (!convention) return
    const processed = rows.map(r => ({ ...r, magnitude: magnitude(r.charge, 'tables.discharge-' + direction + '.charge'), logCharge: Math.log(magnitude(r.charge, 'tables.discharge-' + direction + '.charge')) }))
    c.table('discharge-' + direction + '-processed', label + '高阻处理表', [col('setTime', '设定时间', 's'), col('actualTime', '实测时间', 's'), col('charge', '原始电量', 'μC'), col('magnitude', '约定幅值', 'μC'), col('logCharge', 'ln[q/(1μC)]')], processed)
    const plotId = 'discharge-' + direction
    const points = processed.map(r => ({ x: r.actualTime, y: r.logCharge }))
    c.chart(plotId, label + '放电对数曲线', '实测时间', 's', 'ln[q/(1μC)]', '', [{ id: 'measured', label: '实测对数电量', points }], 'graph-paper')
    const cn = c.param(direction === 'forward' ? 'dischargeCapacitanceForward' : 'dischargeCapacitanceReverse', { positive: true })
    const refR = c.param('referenceResistance', { positive: true }), refQ = cn * c.param('dischargeVoltage', { positive: true })
    const output = (fit, suffix, method) => {
      if (fit.slope >= 0) throw new CalculationError('NON_DECAYING_CHARGE', '放电拟合斜率须小于0，请核对时间、电量及零漂', plotId)
      c.metric(direction + 'Resistance' + suffix, label + (method === 'graphical' ? '图解' : '回归辅助') + '高阻', -1 / (fit.slope * cn), 'MΩ', 'R=-1/(bC_N)', { method, fit, reference: refR })
      c.metric(direction + 'InitialCharge' + suffix, label + (method === 'graphical' ? '图解' : '回归辅助') + '初始电量', finite(Math.exp(fit.intercept)), 'μC', 'Q₀=e^a μC', { method, reference: refQ })
    }
    output(c.fit(plotId + '-fit', points, plotId), 'Fit', 'least-squares')
    output(c.graph(plotId + '-graph', direction === 'forward' ? 'dischargeForward' : 'dischargeReverse', plotId), 'Graphical', 'graphical')
  })
  c.assume('电容图采用Q_x对Q_N比较图；原件坐标缺字，须确认课堂允许此图。电量原始符号保留，未自动实施未给依据的零漂修正。')
}

function strain(c) {
  for (const id of ['single-arm', 'full-bridge']) c.run(id, () => {
    const fields = ['x', ...flatMap([1, 2, 3], i => ['forward' + i, 'reverse' + i])]
    const rows = c.rows(id, fields, { count: 17 })
    if (new Set(rows.map(r => r.x)).size !== rows.length) throw new CalculationError('DUPLICATE_DISPLACEMENT', '位移测量点不应重复，请核对17个位移点', 'tables.' + id)
    const processed = rows.map(r => {
      const result = { ...r, mean: mean(fields.filter(k => k !== 'x').map(k => r[k])) }
      for (const j of [1, 2, 3]) result['hysteresis' + j] = r['forward' + j] - r['reverse' + j]
      return result
    })
    const points = processed.map(r => ({ x: r.x, y: r.mean }))
    c.chart(id, (id === 'single-arm' ? '单臂' : '全桥') + 'V-x校准曲线', '位移', 'mm', '校准平均电压', 'V', [{ id: 'measured', label: '六次读数平均', points }])
    const fit = c.fit(id + '-fit', points, id)
    processed.forEach((r, i) => { r.fitted = fit.residuals[i].fitted; r.residual = fit.residuals[i].residual })
    const sorted = processed.slice().sort((a, b) => a.x - b.x)
    const fullScale = Math.abs(sorted[sorted.length - 1].mean - sorted[0].mean)
    c.requirePositive(fullScale, id + '.fullScale')
    const maxAbs = entries => entries.reduce((max, e) => Math.abs(e.value) > Math.abs(max.value) ? e : max)
    const nonlinear = maxAbs(processed.map(r => ({ value: r.residual, row: r.sourceRow })))
    const hysteresis = maxAbs(flatMap(processed, r => [1, 2, 3].map(cycle => ({ value: r['hysteresis' + cycle], row: r.sourceRow, cycle }))))
    const repetition = direction => maxAbs(processed.map(r => {
      const values = [1, 2, 3].map(i => r[direction + i])
      return { value: Math.max(...values) - Math.min(...values), row: r.sourceRow, maxCycle: values.indexOf(Math.max(...values)) + 1, minCycle: values.indexOf(Math.min(...values)) + 1 }
    }))
    c.table(id + '-processed', (id === 'single-arm' ? '单臂' : '全桥') + '报告数据表', [col('x', '位移', 'mm'), ...flatMap([1, 2, 3], i => [col('forward' + i, i + '正行程', 'V'), col('reverse' + i, i + '反行程', 'V'), col('hysteresis' + i, i + '有符号滞后', 'V')]), col('mean', '校准平均值', 'V'), col('fitted', '拟合值', 'V'), col('residual', '残差', 'V')], processed)
    c.metric(id + '-sensitivity', '灵敏度（' + id + '）', fit.slope, 'V/mm', 'S=S_xy/S_xx', { fit, method: 'least-squares' })
    c.metric(id + '-fullScale', '满量程输出（' + id + '）', fullScale, 'V', 'V_FS=|V̄(x_max)−V̄(x_min)|')
    for (const [key, label, extreme] of [['nonlinearity', '非线性误差', nonlinear], ['hysteresis', '滞后性', hysteresis], ['repeatabilityForward', '正行程重复性', repetition('forward')], ['repeatabilityReverse', '反行程重复性', repetition('reverse')]]) {
      c.metric(id + '-' + key, label + '（' + id + '）', Math.abs(extreme.value) / fullScale * 100, '%', '百分比=相应最大差值/V_FS×100%', { selectedData: extreme, inputs: { fullScale, deviation: extreme.value } })
    }
  })
}

function pn(c) {
  const referenceK = c.run('referenceK', () => c.param('boltzmannReference', { positive: true }))
  const referenceGap = c.run('referenceGap', () => c.param('bandgapReference', { positive: true }))
  const constant = c.run('constant-temperature', () => {
    const rows = c.rows('constant-temperature', ['voltage', 'current'], { min: 2, rules: { current: { positive: true } } })
    const T = c.param('constantTemperature') + 273.15
    c.requirePositive(T, 'parameters.constantTemperature')
    const processed = rows.map(r => ({ ...r, logCurrent: Math.log(r.current) }))
    c.table('pn-log-current', '恒温伏安曲化直', [col('voltage', '正向电压', 'V'), col('current', '正向电流', 'μA'), col('logCurrent', 'ln[I_F/(1μA)]')], processed)
    c.chart('pn-iv', '恒温伏安特性', '正向电压', 'V', '正向电流', 'μA', [{ id: 'measured', label: '实测值', points: rows.map(r => ({ x: r.voltage, y: r.current })) }])
    const points = processed.map(r => ({ x: r.voltage, y: r.logCurrent }))
    c.chart('pn-log-iv', '伏安曲化直', '正向电压', 'V', 'ln[I_F/(1μA)]', '', [{ id: 'measured', label: '对数电流', points }], 'graph-paper')
    const output = (fit, suffix, method) => {
      c.requirePositive(fit.slope, 'pn.current-slope')
      const kb = E / (fit.slope * T)
      c.metric('boltzmann' + suffix, method === 'graphical' ? '图解法玻尔兹曼常数' : '回归法玻尔兹曼常数', kb, 'J/K', 'k_B=q/(bT)', { method, fit, ...(referenceK == null ? {} : { reference: referenceK }), inputs: { temperatureK: T, chargeC: E } })
      c.metric('saturationCurrent' + suffix, method === 'graphical' ? '图解法反向饱和电流' : '回归法反向饱和电流', c.requirePositive(finite(Math.exp(fit.intercept) * 1e-6), 'pn.saturationCurrent'), 'A', 'I_S=e^a×10^-6 A', { method, inputs: { logBaseCurrentA: 1e-6, intercept: fit.intercept } })
      return kb
    }
    const fit = c.fit('pn-current-fit', points, 'pn-log-iv')
    const kb = output(fit, 'Fit', 'least-squares')
    c.run('pn-current-graph', () => output(c.graph('pn-current-graph', 'pnCurrent', 'pn-log-iv'), 'Graphical', 'graphical'))
    return kb
  })
  c.run('constant-current', () => {
    const current = c.param('constantCurrent', { positive: true })
    const rows = c.rows('constant-current', ['temperature', 'voltage'], { min: 2, skipEmpty: true })
    rows.forEach(r => c.requirePositive(r.temperature + 273.15, 'tables.constant-current.temperature'))
    const points = rows.map(r => ({ x: r.temperature, y: r.voltage }))
    c.table('pn-temperature', '恒流压降与温度', [col('temperature', '温度', '℃'), col('voltage', '正向电压', 'V')], rows)
    c.chart('pn-temperature', '恒流压降温度特性', '温度', '℃', '正向压降', 'V', [{ id: 'measured', label: '恒流' + current + 'μA', points }], 'graph-paper')
    const model = c.options.bandgapModel || 'linear'
    if (!['linear', 'corrected'].includes(model)) throw new CalculationError('UNKNOWN_MODEL', 'bandgapModel只能为linear或corrected', 'options.bandgapModel')
    c.assume('PN正向近似的理想因子为1；禁带宽度采用' + model + '模型。')
    const output = (fit, suffix, method) => {
      c.metric('temperatureSensitivity' + suffix, (method === 'graphical' ? '图解法' : '回归法') + '温度灵敏度', fit.slope * 1000, 'mV/℃', 'S=dU_F/dt', { method, fit })
      if (fit.slope >= 0) throw new CalculationError('NON_NEGATIVE_TEMPERATURE_SLOPE', '当前正向压降未随温度下降，不能据此给出所用PN温度模型的禁带宽度', 'tables.constant-current')
      let gap = fit.intercept - 273.15 * fit.slope
      if (model === 'corrected') {
        const gamma = c.option('temperatureExponent', { positive: true })
        const T = c.option('bandgapReferenceTemperatureC') + 273.15
        c.requirePositive(T, 'options.bandgapReferenceTemperatureC')
        const kb = c.options.useMeasuredBoltzmann === true ? c.requirePositive(constant, 'boltzmannFit') : c.requirePositive(referenceK, 'parameters.boltzmannReference')
        gap -= gamma * kb * T / E
      }
      c.requirePositive(gap, 'pn.bandgap')
      c.metric('bandgap' + suffix, (method === 'graphical' ? '图解法' : '回归法') + '近似禁带宽度', gap, 'eV', model === 'linear' ? 'E_g/eV=b_t−273.15S（U用V）' : 'E_g/eV=U_F−TS−γk_BT/q', { method, ...(referenceGap == null ? {} : { reference: referenceGap }), inputs: { interceptAtZeroC: fit.intercept, slopeVPerC: fit.slope, model } })
    }
    output(c.fit('pn-temperature-fit', points, 'pn-temperature'), 'Fit', 'least-squares')
    output(c.graph('pn-temperature-graph', 'pnTemperature', 'pn-temperature'), 'Graphical', 'graphical')
  })
}

function hall(c) {
  const thickness = c.run('thickness', () => c.param('thickness', { positive: true }) * 1e-3)
  const coefficient = c.run('magnetCoefficient', () => c.param('magnetCoefficient', { positive: true }))
  const hallRows = id => c.rows(id, id === 'working-current' ? ['is', 'u1', 'u2', 'u3', 'u4'] : id === 'magnet-current' ? ['im', 'u1', 'u2', 'u3', 'u4'] : ['x', 'u1', 'u2', 'u3', 'u4'], { min: 2 }).map(r => ({ ...r,
    hallVoltage: (Math.abs(r.u1) + Math.abs(r.u2) + Math.abs(r.u3) + Math.abs(r.u4)) / 4,
    ...(c.options.polaritySequence === 'textbook' ? { signedHallVoltage: (r.u1 - r.u2 + r.u3 - r.u4) / 4 } : {}) }))
  const working = c.run('working-current', () => {
    const rows = hallRows('working-current'); rows.forEach(r => c.requirePositive(r.is, 'tables.working-current.is'))
    c.table('hall-working', '霍尔电压与工作电流', [col('is', '工作电流', 'mA'), col('u1', 'U₁', 'mV'), col('u2', 'U₂', 'mV'), col('u3', 'U₃', 'mV'), col('u4', 'U₄', 'mV'), col('hallVoltage', '霍尔幅值', 'mV'), col('signedHallVoltage', '约定有符号电压', 'mV')], rows)
    const pts = rows.map(r => ({ x: r.is, y: r.hallVoltage }))
    c.chart('hall-working', '霍尔幅值与工作电流', 'I_S', 'mA', '|U_H|', 'mV', [{ id: 'measured', label: '幅值换向均值', points: pts }], 'graph-paper')
    const fit = c.fit('hall-working-fit', pts, 'hall-working')
    if (thickness == null || coefficient == null) return null
    const B = coefficient * c.param('fixedIM', { positive: true }) * 1e-3
    c.metric('workingMagneticField', '表1磁感应强度', B, 'T', 'B=K I_M（mA→A）')
    const fitRh = c.requirePositive(fit.slope * thickness / B, 'hall.RH')
    c.metric('hallCoefficientFit', '表1最小二乘霍尔系数幅值', fitRh, 'm³/C', '|R_H|=b₁d/B', { method: 'least-squares', fit })
    if (c.options.polaritySequence === 'textbook') {
      const signedFit = c.fit('hall-signed-fit', rows.map(r => ({ x: r.is, y: r.signedHallVoltage })))
      c.metric('signedHallCoefficient', '教材接线下有符号霍尔系数', signedFit.slope * thickness / B, 'm³/C', 'R_H=b_signed d/B', { inputs: { polaritySequence: 'textbook' } })
      c.report.observations.push({ id: 'carrier-type-by-wiring', source: 'calculated-with-declared-wiring', text: signedFit.slope > 0 ? '按教材图3.11.1电压方向约定，对应N型。' : signedFit.slope < 0 ? '按教材图3.11.1电压方向约定，对应P型。' : '有符号斜率为0，不能判断导电类型。' })
    } else c.manual('carrier-type', '结合实际换向接线和电压极性判断导电类型；幅值平均不能单独判断。')
    const graphRh = c.run('hall-working-graph', () => {
      const graph = c.graph('hall-working-graph', 'hallWorking', 'hall-working')
      const rh = c.requirePositive(graph.slope * thickness / B, 'hall.RHgraph')
      c.metric('hallCoefficientWorkingGraphical', '表1图解霍尔系数幅值', rh, 'm³/C', '|R_H|=b₁d/B', { method: 'graphical', fit: graph })
      return rh
    })
    return { fitRh, graphRh }
  })
  const magnet = c.run('magnet-current', () => {
    const rows = hallRows('magnet-current'); rows.forEach(r => c.requirePositive(r.im, 'tables.magnet-current.im'))
    c.table('hall-magnet', '霍尔电压与励磁电流', [col('im', '励磁电流', 'mA'), col('hallVoltage', '霍尔幅值', 'mV')], rows)
    c.chart('hall-magnet', '霍尔幅值与励磁电流', 'I_M', 'mA', '|U_H|', 'mV', [{ id: 'measured', label: '幅值换向均值', points: rows.map(r => ({ x: r.im, y: r.hallVoltage })) }], 'graph-paper')
    const graph = c.graph('hall-magnet-graph', 'hallMagnet', 'hall-magnet')
    if (thickness == null || coefficient == null) return null
    const rh = c.requirePositive(graph.slope * thickness / (coefficient * c.param('fixedIS', { positive: true }) * 1e-3), 'hall.RHgraph')
    c.metric('hallCoefficientMagnetGraphical', '表2图解霍尔系数幅值', rh, 'm³/C', '|R_H|=b₂d/(K I_S)', { method: 'graphical', fit: graph })
    return rh
  })
  const averageRh = c.run('hall-average', () => {
    if (!working || working.graphRh == null || magnet == null || thickness == null) return null
    const rh = mean([working.fitRh, working.graphRh, magnet])
    c.metric('hallCoefficient', '三种方法平均霍尔系数幅值', rh, 'm³/C', '|R̄_H|=(RH_1拟合+RH_1图解+RH_2图解)/3')
    const model = c.options.carrierModel || 'textbook'
    if (!['textbook', 'simple'].includes(model)) throw new CalculationError('UNKNOWN_MODEL', 'carrierModel须为textbook或simple', 'options.carrierModel')
    const correction = model === 'textbook' ? 8 / (3 * Math.PI) : 1
    c.assume('载流子浓度模型=' + model + '，霍尔散射因子r_H=' + correction + '；单一载流子近似。')
    c.metric('carrierDensity', '载流子浓度', correction / (E * rh), 'm^-3', 'n=r_H/(e|R_H|)', { inputs: { hallFactor: correction, chargeC: E } })
    c.metric('hallSensitivity', '实验霍尔元件灵敏度', rh / thickness, 'mV/(mA·T)', 'K_H=|R_H|/d', { reference: c.param('hallSensitivity', { positive: true }) })
    return { rh, correction }
  })
  c.run('conductivity', () => {
    const voltage = c.option('longitudinalVoltageMv', { positive: true }) * 1e-3
    const current = c.option('longitudinalCurrentMa', { positive: true }) * 1e-3
    const length = c.option('voltageContactDistanceMm', { positive: true }) * 1e-3
    const width = c.option('sampleWidthMm', { positive: true }) * 1e-3
    if (thickness == null) return
    const sigma = current * length / (voltage * width * thickness)
    c.metric('conductivity', '样品电导率', sigma, 'S/m', 'σ=I_Sℓ/(U₀wd)', { inputs: { voltageV: voltage, currentA: current, contactDistanceM: length, widthM: width, thicknessM: thickness } })
    if (averageRh) {
      c.metric('hallMobility', '霍尔迁移率', averageRh.rh * sigma, 'm²/(V·s)', 'μ_H=|R_H|σ')
      c.metric('driftMobility', '所选散射模型的漂移迁移率', averageRh.rh * sigma / averageRh.correction, 'm²/(V·s)', 'μ_drift=μ_H/r_H')
    }
  })
  c.run('axial-field', () => {
    const rows = hallRows('axial-field')
    const kh = c.param('solenoidHallSensitivity', { positive: true }), current = c.param('axialIS', { positive: true })
    const processed = rows.map(r => ({ ...r, magneticField: r.hallVoltage / (kh * current) }))
    c.table('axial-field-processed', '螺线管轴向磁场', [col('x', '位置', 'mm'), col('hallVoltage', '|U_H|', 'mV'), col('magneticField', 'B', 'T')], processed)
    c.chart('axial-field', '螺线管B-x分布', '位置', 'mm', '磁感应强度', 'T', [{ id: 'measured', label: '由该元件K_H换算', points: processed.map(r => ({ x: r.x, y: r.magneticField })) }], 'graph-paper')
  })
}

function rlc(c) {
  const circuit = c.run('circuit', () => {
    const L = c.param('inductance', { positive: true }) * 1e-3, C = c.param('capacitance', { positive: true }) * 1e-6
    const r1 = c.param('resistance1', { positive: true }), r2 = c.param('resistance2', { positive: true })
    const loss = c.options.seriesLossResistanceOhm == null ? 0 : c.option('seriesLossResistanceOhm', { min: 0 })
    c.assume('RLC理想串联参考模型，额外串联损耗=' + loss + 'Ω；L电压按纯电感计算。实际线圈端电压含内阻时需另行修订模型。')
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C))
    c.metric('resonanceFrequencyTheory', '理想串联谐振频率', f0, 'Hz', 'f₀=1/(2π√LC)')
    const q1 = Math.sqrt(L / C) / (r1 + loss), q2 = Math.sqrt(L / C) / (r2 + loss)
    c.metric('qualityFactor1', '第一电阻配置理论Q', q1, '', 'Q=√(L/C)/R_Σ')
    c.metric('qualityFactor2', '第二电阻配置理论Q', q2, '', 'Q=√(L/C)/R_Σ')
    const peak = c.run('peakDefinition', () => c.choice('peakDefinition', ['component-voltage']))
    if (peak && q1 > 1 / Math.sqrt(2)) {
      c.metric('inductorPeakFrequencyTheory', '纯电感电压峰值频率', f0 / Math.sqrt(1 - 1 / (2 * q1 * q1)), 'Hz', 'f_L=f₀/√(1−1/(2Q²))')
      c.metric('capacitorPeakFrequencyTheory', '纯电容电压峰值频率', f0 * Math.sqrt(1 - 1 / (2 * q1 * q1)), 'Hz', 'f_C=f₀√(1−1/(2Q²))')
    } else if (peak) c.issue('NO_COMPONENT_RESONANCE_PEAK', 'Q≤1/√2，纯L/C电压没有所用公式描述的有限正频率峰值', 'results.componentPeaks', 'warning')
    return { L, C, r1, r2, loss, f0, q1, q2 }
  })
  const amplitude1 = c.run('amplitude-200', () => {
    const rows = c.rows('amplitude-200', ['frequency', 'ul', 'uc', 'ur', 'us'], { min: 3, rules: { frequency: { positive: true }, ul: { min: 0 }, uc: { min: 0 }, ur: { min: 0 }, us: { positive: true } } })
    c.table('rlc-amplitude-1', '第一配置幅频数据', [col('frequency', 'f', 'kHz'), col('ul', 'U_L', 'V'), col('uc', 'U_C', 'V'), col('ur', 'U_R', 'V'), col('us', 'U_S', 'V')], rows)
    c.chart('rlc-amplitude', 'R、L、C幅频特性', '频率', 'kHz', '电压', 'V', ['ul', 'uc', 'ur'].map(key => ({ id: key, label: key.toUpperCase(), points: rows.map(r => ({ x: r.frequency, y: r[key] })) })))
    c.metric('sourceVoltageMean', '信号电压平均值', mean(rows.map(r => r.us)), 'V', 'Ū_S=ΣU_S/n', { reference: c.param('sourceVpp', { positive: true }) })
    c.assume('U_S测量值与设定V_PP按相同峰峰值口径比较；须确认示波器的测量设置。')
    if (circuit) {
      const f = { ...(c.options.features || {}) }, selected = {}
      if (c.options.autoFeatures) for (const [key, column] of [['f0Hz', 'ur'], ['fLHz', 'ul'], ['fCHz', 'uc']]) {
        if (f[key] != null) continue
        const peak = rows.reduce((best, row) => row[column] > best[column] ? row : best)
        f[key] = peak.frequency * 1000
        selected[key] = { sourceRow: peak.sourceRow, frequencyKHz: peak.frequency, voltageV: peak[column], column }
        if (peak === rows[0] || peak === rows[rows.length - 1]) c.issue('PEAK_AT_SCAN_EDGE', '曲线最大读数位于扫描边界，自动读取值仅为本次扫描的最大点，真实峰值可能在范围外。', 'tables.amplitude-200', 'warning')
        const chart = c.report.charts.find(chart => chart.id === 'rlc-amplitude')
        chart.series.push({ id: key + '-selected', label: key + '程序选择的最大读数点', type: 'selected-points', points: [{ x: peak.frequency, y: peak[column] }] })
      }
      for (const [key, reference] of [['f0Hz', circuit.f0], ['fLHz', circuit.q1 > 1 / Math.sqrt(2) ? circuit.f0 / Math.sqrt(1 - 1 / (2 * circuit.q1 ** 2)) : null], ['fCHz', circuit.q1 > 1 / Math.sqrt(2) ? circuit.f0 * Math.sqrt(1 - 1 / (2 * circuit.q1 ** 2)) : null]]) {
        c.run(key, () => {
          const value = numeric(f[key], 'options.features.' + key, { positive: true })
          const low = Math.min(...rows.map(r => r.frequency)) * 1000, high = Math.max(...rows.map(r => r.frequency)) * 1000
          if (value < low || value > high) throw new CalculationError('FEATURE_OUTSIDE_SCAN', '从图读取的特征频率应位于测量频率范围内', 'options.features.' + key)
          c.metric(key, '从幅频图读取的' + key, value, 'Hz', '对应曲线最大电压读数的频率', { method: 'graphical', ...(selected[key] ? { selectedData: selected[key] } : {}), ...(reference == null ? {} : { reference }) })
        })
      }
    }
    return rows
  })
  c.run('amplitude-20', () => {
    const rows = c.rows('amplitude-20', ['frequency', 'ur'], { min: 3, rules: { frequency: { positive: true }, ur: { min: 0 } } })
    c.table('rlc-amplitude-2', '第二配置幅频数据', [col('frequency', 'f', 'kHz'), col('ur', 'U_R', 'V')], rows)
    c.chart('rlc-resistance-comparison', '不同电阻的幅频曲线', '频率', 'kHz', 'U_R', 'V', [
      ...(amplitude1 ? [{ id: 'first', label: 'R=' + c.p.resistance1 + 'Ω', points: amplitude1.map(r => ({ x: r.frequency, y: r.ur })) }] : []),
      { id: 'second', label: 'R=' + c.p.resistance2 + 'Ω', points: rows.map(r => ({ x: r.frequency, y: r.ur })) }])
  })
  c.run('phase', () => {
    const rows = c.rows('phase-200', ['frequency', 'a', 'b'], { min: 2, rules: { frequency: { positive: true }, a: { positive: true }, b: { min: 0 } } })
    const signs = c.options.phaseSigns
    if (signs != null && (!Array.isArray(signs) || signs.length !== rows.length || signs.some(v => ![-1, 0, 1].includes(v)))) throw new CalculationError('INVALID_PHASE_SIGNS', 'phaseSigns须与相频表等长，逐项为-1、0或1', 'options.phaseSigns')
    if (!signs) c.manual('phase-direction', '报告φ格按原表arcsin(B/A)列出主值幅值；结合实际通道与椭圆倾斜分析超前/滞后，不把理论相位的符号冒充实测。')
    const processed = rows.map((r, i) => {
      if (r.b > r.a) throw new CalculationError('ELLIPSE_RATIO', '椭圆法要求0≤B/A≤1', 'tables.phase-200.rows[' + i + ']')
      const magnitude = Math.asin(r.b / r.a)
      if (signs && signs[i] === 0 && magnitude > 1e-12) throw new CalculationError('PHASE_SIGN_ZERO', '非零相位幅值不能用0符号清除', 'options.phaseSigns[' + i + ']')
      return { ...r, ratio: r.b / r.a, phaseMagnitude: magnitude, phase: signs ? signs[i] * magnitude : null,
        theory: circuit ? Math.atan((2 * Math.PI * r.frequency * 1000 * circuit.L - 1 / (2 * Math.PI * r.frequency * 1000 * circuit.C)) / (circuit.r1 + circuit.loss)) : null }
    })
    c.table('rlc-phase', '椭圆法相频处理', [col('frequency', 'f', 'kHz'), col('a', 'A', 'V'), col('b', 'B', 'V'), col('ratio', 'B/A'), col('phaseMagnitude', '主值幅值', 'rad'), col('phase', '按接线确定的φ', 'rad'), col('theory', '电压减电流理论相位', 'rad')], processed)
    c.chart('rlc-phase', '相频特性', '频率', 'kHz', '相位差', 'rad', [{ id: signs ? 'signed' : 'magnitude', label: signs ? '实测有符号相位' : '实测主值幅值（未定符号）', points: processed.map(r => ({ x: r.frequency, y: signs ? r.phase : r.phaseMagnitude })) },
      ...(circuit ? [{ id: 'theory', label: signs ? 'U相位减I相位的理论值' : '理论相位主值幅值（不推断实测符号）', type: 'line', points: processed.map(r => ({ x: r.frequency, y: signs ? r.theory : Math.abs(r.theory) })) }] : [])])
  })
}

module.exports = { 'ballistic-galvanometer': ballistic, 'strain-sensor': strain, 'pn-junction': pn, 'hall-effect': hall, rlc }
