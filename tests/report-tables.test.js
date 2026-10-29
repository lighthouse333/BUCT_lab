const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, spectralFixture } = require('./report-fixtures')
const { createForm, collectInput } = require('../utils/experiment-input')
const { calculateReport, supportedExperiments, formatReport } = require('../utils/experiment-report')
const { reportTables, refreshFormTables, gridView } = require('../utils/report-tables')
const { textbookOptions } = require('../utils/textbook-profile')
const table = (report, id) => { const t = report.reportTables.find(t => t.id === id); assert.ok(t, id); return t }
const near = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 1e-10), a + ' != ' + b)

test('所有16项均有报告处理表，JSON保持原始字符串且表格中的计算值只读', () => {
  for (const id of supportedExperiments) {
    const f = id === 'spectral-analysis' ? spectralFixture() : fixture(id)
    const before = JSON.stringify(f)
    const report = calculateReport(f.input, f.options)
    assert.equal(report.inputSchemaVersion, 3)
    assert.equal(report.reportSchemaVersion, 2)
    assert.ok(report.reportTables.length, id)
    assert.equal(JSON.stringify(f), before)
    for (const t of report.reportTables) {
      const grid = gridView(t, 0, false)
      assert.ok(grid.width > 0 && grid.height > 0)
      assert.ok(!grid.displayCells.some(c => c.field))
      assert.equal(grid.displayCells.filter(c => c.style.includes('NaN')).length, 0)
    }
    assert.deepEqual(JSON.parse(JSON.stringify(report)), report)
  }
})

test('单缝表1与表3保留原编号、六列，k固定为3，不要求扫描表或重复输入位置', () => {
  const form = createForm('single-slit')
  assert.deepEqual(form.tables.map(t => [t.id, t.sourceNumber]), [['distances', '1'], ['minima', '3']])
  assert.deepEqual(form.tables[1].columns.map(c => c.key), ['left', 'center', 'right', 'distanceLeft', 'distanceRight', 'meanDistance'])
  assert.deepEqual(form.tables[1].columns.map(c => c.kind), ['number', 'number', 'number', 'computed', 'computed', 'computed'])
  assert.equal(form.tables[1].rows.length, 1)
  assert.ok(form.parameters.some(p => p.key === 'order' && p.integer && p.readOnly && p.value === '3'))
  assert.match(form.tables[1].columns[3].label, /xₖ/)
  assert.match(form.tables[1].columns[5].label, /x̄ₖ/)
  assert.ok(!form.tables[1].columns.some(c => c.label.includes('_k')))
  assert.equal(textbookOptions(collectInput(form)).selectedMinima, undefined)
  assert.ok(!form.tables.some(t => t.id === 'intensity-scan'))
})

test('单缝第3级按表3得到18、18、18mm及600nm；改变中央定位不改变两侧平均', () => {
  const f = fixture('single-slit')
  const r = f.input.tables.find(t => t.id === 'minima').rows[0]
  r.left = '10.000'; r.center = '28.000'; r.right = '46.000'
  const report = calculateReport(f.input, f.options)
  assert.equal(report.status, 'complete')
  assert.equal(table(report, 'distances').averages.z, 100)
  assert.deepEqual(Object.values(table(report, 'minima').rows[0]).slice(3), [18, 18, 18])
  near(report.results.find(r => r.id === 'wavelength').value, 600)
  r.center = '29.000'
  const shifted = calculateReport(f.input, f.options)
  assert.deepEqual(Object.values(table(shifted, 'minima').rows[0]).slice(3), [19, 17, 18])
  near(shifted.results.find(r => r.id === 'wavelength').value, 600)
  assert.equal(shifted.charts.length, 0)
  assert.ok(shifted.tasks.some(t => t.label.includes('光强分布图')))
})

test('单缝固定k=3，不凭假想扫描范围拒绝读数；其他级次及非法次序会报错', () => {
  const f = fixture('single-slit')
  f.input.parameters.order = '3'
  const r = f.input.tables.find(t => t.id === 'minima').rows[0]
  r.left = '-18'; r.center = '0'; r.right = '18'
  near(calculateReport(f.input).results.find(r => r.id === 'wavelength').value, 600)
  for (const order of ['1', '2', '4']) {
    f.input.parameters.order = order
    const wrong = calculateReport(f.input)
    assert.equal(wrong.status, 'invalid')
    assert.ok(wrong.issues.some(i => i.code === 'FIXED_DIFFRACTION_ORDER'))
    assert.ok(!wrong.results.some(r => r.id === 'wavelength'))
  }
  f.input.parameters.order = '3'
  r.center = '18'
  const bad = calculateReport(f.input)
  assert.equal(bad.status, 'invalid')
  assert.equal(table(bad, 'minima').rows[0].meanDistance, null)
  f.input.parameters.order = '1.5'
  assert.equal(calculateReport(f.input).status, 'invalid')
})

