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

  assert.match(
    source,
    /<a-descriptions-item :label="\$t\('config\.view\.editorPreviewPosition'\)">[\s\S]*?<a-radio-group v-model:value="config\.editor\.previewPosition" button-style="solid">[\s\S]*?<a-radio-button value="left">[\s\S]*?\$t\('config\.view\.editorPreviewPositionOption\.left'\)[\s\S]*?<\/a-radio-button>[\s\S]*?<a-radio-button value="right">[\s\S]*?\$t\('config\.view\.editorPreviewPositionOption\.right'\)[\s\S]*?<\/a-radio-button>[\s\S]*?<\/a-radio-group>[\s\S]*?<\/a-descriptions-item>/u,
  )
})
