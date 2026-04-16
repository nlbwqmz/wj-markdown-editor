import assert from 'node:assert/strict'
import fs from 'node:fs'

import enUS from '../../i18n/enUS.js'
import zhCN from '../../i18n/zhCN.js'

const { test } = await import('node:test')

function readSettingViewSource() {
  return fs.readFileSync(new URL('../SettingView.vue', import.meta.url), 'utf8')
}

test('设置页中的编辑页预览位置应展示为左右选项并绑定配置字段', () => {
  const source = readSettingViewSource()

  assert.equal(zhCN.config.view.editorPreviewPosition, '编辑页预览位置')
  assert.equal(zhCN.config.view.editorPreviewPositionOption.left, '左侧')
  assert.equal(zhCN.config.view.editorPreviewPositionOption.right, '右侧')

  assert.equal(enUS.config.view.editorPreviewPosition, 'Editor preview position')
  assert.equal(enUS.config.view.editorPreviewPositionOption.left, 'Left')
  assert.equal(enUS.config.view.editorPreviewPositionOption.right, 'Right')

  assert.match(source, /config\.view\.editorPreviewPosition/u)
  assert.match(source, /v-model:value="config\.editor\.previewPosition"/u)
  assert.match(source, /config\.view\.editorPreviewPositionOption\.left/u)
  assert.match(source, /config\.view\.editorPreviewPositionOption\.right/u)
})
