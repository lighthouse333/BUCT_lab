const { isScientific } = require('../../utils/scientific-notation')
Component({
  properties: {
    value: { type: String, value: '', observer: 'refresh' },
    placeholder: { type: String, value: '按实际实验填写' },
    label: { type: String, value: '' },
    maxlength: { type: Number, value: 40 },
    variant: { type: String, value: 'parameter' },
    invalid: { type: Boolean, value: false },
  },
  data: { editing: false, scientific: false },
  lifetimes: { attached() { this.refresh(this.properties.value) } },
  methods: {
    refresh(value) { this.setData({ scientific: isScientific(value) }) },
    onBeginEdit() { this.setData({ editing: true }) },
    onFocus(e) { this.setData({ editing: true }); this.triggerEvent('focus', { value: e.detail.value }) },
    onInput(e) { this.triggerEvent('input', { value: e.detail.value }) },
    onBlur(e) { this.setData({ editing: false }); this.triggerEvent('blur', { value: e.detail.value }) },
  },
})