test('计算格即时生成、清空后撤销旧值，手填原始字符串不会被格式化覆盖', () => {
  const f = fixture('single-slit'), form = f.form
  const before = JSON.stringify(form)
  const updated = refreshFormTables(form)
  assert.equal(JSON.stringify(form), before)
  assert.equal(updated[1].rows[0].cells[5].value, '18.00')
  assert.ok(updated[0].displayCells.some(c => c.computed && c.content === '100.0'))
  updated[1].rows[0].cells[2].value = ''
  const cleared = refreshFormTables({ ...form, tables: updated })
  assert.equal(cleared[1].rows[0].cells[5].value, '')
  assert.equal(cleared[1].rows[0].cells[0].value, '-18')
})

test('杨氏报告表3平均值与表4五组逐差齐全，后五格不重复统计', () => {
  const f = fixture('young-modulus'), report = calculateReport(f.input, f.options)
  assert.ok(!f.input.tables.some(t => t.id === 'force-extension'))
  assert.equal(table(report, 'loading').sourceNumber, '3')
  assert.equal(table(report, 'force-extension').sourceNumber, '4')
  near(table(report, 'loading').rows[1].mean, .2)
  const pairs = table(report, 'force-extension').rows
  assert.deepEqual(pairs.slice(0, 5).map(r => [r.force, r.extension]), Array(5).fill([5, 1]))
  assert.deepEqual(pairs.slice(5).map(r => r.extension), Array(5).fill('—'))
  assert.equal(report.results.find(r => r.id === 'extension').statistics.n, 5)
})

test('开尔文表4均值由正反向读数求出，平均栏只汇总R无，不把RN当Rx', () => {
  const f = fixture('kelvin-bridge')
  f.input.tables.find(t => t.id === 'fixed-resistance').rows[0].reverse = '3.000'
  const report = calculateReport(f.input, f.options), t = table(report, 'fixed-resistance')
  assert.equal(t.sourceNumber, '4')
  assert.equal(t.rows[0].mean, 2)
  near(t.averages.mean, 1.2)
  assert.equal(t.averages.forward, undefined)
  near(report.results.find(r => r.id === 'resistivity').value, .1 * 1.2 * Math.PI * .002 ** 2 / (4 * .4))
})

test('声速报告三种方法各有l与ΔL行，驻波21.25mm、行波42.5mm逐差均得340m/s', () => {
  const f = fixture('sound-speed'), report = calculateReport(f.input, f.options)
  assert.deepEqual(report.reportTables.map(t => t.id), ['positions-standing', 'positions-traveling', 'positions-lissajous'])
  for (const [id, expected] of [['standing', 21.25], ['traveling', 42.5], ['lissajous', 42.5]]) {
    assert.deepEqual(table(report, 'positions-' + id).rows.slice(0, 5).map(r => r.difference), Array(5).fill(expected))
    near(report.results.find(r => r.id === id + 'Speed').value, 340)
  }
})

test('PN报告lnI列使用μA对数基准；无效电流不生成NaN或伪零', () => {
  const f = fixture('pn-junction')
  f.input.tables[0].rows[0].current = '1000.000'
  near(table(calculateReport(f.input, f.options), 'constant-temperature').rows[0].logCurrent, Math.log(1000))
  f.input.tables[0].rows[0].current = '0'
  const bad = calculateReport(f.input, f.options)
  assert.equal(bad.status, 'invalid')
  assert.equal(table(bad, 'constant-temperature').rows[0].logCurrent, null)
})

