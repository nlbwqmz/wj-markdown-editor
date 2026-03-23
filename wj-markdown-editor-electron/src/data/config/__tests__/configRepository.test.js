import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createConfigRepository } from '../configRepository.js'

function createFakeFs({
  existingPaths = new Set(),
  fileContents = new Map(),
} = {}) {
  const ensuredDirectories = []
  const copiedFiles = []
  const writtenFiles = []

  return {
    ensuredDirectories,
    copiedFiles,
    writtenFiles,
    async ensureDir(targetPath) {
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
      writtenFiles.push({ targetPath, text, options })
      fileContents.set(targetPath, text)
      existingPaths.add(targetPath)
    },
    async copyFile(sourcePath, destinationPath) {
      copiedFiles.push({ sourcePath, destinationPath })
      if (!fileContents.has(sourcePath))
        throw new Error(`missing source file: ${sourcePath}`)

      fileContents.set(destinationPath, fileContents.get(sourcePath))
      existingPaths.add(destinationPath)
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
    const fakeFs = createFakeFs({
      existingPaths: new Set([configDir, configPath]),
      fileContents: new Map([[configPath, '{"broken": }']]),
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
    expect(fakeFs.copiedFiles).toHaveLength(1)
    expect(fakeFs.copiedFiles[0]).toEqual({
      sourcePath: configPath,
      destinationPath: path.join(configDir, 'config.corrupted.1774261230456.json'),
    })

    vi.useRealTimers()
  })

  it('写入配置文本时必须使用原子写并固定 utf8 编码', async () => {
    const writeFileAtomic = vi.fn().mockResolvedValue(undefined)
    const repository = createConfigRepository({
      app: {
        isPackaged: true,
        getAppPath: () => 'D:\\unused',
        getPath: () => 'C:\\Users\\tester\\Documents',
      },
      fs: createFakeFs(),
      writeFileAtomic,
    })

    await repository.writeConfigText('{"configVersion":1}')

    expect(writeFileAtomic).toHaveBeenCalledTimes(1)
    expect(writeFileAtomic).toHaveBeenCalledWith(
      path.join('C:\\Users\\tester\\Documents', 'wj-markdown-editor', 'config.json'),
      '{"configVersion":1}',
      { encoding: 'utf8' },
    )
  })
})
