// 基础测量字段。文件末尾由report-form-templates按实验报告处理表确定最终结构。
// 测量输入保持原始字符串，自动计算格只读，处理结果不覆盖测量值。
const number = (key, label, options = {}) => ({ key, label, kind: 'number', width: 180, ...options })
const fixed = (key, label, width = 110) => ({ key, label, kind: 'fixed', width })
const computed = (key, label) => ({ key, label, kind: 'computed', width: 180 })
const text = (key, label, options = {}) => ({ key, label, kind: 'text', width: 500, ...options })
const parameter = (key, label, value = '', options = {}) => ({ key, label, value, kind: 'number', ...options })
const serial = () => fixed('number', '序号')
const sequence = count => Array.from({ length: count }, (_, i) => [String(i + 1)])
const table = (id, title, columns, rows, options = {}) => ({ id, title, columns, rows, ...options })
const horizontal = (fields, options = {}) => ({ type: 'horizontal', fields, ...options })
const vertical = (options = {}) => ({ type: 'vertical', ...options })
const diameterTable = (title, symbol = 'd') => table('diameters', title, [serial(), number('diameter', symbol + '/mm', { positive: true })], sequence(5), { layout: horizontal(['diameter'], { average: true }) })
const voltages = () => [1, 2, 3, 4].map(i => number('u' + i, 'U' + ['₁', '₂', '₃', '₄'][i - 1]))
const frequencyRows = () => Array.from({ length: 10 }, (_, i) => [String(i + 1), ((i + 1) / 5).toFixed(2)])
const strainColumns = () => [number('x', '位移 x/mm'), ...[1, 2, 3].reduce((all, i) => all.concat(number('forward' + i, '正行程'), number('reverse' + i, '反行程'), computed('hysteresis' + i, '滞后')), []), computed('mean', '校准平均值')]
const positionColumns = () => [fixed('number', ''), number('start', '起始位置/mm'), number('end', '终止位置/mm'), computed('difference', '差值/mm')]
const chargeColumns = () => [serial(), number('voltage', 'U/V'), number('standardForward', 'Q_N正/μC'), number('standardReverse', 'Q_N反/μC'), computed('standardMean', '/μC'), number('unknownForward', 'Q_x正/μC'), number('unknownReverse', 'Q_x反/μC'), computed('unknownMean', '/μC')]
const dischargeColumns = suffix => [serial(), number('setTime', '设定时间 t₀/s', { positive: true }), number('actualTime', '实测时间 t/s', { positive: true }), number('charge', 'Q' + suffix + '/μC'), computed('logCharge', 'ln[Q' + suffix + '/μC]')]
const ringColumns = (labels, direction = false) => [direction ? fixed('direction', '方向') : serial(), ...labels.map((label, i) => number('position' + (i + 1), label, { width: 210 }))]
const directionRows = () => ['→', '←', '→', '←'].map(value => [value])
const zeemanPhenomena = [
  ['光的方向与磁场方向垂直', '无磁场（B=0）'],
  ['光的方向与磁场方向垂直', '有磁场，光路中无偏振片'],
  ...['0°（360°）', '90°', '180°', '270°'].map(angle => ['光的方向与磁场方向垂直', '有磁场，光路中有偏振片；透振角度 ' + angle]),
  ['光的方向与磁场方向平行', '无磁场（B=0）'],
  ['光的方向与磁场方向平行', '有磁场，光路中无偏振片'],
  ['光的方向与磁场方向平行', '有磁场，光路中仅有偏振片'],
  ['光的方向与磁场方向平行', '有磁场，光路中有偏振片和λ/4片'],
  ...['正平行', '反平行'].reduce((all, direction) => all.concat(['45°（225°）', '135°（315°）'].map(angle => [direction, '有磁场，偏振片和λ/4片；透振角度 ' + angle])), []),
]
const definitions = {
  'young-modulus': {
    source: '杨氏模量原始记录图，第1–3页', note: 'nᵢ为每次增加砝码时标尺的读数，n′ᵢ为每次减少砝码时标尺的读数。保留外径千分尺零点读数。',
    parameters: [parameter('wireLength', '钢丝原长 L/cm', '89.00', { positive: true }), parameter('division', '毫米尺最小分度/mm', '1', { positive: true }), parameter('micrometerZero', '外径千分尺零点读数/mm'), parameter('diameterLimit', '千分尺仪器误差/mm', '', { positive: true, optional: true }), parameter('gravity', '重力加速度 g/(m/s²)', '9.801', { positive: true })],
    tables: [table('loading', '加外力后标尺的读数', [serial(), number('mass', 'm/g', { min: 0 }), number('loading', 'nᵢ/mm'), number('unloading', 'n′ᵢ/mm')], Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i * 100)]), { layout: horizontal(['mass', 'loading', 'unloading']) }), diameterTable('钢丝直径测量数据')],
  },
  'kelvin-bridge': {
    source: '开尔文电桥原始记录图，第1–2页', note: '分别记录电阻箱正、反向读数R_N。换向均值、电阻率及不确定度在数据处理阶段计算。',
    parameters: [parameter('r1', 'R₁/Ω', '100', { positive: true }), parameter('r2', 'R₂/Ω', '100', { positive: true }), parameter('r3', 'R₃/Ω', '1000', { positive: true }), parameter('r4', 'R₄/Ω', '1000', { positive: true }), parameter('fixedLength', 'L/cm', '40.00', { positive: true }), parameter('micrometerZero', '外径千分尺零点读数/mm'), parameter('lengthDivision', '毫米尺最小分度/mm', '1', { positive: true })],
    tables: [diameterTable('铜棒直径测量数据'),
      table('fixed-resistance', '电阻R_N的测量数据', [serial(), number('forward', 'R正向/Ω'), number('reverse', 'R反向/Ω')], sequence(5), { layout: horizontal(['forward', 'reverse'], { average: true, groupLabel: 'R_N/Ω' }) }),
      table('variable-length', '不同长度时电阻R_N的测量数据', [serial(), number('length', 'L/cm', { positive: true }), number('forward', 'R正向/Ω'), number('reverse', 'R反向/Ω')], [20, 25, 30, 35, 40].map((v, i) => [String(i + 1), v.toFixed(2)]), { layout: horizontal(['forward', 'reverse'], { headerKey: 'length', groupLabel: 'R_N/Ω' }) })],
  },
  'ballistic-galvanometer': {
    source: '数字积分冲击电流计原始记录图，第1–2页', note: '保留正反向电量的实际符号。后续作图使用实测时间。电容表中仅印“/μC”的两行按原件保留。',
    parameters: [parameter('standardCapacitance1', '表1 标准电容/μF', '', { positive: true }), parameter('standardCapacitance2', '表2 标准电容/μF', '', { positive: true }), parameter('dischargeVoltage', '高阻测量电压 U/V', '15.00', { positive: true }), parameter('referenceResistance', '高阻 R/MΩ', '100', { positive: true }), parameter('dischargeCapacitanceForward', '表3 正向测量标准电容/μF', '', { positive: true }), parameter('dischargeCapacitanceReverse', '表4 反向测量标准电容/μF', '', { positive: true })],
    tables: [1, 2].map(i => table('capacitance-' + i, '用冲击电流计测电容数据', chargeColumns(), Array.from({ length: 8 }, (_, j) => [String(j + 1), (j + 11).toFixed(2)]), { layout: horizontal(['voltage', 'standardForward', 'standardReverse', 'standardMean', 'unknownForward', 'unknownReverse', 'unknownMean']) }))
      .concat(['forward', 'reverse'].map((direction, i) => table('discharge-' + direction, '用冲击电流计测高阻数据（' + (i ? '反向' : '正向') + '）', dischargeColumns(i ? '反' : '正'), [5, 10, 20, 30, 40].map((v, j) => [String(j + 1), v.toFixed(2)]), { layout: horizontal(['setTime', 'actualTime', 'charge', 'logCharge']) }))),
  },
  'thermal-conductivity': {
    source: '不良导体导热系数原始记录图，第1–2页', note: '时间单位min，电压单位mV；按实际测量继续增加记录，不限定20个点。',
    parameters: [parameter('mass', '铜盘质量 m/g', '900.0', { positive: true }), parameter('specificHeat', '铜盘比热容 c/[J/(kg·K)]', '390', { positive: true }), parameter('sampleRadius', '样品盘半径 R_B/cm', '6.50', { positive: true }), parameter('sampleThickness', '样品盘厚度 h_B/cm', '0.800', { positive: true }), parameter('diskRadius', '散热盘半径 R_C/cm', '6.50', { positive: true }), parameter('diskThickness', '散热盘厚度 h_C/cm', '0.742', { positive: true }), parameter('steadyU1', '加热盘稳态时电压值 U₁/mV'), parameter('steadyU2', '散热盘稳态时电压值 U₂/mV')],
    tables: [table('heating', '每隔1min读取的温度示值', [serial(), number('time', '时间 t/min', { min: 0 }), number('u1', '加热盘电压 U₁/mV'), number('u2', '散热盘电压 U₂/mV')], sequence(7), { adjustable: true, skipEmptyRows: true, layout: horizontal(['u1', 'u2'], { headerKey: 'time', ellipsis: true }) }),
      table('cooling', '散热盘在稳态值附近的散热速率', [serial(), number('time', '时间 t/min', { min: 0 }), number('u3', '散热盘电压 U₃/mV')], sequence(7), { adjustable: true, skipEmptyRows: true, layout: horizontal(['u3'], { headerKey: 'time', ellipsis: true }) })],
  },
  rlc: {
    source: 'RLC电路特性原始记录图，第1–3页', note: 'RLC串联电路的稳态特性。可按实际仪器修改参数，并增加谐振附近测量点。',
    parameters: [parameter('inductance', 'L/mH', '40', { positive: true }), parameter('capacitance', 'C/μF', '1', { positive: true }), parameter('sourceVpp', 'V_PP/V', '6.00', { positive: true }), parameter('resistance1', '表1、表2 R/Ω', '200', { positive: true }), parameter('resistance2', '表3 R/Ω', '20', { positive: true }), parameter('phaseSign', '相位正负及椭圆倾斜情况（辅助记录）', '', { kind: 'text', optional: true })],
    tables: [table('amplitude-200', 'RLC串联电路的幅频特性', [serial(), number('frequency', 'f/kHz', { positive: true }), number('ul', 'U_L/V'), number('uc', 'U_C/V'), number('ur', 'U_R/V'), number('us', 'U_S/V')], frequencyRows(), { adjustable: true, layout: horizontal(['frequency', 'ul', 'uc', 'ur', 'us']) }),
      table('phase-200', 'RLC串联电路的相频特性', [serial(), number('frequency', 'f/kHz', { positive: true }), number('b', 'B/V'), number('a', 'A/V'), computed('phase', 'φ=arcsin(B/A)')], frequencyRows(), { adjustable: true, layout: horizontal(['frequency', 'b', 'a', 'phase']) }),
      table('amplitude-20', 'RLC串联电路的幅频特性', [serial(), number('frequency', 'f/kHz', { positive: true }), number('ur', 'U_R/V')], frequencyRows(), { adjustable: true, layout: horizontal(['frequency', 'ur']) })],
  },
  'torsion-pendulum': {
    source: '扭摆原始记录图，第1–2页', note: '分别录入10T₀、10T₁和5T_x的累计时间。质量统一填写kg；天平读数若为g，请先换算。',
    parameters: [parameter('cylinderMass', '塑料圆柱的质量 M/kg', '', { positive: true }), parameter('sliderMass', '滑块的质量/kg', '', { positive: true }), parameter('caliperDivision', '游标卡尺的最小分度值/mm', '', { positive: true }), parameter('stopwatchPrecision', '数字毫秒计的精度/s', '0.01', { positive: true })],
    tables: [diameterTable('塑料圆柱直径的测量数据', 'D'), table('period-timing', '周期的测量数据', [serial(), number('tenT0', '10T₀/s', { positive: true }), number('tenT1', '10T₁/s', { positive: true })], sequence(5), { layout: horizontal(['tenT0', 'tenT1'], { average: true }) }),
      table('slider-timing', '滑块位于金属细杆不同位置时，周期的测量数据', [fixed('position', 'x/cm'), fixed('trial', '测次'), number('fiveTx', '转动周期 5T_x/s', { positive: true })], ['金属细杆', '5.00', '10.00', '15.00', '20.00', '25.00'].reduce((rows, position) => rows.concat(Array.from({ length: 5 }, (_, i) => [position, String(i + 1)])), []), { layout: { type: 'torsion' } })],
  },
  'hall-effect': {
    source: '霍尔效应原始记录图，第1–3页', note: '按实际接线保留带符号的U₁～U₄。两个装置的K_H分别记录。K的单位是T/A，励磁电流读数是mA。',
    parameters: [parameter('thickness', '霍尔片厚度 d/mm', '0.2', { positive: true }), parameter('magnetCoefficient', '励磁系数 K/(T/A)', '2.25e-2', { positive: true }), parameter('hallSensitivity', '亥姆霍兹线圈霍尔元件灵敏度 K_H/[mV/(mA·T)]', '', { positive: true }), parameter('solenoidHallSensitivity', '长直螺线管霍尔元件灵敏度 K_H/[mV/(mA·T)]', '', { positive: true }), parameter('polarity', '换向接线与极性', '', { kind: 'text', placeholder: '记录U₁～U₄对应的电流方向' }), parameter('fixedIM', '表1 励磁电流 I_M/mA', '500'), parameter('fixedIS', '表2 工作电流 I_S/mA', '3.50'), parameter('axialIM', '表3 励磁电流 I_M/mA', '500'), parameter('axialIS', '表3 工作电流 I_S/mA', '3.00')],
    tables: [table('working-current', '确定样品霍尔系数R_H和载流子浓度n的数据', [number('is', '工作电流 I_S/mA'), ...voltages()], [1.5, 2, 2.5, 3, 3.5].map(v => [v.toFixed(2)]), { layout: vertical({ corner: '霍尔电压 U_H/mV' }) }),
      table('magnet-current', '确定样品霍尔系数R_H和载流子浓度n的数据', [number('im', '励磁电流 I_M/mA'), ...voltages()], [100, 200, 300, 400, 500].map(v => [String(v)]), { layout: vertical({ corner: '霍尔电压 U_H/mV' }) }),
      table('axial-field', '利用霍尔元件测绘螺线管的轴向磁场分布的数据', [number('x', '位置 x/mm'), ...voltages()], [115, 125, 135, 145, 155, 165, 175, 180, 185, 190, 195, 200, 205, 210, 215, 220, 225, 230].map(v => [String(v)]), { layout: { type: 'blocks', fields: ['u1', 'u2', 'u3', 'u4'], headerKey: 'x', blockSize: 9, corner: '霍尔电压 U_H/mV' } })],
  },
  'sound-speed': {
    source: '声速测量原始记录图，第1–2页', note: '原表“李萨茹”用字保留。填写实际频率和室温；仅驻波法要求不确定度计算。',
    parameters: [parameter('frequency', 'f/kHz', '', { positive: true }), parameter('temperature', '室温 t/℃'), parameter('division', '位置读数仪器分度/mm', '', { positive: true, optional: true }), parameter('phaseRule', '相邻记录的相位规则（辅助记录）', '', { kind: 'text', optional: true })],
    tables: [table('positions', '声速测量原始数据', [serial(), number('standing', '驻波法'), number('traveling', '行波法'), number('lissajous', '李萨茹')], sequence(10), { layout: horizontal(['standing', 'traveling', 'lissajous'], { groupLabel: 'l/mm' }) })],
  },
  'strain-sensor': {
    source: '原始PDF第1–7页', note: '位移0.000～8.000mm。保留三个循环各自的正行程、反行程、滞后及校准平均值；处理格后续生成。', parameters: [],
    tables: ['single-arm', 'full-bridge'].map((id, i) => table(id, i ? '应变片全桥输入特性实验数据' : '应变片单臂输入特性实验数据', strainColumns(), Array.from({ length: 17 }, (_, j) => [(j * 0.5).toFixed(3)]), { layout: { type: 'strain' } })),
  },
  'fresnel-biprism': {
    source: '原始PDF第8、9、19页', note: 'd=|狭缝支杆位置−测微目镜支杆位置|+2.50cm。5Δx跨越5个条纹间隔，位置读数单位mm。',
    parameters: [parameter('slitPosition', '狭缝支杆位置/cm'), parameter('eyepiecePosition', '测微目镜支杆位置/cm'), parameter('distanceCorrection', '距离修正量/cm', '2.50'), parameter('reference', '标准波长 λ₀/nm', '589.3', { positive: true })],
    derivedParameters: [{ key: 'distance', label: 'd/cm', formula: 'support-distance' }],
    tables: ['fringe-spacing', 'image-l1', 'image-l2'].map((id, i) => table(id, ['5Δx的测量数据记录表', 'l₁的数据记录表', 'l₂的数据记录表'][i], positionColumns(), sequence(4), { layout: vertical() })),
  },
  polarization: {
    source: '原始PDF第13–15页', observationOnly: true, note: '原表预印文字和方向图已保留。填写实际角度及Q与A的光轴关系。',
    introSections: [
      { title: '1、起偏、检偏和消光', lines: ['现象记录：起偏：偏振片旋转一周，视场中没有明暗变化；', '检偏：偏振片旋转一周，视场中出现两次最亮、两次消光。', '现象分析及结论：当两块偏振片的透振方向相互平行时，最亮；', '当两块偏振片的透振方向相互垂直时，消光。'] },
      { title: '2、布鲁斯特定律的应用——布鲁斯特窗', lines: ['现象记录：检偏器旋转一周，视场中出现两次最亮、两次消光。', '现象分析及结论：经布鲁斯特窗出射的激光束为线偏振光。'] },
      { title: '3、1/4波片与偏振态', lines: [] },
    ],
    parameters: [parameter('additionalObservation', '实际观察补充（选填）', '', { kind: 'text', optional: true })],
    tables: [table('quarter-wave-plate', '改变λ/4片光轴方向转动检偏器观察光强的变化', [fixed('nominalAngle', '波片光轴（OA）的角度'), number('actualAngle', 'OA的实际角度'), text('brightAxes', '最亮时Q与A的光轴关系'), text('darkAxes', '最暗或消光时Q与A的光轴关系')], [0, 15, 30, 45, 60, 75, 90].map(angle => [String(angle)]), { layout: { type: 'polarization' }, fixedCells: { '3:2': '—', '3:3': '—' } })],
  },
  'single-slit': {
    source: '原始PDF第16–18页；用户确认固定第3级', note: '暗纹位置由光强分布图确定，按实验要求使用左右第3级暗纹计算。',
    parameters: [parameter('slitWidth', '单缝宽度 a/mm', '', { positive: true }), parameter('distanceLimit', 'Δz/cm', '0.05', { positive: true }), parameter('positionLimit', 'Δxₖ/mm', '0.004', { positive: true })],
    tables: [table('distances', '衍射距离z的测量数据', [fixed('number', '次序'), number('z', 'z/cm', { positive: true })], sequence(3), { layout: horizontal(['z'], { average: true }) })],
  },
  'pn-junction': {
    source: 'PN结原始PDF第1–3页', note: '恒温表保留20个电压点，恒流表按实际温度测量增加记录。ln[I_F/μA]属于后续报告处理表。',
    parameters: [parameter('constantTemperature', '表1 t/℃'), parameter('constantCurrent', '表2 恒定正向电流 I_F/μA', '', { positive: true }), parameter('boltzmannReference', '公认值 k/[J/K]', '1.38e-23', { positive: true }), parameter('bandgapReference', '公认值 E₀/eV', '1.21', { positive: true })],
    tables: [table('constant-temperature', '同一温度下正向电流与正向电压的关系', [serial(), number('voltage', 'U_F/V'), number('current', 'I_F/μA')], Array.from({ length: 20 }, (_, i) => [String(i + 1), ((35 + i) / 100).toFixed(3)]), { layout: horizontal(['voltage', 'current']) }),
      table('constant-current', '同一正向电流下，正向电压与温度的关系', [serial(), number('temperature', 't/℃'), number('voltage', 'U_F/V')], sequence(4), { adjustable: true, skipEmptyRows: true, layout: horizontal(['temperature', 'voltage'], { ellipsis: true }) })],
  },
  'zeeman-effect': {
    source: '塞曼学生版第1–3页；数据处理版第1–5页', note: '选择课堂要求的记录方案；π、σ只测其一。保留测量方向、检偏角度和原表预印现象。',
    modes: [{ id: 'combined', label: '学生版综合圆环' }, { id: 'pi', label: 'π线方案' }, { id: 'sigma', label: 'σ线方案' }],
    parameters: [parameter('excitationCoefficient', '励磁系数（含单位）', '', { kind: 'text' }), parameter('excitationCurrent', '励磁电流（含单位）', '', { kind: 'text' }), parameter('magneticField', '磁感应强度 B/T（如已测得）', '', { positive: true, optional: true }), parameter('fpSpacing', 'F-P标准具参数 d/m', '', { positive: true }), parameter('components', 'a、b环所属成分', '', { kind: 'text', modes: ['combined'] })],
    tables: [table('combined-rings', '干涉圆环位置记录表', ringColumns(['K-1级左侧', 'K-1级右侧', 'K级左侧', 'K级右侧', 'a环左侧', 'a环右侧', 'b环左侧', 'b环右侧']), sequence(4), { modes: ['combined'], sourceNumber: '2', layout: vertical({ groups: [{ label: '无磁场', span: 4 }, { label: '有磁场', span: 4 }] }) }),
      table('pi-rings', '圆环两侧位置记录表', ringColumns(['k−1(6)', 'k−1(5)', 'k−1(4)', 'k(5)', 'k(5)', 'k−1(4)', 'k−1(5)', 'k−1(6)'], true), directionRows(), { modes: ['pi'], sourceNumber: '1', layout: vertical({ groups: [{ label: '左侧', span: 4 }, { label: '右', span: 4 }] }) }),
      table('sigma-field', '加磁场后圆环两侧位置记录表', ringColumns(['k−1(7)', 'k−1(3)', 'k−1(3)', 'k−1(7)'], true), directionRows(), { modes: ['sigma'], sourceNumber: '2', layout: vertical({ groups: [{ label: '左侧', span: 2 }, { label: '右侧', span: 2 }] }) }),
      table('sigma-zero', '不加磁场时圆环两侧位置记录表', ringColumns(['k−1', 'k', 'k', 'k−1'], true), directionRows(), { modes: ['sigma'], sourceNumber: '3', layout: vertical({ groups: [{ label: '左侧', span: 2 }, { label: '右侧', span: 2 }] }) }),
      table('polarization', '实验现象记录表', [fixed('direction', '光的传播方向', 240), fixed('operation', '实验操作', 420), text('phenomenon', '实验现象', { width: 650 })], zeemanPhenomena, { sourceNumber: '1', layout: vertical({ mergeKeys: ['direction'] }), fixedCells: {
        '0:2': '视场中为一簇绿色的等倾干涉圆环', '1:2': '随着磁感应强度的增大，干涉圆环逐渐变粗变宽，最终原本1个圆环分裂成9个更细小的圆环，分别为σ线（1/2/3/7/8/9）和π线（4/5/6）',
        '6:2': '视场中为一簇绿色的等倾干涉圆环', '7:2': '随着磁感应强度的增大，干涉圆环逐渐变粗变宽，最终原本1个圆环分裂成6个更细小的圆环，仅有σ线（1/2/3/7/8/9），没有π线（4/5/6）',
      } })],
  },
  michelson: {
    source: '迈克尔孙原始实验数据记录图', note: 'n=0时的M₁镜位置≠调零时的M₁镜位置！每次级次改变量由授课教师设定。记录等倾、等厚及白光条纹现象，并在报告中详述。',
    parameters: [parameter('zeroPosition', '调零后，M₁镜位置/mm'), parameter('step', '等倾干涉级次每改变的级数', '', { positive: true, integer: true }), parameter('relativeCountUncertainty', '等倾干涉级次改变量的相对不确定度/%', '0.5', { min: 0 }), parameter('instrumentLimit', 'Δ_ins/mm', '0.00004', { positive: true }), parameter('reference', 'λ₀/nm', '650.0', { positive: true }), parameter('whiteCenterPosition', '观察到白光等厚干涉彩色条纹的中央条纹时，M₁镜位置/mm')],
    tables: [table('positions', '等倾干涉测量波长数据表', [serial(), number('order', '干涉级次改变量 n', { integer: true, min: 0 }), number('position', 'M₁镜位置/mm'), computed('difference', '|(M₁)ᵢ₊₃−(M₁)ᵢ|/mm')], Array.from({ length: 6 }, (_, i) => [String(i + 1), i === 0 ? '0' : '', '', i < 3 ? '—' : '']), { layout: horizontal(['order', 'position', 'difference']) }),
      table('observations', '实验现象与分析', [fixed('item', '项目', 400), text('analysis', '在实验报告中详述', { width: 650 })], [['一、等倾干涉现象变化特点及分析'], ['三、单色光等厚干涉条纹的变化情况及特点'], ['四、白光的等厚干涉彩色条纹的形状及颜色分布']], { unnumbered: true, layout: { type: 'records' } })],
  },
}
require('./report-form-templates').applyReportTemplates(definitions, { number, fixed, computed, text, parameter, serial, sequence, table, horizontal, vertical })
module.exports = { definitions }
