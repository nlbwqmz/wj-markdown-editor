import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  APP_NOTIFICATION_ICON_PATH,
  applyWindowsAppIdentity,
  WINDOWS_APP_USER_MODEL_ID,
} from './appIdentityUtil.js'

describe('appIdentityUtil', () => {
  it('应该在 Windows 开发态沿用统一的应用通知身份', () => {
    const setAppUserModelId = vi.fn()

    const applied = applyWindowsAppIdentity({
      appApi: {
        setAppUserModelId,
      },
      platform: 'win32',
      isPackaged: false,
    })

    expect(applied).toBe(true)
    expect(setAppUserModelId).toHaveBeenCalledTimes(1)
    expect(setAppUserModelId).toHaveBeenCalledWith(WINDOWS_APP_USER_MODEL_ID)
  })

  it('应该在 Windows 安装态沿用统一的应用通知身份', () => {
    const setAppUserModelId = vi.fn()

    const applied = applyWindowsAppIdentity({
      appApi: {
        setAppUserModelId,
      },
      platform: 'win32',
      isPackaged: true,
    })

    expect(applied).toBe(true)
    expect(setAppUserModelId).toHaveBeenCalledTimes(1)
    expect(setAppUserModelId).toHaveBeenCalledWith(WINDOWS_APP_USER_MODEL_ID)
  })

  it('应该在非 Windows 平台跳过应用通知身份设置', () => {
    const setAppUserModelId = vi.fn()

    const applied = applyWindowsAppIdentity({
      appApi: {
        setAppUserModelId,
      },
      platform: 'linux',
    })

    expect(applied).toBe(false)
    expect(setAppUserModelId).not.toHaveBeenCalled()
  })

  it('应该暴露统一的系统通知图标路径', () => {
    expect(path.isAbsolute(APP_NOTIFICATION_ICON_PATH)).toBe(true)
    expect(path.normalize(APP_NOTIFICATION_ICON_PATH)).toContain(path.join('icon', '256x256.png'))
  })
})
