const { CalculationError, numeric, fitLine } = require('../report-math')
const col = (key, label, unit = '') => ({ key, label, unit })

function thermal(c) {
  c.run('heating', () => {
    const rows = c.rows('heating', ['time', 'u1', 'u2'], { min: 1, skipEmpty: true, rules: { time: { min: 0 } } })
    c.table('thermal-heating', '升温过程', [col('time', '时间', 'min'), col('u1', '加热盘电压', 'mV'), col('u2', '散热盘电压', 'mV')], rows)
    c.chart('thermal-heating', '两盘升温过程', '时间', 'min', '温度示值电压', 'mV', ['u1', 'u2'].map(key => ({ id: key, label: key === 'u1' ? '加热盘' : '散热盘', points: rows.map(r => ({ x: r.time, y: r[key] })) })))
  })
  const cooling = c.run('cooling', () => {
    const rows = c.rows('cooling', ['time', 'u3'], { min: 3, skipEmpty: true, rules: { time: { min: 0 } } })
    if (rows.some((r, i) => i && r.time <= rows[i - 1].time)) throw new CalculationError('TIME_SEQUENCE', '冷却时间应严格递增', 'tables.cooling')
    c.table('thermal-cooling', '冷却过程', [col('time', '时间', 'min'), col('u3', '散热盘电压', 'mV')], rows)
    c.chart('thermal-cooling', '稳态值附近冷却曲线', '时间', 'min', '散热盘电压', 'mV', [{ id: 'measured', label: '实测冷却曲线', points: rows.map(r => ({ x: r.time, y: r.u3 })) }], 'graph-paper')
    return rows
  })
  c.run('conductivity', () => {
    if (!cooling) return
    const m = c.param('mass', { positive: true }) * 1e-3, cp = c.param('specificHeat', { positive: true })
    const rb = c.param('sampleRadius', { positive: true }) * 1e-2, hb = c.param('sampleThickness', { positive: true }) * 1e-2
    const rc = c.param('diskRadius', { positive: true }) * 1e-2, hc = c.param('diskThickness', { positive: true }) * 1e-2
    const u1 = c.param('steadyU1'), u2 = c.param('steadyU2')
    let tangent = c.options.tangent
    let automaticFit = null
    if (!tangent && c.options.autoCoolingTangent) {
      const target = c.options.sharedTemperatureCalibration === true ? u2 : null
      if (target == null) throw new CalculationError('TEMPERATURE_CALIBRATION_REQUIRED', '请核对三个温度通道的共同温标', 'parameters.steadyU2')
      const bracket = cooling.findIndex((r, i) => r.u3 === target || i < cooling.length - 1 && (r.u3 - target) * (cooling[i + 1].u3 - target) <= 0)
      if (bracket < 0) throw new CalculationError('TANGENT_OUTSIDE_DATA', '冷却记录应覆盖散热盘稳态温度，无法在数据外自动取切线', 'tables.cooling')
      const start = Math.min(Math.max(0, bracket - 1), cooling.length - 3)
      const local = cooling.slice(start, start + 3)
      const fit = fitLine(local.map(r => ({ x: r.time, y: r.u3 })))
      if (fit.slope >= 0) throw new CalculationError('NON_COOLING_TANGENT', '稳态温度附近的冷却数据未呈下降趋势，请核对实测记录', 'tables.cooling')
      const time = (target - fit.intercept) / fit.slope
      const low = cooling[0].time, high = cooling[cooling.length - 1].time
      if (time < low || time > high) throw new CalculationError('TANGENT_OUTSIDE_DATA', '局部切线的切点超出实测时间范围，请补充稳态附近记录', 'tables.cooling')
      const span = (local[local.length - 1].time - local[0].time) / 4
      const selectedPoints = [Math.max(low, time - span), Math.min(high, time + span)].map((candidate, i) => {
        // 切点在记录端点时仍从范围内取非测量点，不把端点贴成“非测量点”。
        const direction = candidate <= (low + high) / 2 ? 1 : -1
        let x = candidate
        for (let j = 0; j < 40; j++) {
          x = candidate + direction * span * j * .000137
          if (x > low && x < high && !cooling.some(r => Math.abs(r.time - x) < (high - low) * 1e-10)) break
        }
        return { label: ['P₁', 'P₂'][i], x, y: target + fit.slope * (x - time), source: 'local-tangent', isMeasurement: false }
      })
      automaticFit = { ...fit, automatic: true, method: 'graphical', selectedPoints,
        sourceRows: local.map(r => r.sourceRow), tangentAt: { x: time, y: target },
        selectionRule: '自动选择稳态电压附近3个实测点作局部线性近似切线，再取切线上P₁/P₂求斜率；这是局部数值近似，不把整段冷却曲线当直线。' }
      tangent = { atVoltageMv: target, slopeMvPerMin: fit.slope }
      const chart = c.report.charts.find(chart => chart.id === 'thermal-cooling')
      chart.series.push({ id: 'cooling-tangent', label: '稳态附近局部近似切线', type: 'line', points: selectedPoints }, { id: 'cooling-selected', label: '程序选取的切线点', type: 'selected-points', points: selectedPoints })
    }
    if (!tangent || typeof tangent !== 'object') throw new CalculationError('TANGENT_REQUIRED', '请提供稳态温度处的人工切线，不能把整条冷却曲线回归冒充该处切线', 'options.tangent', 'missing')
    let slope
    if ((c.options.graphical || {}).coolingTangent) slope = c.graph('cooling-tangent', 'coolingTangent', 'thermal-cooling').slope
    else slope = numeric(tangent.slopeMvPerMin, 'options.tangent.slopeMvPerMin')
    if (slope >= 0) throw new CalculationError('NON_COOLING_TANGENT', '冷却切线斜率应为负值', 'options.tangent')
    const targetVoltage = numeric(tangent.atVoltageMv, 'options.tangent.atVoltageMv')
    let temperatureDifference, coolingRate, expectedVoltage
    if (c.options.sharedTemperatureCalibration === true) {
      expectedVoltage = u2
      temperatureDifference = u1 - u2
      coolingRate = -slope / 60
      c.assume('三个通道具有相同线性温度系数，零点差已消除，温度系数在斜率与温差比中相消。')
    } else {
      const cal = c.options.temperatureCalibration
      if (!cal) throw new CalculationError('TEMPERATURE_CALIBRATION_REQUIRED', '请确认通道共用温标，或提供三个通道的温度标定', 'options.sharedTemperatureCalibration', 'missing')
      const t = (key, voltage) => numeric(cal[key] && cal[key].gainKPerMv, 'options.temperatureCalibration.' + key + '.gainKPerMv', { positive: true }) * voltage + numeric(cal[key] && cal[key].offsetK, 'options.temperatureCalibration.' + key + '.offsetK')
      const t1 = t('heating', u1), t2 = t('disk', u2)
      const g3 = numeric(cal.cooling && cal.cooling.gainKPerMv, 'options.temperatureCalibration.cooling.gainKPerMv', { positive: true })
      const o3 = numeric(cal.cooling && cal.cooling.offsetK, 'options.temperatureCalibration.cooling.offsetK')
      temperatureDifference = t1 - t2; coolingRate = -g3 * slope / 60; expectedVoltage = (t2 - o3) / g3
    }
    c.requirePositive(temperatureDifference, 'thermal.temperatureDifference')
    if (Math.abs(targetVoltage - expectedVoltage) > 1e-8 * Math.max(1, Math.abs(expectedVoltage))) throw new CalculationError('WRONG_TANGENT_TEMPERATURE', '切线目标电压不对应散热盘稳态温度', 'options.tangent.atVoltageMv')
    const min = Math.min(...cooling.map(r => r.u3)), max = Math.max(...cooling.map(r => r.u3))
    if (targetVoltage < min || targetVoltage > max) throw new CalculationError('TANGENT_OUTSIDE_DATA', '稳态目标温度不在所记录的冷却电压范围内', 'options.tangent')
    const correction = (rc + 2 * hc) / (2 * rc + 2 * hc)
    c.metric('coolingTangentSlope', '稳态处冷却电压切线斜率', slope, 'mV/min', 'b=(U_B−U_A)/(t_B−t_A)', { method: 'graphical', ...(automaticFit ? { fit: automaticFit } : {}), inputs: { targetVoltageMv: targetVoltage } })
    c.metric('thermalConductivity', '样品导热系数', m * cp * coolingRate / temperatureDifference * correction * hb / (Math.PI * rb ** 2), 'W/(m·K)', 'λ=mc|dT/dt|·(R_C+2h_C)/(2R_C+2h_C)·h_B/[(T₁−T₂)πR_B²]',
      { inputs: { massKg: m, specificHeat: cp, coolingRatePerSecond: coolingRate, temperatureOrVoltageDifference: temperatureDifference, geometricCorrection: correction, sampleThicknessM: hb, sampleRadiusM: rb, sharedCalibration: c.options.sharedTemperatureCalibration === true } })
  })
}

module.exports = { 'thermal-conductivity': thermal }
