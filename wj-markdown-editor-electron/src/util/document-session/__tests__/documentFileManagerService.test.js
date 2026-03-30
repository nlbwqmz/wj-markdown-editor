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
    }),
    rebindWindowDirectory: vi.fn(async (nextWindowId, directoryPath, options = {}) => {
      windowBindingMap.set(String(nextWindowId), {
        directoryPath,
        activePath: options.activePath ?? null,
      })
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

  it('openDirectory 命中新目录 watcher 建立失败时不应 reject，也不应清空旧目录状态', async () => {
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
    })).resolves.toEqual(expect.objectContaining({
      directoryPath: currentDirectory,
      activePath: currentFilePath,
    }))

    expect(oldWatchHandle.close).not.toHaveBeenCalled()
    await expect(service.getDirectoryState({ windowId: 9 })).resolves.toEqual(expect.objectContaining({
      directoryPath: currentDirectory,
      activePath: currentFilePath,
    }))
  })
})
