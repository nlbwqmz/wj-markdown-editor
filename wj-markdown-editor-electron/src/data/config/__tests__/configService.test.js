import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import defaultConfig from '../../defaultConfig.js'
import { createConfigService } from '../configService.js'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function createRecentStoreStub(overrides = {}) {
  const transactionApi = {
    createStateSnapshot: vi.fn(() => ({
      recent: ['D:/docs/original.md'],
      maxSize: defaultConfig.recentMax,
    })),
    notifyCurrentState: vi.fn(),
    restoreState: vi.fn(async () => undefined),
    setMax: vi.fn(async () => undefined),
    ...overrides,
  }

  return {
    ...transactionApi,
    transaction: vi.fn(async task => await task(transactionApi)),
  }
}

function createRepositoryStub({
  readResult = cloneValue(defaultConfig),
  readError = null,
  writeError = null,
} = {}) {
  const writeConfigText = vi.fn(async () => {
    if (writeError) {
      throw writeError
    }
  })

  return {
    readParsedConfig: vi.fn(async () => {
      if (readError) {
        throw readError
      }

      return cloneValue(readResult)
    }),
    writeConfigText,
  }
}

describe('configService', () => {
  let consoleErrorSpy

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy?.mockRestore()
  })

  it('初始化时必须在 repair 后保存内存快照，并在必要时回写规范化配置', async () => {
    const repository = createRepositoryStub({
      readResult: {
        ...cloneValue(defaultConfig),
        theme: {
          ...cloneValue(defaultConfig.theme),
          preview: 'github-light',
        },
      },
    })
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)

    expect(service.getConfig().theme.preview).toBe('github')
    expect(repository.writeConfigText).toHaveBeenCalledTimes(1)
    expect(JSON.parse(repository.writeConfigText.mock.calls[0][0]).theme.preview).toBe('github')
    expect(callback).not.toHaveBeenCalled()
  })

  it('初始化时 recentMax 为 null 只回退该字段，其他合法配置必须保留且会回写规范化结果', async () => {
    const repository = createRepositoryStub({
      readResult: {
        ...cloneValue(defaultConfig),
        recentMax: null,
        language: 'en-US',
        theme: {
          ...cloneValue(defaultConfig.theme),
          global: 'dark',
        },
      },
    })
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)

    expect(service.getConfig()).toEqual(expect.objectContaining({
      recentMax: defaultConfig.recentMax,
      language: 'en-US',
      theme: expect.objectContaining({
        global: 'dark',
      }),
    }))
    expect(repository.writeConfigText).toHaveBeenCalledTimes(1)
    expect(JSON.parse(repository.writeConfigText.mock.calls[0][0])).toEqual(expect.objectContaining({
      recentMax: defaultConfig.recentMax,
      language: 'en-US',
      theme: expect.objectContaining({
        global: 'dark',
      }),
    }))
    expect(callback).not.toHaveBeenCalled()
  })

  it('初始化时 shortcutKeyList 含 null 不得触发整份回默认，其他合法配置必须保留且会回写规范化结果', async () => {
    const repository = createRepositoryStub({
      readResult: {
        ...cloneValue(defaultConfig),
        language: 'en-US',
        theme: {
          ...cloneValue(defaultConfig.theme),
          global: 'dark',
        },
        shortcutKeyList: [null],
      },
    })
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)

    expect(service.getConfig()).toEqual(expect.objectContaining({
      language: 'en-US',
      theme: expect.objectContaining({
        global: 'dark',
      }),
    }))
    expect(service.getConfig().shortcutKeyList).toHaveLength(defaultConfig.shortcutKeyList.length)
    expect(repository.writeConfigText).toHaveBeenCalledTimes(1)
    expect(JSON.parse(repository.writeConfigText.mock.calls[0][0])).toEqual(expect.objectContaining({
      language: 'en-US',
      theme: expect.objectContaining({
        global: 'dark',
      }),
    }))
    expect(callback).not.toHaveBeenCalled()
  })

  it('初始化时 shortcutKeyList 含重复合法 id 时，回写结果不得保留重复项', async () => {
    const repository = createRepositoryStub({
      readResult: {
        ...cloneValue(defaultConfig),
        language: 'en-US',
        shortcutKeyList: [
          { id: 'save', enabled: false },
          { id: 'save', enabled: true },
        ],
      },
    })
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)

    const persistedConfig = JSON.parse(repository.writeConfigText.mock.calls[0][0])
    const persistedSaveShortcutKeys = persistedConfig.shortcutKeyList.filter(item => item.id === 'save')
    const currentSaveShortcutKeys = service.getConfig().shortcutKeyList.filter(item => item.id === 'save')

    expect(persistedSaveShortcutKeys).toHaveLength(1)
    expect(persistedSaveShortcutKeys[0].enabled).toBe(false)
    expect(currentSaveShortcutKeys).toHaveLength(1)
    expect(currentSaveShortcutKeys[0].enabled).toBe(false)
    expect(callback).not.toHaveBeenCalled()
  })

  it('初始化时旧配置缺失 editor.previewPosition 只补默认值，不覆盖其他合法 editor 配置', async () => {
    const loadedConfig = cloneValue(defaultConfig)
    loadedConfig.editor = {
      associationHighlight: false,
    }
    const repository = createRepositoryStub({
      readResult: loadedConfig,
    })
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)

    expect(service.getConfig().editor).toEqual({
      associationHighlight: false,
      previewPosition: 'right',
    })
    expect(repository.writeConfigText).toHaveBeenCalledTimes(1)
    expect(JSON.parse(repository.writeConfigText.mock.calls[0][0]).editor).toEqual({
      associationHighlight: false,
      previewPosition: 'right',
    })
    expect(callback).not.toHaveBeenCalled()
  })

  it('运行期写盘失败时，内存态与广播都不能前移', async () => {
    const repository = createRepositoryStub({
      writeError: new Error('disk full'),
    })
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)

    await expect(service.setConfig({ language: 'en-US' })).resolves.toEqual({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })
    expect(service.getConfig().language).toBe(defaultConfig.language)
    expect(callback).not.toHaveBeenCalled()
    expect(repository.writeConfigText).toHaveBeenCalledTimes(1)
  })

  it('updateConfig 允许通过 mutation 请求更新 language', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    const result = await service.updateConfig({
      operations: [
        { type: 'set', path: ['language'], value: 'en-US' },
      ],
    })

    expect(result).toEqual({
      ok: true,
      config: expect.objectContaining({
        language: 'en-US',
      }),
    })
    expect(repository.writeConfigText).toHaveBeenCalledTimes(1)
    expect(JSON.parse(repository.writeConfigText.mock.calls[0][0])).toEqual(expect.objectContaining({
      language: 'en-US',
    }))
    expect(service.getConfig()).toEqual(expect.objectContaining({
      language: 'en-US',
    }))
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      language: 'en-US',
    }))
  })

  it('setConfig 传入局部 theme 时必须先 repair 成完整合法配置再持久化', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    const result = await service.setConfig({
      theme: {
        global: 'dark',
      },
    })

    expect(result.ok).toBe(true)

    const persistedConfig = JSON.parse(repository.writeConfigText.mock.calls[0][0])
    expect(persistedConfig.theme).toEqual({
      global: 'dark',
      code: defaultConfig.theme.code,
      preview: defaultConfig.theme.preview,
    })
    expect(service.getConfig().theme).toEqual({
      global: 'dark',
      code: defaultConfig.theme.code,
      preview: defaultConfig.theme.preview,
    })
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      theme: {
        global: 'dark',
        code: defaultConfig.theme.code,
        preview: defaultConfig.theme.preview,
      },
    }))
  })

  it('非法 language 不得返回成功或写盘，也不能推进内存态和广播', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setLanguage('jp')).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().language).toBe(defaultConfig.language)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 根级 patch 不是 plain object 时必须直接拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig('oops')).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig()).toEqual(defaultConfig)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 根级 patch 为 Date 时必须直接拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig(new Date('2020-01-01T00:00:00Z'))).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig()).toEqual(defaultConfig)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 的嵌套 patch 值为 Date 时必须严格拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig({
      theme: new Date('2020-01-01T00:00:00Z'),
    })).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().theme).toEqual(defaultConfig.theme)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 的对象字段被 patch 为 null 时必须严格拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig({
      theme: null,
    })).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().theme).toEqual(defaultConfig.theme)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 的对象字段被 patch 为数组时必须严格拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig({
      theme: [],
    })).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().theme).toEqual(defaultConfig.theme)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 含未知根字段时必须严格拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig({
      unknownField: 1,
    })).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig()).toEqual(defaultConfig)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 含未知嵌套字段时必须严格拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig({
      theme: {
        unknownNested: true,
      },
    })).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().theme).toEqual(defaultConfig.theme)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 的 shortcutKeyList 为对象时必须严格拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig({
      shortcutKeyList: { id: 'save' },
    })).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().shortcutKeyList).toEqual(defaultConfig.shortcutKeyList)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 的 shortcutKeyList 含脏字段项时必须严格拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig({
      shortcutKeyList: [{ id: 'save', bogus: true }],
    })).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().shortcutKeyList).toEqual(defaultConfig.shortcutKeyList)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 的 recentMax 为 null 时必须严格拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig({
      recentMax: null,
    })).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().recentMax).toBe(defaultConfig.recentMax)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 的 recentMax 为小数时必须严格拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig({
      recentMax: 1.5,
    })).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().recentMax).toBe(defaultConfig.recentMax)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 的非法 theme.global 必须严格拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig({
      theme: {
        global: 'solarized',
      },
    })).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().theme.global).toBe(defaultConfig.theme.global)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfig 的 autoSave 含非法项时必须严格拒绝，且不能写盘或推进状态', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfig({
      autoSave: ['blur', 'oops'],
    })).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().autoSave).toEqual(defaultConfig.autoSave)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfigWithRecentMax 在 config 写盘失败时不得推进 recent 上限，且内存态与广播都不能前移', async () => {
    const repository = createRepositoryStub()
    repository.writeConfigText.mockRejectedValueOnce(new Error('config-write-failed'))
    const callback = vi.fn()
    const recentStore = createRecentStoreStub()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    const previousConfig = service.getConfig()
    await expect(service.setConfigWithRecentMax({
      recentMax: 7,
      language: 'en-US',
    }, recentStore)).resolves.toEqual({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })

    expect(recentStore.setMax).not.toHaveBeenCalled()
    expect(repository.writeConfigText).toHaveBeenCalledTimes(1)
    expect(service.getConfig()).toEqual(previousConfig)
    expect(callback).not.toHaveBeenCalled()
    expect(recentStore.notifyCurrentState).not.toHaveBeenCalled()
  })

  it('setConfigWithRecentMax 成功时只更新配置与 recent 上限，不立即广播 recent 列表', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const recentStore = createRecentStoreStub()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfigWithRecentMax({
      recentMax: 6,
      language: 'en-US',
    }, recentStore)).resolves.toEqual({
      ok: true,
      config: expect.objectContaining({
        recentMax: 6,
        language: 'en-US',
      }),
    })

    expect(recentStore.setMax).toHaveBeenCalledWith(6, { notify: false })
    expect(recentStore.notifyCurrentState).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('setConfigWithRecentMax 在 recent.setMax 抛错时仍必须保留配置成功结果，只记录错误日志', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const recentStore = createRecentStoreStub({
      setMax: vi.fn(async () => {
        throw new Error('recent-set-max-failed')
      }),
    })
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfigWithRecentMax({
      recentMax: 4,
      language: 'en-US',
    }, recentStore)).resolves.toEqual({
      ok: true,
      config: expect.objectContaining({
        recentMax: 4,
        language: 'en-US',
      }),
    })

    expect(service.getConfig()).toEqual(expect.objectContaining({
      recentMax: 4,
      language: 'en-US',
    }))
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      recentMax: 4,
      language: 'en-US',
    }))
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[configService] recentStore.setMax failed after config persisted:',
      expect.any(Error),
    )
  })

  it('setConfigWithRecentMax 挂起时并发 setThemeGlobal，较晚成功的主题写入不能被旧配置快照覆盖', async () => {
    let resolveFirstWrite
    const repository = {
      readParsedConfig: vi.fn(async () => cloneValue(defaultConfig)),
      writeConfigText: vi.fn(() => {
        if (!resolveFirstWrite) {
          return new Promise((resolve, reject) => {
            resolveFirstWrite = { resolve, reject }
          })
        }

        return Promise.resolve()
      }),
    }
    const callback = vi.fn()
    const recentStore = createRecentStoreStub()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)

    const firstUpdatePromise = service.setConfigWithRecentMax({
      recentMax: 1,
      language: 'en-US',
    }, recentStore)

    await new Promise(resolve => setTimeout(resolve, 0))

    const secondUpdatePromise = service.setConfigWithRecentMax({
      recentMax: 3,
      language: 'en-US',
    }, recentStore)

    await new Promise(resolve => setTimeout(resolve, 0))

    const themeUpdatePromise = service.setThemeGlobal('dark')

    resolveFirstWrite.resolve()

    await expect(firstUpdatePromise).resolves.toEqual({
      ok: true,
      config: expect.objectContaining({
        recentMax: 1,
        language: 'en-US',
      }),
    })
    await expect(secondUpdatePromise).resolves.toEqual({
      ok: true,
      config: expect.objectContaining({
        recentMax: 3,
        language: 'en-US',
      }),
    })
    await expect(themeUpdatePromise).resolves.toEqual({
      ok: true,
      config: expect.objectContaining({
        theme: expect.objectContaining({
          global: 'dark',
        }),
      }),
    })

    expect(service.getConfig()).toEqual(expect.objectContaining({
      recentMax: 3,
      language: 'en-US',
      theme: expect.objectContaining({
        global: 'dark',
      }),
    }))
  })
})
