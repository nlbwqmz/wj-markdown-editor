import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import enUS from '../../i18n/enUS.js'
import zhCN from '../../i18n/zhCN.js'

function readSettingViewSource() {
  return fs.readFileSync(path.resolve(process.cwd(), 'src/views/SettingView.vue'), 'utf8')
}

describe('settingView 文件管理栏默认配置项', () => {
  it('设置页应提供默认显示文件管理栏配置项，并补齐中英文文案键', () => {
    const source = readSettingViewSource()

    expect(zhCN.config.view.defaultShowFileManager).toBe('默认显示文件管理栏')
    expect(enUS.config.view.defaultShowFileManager).toBe('Default show file manager')
    expect(source).toMatch(/config\.view\.defaultShowFileManager/u)
    expect(source).toMatch(/v-model:value="config\.fileManagerVisible"/u)
  })
})
