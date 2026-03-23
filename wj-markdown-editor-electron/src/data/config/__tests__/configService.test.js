import { describe, expect, it, vi } from 'vitest'
import defaultConfig from '../../defaultConfig.js'
import { createConfigService } from '../configService.js'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
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

  it('初始化读到单字段脏值时必须只修复非法字段并保留其他合法配置', async () => {
    const repository = createRepositoryStub({
      readResult: {
        ...cloneValue(defaultConfig),
        language: 'jp-JP',
        theme: {
          ...cloneValue(defaultConfig.theme),
          global: 'dark',
        },
        recentMax: 25,
      },
    })
    const callback = vi.fn()
    const service = createConfigService({
      defaultConfig,
      repository,
    })

    await service.init(callback)

    expect(service.getConfig().language).toBe(defaultConfig.language)
    expect(service.getConfig().theme.global).toBe('dark')
    expect(service.getConfig().recentMax).toBe(25)
    expect(repository.writeConfigText).toHaveBeenCalledTimes(1)
    expect(JSON.parse(repository.writeConfigText.mock.calls[0][0])).toEqual(expect.objectContaining({
      language: defaultConfig.language,
      theme: expect.objectContaining({
        global: 'dark',
      }),
      recentMax: 25,
    }))
    expect(callback).not.toHaveBeenCalled()
  })
})
