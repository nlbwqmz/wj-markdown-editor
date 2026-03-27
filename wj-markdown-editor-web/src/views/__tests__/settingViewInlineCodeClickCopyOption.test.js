import assert from 'node:assert/strict'
import fs from 'node:fs'

import enUS from '../../i18n/enUS.js'
import zhCN from '../../i18n/zhCN.js'

const { test } = await import('node:test')

function readSettingViewSource() {
  return fs.readFileSync(new URL('../SettingView.vue', import.meta.url), 'utf8')
}

test('设置页中的行内代码点击行为应展示为标题加动作选项', () => {
  const source = readSettingViewSource()

  assert.equal(zhCN.config.editor.inlineCodeClickCopy, '点击行内代码')
  assert.equal(zhCN.config.editor.inlineCodeClickCopyOption.copy, '复制')
  assert.equal(zhCN.config.saveOption.noOperation, '无操作')

  assert.equal(enUS.config.editor.inlineCodeClickCopy, 'Click inline code')
  assert.equal(enUS.config.editor.inlineCodeClickCopyOption.copy, 'Copy')
  assert.equal(enUS.config.saveOption.noOperation, 'No operation')

  assert.match(
    source,
    /<a-descriptions-item :label="\$t\('config\.editor\.inlineCodeClickCopy'\)">[\s\S]*?<a-radio-button :value="true">[\s\S]*?\$t\('config\.editor\.inlineCodeClickCopyOption\.copy'\)[\s\S]*?<\/a-radio-button>[\s\S]*?<a-radio-button :value="false">[\s\S]*?\$t\('config\.saveOption\.noOperation'\)[\s\S]*?<\/a-radio-button>[\s\S]*?<\/a-radio-group>[\s\S]*?<\/a-descriptions-item>/u,
  )
})
