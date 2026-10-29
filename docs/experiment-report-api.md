# 实验报告数据计算接口

更新：2026-10-28。16个实验均已接入“开始计算”及统一结果页，光的偏振使用“整理实验记录”。公式依据见[公式汇总](experiment-formulas.md)，表式依据见[报告表核对](report-table-audit.md)，数值修约及自动选点依据见[教材规则](textbook-report-rules.md)。

## 页面流程

填写实验报告要求的测量格 → 检查 → 开始计算 → 结果、原式、代入式、自动选点、报告表、作图坐标及报告要求。

结果页没有计算方法、不确定度口径或补充条件的选择控件。程序采用`textbook-profile.js`中的固定规则。装置尺寸、实际仪器误差、读数等真实测量信息在实验录入页填写，不能由程序猜成0。返回录入页后保留当前页面内存中的原始记录；关闭小程序不保证保存。PDF/Word生成、持久化及Excel导入尚未实现。

页面间通过事件通道传递原始输入，不将实验记录放进网址。重复点击、跳转失败、无效数据和重复接收事件均有保护。

## 调用

```js
const { collectInput } = require('../../utils/experiment-input')
const { calculateReport, calculateFormReport, formatReport, serializeReport } = require('../../utils/experiment-report')

// 与小程序实际调用一致：不传用户设置。
const report = calculateReport(collectInput(this.data))
// 或直接使用表单：calculateFormReport(this.data)
this.report = report

// 格式错误时先修改原始记录，不复制无效结论。
if (report.status !== 'invalid') {
  wx.setClipboardData({ data: formatReport(report) })
}
const reportJSON = serializeReport(report)
```

光谱独立页面使用`calculateReport(collectSpectralInput(this.data))`，保留四游标读数和实际现象/元素分析。

离线校验仍可通过第二参数传入明确的装置对照值或人工图解点，供复核算法使用；结果页不接收这些设置。报告接口始终采用课程不确定度及覆盖因子2，直接测量的教材单次/同值例外除外。

## 输入版本

输入为`schemaVersion: 3`、`templateVersion: '2026-10-28-report'`。旧版1/2的单缝扫描表、声速合表等须重新按报告表填写，不能静默混算。

```js
{
  schemaVersion: 3,
  templateVersion: '2026-10-28-report',
  experimentId: 'single-slit',
  mode: '',
  info: { studentClass: '', studentName: '', studentId: '' },
  parameters: { order: '3' /* k固定3；其余参数保留表格页标注单位 */ },
  tables: [{ id: 'minima', rows: [{ left: '-18.000', center: '0.000', right: '18.000' }] }]
}
```

以上仅示意结构，不是完整输入。固定次数表保留全部测次；可续录表忽略全空行，半填行不能忽略。`collectInput`只收集测量值，不回传均值、逐差、lnI、直径等计算格，也不回传杨氏F/C这类纯派生表。手工提交计算列会被拒绝。

原始读数为字符串，保留末尾零、正负号和科学计数法。计算使用解析后的另一份数值，不改写`rawInput`。拒绝NaN、Infinity、循环引用、非JSON对象、未知实验及重复表ID；空值不等同于0。

## 固定处理规则

| 实验 | 小程序默认处理 |
| --- | --- |
| 杨氏模量 | 教材光杠杆模型，使用实测D、b；5组逐差及不确定度 |
| 开尔文电桥 | 按R₁/R₃换算实际电阻，定长电阻率及变长度图解 |
| 数字积分冲击电流计 | 按实际电量的正反号区分带符号半差和幅值均值；比较法电容、正反向lnQ–t高阻 |
| 导热系数 | 稳态温度附近3点作局部近似切线；不同通道采用同一线性温标 |
| RLC | L/C元件电压峰模型；在实际测量范围内找UR、UL、UC极值，标出原表行号 |
| 扭摆 | 测杆时卸托盘，天平参考值为单滑块质量；累计时间先换单周期 |
| 霍尔效应 | 教材载流子修正模型；纵向电压、电流、接点距离和宽度来自实测输入 |
| 声速 | 驻波间隔λ/2；行波和李萨茹同相位置间隔λ；仅驻波评定不确定度 |
| 应变式传感器 | 单臂/全桥循环表、非线性表，灵敏度、迟滞、重复性及非线性 |
| 菲涅尔双棱镜 | 三张报告差值表；l=√(l₁l₂)，传播至λ |
| 光谱定性分析 | 四游标→θ→λ；传播角度使用rad |
| 光的偏振 | 整理实际现象，无数值回归或人为编造计算 |
| 单缝衍射 | 报告表1、表3，固定第3级，λ=a·x̄ₖ/(3z̄)，不要求录入无需誊录的扫描表2 |
| PN结 | lnI–U与U–t；温度线性外推计算禁带宽度 |
| 塞曼效应 | 当前记录方案的环位置→直径及平均→波数差和荷质比；成分编号来自实际实验 |
| 迈克尔孙 | 三组跨3间隔逐差，N=3h；参考650.0nm沿用教师记录单 |

图解点由程序生成。趋势线由全体实测点辅助拟合，再取相距较远的非测量点P₁/P₂求斜率、P₃求截距；这项自动化是程序实现方式，不能声称教材要求用回归替代手绘。具体规则和数据来源随结果显示。图解值和回归值可能相同，不构成两次独立验证。导热使用稳态附近局部斜率，不用整段冷却曲线回归替代切线。

