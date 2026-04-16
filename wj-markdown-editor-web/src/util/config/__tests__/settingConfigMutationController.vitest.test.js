import { describe, expect, it, vi } from 'vitest'
import defaultConfig from '../../../../../wj-markdown-editor-electron/src/data/defaultConfig.js'
import { createSettingConfigMutationController } from '../settingConfigMutationController.js'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function createControllerTestContext() {
  let draftConfig = cloneValue(defaultConfig)
  const storeConfig = cloneValue(defaultConfig)
  const sendMutationRequest = vi.fn().mockResolvedValue({ ok: true })
  const showWarningMessage = vi.fn()
  const afterMutationSuccess = vi.fn()

  const controller = createSettingConfigMutationController({
    getDraftConfig: () => draftConfig,
    setDraftConfig(nextConfig) {
      draftConfig = nextConfig
    },
    getStoreConfig: () => storeConfig,
    sendMutationRequest,
    showWarningMessage,
    afterMutationSuccess,
  })

  return {
    controller,
    sendMutationRequest,
    showWarningMessage,
    afterMutationSuccess,
    getDraftConfig: () => draftConfig,
    storeConfig,
  }
}

describe('settingConfigMutationController', () => {
  it('单字段更新必须通过 set mutation 提交', async () => {
    const context = createControllerTestContext()

    await context.controller.submitSetPath(['theme', 'global'], 'dark')

    expect(context.sendMutationRequest).toHaveBeenCalledWith({
      operations: [
        {
          type: 'set',
          path: ['theme', 'global'],
          value: 'dark',
        },
      ],
    })
    expect(context.afterMutationSuccess).toHaveBeenCalledTimes(1)
  })

  it('autoSave 集合更新必须转换为 setAutoSaveOption mutation', async () => {
    const context = createControllerTestContext()

    await context.controller.submitAutoSaveListChange(['close'], ['close', 'blur'])

    expect(context.sendMutationRequest).toHaveBeenCalledWith({
      operations: [
        {
          type: 'setAutoSaveOption',
          option: 'blur',
          enabled: true,
        },
      ],
    })
  })

  it('快捷键字段更新必须通过 setShortcutKeyField mutation 提交', async () => {
    const context = createControllerTestContext()

    await context.controller.submitShortcutKeyField('save', 'enabled', false)

    expect(context.sendMutationRequest).toHaveBeenCalledWith({
      operations: [
        {
          type: 'setShortcutKeyField',
          id: 'save',
          field: 'enabled',
          value: false,
        },
      ],
    })
  })

  it('reset 必须单独提交 reset mutation', async () => {
    const context = createControllerTestContext()

    await context.controller.submitReset()

    expect(context.sendMutationRequest).toHaveBeenCalledWith({
      operations: [
        {
          type: 'reset',
        },
      ],
    })
  })

  it('结构化失败结果必须回滚到 store 最新配置并提示消息', async () => {
    const context = createControllerTestContext()
    context.sendMutationRequest.mockResolvedValueOnce({
      ok: false,
      messageKey: 'message.configInvalid',
    })
    const nextStoreConfig = cloneValue(defaultConfig)
    nextStoreConfig.theme.global = 'dark'
    context.storeConfig.theme.global = nextStoreConfig.theme.global

    await context.controller.submitSetPath(['theme', 'global'], 'light')

    expect(context.getDraftConfig().theme.global).toBe('dark')
    expect(context.showWarningMessage).toHaveBeenCalledWith('message.configInvalid')
    expect(context.afterMutationSuccess).not.toHaveBeenCalled()
  })

  it('传输层失败时必须回滚到 store 最新配置并提示默认失败消息', async () => {
    const context = createControllerTestContext()
    context.sendMutationRequest.mockRejectedValueOnce(new Error('network'))
    context.storeConfig.language = 'en-US'

    await context.controller.submitSetPath(['language'], 'zh-CN')

    expect(context.getDraftConfig().language).toBe('en-US')
    expect(context.showWarningMessage).toHaveBeenCalledWith('message.configWriteFailed')
    expect(context.afterMutationSuccess).not.toHaveBeenCalled()
  })
})
