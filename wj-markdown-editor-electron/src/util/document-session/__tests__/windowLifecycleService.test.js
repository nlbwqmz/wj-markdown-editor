import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()
const writeFileMock = vi.fn()
const readFileMock = vi.fn()
const pathExistsMock = vi.fn()
const statMock = vi.fn()
const showSaveDialogSyncMock = vi.fn()
const openExternalMock = vi.fn()
const showItemInFolderMock = vi.fn()
const openLocalResourceInFolderMock = vi.fn()
const recentAddMock = vi.fn()
const createWatchStateMock = vi.fn(() => ({ pendingChange: null }))
const startWatchingMock = vi.fn()
const stopWatchingMock = vi.fn()
const markInternalSaveMock = vi.fn()
const createContentVersionMock = vi.fn((content = '') => `hash:${content}`)
const ignorePendingChangeMock = vi.fn((state) => {
  state.pendingChange = null
  return 'ignored'
})
const settlePendingChangeMock = vi.fn((state) => {
  state.pendingChange = null
  return 'settled'
})
const appExitMock = vi.fn()
const getConfigMock = vi.fn(() => ({ language: 'zh-CN', autoSave: [], startPage: 'editor' }))
const browserWindowInstances = []
let webContentsId = 1
let createIdIndex = 1

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolveInner, rejectInner) => {
    resolve = resolveInner
    reject = rejectInner
  })
  return {
    promise,
    resolve,
    reject,
  }
}

vi.mock('electron', () => {
  class BrowserWindow {
    constructor() {
      this.listeners = new Map()
      this.onceListeners = new Map()
      this.closeEvents = []
      this.minimized = false
      this.destroyed = false
      this.webContents = {
        id: webContentsId++,
        send: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        openDevTools: vi.fn(),
      }
      browserWindowInstances.push(this)
    }

    on(eventName, listener) {
      const listenerList = this.listeners.get(eventName) || []
      listenerList.push(listener)
      this.listeners.set(eventName, listenerList)
      return this
    }

    once(eventName, listener) {
      const listenerList = this.onceListeners.get(eventName) || []
      listenerList.push(listener)
      this.onceListeners.set(eventName, listenerList)
      return this
    }

    emit(eventName, ...args) {
      const listenerList = [...(this.listeners.get(eventName) || [])]
      const onceListenerList = [...(this.onceListeners.get(eventName) || [])]
      this.onceListeners.delete(eventName)
      listenerList.forEach(listener => listener(...args))
      onceListenerList.forEach(listener => listener(...args))
    }

    close() {
      const event = {
        defaultPrevented: false,
        preventDefault: vi.fn(() => {
          event.defaultPrevented = true
        }),
      }
      this.closeEvents.push(event)
      this.emit('close', event)
      if (!event.defaultPrevented) {
        this.destroyed = true
      }
      return event
    }

    show() {}

    minimize() {
      this.minimized = true
    }

    maximize() {}

    restore() {
      this.minimized = false
    }

    setAlwaysOnTop(flag) {
      this.emit('always-on-top-changed', {}, flag)
    }

    isMinimized() {
      return this.minimized
    }

    focus() {}

    isDestroyed() {
      return this.destroyed
    }

    getParentWindow() {
      return null
    }

    loadURL() {
      return Promise.resolve()
    }

    loadFile() {
      return Promise.resolve()
    }
  }

  return {
    app: {
      exit: appExitMock,
    },
    BrowserWindow,
    Notification: {
      isSupported: vi.fn(() => false),
    },
    dialog: {
      showSaveDialogSync: showSaveDialogSyncMock,
    },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({ workAreaSize: { width: 1920, height: 1080 } })),
    },
    shell: {
      openExternal: openExternalMock,
      showItemInFolder: showItemInFolderMock,
    },
  }
})

vi.mock('fs-extra', () => ({
  default: {
    writeFile: writeFileMock,
    readFile: readFileMock,
    pathExists: pathExistsMock,
    stat: statMock,
  },
}))

vi.mock('../../../data/configUtil.js', () => ({
  default: {
    getConfig: getConfigMock,
  },
}))

vi.mock('../../../data/recent.js', () => ({
  default: {
    add: recentAddMock,
  },
}))

vi.mock('../../channel/sendUtil.js', () => ({
  default: {
    send: sendMock,
  },
}))

vi.mock('../../commonUtil.js', () => ({
  default: {
    createId: vi.fn(() => `test-id-${createIdIndex++}`),
    decodeWjUrl: vi.fn(),
  },
}))

vi.mock('../../resourceFileUtil.js', async () => {
  const actual = await vi.importActual('../../resourceFileUtil.js')
  return {
    default: {
      ...actual.default,
      openLocalResourceInFolder: openLocalResourceInFolderMock,
    },
  }
})

vi.mock('../../fileWatchUtil.js', () => ({
  default: {
    createWatchState: createWatchStateMock,
    createContentVersion: createContentVersionMock,
    ignorePendingChange: ignorePendingChangeMock,
    settlePendingChange: settlePendingChangeMock,
    stopWatching: stopWatchingMock,
    startWatching: startWatchingMock,
    markInternalSave: markInternalSaveMock,
  },
}))

vi.mock('../../updateUtil.js', () => ({
  default: {
    checkUpdate: vi.fn(),
  },
}))

const {
  getDocumentSessionRuntime,
  initializeDocumentSessionRuntime,
  resetDocumentSessionRuntime,
} = await import('../documentSessionRuntime.js')
const {
  createDocumentSessionRuntimeComposition,
} = await import('../documentSessionRuntimeComposition.js')
const { default: winInfoUtil } = await import('../windowLifecycleService.js')

function createResettableWindowRegistry() {
  const windowMap = new Map()
  const sessionMap = new Map()

  function normalizeWindowId(windowId) {
    return String(windowId)
  }

  return {
    registerWindow({ windowId, win }) {
      windowMap.set(normalizeWindowId(windowId), win)
      return win
    },
    unregisterWindow(windowId) {
      const normalizedWindowId = normalizeWindowId(windowId)
      sessionMap.delete(normalizedWindowId)
      return windowMap.delete(normalizedWindowId)
    },
    bindSession({ windowId, sessionId }) {
      sessionMap.set(normalizeWindowId(windowId), sessionId)
      return sessionId
    },
    getWindowById(windowId) {
      return windowMap.get(normalizeWindowId(windowId)) || null
    },
    getSessionIdByWindowId(windowId) {
      return sessionMap.get(normalizeWindowId(windowId)) || null
    },
    getAllWindows() {
      return Array.from(windowMap.values())
    },
    reset() {
      windowMap.clear()
      sessionMap.clear()
    },
  }
}

const lifecycleRegistry = createResettableWindowRegistry()

function initializeRuntimeForWindowLifecycleTests() {
  winInfoUtil.configure({
    registry: lifecycleRegistry,
  })
  initializeDocumentSessionRuntime({
    ...createDocumentSessionRuntimeComposition({
      registry: lifecycleRegistry,
      getConfig: () => getConfigMock(),
      recentStore: {
        add: recentAddMock,
        clear: vi.fn(),
        remove: vi.fn(),
        get: vi.fn(() => []),
        setMax: vi.fn(),
      },
      sendToRenderer: (win, payload) => {
        sendMock(win, payload)
      },
      showItemInFolder: showItemInFolderMock,
    }),
    ...winInfoUtil.getDocumentSessionRuntimeHostDeps(),
  })
}

