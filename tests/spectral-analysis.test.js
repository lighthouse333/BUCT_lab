const assert = require('node:assert/strict')
const test = require('node:test')
const { parseAngle, separation, calculateGroup, statistics, wavelength } = require('../utils/spectral-analysis')
const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)

test('角度输入明确区分十进制度与度分；拒绝无效分和越界角', () => {
  near(parseAngle('12:30'), 12.5)
  near(parseAngle('12°30′'), 12.5)
  near(parseAngle('12.30'), 12.3)
  near(parseAngle('0'), 0)
  for (const value of ['', '12:60', '-1', '360', 'NaN', '1e2', '12abc']) assert.throws(() => parseAngle(value))
})

test('跨零读数、左右游标消偏和半角：359°与19°相差20°，最终10°', () => {
  near(separation(359, 19), 20)
  const result = calculateGroup({ minusLeft: '359', minusRight: '179', plusLeft: '19', plusRight: '199' })
  assert.equal(result.state, 'valid')
  near(result.left, 20); near(result.right, 20); near(result.corrected, 20); near(result.theta, 10)
  assert.equal(result.warning, '')
})

test('空值不作为零；半填和无效组有明确状态', () => {
  assert.equal(calculateGroup({}).state, 'empty')
  assert.equal(calculateGroup({ minusLeft: '0' }).state, 'incomplete')
  assert.equal(calculateGroup({ minusLeft: '0', minusRight: '180', plusLeft: '0', plusRight: '180' }).state, 'invalid')
})

test('独立手算样本10,11,12：样本方差为1而不是2/3，n=3查表1.32', () => {
  const result = statistics([10, 11, 12])
  near(result.mean, 11); near(result.variance, 1); near(result.sd, 1)
  near(result.sem, 1 / Math.sqrt(3)); near(result.ua, 1.32 / Math.sqrt(3))
  assert.equal(result.tp, 1.32)
})

test('单次不伪造方差；表中没有n=11，不自行插值；一致数据方差为0', () => {
  assert.equal(statistics([1]).variance, null)
  assert.equal(statistics(Array(11).fill(1)).tp, null)
  assert.equal(statistics([1, 1, 1]).ua, 0)
})

test('一级光栅：1000条/mm、30°对应500nm', () => {
  near(wavelength(30, 1000), 500)
  assert.throws(() => wavelength(30, 0))
})

function pageHarness() {
  let definition
  global.Page = page => { definition = page }
  delete require.cache[require.resolve('../pages/spectral-analysis/index')]
  require('../pages/spectral-analysis/index')
  delete global.Page
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)) }
  page.setData = update => {
    for (const [key, value] of Object.entries(update)) {
      const match = key.match(/^groups\[(\d+)\]\.(\w+)$/)
      if (match) page.data.groups[Number(match[1])][match[2]] = value
      else page.data[key] = value
    }
  }
  page.onLoad()
  return page
}

test('页面统计完整组；半填阻止汇总，修改后立即更新、清空不留旧结果', () => {
  const page = pageHarness()
  assert.equal(page.data.result, null)
  page.data.groups.forEach((group, index) => Object.assign(group, {
    minusLeft: '350', minusRight: '170', plusLeft: String(10 + 2 * index), plusRight: String(190 + 2 * index),
  }))
  page.data.density = '1000'; page.recalculate()
  assert.equal(page.data.result.n, 3)
  assert.equal(page.data.result.variance, '1')
  assert.equal(page.data.result.tp, '1.32')
  page.onAddGroup()
  assert.equal(page.data.result.n, 3)
  page.onReadingInput({ currentTarget: { dataset: { index: 3, field: 'minusLeft' } }, detail: { value: '0' } })
  assert.equal(page.data.result, null)
  page.onReadingInput({ currentTarget: { dataset: { index: 3, field: 'minusLeft' } }, detail: { value: '' } })
  assert.equal(page.data.result.n, 3)
  page.data.density = '0'; page.recalculate()
  assert.equal(page.data.result.wavelength, '—')
  assert.ok(page.data.parameterError)
  page.data.groups.forEach(g => ['minusLeft', 'minusRight', 'plusLeft', 'plusRight'].forEach(k => { g[k] = '' }))
  page.recalculate(); assert.equal(page.data.result, null)
})

test('首页只将光谱实验接入新路由', () => {
  let definition, navigated, modal
  global.Page = value => { definition = value }
  global.wx = { navigateTo: value => { navigated = value.url }, showModal: value => { modal = value } }
  require('../pages/index/index')
  definition.onConfirmSelection.call({ data: { selectedExperiment: { id: 'spectral-analysis' } } })
  assert.equal(navigated, '/pages/spectral-analysis/index')
  definition.onConfirmSelection.call({ data: { selectedExperiment: { id: 'rlc', name: 'RLC' } } })
  assert.ok(modal)
  delete global.Page; delete global.wx
})
