import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createConfigRepository } from '../configRepository.js'

function createFakeFs({
  existingPaths = new Set(),
  fileContents = new Map(),
  ensureDirError = null,
  writeFileError = null,
} = {}) {
  const ensuredDirectories = []
  const writtenFiles = []

  return {
    ensuredDirectories,
    writtenFiles,
    async ensureDir(targetPath) {
      if (ensureDirError)
        throw ensureDirError

      ensuredDirectories.push(targetPath)
      existingPaths.add(targetPath)
    },
    async pathExists(targetPath) {
      return existingPaths.has(targetPath)
    },
    async readFile(targetPath, encoding) {
      if (encoding !== 'utf8')
        throw new Error(`unexpected encoding: ${encoding}`)

      if (!fileContents.has(targetPath))
        throw new Error(`missing file: ${targetPath}`)

      return fileContents.get(targetPath)
    },
    async writeFile(targetPath, text, options) {
      if (writeFileError)
        throw writeFileError

      writtenFiles.push({ targetPath, text, options })
      fileContents.set(targetPath, text)
      existingPaths.add(targetPath)
    },
    getFileText(targetPath) {
      return fileContents.get(targetPath)
    },
  }
}

describe('configRepository', () => {
  it('开发环境必须继续使用 app.getAppPath 下的 config.json', async () => {
    const repository = createConfigRepository({
      app: {
        isPackaged: false,
        getAppPath: () => 'D:\\code\\wj-markdown-editor\\wj-markdown-editor-electron',
        getPath: () => 'C:\\Users\\tester\\Documents',
      },
      fs: createFakeFs(),
      writeFileAtomic: vi.fn(),
    })

    expect(repository.getConfigPath()).toMatch(/[\\/]config\.json$/)
    expect(repository.getConfigPath()).toBe('D:\\code\\wj-markdown-editor\\wj-markdown-editor-electron\\config.json')
  })

  it('jSON 解析失败时必须备份损坏文件并回退默认配置流程', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T10:20:30.456Z'))

    const configDir = 'C:\\Users\\tester\\Documents\\wj-markdown-editor'
    const configPath = path.join(configDir, 'config.json')
    const rawText = '{"broken": }'
    const backupPath = path.join(configDir, 'config.corrupted.1774261230456.json')
    const fakeFs = createFakeFs({
      existingPaths: new Set([configDir, configPath]),
      fileContents: new Map([[configPath, rawText]]),
    })
    const repository = createConfigRepository({
      app: {
        isPackaged: true,
        getAppPath: () => 'D:\\unused',
        getPath: () => 'C:\\Users\\tester\\Documents',
      },
      fs: fakeFs,
      writeFileAtomic: vi.fn(),
    })

    await expect(repository.readParsedConfig()).rejects.toThrow('CONFIG_PARSE_FAILED')
    expect(fakeFs.writtenFiles).toContainEqual({
      targetPath: backupPath,
      text: rawText,
      options: 'utf8',
    })
    expect(fakeFs.getFileText(backupPath)).toBe(rawText)

    vi.useRealTimers()
  })

  it('备份损坏文件失败时对外仍然必须稳定抛出 CONFIG_PARSE_FAILED', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T10:20:30.456Z'))

    const configDir = 'C:\\Users\\tester\\Documents\\wj-markdown-editor'
    const configPath = path.join(configDir, 'config.json')
    const backupWriteError = new Error('disk full')
    const fakeFs = createFakeFs({
      existingPaths: new Set([configDir, configPath]),
      fileContents: new Map([[configPath, '{"broken": }']]),
      writeFileError: backupWriteError,
    })
    const repository = createConfigRepository({
      app: {
        isPackaged: true,
        getAppPath: () => 'D:\\unused',
        getPath: () => 'C:\\Users\\tester\\Documents',
      },
      fs: fakeFs,
      writeFileAtomic: vi.fn(),
    })

    const thrownError = await repository.readParsedConfig().catch(error => error)

    expect(thrownError).toBeInstanceOf(Error)
    expect(thrownError.message).toBe('CONFIG_PARSE_FAILED')
    expect(thrownError.cause).toBeInstanceOf(Error)
    expect(thrownError.cause.message).toContain('Unexpected token')
    expect(thrownError.backupError).toBe(backupWriteError)

    vi.useRealTimers()
  })

  it('写入配置文本前必须先确保配置目录存在，并使用原子写与 utf8 编码', async () => {
    const writeFileAtomic = vi.fn().mockResolvedValue(undefined)
    const fakeFs = createFakeFs()
    const repository = createConfigRepository({
      app: {
        isPackaged: true,
        getAppPath: () => 'D:\\unused',
        getPath: () => 'C:\\Users\\tester\\Documents',
      },
      fs: fakeFs,
      writeFileAtomic,
    })

    await repository.writeConfigText('{"configVersion":1}')

    expect(fakeFs.ensuredDirectories).toEqual([
      path.join('C:\\Users\\tester\\Documents', 'wj-markdown-editor'),
    ])
    expect(writeFileAtomic).toHaveBeenCalledTimes(1)
    expect(writeFileAtomic).toHaveBeenCalledWith(
      path.join('C:\\Users\\tester\\Documents', 'wj-markdown-editor', 'config.json'),
      '{"configVersion":1}',
      { encoding: 'utf8' },
    )
  })
})