function getWindowId(target) {
  if (typeof target === 'string' || typeof target === 'number') {
    return target
  }
  return target?.id || null
}

async function executeTestCommand(target, command, payload = null) {
  const runtime = getDocumentSessionRuntime()
  const windowId = getWindowId(target)
  if (typeof command === 'string' && command.startsWith('watch.')) {
    return await runtime.dispatch(windowId, command, payload)
  }
  return await runtime.executeUiCommand(windowId, command, payload)
}

async function openDocumentPathThroughRuntime(targetPath, options = {}) {
  return await getDocumentSessionRuntime().openDocumentPath(targetPath, options)
}

function publishRecentListChangedThroughRuntime(recentList) {
  return getDocumentSessionRuntime().publishRecentListChanged(recentList)
}

function listWindowRefs() {
  return winInfoUtil.listWindows().map((win) => {
    const windowId = winInfoUtil.getWindowIdByWin(win)
    return {
      id: windowId,
      win,
    }
  }).filter(windowRef => windowRef.id != null)
}

function getWindowRefById(windowId) {
  const win = winInfoUtil.getWindowById(windowId)
  if (!win) {
    return null
  }

  return {
    id: windowId,
    win,
  }
}

function getWindowRefByWebContentsId(webContentsId) {
  const windowId = winInfoUtil.getWindowIdByWebContentsId(webContentsId)
  return windowId ? getWindowRefById(windowId) : null
}

function expectDocumentContent(target, content) {
  expect(winInfoUtil.getDocumentContext(getWindowId(target)).content).toBe(content)
}

function getCurrentWatchOptions() {
  return startWatchingMock.mock.calls.at(-1)?.[0] || null
}

async function dispatchWatchFileChanged(winInfo, {
  diskContent = '',
  observedAt = 1700000005001,
  bindingToken = null,
  watchingPath = null,
  diskStat = null,
} = {}) {
  const watchOptions = getCurrentWatchOptions()
  return await executeTestCommand(winInfo, 'watch.file-changed', {
    bindingToken: bindingToken ?? watchOptions?.bindingToken ?? null,
    watchingPath: watchingPath ?? watchOptions?.filePath ?? winInfoUtil.getDocumentContext(getWindowId(winInfo)).path ?? null,
    observedAt,
    diskContent,
    diskStat,
  })
}

async function emitWatchMissing(winInfo, error = new Error('ENOENT'), {
  observedAt = 1700000005001,
  bindingToken = null,
  watchingPath = null,
} = {}) {
  const watchOptions = getCurrentWatchOptions()
  return await watchOptions?.onMissing?.(error, {
    bindingToken: bindingToken ?? watchOptions?.bindingToken ?? null,
    watchingPath: watchingPath ?? watchOptions?.filePath ?? winInfoUtil.getDocumentContext(getWindowId(winInfo)).path ?? null,
    observedAt,
  })
}

async function emitWatchRestored(winInfo, diskContent, {
  observedAt = 1700000005001,
  bindingToken = null,
  watchingPath = null,
  diskStat = null,
} = {}) {
  const watchOptions = getCurrentWatchOptions()
  return await watchOptions?.onRestored?.(diskContent, {
    bindingToken: bindingToken ?? watchOptions?.bindingToken ?? null,
    watchingPath: watchingPath ?? watchOptions?.filePath ?? winInfoUtil.getDocumentContext(getWindowId(winInfo)).path ?? null,
    observedAt,
    diskStat,
  })
}

