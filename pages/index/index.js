const { experiments, categories } = require('../../utils/experiments.js')
const { definitions } = require('../../utils/experiment-forms.js')

Page({
  data: {
    keyword: '',
    categories,
    activeCategory: '全部',
    experiments,
    filteredExperiments: experiments,
    selectedId: '',
    selectedExperiment: null,
  },

  onSearchInput(e) {
    this.updateFilter(e.detail.value, this.data.activeCategory)
  },

  onClearSearch() {
    this.updateFilter('', this.data.activeCategory)
  },

  onCategoryChange(e) {
    const category = e.currentTarget.dataset.category
    if (categories.indexOf(category) === -1) return
    this.updateFilter(this.data.keyword, category)
  },

  updateFilter(keyword, activeCategory) {
    const query = keyword.trim().toLowerCase()
    const filteredExperiments = experiments.filter(experiment => {
      const matchesCategory = activeCategory === '全部' || experiment.category === activeCategory
      const matchesKeyword = (experiment.name + ' ' + experiment.keywords).toLowerCase().includes(query)
      return matchesCategory && matchesKeyword
    })
    this.setData({ keyword, activeCategory, filteredExperiments })
  },

  onResetFilter() {
    this.updateFilter('', '全部')
  },

  onExperimentChange(e) {
    const selectedExperiment = experiments.find(experiment => experiment.id === e.detail.value)
    if (!selectedExperiment) return
    this.setData({ selectedId: selectedExperiment.id, selectedExperiment })
  },

  onClearSelection() {
    this.setData({ selectedId: '', selectedExperiment: null })
  },

  onConfirmSelection() {
    const experiment = this.data.selectedExperiment
    if (!experiment) {
      wx.showToast({ title: '请先选择一个实验', icon: 'none' })
      return
    }
    if (experiment.id === 'spectral-analysis') {
      wx.navigateTo({ url: '/pages/spectral-analysis/index' })
      return
    }
    if (definitions[experiment.id]) {
      wx.navigateTo({ url: '/pages/experiment-input/index?id=' + encodeURIComponent(experiment.id) })
      return
    }
    wx.showModal({
      title: '已选择实验',
      content: experiment.name + '\n\n该实验的数据输入页尚未开放，后续将在这里进入填写。',
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