test('应变报告含两套循环表及非线性整理表；滞后、均值、拟合及残差与计算层一致', () => {
  const f = fixture('strain-sensor'), report = calculateReport(f.input)
  assert.equal(report.reportTables.length, 4)
  for (const arm of ['single-arm', 'full-bridge']) {
    const raw = table(report, arm).rows[0]
    near(raw.hysteresis1, Number(raw.forward1) - Number(raw.reverse1))
    near(raw.mean, [raw.forward1, raw.reverse1, raw.forward2, raw.reverse2, raw.forward3, raw.reverse3].reduce((s, v) => s + Number(v), 0) / 6)
    const processed = table(report, arm + '-nonlinearity').rows[0]
    near(processed.residual, processed.mean - processed.fitted)
    near(processed.fitted, report.tables.find(t => t.id === arm + '-processed').rows[0].fitted)
  }
})

test('塞曼学生版每环位置后紧跟直径，平均行只算直径，实际现象与分析均保留', () => {
  const f = fixture('zeeman-effect')
  f.input.tables.find(t => t.id === 'polarization').rows[2].analysis = '根据本人实测分析偏振方向'
  const report = calculateReport(f.input, f.options), rings = table(report, 'combined-rings')
  assert.deepEqual(rings.columns.map(c => c.key), ['number', 'position1', 'position2', 'diameter0', 'position3', 'position4', 'diameter1', 'position5', 'position6', 'diameter2', 'position7', 'position8', 'diameter3'])
  assert.equal(rings.rows[0].diameter0, 10)
  assert.equal(rings.rows[0].diameter1, 8)
  assert.deepEqual(Object.keys(rings.averages), ['diameter0', 'diameter1', 'diameter2', 'diameter3'])
  assert.equal(table(report, 'polarization').rows[2].analysis, '根据本人实测分析偏振方向')
  assert.ok(table(report, 'polarization').rows[0].phenomenon.includes('测试用'))
})

test('扭摆平均栏保持累计时间，不把10T或5T提前当单周期；迈克尔孙只填后三格', () => {
  const torsion = fixture('torsion-pendulum'), t = calculateReport(torsion.input, torsion.options)
  assert.equal(table(t, 'period-timing').averages.tenT0, 10)
  assert.equal(t.results.find(r => r.id === 'T0').value, 1)
  near(table(t, 'slider-timing').averages['0'], 5 * Math.sqrt(2))
  const mic = fixture('michelson'), m = calculateReport(mic.input, mic.options)
  assert.deepEqual(table(m, 'positions').rows.map(r => r.difference), ['—', '—', '—', .04875, .04875, .04875])
})

test('电量约定未确认不猜均值；确认后生成换向均值与lnQ', () => {
  const f = fixture('ballistic-galvanometer')
  const missing = reportTables(f.input)
  assert.equal(missing.find(t => t.id === 'capacitance-1').rows[0].standardMean, null)
  const complete = calculateReport(f.input, f.options)
  const r = table(complete, 'capacitance-1').rows[0]
  near(r.standardMean, (Math.abs(Number(r.standardForward)) + Math.abs(Number(r.standardReverse))) / 2)
  const q = table(complete, 'discharge-forward').rows[0]
  near(q.logCharge, Math.log(Math.abs(Number(q.charge))))
})

test('光谱统一结果页也使用报告两张表，平均θ仍为30°而计算传播用rad', () => {
  const f = spectralFixture(), report = calculateReport(f.input)
  assert.deepEqual(report.reportTables.map(t => t.sourceNumber), ['1', '2'])
  assert.equal(table(report, 'spectral-theta').rows[0].theta, 30)
  assert.equal(table(report, 'spectral-theta').averages.theta, 30)
  near(report.results.find(r => r.id === 'meanAngle').value, Math.PI / 6)
  assert.match(formatReport(report), /θ数据处理记录表/)
})

test('输入版本更新并拒绝把计算列当实测；极端和空数据清除派生格', () => {
  const f = fixture('young-modulus')
  assert.equal(calculateReport({ ...f.input, schemaVersion: 2 }, f.options).status, 'invalid')
  f.input.tables[0].rows[0].mean = '999'
  const report = calculateReport(f.input, f.options)
  assert.ok(report.issues.some(i => i.code === 'COMPUTED_INPUT'))
  assert.equal(report.results.length, 0)
  const p = fixture('single-slit')
  p.input.tables.find(t => t.id === 'minima').rows[0].left = '-1e308'
  p.input.tables.find(t => t.id === 'minima').rows[0].right = '1e308'
  assert.equal(reportTables(p.input).find(t => t.id === 'minima').rows[0].meanDistance, null)
})
