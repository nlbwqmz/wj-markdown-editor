import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { effectScope as createVueEffectScope, nextTick, reactive } from 'vue'
import { FILE_MANAGER_DIRECTORY_CHANGED_EVENT } from '../fileManagerEventUtil.js'

const { sortFileManagerEntryListMock } = vi.hoisted(() => ({
  sortFileManagerEntryListMock: vi.fn((entryList = []) => [...entryList]),
}))

vi.mock('../fileManagerEntryMetaUtil.js', async () => {
  return {
    resolveFileManagerEntryType: entry => (entry?.kind === 'directory' ? 'directory' : 'markdown'),
    sortFileManagerEntryList: sortFileManagerEntryListMock,
  }
})

// 冷启动加载 fileManagerPanelController 会连带拉入 ant-design-vue 等重依赖，
// 该耗时必须落在模块阶段与 beforeAll 内，不能计进单个 it 的 5000ms 预算。
const FILE_MANAGER_PANEL_CONTROLLER_LOAD_TIMEOUT_MS = 60000
const fileManagerPanelControllerModulePromise = import('../fileManagerPanelController.js')

let createFileManagerPanelController = null

// 用例中途断言失败时不会执行测试体末尾的 scope.stop()，这里把所有 effectScope 统一登记，
// 由 afterEach 兜底停止（EffectScope.stop 幂等），避免 watch / onScopeDispose 泄漏到后续用例。
const trackedEffectScopeSet = new Set()

function effectScope() {
  const scope = createVueEffectScope()
  trackedEffectScopeSet.add(scope)
  return scope
}

function stopTrackedEffectScopes() {
  for (const scope of trackedEffectScopeSet) {
    scope.stop()
  }
  trackedEffectScopeSet.clear()
}

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

function createDraftSnapshot() {
  return {
    sessionId: 'session-draft',
    displayPath: null,
    recentMissingPath: null,
    isRecentMissing: false,
    dirty: false,
    resourceContext: {
      documentPath: null,
    },
  }
}

function createPanelController(store, overrides = {}) {
  const scope = effectScope()
  let controller = null

  scope.run(() => {
    controller = createFileManagerPanelController({
      store,
      t: value => value,
      sendCommand: vi.fn(),
      requestDirectoryState: vi.fn(),
      requestOpenDirectory: vi.fn(),
      requestCreateFolder: vi.fn(),
      requestCreateMarkdown: vi.fn(),
      requestPickDirectory: vi.fn(),
      requestDocumentOpenPathByInteraction: vi.fn(),
      openNameInputModal: vi.fn(),
      showWarningMessage: vi.fn(),
      subscribeEvent: vi.fn(),
      unsubscribeEvent: vi.fn(),
      ...overrides,
    })
  })

  return {
    controller,
    scope,
  }
}

