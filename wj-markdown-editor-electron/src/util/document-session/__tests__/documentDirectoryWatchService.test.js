import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBoundFileSession,
  createDraftSession,
  createRecentMissingSession,
} from '../documentSessionFactory.js'

function createWatchHandleRecord(directoryPath) {
  return {
    directoryPath,
    close: vi.fn(),
  }
}

async function createServiceContext({
  existingDirectorySet = ['D:/docs', 'D:/docs/next'],
} = {}) {
  const watchRecordList = []
  const readDirectoryState = vi.fn()
  const publishDirectoryChanged = vi.fn()
  const fsWatch = vi.fn((directoryPath, listener) => {
    const watchHandle = createWatchHandleRecord(directoryPath)
    watchRecordList.push({
      directoryPath,
      listener,
      watchHandle,
    })
    return watchHandle
  })
  const fsModule = {
    pathExists: vi.fn(async targetPath => existingDirectorySet.includes(targetPath)),
    stat: vi.fn(async targetPath => ({
      isDirectory: () => existingDirectorySet.includes(targetPath),
    })),
    readdir: vi.fn(async () => []),
  }

  const { createDocumentDirectoryWatchService } = await import('../documentDirectoryWatchService.js')
  const service = createDocumentDirectoryWatchService({
    fsWatch,
    fsModule,
    readDirectoryState,
    publishDirectoryChanged,
    debounceMs: 120,
  })

  return {
    service,
    fsWatch,
    fsModule,
    readDirectoryState,
    publishDirectoryChanged,
    watchRecordList,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('documentDirectoryWatchService', () => {
  it('draft 或 recent-missing 空状态下不应绑定目录 watcher', async () => {
    const { service, fsWatch } = await createServiceContext({
      existingDirectorySet: [],
    })

    await service.rebindWindowDirectoryFromSession(9, createDraftSession({
      sessionId: 'draft-session',
    }))
    await service.rebindWindowDirectoryFromSession(9, createRecentMissingSession({
      sessionId: 'recent-missing-session',
      missingPath: 'D:/docs/missing.md',
    }))

    expect(fsWatch).not.toHaveBeenCalled()
    expect(service.getWindowDirectoryBinding(9)).toBeNull()
  })

  it('目录事件经防抖后应整目录重扫，并向指定窗口推送完整列表', async () => {
    vi.useFakeTimers()
    const { service, readDirectoryState, publishDirectoryChanged, watchRecordList } = await createServiceContext()
    const directoryState = {
      mode: 'directory',
      directoryPath: 'D:/docs',
      activePath: 'D:/docs/current.md',
      entryList: [
        {
          path: 'D:/docs/current.md',
          name: 'current.md',
          kind: 'file',
          extension: '.md',
        },
      ],
    }
    readDirectoryState.mockResolvedValue(directoryState)

    await service.ensureWindowDirectory(9, 'D:/docs', {
      activePath: 'D:/docs/current.md',
    })

    watchRecordList[0].listener('rename', 'notes')
    watchRecordList[0].listener('change', 'current.md')

    await vi.advanceTimersByTimeAsync(119)
    expect(readDirectoryState).not.toHaveBeenCalled()
    expect(publishDirectoryChanged).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(readDirectoryState).toHaveBeenCalledTimes(1)
    expect(readDirectoryState).toHaveBeenCalledWith({
      directoryPath: 'D:/docs',
      activePath: 'D:/docs/current.md',
    })
    expect(publishDirectoryChanged).toHaveBeenCalledWith({
      windowId: '9',
      directoryState,
    })
  })

  it('切换目录后应停止旧目录监听并开始监听新目录', async () => {
    const { service, fsWatch, watchRecordList } = await createServiceContext()

    await service.ensureWindowDirectory(9, 'D:/docs', {
      activePath: 'D:/docs/current.md',
    })
    await service.rebindWindowDirectory(9, 'D:/docs/next', {
      activePath: null,
    })

    expect(watchRecordList[0].watchHandle.close).toHaveBeenCalledTimes(1)
    expect(fsWatch).toHaveBeenNthCalledWith(2, 'D:/docs/next', expect.any(Function))
    expect(service.getWindowDirectoryBinding(9)).toEqual({
      directoryPath: 'D:/docs/next',
      activePath: null,
    })
  })

  it('session 切换后应基于新 session 重新绑定窗口目录 watcher，并在空状态 session 下清理旧 watcher', async () => {
    const { service, fsWatch, watchRecordList } = await createServiceContext()
    const currentSession = createBoundFileSession({
      sessionId: 'current-session',
      path: 'D:/docs/current.md',
      content: '# current',
    })
    const nextSession = createBoundFileSession({
      sessionId: 'next-session',
      path: 'D:/docs/next/other.md',
      content: '# other',
    })

    await service.rebindWindowDirectoryFromSession(9, currentSession)
    await service.rebindWindowDirectoryFromSession(9, nextSession)

    expect(watchRecordList[0].watchHandle.close).toHaveBeenCalledWith()
    expect(fsWatch).toHaveBeenNthCalledWith(2, 'D:/docs/next', expect.any(Function))
    expect(service.getWindowDirectoryBinding(9)).toEqual({
      directoryPath: 'D:/docs/next',
      activePath: 'D:/docs/next/other.md',
    })

    await service.rebindWindowDirectoryFromSession(9, createDraftSession({
      sessionId: 'draft-session',
    }))

    expect(watchRecordList[1].watchHandle.close).toHaveBeenCalledWith()
    expect(service.getWindowDirectoryBinding(9)).toBeNull()
  })
})
