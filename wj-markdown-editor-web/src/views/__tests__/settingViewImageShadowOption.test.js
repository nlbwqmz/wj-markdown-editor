import assert from 'node:assert/strict'
import fs from 'node:fs'

import enUS from '../../i18n/enUS.js'
import zhCN from '../../i18n/zhCN.js'

const { test } = await import('node:test')

function readSettingViewSource() {
  return fs.readFileSync(new URL('../SettingView.vue', import.meta.url), 'utf8')
}

test('设置页必须提供预览图片阴影开关', () => {
  const source = readSettingViewSource()

  assert.equal(zhCN.config.view.previewImageShadow, '预览图片阴影')
  assert.equal(
    zhCN.config.view.previewImageShadowTip,
    '控制 Markdown 预览中的图片阴影，导出 PDF、PNG、JPEG 时也会沿用该效果。',
  )
  assert.equal(enUS.config.view.previewImageShadow, 'Preview image shadow')
  assert.equal(
    enUS.config.view.previewImageShadowTip,
    'Controls image shadows in Markdown preview. PDF, PNG, and JPEG exports use the same effect.',
  )

  assert.match(
    source,
    /config\.view\.previewImageShadow[\s\S]*?:value="config\.markdown\.imageShadow"[\s\S]*?submitSetPathMutation\(\['markdown', 'imageShadow'\], value\)/u,
  )
})
