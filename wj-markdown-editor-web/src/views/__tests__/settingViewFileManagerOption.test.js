import assert from 'node:assert/strict'
import fs from 'node:fs'

import enUS from '../../i18n/enUS.js'
import zhCN from '../../i18n/zhCN.js'

const { test } = await import('node:test')

function readSettingViewSource() {
  // 用 import.meta.url 定位，不能用 process.cwd()：
  // 从仓库根目录或 IDE 集成里跑测试时 cwd 不是 web 包目录，按 cwd 拼路径会 ENOENT。
  return fs.readFileSync(new URL('../SettingView.vue', import.meta.url), 'utf8')
}

test('设置页应提供文件管理栏分组，并包含默认显示与 Markdown 左键逻辑配置项', () => {
  const source = readSettingViewSource()

  assert.equal(zhCN.config.title.fileManager, '侧边栏')
  assert.equal(enUS.config.title.fileManager, 'Sidebar')
  assert.equal(zhCN.config.fileManager.defaultView, '默认视图')
  assert.equal(enUS.config.fileManager.defaultView, 'Default view')
  assert.equal(zhCN.config.fileManager.markdownLeftClickAction, 'Markdown 左键逻辑')
  assert.equal(enUS.config.fileManager.markdownLeftClickAction, 'Markdown Left Click Action')
  assert.match(source, /id="fileManager"/u)
  assert.match(source, /:value="config\.sidebarDefaultView"/u)
  assert.match(source, /fileManagerLeftClickAction/u)
  assert.match(source, /\['fileManagerLeftClickAction', 'markdown'\]/u)
})
