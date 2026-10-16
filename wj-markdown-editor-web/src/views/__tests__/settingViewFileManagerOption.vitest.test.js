import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import enUS from '../../i18n/enUS.js'
import zhCN from '../../i18n/zhCN.js'

function readSettingViewSource() {
  return fs.readFileSync(path.resolve(process.cwd(), 'src/views/SettingView.vue'), 'utf8')
}

describe('settingView 文件管理栏默认配置项', () => {
  it('设置页应提供文件管理栏分组，并包含默认显示与 Markdown 左键逻辑配置项', () => {
    const source = readSettingViewSource()

    expect(zhCN.config.title.fileManager).toBe('侧边栏')
    expect(enUS.config.title.fileManager).toBe('Sidebar')
    expect(zhCN.config.fileManager.defaultView).toBe('默认视图')
    expect(enUS.config.fileManager.defaultView).toBe('Default view')
    expect(zhCN.config.fileManager.markdownLeftClickAction).toBe('Markdown 左键逻辑')
    expect(enUS.config.fileManager.markdownLeftClickAction).toBe('Markdown Left Click Action')
    expect(source).toMatch(/id="fileManager"/u)
    expect(source).toMatch(/:value="config\.sidebarDefaultView"/u)
    expect(source).toMatch(/fileManagerLeftClickAction/u)
    expect(source).toMatch(/\['fileManagerLeftClickAction', 'markdown'\]/u)
  })
})
