import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import defaultConfig from '../../defaultConfig.js'
import { createConfigService } from '../configService.js'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function createSetOperation(path, value) {
  return {
    type: 'set',
    path,
    value,
  }
}

function createUpdateRequest(...operations) {
  return { operations }
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

function createRecentStoreStub(overrides = {}) {
  return {
    setMax: vi.fn(async () => undefined),
    ...overrides,
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

    await expect(service.updateConfig(createUpdateRequest(
      createSetOperation(['language'], 'en-US'),
    ))).resolves.toEqual({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })
    expect(service.getConfig().language).toBe(defaultConfig.language)
    expect(callback).not.toHaveBeenCalled()
    expect(repository.writeConfigText).toHaveBeenCalledTimes(1)
  })

  it('updateConfig 写盘成功后必须返回新配置、推进内存态并触发回调', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    const result = await service.updateConfig(createUpdateRequest(
      createSetOperation(['language'], 'en-US'),
    ))

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

  it('非法配置请求不得返回成功或写盘，也不能推进内存态和广播', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.updateConfig(createUpdateRequest(
      createSetOperation(['language'], 'jp'),
    ))).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    expect(repository.writeConfigText).not.toHaveBeenCalled()
    expect(service.getConfig().language).toBe(defaultConfig.language)
    expect(callback).not.toHaveBeenCalled()
  })

  it('recentMax 变更时才同步 recent 上限', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const recentStore = createRecentStoreStub()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.updateConfig(createUpdateRequest(
      createSetOperation(['recentMax'], 6),
      createSetOperation(['language'], 'en-US'),
    ), recentStore)).resolves.toEqual({
      ok: true,
      config: expect.objectContaining({
        recentMax: 6,
        language: 'en-US',
      }),
    })

    expect(recentStore.setMax).toHaveBeenCalledTimes(1)
    expect(recentStore.setMax).toHaveBeenCalledWith(6, { notify: false })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('recentMax 未变更时不得同步 recent 上限', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const recentStore = createRecentStoreStub()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.updateConfig(createUpdateRequest(
      createSetOperation(['language'], 'en-US'),
    ), recentStore)).resolves.toEqual({
      ok: true,
      config: expect.objectContaining({
        language: 'en-US',
      }),
    })

    expect(recentStore.setMax).not.toHaveBeenCalled()
  })

  it('recent.setMax 抛错时仍必须保留配置成功结果，只记录错误日志', async () => {
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

    await expect(service.updateConfig(createUpdateRequest(
      createSetOperation(['recentMax'], 4),
      createSetOperation(['language'], 'en-US'),
    ), recentStore)).resolves.toEqual({
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

  it('并发排队时，后续 mutation 不得被旧快照覆盖', async () => {
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

    const firstUpdatePromise = service.updateConfig(createUpdateRequest(
      createSetOperation(['recentMax'], 1),
      createSetOperation(['language'], 'en-US'),
    ), recentStore)

    await new Promise(resolve => setTimeout(resolve, 0))

    const secondUpdatePromise = service.updateConfig(createUpdateRequest(
      createSetOperation(['recentMax'], 3),
    ), recentStore)

    await new Promise(resolve => setTimeout(resolve, 0))

    const thirdUpdatePromise = service.updateConfig(createUpdateRequest(
      createSetOperation(['theme', 'global'], 'dark'),
    ))

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
    await expect(thirdUpdatePromise).resolves.toEqual({
      ok: true,
      config: expect.objectContaining({
        recentMax: 3,
        language: 'en-US',
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

  it('init 读盘未完成时收到 updateConfig，最终内存态不得被初始化旧快照回写覆盖', async () => {
    const readDeferred = createDeferred()
    const repository = {
      readParsedConfig: vi.fn(async () => {
        return await readDeferred.promise
      }),
      writeConfigText: vi.fn(async () => undefined),
    }
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    const initPromise = service.init(callback)

    await new Promise(resolve => setTimeout(resolve, 0))

    const updatePromise = service.updateConfig(createUpdateRequest(
      createSetOperation(['language'], 'en-US'),
    ))
    const updateState = {
      settled: false,
    }
    updatePromise.finally(() => {
      updateState.settled = true
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(updateState.settled).toBe(false)

    readDeferred.resolve(cloneValue(defaultConfig))

    await initPromise
    await expect(updatePromise).resolves.toEqual({
      ok: true,
      config: expect.objectContaining({
        language: 'en-US',
      }),
    })

    expect(service.getConfig()).toEqual(expect.objectContaining({
      language: 'en-US',
    }))
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      language: 'en-US',
    }))
  })
})
