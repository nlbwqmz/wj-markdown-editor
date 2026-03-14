import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()
const writeFileMock = vi.fn()
const readFileMock = vi.fn()
const pathExistsMock = vi.fn()
const showSaveDialogSyncMock = vi.fn()
const openExternalMock = vi.fn()
const showItemInFolderMock = vi.fn()
const openLocalResourceInFolderMock = vi.fn()
const createWatchStateMock = vi.fn(() => ({ pendingChange: null }))
const startWatchingMock = vi.fn()
const stopWatchingMock = vi.fn()
const markInternalSaveMock = vi.fn()
const ignorePendingChangeMock = vi.fn((state) => {
  state.pendingChange = null
  return 'ignored'
})
const settlePendingChangeMock = vi.fn((state) => {
  state.pendingChange = null
  return 'settled'
})
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
      exit: vi.fn(),
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
  },
}))

vi.mock('../../data/configUtil.js', () => ({
  default: {
    getConfig: getConfigMock,
  },
}))

vi.mock('../../data/recent.js', () => ({
  default: {
    add: vi.fn(),
  },
}))

vi.mock('../channel/sendUtil.js', () => ({
  default: {
    send: sendMock,
  },
}))

vi.mock('../commonUtil.js', () => ({
  default: {
    createId: vi.fn(() => `test-id-${createIdIndex++}`),
    decodeWjUrl: vi.fn(),
  },
}))

vi.mock('../resourceFileUtil.js', async () => {
  const actual = await vi.importActual('../resourceFileUtil.js')
  return {
    default: {
      ...actual.default,
      openLocalResourceInFolder: openLocalResourceInFolderMock,
    },
  }
})

vi.mock('../fileWatchUtil.js', () => ({
  default: {
    createWatchState: createWatchStateMock,
    ignorePendingChange: ignorePendingChangeMock,
    settlePendingChange: settlePendingChangeMock,
    stopWatching: stopWatchingMock,
    startWatching: startWatchingMock,
    markInternalSave: markInternalSaveMock,
  },
}))

vi.mock('../updateUtil.js', () => ({
  default: {
    checkUpdate: vi.fn(),
  },
}))

const { default: winInfoUtil } = await import('./winInfoUtil.js')

