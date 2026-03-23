import { afterEach, describe, expect, it, vi } from 'vitest'

const init = vi.fn()
const getConfig = vi.fn(() => ({ language: 'zh-CN' }))
const setConfig = vi.fn(async () => ({ ok: true }))
const setThemeGlobal = vi.fn(async () => ({ ok: true }))
const setLanguage = vi.fn(async () => ({ ok: true }))

vi.mock('./config/configService.js', () => ({
  createConfigService: vi.fn(() => ({
    init,
    getConfig,
    setConfig,
    setThemeGlobal,
    setLanguage,
  })),
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => 'D:\\code\\wj-markdown-editor\\wj-markdown-editor-electron',
    getPath: () => 'C:\\Users\\tester\\Documents',
  },
}))

describe('configUtil', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('必须把兼容外观方法代理到 config service', async () => {
    const { default: configUtil } = await import('./configUtil.js')

    const callback = vi.fn()

    await configUtil.initConfig(callback)
    expect(init).toHaveBeenCalledWith(callback)

    expect(configUtil.getConfig()).toEqual({ language: 'zh-CN' })
    expect(getConfig).toHaveBeenCalledTimes(1)

    await configUtil.setConfig({ language: 'en-US' })
    expect(setConfig).toHaveBeenCalledWith({ language: 'en-US' })

    await configUtil.setThemeGlobal('dark')
    expect(setThemeGlobal).toHaveBeenCalledWith('dark')

    await configUtil.setLanguage('en-US')
    expect(setLanguage).toHaveBeenCalledWith('en-US')
  })
})
