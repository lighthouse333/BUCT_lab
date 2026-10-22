// 原表版式与录入数据分离。可见输入格引用同一组原始值，不复制一份可变数据。
function buildTableView(table, tableIndex) {
  const cells = []
  const layout = table.layout || { type: 'vertical' }
  const height = 110
  const indexOf = key => table.columns.findIndex(column => column.key === key)
  function add(x, y, w, h, content, options = {}) {
    cells.push({ id: 'view-' + tableIndex + '-' + cells.length, style: `left:${x}rpx;top:${y}rpx;width:${w}rpx;height:${h}rpx;`, content, ...options })
  }
  function field(row, column, x, y, w, h) {
    const cell = table.rows[row].cells[column]
    add(x, y, w, h, '', { field: true, row, column, id: cell.id })
  }
  function horizontalBlock(start, count, y, options = layout) {
    const left = 300, w = 170
    const head = options.headerKey ? indexOf(options.headerKey) : 0
    const fields = options.fields.map(indexOf)
    add(0, y, left, height, table.columns[head].label, { heading: true, corner: options.corner || '' })
    for (let i = 0; i < count; i++) field(start + i, head, left + i * w, y, w, height)
    if (options.groupLabel) add(0, y + height, 110, fields.length * height, options.groupLabel, { heading: true })
    fields.forEach((column, r) => {
      const offset = options.groupLabel ? 110 : 0
      add(offset, y + (r + 1) * height, left - offset, height, table.columns[column].label, { heading: true })
      for (let i = 0; i < count; i++) field(start + i, column, left + i * w, y + (r + 1) * height, w, height)
    })
    if (options.average || options.ellipsis) {
      const x = left + count * w
      add(x, y, w, height, options.average ? '平均值' : '…', { heading: true })
      fields.forEach((_, r) => add(x, y + (r + 1) * height, w, height, options.average ? '待计算' : '…', { computed: !!options.average }))
    }
    return { width: left + (count + (options.average || options.ellipsis ? 1 : 0)) * w, height: (fields.length + 1) * height }
  }
  if (layout.type === 'horizontal') {
    const size = horizontalBlock(0, table.rows.length, 0)
    return { displayCells: cells, ...size }
  }
  if (layout.type === 'blocks') {
    let y = 0, width = 0
    for (let start = 0; start < table.rows.length; start += layout.blockSize) {
      const size = horizontalBlock(start, Math.min(layout.blockSize, table.rows.length - start), y)
      y += size.height; width = Math.max(width, size.width)
    }
    return { displayCells: cells, width, height: y }
  }
  if (layout.type === 'torsion') {
    const left = 260, w = 180
    add(0, 0, left, height, 'x/cm', { heading: true })
    for (let group = 0; group < 6; group++) {
      add(left + group * w, 0, w, height, table.rows[group * 5].cells[0].value, { heading: true })
      for (let trial = 0; trial < 5; trial++) field(group * 5 + trial, 2, left + group * w, (trial + 1) * height, w, height)
      add(left + group * w, 6 * height, w, height, '待计算', { computed: true })
    }
    add(0, height, left, 5 * height, '转动周期\n5T_x/s', { heading: true })
    add(0, 6 * height, left, height, '平均周期\n5T_x/s', { heading: true })
    return { displayCells: cells, width: left + 6 * w, height: 7 * height }
  }
  if (layout.type === 'polarization') {
    const widths = [230, 180, 280, 850]
    const heads = ['波片光轴（OA）的角度', 'OA的实际角度', '偏振光长短轴取向（图示）', '检偏器转动360°过程中观察到的现象']
    let x = 0
    heads.forEach((label, i) => { add(x, 0, widths[i], 140, label, { heading: true }); x += widths[i] })
    let y = 140
    table.rows.forEach((row, r) => {
      const angle = Number(row.cells[0].value), h = angle === 45 ? 200 : 340
      add(0, y, widths[0], h, angle + '°')
      field(r, 1, widths[0], y, widths[1], h)
      const diagram = angle === 0 || angle === 90 ? 'line' : angle === 45 ? 'circle' : angle === 15 || angle === 75 ? 'narrow' : 'wide'
      add(widths[0] + widths[1], y, widths[2], h, '', { diagram })
      let parts
      if (angle === 45) parts = [{ text: '视场中没有明暗变化' }]
      else {
        const extinction = angle === 0 || angle === 90
        const inputPart = (prefix, column, suffix) => ({ prefix, column, suffix, row: r, id: row.cells[column].id, input: true })
        parts = [{ text: extinction ? '1. 视场发生两次明暗变化，且有两次消光现象；' : '1. 视场发生两次明暗变化，但无消光现象；' }]
        if (!extinction) parts.push({ text: '2. 最亮和最暗差别' + (angle === 15 || angle === 75 ? '大' : '小') + '；' })
        parts.push(inputPart((extinction ? '2. ' : '3. ') + '视场中最亮时，Q与A的光轴相互', 2, '；'))
        parts.push(inputPart('视场中' + (extinction ? '消光' : '最暗') + '时，Q与A的光轴相互', 3, '。'))
      }
      add(widths[0] + widths[1] + widths[2], y, widths[3], h, '', { parts: parts.map((part, key) => ({ ...part, key })) })
      y += h
    })
    return { displayCells: cells, width: widths.reduce((a, b) => a + b, 0), height: y, visibleColumnCount: 4 }
  }
  if (layout.type === 'strain') {
    const widths = table.columns.map((_, i) => i === 0 ? 180 : i === 10 ? 210 : 160)
    const xs = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0))
    const width = widths.reduce((a, b) => a + b, 0)
    add(0, 0, widths[0], 270, table.columns[0].label, { heading: true })
    add(xs[1], 0, width - widths[0], 90, '输出电压 V/V', { heading: true })
    for (let i = 0; i < 3; i++) add(xs[1 + i * 3], 90, 480, 90, ['第一次循环', '第二次循环', '第三次循环'][i], { heading: true })
    for (let c = 1; c <= 9; c++) add(xs[c], 180, widths[c], 90, table.columns[c].label, { heading: true })
    add(xs[10], 90, widths[10], 180, '校准平均值', { heading: true })
    table.rows.forEach((_, r) => table.columns.forEach((_, c) => field(r, c, xs[c], 270 + r * height, widths[c], height)))
    return { displayCells: cells, width, height: 270 + table.rows.length * height }
  }
  if (layout.type === 'records') {
    const w = 1050, rowHeight = 320
    table.rows.forEach((row, r) => {
      add(0, r * rowHeight, w, 90, row.cells[0].value, { heading: true })
      field(r, 1, 0, r * rowHeight + 90, w, rowHeight - 90)
    })
    return { displayCells: cells, width: w, height: table.rows.length * rowHeight }
  }
  const widths = table.columns.map(column => column.width)
  const xs = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0))
  const headerHeight = layout.groups ? 180 : 140
  if (layout.groups) {
    add(0, 0, widths[0], headerHeight, table.columns[0].label, { heading: true })
    let column = 1
    layout.groups.forEach(group => {
      const w = widths.slice(column, column + group.span).reduce((a, b) => a + b, 0)
      add(xs[column], 0, w, 90, group.label, { heading: true })
      column += group.span
    })
    table.columns.slice(1).forEach((col, i) => add(xs[i + 1], 90, widths[i + 1], 90, col.label, { heading: true }))
  } else table.columns.forEach((col, c) => add(xs[c], 0, widths[c], headerHeight, col.label, { heading: true, corner: c === 0 ? layout.corner || '' : '' }))
  const rowHeight = table.columns.some(col => col.kind === 'text') ? 300 : height
  table.rows.forEach((row, r) => table.columns.forEach((col, c) => {
    if ((layout.mergeKeys || []).includes(col.key)) {
      if (r > 0 && table.rows[r - 1].cells[c].value === row.cells[c].value) return
      let span = 1
      while (r + span < table.rows.length && table.rows[r + span].cells[c].value === row.cells[c].value) span++
      field(r, c, xs[c], headerHeight + r * rowHeight, widths[c], span * rowHeight)
    } else field(r, c, xs[c], headerHeight + r * rowHeight, widths[c], rowHeight)
  }))
  return { displayCells: cells, width: widths.reduce((a, b) => a + b, 0), height: headerHeight + table.rows.length * rowHeight }
}

module.exports = { buildTableView }
