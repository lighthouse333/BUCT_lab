// 名称、编号沿用实验目录；表格数按当前报告处理表统计，塞曼为各方案最大表数。
// 分类和搜索别名用于首页检索；后续实验页面可使用稳定的 id 对接。
const categories = ['全部', '力学', '热学', '电磁学', '光学']

const experiments = [
  { id: 'young-modulus', number: '01', name: '拉伸法测量金属丝的杨氏模量', category: '力学', tableCount: 3, keywords: '拉伸 金属丝 杨氏模量' },
  { id: 'kelvin-bridge', number: '02', name: '用开尔文电桥测量低电阻', category: '电磁学', tableCount: 3, keywords: '开尔文 电桥 低电阻' },
  { id: 'ballistic-galvanometer', number: '03', name: '用数字积分冲击电流计测量电容与电阻', category: '电磁学', tableCount: 4, keywords: '积分 冲击 电流计 电容 电阻' },
  { id: 'thermal-conductivity', number: '04', name: '不良导体导热系数的测定', category: '热学', tableCount: 2, keywords: '导热 不良导体 热传导' },
  { id: 'rlc', number: '05', name: 'RLC电路特性研究', category: '电磁学', tableCount: 3, keywords: 'RLC 电路 谐振' },
  { id: 'torsion-pendulum', number: '06', name: '用扭摆法测量物体的转动惯量', category: '力学', tableCount: 3, keywords: '扭摆 转动惯量' },
  { id: 'hall-effect', number: '07', name: '霍尔效应及其应用', category: '电磁学', tableCount: 3, keywords: '霍尔 磁场' },
  { id: 'sound-speed', number: '08', name: '声速测量', category: '力学', tableCount: 3, keywords: '声速 声波' },
  { id: 'strain-sensor', number: '09', name: '应变式传感器的静态特性研究', category: '电磁学', tableCount: 4, keywords: '应变 传感器 静态' },
  { id: 'fresnel-biprism', number: '10', name: '菲涅尔双棱镜测波长', category: '光学', tableCount: 3, keywords: '菲涅尔 双棱镜 干涉 波长' },
  { id: 'spectral-analysis', number: '11', name: '光谱定性分析', category: '光学', tableCount: 2, keywords: '光谱 定性' },
  { id: 'polarization', number: '12', name: '光的偏振', category: '光学', tableCount: 1, keywords: '偏振 偏振光' },
  { id: 'single-slit', number: '13', name: '单缝夫琅禾费衍射', category: '光学', tableCount: 2, keywords: '单缝 夫琅禾费 衍射' },
  { id: 'pn-junction', number: '14', name: 'PN结正向压降与温度关系的研究和应用', category: '电磁学', tableCount: 2, keywords: 'PN结 pn 二极管 正向压降 温度' },
  { id: 'zeeman-effect', number: '15', name: '塞曼效应', category: '光学', tableCount: 3, keywords: '塞曼 光谱 磁场' },
  { id: 'michelson', number: '16', name: '用迈克尔孙干涉仪测单色光波长', category: '光学', tableCount: 2, keywords: '迈克尔孙 迈克尔逊 干涉 单色光 波长 Michelson' },
]

module.exports = { experiments, categories }