describe('winInfoUtil 兼容 facade', () => {
  beforeEach(() => {
    sendMock.mockReset()
    writeFileMock.mockReset()
    readFileMock.mockReset()
    pathExistsMock.mockReset()
    showSaveDialogSyncMock.mockReset()
    openExternalMock.mockReset()
    showItemInFolderMock.mockReset()
    openLocalResourceInFolderMock.mockReset()
    createWatchStateMock.mockReset()
    startWatchingMock.mockReset()
    stopWatchingMock.mockReset()
    markInternalSaveMock.mockReset()
    ignorePendingChangeMock.mockReset()
    settlePendingChangeMock.mockReset()
    getConfigMock.mockReset()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: [], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(false)
    readFileMock.mockResolvedValue('')
    writeFileMock.mockResolvedValue(undefined)
    browserWindowInstances.length = 0
    webContentsId = 1
    winInfoUtil.getAll().length = 0
  })

  it('window.blur 触发自动保存时，必须复用统一保存管线且不发送成功提示', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValueOnce(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# blur 自动保存内容')
    winInfo.win.emit('blur')

    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# blur 自动保存内容')
    })

    saveDeferred.resolve()
    await saveDeferred.promise
    await vi.waitFor(() => {
      expect(winInfo.content).toBe('# blur 自动保存内容')
      expect(winInfo.tempContent).toBe('# blur 自动保存内容')
    })
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

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 关闭前自动保存内容')

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 关闭前自动保存内容')
    })
    expect(winInfoUtil.getAll()).toHaveLength(1)

    saveDeferred.resolve()
    await saveDeferred.promise
    await vi.waitFor(() => {
      expect(winInfo.win.closeEvents).toHaveLength(2)
      expect(winInfoUtil.getAll()).toHaveLength(0)
    })
  })

  it('close-auto-save 成功关闭窗口后，不得再次 startWatching', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    startWatchingMock.mockClear()
    stopWatchingMock.mockClear()
    winInfoUtil.updateTempContent(winInfo, '# 关闭前自动保存内容')

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(winInfoUtil.getAll()).toHaveLength(0)
    })
    expect(stopWatchingMock).toHaveBeenCalled()
    expect(startWatchingMock).not.toHaveBeenCalled()
  })

  it('关闭链路命中草稿首次保存且 dialog.save-target-cancelled 时，必须回到未保存确认态', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    showSaveDialogSyncMock.mockReturnValueOnce(undefined)

    await winInfoUtil.createNew(null)

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 草稿内容')

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(showSaveDialogSyncMock).toHaveBeenCalledTimes(1)
    })
    expect(writeFileMock).not.toHaveBeenCalled()
    expect(winInfoUtil.getAll()).toHaveLength(1)
    expect(winInfo.path).toBeNull()
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'unsaved')).toBe(true)
  })

  it('winInfoUtil.save 在兼容旧调用方先选好路径时，仍只走一次标准选路且不会双弹窗，最终能够正确保存', async () => {
    await winInfoUtil.createNew(null)

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 草稿内容')

    // 兼容旧调用方会先把目标路径放到 winInfo 镜像里。
    // Task 2 修复后，这个路径只能被 open-save-dialog effect 内部消化，
    // 不能再由 document.save 直接带 payload.path 绕过标准命令流。
    winInfo.path = 'D:/compat-draft.md'

    await winInfoUtil.save(winInfo)

    expect(showSaveDialogSyncMock).not.toHaveBeenCalled()
    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledWith('D:/compat-draft.md', '# 草稿内容')
    expect(winInfo.path).toBe('D:/compat-draft.md')
    expect(winInfo.content).toBe('# 草稿内容')
    expect(winInfo.tempContent).toBe('# 草稿内容')
  })

  it('winInfoUtil.save 在真实写盘成功后必须返回 true，而不是 effects 执行前的旧快照结果', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 已保存的新内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 已保存的新内容')
    })

    const saveResult = await winInfoUtil.save(winInfo)

    expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 已保存的新内容')
    expect(saveResult).toBe(true)
  })

  it('草稿首存写盘失败时，只能提示保存失败，不能再追加取消保存提示', async () => {
    writeFileMock.mockRejectedValueOnce(new Error('磁盘已满'))
    showSaveDialogSyncMock.mockReturnValueOnce('D:/draft-save-failed.md')

    await winInfoUtil.createNew(null)

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 待保存内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 待保存内容')
    })
    sendMock.mockClear()

    const saveResult = await winInfoUtil.save(winInfo)

    expect(saveResult).toBe(false)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'message',
      data: {
        type: 'error',
        content: '保存失败。 磁盘已满',
      },
    })
    expect(sendMock).not.toHaveBeenCalledWith(winInfo.win, {
      event: 'message',
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

    const [winInfo] = winInfoUtil.getAll()
    sendMock.mockClear()

    await winInfoUtil.executeCommand(winInfo, 'document.save-copy')

    expect(sendMock).not.toHaveBeenCalledWith(winInfo.win, {
      event: 'message',
      data: {
        type: 'success',
        content: 'message.saveAsSuccessfully',
      },
    })
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'message',
      data: {
        type: 'warning',
        content: '另存为失败，副本路径不能与当前文档相同。',
      },
    })
  })

  it('save-copy 真正写盘失败时，compat 层必须给出失败提示，不能静默结束', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    showSaveDialogSyncMock.mockReturnValueOnce('D:/copy-failed.md')
    writeFileMock.mockRejectedValueOnce(new Error('设备不可用'))

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    sendMock.mockClear()

    await winInfoUtil.executeCommand(winInfo, 'document.save-copy')

    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'message',
      data: {
        type: 'error',
        content: '另存为失败。 设备不可用',
      },
    })
    expect(sendMock).not.toHaveBeenCalledWith(winInfo.win, {
      event: 'message',
      data: {
        type: 'success',
        content: 'message.saveAsSuccessfully',
      },
    })
  })

  it('handleFileMissing 发给 renderer 的 payload 必须反映最新 exists=false 与正确 saved 状态，而不是旧 session 快照', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    sendMock.mockClear()

    const result = winInfoUtil.handleFileMissing(winInfo)

    expect(result).toBe('missing')
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, { event: 'file-is-saved', data: false })
    expect(sendMock.mock.calls.filter(call => call[1]?.event === 'file-is-saved')).toHaveLength(1)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'file-missing',
      data: expect.objectContaining({
        content: '# 原始内容',
        exists: false,
        saved: false,
      }),
    })
  })

  it('handleFileMissing 之后必须把 watcher 历史去重状态清到安全值，避免恢复首轮被旧状态污染', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfo.externalWatch.recentInternalSaves = [{
      versionHash: 'same-hash',
      savedAt: Date.now(),
    }]
    winInfo.externalWatch.lastInternalSaveAt = Date.now()
    winInfo.externalWatch.lastInternalSavedVersion = 'same-hash'
    winInfo.externalWatch.lastHandledVersionHash = 'same-hash'
    winInfo.externalWatch.pendingChange = {
      version: 'pending-1',
      versionHash: 'same-hash',
      content: '# 原始内容',
    }

    winInfoUtil.handleFileMissing(winInfo)

    expect(winInfo.externalWatch.recentInternalSaves).toEqual([])
    expect(winInfo.externalWatch.lastInternalSaveAt).toBe(0)
    expect(winInfo.externalWatch.lastInternalSavedVersion).toBeNull()
    expect(winInfo.externalWatch.lastHandledVersionHash).toBeNull()
    expect(winInfo.externalWatch.pendingChange).toBeNull()
  })

  it('handleExternalChange 在 strategy=apply 时，file-content-reloaded / file-is-saved 必须基于最新 session 真相', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 本地编辑内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 本地编辑内容')
    })
    sendMock.mockClear()

    const result = winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容',
      version: 'version-2',
      versionHash: 'hash-version-2',
    }, {
      strategy: 'apply',
    })

    expect(result).toBe('applied')
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, { event: 'file-is-saved', data: true })
    expect(sendMock.mock.calls.filter(call => call[1]?.event === 'file-is-saved')).toHaveLength(1)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'file-content-reloaded',
      data: expect.objectContaining({
        content: '# 外部新内容',
        exists: true,
        saved: true,
      }),
    })
  })

  it('handleExternalChange 在 strategy=prompt 时，file-external-changed 只能发送一次，避免 bridge 与兼容层重复推送', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 本地编辑内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 本地编辑内容')
    })
    sendMock.mockClear()

    const result = winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容',
      version: 'version-2',
      versionHash: 'hash-version-2',
    }, {
      strategy: 'prompt',
    })

    expect(result).toBe('prompted')
    expect(sendMock.mock.calls.filter(call => call[1]?.event === 'file-external-changed')).toHaveLength(1)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'file-external-changed',
      data: {
        fileName: 'demo.md',
        version: 1,
        localContent: '# 本地编辑内容',
        externalContent: '# 外部新内容',
      },
    })
  })

  it('handleExternalChange 在 strategy=prompt 时，必须把 pendingExternalChange 写回 session 快照，供 renderer 改走 externalPrompt 真相', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 本地编辑内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 本地编辑内容')
    })

    winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容',
      version: 'version-2',
      versionHash: 'hash-version-2',
    }, {
      strategy: 'prompt',
    })

    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')

    expect(snapshot.externalPrompt).toEqual({
      visible: true,
      version: 1,
      localContent: '# 本地编辑内容',
      externalContent: '# 外部新内容',
      fileName: 'demo.md',
    })
  })

  it('旧弹窗已经打开时，如果又来了新的外部版本，仍必须再次发送 file-external-changed 覆盖旧 diff', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 本地编辑内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 本地编辑内容')
    })

    winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容 1',
      version: 'version-2',
      versionHash: 'hash-version-2',
    }, {
      strategy: 'prompt',
    })
    sendMock.mockClear()

    winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容 2',
      version: 'version-3',
      versionHash: 'hash-version-3',
    }, {
      strategy: 'prompt',
    })

    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'file-external-changed',
      data: {
        fileName: 'demo.md',
        version: 2,
        localContent: '# 本地编辑内容',
        externalContent: '# 外部新内容 2',
      },
    })
  })

  it('document.external.apply / document.external.ignore 必须通过统一命令入口消费 legacy prompt，并让 snapshot.externalPrompt 正确收敛', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 本地编辑内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 本地编辑内容')
    })

    winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容 1',
      version: 'version-2',
      versionHash: 'hash-version-2',
    }, {
      strategy: 'prompt',
    })

    const ignored = await winInfoUtil.executeCommand(winInfo, 'document.external.ignore', {
      version: 1,
    })

    expect(ignored.snapshot.externalPrompt).toBeNull()
    expect(ignored.snapshot.content).toBe('# 本地编辑内容')

    winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容 2',
      version: 'version-3',
      versionHash: 'hash-version-3',
    }, {
      strategy: 'prompt',
    })

    const applied = await winInfoUtil.executeCommand(winInfo, 'document.external.apply', {
      version: 2,
    })

    expect(applied.snapshot.externalPrompt).toBeNull()
    expect(applied.snapshot.content).toBe('# 外部新内容 2')
    expect(applied.snapshot.saved).toBe(true)
  })

  it('legacy 外部修改兼容入口遇到 stale version 时，必须返回 false，且不能误清当前 prompt', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 本地编辑内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 本地编辑内容')
    })

    winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容 1',
      version: 'version-2',
      versionHash: 'hash-version-2',
    }, {
      strategy: 'prompt',
    })
    await winInfoUtil.ignoreExternalPendingChange(winInfo, 1)

    winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容 2',
      version: 'version-3',
      versionHash: 'hash-version-3',
    }, {
      strategy: 'prompt',
    })

    const staleIgnored = await winInfoUtil.ignoreExternalPendingChange(winInfo, 1)
    const staleApplied = await winInfoUtil.applyExternalPendingChange(winInfo, 1)
    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')

    expect(staleIgnored).toBe(false)
    expect(staleApplied).toBe(false)
    expect(snapshot.externalPrompt).toEqual({
      visible: true,
      version: 2,
      localContent: '# 本地编辑内容',
      externalContent: '# 外部新内容 2',
      fileName: 'demo.md',
    })
  })

  it('外部冲突如果已经被用户本地内容自行消解，handleExternalChange 必须把过期 externalPrompt 收敛掉', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 本地编辑内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 本地编辑内容')
    })

    winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容',
      version: 'version-2',
      versionHash: 'hash-version-2',
    }, {
      strategy: 'prompt',
    })

    winInfoUtil.updateTempContent(winInfo, '# 外部新内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 外部新内容')
    })

    const result = winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容',
      version: 'version-3',
      versionHash: 'hash-version-2',
    }, {
      strategy: 'prompt',
    })
    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')

    expect(result).toBe('resolved')
    expect(snapshot.saved).toBe(true)
    expect(snapshot.externalPrompt).toBeNull()
  })

  it('恢复链路 onRestored 使用传入的 diskContent 更新当前会话的 exists/content/saved 投影', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    const watchOptions = startWatchingMock.mock.calls[0][0]

    winInfoUtil.updateTempContent(winInfo, '# 恢复后的磁盘内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 恢复后的磁盘内容')
    })

    winInfoUtil.handleFileMissing(winInfo)
    const missingPayload = winInfoUtil.getFileInfoPayload(winInfo)
    expect(missingPayload.exists).toBe(false)

    watchOptions.onRestored('# 恢复后的磁盘内容')

    const restoredPayload = winInfoUtil.getFileInfoPayload(winInfo)
    expect(restoredPayload.exists).toBe(true)
    expect(restoredPayload.content).toBe('# 恢复后的磁盘内容')
    expect(restoredPayload.saved).toBe(true)
    expect(winInfo.content).toBe('# 恢复后的磁盘内容')
  })

  it('缺失后恢复时，即使恢复内容与之前 internal-save / handled 版本 hash 相同，也不能停在 exists=true 但磁盘基线仍缺失的不一致态', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    const watchOptions = startWatchingMock.mock.calls[0][0]
    const sameHash = 'same-hash'

    winInfo.externalWatch.recentInternalSaves = [{
      versionHash: sameHash,
      savedAt: Date.now(),
    }]
    winInfo.externalWatch.lastInternalSaveAt = Date.now()
    winInfo.externalWatch.lastInternalSavedVersion = sameHash
    winInfo.externalWatch.lastHandledVersionHash = sameHash

    winInfoUtil.handleFileMissing(winInfo)
    watchOptions.onRestored('# 原始内容')

    const restoredPayload = winInfoUtil.getFileInfoPayload(winInfo)
    expect(restoredPayload.exists).toBe(true)
    expect(restoredPayload.content).toBe('# 原始内容')
    expect(restoredPayload.saved).toBe(true)
  })

  it('force-close 会走 confirm-force-close 语义，直接关闭窗口且不再启动保存', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 尚未保存内容')
    winInfo.forceClose = true

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).not.toHaveBeenCalled()
    expect(writeFileMock).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(winInfoUtil.getAll()).toHaveLength(0)
    })
  })

  it('getFileInfoPayload 的 saved 必须以 session 快照为准，不能继续读 winInfo.content/tempContent 作为保存真相', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 已修改内容')

    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 已修改内容')
    })

    // 故意篡改 winInfo 镜像字段，验证 facade 不再把它们当作保存态真相。
    winInfo.content = '# 已修改内容'
    winInfo.tempContent = '# 已修改内容'

    const payload = winInfoUtil.getFileInfoPayload(winInfo)

    expect(payload.saved).toBe(false)
    expect(payload.content).toBe('# 已修改内容')
  })

  it('窗口内本地资源链接打开失败时，必须给出明确提示，不能静默结束', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    openLocalResourceInFolderMock.mockResolvedValue({
      ok: false,
      opened: false,
      reason: 'open-failed',
      path: 'D:/assets/demo.png',
    })

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    sendMock.mockClear()

    const result = await winInfoUtil.handleLocalResourceLinkOpen(winInfo.win, winInfo, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: false,
      opened: false,
      reason: 'open-failed',
      path: 'D:/assets/demo.png',
    })
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'message',
      data: {
        type: 'warning',
        content: 'message.openResourceLocationFailed',
      },
    })
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

    winInfoUtil.notifyRecentListChanged(recentList)
    winInfoUtil.notifyRecentListChanged([
      {
        name: 'demo.md',
        path: 'D:/docs/demo.md',
      },
    ])

    expect(sendMock.mock.calls.filter(call => call[1]?.event === 'window.effect.recent-list-changed')).toHaveLength(2)
    expect(sendMock.mock.calls.filter(call => call[1]?.event === 'update-recent')).toHaveLength(2)
  })
})
