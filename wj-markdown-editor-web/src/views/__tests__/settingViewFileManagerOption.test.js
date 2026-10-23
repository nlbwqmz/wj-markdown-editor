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

test('设置页应提供文件管理栏显示范围配置项，并保持默认目录与 Markdown 左键逻辑之间的顺序', () => {
  const source = readSettingViewSource()

  assert.equal(zhCN.config.fileManager.visibleFileMode, '显示范围')
  assert.equal(enUS.config.fileManager.visibleFileMode, 'Visible files')
  assert.equal(zhCN.config.fileManager.visibleFileModeOption.all, '全部文件')
  assert.equal(enUS.config.fileManager.visibleFileModeOption.all, 'All files')
  assert.equal(zhCN.config.fileManager.visibleFileModeOption.supported, '仅支持的文件')
  assert.equal(enUS.config.fileManager.visibleFileModeOption.supported, 'Supported files only')

  assert.match(source, /isSettingItemVisible\('fileManager\.visibleFileMode'\)/u)
  assert.match(source, /:value="config\.fileManagerVisibleFileMode"/u)
  assert.match(source, /\['fileManagerVisibleFileMode'\]/u)
  assert.match(source, /config\.fileManager\.visibleFileModeOption\.all/u)
  assert.match(source, /config\.fileManager\.visibleFileModeOption\.supported/u)

  const defaultDirectoryIndex = source.indexOf('isSettingItemVisible(\'fileManager.defaultDirectory\')')
  const visibleFileModeIndex = source.indexOf('isSettingItemVisible(\'fileManager.visibleFileMode\')')
  const markdownLeftClickActionIndex = source.indexOf('isSettingItemVisible(\'fileManager.markdownLeftClickAction\')')

  assert.ok(defaultDirectoryIndex >= 0 && defaultDirectoryIndex < visibleFileModeIndex)
  assert.ok(visibleFileModeIndex < markdownLeftClickActionIndex)
})
