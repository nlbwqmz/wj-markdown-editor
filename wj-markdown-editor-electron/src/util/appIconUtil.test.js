import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveWindowIconPath, WINDOW_ICON_PATH } from './appIconUtil.js'

describe('appIconUtil', () => {
  it('应该在 Windows 使用多尺寸 ico 作为窗口图标', () => {
    const iconPath = resolveWindowIconPath('win32')

    expect(path.isAbsolute(iconPath)).toBe(true)
    expect(path.basename(iconPath)).toBe('favicon.ico')
    expect(path.normalize(iconPath)).toContain(path.join('icon', 'favicon.ico'))
  })

  it('应该在非 Windows 平台使用 png 作为窗口图标', () => {
    // Electron 只承诺 PNG / JPEG，ico 解码属于 Windows 向实现细节。
    for (const platform of ['linux', 'darwin']) {
      const iconPath = resolveWindowIconPath(platform)

      expect(path.isAbsolute(iconPath)).toBe(true)
      expect(path.basename(iconPath)).toBe('256x256.png')
      expect(path.normalize(iconPath)).toContain(path.join('icon', '256x256.png'))
    }
  })

  it('应该暴露当前平台解析出的窗口图标路径', () => {
    expect(WINDOW_ICON_PATH).toBe(resolveWindowIconPath())
  })
})
