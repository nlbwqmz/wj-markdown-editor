import { describe, expect, it, vi } from 'vitest'
import defaultConfig from '../../../../../wj-markdown-editor-electron/src/data/defaultConfig.js'
import { createSettingConfigMutationController } from '../settingConfigMutationController.js'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function createDeferred() {
  let resolve = null
  let reject = null
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
  }
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

  it('autoSave 集合新增 switch（切换标签时）时必须真正提交 mutation 并立即应用乐观值', async () => {
    const context = createControllerTestContext()

    const result = await context.controller.submitAutoSaveListChange(['blur'], ['blur', 'switch'])

    // 关键回归点：option 列表漏掉 switch 时这里会变成 skipped: true，
    // 设置页表现为“勾选框点不动”。
    expect(result.skipped).toBeUndefined()
    expect(context.sendMutationRequest).toHaveBeenCalledWith({
      operations: [
        {
          type: 'setAutoSaveOption',
          option: 'switch',
          enabled: true,
        },
      ],
    })
    expect(context.getDraftConfig().autoSave).toEqual(['blur', 'switch'])
  })

  it('autoSave 集合新增 close-tab（关闭标签页时）时必须真正提交 mutation 并立即应用乐观值', async () => {
    const context = createControllerTestContext()

    const result = await context.controller.submitAutoSaveListChange(['blur'], ['blur', 'close-tab'])

    // 与主进程两处枚举或 optionList 任一处漏改时，这里会退化成 skipped: true，
    // 设置页表现为“勾选框点不动”。
    expect(result.skipped).toBeUndefined()
    expect(context.sendMutationRequest).toHaveBeenCalledWith({
      operations: [
        {
          type: 'setAutoSaveOption',
          option: 'close-tab',
          enabled: true,
        },
      ],
    })
    expect(context.getDraftConfig().autoSave).toEqual(['blur', 'close-tab'])
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

  it('reset 结构化失败时必须提示消息并回滚到当前 store 快照', async () => {
    const context = createControllerTestContext()
    context.storeConfig.theme.global = 'dark'
    context.controller.syncStoreConfig(context.storeConfig)
    context.sendMutationRequest.mockResolvedValueOnce({
      ok: false,
      messageKey: 'message.configInvalid',
    })

    await context.controller.submitReset()

    expect(context.getDraftConfig().theme.global).toBe('dark')
    expect(context.showWarningMessage).toHaveBeenCalledWith('message.configInvalid')
    expect(context.afterMutationSuccess).not.toHaveBeenCalled()
  })

  it('reset 通道失败时必须提示消息并回滚到当前 store 快照', async () => {
    const context = createControllerTestContext()
    context.storeConfig.language = 'en-US'
    context.controller.syncStoreConfig(context.storeConfig)
    context.sendMutationRequest.mockRejectedValueOnce(new Error('network'))

    await context.controller.submitReset()

    expect(context.getDraftConfig().language).toBe('en-US')
    expect(context.showWarningMessage).toHaveBeenCalledWith('message.configWriteFailed')
    expect(context.afterMutationSuccess).not.toHaveBeenCalled()
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

  it('同一路径连续更新时，旧 store 广播不得覆盖较新的本地草稿', async () => {
    const context = createControllerTestContext()
    const firstDeferred = createDeferred()
    const secondDeferred = createDeferred()
    context.sendMutationRequest
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockImplementationOnce(() => secondDeferred.promise)

    const firstSubmitPromise = context.controller.submitSetPath(['recentMax'], 11)
    const secondSubmitPromise = context.controller.submitSetPath(['recentMax'], 12)

    expect(context.getDraftConfig().recentMax).toBe(12)

    context.storeConfig.recentMax = 11
    context.controller.syncStoreConfig(context.storeConfig)

    expect(context.getDraftConfig().recentMax).toBe(12)

    firstDeferred.resolve({
      ok: true,
      config: {
        ...cloneValue(defaultConfig),
        recentMax: 11,
      },
    })
    await firstSubmitPromise

    expect(context.getDraftConfig().recentMax).toBe(12)

    secondDeferred.resolve({
      ok: true,
      config: {
        ...cloneValue(defaultConfig),
        recentMax: 12,
      },
    })
    await secondSubmitPromise

    expect(context.getDraftConfig().recentMax).toBe(12)
  })

  it('同一路径旧失败结果返回时，不得回滚掉更新中的新草稿', async () => {
    const context = createControllerTestContext()
    const firstDeferred = createDeferred()
    const secondDeferred = createDeferred()
    context.sendMutationRequest
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockImplementationOnce(() => secondDeferred.promise)

    const firstSubmitPromise = context.controller.submitSetPath(['recentMax'], 11)
    const secondSubmitPromise = context.controller.submitSetPath(['recentMax'], 12)

    firstDeferred.resolve({
      ok: false,
      messageKey: 'message.configInvalid',
    })
    await firstSubmitPromise

    expect(context.getDraftConfig().recentMax).toBe(12)
    expect(context.showWarningMessage).not.toHaveBeenCalled()

    secondDeferred.resolve({
      ok: true,
      config: {
        ...cloneValue(defaultConfig),
        recentMax: 12,
      },
    })
    await secondSubmitPromise
  })

  it('autoSave 连续更新时，旧 store 广播不得覆盖较新的本地集合', async () => {
    const context = createControllerTestContext()
    const firstDeferred = createDeferred()
    const secondDeferred = createDeferred()
    context.sendMutationRequest
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockImplementationOnce(() => secondDeferred.promise)

    const firstSubmitPromise = context.controller.submitAutoSaveListChange([], ['blur'])
    const secondSubmitPromise = context.controller.submitAutoSaveListChange(['blur'], ['blur', 'close'])

    expect(context.getDraftConfig().autoSave).toEqual(['blur', 'close'])

    context.storeConfig.autoSave = ['blur']
    context.controller.syncStoreConfig(context.storeConfig)

    expect(context.getDraftConfig().autoSave).toEqual(['blur', 'close'])

    firstDeferred.resolve({
      ok: true,
      config: {
        ...cloneValue(defaultConfig),
        autoSave: ['blur'],
      },
    })
    await firstSubmitPromise

    expect(context.getDraftConfig().autoSave).toEqual(['blur', 'close'])

    secondDeferred.resolve({
      ok: true,
      config: {
        ...cloneValue(defaultConfig),
        autoSave: ['blur', 'close'],
      },
    })
    await secondSubmitPromise
  })

  it('取消勾选 close-tab 后，仍带着 close-tab 的旧 store 广播不得把本地集合覆盖回去', async () => {
    const context = createControllerTestContext()
    const deferred = createDeferred()
    context.sendMutationRequest.mockImplementationOnce(() => deferred.promise)

    // 先勾上 close-tab，再取消：本地集合回到 ['blur']
    const submitPromise = context.controller.submitAutoSaveListChange(['blur', 'close-tab'], ['blur'])
    expect(context.getDraftConfig().autoSave).toEqual(['blur'])

    // 主进程广播的还是旧值（仍带 close-tab）：归一化比较必须能看出差异，
    // 否则这次取消会被静默吞掉，表现为“勾选框取消后又自己勾回来”。
    context.storeConfig.autoSave = ['blur', 'close-tab']
    context.controller.syncStoreConfig(context.storeConfig)

    expect(context.getDraftConfig().autoSave).toEqual(['blur'])

    deferred.resolve({
      ok: true,
      config: {
        ...cloneValue(defaultConfig),
        autoSave: ['blur'],
      },
    })
    await submitPromise

    expect(context.getDraftConfig().autoSave).toEqual(['blur'])
  })

  it('快捷键连续更新时，旧 store 广播不得覆盖较新的本地字段', async () => {
    const context = createControllerTestContext()
    const firstDeferred = createDeferred()
    const secondDeferred = createDeferred()
    context.sendMutationRequest
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockImplementationOnce(() => secondDeferred.promise)

    const firstSubmitPromise = context.controller.submitShortcutKeyField('save', 'keymap', 'F5')
    const secondSubmitPromise = context.controller.submitShortcutKeyField('save', 'keymap', 'F6')

    expect(context.getDraftConfig().shortcutKeyList.find(item => item.id === 'save')?.keymap).toBe('F6')

    const staleStoreConfig = cloneValue(defaultConfig)
    staleStoreConfig.shortcutKeyList.find(item => item.id === 'save').keymap = 'F5'
    context.storeConfig.shortcutKeyList = staleStoreConfig.shortcutKeyList
    context.controller.syncStoreConfig(context.storeConfig)

    expect(context.getDraftConfig().shortcutKeyList.find(item => item.id === 'save')?.keymap).toBe('F6')

    firstDeferred.resolve({
      ok: true,
      config: staleStoreConfig,
    })
    await firstSubmitPromise

    expect(context.getDraftConfig().shortcutKeyList.find(item => item.id === 'save')?.keymap).toBe('F6')

    const latestStoreConfig = cloneValue(defaultConfig)
    latestStoreConfig.shortcutKeyList.find(item => item.id === 'save').keymap = 'F6'
    secondDeferred.resolve({
      ok: true,
      config: latestStoreConfig,
    })
    await secondSubmitPromise
  })
})
