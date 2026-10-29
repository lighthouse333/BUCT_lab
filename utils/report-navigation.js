// 通过页面事件传递数据，不把原始记录放入网址或额外写入本地存储。
function openReport(page, input) {
  if (page.data.calculating) return
  page.setData({ calculating: true })
  wx.navigateTo({
    url: '/pages/experiment-report/index',
    success: res => res.eventChannel.emit('reportInput', { input }),
    fail: () => wx.showToast({ title: '打开结果页失败，请重试', icon: 'none' }),
    complete: () => page.setData({ calculating: false }),
  })
}

module.exports = { openReport }