describe('fileManagerPanelController', () => {
  // 控制器模块在 beforeAll 内一次加载完成，测试体只做断言，不再承担冷 import 成本。
  beforeAll(async () => {
    const controllerModule = await fileManagerPanelControllerModulePromise
    createFileManagerPanelController = controllerModule.createFileManagerPanelController
  }, FILE_MANAGER_PANEL_CONTROLLER_LOAD_TIMEOUT_MS)

  afterEach(() => {
    stopTrackedEffectScopes()
    vi.restoreAllMocks()
    sortFileManagerEntryListMock.mockClear()
  })

  it('updateFileManagerSortConfig 成功后应只重排一次当前目录缓存，不能额外重复重排', async () => {
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

  it('updateFileManagerSortConfig 提交 IPC 时必须发送 fileManagerSort batch mutation，避免旧事件与整块 patch', async () => {
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

  it('未配置 fileDefaultDirectory 时，草稿快照应保持既有空态且不请求目录', async () => {
    const store = createStore()
    store.documentSessionSnapshot = createDraftSnapshot()
    const requestDirectoryState = vi.fn()
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
    })

    await flushController()

    expect(requestDirectoryState).not.toHaveBeenCalled()
    expect(controller.directoryPath.value).toBeNull()
    expect(controller.entryList.value).toEqual([])
    expect(controller.emptyMessageKey.value).toBe('message.fileManagerSelectDirectory')

    scope.stop()
  })

  it('配置有效 fileDefaultDirectory 时，草稿快照应请求归一化后的默认目录并展示目录态', async () => {
    const store = createStore()
    store.documentSessionSnapshot = createDraftSnapshot()
    store.config.fileDefaultDirectory = 'D:\\workspace\\notes\\'
    const requestDirectoryState = vi.fn().mockResolvedValue({
      directoryPath: 'D:/workspace/notes',
      entryList: [
        { name: 'note.md', path: 'D:/workspace/notes/note.md', kind: 'markdown' },
      ],
    })
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
    })

    await flushController()

    expect(requestDirectoryState).toHaveBeenCalledTimes(1)
    expect(requestDirectoryState).toHaveBeenCalledWith({
      directoryPath: 'D:/workspace/notes',
    })
    expect(controller.directoryPath.value).toBe('D:/workspace/notes')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['note.md'])

    scope.stop()
  })

  it('isRecentMissing 为 true 但 recentMissingPath 缺失的退化快照不得套用默认目录', async () => {
    const store = createStore()
    store.documentSessionSnapshot = {
      sessionId: 'session-recent-missing-degraded',
      displayPath: null,
      recentMissingPath: null,
      isRecentMissing: true,
      dirty: false,
      resourceContext: {
        documentPath: null,
      },
    }
    store.config.fileDefaultDirectory = 'D:/workspace/notes'
    const requestDirectoryState = vi.fn()
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
    })

    await flushController()

    expect(requestDirectoryState).not.toHaveBeenCalled()
    expect(controller.directoryPath.value).toBeNull()
    expect(controller.emptyMessageKey.value).toBe('message.fileManagerSelectDirectory')

    scope.stop()
  })

  it('fileDefaultDirectory 为空白字符串时应视为未配置，草稿快照保持既有空态', async () => {
    const store = createStore()
    store.documentSessionSnapshot = createDraftSnapshot()
    store.config.fileDefaultDirectory = '   '
    const requestDirectoryState = vi.fn()
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
    })

    await flushController()

    expect(requestDirectoryState).not.toHaveBeenCalled()
    expect(controller.directoryPath.value).toBeNull()
    expect(controller.emptyMessageKey.value).toBe('message.fileManagerSelectDirectory')

    scope.stop()
  })

  it('已有当前文档路径或 recent-missing 有效路径时，默认目录不得覆盖原有优先级', async () => {
    const documentStore = createStore()
    documentStore.config.fileDefaultDirectory = 'D:/workspace/notes'
    const documentRequestDirectoryState = vi.fn().mockResolvedValue({
      directoryPath: 'D:/docs',
      entryList: [],
    })
    const documentPanel = createPanelController(documentStore, {
      requestDirectoryState: documentRequestDirectoryState,
    })

    await flushController()

    expect(documentRequestDirectoryState).toHaveBeenCalledWith({
      directoryPath: 'D:/docs',
    })
    documentPanel.scope.stop()

    const recentMissingStore = createStore()
    recentMissingStore.documentSessionSnapshot = {
      sessionId: 'session-recent-missing',
      displayPath: 'D:/docs/missing.md',
      recentMissingPath: 'D:/docs/missing.md',
      isRecentMissing: true,
      dirty: false,
      resourceContext: {
        documentPath: null,
      },
    }
    recentMissingStore.config.fileDefaultDirectory = 'D:/workspace/notes'
    const recentMissingRequestDirectoryState = vi.fn().mockResolvedValue({
      directoryPath: 'D:/docs',
      entryList: [],
    })
    const recentMissingPanel = createPanelController(recentMissingStore, {
      requestDirectoryState: recentMissingRequestDirectoryState,
    })

    await flushController()

    expect(recentMissingRequestDirectoryState).toHaveBeenCalledWith({
      directoryPath: 'D:/docs',
    })
    recentMissingPanel.scope.stop()
  })

  it('fileDefaultDirectory 变化后应实时重算目录目标，相同值不重复请求，清空后回到草稿空态', async () => {
    const store = createStore()
    store.documentSessionSnapshot = createDraftSnapshot()
    const requestDirectoryState = vi.fn().mockImplementation(async ({ directoryPath }) => ({
      directoryPath,
      entryList: [],
    }))
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
    })

    await flushController()

    expect(requestDirectoryState).not.toHaveBeenCalled()
    expect(controller.directoryPath.value).toBeNull()

    store.config.fileDefaultDirectory = 'D:/workspace/notes'
    await flushController()

    expect(requestDirectoryState).toHaveBeenCalledTimes(1)
    expect(requestDirectoryState).toHaveBeenNthCalledWith(1, {
      directoryPath: 'D:/workspace/notes',
    })
    expect(controller.directoryPath.value).toBe('D:/workspace/notes')

    store.config.fileDefaultDirectory = 'D:/workspace/notes'
    await flushController()

    expect(requestDirectoryState).toHaveBeenCalledTimes(1)

    store.config.fileDefaultDirectory = ''
    await flushController()

    expect(requestDirectoryState).toHaveBeenCalledTimes(1)
    expect(controller.directoryPath.value).toBeNull()
    expect(controller.emptyMessageKey.value).toBe('message.fileManagerSelectDirectory')

    scope.stop()
  })

  it('配置的默认目录不存在时，应静默回退草稿空态且不提示错误', async () => {
    const store = createStore()
    store.documentSessionSnapshot = createDraftSnapshot()
    store.config.fileDefaultDirectory = 'D:/workspace/missing'
    const requestDirectoryState = vi.fn().mockResolvedValue({
      mode: 'empty',
      directoryPath: null,
      activePath: null,
      entryList: [],
    })
    const showWarningMessage = vi.fn()
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
      showWarningMessage,
    })

    await flushController()

    expect(requestDirectoryState).toHaveBeenCalledTimes(1)
    expect(requestDirectoryState).toHaveBeenCalledWith({
      directoryPath: 'D:/workspace/missing',
    })
    expect(controller.directoryPath.value).toBeNull()
    expect(controller.entryList.value).toEqual([])
    expect(controller.emptyMessageKey.value).toBe('message.fileManagerSelectDirectory')
    expect(showWarningMessage).not.toHaveBeenCalled()

    scope.stop()
  })

  it('默认目录先存在后消失时，再次刷新应静默回退草稿空态且不提示错误', async () => {
    const store = createStore()
    store.documentSessionSnapshot = createDraftSnapshot()
    store.config.fileDefaultDirectory = 'D:/workspace/notes'
    const requestDirectoryState = vi.fn()
      .mockResolvedValueOnce({
        directoryPath: 'D:/workspace/notes',
        entryList: [
          { name: 'note.md', path: 'D:/workspace/notes/note.md', kind: 'markdown' },
        ],
      })
      .mockResolvedValueOnce({
        mode: 'empty',
        directoryPath: null,
        activePath: null,
        entryList: [],
      })
    const showWarningMessage = vi.fn()
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
      showWarningMessage,
    })

    await flushController()

    expect(controller.directoryPath.value).toBe('D:/workspace/notes')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['note.md'])

    await controller.reloadDirectoryStateFromSnapshot(store.documentSessionSnapshot)
    await flushController()

    expect(requestDirectoryState).toHaveBeenCalledTimes(2)
    expect(controller.directoryPath.value).toBeNull()
    expect(controller.entryList.value).toEqual([])
    expect(controller.emptyMessageKey.value).toBe('message.fileManagerSelectDirectory')
    expect(showWarningMessage).not.toHaveBeenCalled()

    scope.stop()
  })

  it('默认目录打开失败返回 open-directory-watch-failed 时，应静默回退草稿空态而不是保留旧目录状态', async () => {
    const store = createStore()
    store.documentSessionSnapshot = createDraftSnapshot()
    store.config.fileDefaultDirectory = 'D:/workspace/notes'
    const requestDirectoryState = vi.fn()
      .mockResolvedValueOnce({
        directoryPath: 'D:/workspace/notes',
        entryList: [
          { name: 'note.md', path: 'D:/workspace/notes/note.md', kind: 'markdown' },
        ],
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: 'open-directory-watch-failed',
      })
    const showWarningMessage = vi.fn()
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
      showWarningMessage,
    })

    await flushController()

    expect(controller.directoryPath.value).toBe('D:/workspace/notes')

    await controller.reloadDirectoryStateFromSnapshot(store.documentSessionSnapshot)
    await flushController()

    expect(controller.directoryPath.value).toBeNull()
    expect(controller.entryList.value).toEqual([])
    expect(controller.emptyMessageKey.value).toBe('message.fileManagerSelectDirectory')
    expect(showWarningMessage).not.toHaveBeenCalled()

    scope.stop()
  })

  it('默认目录被删除后收到目录变更空态推送时，应静默回退草稿空态', async () => {
    const store = createStore()
    store.documentSessionSnapshot = createDraftSnapshot()
    store.config.fileDefaultDirectory = 'D:/workspace/notes'
    const registeredHandlerMap = new Map()
    const requestDirectoryState = vi.fn().mockResolvedValue({
      directoryPath: 'D:/workspace/notes',
      entryList: [
        { name: 'note.md', path: 'D:/workspace/notes/note.md', kind: 'markdown' },
      ],
    })
    const showWarningMessage = vi.fn()
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
      showWarningMessage,
      subscribeEvent: (eventName, handler) => {
        registeredHandlerMap.set(eventName, handler)
      },
    })

    await flushController()

    expect(controller.directoryPath.value).toBe('D:/workspace/notes')

    registeredHandlerMap.get(FILE_MANAGER_DIRECTORY_CHANGED_EVENT)?.({
      mode: 'empty',
      directoryPath: null,
      activePath: null,
      entryList: [],
    })
    await flushController()

    expect(controller.directoryPath.value).toBeNull()
    expect(controller.entryList.value).toEqual([])
    expect(controller.emptyMessageKey.value).toBe('message.fileManagerSelectDirectory')
    expect(showWarningMessage).not.toHaveBeenCalled()

    scope.stop()
  })

  it('当前文档目录刷新失败时，应继续提示失败并保留旧目录状态', async () => {
    const store = createStore()
    const requestDirectoryState = vi.fn()
      .mockResolvedValueOnce({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
        ],
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: 'open-directory-watch-failed',
      })
    const showWarningMessage = vi.fn()
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
      showWarningMessage,
    })

    await flushController()

    expect(controller.directoryPath.value).toBe('D:/docs')

    await controller.reloadDirectoryStateFromSnapshot(store.documentSessionSnapshot)
    await flushController()

    expect(controller.directoryPath.value).toBe('D:/docs')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['current.md'])
    expect(showWarningMessage).toHaveBeenCalledWith('message.fileManagerOpenDirectoryFailed')

    scope.stop()
  })

  it('recent-missing 父目录刷新失败时，应继续提示失败并保留旧目录状态', async () => {
    const store = createStore()
    store.documentSessionSnapshot = {
      sessionId: 'session-recent-missing',
      displayPath: 'D:/docs/missing.md',
      recentMissingPath: 'D:/docs/missing.md',
      isRecentMissing: true,
      dirty: false,
      resourceContext: {
        documentPath: null,
      },
    }
    const requestDirectoryState = vi.fn()
      .mockResolvedValueOnce({
        directoryPath: 'D:/docs',
        entryList: [
          { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
        ],
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: 'open-directory-watch-failed',
      })
    const showWarningMessage = vi.fn()
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
      showWarningMessage,
    })

    await flushController()

    expect(controller.directoryPath.value).toBe('D:/docs')

    await controller.reloadDirectoryStateFromSnapshot(store.documentSessionSnapshot)
    await flushController()

    expect(controller.directoryPath.value).toBe('D:/docs')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['current.md'])
    expect(showWarningMessage).toHaveBeenCalledWith('message.fileManagerOpenDirectoryFailed')

    scope.stop()
  })

  it('手动切换目录失败时，应继续提示失败并保留旧目录状态', async () => {
    const store = createStore()
    const requestDirectoryState = vi.fn().mockResolvedValue({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'markdown' },
      ],
    })
    const requestOpenDirectory = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'open-directory-watch-failed',
    })
    const showWarningMessage = vi.fn()
    const { controller, scope } = createPanelController(store, {
      requestDirectoryState,
      requestOpenDirectory,
      showWarningMessage,
    })

    await flushController()

    expect(controller.directoryPath.value).toBe('D:/docs')

    const result = await controller.openDirectory('D:/other')
    await flushController()

    expect(result).toEqual({
      ok: false,
      reason: 'open-directory-watch-failed',
    })
    expect(controller.directoryPath.value).toBe('D:/docs')
    expect(controller.entryList.value.map(item => item.name)).toEqual(['current.md'])
    expect(showWarningMessage).toHaveBeenCalledWith('message.fileManagerOpenDirectoryFailed')

    scope.stop()
  })
})
