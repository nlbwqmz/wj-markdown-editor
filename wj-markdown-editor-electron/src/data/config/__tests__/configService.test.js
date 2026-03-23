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
})