describe('windowLifecycleService 生命周期 facade', () => {
  beforeEach(() => {
    for (const winInfo of [...listWindowRefs()]) {
      winInfoUtil.deleteEditorWin(winInfo.id)
    }
    resetDocumentSessionRuntime()
    lifecycleRegistry.reset()
    sendMock.mockReset()
    writeFileMock.mockReset()
    readFileMock.mockReset()
    pathExistsMock.mockReset()
    statMock.mockReset()
    showSaveDialogSyncMock.mockReset()
    openExternalMock.mockReset()
    showItemInFolderMock.mockReset()
    openLocalResourceInFolderMock.mockReset()
    recentAddMock.mockReset()
    createWatchStateMock.mockReset()
    startWatchingMock.mockReset()
    stopWatchingMock.mockReset()
    markInternalSaveMock.mockReset()
    createContentVersionMock.mockClear()
    ignorePendingChangeMock.mockReset()
    settlePendingChangeMock.mockReset()
    appExitMock.mockReset()
    getConfigMock.mockReset()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: [], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(false)
    statMock.mockResolvedValue({
      isFile: () => true,
    })
    readFileMock.mockResolvedValue('')
    writeFileMock.mockResolvedValue(undefined)
    browserWindowInstances.length = 0
    webContentsId = 1
    initializeRuntimeForWindowLifecycleTests()
  })

  it('公共 winInfo facade 导出必须删除，只保留显式 windowId 查询接口', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    const createdWindowId = await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    const winInfoById = getWindowRefById(winInfo.id)
    const winInfoByWebContentsId = getWindowRefByWebContentsId(winInfo.win.webContents.id)
    const hostDeps = winInfoUtil.getDocumentSessionRuntimeHostDeps()

    expect(listWindowRefs()).toHaveLength(1)
    expect(createdWindowId).toBe(winInfo.id)
    expect(winInfoById).toMatchObject({
      id: winInfo.id,
      win: winInfo.win,
    })
    expect(winInfoByWebContentsId).toEqual(winInfoById)
    expect(winInfoUtil.getWindowById(winInfo.id)).toBe(winInfo.win)
    expect(winInfoUtil.getWindowIdByWebContentsId(winInfo.win.webContents.id)).toBe(winInfo.id)
    expect(hostDeps.getWindowContext).toBeUndefined()
    expect(hostDeps.getWindowById(winInfo.id)).toBe(winInfo.win)
    expect(winInfoUtil.getAllWindowInfoFacades).toBeUndefined()
    expect(winInfoUtil.windowInfoFacadeMap).toBeUndefined()
    expect(winInfoUtil.createWindowInfoFacade).toBeUndefined()
    expect(winInfoUtil.ensureWindowInfoFacade).toBeUndefined()
    expect(winInfoUtil.getWinInfo).toBeUndefined()
    expect(winInfoUtil.getAll).toBeUndefined()
    expect(winInfoUtil.getByWebContentsId).toBeUndefined()
    expect(Object.keys(winInfoUtil)).not.toEqual(expect.arrayContaining([
      'getAllWindowInfoFacades',
      'windowInfoFacadeMap',
      'createWindowInfoFacade',
      'ensureWindowInfoFacade',
      'getWinInfo',
      'getAll',
      'getByWebContentsId',
    ]))
  })

  it('runtime host deps 构造 effectContext 时，必须只暴露显式 controller，不再暴露旧聚合宿主字段', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    const dispatchCommand = vi.fn()
    const hostDeps = winInfoUtil.getDocumentSessionRuntimeHostDeps()
    const effectContext = hostDeps.buildRunnerEffectContext({
      windowId: winInfo.id,
      dispatchCommand,
    })

    expect(effectContext).toEqual(expect.objectContaining({
      dispatchCommand,
      closeHostController: expect.objectContaining({
        requestForceClose: expect.any(Function),
        continueWindowClose: expect.any(Function),
        finalizeWindowClose: expect.any(Function),
        getClosedManualRequestCompletions: expect.any(Function),
      }),
      externalWatchController: expect.objectContaining({
        start: expect.any(Function),
        stop: expect.any(Function),
        getContext: expect.any(Function),
        markInternalSave: expect.any(Function),
        settlePendingChange: expect.any(Function),
        ignorePendingChange: expect.any(Function),
      }),
      windowMessageController: expect.objectContaining({
        publishWindowMessage: expect.any(Function),
        publishSnapshotChanged: expect.any(Function),
      }),
    }))
    expect(effectContext).not.toHaveProperty('winInfo')
    expect(effectContext).not.toHaveProperty('continueWindowClose')
    expect(effectContext).not.toHaveProperty('showWindowMessage')
    expect(effectContext).not.toHaveProperty('externalWatchBridge')
    expect(effectContext).not.toHaveProperty('getExternalWatchContext')
  })

  it('requestForceClose 必须先只标记强制关闭状态，真正 close 仍由宿主显式触发', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()

    expect(winInfoUtil.requestForceClose(winInfo.id)).toBe(true)
    expect(winInfo.win.closeEvents).toHaveLength(0)
    expect(listWindowRefs()).toHaveLength(1)

    const closeEvent = winInfo.win.close()
    expect(closeEvent.preventDefault).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(listWindowRefs()).toHaveLength(0)
    })
  })

  it('只读窗口查询接口必须只暴露窗口对象、窗口身份和文档上下文，不带 facade 宿主状态', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    const windowId = winInfo.id
    const win = winInfo.win

    expect(winInfoUtil.getWindowById(windowId)).toBe(win)
    expect(winInfoUtil.listWindows()).toEqual([win])
    expect(winInfoUtil.getWindowIdByWin(win)).toBe(windowId)
    expect(winInfoUtil.getWindowIdByWebContentsId(win.webContents.id)).toBe(windowId)
    expect(winInfoUtil.getDocumentContext(windowId)).toEqual(expect.objectContaining({
      path: 'D:/demo.md',
    }))
    expect(winInfoUtil.getWindowById(windowId)).not.toHaveProperty('sessionId')
    expect(winInfoUtil.getWindowById(windowId)).not.toHaveProperty('forceClose')
    expect(winInfoUtil.getWindowById(windowId)).not.toHaveProperty('externalWatch')
    expect(winInfoUtil.getDocumentContext(windowId)).not.toHaveProperty('sessionId')
    expect(winInfoUtil.getDocumentContext(windowId)).not.toHaveProperty('forceClose')
    expect(winInfoUtil.getDocumentContext(windowId)).not.toHaveProperty('externalWatch')
  })

  it('getDocumentContext 不能让展开后的 facade clone 通过 live win 回溯到真实上下文', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    expect(winInfoUtil.getDocumentContext({ ...winInfo })).toEqual({
      path: null,
      exists: false,
      content: '',
      saved: false,
      fileName: 'Unnamed',
    })
  })

  it('getDocumentContext 不能让仅包一层 live win 的 wrapper 回溯到真实上下文', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()

    expect(winInfoUtil.getDocumentContext({ win: winInfo.win })).toEqual({
      path: null,
      exists: false,
      content: '',
      saved: false,
      fileName: 'Unnamed',
    })
  })

  it('getDocumentContext 兼容层必须回到 live identity，已脱离 registry 的旧对象不能继续绕过 registry', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()

    lifecycleRegistry.unregisterWindow(winInfo.id)

    expect(winInfoUtil.getDocumentContext(winInfo.id)).toEqual({
      path: null,
      exists: false,
      content: '',
      saved: false,
      fileName: 'Unnamed',
    })

    expect(winInfoUtil.deleteEditorWin(winInfo.id)).toBe(true)
  })

  it('registry 已移除窗口映射后，lifecycle 查询必须立即视为窗口不存在，即使宿主状态尚未清理', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()

    lifecycleRegistry.unregisterWindow(winInfo.id)

    expect(listWindowRefs()).toHaveLength(0)
    expect(getWindowRefById(winInfo.id)).toBeNull()
    expect(getWindowRefByWebContentsId(winInfo.win.webContents.id)).toBeNull()

    expect(winInfoUtil.deleteEditorWin(winInfo.id)).toBe(true)
  })

  it('window.blur 触发自动保存时，必须复用统一保存管线且不发送成功提示', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValueOnce(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# blur 自动保存内容')
    winInfo.win.emit('blur')

    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# blur 自动保存内容')
    })

    saveDeferred.resolve()
    await saveDeferred.promise
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# blur 自动保存内容')
    })
    const snapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')
    expect(snapshot.content).toBe('# blur 自动保存内容')
    expect(snapshot.saved).toBe(true)
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'message'
      && call[1]?.data?.type === 'success')).toBe(false)
  })

  it('关闭请求命中 autoSave=close 且已有有效路径时，应走统一保存管线并在成功后关闭窗口', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValueOnce(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 关闭前自动保存内容')

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 关闭前自动保存内容')
    })
    expect(listWindowRefs()).toHaveLength(1)

    saveDeferred.resolve()
    await saveDeferred.promise
    await vi.waitFor(() => {
      expect(winInfo.win.closeEvents).toHaveLength(2)
      expect(listWindowRefs()).toHaveLength(0)
    })
  })

  it('close-auto-save 成功关闭窗口后，不得再次 startWatching', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    startWatchingMock.mockClear()
    stopWatchingMock.mockClear()
    winInfoUtil.updateTempContent(winInfo.id, '# 关闭前自动保存内容')

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(listWindowRefs()).toHaveLength(0)
    })
    expect(stopWatchingMock).toHaveBeenCalled()
    expect(startWatchingMock).not.toHaveBeenCalled()
  })

  it('关闭链路命中草稿首次保存且 dialog.save-target-cancelled 时，必须直接取消关闭流程并保持窗口打开', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    showSaveDialogSyncMock.mockReturnValueOnce(undefined)

    await winInfoUtil.createNew(null)

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 草稿内容')

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(showSaveDialogSyncMock).toHaveBeenCalledTimes(1)
    })
    expect(writeFileMock).not.toHaveBeenCalled()
    expect(listWindowRefs()).toHaveLength(1)
    expect(winInfoUtil.getDocumentContext(winInfo.id).path).toBeNull()
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'unsaved')).toBe(false)
  })

  it('关闭链路命中未保存变更时，必须只通过 snapshot.closePrompt 推送关闭确认，不能再发送 unsaved 事件', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: [], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 未保存内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 未保存内容')
    })
    sendMock.mockClear()

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'unsaved')).toBe(false)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'document.snapshot.changed',
      data: expect.objectContaining({
        closePrompt: expect.objectContaining({
          visible: true,
          reason: 'unsaved-changes',
        }),
      }),
    })
    expect(listWindowRefs()).toHaveLength(1)
  })

  it('关闭确认继续链路只有在既有 continue path 才允许 allowImmediateClose 置位', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: [], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 未保存内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 未保存内容')
    })

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)

    const originalClose = winInfo.win.close
    winInfo.win.close = vi.fn()

    await executeTestCommand(winInfo, 'document.confirm-force-close')

    expect(winInfo.win.close).toHaveBeenCalledTimes(1)

    winInfo.win.close = originalClose
    const immediateCloseEvent = winInfo.win.close()
    expect(immediateCloseEvent.preventDefault).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(listWindowRefs()).toHaveLength(0)
    })
  })

  it('document.save 在草稿首存成功时，必须只走一次标准选路并正确写入会话路径', async () => {
    showSaveDialogSyncMock.mockReturnValueOnce('D:/draft.md')

    await winInfoUtil.createNew(null)

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 草稿内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 草稿内容')
    })
    sendMock.mockClear()

    const saveResult = await executeTestCommand(winInfo, 'document.save')

    expect(showSaveDialogSyncMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledWith('D:/draft.md', '# 草稿内容')
    expect(saveResult).toBe(true)
    expect(winInfoUtil.getDocumentContext(winInfo.id).path).toBe('D:/draft.md')
    expectDocumentContent(winInfo, '# 草稿内容')
    const snapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')
    expect(snapshot.content).toBe('# 草稿内容')
    expect(snapshot.saved).toBe(true)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'success',
        content: 'message.saveSuccessfully',
      },
    })
  })

  it('document.save 在真实写盘成功后必须返回 true，而不是 effects 执行前的旧快照结果', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 已保存的新内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 已保存的新内容')
    })

    const saveResult = await executeTestCommand(winInfo, 'document.save')

    expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 已保存的新内容')
    expect(saveResult).toBe(true)
  })

  it('首次保存写盘成功后即使 watcher 绑定失败，save 也必须返回成功，并把失败标准化成告警', async () => {
    showSaveDialogSyncMock.mockReturnValueOnce('D:/draft.md')
    startWatchingMock.mockImplementationOnce(() => {
      throw new Error('watch bind failed')
    })

    await winInfoUtil.createNew(null)

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 草稿内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 草稿内容')
    })
    sendMock.mockClear()

    await expect(executeTestCommand(winInfo, 'document.save')).resolves.toBe(true)

    expect(writeFileMock).toHaveBeenCalledWith('D:/draft.md', '# 草稿内容')
    expect(winInfoUtil.getDocumentContext(winInfo.id).path).toBe('D:/draft.md')
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'warning',
        content: 'message.fileExternalChangeReadFailed',
      },
    })
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'success',
        content: 'message.saveSuccessfully',
      },
    })
  })

  it('blur-auto-save 进行中按 Ctrl+S 时，document.save 必须等待当前保存链路完成并返回手动保存成功', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValueOnce(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# blur 自动保存内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# blur 自动保存内容')
    })

    winInfo.win.emit('blur')
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# blur 自动保存内容')
    })

    sendMock.mockClear()
    let saveResolved = false
    const manualSavePromise = executeTestCommand(winInfo, 'document.save').then((result) => {
      saveResolved = true
      return result
    })

    await Promise.resolve()
    expect(saveResolved).toBe(false)

    saveDeferred.resolve()
    await saveDeferred.promise

    const saveResult = await manualSavePromise

    expect(saveResult).toBe(true)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'success',
        content: 'message.saveSuccessfully',
      },
    })
  })

  it('close-auto-save 进行中按 Ctrl+S 时，manual request 也必须绑定当前保存链路并返回成功', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValueOnce(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# close 自动保存内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# close 自动保存内容')
    })

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# close 自动保存内容')
    })

    sendMock.mockClear()
    const manualSavePromise = executeTestCommand(winInfo, 'document.save')

    saveDeferred.resolve()
    await saveDeferred.promise

    const saveResult = await manualSavePromise

    expect(saveResult).toBe(true)
    expect(listWindowRefs()).toHaveLength(0)
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'window.effect.message')).toBe(false)
  })

  it('挂靠中的 Ctrl+S 只能等待自己绑定的那条保存链路，不能被后续新的 auto-save 抢走结果', async () => {
    const firstSaveDeferred = createDeferred()
    const secondSaveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock
      .mockReturnValueOnce(firstSaveDeferred.promise)
      .mockReturnValueOnce(secondSaveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 第一版内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 第一版内容')
    })

    winInfo.win.emit('blur')
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 第一版内容')
    })

    sendMock.mockClear()
    const manualSavePromise = executeTestCommand(winInfo, 'document.save')

    firstSaveDeferred.resolve()
    await firstSaveDeferred.promise

    winInfoUtil.updateTempContent(winInfo.id, '# 第二版内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 第二版内容')
    })
    winInfo.win.emit('blur')
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(2)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 第二版内容')
    })

    const saveResult = await Promise.race([
      manualSavePromise,
      new Promise(resolve => setTimeout(() => resolve('timeout'), 80)),
    ])

    expect(saveResult).toBe(true)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'success',
        content: 'message.saveSuccessfully',
      },
    })

    secondSaveDeferred.resolve()
    await secondSaveDeferred.promise
  })

  it('manual request 超过 10 秒仍未完成时，必须继续等待自己的 request 完成，不能提前误报成功或失败', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValueOnce(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 尚未落盘的内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 尚未落盘的内容')
    })

    winInfo.win.emit('blur')
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 尚未落盘的内容')
    })

    sendMock.mockClear()
    vi.useFakeTimers()

    try {
      let saveResolved = false
      const manualSavePromise = executeTestCommand(winInfo, 'document.save').then((result) => {
        saveResolved = true
        return result
      })
      await Promise.resolve()

      // 在 manual request 还没真正完成时，把当前编辑区改回磁盘版本，
      // 当前全局快照会重新变成 saved=true；这正是旧实现会误报成功的场景。
      await executeTestCommand(winInfo, 'document.edit', {
        content: '# 原始内容',
      })

      await vi.advanceTimersByTimeAsync(10010)
      expect(saveResolved).toBe(false)
      expect(sendMock).not.toHaveBeenCalledWith(winInfo.win, {
        event: 'window.effect.message',
        data: {
          type: 'success',
          content: 'message.saveSuccessfully',
        },
      })

      saveDeferred.resolve()
      await saveDeferred.promise
      await vi.advanceTimersByTimeAsync(20)

      const saveResult = await manualSavePromise
      expect(saveResult).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('外部冲突仍未决时，即使 manual-save 命中 no-op，也不能提示保存成功', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 本地编辑内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 本地编辑内容')
    })

    getConfigMock.mockReturnValue({
      language: 'zh-CN',
      autoSave: [],
      startPage: 'editor',
      externalFileChangeStrategy: 'prompt',
    })
    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容',
      observedAt: 1700000005001,
    })

    await executeTestCommand(winInfo, 'document.edit', {
      content: '# 外部新内容',
    })
    sendMock.mockClear()

    const saveResult = await executeTestCommand(winInfo, 'document.save')
    const snapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')

    expect(writeFileMock).not.toHaveBeenCalled()
    expect(snapshot.externalPrompt).toEqual({
      visible: true,
      version: 1,
      localContent: '# 外部新内容',
      externalContent: '# 外部新内容',
      fileName: 'demo.md',
    })
    expect(saveResult).toBe(false)
    expect(sendMock).not.toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'success',
        content: 'message.saveSuccessfully',
      },
    })
  })

  it('pending external change 在 save.succeeded 同轮被 reconcile 成 noop 时，manual-save 仍必须返回成功', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValueOnce(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 本地保存版本')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 本地保存版本')
    })

    winInfo.win.emit('blur')
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 本地保存版本')
    })

    sendMock.mockClear()
    const manualSavePromise = executeTestCommand(winInfo, 'document.save')

    getConfigMock.mockReturnValue({
      language: 'zh-CN',
      autoSave: ['blur'],
      startPage: 'editor',
      externalFileChangeStrategy: 'prompt',
    })
    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部版本',
      observedAt: 1700000005001,
    })
    await executeTestCommand(winInfo, 'document.edit', {
      content: '# 外部版本',
    })

    saveDeferred.resolve()
    await saveDeferred.promise

    const saveResult = await manualSavePromise
    const snapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')

    expect(saveResult).toBe(true)
    expect(snapshot.externalPrompt).toBeNull()
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'success',
        content: 'message.saveSuccessfully',
      },
    })
  })

  it('manual-save 写盘失败时，即使当前正文又回到磁盘版本，也不能误报成功', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValueOnce(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 待保存的新内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 待保存的新内容')
    })

    winInfo.win.emit('blur')
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 待保存的新内容')
    })

    sendMock.mockClear()
    const manualSavePromise = executeTestCommand(winInfo, 'document.save')

    await executeTestCommand(winInfo, 'document.edit', {
      content: '# 原始内容',
    })

    saveDeferred.reject(new Error('磁盘已满'))
    await expect(manualSavePromise).resolves.toBe(false)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'error',
        content: '保存失败。 磁盘已满',
      },
    })
    expect(sendMock).not.toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'success',
        content: 'message.saveSuccessfully',
      },
    })
  })

  it('草稿首存写盘失败时，只能提示保存失败，不能再追加取消保存提示', async () => {
    writeFileMock.mockRejectedValueOnce(new Error('磁盘已满'))
    showSaveDialogSyncMock.mockReturnValueOnce('D:/draft-save-failed.md')

    await winInfoUtil.createNew(null)

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 待保存内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 待保存内容')
    })
    sendMock.mockClear()

    const saveResult = await executeTestCommand(winInfo, 'document.save')

    expect(saveResult).toBe(false)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'error',
        content: '保存失败。 磁盘已满',
      },
    })
    expect(sendMock).not.toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'warning',
        content: 'message.cancelSave',
      },
    })
  })

  it('save-copy 命中 same-path 时，compat 提示不能误报另存为成功', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    showSaveDialogSyncMock.mockReturnValueOnce('D:/demo.md')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    sendMock.mockClear()

    await executeTestCommand(winInfo, 'document.save-copy')

    expect(sendMock).not.toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'success',
        content: 'message.saveAsSuccessfully',
      },
    })
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'warning',
        content: '另存为失败，副本路径不能与当前文档相同。',
      },
    })
  })

  it('document.save-copy 成功后，必须提示另存为成功且不改写当前会话路径', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    showSaveDialogSyncMock.mockReturnValueOnce('D:/copy.md')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 副本内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 副本内容')
    })
    sendMock.mockClear()

    const copySaveResult = await executeTestCommand(winInfo, 'document.save-copy')

    expect(writeFileMock).toHaveBeenCalledWith('D:/copy.md', '# 副本内容')
    expect(copySaveResult).toEqual(expect.objectContaining({
      copySaveRequestId: expect.any(String),
      snapshot: expect.objectContaining({
        content: '# 副本内容',
        saved: false,
      }),
      effects: [
        expect.objectContaining({
          type: 'open-copy-dialog',
          requestId: expect.any(String),
        }),
      ],
    }))
    expect(copySaveResult.copySaveRequestId).toBe(copySaveResult.effects[0].requestId)
    expect(winInfoUtil.getDocumentContext(winInfo.id).path).toBe('D:/demo.md')
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'success',
        content: 'message.saveAsSuccessfully',
      },
    })
  })

  it('save-copy 真正写盘失败时，compat 层必须给出失败提示，不能静默结束', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    showSaveDialogSyncMock.mockReturnValueOnce('D:/copy-failed.md')
    writeFileMock.mockRejectedValueOnce(new Error('设备不可用'))

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    sendMock.mockClear()

    await executeTestCommand(winInfo, 'document.save-copy')

    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'error',
        content: '另存为失败。 设备不可用',
      },
    })
    expect(sendMock).not.toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'success',
        content: 'message.saveAsSuccessfully',
      },
    })
  })

  it('dialog.open-target-selected 命中非 .md 文件时，必须拦截并给出 warning，不能继续打开', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    sendMock.mockClear()

    const result = await executeTestCommand(winInfo, 'dialog.open-target-selected', {
      path: 'D:/plain.txt',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-invalid-extension',
      path: 'D:/plain.txt',
    })
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'warning',
        content: 'message.onlyMarkdownFilesCanBeOpened',
      },
    })
    expect(listWindowRefs()).toHaveLength(1)
    expect(winInfoUtil.getDocumentContext(winInfo.id).path).toBe('D:/demo.md')
  })

  it('watch.file-missing 只能通过 snapshot 推送最新 exists=false 与 saved=false，不能再发送 legacy file-missing / file-is-saved', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    sendMock.mockClear()

    await emitWatchMissing(winInfo)
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-is-saved')).toBe(false)
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-missing')).toBe(false)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'info',
        content: expect.stringContaining('路径：D:/demo.md'),
      },
    })
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'document.snapshot.changed',
      data: expect.objectContaining({
        exists: false,
        saved: false,
      }),
    })
  })

  it('watch.file-missing 被接受后，必须把 watcher 历史去重状态清到安全值，避免恢复首轮被旧状态污染', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    const watchState = getCurrentWatchOptions()?.state

    watchState.recentInternalSaves = [{
      versionHash: 'same-hash',
      savedAt: Date.now(),
    }]
    watchState.lastInternalSaveAt = Date.now()
    watchState.lastInternalSavedVersion = 'same-hash'
    watchState.lastHandledVersionHash = 'same-hash'
    watchState.pendingChange = {
      version: 'pending-1',
      versionHash: 'same-hash',
      content: '# 原始内容',
    }

    await emitWatchMissing(winInfo)

    expect(watchState.recentInternalSaves).toEqual([])
    expect(watchState.lastInternalSaveAt).toBe(0)
    expect(watchState.lastInternalSavedVersion).toBeNull()
    expect(watchState.lastHandledVersionHash).toBeNull()
    expect(watchState.pendingChange).toBeNull()
  })

  it('watch.file-changed 在 strategy=apply 时，只能通过 snapshot 收敛，不应再发送 file-content-reloaded / file-is-saved', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    getConfigMock.mockReturnValue({
      language: 'zh-CN',
      autoSave: [],
      startPage: 'editor',
      externalFileChangeStrategy: 'apply',
    })

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 本地编辑内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 本地编辑内容')
    })
    sendMock.mockClear()

    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容',
      observedAt: 1700000005001,
    })

    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-is-saved')).toBe(false)
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-content-reloaded')).toBe(false)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'info',
        content: 'message.fileExternalChangeAutoApplied',
      },
    })
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'document.snapshot.changed',
      data: expect.objectContaining({
        content: '# 外部新内容',
        exists: true,
        saved: true,
      }),
    })
  })

  it('watch.file-changed 在 strategy=prompt 时，只能通过 snapshot.externalPrompt 推送冲突，不能再发送 file-external-changed', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    getConfigMock.mockReturnValue({
      language: 'zh-CN',
      autoSave: [],
      startPage: 'editor',
      externalFileChangeStrategy: 'prompt',
    })

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 本地编辑内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 本地编辑内容')
    })
    sendMock.mockClear()

    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容',
      observedAt: 1700000005001,
    })

    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-external-changed')).toBe(false)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'info',
        content: expect.stringContaining('检测到文件被外部修改，请返回编辑器查看并处理。'),
      },
    })
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'document.snapshot.changed',
      data: expect.objectContaining({
        externalPrompt: expect.objectContaining({
          fileName: 'demo.md',
          version: 1,
          localContent: '# 本地编辑内容',
          externalContent: '# 外部新内容',
        }),
      }),
    })
  })

  it('watch.file-changed 在 strategy=prompt 时，必须把 pendingExternalChange 写回 session 快照，供 renderer 改走 externalPrompt 真相', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    getConfigMock.mockReturnValue({
      language: 'zh-CN',
      autoSave: [],
      startPage: 'editor',
      externalFileChangeStrategy: 'prompt',
    })

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 本地编辑内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 本地编辑内容')
    })

    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容',
      observedAt: 1700000005001,
    })

    const snapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')

    expect(snapshot.externalPrompt).toEqual({
      visible: true,
      version: 1,
      localContent: '# 本地编辑内容',
      externalContent: '# 外部新内容',
      fileName: 'demo.md',
    })
  })

  it('旧弹窗已经打开时，如果又来了新的外部版本，snapshot.externalPrompt 必须更新为最新 diff，且不能再发送 file-external-changed', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    getConfigMock.mockReturnValue({
      language: 'zh-CN',
      autoSave: [],
      startPage: 'editor',
      externalFileChangeStrategy: 'prompt',
    })

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 本地编辑内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 本地编辑内容')
    })

    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容 1',
      observedAt: 1700000005001,
    })
    sendMock.mockClear()

    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容 2',
      observedAt: 1700000005002,
    })

    const snapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')

    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-external-changed')).toBe(false)
    expect(snapshot.externalPrompt).toEqual({
      visible: true,
      version: 2,
      localContent: '# 本地编辑内容',
      externalContent: '# 外部新内容 2',
      fileName: 'demo.md',
    })
  })

  it('document.external.apply / document.external.ignore 必须通过统一命令入口消费当前 prompt，并让 snapshot.externalPrompt 正确收敛', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    getConfigMock.mockReturnValue({
      language: 'zh-CN',
      autoSave: [],
      startPage: 'editor',
      externalFileChangeStrategy: 'prompt',
    })

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 本地编辑内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 本地编辑内容')
    })

    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容 1',
      observedAt: 1700000005001,
    })

    const ignored = await executeTestCommand(winInfo, 'document.external.ignore', {
      version: 1,
    })

    expect(ignored.snapshot.externalPrompt).toBeNull()
    expect(ignored.snapshot.content).toBe('# 本地编辑内容')

    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容 2',
      observedAt: 1700000005002,
    })

    const applied = await executeTestCommand(winInfo, 'document.external.apply', {
      version: 2,
    })

    expect(applied.snapshot.externalPrompt).toBeNull()
    expect(applied.snapshot.content).toBe('# 外部新内容 2')
    expect(applied.snapshot.saved).toBe(true)
  })

  it('document.external.apply / document.external.ignore 遇到 stale version 时，必须 no-op，且不能误清当前 prompt', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    getConfigMock.mockReturnValue({
      language: 'zh-CN',
      autoSave: [],
      startPage: 'editor',
      externalFileChangeStrategy: 'prompt',
    })

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 本地编辑内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 本地编辑内容')
    })

    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容 1',
      observedAt: 1700000005001,
    })
    await executeTestCommand(winInfo, 'document.external.ignore', {
      version: 1,
    })
    ignorePendingChangeMock.mockClear()
    settlePendingChangeMock.mockClear()

    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容 2',
      observedAt: 1700000005002,
    })

    const staleIgnored = await executeTestCommand(winInfo, 'document.external.ignore', {
      version: 1,
    })
    const staleApplied = await executeTestCommand(winInfo, 'document.external.apply', {
      version: 1,
    })
    const snapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')

    expect(staleIgnored.snapshot.externalPrompt).toEqual({
      visible: true,
      version: 2,
      localContent: '# 本地编辑内容',
      externalContent: '# 外部新内容 2',
      fileName: 'demo.md',
    })
    expect(staleApplied.snapshot.externalPrompt).toEqual({
      visible: true,
      version: 2,
      localContent: '# 本地编辑内容',
      externalContent: '# 外部新内容 2',
      fileName: 'demo.md',
    })
    expect(snapshot.externalPrompt).toEqual({
      visible: true,
      version: 2,
      localContent: '# 本地编辑内容',
      externalContent: '# 外部新内容 2',
      fileName: 'demo.md',
    })
    expect(ignorePendingChangeMock).not.toHaveBeenCalled()
    expect(settlePendingChangeMock).not.toHaveBeenCalled()
  })

  it('外部冲突如果已经被用户本地内容自行消解，watch.file-changed 必须把过期 externalPrompt 收敛掉', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    getConfigMock.mockReturnValue({
      language: 'zh-CN',
      autoSave: [],
      startPage: 'editor',
      externalFileChangeStrategy: 'prompt',
    })

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 本地编辑内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 本地编辑内容')
    })

    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容',
      observedAt: 1700000005001,
    })

    winInfoUtil.updateTempContent(winInfo.id, '# 外部新内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 外部新内容')
    })

    await dispatchWatchFileChanged(winInfo, {
      diskContent: '# 外部新内容',
      observedAt: 1700000005002,
    })
    const snapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')

    expect(snapshot.saved).toBe(true)
    expect(snapshot.externalPrompt).toBeNull()
  })

  it('live watcher 的 onExternalChange 必须走统一命令流，过期 bindingToken 不能污染当前会话', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    const watchOptions = startWatchingMock.mock.calls[0][0]
    winInfoUtil.updateTempContent(winInfo.id, '# 本地编辑内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 本地编辑内容')
    })
    sendMock.mockClear()

    // 这里显式喂一个非当前 bindingToken 的 live 事件，
    // 只有真正接入 watchCoordinator 后，事件才会被 token 守卫丢弃。
    watchOptions.onExternalChange?.({
      version: 1,
      versionHash: 'stale-hash',
      content: '# 旧 watcher 迟到内容',
    }, {
      bindingToken: (watchOptions.bindingToken || 0) + 1,
      watchingPath: 'D:/demo.md',
      observedAt: 1700000005001,
    })

    const snapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')
    expect(snapshot.content).toBe('# 本地编辑内容')
    expect(snapshot.externalPrompt).toBeNull()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('live watcher 的 onMissing 必须走统一命令流，迟到 observedAt 不能把当前文档误打成 missing', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    const watchOptions = startWatchingMock.mock.calls[0][0]

    // 先用一条当前 token 的有效事件把 event floor 推到更高水位，
    // 随后的 live missing 如果还是旧 observedAt，就必须被统一状态机丢弃。
    await executeTestCommand(winInfo, 'watch.file-changed', {
      bindingToken: watchOptions.bindingToken,
      observedAt: 1700000005010,
      diskContent: '# 原始内容',
      diskStat: {
        mtimeMs: 1700000005010,
      },
    })
    sendMock.mockClear()

    watchOptions.onMissing?.(new Error('ENOENT'), {
      bindingToken: watchOptions.bindingToken,
      watchingPath: 'D:/demo.md',
      observedAt: 1700000005010,
    })

    const snapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')
    expect(snapshot.exists).toBe(true)
    expect(snapshot.saved).toBe(true)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('live watcher 的 onRestored 必须走统一命令流，过期 bindingToken 不能把 missing 会话错误恢复', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    const watchOptions = startWatchingMock.mock.calls[0][0]

    await emitWatchMissing(winInfo, new Error('ENOENT'), {
      observedAt: 1700000005001,
    })
    sendMock.mockClear()

    await watchOptions.onRestored?.('# 旧 watcher 的恢复内容', {
      bindingToken: (watchOptions.bindingToken || 0) + 1,
      watchingPath: 'D:/demo.md',
      observedAt: 1700000005020,
    })

    const snapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')
    expect(snapshot.exists).toBe(false)
    expect(snapshot.saved).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('恢复链路 onRestored 使用传入的 diskContent 更新当前会话的 exists/content/saved 投影', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()

    winInfoUtil.updateTempContent(winInfo.id, '# 恢复后的磁盘内容')
    await vi.waitFor(() => {
      expectDocumentContent(winInfo, '# 恢复后的磁盘内容')
    })

    await emitWatchMissing(winInfo, new Error('ENOENT'), {
      observedAt: 1700000005001,
    })
    const missingSnapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')
    expect(missingSnapshot.exists).toBe(false)

    await emitWatchRestored(winInfo, '# 恢复后的磁盘内容', {
      observedAt: 1700000005002,
    })

    const restoredSnapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')
    expect(restoredSnapshot.exists).toBe(true)
    expect(restoredSnapshot.content).toBe('# 恢复后的磁盘内容')
    expect(restoredSnapshot.saved).toBe(true)
  })

  it('缺失后恢复时，即使恢复内容与之前 internal-save / handled 版本 hash 相同，也不能停在 exists=true 但磁盘基线仍缺失的不一致态', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    const sameHash = 'same-hash'
    const watchState = getCurrentWatchOptions()?.state

    watchState.recentInternalSaves = [{
      versionHash: sameHash,
      savedAt: Date.now(),
    }]
    watchState.lastInternalSaveAt = Date.now()
    watchState.lastInternalSavedVersion = sameHash
    watchState.lastHandledVersionHash = sameHash

    await emitWatchMissing(winInfo, new Error('ENOENT'), {
      observedAt: 1700000005001,
    })
    await emitWatchRestored(winInfo, '# 原始内容', {
      observedAt: 1700000005002,
    })

    const restoredSnapshot = await executeTestCommand(winInfo, 'document.get-session-snapshot')
    expect(restoredSnapshot.exists).toBe(true)
    expect(restoredSnapshot.content).toBe('# 原始内容')
    expect(restoredSnapshot.saved).toBe(true)
  })

  it('缺失后恢复时，即使后续 change 被 internal-save / handled 去重吞掉，也必须立刻推送最新 snapshot 清掉缺失态', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()

    await emitWatchMissing(winInfo, new Error('ENOENT'), {
      observedAt: 1700000005001,
    })
    sendMock.mockClear()

    await emitWatchRestored(winInfo, '# 原始内容', {
      observedAt: 1700000005002,
    })

    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'document.snapshot.changed',
      data: expect.objectContaining({
        exists: true,
        content: '# 原始内容',
        saved: true,
      }),
    })
  })

  it('watcher onError 触发后，必须走 watch.error 命令流并自动发起重绑，而不是只发 legacy warning', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    const watchOptions = startWatchingMock.mock.calls[0][0]
    sendMock.mockClear()

    watchOptions.onError?.(new Error('watch crashed'), {
      bindingToken: 0,
      watchingPath: 'D:/demo.md',
      observedAt: 1700000004001,
    })

    await vi.waitFor(() => {
      expect(startWatchingMock).toHaveBeenCalledTimes(2)
    })

    const initialWatchOptions = startWatchingMock.mock.calls[0][0]
    const reboundWatchOptions = startWatchingMock.mock.calls[1][0]

    expect(reboundWatchOptions).toEqual(expect.objectContaining({
      filePath: 'D:/demo.md',
      bindingToken: expect.any(Number),
    }))
    expect(reboundWatchOptions.bindingToken).not.toBe(initialWatchOptions.bindingToken)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'warning',
        content: 'message.fileExternalChangeReadFailed',
      },
    })
    expect(sendMock.mock.calls.filter(call => call[1]?.event === 'window.effect.message')).toHaveLength(1)
  })

  it('force-close 会走 confirm-force-close 语义，直接关闭窗口且不再启动保存', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    winInfoUtil.updateTempContent(winInfo.id, '# 尚未保存内容')
    expect(winInfoUtil.requestForceClose(winInfo.id)).toBe(true)

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).not.toHaveBeenCalled()
    expect(writeFileMock).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(listWindowRefs()).toHaveLength(0)
    })
  })

  it('多窗口按关闭顺序退出时，必须把最后关闭的文档重新顶到 recent 顶部', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockImplementation(async targetPath => `# ${targetPath}`)

    await winInfoUtil.createNew('D:/first.md')
    await winInfoUtil.createNew('D:/second.md')

    const [firstWinInfo, secondWinInfo] = listWindowRefs()
    recentAddMock.mockClear()

    secondWinInfo.win.close()
    await vi.waitFor(() => {
      expect(listWindowRefs()).toHaveLength(1)
    })
    expect(recentAddMock).toHaveBeenNthCalledWith(1, 'D:/second.md')

    firstWinInfo.win.close()
    await vi.waitFor(() => {
      expect(listWindowRefs()).toHaveLength(0)
    })
    expect(recentAddMock).toHaveBeenNthCalledWith(2, 'D:/first.md')
  })

  it('最后一个文件窗口关闭前，必须等待 recent 顺序写入完成再真正退出', async () => {
    const closeRecentDeferred = createDeferred()

    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    recentAddMock.mockClear()
    recentAddMock.mockReturnValueOnce(closeRecentDeferred.promise)

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(listWindowRefs()).toHaveLength(1)
    expect(appExitMock).not.toHaveBeenCalled()
    expect(recentAddMock).toHaveBeenCalledWith('D:/demo.md')

    closeRecentDeferred.resolve()
    await closeRecentDeferred.promise

    await vi.waitFor(() => {
      expect(listWindowRefs()).toHaveLength(0)
    })
    expect(appExitMock).toHaveBeenCalledTimes(1)
  })

  it('recent 顺序写入失败时，也不能阻塞窗口关闭和应用退出', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    recentAddMock.mockClear()
    recentAddMock.mockRejectedValueOnce(new Error('recent write failed'))

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(listWindowRefs()).toHaveLength(0)
    })
    expect(recentAddMock).toHaveBeenCalledWith('D:/demo.md')
    expect(appExitMock).toHaveBeenCalledTimes(1)
  })

  it('窗口内本地资源链接打开失败时，必须给出明确提示，不能静默结束', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    const runtime = getDocumentSessionRuntime()
    const executeUiCommandMock = vi.spyOn(runtime, 'executeUiCommand').mockResolvedValueOnce({
      ok: false,
      opened: false,
      reason: 'open-failed',
      path: 'D:/assets/demo.png',
    })

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    sendMock.mockClear()

    const result = await winInfoUtil.handleLocalResourceLinkOpen(winInfo.win, winInfo.id, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: false,
      opened: false,
      reason: 'open-failed',
      path: 'D:/assets/demo.png',
    })
    expect(executeUiCommandMock).toHaveBeenCalledWith(
      winInfo.id,
      'document.resource.open-in-folder',
      'wj://2e2f6173736574732f64656d6f2e706e67',
    )
    expect(openLocalResourceInFolderMock).not.toHaveBeenCalled()
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'window.effect.message',
      data: {
        type: 'warning',
        content: 'message.openResourceLocationFailed',
      },
    })
    executeUiCommandMock.mockRestore()
  })

  it('窗口内相对本地资源链接成功打开时，必须通过 runtime 统一资源命令入口委托裁决', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    const runtime = getDocumentSessionRuntime()
    const executeUiCommandMock = vi.spyOn(runtime, 'executeUiCommand').mockResolvedValueOnce({
      ok: true,
      opened: true,
      reason: 'opened',
      path: 'D:/assets/demo.png',
    })

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = listWindowRefs()
    sendMock.mockClear()

    const result = await winInfoUtil.handleLocalResourceLinkOpen(winInfo.win, winInfo.id, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: true,
      opened: true,
      reason: 'opened',
      path: 'D:/assets/demo.png',
    })
    expect(executeUiCommandMock).toHaveBeenCalledWith(
      winInfo.id,
      'document.resource.open-in-folder',
      'wj://2e2f6173736574732f64656d6f2e706e67',
    )
    expect(openLocalResourceInFolderMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
    executeUiCommandMock.mockRestore()
  })

  it('notifyRecentListChanged 只应在列表真实变化时广播 recent 刷新事件', async () => {
    await winInfoUtil.createNew(null)
    await winInfoUtil.createNew(null)

    const recentList = [
      {
        name: 'demo.md',
        path: 'D:/docs/demo.md',
      },
    ]

    sendMock.mockClear()

    publishRecentListChangedThroughRuntime(recentList)
    publishRecentListChangedThroughRuntime([
      {
        name: 'demo.md',
        path: 'D:/docs/demo.md',
      },
    ])

    expect(sendMock.mock.calls.filter(call => call[1]?.event === 'window.effect.recent-list-changed')).toHaveLength(2)
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'update-recent')).toBe(false)
  })

  it('显式路径打开入口命中缺失 Markdown 时，必须直接拒绝，不能创建 missing-path 草稿窗口', async () => {
    pathExistsMock.mockResolvedValue(false)

    const result = await openDocumentPathThroughRuntime('D:/missing.md', {
      trigger: 'startup',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-missing',
      path: 'D:/missing.md',
    })
    expect(listWindowRefs()).toHaveLength(0)
  })

  it('显式路径打开入口如果收到相对路径和 baseDir，必须先解析为稳定绝对路径再打开文档', async () => {
    const relativePath = 'docs/demo.md'
    const baseDir = 'D:/workspace-root'
    const absolutePath = 'D:/workspace-root/docs/demo.md'

    pathExistsMock.mockImplementation(async targetPath => targetPath === absolutePath)
    statMock.mockResolvedValue({
      isFile: () => true,
    })
    readFileMock.mockImplementation(async (targetPath) => {
      if (targetPath === absolutePath) {
        return '# 基于 baseDir 打开的内容'
      }
      throw new Error(`unexpected read path: ${targetPath}`)
    })

    const result = await openDocumentPathThroughRuntime(relativePath, {
      trigger: 'second-instance',
      baseDir,
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      reason: 'opened',
      path: absolutePath,
    }))
    expect(listWindowRefs()).toHaveLength(1)
    expect(browserWindowInstances).toHaveLength(1)
    expect(winInfoUtil.getDocumentContext(listWindowRefs()[0].id).path).toBe(absolutePath)
  })

  it('同一文档如果先以相对路径建窗，再以绝对路径打开，也必须复用已有窗口，避免重复开窗', async () => {
    const relativePath = 'docs/demo.md'
    const absolutePath = path.resolve(relativePath).replaceAll('\\', '/')

    // 这里故意只让“绝对化后的目标路径”存在，
    // 锁定 createNew / openDocumentPath 必须先完成路径标准化，不能直接拿原始相对路径访问文件系统。
    pathExistsMock.mockImplementation(async targetPath => targetPath === absolutePath)
    readFileMock.mockImplementation(async (targetPath) => {
      if (targetPath === absolutePath) {
        return '# 原始内容'
      }
      throw new Error(`unexpected read path: ${targetPath}`)
    })

    await winInfoUtil.createNew(relativePath)

    expect(listWindowRefs()).toHaveLength(1)
    expect(browserWindowInstances).toHaveLength(1)
    const [winInfo] = listWindowRefs()
    expect(winInfoUtil.getDocumentContext(winInfo.id).path).toBe(absolutePath)

    const openResult = await openDocumentPathThroughRuntime(absolutePath, {
      trigger: 'user',
    })

    expect(openResult).toEqual(expect.objectContaining({
      ok: true,
      reason: 'opened',
      path: absolutePath,
    }))
    expect(listWindowRefs()).toHaveLength(1)
    expect(browserWindowInstances).toHaveLength(1)
  })

  it('显式路径打开入口命中目录型 *.md 目标时，必须按 not-file 拒绝，不能继续读文件', async () => {
    pathExistsMock.mockResolvedValue(true)
    statMock.mockResolvedValue({
      isFile: () => false,
    })

    const result = await openDocumentPathThroughRuntime('D:/folder.md', {
      trigger: 'second-instance',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-not-file',
      path: 'D:/folder.md',
    })
    expect(readFileMock).not.toHaveBeenCalled()
    expect(listWindowRefs()).toHaveLength(0)
  })
})
it('document.save 已收口到统一命令入口后，不应继续对外暴露 save facade', () => {
  expect('save' in winInfoUtil).toBe(false)
  expect(winInfoUtil.save).toBeUndefined()
})