RLC使用范围内的实测极大值；最大值在扫描边缘时提示扩展测量，不能保证已经测到真实共振峰。原表arcsin只给主值大小，超前/滞后仍结合实际接线分析。

## 输出结构

| 字段 | 含义 |
| --- | --- |
| `reportSchemaVersion` / `formulaVersion` | 当前为2 / 2026-10-28-report |
| `experiment` / `info` / `rawInput` | 实验信息及不改写的输入快照 |
| `reportTables` | 原报告表编号、标题、列、横向/分组版式、行、平均栏；作为报告表格的权威输出 |
| `rawTableSchemas` | 当前方案的表式、固定格定义 |
| `processingOptions` / `assumptions` | 实际采用的固定方法和量具信息，不是用户选择界面 |
| `results` | 原始数值、单位、公式、代入值、统计、参考值、百分差、不确定度及修约表达式 |
| `tables` | 辅助计算明细，不替代原报告表 |
| `charts` | 实测点、回归/趋势线及自动选点坐标、轴和单位；非图像文件 |
| `steps` | 运算过程，自动图解的fit包含selectedPoints、selectionRule；冷却另含sourceRows |
| `observations` / `referenceMaterial` | 本人观察与原表预印内容，分别保存 |
| `issues` / `missingInputs` | 错误路径、原因及待补的实际测量量 |
| `requirements` / `tasks` | 对应实验的处理、提交要求及尚需完成的步骤/分析/手绘内容 |
| `kind` | quantitative或observation |
| `status` / `reportReady` | complete / partial / invalid及计算数据是否齐备 |
| `reportFinished` | 恒为false；数据齐备不等于实验报告已完成 |

`complete`表示本模块所需数据齐备；`partial`保留可计算的独立分支并提示缺测量或仪器项；`invalid`存在版本、格式、顺序、物理域或数值越界等错误，禁用复制。

`results[].value`、表格数字及JSON保留完整计算精度；`results[].formatted.expression`才是修约后的展示表达式。有完整不确定度时统一取2位有效数字，结果末位对齐。相对不确定度取2位有效数字；其余中间显示值通常最多4位有效数字。这不代表教材规定所有实验的最终结果统一4位有效数字或统一小数位。

结果展示单位由`report-units.js`按实验表式固定选择：例如单缝的衍射距离cm、暗纹距离mm、波长nm，RLC频率kHz。`value`及`unit`仍是计算层的原值/原单位；`formatted.unit`是展示单位，`formatted.scale`是原值到展示值的倍率，`formatted.sourceUnit`保留原单位。结果、参考值和不确定度同时换算，百分差和相对不确定度不变。导出显示表达式时使用`formatted`，不能把展示值搭配原单位。

结果页每个物理量独立成卡片，默认显示结果与比较指标。展开后由`uncertainty-presentation.js`提供适用规则、原式、数值代入及结果，各步骤统一左对齐，结果另起一行；数值式的单位独立附在完整式之后，不进入分母或根号。重复测量依次显示样本标准差、A类、B类、合成及扩展不确定度。单次/同值情况明确说明教材P21的判断依据，报告u_B≈Δ_ins，不额外乘2；一般重复测量公式另标“本组未采用”，避免误套。

间接量逐项列出本实验的具体敏感系数、转换单位后的数值乘积及贡献cᵢ，再列平方和、开方和扩展结果；缺失输入项不当作0。相对不确定度也有原式与数值代入，单次规则使用本组报告的u_B。折叠只影响视图，复制包含与页面一致的完整步骤和规则说明。

参数标签、表头、结果表、坐标和公式叶节点共用`scientific-text`，用真正的上下标显示I_F、R_H、xₖ、m^-3、R²等；不是把大写下标字母换成错误的小写Unicode近似字符。科学计数法输入在失焦时显示“×10ⁿ”，聚焦编辑时使用原始字符串，input/blur继续回传原值。`collectInput`及JSON仍保存1.3800e-23等原始形式，不受显示转换影响。

## 示例及验证

示例均为人工校验数据，非学生实测：

- 杨氏光杠杆：[输入](examples/young-optical-input.json)、[结构化输出](examples/young-optical-report.json)、[文本](examples/young-optical-report.txt)。
- 单缝报告表1/3：[输入](examples/single-slit-input.json)、[结构化输出](examples/single-slit-report.json)、[文本](examples/single-slit-report.txt)。

示例复算使用`calculateReport(example.input)`。`tests/report-fixtures.js`提供16个实验的独立手算校验输入；其中options仅用于测试内部装置对照分支，不能作为小程序页面配置。

100项自动测试覆盖测量映射、计算列保护、流程、单位、物理计算、传播、报告表、教材修约、公式结构、自动选点、科学数值编辑及结果卡片。新增同值、单次、有散布、缺项、间接传播、极小量和单位不进入分母的检查。微信内置编译器检查6套WXML/WXSS及34种结果页展开/折叠状态，无模板运行警告。开发者工具中已用非实测数据逐步检查同值读数、有散布读数和波长传播的公式、代入、结果及cm/mm/nm；此前已检查PN下标、负指数和编辑切换。尚未完成手机真机验证。
