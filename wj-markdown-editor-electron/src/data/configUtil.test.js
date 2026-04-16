import { afterEach, describe, expect, it, vi } from 'vitest'

const init = vi.fn()
const getConfig = vi.fn(() => ({ language: 'zh-CN' }))
const updateConfigResult = {
  ok: true,
  config: {
    language: 'en-US',
  },
}
const updateConfig = vi.fn(async () => updateConfigResult)

vi.mock('./config/configService.js', () => ({
  createConfigService: vi.fn(() => ({
    init,
    getConfig,
    updateConfig,
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

  it('必须只暴露 updateConfig 作为统一配置更新入口', async () => {
    const { default: configUtil } = await import('./configUtil.js')

    const callback = vi.fn()
    const recentStore = { setMax: vi.fn() }

    await configUtil.initConfig(callback)
    expect(init).toHaveBeenCalledWith(callback)

    expect(configUtil.getConfig()).toEqual({ language: 'zh-CN' })
    expect(getConfig).toHaveBeenCalledTimes(1)

    expect(configUtil.updateConfig).toBeTypeOf('function')
    const result = await configUtil.updateConfig({
      operations: [
        { type: 'set', path: ['language'], value: 'en-US' },
      ],
    }, recentStore)
    expect(result).toBe(updateConfigResult)
    expect(updateConfig).toHaveBeenCalledWith({
      operations: [
        { type: 'set', path: ['language'], value: 'en-US' },
      ],
    }, recentStore)

    expect(configUtil.setConfig).toBeUndefined()
    expect(configUtil.setConfigWithRecentMax).toBeUndefined()
    expect(configUtil.setThemeGlobal).toBeUndefined()
    expect(configUtil.setLanguage).toBeUndefined()
  })
})
