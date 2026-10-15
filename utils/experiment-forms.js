// 原始字段、单位、测量点来自《实验数据表汇总.xlsx》对应工作表。
// 本模块只定义录入模板；处理列保留为空，交给后续计算模块生成。
const number = (key, label, options = {}) => ({ key, label, kind: 'number', width: 190, ...options })
const fixed = (key, label, width = 100) => ({ key, label, kind: 'fixed', width })
const computed = (key, label) => ({ key, label, kind: 'computed', width: 190 })
const text = (key, label, options = {}) => ({ key, label, kind: 'text', width: 360, ...options })
const parameter = (key, label, value = '', options = {}) => ({ key, label, value, kind: 'number', ...options })
const sequence = count => Array.from({ length: count }, (_, i) => [String(i + 1)])
const table = (id, title, columns, rows, options = {}) => ({ id, title, columns, rows, ...options })
const serial = () => fixed('number', '序号')
const voltages = () => [1, 2, 3, 4].map(i => number('u' + i, 'U' + ['₁', '₂', '₃', '₄'][i - 1] + ' / mV'))
const hallColumns = variable => [serial(), variable, ...voltages(), computed('uh', 'U_H / mV')]
const positionColumns = () => [serial(), number('start', '起始位置 / mm'), number('end', '终止位置 / mm'), computed('difference', '差值 / mm')]
const strainColumns = () => [
  serial(), number('x', 'x / mm'),
  ...[1, 2, 3].reduce((columns, i) => columns.concat(number('forward' + i, '循环' + i + '正 / V'), number('reverse' + i, '循环' + i + '反 / V')), []),
  computed('mean', '校准均值 / V'), computed('fit', '拟合值 / V'), computed('residual', '残差 / V'),
]
const ringColumns = labels => [serial(), ...labels.map((label, i) => number('position' + (i + 1), label + ' / mm', { width: 220 }))]

