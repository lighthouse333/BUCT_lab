// 以要求文件的“实验报告”数据整理/数据处理表为最终版式。
// 没有另印处理表的实验，按报告“实验数据列表”复列测量表，保留必要测量输入。
function applyReportTemplates(definitions, h) {
  const { number, fixed, computed, text, parameter, serial, sequence, table, horizontal, vertical } = h
  const basis = {
    'young-modulus': ['杨氏模量要求图，第2–3页', '报告表3增加平均读数，表4列出五组Fᵢ/Cᵢ；直径测量是模量与不确定度所需的补充测量。'],
    'kelvin-bridge': ['开尔文电桥要求图，第2页', '报告表4在正反向读数后增加换向均值；直径及变长度测量按报告列表要求保留。'],
    'ballistic-galvanometer': ['积分冲击电流计要求图，第1–2页', '按报告实验数据列表复列两张电容表、正反向高阻表，均值及lnQ由程序计算。'],
    'thermal-conductivity': ['不良导体导热要求图，第2页', '报告要求实验数据列表，未另印新网格，复列升温与冷却测量表。'],
    rlc: ['RLC要求图，第2页', '报告二、数据整理中的幅频、相频、另一电阻幅频三表。'],
    'torsion-pendulum': ['扭摆要求图，第2页', '报告要求实验数据记录列表，复列直径、累计周期及滑块位置表，平均值自动计算。'],
    'hall-effect': ['霍尔要求图，第3页', '报告要求实验数据列表，复列工作电流、励磁电流与轴向位置表。'],
    'sound-speed': ['声速要求图，第2页', '报告表2的l与ΔL逐差版式；三种方法分别处理，仅驻波要求不确定度。'],
    'strain-sensor': ['下载.pdf，第3–7页', '数据处理模板的循环测量/校准平均值表，以及非线性误差数据整理表；示例数值不作为实测值。'],
    'fresnel-biprism': ['下载.pdf，第9、19页', '报告中的5Δx、l₁、l₂表，起始、终止、差值三列。'],
    'spectral-analysis': ['下载.pdf，第11–12页', '报告表1的四游标读数和表2的θ处理表，独立光谱页沿用此版式。'],
    polarization: ['下载.pdf，第15页', '报告只要求手工整理现象，没有另印数值处理表；保留原现象表与波片表。'],
    'single-slit': ['下载.pdf，第17–18页；用户确认固定第3级（2026-10-28）', '报告表1衍射距离、表3的暗纹位置与距离；按实验要求固定k=3。表2光强扫描无需誊录，不作为本页必填表。'],
    'pn-junction': ['PN结正向压降与温度关系的研究和应用.pdf，第2页', '报告恒温表含ln[I_F/μA]，恒流温度表保留。'],
    'zeeman-effect': ['塞曼效应记录（学生版）.pdf，第2–3页；数据处理版第3–4页', '学生版综合表按四个圆环分组列出左右位置、直径与平均值；现象表增加分析及结论。π/σ方案按处理版保留。'],
    michelson: ['用户提供的迈克尔孙记录图', '目前附件只有记录图，没有独立的实验报告处理网格；保留其中六点位置、三组逐差与现象栏，并明确此来源边界。'],
  }
  Object.keys(definitions).forEach(id => {
    const def = definitions[id]
    def.source = basis[id][0]
    def.reportBasis = basis[id][1]
  })
  const young = definitions['young-modulus']
  young.note = '按实验报告表3、表4填写和处理。只录入测量值，平均值和逐差由程序生成；原长使用cm。'
  young.tables[0].title = '钢丝伸长量的实验测量数据'
  young.tables[0].columns.push(computed('mean', 'n̄ᵢ/mm'))
  young.tables[0].layout.fields.push('mean')
  young.tables[0].sourceNumber = '3'
  young.tables[1].sourceNumber = '2'
  young.tables[1].hint = '补充测量：报告要求计算直径及其不确定度，需保留这5次读数。'
  young.tables.push(table('force-extension', '钢丝伸长量的数据处理表格', [serial(), computed('force', 'Fᵢ/N'), computed('extension', 'Cᵢ/mm')], sequence(10), {
    sourceNumber: '4', layout: horizontal(['force', 'extension']),
    hint: '按1→6、2→7、3→8、4→9、5→10组成五组逐差；原件十列保留，后五列不参与逐差平均。',
  }))
  const kelvin = definitions['kelvin-bridge']
  kelvin.tables[1].title = '电阻R_N的数据处理表格'
  kelvin.tables[1].sourceNumber = '4'
  kelvin.tables[1].columns.push(computed('mean', 'R无/Ω'))
  kelvin.tables[1].layout.fields.push('mean')
  kelvin.tables[1].layout.averageKeys = ['mean']
  kelvin.tables[1].layout.averageDashes = true
  kelvin.note = '按报告表4保留正向、反向与R无换向均值；R无=(R正向+R反向)/2，由程序计算。'
  const sound = definitions['sound-speed']
  sound.note = '使用报告表2的l与ΔL逐差表。三种方法分别填写10个位置，五组逐差自动生成；示例频率、温度不代入实测。'
  sound.tables = [['standing', '用驻波法测量声速数据'], ['traveling', '行波法声速数据'], ['lissajous', '李萨茹图形法声速数据']].map(([id, title], i) => table('positions-' + id, title,
    [serial(), number('position', 'l/mm'), computed('difference', 'ΔL=|lᵢ₊₅−lᵢ|/mm')], sequence(10),
    { ...(i === 0 ? { sourceNumber: '2' } : { unnumbered: true }), layout: horizontal(['position', 'difference']), hint: '前五格为1→6至5→10的逐差，后五格不重复计算。' }))
  const strain = definitions['strain-sensor']
  strain.note = '按报告数据处理模板保留三个循环、滞后和校准平均值，并增加非线性误差整理表。所有示例数值均不预填。'
  const nonlinearity = strain.tables.map((t, i) => table(t.id + '-nonlinearity', i ? '全桥非线性误差数据整理表' : '单臂非线性误差数据整理表',
    [computed('x', '位移/mm'), computed('mean', '校准平均值'), computed('fitted', '拟合值'), computed('residual', 'ΔV/V')], sequence(17).map(() => []),
    { unnumbered: true, layout: horizontal(['mean', 'fitted', 'residual'], { headerKey: 'x', groupLabel: '输出电压 V/V' }), hint: '位移取自对应循环表；均值、拟合值与ΔV自动计算。' }))
  strain.tables = [strain.tables[0], nonlinearity[0], strain.tables[1], nonlinearity[1]]
  const single = definitions['single-slit']
  single.note = '使用报告表1、表3，暗条纹级次固定k=3。结合原始光强分布图，填入左侧第3级暗纹、中央及右侧第3级暗纹位置，程序计算距离和波长。'
  single.parameters.splice(1, 0, parameter('order', '表3暗条纹级次 k（固定第3级）', '3', { positive: true, integer: true, readOnly: true, fixedValue: '3' }))
  single.tables = [single.tables[0], table('minima', '单缝衍射k级暗条纹间距的测量数据', [
    number('left', '主极大左侧k级极小位置 k左/mm'), number('center', '主极大的中心位置 O/mm'), number('right', '主极大右侧k级极小位置 k右/mm'),
    computed('distanceLeft', '左侧极小与中央的距离 xₖ左/mm'), computed('distanceRight', '右侧极小与中央的距离 xₖ右/mm'), computed('meanDistance', 'k级极小与中央的平均距离 x̄ₖ/mm'),
  ], [[]], { sourceNumber: '3', layout: vertical(), hint: '本实验固定k=3，左右均取第3级暗纹。表3三项位置从已有光强分布图读取；表2扫描数据无需誊录。' })]
  const pn = definitions['pn-junction']
  pn.note = '使用实验报告的数据整理表：恒温伏安表含ln[I_F/μA]，恒流温度表按实测记录。对数由程序计算，电流必须为正。'
  pn.tables[0].columns.push(computed('logCurrent', 'ln[I_F/μA]'))
  pn.tables[0].layout.fields.push('logCurrent')
  const zeeman = definitions['zeeman-effect']
  zeeman.note = '选择课堂要求的报告方案；π、σ只测其一。综合版保留位置、直径和平均栏；实际现象填写在报告页空白栏，分析及结论仍须手写。'
  const combined = zeeman.tables.find(t => t.id === 'combined-rings')
  const labels = ['K−1级', 'K级', 'a环', 'b环']
  combined.title = '《塞曼效应》实验数据记录及处理结果表'
  combined.columns = [serial(), ...labels.reduce((all, label, i) => all.concat(number('position' + (i * 2 + 1), label + '左侧'), number('position' + (i * 2 + 2), label + '右侧'), computed('diameter' + i, label + '直径')), [])]
  combined.layout = vertical({ groups: [{ label: '无磁场', span: 6 }, { label: '有磁场', span: 6 }], averageKeys: ['diameter0', 'diameter1', 'diameter2', 'diameter3'], averageDashes: true })
  combined.hint = '单位：mm。按报告将每个圆环的左右位置、直径并列；平均行只对直径求平均，位置栏保留横线。'
  const phenomena = zeeman.tables.find(t => t.id === 'polarization')
  phenomena.title = '《塞曼效应》实验现象记录及结论分析表'
  phenomena.columns.push(text('analysis', '分析及结论（偏振性质以及ΔM与之的对应关系）', { optional: true, width: 650 }))
  phenomena.fixedCells = { '0:3': '——', '6:3': '——' }
  phenomena.hint = '使用报告页空白现象栏，实际观察需填写；分析及结论仍须按要求手写，程序不代填。'
  // 迈克尔孙原件前三格是横线，只有后三格为逐差结果。
  definitions.michelson.tables[0].fixedCells = { '0:3': '—', '1:3': '—', '2:3': '—' }

  // 教材固定方法需要的真实尺寸、量具误差仍属于测量输入，不能由程序编造。
  young.parameters.find(p => p.key === 'diameterLimit').value = '0.004'
  young.parameters.find(p => p.key === 'diameterLimit').optional = false
  young.parameters.push(parameter('leverDistanceM', '平面镜到标尺距离 D/m', '', { positive: true }), parameter('leverArmM', '光杠杆常数 b/m', '', { positive: true }),
    parameter('extensionLimitMm', '标尺逐差位移的仪器误差限 ΔC/mm', '', { positive: true }),
    parameter('leverDistanceLimitM', '镜尺距离仪器误差限 ΔD/m', '', { positive: true }), parameter('leverArmLimitM', '光杠杆常数仪器误差限 Δb/m', '', { positive: true }))
  young.note += ' 教材P71–72使用光杠杆，需实测D和b；误差限按实际量具填写。'
  kelvin.parameters.push(parameter('diameterLimitMm', '千分尺仪器误差限 Δd/mm', '0.004', { positive: true }), parameter('resistanceLimitOhm', '电阻箱换向均值的仪器误差限 ΔR/Ω', '', { positive: true }))
  definitions['torsion-pendulum'].parameters.push(parameter('massLimitKg', '塑料圆柱质量的天平误差限 ΔM/kg', '', { positive: true }))
  const soundDivision = sound.parameters.find(p => p.key === 'division')
  soundDivision.label = '驻波逐差量ΔL的仪器误差限/mm'; soundDivision.optional = false
  sound.note += ' 李萨如法按教材同向直线重复记录，频率作为信号发生器给定值。'
  for (const [key, label] of [['longitudinalVoltageMv', '换向处理后的纵向电压 U₀/mV'], ['longitudinalCurrentMa', '纵向测量工作电流 I_S/mA'], ['voltageContactDistanceMm', '纵向电压触点距离 ℓ/mm'], ['sampleWidthMm', '霍尔片宽度 w/mm']]) definitions['hall-effect'].parameters.push(parameter(key, label, '', { positive: true }))
  for (const [key, label] of [['distanceLimitCm', '虚光源到目镜距离的仪器误差限 Δd/cm'], ['fringeSpanLimitMm', '跨5间隔总位移的仪器误差限/mm'], ['image1LimitMm', '放大像间距的仪器误差限/mm'], ['image2LimitMm', '缩小像间距的仪器误差限/mm']]) definitions['fresnel-biprism'].parameters.push(parameter(key, label, '', { positive: true }))
  zeeman.parameters = zeeman.parameters.filter(p => !['excitationCoefficient', 'excitationCurrent', 'components'].includes(p.key)).concat(
    parameter('excitationCoefficientTA', '励磁系数 K_M/(T/A)，已填B时选填', '', { positive: true, optional: true }),
    parameter('excitationCurrentA', '励磁电流 I_M/A，已填B时选填', '', { positive: true, optional: true }),
    parameter('componentA', 'a环所属成分编号（1～9）', '', { integer: true, positive: true, modes: ['combined'] }),
    parameter('componentB', 'b环所属成分编号（1～9）', '', { integer: true, positive: true, modes: ['combined'] }))
  zeeman.note += ' 圆环位置统一用mm；按原实验实际成分编号填写，程序不猜测a、b的归属。'
}

module.exports = { applyReportTemplates }