it('document.external.apply / document.external.ignore 已收口到统一命令入口后，不应继续对外暴露旧 facade', () => {
  expect('applyExternalPendingChange' in winInfoUtil).toBe(false)
  expect('ignoreExternalPendingChange' in winInfoUtil).toBe(false)
  expect(winInfoUtil.applyExternalPendingChange).toBeUndefined()
  expect(winInfoUtil.ignoreExternalPendingChange).toBeUndefined()
})

it('外部 watcher 兼容 facade 已删除后，不应继续对外暴露 handleExternalChange / handleFileMissing', () => {
  expect('handleExternalChange' in winInfoUtil).toBe(false)
  expect('handleFileMissing' in winInfoUtil).toBe(false)
  expect(winInfoUtil.handleExternalChange).toBeUndefined()
  expect(winInfoUtil.handleFileMissing).toBeUndefined()
})

it('task 4 收口后，旧 lifecycle 业务入口 executeCommand / executeResourceCommand / executeResourceCommandSync / openDocumentPath / notifyRecentListChanged 不应继续对外暴露', () => {
  expect('executeCommand' in winInfoUtil).toBe(false)
  expect('executeResourceCommand' in winInfoUtil).toBe(false)
  expect('executeResourceCommandSync' in winInfoUtil).toBe(false)
  expect('openDocumentPath' in winInfoUtil).toBe(false)
  expect('notifyRecentListChanged' in winInfoUtil).toBe(false)
  expect(winInfoUtil.executeCommand).toBeUndefined()
  expect(winInfoUtil.executeResourceCommand).toBeUndefined()
  expect(winInfoUtil.executeResourceCommandSync).toBeUndefined()
  expect(winInfoUtil.openDocumentPath).toBeUndefined()
  expect(winInfoUtil.notifyRecentListChanged).toBeUndefined()
})
