// 字段与单位核对自《实验数据表汇总.xlsx》01—06、14 工作表，结合原始记录模板。
// 仅整理输入、单位及少量直接派生量，不在录入页代替完整实验数据处理。
const field = (key, label, unit, extra = {}) => ({ key, label, unit, ...extra })
const positive = { min: 0, exclusiveMin: true }
const nonnegative = { min: 0 }
const preset = (start, step, digits = 2) => ({ start, step, digits })
const table = (id, title, columns, extra = {}) => ({
  id, title, columns, defaultRows: 5, minRows: 1, maxRows: 30, addStep: 1, ...extra,
})
const computed = (key, label, unit, operation, sources, extra = {}) =>
  field(key, label, unit, { computed: { operation, sources }, ...extra })

const definitions = {
  'young-modulus': {
    subtitle: '记录加卸载读数与钢丝直径，自动整理平均读数和逐差配对。',
    hint: '加载与卸载应对应同一砝码质量；零点读数可填负值，无零差时请明确填 0。',
    parameters: [
      field('wireLength', '钢丝原长 L', 'mm', positive),
      field('lengthResolution', '长度测量分度', 'mm', positive),
      field('micrometerZero', '外径千分尺零点读数', 'mm'),
      field('lengthErrorLimit', '长度测量误差限（可选）', 'mm', { optional: true, ...positive }),
      field('diameterErrorLimit', '千分尺误差限（可选）', 'mm', { optional: true, ...positive }),
      field('gravity', '重力加速度 g', 'm/s²', { value: '9.801', ...positive }),
    ],
    tables: [
      table('loading', '表 1 · 加外力后标尺的读数', [
        field('mass', '砝码质量 m', 'g', nonnegative), field('loading', '加载读数 n', 'mm'),
        field('unloading', '卸载读数 n′', 'mm'), computed('meanReading', '平均读数', 'mm', 'mean', ['loading', 'unloading']),
      ], { defaultRows: 10, minRows: 4, addStep: 2, presets: { mass: preset(0, 100, 0) }, increasing: 'mass',
        hint: '按实际读数填写。逐差配对要求偶数行；增减一次为两行。' }),
      table('diameter', '表 2 · 钢丝直径测量', [field('diameter', '千分尺直径读数 d', 'mm', positive)],
        { summaries: ['diameter'], minRows: 1 }),
      table('differences', '表 3 · 逐差数据整理', [field('startIndex', '起始序号', ''), field('endIndex', '终止序号', ''), field('force', '外力差 ΔF', 'N'), field('extension', '伸长量差 C', 'mm')],
        { derived: 'young-differences', hint: '只读：前后半组配对，ΔF=(m后−m前)g，C=|平均读数后−平均读数前|。' }),
    ],
  },
  'kelvin-bridge': {
    subtitle: '分别记录铜棒直径、正反向电阻及不同长度下的电阻。',
    hint: 'R 正向、R 反向都按 Ω 录入；不要把同一长度的两次方向读数当作两个独立实验。',
    parameters: [
      field('micrometerZero', '外径千分尺零点读数', 'mm'),
      field('length', '铜棒长度 L', 'cm', { value: '40.00', ...positive }),
      field('r1', '桥臂电阻 R1', 'Ω', { value: '100', ...positive }),
      field('r2', '桥臂电阻 R2', 'Ω', { value: '100', ...positive }),
      field('r3', '桥臂电阻 R3', 'Ω', { value: '1000', ...positive }),
      field('r4', '桥臂电阻 R4', 'Ω', { value: '1000', ...positive }),
      field('referenceResistivity', '参考电阻率（可选）', 'Ω·m', { optional: true, ...positive }),
    ],
    tables: [
      table('diameter', '表 1 · 铜棒直径测量', [field('diameter', '千分尺直径读数 d', 'mm', positive)], { summaries: ['diameter'] }),
      table('resistance', '表 2 · 固定长度的电阻测量', [
        field('forward', 'R 正向', 'Ω', positive), field('reverse', 'R 反向', 'Ω', positive),
        computed('meanResistance', '正反向平均 R', 'Ω', 'mean', ['forward', 'reverse']),
        computed('rx', '换算 Rx', 'Ω', 'backend', []),
      ], { summaries: ['meanResistance'], hint: '换向均值为两读数的平均；Rx 的仪器换算关系由数据处理模块确定。' }),
      table('length-resistance', '表 3 · 不同长度的电阻测量', [
        field('length', '铜棒长度 L', 'cm', positive), field('forward', 'R 正向', 'Ω', positive), field('reverse', 'R 反向', 'Ω', positive),
        computed('meanResistance', '正反向平均 R', 'Ω', 'mean', ['forward', 'reverse']),
        computed('rx', '换算 Rx', 'Ω', 'backend', []),
      ], { presets: { length: preset(20, 5) }, increasing: 'length' }),
    ],
  },
  'ballistic-galvanometer': {
    subtitle: '记录两组电容比较数据与正、反向高电阻放电数据。',
    hint: '电容统一为 μF，电荷统一为 μC。正反向电荷按仪器实际符号记录；高阻表自动计算 ln|Q / 1 μC|。',
    parameters: [
      field('standardCapacitance1', '表 1 标准电容 CN', 'μF', positive),
      field('standardCapacitance2', '表 2 标准电容 CN', 'μF', positive),
      field('resistanceCapacitance', '高阻测量使用的标准电容', 'μF', positive),
      field('dischargeVoltage', '高阻测量充电电压 U', 'V', { value: '15.00', ...positive }),
      field('nominalResistance', '高电阻标称值', 'MΩ', { value: '100', ...positive }),
    ],
    tables: [1, 2].map(n => table(`capacitance-${n}`, `表 ${n} · 电容比较测量`, [
      field('voltage', '充电电压 U', 'V', positive),
      field('standardForward', '标准电容 QN 正', 'μC'), field('standardReverse', '标准电容 QN 反', 'μC'),
      computed('standardMean', 'QN 均值', 'μC', 'backend', []),
      field('unknownForward', '待测电容 QX 正', 'μC'), field('unknownReverse', '待测电容 QX 反', 'μC'),
      computed('unknownMean', 'QX 均值', 'μC', 'backend', []),
    ], { defaultRows: 8, presets: { voltage: preset(11, 1) }, increasing: 'voltage',
      hint: '保留正反向原始电荷；平均方式与最终电容计算由实验处理模块完成。' })).concat(
      ['forward', 'reverse'].map((direction, index) => table(`discharge-${direction}`, `表 ${index + 3} · 高电阻测量（${index ? '反向' : '正向'}）`, [
        field('nominalTime', '设定时间 t0', 's', positive), field('actualTime', '实测时间 t', 's', positive),
        field('charge', index ? 'Q 反' : 'Q 正', 'μC', { nonzero: true }),
        computed('lnAbsCharge', 'ln|Q / 1 μC|', '', 'ln-abs', ['charge']),
      ], { presets: { nominalTime: ['5.00', '10.00', '20.00', '30.00', '40.00'] }, increasing: 'actualTime',
        hint: '回归横坐标使用实测时间；Q=0 不能取对数，反向读数允许负值。' })),
    ),
  },
  'thermal-conductivity': {
    subtitle: '分别记录升温趋稳数据和散热盘在稳态附近的冷却数据。',
    hint: '模板记录量是仪器电压 mV，不能直接当成 °C。时间按 min 记录，原始电压及稳态值分别保留。',
    parameters: [
      field('copperMass', '铜盘质量 m', 'g', { value: '900.0', ...positive }),
      field('sampleRadius', '样品盘半径 RB', 'cm', { value: '6.50', ...positive }),
      field('sampleThickness', '样品盘厚度 hB', 'cm', { value: '0.800', ...positive }),
      field('coolingRadius', '散热盘半径 RC', 'cm', { value: '6.50', ...positive }),
      field('coolingThickness', '散热盘厚度 hC', 'cm', { value: '0.742', ...positive }),
      field('specificHeat', '铜盘比热容 c', 'J/(kg·K)', { value: '390', ...positive }),
      field('steadyHeatingVoltage', '加热盘稳态电压 U1', 'mV'),
      field('steadyCoolingVoltage', '散热盘稳态电压 U2', 'mV'),
    ],
    tables: [
      table('heating', '表 1 · 每隔 1 min 的温度示值记录', [field('time', '时间 t', 'min', nonnegative),
        field('heatingVoltage', '加热盘 U1', 'mV'), field('coolingVoltage', '散热盘 U2', 'mV')],
      { defaultRows: 20, minRows: 3, maxRows: 100, increasing: 'time' }),
      table('cooling', '表 2 · 稳态值附近的冷却记录', [field('time', '时间 t', 'min', nonnegative), field('voltage', '散热盘 U3', 'mV')],
        { defaultRows: 20, minRows: 3, maxRows: 100, increasing: 'time' }),
    ],
  },
  rlc: {
    subtitle: '记录两种电阻条件下的幅频特性，以及李萨如图形的相位读数。',
    hint: '频率统一为 kHz，电压统一为 V。A、B 是同一李萨如图形的对应读数，B 不可大于 A。',
    parameters: [
      field('resistance', '表 1、2 电阻 R', 'Ω', { value: '200', ...positive }),
      field('lowResistance', '表 3 电阻 R', 'Ω', { value: '20', ...positive }),
      field('inductance', '电感 L', 'mH', { value: '40', ...positive }),
      field('capacitance', '电容 C', 'μF', { value: '1', ...positive }),
      field('sourceVpp', '设定电源峰峰值 Vpp', 'V', { value: '6.00', ...positive }),
      field('actualParameters', '实际参数补充（可选）', '', { type: 'text', optional: true }),
    ],
    tables: [
      table('amplitude', '表 1 · 幅频特性', [field('frequency', '频率 f', 'kHz', positive),
        field('ul', 'UL', 'V', nonnegative), field('uc', 'UC', 'V', nonnegative),
        field('ur', 'UR', 'V', nonnegative), field('us', 'US', 'V', nonnegative)],
      { defaultRows: 10, minRows: 3, presets: { frequency: preset(.2, .2) }, increasing: 'frequency', summaries: ['us'] }),
      table('phase', '表 2 · 相频特性', [field('frequency', '频率 f', 'kHz', positive),
        field('b', 'B', 'V', nonnegative), field('a', 'A', 'V', positive),
        computed('phaseRadians', 'φ=arcsin(B/A)', 'rad', 'asin-ratio', ['b', 'a']),
        field('phaseNote', '相位符号说明（可选）', '', { type: 'text', optional: true, placeholder: '按观察填写超前/滞后' })],
      { defaultRows: 10, minRows: 3, presets: { frequency: preset(.2, .2) }, increasing: 'frequency',
        hint: '显示反正弦主值；超前/滞后及象限仍需结合实际图形判断，不能仅由 B/A 确定。' }),
      table('low-resistance', '表 3 · 小电阻条件的幅频特性', [field('frequency', '频率 f', 'kHz', positive), field('ur', 'UR', 'V', nonnegative)],
        { defaultRows: 10, minRows: 3, presets: { frequency: preset(.2, .2) }, increasing: 'frequency' }),
    ],
  },
  'torsion-pendulum': {
    subtitle: '记录圆柱直径、十周期计时，以及滑块在不同位置的五周期计时。',
    hint: '10T 与 5Tx 都是多周期总时间，不能把一次周期直接填入；质量统一为 kg，直径为 mm，位置为 cm。',
    parameters: [
      field('cylinderMass', '塑料圆柱质量 M', 'kg', positive),
      field('caliperResolution', '游标卡尺最小分度值', 'mm', positive),
      field('timerResolution', '数字毫秒计精度', 's', { value: '0.01', ...positive }),
      field('sliderMass', '滑块质量', 'kg', positive),
    ],
    tables: [
      table('diameter', '表 1 · 塑料圆柱直径', [field('diameter', '直径 D', 'mm', positive)], { summaries: ['diameter'] }),
      table('period', '表 2 · 周期测量', [field('tenT0', '空载 10T0', 's', positive), field('tenT1', '加载圆柱 10T1', 's', positive),
        computed('t0', 'T0', 's', 'divide-10', ['tenT0']), computed('t1', 'T1', 's', 'divide-10', ['tenT1'])],
      { summaries: ['tenT0', 'tenT1', 't0', 't1'] }),
      table('slider', '表 3 · 金属细杆与不同滑块位置', [field('condition', '测量对象', '', { fixed: true, value: '滑块' }),
        field('position', '位置 x', 'cm', nonnegative),
        ...[1, 2, 3, 4, 5].map(i => field(`time${i}`, `第 ${i} 次 5Tx`, 's', positive)),
        computed('meanFiveTx', '平均 5Tx', 's', 'mean', ['time1', 'time2', 'time3', 'time4', 'time5']),
        computed('tx', '平均 Tx', 's', 'divide-5', ['meanFiveTx'])],
      { defaultRows: 6, minRows: 2, maxRows: 30, presets: { position: preset(0, 5) },
        rowOverrides: { 0: { values: { condition: '金属细杆', position: '' }, locked: ['position'] } },
        hint: '第一行为无滑块的金属细杆基线；其余每行是一处滑块位置，横向滑动填写五次计时。' }),
    ],
  },
  'pn-junction': {
    subtitle: '记录同温伏安数据和同一恒流下的温度—压降数据。',
    hint: '本页收集正向压降 UF 的绝对值（V），不是调零后的电压差；电流用 μA，温度用 °C。',
    parameters: [field('ivTemperature', '伏安测量温度 t', '°C', { min: -273.15, exclusiveMin: true }),
      field('constantCurrent', '温度测量恒流 IF', 'μA', positive)],
    tables: [
      table('iv', '表 1 · 同一温度下的正向伏安关系', [field('voltage', 'UF', 'V', positive), field('current', 'IF', 'μA', positive),
        computed('lnCurrent', 'ln(IF / 1 μA)', '', 'ln', ['current'])],
      { defaultRows: 20, minRows: 3, maxRows: 100, presets: { voltage: preset(.35, .01, 3) }, increasing: 'voltage' }),
      table('temperature', '表 2 · 同一恒流下的温度关系', [field('temperature', '温度 t', '°C', { min: -273.15, exclusiveMin: true }),
        field('voltage', '正向压降 UF', 'V', positive), computed('kelvin', '热力学温度 T', 'K', 'celsius', ['temperature'])],
      { defaultRows: 20, minRows: 3, maxRows: 100, increasing: 'temperature',
        hint: '温度按实际测量填写，不预填实验读数；导出的 PN 请求可直接交给现有 Python 后端。' }),
    ],
  },
}

module.exports = { definitions, supportedIds: Object.keys(definitions) }
