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

  const sectionStart = source.indexOf(`<a-descriptions-item :label="$t('config.view.editorPreviewPosition')">`)
  assert.notEqual(sectionStart, -1)

  const sectionEnd = source.indexOf('</a-descriptions-item>', sectionStart)
  assert.notEqual(sectionEnd, -1)

  const sectionSource = source.slice(sectionStart, sectionEnd)

  assert.match(sectionSource, /<a-radio-group[\s\S]*?:value="config\.editor\.previewPosition"/u)
  assert.match(sectionSource, /@update:value="value => submitSetPathMutation\(\['editor', 'previewPosition'\], value\)"/u)
  assert.match(sectionSource, /<a-radio-button value="left">[\s\S]*?\$t\('config\.view\.editorPreviewPositionOption\.left'\)/u)
  assert.match(sectionSource, /<a-radio-button value="right">[\s\S]*?\$t\('config\.view\.editorPreviewPositionOption\.right'\)/u)
  assert.ok(sectionSource.indexOf(`value="left"`) < sectionSource.indexOf(`value="right"`))
})
