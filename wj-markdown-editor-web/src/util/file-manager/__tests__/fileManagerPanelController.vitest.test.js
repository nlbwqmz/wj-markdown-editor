import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'

const { sortFileManagerEntryListMock } = vi.hoisted(() => ({
  sortFileManagerEntryListMock: vi.fn((entryList = []) => [...entryList]),
}))

vi.mock('../fileManagerEntryMetaUtil.js', async () => {
  return {
    resolveFileManagerEntryType: entry => (entry?.kind === 'directory' ? 'directory' : 'markdown'),
    sortFileManagerEntryList: sortFileManagerEntryListMock,
  }
})

const fileManagerPanelControllerModulePromise = import('../fileManagerPanelController.js')

function createStore() {
  return reactive({
    fileManagerPanelVisible: true,
    documentSessionSnapshot: {
      sessionId: 'session-current',
      displayPath: 'D:/docs/current.md',
      recentMissingPath: null,
      isRecentMissing: false,
      dirty: false,
      resourceContext: {
        documentPath: 'D:/docs/current.md',
      },
    },
    config: {
      language: 'zh-CN',
      fileManagerSort: {
        field: 'type',
        direction: 'asc',
      },
    },
  })
}

async function flushController() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
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

describe('fileManagerPanelController', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    sortFileManagerEntryListMock.mockClear()
  })

  it('updateFileManagerSortConfig 成功后应只重排一次当前目录缓存，不能额外重复重排', async () => {
    const { createFileManagerPanelController } = await fileManagerPanelControllerModulePromise
    const requestDirectoryState = vi.fn().mockResolvedValue({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'voice.mp3', path: 'D:/docs/voice.mp3', kind: 'file' },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'file' },
      ],
    })
    const sendCommand = vi.fn().mockResolvedValue({
      ok: true,
    })
    const store = createStore()
    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store,
        t: value => value,
        sendCommand,
        requestDirectoryState,
        requestOpenDirectory: vi.fn(),
        requestCreateFolder: vi.fn(),
        requestCreateMarkdown: vi.fn(),
        requestPickDirectory: vi.fn(),
        requestDocumentOpenPathByInteraction: vi.fn(),
        openNameInputModal: vi.fn(),
        showWarningMessage: vi.fn(),
        subscribeEvent: vi.fn(),
        unsubscribeEvent: vi.fn(),
      })
    })

    await flushController()
    sortFileManagerEntryListMock.mockClear()

    await controller.updateFileManagerSortConfig({
      field: 'name',
      direction: 'desc',
    })
    await flushController()

    expect(requestDirectoryState).toHaveBeenCalledTimes(1)
    expect(sortFileManagerEntryListMock).toHaveBeenCalledTimes(1)
    expect(store.config.fileManagerSort).toEqual({
      field: 'name',
      direction: 'desc',
    })

    scope.stop()
  }, 10000)

  it('updateFileManagerSortConfig 提交 IPC 时必须发送 fileManagerSort batch mutation，避免旧事件与整块 patch', async () => {
    const { createFileManagerPanelController } = await fileManagerPanelControllerModulePromise
    const requestDirectoryState = vi.fn().mockResolvedValue({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'voice.mp3', path: 'D:/docs/voice.mp3', kind: 'file' },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'file' },
      ],
    })
    const sendCommand = vi.fn().mockResolvedValue({
      ok: true,
    })
    const store = createStore()
    store.config.theme = {
      global: 'light',
    }
    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store,
        t: value => value,
        sendCommand,
        requestDirectoryState,
        requestOpenDirectory: vi.fn(),
        requestCreateFolder: vi.fn(),
        requestCreateMarkdown: vi.fn(),
        requestPickDirectory: vi.fn(),
        requestDocumentOpenPathByInteraction: vi.fn(),
        openNameInputModal: vi.fn(),
        showWarningMessage: vi.fn(),
        subscribeEvent: vi.fn(),
        unsubscribeEvent: vi.fn(),
      })
    })

    await flushController()

    await controller.updateFileManagerSortConfig({
      field: 'name',
      direction: 'desc',
    })

    expect(sendCommand).toHaveBeenCalledWith({
      event: 'config.update',
      data: {
        operations: [
          {
            type: 'set',
            path: ['fileManagerSort', 'field'],
            value: 'name',
          },
          {
            type: 'set',
            path: ['fileManagerSort', 'direction'],
            value: 'desc',
          },
        ],
      },
    })
    expect(sendCommand.mock.calls.some(([payload]) => payload?.event === 'user-update-config')).toBe(false)
    expect(store.config.theme).toEqual({
      global: 'light',
    })

    scope.stop()
  })

  it('modifiedTime 排序与非时间排序之间切换时，应复用当前缓存并轻量同步目录读取选项', async () => {
    const { createFileManagerPanelController } = await fileManagerPanelControllerModulePromise
    const requestDirectoryState = vi.fn().mockResolvedValue({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'voice.mp3', path: 'D:/docs/voice.mp3', kind: 'file', modifiedTimeMs: 20 },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'file', modifiedTimeMs: 10 },
      ],
    })
    const requestSyncCurrentDirectoryOptions = vi.fn().mockResolvedValue({
      ok: true,
    })
    const store = createStore()
    store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'desc',
    }
    const scope = effectScope()

    scope.run(() => {
      createFileManagerPanelController({
        store,
        t: value => value,
        sendCommand: vi.fn(),
        requestDirectoryState,
        requestSyncCurrentDirectoryOptions,
        requestOpenDirectory: vi.fn(),
        requestCreateFolder: vi.fn(),
        requestCreateMarkdown: vi.fn(),
        requestPickDirectory: vi.fn(),
        requestDocumentOpenPathByInteraction: vi.fn(),
        openNameInputModal: vi.fn(),
        showWarningMessage: vi.fn(),
        subscribeEvent: vi.fn(),
        unsubscribeEvent: vi.fn(),
      })
    })

    await flushController()
    expect(requestDirectoryState).toHaveBeenCalledTimes(1)

    store.config.fileManagerSort = {
      field: 'name',
      direction: 'asc',
    }
    await flushController()

    expect(requestDirectoryState).toHaveBeenCalledTimes(1)
    expect(requestSyncCurrentDirectoryOptions).toHaveBeenNthCalledWith(1, {
      includeModifiedTime: false,
    })

    store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'asc',
    }
    await flushController()

    expect(requestDirectoryState).toHaveBeenCalledTimes(1)
    expect(requestSyncCurrentDirectoryOptions).toHaveBeenNthCalledWith(2, {
      includeModifiedTime: true,
    })

    scope.stop()
  })

  it('快速切回 modifiedTime 排序时，未返回的旧同步不能阻止补发最新读取选项', async () => {
    const { FILE_MANAGER_DIRECTORY_CHANGED_EVENT } = await import('../fileManagerEventUtil.js')
    const { createFileManagerPanelController } = await fileManagerPanelControllerModulePromise
    const disableModifiedTimeRequest = createDeferred()
    const enableModifiedTimeRequest = createDeferred()
    const requestDirectoryState = vi.fn().mockResolvedValue({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'voice.mp3', path: 'D:/docs/voice.mp3', kind: 'file', modifiedTimeMs: 20 },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'file', modifiedTimeMs: 10 },
      ],
    })
    const requestSyncCurrentDirectoryOptions = vi.fn()
      .mockImplementationOnce(() => disableModifiedTimeRequest.promise)
      .mockImplementationOnce(() => enableModifiedTimeRequest.promise)
    const registeredHandlerMap = new Map()
    const store = createStore()
    store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'desc',
    }
    const scope = effectScope()

    scope.run(() => {
      createFileManagerPanelController({
        store,
        t: value => value,
        sendCommand: vi.fn(),
        requestDirectoryState,
        requestSyncCurrentDirectoryOptions,
        requestOpenDirectory: vi.fn(),
        requestCreateFolder: vi.fn(),
        requestCreateMarkdown: vi.fn(),
        requestPickDirectory: vi.fn(),
        requestDocumentOpenPathByInteraction: vi.fn(),
        openNameInputModal: vi.fn(),
        showWarningMessage: vi.fn(),
        subscribeEvent: (eventName, handler) => {
          registeredHandlerMap.set(eventName, handler)
        },
        unsubscribeEvent: vi.fn(),
      })
    })

    await flushController()
    expect(requestDirectoryState).toHaveBeenCalledTimes(1)

    store.config.fileManagerSort = {
      field: 'name',
      direction: 'asc',
    }
    await flushController()

    expect(requestSyncCurrentDirectoryOptions).toHaveBeenNthCalledWith(1, {
      includeModifiedTime: false,
    })

    store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'asc',
    }
    await flushController()

    expect(requestSyncCurrentDirectoryOptions).toHaveBeenNthCalledWith(2, {
      includeModifiedTime: true,
    })

    disableModifiedTimeRequest.resolve({
      ok: true,
      synced: true,
    })
    await flushController()

    registeredHandlerMap.get(FILE_MANAGER_DIRECTORY_CHANGED_EVENT)?.({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'voice.mp3', path: 'D:/docs/voice.mp3', kind: 'file', modifiedTimeMs: 30 },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'file', modifiedTimeMs: 10 },
      ],
    })
    await flushController()

    store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'desc',
    }
    await flushController()

    expect(requestDirectoryState).toHaveBeenCalledTimes(1)

    enableModifiedTimeRequest.resolve({
      ok: true,
      synced: true,
    })
    await flushController()
    scope.stop()
  })

  it('切到 modifiedTime 排序后的补发请求，不能被缺少 modifiedTimeMs 的目录事件永久作废', async () => {
    const { FILE_MANAGER_DIRECTORY_CHANGED_EVENT } = await import('../fileManagerEventUtil.js')
    const { createFileManagerPanelController } = await fileManagerPanelControllerModulePromise
    const staleModifiedTimeReload = createDeferred()
    const latestModifiedTimeReload = createDeferred()
    const requestDirectoryState = vi.fn()
      .mockResolvedValueOnce({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'older.md', path: 'D:/docs/older.md', kind: 'file' },
          { name: 'latest.md', path: 'D:/docs/latest.md', kind: 'file' },
        ],
      })
      .mockImplementationOnce(() => staleModifiedTimeReload.promise)
      .mockImplementationOnce(() => latestModifiedTimeReload.promise)
    const registeredHandlerMap = new Map()
    const store = createStore()
    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store,
        t: value => value,
        sendCommand: vi.fn(),
        requestDirectoryState,
        requestSyncCurrentDirectoryOptions: vi.fn(),
        requestOpenDirectory: vi.fn(),
        requestCreateFolder: vi.fn(),
        requestCreateMarkdown: vi.fn(),
        requestPickDirectory: vi.fn(),
        requestDocumentOpenPathByInteraction: vi.fn(),
        openNameInputModal: vi.fn(),
        showWarningMessage: vi.fn(),
        subscribeEvent: (eventName, handler) => {
          registeredHandlerMap.set(eventName, handler)
        },
        unsubscribeEvent: vi.fn(),
      })
    })

    await flushController()

    store.config.fileManagerSort = {
      field: 'modifiedTime',
      direction: 'desc',
    }
    await flushController()

    expect(requestDirectoryState).toHaveBeenNthCalledWith(2, {
      directoryPath: 'D:/docs',
      includeModifiedTime: true,
    })

    registeredHandlerMap.get(FILE_MANAGER_DIRECTORY_CHANGED_EVENT)?.({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'latest.md', path: 'D:/docs/latest.md', kind: 'file' },
        { name: 'older.md', path: 'D:/docs/older.md', kind: 'file' },
      ],
    })
    await flushController()

    expect(requestDirectoryState).toHaveBeenNthCalledWith(3, {
      directoryPath: 'D:/docs',
      includeModifiedTime: true,
    })

    staleModifiedTimeReload.resolve({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'older.md', path: 'D:/docs/older.md', kind: 'file', modifiedTimeMs: 1 },
        { name: 'latest.md', path: 'D:/docs/latest.md', kind: 'file', modifiedTimeMs: 2 },
      ],
    })
    await flushController()

    expect(controller.entryList.value).toEqual([
      expect.objectContaining({
        name: 'latest.md',
        modifiedTimeMs: undefined,
      }),
      expect.objectContaining({
        name: 'older.md',
        modifiedTimeMs: undefined,
      }),
    ])

    latestModifiedTimeReload.resolve({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'older.md', path: 'D:/docs/older.md', kind: 'file', modifiedTimeMs: 10 },
        { name: 'latest.md', path: 'D:/docs/latest.md', kind: 'file', modifiedTimeMs: 50 },
      ],
    })
    await flushController()

    expect(controller.entryList.value).toEqual([
      expect.objectContaining({
        name: 'older.md',
        modifiedTimeMs: 10,
      }),
      expect.objectContaining({
        name: 'latest.md',
        modifiedTimeMs: 50,
      }),
    ])

    scope.stop()
  })
})
