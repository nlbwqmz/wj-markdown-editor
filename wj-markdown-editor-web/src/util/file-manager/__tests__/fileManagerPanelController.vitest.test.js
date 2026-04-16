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
    const { createFileManagerPanelController } = await import('../fileManagerPanelController.js')
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
  })

  it('updateFileManagerSortConfig 提交 IPC 时必须只发送 fileManagerSort patch，避免旧配置覆盖其他字段', async () => {
    const { createFileManagerPanelController } = await import('../fileManagerPanelController.js')
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
      event: 'user-update-config',
      data: {
        fileManagerSort: {
          field: 'name',
          direction: 'desc',
        },
      },
    })
    expect(store.config.theme).toEqual({
      global: 'light',
    })

    scope.stop()
  })

  it('modifiedTime 排序与非时间排序之间切换时，应复用当前缓存并轻量同步目录读取选项', async () => {
    const { createFileManagerPanelController } = await import('../fileManagerPanelController.js')
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
    const { createFileManagerPanelController } = await import('../fileManagerPanelController.js')
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
})
