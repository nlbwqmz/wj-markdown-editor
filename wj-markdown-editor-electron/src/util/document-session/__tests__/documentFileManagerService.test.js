import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBoundFileSession,
  createDraftSession,
  createRecentMissingSession,
} from '../documentSessionFactory.js'
import { createDocumentSessionStore } from '../documentSessionStore.js'

const tempDirectoryList = []

async function createTempDirectory() {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'wj-file-manager-service-'))
  tempDirectoryList.push(tempDirectory)
  return tempDirectory
}

function registerWindowSession(store, { windowId, session }) {
  store.createSession(session)
  store.bindWindowToSession({
    windowId,
    sessionId: session.sessionId,
  })
}

function createDirectoryWatchServiceStub(windowId) {
  const windowBindingMap = new Map()

  return {
    ensureWindowDirectory: vi.fn(async (nextWindowId, directoryPath, options = {}) => {
      windowBindingMap.set(String(nextWindowId), {
        directoryPath,
        activePath: options.activePath ?? null,
      })
      return {
        ok: true,
        directoryPath,
        activePath: options.activePath ?? null,
      }
    }),
    rebindWindowDirectory: vi.fn(async (nextWindowId, directoryPath, options = {}) => {
      windowBindingMap.set(String(nextWindowId), {
        directoryPath,
        activePath: options.activePath ?? null,
      })
      return {
        ok: true,
        directoryPath,
        activePath: options.activePath ?? null,
      }
    }),
    clearWindowDirectory: vi.fn(async (nextWindowId) => {
      windowBindingMap.delete(String(nextWindowId))
    }),
    stopWindowDirectory: vi.fn(async (nextWindowId) => {
      windowBindingMap.delete(String(nextWindowId))
    }),
    getWindowDirectoryBinding: vi.fn((nextWindowId) => {
      return windowBindingMap.get(String(nextWindowId)) || null
    }),
    seedWindowBinding(directoryPath, activePath = null) {
      windowBindingMap.set(String(windowId), {
        directoryPath,
        activePath,
      })
    },
  }
}

async function createServiceContext({
  windowId = 9,
  session = null,
  seedBinding = null,
} = {}) {
  const store = createDocumentSessionStore()
  if (session) {
    registerWindowSession(store, {
      windowId,
      session,
    })
  }
  const directoryWatchService = createDirectoryWatchServiceStub(windowId)
  if (seedBinding) {
    directoryWatchService.seedWindowBinding(seedBinding.directoryPath, seedBinding.activePath)
  }

  const { createDocumentFileManagerService } = await import('../documentFileManagerService.js')
  const service = createDocumentFileManagerService({
    store,
    fsModule: fs,
    directoryWatchService,
  })

  return {
    service,
    directoryWatchService,
  }
}

async function createRealServiceContext({
  windowId = 9,
  session,
  fsWatchImpl,
  publishDirectoryChanged = vi.fn(),
} = {}) {
  const store = createDocumentSessionStore()
  registerWindowSession(store, {
    windowId,
    session,
  })

  const { createDocumentDirectoryWatchService } = await import('../documentDirectoryWatchService.js')
  const { createDocumentFileManagerService } = await import('../documentFileManagerService.js')

  let service = null
  const directoryWatchService = createDocumentDirectoryWatchService({
    fsModule: fs,
    fsWatch: fsWatchImpl,
    readDirectoryState: async ({ directoryPath, activePath }) => {
      return await service.readDirectoryState({
        directoryPath,
        activePath,
      })
    },
    publishDirectoryChanged,
    debounceMs: 120,
  })

  service = createDocumentFileManagerService({
    store,
    fsModule: fs,
    directoryWatchService,
  })

  return {
    service,
    directoryWatchService,
    publishDirectoryChanged,
  }
}

afterEach(async () => {
  await Promise.all(tempDirectoryList.splice(0).map(async tempDirectory => fs.remove(tempDirectory)))
})