const definitions = {
  'hall-effect': {
    sourceSheet: '07 霍尔效应',
    note: '按实际接线记录带符号的 U₁～U₄。模板电流、厚度及励磁系数均可按实际仪器修改。',
    parameters: [
      parameter('thickness', '样品厚度 d / mm', '0.2', { positive: true }),
      parameter('magnetCoefficient', '励磁系数 K / (T/mA)', '2.25e-3', { positive: true }),
      parameter('hallSensitivity', '给定 K_H / (mV/(mA·T))', '', { optional: true }),
      parameter('polarity', '换向接线与极性', '', { kind: 'text', placeholder: '记录 U₁～U₄ 对应的电流方向' }),
      parameter('fixedIM', '变工作电流时的 I_M / mA', '500'),
      parameter('fixedIS', '变励磁电流时的 I_S / mA', '3.50'),
      parameter('axialIM', '轴向磁场测量 I_M / mA', '500'),
      parameter('axialIS', '轴向磁场测量 I_S / mA', '3.00'),
    ],
    tables: [
      table('working-current', '变工作电流', hallColumns(number('is', 'I_S / mA')), [1.5, 2, 2.5, 3, 3.5].map((v, i) => [String(i + 1), String(v)]), { adjustable: true }),
      table('magnet-current', '变励磁电流', hallColumns(number('im', 'I_M / mA')), [100, 200, 300, 400, 500].map((v, i) => [String(i + 1), String(v)]), { adjustable: true }),
      table('axial-field', '轴向磁场分布', [...hallColumns(number('x', 'x / mm')), computed('b', 'B / T')],
        [115, 125, 135, 145, 155, 165, 175, 180, 185, 190, 195, 200, 205, 210, 215, 220, 225, 230].map((v, i) => [String(i + 1), String(v)]), { adjustable: true }),
    ],
  },
  'sound-speed': {
    sourceSheet: '08 声速',
    note: '填写实际测量频率、室温与三种方法的位置读数；行波和李萨如法的相邻记录相位规则须按实验要求注明。',
    parameters: [
      parameter('frequency', '实测频率 f / kHz', '', { positive: true }),
      parameter('temperature', '室温 t / ℃'),
      parameter('division', '位置分度 / mm', '', { positive: true }),
      parameter('phaseRule', '行波 / 李萨如相邻记录相位规则', '', { kind: 'text', placeholder: '例如相邻同相位点；按实际记录填写' }),
    ],
    tables: [
      table('positions', '三种方法位置读数', [serial(), number('standing', '驻波 l / mm'), number('traveling', '行波 l / mm'), number('lissajous', '李萨如 l / mm')], sequence(10)),
      table('differences', '逐差表', [fixed('number', '组号'), fixed('from', '起始序号', 150), fixed('to', '终止序号', 150), computed('standing', '驻波 ΔL / mm'), computed('traveling', '行波 ΔL / mm'), computed('lissajous', '李萨如 ΔL / mm')],
        Array.from({ length: 5 }, (_, i) => [String(i + 1), String(i + 1), String(i + 6)]), { hint: '配对顺序为 1→6、2→7、3→8、4→9、5→10；差值在数据处理时生成。' }),
    ],
  },
  'strain-sensor': {
    sourceSheet: '09 应变传感器',
    note: '单臂和全桥分别记录。每个位移点填写 3 个循环的正行程、反行程电压；位移点按模板预填，可修改。',
    parameters: [],
    tables: [
      table('single-arm', '单臂输入特性', strainColumns(), Array.from({ length: 17 }, (_, i) => [String(i + 1), String(i * 0.5)]), { adjustable: true }),
      table('full-bridge', '全桥输入特性', strainColumns(), Array.from({ length: 17 }, (_, i) => [String(i + 1), String(i * 0.5)]), { adjustable: true }),
    ],
  },
  'fresnel-biprism': {
    sourceSheet: '10 菲涅尔双棱镜',
    note: '位置读数单位为 mm，支杆位置单位为 cm。先记录原始读数，差值和波长留待数据处理。',
    parameters: [
      parameter('slitPosition', '狭缝支杆位置 / cm'),
      parameter('eyepiecePosition', '目镜支杆位置 / cm'),
      parameter('distanceCorrection', '距离修正量 / cm', '2.50'),
      parameter('intervals', '条纹间隔数', '5', { positive: true, integer: true }),
      parameter('reference', '参考波长 λ₀ / nm', '589.3', { optional: true, positive: true }),
    ],
    tables: [
      table('fringe-spacing', '5Δx 测量', positionColumns(), sequence(4), { adjustable: true, hint: '默认记录跨越 5 个条纹间隔的起止位置；改变间隔数时同步修改上方参数。' }),
      table('image-l1', 'l₁ 测量', positionColumns(), sequence(4), { adjustable: true }),
      table('image-l2', 'l₂ 测量', positionColumns(), sequence(4), { adjustable: true }),
    ],
  },
  polarization: {
    sourceSheet: '12 光的偏振',
    note: '记录真实观察，不预填现象或偏振态。波片光轴名义角与实际角分列；不适用的观察项可填写“不适用”，方向图可在报告中补画。',
    parameters: [],
    tables: [
      table('observations', '现象记录', [
        fixed('operation', '操作', 220),
        text('brightnessCycles', '明暗变化次数', { placeholder: '记录实际次数或明暗变化' }),
        text('extinction', '有无消光', { placeholder: '记录实际消光情况' }),
        text('brightAxes', '最亮轴关系'), text('extinctionAxes', '消光轴关系'), text('conclusion', '结论'),
      ], [['起偏'], ['检偏'], ['布儒斯特窗']]),
      table('quarter-wave-plate', '四分之一波片', [
        fixed('nominalAngle', '名义角 / °', 170), number('actualAngle', '实际角 / °'),
        text('brightness', '明暗变化'), text('extinction', '有无消光'),
        text('axes', '长短轴方向'), text('polarizationState', '偏振态'),
      ], [0, 15, 30, 45, 60, 75, 90].map(value => [String(value)]), { hint: '名义角为模板给定值；实际角按仪器读数填写，现象、轴方向及偏振态按观察记录。' }),
    ],
  },
  'single-slit': {
    sourceSheet: '13 单缝衍射',
    note: '先记录衍射距离、探头位置及光强，再记录各级暗纹的左侧、中心及右侧位置。扫描表默认 50 点，可按实际数据增删，最多 200 点。',
    parameters: [
      parameter('slitWidth', '单缝宽度 a / mm', '', { positive: true }),
      parameter('distanceLimit', '模板 Δz / cm', '0.05', { positive: true }),
      parameter('positionLimit', '模板 Δx_k / mm', '0.004', { positive: true }),
    ],
    tables: [
      table('distances', '衍射距离', [serial(), number('z', 'z / cm', { positive: true })], sequence(3), { adjustable: true }),
      table('intensity-scan', '光强扫描', [serial(), number('position', '探头位置 / mm'), number('intensity', '光强 / mV')], sequence(50), { adjustable: true, maxRows: 200, hint: '位置单位为 mm，探测器读数单位为 mV。数据不足可续行；少于 50 点时可删除末尾空行。' }),
      table('minima', '暗纹位置与距离', [
        fixed('number', 'k'), number('left', '左极小 / mm'), number('center', '中心 O / mm'), number('right', '右极小 / mm'),
        computed('leftDistance', '左距 / mm'), computed('rightDistance', '右距 / mm'), computed('meanDistance', '平均 x_k / mm'),
      ], sequence(5), { adjustable: true, hint: 'k 为暗纹级次；左距、右距和平均 x_k 由后续数据处理生成。' }),
    ],
  },
  'zeeman-effect': {
    sourceSheet: '15 塞曼效应',
    note: '选择与课堂要求一致的圆环记录方案。切换方案保留当前页中已填内容，检查与复制仅包含当前方案及偏振现象。',
    modes: [{ id: 'combined', label: '综合圆环' }, { id: 'pi', label: 'π 线方案' }, { id: 'sigma', label: 'σ 线方案' }],
    parameters: [
      parameter('excitationCoefficient', '励磁系数（含仪器标注单位）', '', { kind: 'text', optional: true }),
      parameter('excitationCurrent', '励磁电流（含单位）', '', { kind: 'text', placeholder: '填写数值及 A 或 mA 等实际单位' }),
      parameter('magneticField', '磁感应强度 B / T', '', { positive: true }),
      parameter('fpSpacing', 'F-P 间隔 d / m', '', { positive: true }),
      parameter('components', 'a / b 环谱线成分', '', { kind: 'text', optional: true, placeholder: '按所选方案与讲义填写' }),
    ],
    tables: [
      table('combined-rings', '学生版综合圆环记录及处理', [
        ...ringColumns(['无场 K−1 左', '无场 K−1 右', '无场 K 左', '无场 K 右', '有场 a 左', '有场 a 右', '有场 b 左', '有场 b 右']),
        computed('diameterPrevious', 'D_K−1 / mm'), computed('diameterK', 'D_K / mm'), computed('diameterA', 'D_a / mm'), computed('diameterB', 'D_b / mm'),
      ], sequence(4), { modes: ['combined'], adjustable: true }),
      table('pi-rings', 'π 线替代方案圆环位置', ringColumns(['左 k−1(6)', '左 k−1(5)', '左 k−1(4)', '左 k(5)', '右 k(5)', '右 k−1(4)', '右 k−1(5)', '右 k−1(6)']), sequence(4), { modes: ['pi'], adjustable: true }),
      table('sigma-field', 'σ 线替代方案加场位置', ringColumns(['左 k−1(7)', '左 k−1(3)', '右 k−1(3)', '右 k−1(7)']), sequence(4), { modes: ['sigma'], adjustable: true }),
      table('sigma-zero', 'σ 线方案无场位置', ringColumns(['左 k−1', '左 k', '右 k', '右 k−1']), sequence(4), { modes: ['sigma'], adjustable: true }),
      table('polarization', '偏振现象记录（选填）', [fixed('direction', '观察方向', 170), fixed('operation', '磁场 / 光学操作', 250), text('phenomenon', '现象', { optional: true }), text('analysis', '偏振与 ΔM 分析', { optional: true })],
        ['横向', '正平行', '反平行'].reduce((rows, direction) => rows.concat(['无磁场', '加磁场无偏振片', '旋转偏振片', '加 λ/4 片并旋转'].map(operation => [direction, operation])), [])),
    ],
  },
  michelson: {
    sourceSheet: '16 迈克尔孙干涉',
    note: '保留镜位置的小数位。原始模板含 6 组读数，第一组累计级次 n=0 的镜位置也须记录；现象表选填。',
    parameters: [
      parameter('zeroPosition', '调零 M₁ 位置 / mm'),
      parameter('step', '每次改变的干涉级次 h / 级', '', { positive: true, integer: true }),
      parameter('relativeCountUncertainty', 'u(N) / N / %', '0.5', { min: 0 }),
      parameter('instrumentLimit', '仪器误差限 Δ_ins / mm', '0.00004', { positive: true }),
      parameter('reference', '参考波长 λ₀ / nm', '650.0', { optional: true, positive: true }),
    ],
    tables: [
      table('positions', '等倾干涉波长测量', [serial(), number('order', '累计级次 n', { integer: true, min: 0 }), number('position', 'M₁ 位置 / mm')], Array.from({ length: 6 }, (_, i) => [String(i + 1), i === 0 ? '0' : '']), { hint: '按实际累计级次填写。模板逐差配对为 1→4、2→5、3→6；等间隔 h 时跨越级次 N=3h。' }),
      table('differences', '三组逐差', [fixed('number', '组号'), fixed('from', '起始序号', 150), fixed('to', '终止序号', 150), computed('distance', 'Δd / mm'), computed('orderDifference', '跨越级次 N')],
        Array.from({ length: 3 }, (_, i) => [String(i + 1), String(i + 1), String(i + 4)])),
      table('observations', '实验现象（选填）', [fixed('item', '项目', 280), number('position', '镜位置 / mm', { optional: true }), text('analysis', '现象与分析', { optional: true })],
        [['等倾干涉'], ['单色光等厚干涉'], ['白光中央条纹及颜色']]),
    ],
  },
}

module.exports = { definitions }
