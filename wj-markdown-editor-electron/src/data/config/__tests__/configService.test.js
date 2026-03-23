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

  it('setConfigWithRecentMax 在 config 写盘失败时必须恢复 recent 快照，且内存态与广播都不能前移', async () => {
    const repository = createRepositoryStub()
    repository.writeConfigText.mockRejectedValueOnce(new Error('config-write-failed'))
    const callback = vi.fn()
    const recentSnapshot = {
      recent: ['D:/docs/one.md', 'D:/docs/two.md'],
      maxSize: 12,
    }
    const recentStore = createRecentStoreStub({
      createStateSnapshot: vi.fn(() => cloneValue(recentSnapshot)),
    })
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

    expect(recentStore.createStateSnapshot).toHaveBeenCalledTimes(1)
    expect(recentStore.setMax).toHaveBeenCalledWith(7, { notify: false })
    expect(repository.writeConfigText).toHaveBeenCalledTimes(1)
    expect(recentStore.restoreState).toHaveBeenCalledTimes(1)
    expect(recentStore.restoreState).toHaveBeenCalledWith(recentSnapshot)
    expect(recentStore.restoreState.mock.invocationCallOrder[0]).toBeGreaterThan(repository.writeConfigText.mock.invocationCallOrder[0])
    expect(service.getConfig()).toEqual(previousConfig)
    expect(callback).not.toHaveBeenCalled()
  })

  it('setConfigWithRecentMax 必须在 config 成功前禁止 recent 广播，并在全部成功后再显式通知 recent', async () => {
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const recentStore = createRecentStoreStub({
      createStateSnapshot: vi.fn(() => ({
        recent: ['D:/docs/one.md'],
        maxSize: 8,
      })),
    })
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
    expect(recentStore.notifyCurrentState).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(recentStore.notifyCurrentState.mock.invocationCallOrder[0]).toBeGreaterThan(callback.mock.invocationCallOrder[0])
  })

  it('setConfigWithRecentMax 在 config 写盘失败时必须等待 recent.restoreState 完成后再返回', async () => {
    const repository = createRepositoryStub()
    repository.writeConfigText.mockRejectedValueOnce(new Error('config-write-failed'))
    const callback = vi.fn()

    let resolveRestore
    const restoreState = vi.fn(() => new Promise((resolve) => {
      resolveRestore = resolve
    }))
    const recentStore = createRecentStoreStub({
      createStateSnapshot: vi.fn(() => ({
        recent: ['D:/docs/one.md'],
        maxSize: 8,
      })),
      restoreState,
    })
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    let settled = false
    const resultPromise = service.setConfigWithRecentMax({
      recentMax: 6,
    }, recentStore).then((result) => {
      settled = true
      return result
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(restoreState).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)

    resolveRestore()

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })
    expect(settled).toBe(true)
  })

  it('setConfigWithRecentMax 在 recent rollback 失败时必须记录错误日志，并保持结构化失败结果', async () => {
    const repository = createRepositoryStub()
    repository.writeConfigText.mockRejectedValueOnce(new Error('config-write-failed'))
    const callback = vi.fn()
    const rollbackError = new Error('rollback-write-failed')
    const recentStore = createRecentStoreStub({
      createStateSnapshot: vi.fn(() => ({
        recent: ['D:/docs/one.md'],
        maxSize: 8,
      })),
      restoreState: vi.fn(async () => {
        throw rollbackError
      }),
    })
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()

    await expect(service.setConfigWithRecentMax({
      recentMax: 6,
    }, recentStore)).resolves.toEqual({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith('[configService] recent rollback failed:', rollbackError)
    expect(callback).not.toHaveBeenCalled()
    expect(recentStore.notifyCurrentState).not.toHaveBeenCalled()
  })

  it('两个 setConfigWithRecentMax 并发交错时，失败事务不能把后续成功事务的 recent 结果回滚掉', async () => {
    let writeCount = 0
    let resolveFirstWrite
    const repository = {
      readParsedConfig: vi.fn(async () => cloneValue(defaultConfig)),
      writeConfigText: vi.fn(() => {
        const writeIndex = writeCount
        writeCount += 1
        if (writeIndex === 0) {
          return new Promise((resolve, reject) => {
            resolveFirstWrite = { resolve, reject }
          })
        }

        return Promise.resolve()
      }),
    }
    const callback = vi.fn()
    let recentState = {
      recent: ['D:/docs/original.md'],
      maxSize: defaultConfig.recentMax,
    }
    const recentNotifications = []
    let recentQueue = Promise.resolve()
    const recentStore = {
      transaction: vi.fn(async (task) => {
        const runTask = recentQueue.then(() => task({
          createStateSnapshot: () => cloneValue(recentState),
          notifyCurrentState: () => {
            recentNotifications.push(cloneValue(recentState))
          },
          restoreState: async (snapshot) => {
            recentState = cloneValue(snapshot)
          },
          setMax: async (max) => {
            recentState = {
              recent: recentState.recent.slice(0, max),
              maxSize: max,
            }
          },
        }))
        recentQueue = runTask.catch(() => {})
        return await runTask
      }),
    }
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
      recentMax: 0,
      language: 'zh-CN',
    }, recentStore)

    resolveFirstWrite.reject(new Error('first-config-write-failed'))

    await expect(firstUpdatePromise).resolves.toEqual({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })
    await expect(secondUpdatePromise).resolves.toEqual({
      ok: true,
      config: expect.objectContaining({
        recentMax: 0,
        language: 'zh-CN',
      }),
    })

    expect(service.getConfig()).toEqual(expect.objectContaining({
      recentMax: 0,
      language: 'zh-CN',
    }))
    expect(recentState).toEqual({
      recent: [],
      maxSize: 0,
    })
    expect(recentNotifications).toEqual([
      {
        recent: [],
        maxSize: 0,
      },
    ])
  })

  it('setConfigWithRecentMax 挂起时并发 setThemeGlobal，较晚成功的主题写入不能被旧配置快照覆盖', async () => {
    let resolveRecentTransaction
    const recentStore = {
      transaction: vi.fn(async (task) => {
        await new Promise((resolve) => {
          resolveRecentTransaction = resolve
        })
        return await task({
          createStateSnapshot: vi.fn(() => ({
            recent: ['D:/docs/original.md'],
            maxSize: defaultConfig.recentMax,
          })),
          notifyCurrentState: vi.fn(),
          restoreState: vi.fn(async () => undefined),
          setMax: vi.fn(async () => undefined),
        })
      }),
    }
    const repository = createRepositoryStub()
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)
    repository.writeConfigText.mockClear()
    callback.mockClear()

    const recentUpdatePromise = service.setConfigWithRecentMax({
      recentMax: 3,
      language: 'en-US',
    }, recentStore)

    await new Promise(resolve => setTimeout(resolve, 0))

    const themeUpdatePromise = service.setThemeGlobal('dark')

    resolveRecentTransaction()

    await expect(recentUpdatePromise).resolves.toEqual({
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