describe('documentFileManagerService', () => {
  it('正常文件会话应返回当前文件目录；draft 应返回空状态；recent-missing 父目录不存在也应返回空状态', async () => {
    const fileDirectory = await createTempDirectory()
    const filePath = path.join(fileDirectory, 'demo.md')
    await fs.writeFile(filePath, '# demo', 'utf8')

    const boundContext = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'bound-session',
        path: filePath,
        content: '# demo',
      }),
    })
    const boundState = await boundContext.service.getDirectoryState({ windowId: 9 })

    expect(boundState).toEqual(expect.objectContaining({
      mode: 'directory',
      directoryPath: fileDirectory,
      activePath: filePath,
    }))
    expect(boundContext.directoryWatchService.ensureWindowDirectory).toHaveBeenCalledWith(9, fileDirectory, {
      activePath: filePath,
    })

    const draftContext = await createServiceContext({
      session: createDraftSession({
        sessionId: 'draft-session',
      }),
    })
    const draftState = await draftContext.service.getDirectoryState({ windowId: 9 })

    expect(draftState).toEqual({
      mode: 'empty',
      directoryPath: null,
      activePath: null,
      entryList: [],
    })
    expect(draftContext.directoryWatchService.ensureWindowDirectory).not.toHaveBeenCalled()

    const missingParentDirectory = path.join(await createTempDirectory(), 'missing-parent')
    const recentMissingContext = await createServiceContext({
      session: createRecentMissingSession({
        sessionId: 'recent-missing-session',
        missingPath: path.join(missingParentDirectory, 'missing.md'),
      }),
    })
    const recentMissingState = await recentMissingContext.service.getDirectoryState({ windowId: 9 })

    expect(recentMissingState).toEqual({
      mode: 'empty',
      directoryPath: null,
      activePath: null,
      entryList: [],
    })
    expect(recentMissingContext.directoryWatchService.ensureWindowDirectory).not.toHaveBeenCalled()
  })

  it('recent-missing 父目录仍存在时应定位到原父目录，且当前高亮为空', async () => {
    const parentDirectory = await createTempDirectory()
    await fs.writeFile(path.join(parentDirectory, 'keep.md'), '# keep', 'utf8')

    const { service, directoryWatchService } = await createServiceContext({
      session: createRecentMissingSession({
        sessionId: 'recent-missing-session',
        missingPath: path.join(parentDirectory, 'missing.md'),
      }),
    })

    const result = await service.getDirectoryState({ windowId: 9 })

    expect(result.directoryPath).toBe(parentDirectory)
    expect(result.activePath).toBeNull()
    expect(result.entryList.map(item => item.name)).toEqual(['keep.md'])
    expect(directoryWatchService.ensureWindowDirectory).toHaveBeenCalledWith(9, parentDirectory, {
      activePath: null,
    })
  })

  it('目录列表应保持目录在前、文件在后、同类按名称排序', async () => {
    const directoryPath = await createTempDirectory()
    await fs.ensureDir(path.join(directoryPath, 'notes'))
    await fs.ensureDir(path.join(directoryPath, 'assets'))
    await fs.writeFile(path.join(directoryPath, 'a.md'), '# a', 'utf8')
    await fs.writeFile(path.join(directoryPath, 'z.txt'), 'z', 'utf8')

    const { service } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'sort-session',
        path: path.join(directoryPath, 'a.md'),
        content: '# a',
      }),
    })

    const result = await service.getDirectoryState({ windowId: 9 })

    expect(result.entryList.map(item => item.name)).toEqual(['assets', 'notes', 'a.md', 'z.txt'])
    expect(result.entryList).toEqual([
      {
        path: path.join(directoryPath, 'assets'),
        name: 'assets',
        kind: 'directory',
        extension: null,
      },
      {
        path: path.join(directoryPath, 'notes'),
        name: 'notes',
        kind: 'directory',
        extension: null,
      },
      {
        path: path.join(directoryPath, 'a.md'),
        name: 'a.md',
        kind: 'file',
        extension: '.md',
      },
      {
        path: path.join(directoryPath, 'z.txt'),
        name: 'z.txt',
        kind: 'file',
        extension: '.txt',
      },
    ])
  })

  it('新建文件夹成功后应返回刷新后的目录列表', async () => {
    const directoryPath = await createTempDirectory()
    const currentFilePath = path.join(directoryPath, 'current.md')
    await fs.writeFile(currentFilePath, '# current', 'utf8')

    const { service } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'create-folder-session',
        path: currentFilePath,
        content: '# current',
      }),
    })

    const result = await service.createFolder({
      windowId: 9,
      name: 'assets',
    })

    expect(await fs.pathExists(path.join(directoryPath, 'assets'))).toBe(true)
    expect(result.entryList.map(item => item.name)).toEqual(['assets', 'current.md'])
  })

  it('createFolder 命中同名目录时，必须显式失败且不能误返回成功目录状态', async () => {
    const directoryPath = await createTempDirectory()
    const currentFilePath = path.join(directoryPath, 'current.md')
    const existingDirectoryPath = path.join(directoryPath, 'assets')
    await fs.writeFile(currentFilePath, '# current', 'utf8')
    await fs.ensureDir(existingDirectoryPath)

    const { service } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'create-folder-existing-directory-session',
        path: currentFilePath,
        content: '# current',
      }),
    })

    await expect(service.createFolder({
      windowId: 9,
      name: 'assets',
    })).resolves.toEqual({
      ok: false,
      reason: 'file-manager-entry-already-exists',
      path: existingDirectoryPath,
    })
  })

  it('createFolder 命中同名文件时，必须显式失败且不能覆盖现有文件', async () => {
    const directoryPath = await createTempDirectory()
    const currentFilePath = path.join(directoryPath, 'current.md')
    const existingFilePath = path.join(directoryPath, 'assets')
    await fs.writeFile(currentFilePath, '# current', 'utf8')
    await fs.writeFile(existingFilePath, 'keep', 'utf8')

    const { service } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'create-folder-existing-file-session',
        path: currentFilePath,
        content: '# current',
      }),
    })

    await expect(service.createFolder({
      windowId: 9,
      name: 'assets',
    })).resolves.toEqual({
      ok: false,
      reason: 'file-manager-entry-already-exists',
      path: existingFilePath,
    })

    expect(await fs.readFile(existingFilePath, 'utf8')).toBe('keep')
  })

  it('新建 Markdown 成功后应返回 path 与刷新后的目录列表', async () => {
    const directoryPath = await createTempDirectory()
    const currentFilePath = path.join(directoryPath, 'current.md')
    await fs.writeFile(currentFilePath, '# current', 'utf8')

    const { service } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'create-markdown-session',
        path: currentFilePath,
        content: '# current',
      }),
    })

    const result = await service.createMarkdown({
      windowId: 9,
      name: 'draft-note',
    })

    expect(result.path).toBe(path.join(directoryPath, 'draft-note.md'))
    expect(await fs.readFile(result.path, 'utf8')).toBe('')
    expect(result.directoryState.entryList.map(item => item.name)).toEqual(['current.md', 'draft-note.md'])
  })

  it('createMarkdown 命中已存在文件时，必须显式失败且不能覆盖原文件内容', async () => {
    const directoryPath = await createTempDirectory()
    const currentFilePath = path.join(directoryPath, 'current.md')
    const existingMarkdownPath = path.join(directoryPath, 'notes.md')
    await fs.writeFile(currentFilePath, '# current', 'utf8')
    await fs.writeFile(existingMarkdownPath, '# existing', 'utf8')

    const { service } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'create-markdown-existing-session',
        path: currentFilePath,
        content: '# current',
      }),
    })

    await expect(service.createMarkdown({
      windowId: 9,
      name: 'notes',
    })).resolves.toEqual({
      ok: false,
      reason: 'file-manager-entry-already-exists',
      path: existingMarkdownPath,
    })

    expect(await fs.readFile(existingMarkdownPath, 'utf8')).toBe('# existing')
  })

  it('createMarkdown 传入 .markdown 后缀时，必须保留原后缀而不是追加 .md', async () => {
    const directoryPath = await createTempDirectory()
    const currentFilePath = path.join(directoryPath, 'current.md')
    await fs.writeFile(currentFilePath, '# current', 'utf8')

    const { service } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'create-markdown-extension-session',
        path: currentFilePath,
        content: '# current',
      }),
    })

    const result = await service.createMarkdown({
      windowId: 9,
      name: 'draft-note.markdown',
    })

    expect(result.path).toBe(path.join(directoryPath, 'draft-note.markdown'))
    expect(await fs.readFile(result.path, 'utf8')).toBe('')
    expect(result.directoryState.entryList.map(item => item.name)).toEqual(['current.md', 'draft-note.markdown'])
  })

  it.each([
    '../escape-dir',
    'nested/dir',
    'nested\\dir',
    '.',
    '..',
  ])('createFolder/createMarkdown 遇到非法名称 "%s" 时必须拒绝创建', async (name) => {
    const rootDirectory = await createTempDirectory()
    const directoryPath = path.join(rootDirectory, 'docs')
    const currentFilePath = path.join(directoryPath, 'current.md')
    await fs.ensureDir(directoryPath)
    await fs.writeFile(currentFilePath, '# current', 'utf8')

    const { service } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: `invalid-entry-${name}`,
        path: currentFilePath,
        content: '# current',
      }),
    })

    await expect(service.createFolder({
      windowId: 9,
      name,
    })).resolves.toEqual({
      ok: false,
      reason: 'invalid-file-manager-entry-name',
    })
    await expect(service.createMarkdown({
      windowId: 9,
      name,
    })).resolves.toEqual({
      ok: false,
      reason: 'invalid-file-manager-entry-name',
    })

    expect(await fs.readdir(directoryPath)).toEqual(['current.md'])
  })

  it('createFolder/createMarkdown 遇到 ../ 时必须 fail-closed，不能越出当前目录', async () => {
    const rootDirectory = await createTempDirectory()
    const directoryPath = path.join(rootDirectory, 'docs')
    const currentFilePath = path.join(directoryPath, 'current.md')
    const escapedDirectoryPath = path.join(rootDirectory, 'escape-dir')
    const escapedMarkdownPath = path.join(rootDirectory, 'escape-note.md')
    await fs.ensureDir(directoryPath)
    await fs.writeFile(currentFilePath, '# current', 'utf8')

    const { service } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'escape-entry-session',
        path: currentFilePath,
        content: '# current',
      }),
    })

    await service.createFolder({
      windowId: 9,
      name: '../escape-dir',
    })
    await service.createMarkdown({
      windowId: 9,
      name: '../escape-note',
    })

    expect(await fs.pathExists(escapedDirectoryPath)).toBe(false)
    expect(await fs.pathExists(escapedMarkdownPath)).toBe(false)
  })

  it('同一窗口切换目录后，再次读取目录状态应返回新目录', async () => {
    const currentDirectory = await createTempDirectory()
    const nextDirectory = await createTempDirectory()
    const currentFilePath = path.join(currentDirectory, 'current.md')
    await fs.writeFile(currentFilePath, '# current', 'utf8')
    await fs.writeFile(path.join(nextDirectory, 'next.md'), '# next', 'utf8')

    const { service } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'open-directory-session',
        path: currentFilePath,
        content: '# current',
      }),
    })

    await service.openDirectory({
      windowId: 9,
      directoryPath: nextDirectory,
    })

    await expect(service.getDirectoryState({ windowId: 9 })).resolves.toEqual(expect.objectContaining({
      mode: 'directory',
      directoryPath: nextDirectory,
      activePath: null,
    }))
  })

  it('getDirectoryState 显式传入 directoryPath 时必须忽略旧 binding 并切到目标目录', async () => {
    const currentDirectory = await createTempDirectory()
    const nextDirectory = await createTempDirectory()
    const currentFilePath = path.join(currentDirectory, 'current.md')
    await fs.writeFile(currentFilePath, '# current', 'utf8')
    await fs.writeFile(path.join(nextDirectory, 'next.md'), '# next', 'utf8')

    const { service, directoryWatchService } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'explicit-directory-session',
        path: currentFilePath,
        content: '# current',
      }),
      seedBinding: {
        directoryPath: currentDirectory,
        activePath: currentFilePath,
      },
    })

    await expect(service.getDirectoryState({
      windowId: 9,
      directoryPath: nextDirectory,
    })).resolves.toEqual(expect.objectContaining({
      mode: 'directory',
      directoryPath: nextDirectory,
      activePath: null,
    }))

    expect(directoryWatchService.ensureWindowDirectory).toHaveBeenCalledWith(9, nextDirectory, {
      activePath: null,
    })
    expect(directoryWatchService.getWindowDirectoryBinding(9)).toEqual({
      directoryPath: nextDirectory,
      activePath: null,
    })
  })

  it('getDirectoryState 在首次 ensureWindowDirectory 绑定失败时必须显式失败，不能把普通目录状态当成功返回', async () => {
    const currentDirectory = await createTempDirectory()
    const currentFilePath = path.join(currentDirectory, 'current.md')
    await fs.writeFile(currentFilePath, '# current', 'utf8')

    const { service, directoryWatchService } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'initial-bind-failed-session',
        path: currentFilePath,
        content: '# current',
      }),
    })
    directoryWatchService.ensureWindowDirectory.mockResolvedValueOnce({
      ok: false,
      reason: 'directory-watch-rebind-failed',
      directoryPath: null,
      activePath: null,
    })

    await expect(service.getDirectoryState({ windowId: 9 })).resolves.toEqual({
      ok: false,
      reason: 'open-directory-watch-failed',
    })

    expect(directoryWatchService.getWindowDirectoryBinding(9)).toBeNull()
  })

  it('openDirectory 命中新目录 watcher 建立失败时必须显式失败，且不应清空旧目录状态', async () => {
    const currentDirectory = await createTempDirectory()
    const nextDirectory = await createTempDirectory()
    const currentFilePath = path.join(currentDirectory, 'current.md')
    const oldWatchHandle = {
      close: vi.fn(),
    }

    await fs.writeFile(currentFilePath, '# current', 'utf8')
    await fs.writeFile(path.join(nextDirectory, 'next.md'), '# next', 'utf8')

    const fsWatchImpl = vi.fn((directoryPath) => {
      if (directoryPath === nextDirectory) {
        throw new Error('watch bind failed')
      }

      return oldWatchHandle
    })
    const { service } = await createRealServiceContext({
      session: createBoundFileSession({
        sessionId: 'open-directory-safe-failure-session',
        path: currentFilePath,
        content: '# current',
      }),
      fsWatchImpl,
    })

    await service.getDirectoryState({ windowId: 9 })

    await expect(service.openDirectory({
      windowId: 9,
      directoryPath: nextDirectory,
    })).resolves.toEqual({
      ok: false,
      reason: 'open-directory-watch-failed',
    })

    expect(oldWatchHandle.close).not.toHaveBeenCalled()
    await expect(service.getDirectoryState({ windowId: 9 })).resolves.toEqual(expect.objectContaining({
      directoryPath: currentDirectory,
      activePath: currentFilePath,
    }))
  })

  it('createFolder 在底层 getDirectoryState 因 watcher 首绑失败返回 open-directory-watch-failed 时必须显式失败', async () => {
    const directoryPath = await createTempDirectory()
    const currentFilePath = path.join(directoryPath, 'current.md')
    await fs.writeFile(currentFilePath, '# current', 'utf8')

    const { service, directoryWatchService } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'create-folder-watch-failed-session',
        path: currentFilePath,
        content: '# current',
      }),
    })
    directoryWatchService.ensureWindowDirectory.mockResolvedValueOnce({
      ok: false,
      reason: 'directory-watch-rebind-failed',
      directoryPath: null,
      activePath: null,
    })

    await expect(service.createFolder({
      windowId: 9,
      name: 'assets',
    })).resolves.toEqual({
      ok: false,
      reason: 'open-directory-watch-failed',
    })

    expect(await fs.pathExists(path.join(directoryPath, 'assets'))).toBe(false)
  })

  it('createMarkdown 在底层 getDirectoryState 因 watcher 首绑失败返回 open-directory-watch-failed 时必须显式失败', async () => {
    const directoryPath = await createTempDirectory()
    const currentFilePath = path.join(directoryPath, 'current.md')
    await fs.writeFile(currentFilePath, '# current', 'utf8')

    const { service, directoryWatchService } = await createServiceContext({
      session: createBoundFileSession({
        sessionId: 'create-markdown-watch-failed-session',
        path: currentFilePath,
        content: '# current',
      }),
    })
    directoryWatchService.ensureWindowDirectory.mockResolvedValueOnce({
      ok: false,
      reason: 'directory-watch-rebind-failed',
      directoryPath: null,
      activePath: null,
    })

    await expect(service.createMarkdown({
      windowId: 9,
      name: 'draft-note',
    })).resolves.toEqual({
      ok: false,
      reason: 'open-directory-watch-failed',
    })

    expect(await fs.pathExists(path.join(directoryPath, 'draft-note.md'))).toBe(false)
  })
})
