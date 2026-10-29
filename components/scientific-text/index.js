const { notationSegments } = require('../../utils/scientific-notation')
Component({
  externalClasses: ['text-class'],
  properties: {
    value: { type: String, value: '', observer: 'refresh' },
    selectable: { type: Boolean, value: false },
  },
  data: { segments: [] },
  lifetimes: { attached() { this.refresh(this.properties.value) } },
  methods: { refresh(value) { this.setData({ segments: notationSegments(value) }) } },
})
