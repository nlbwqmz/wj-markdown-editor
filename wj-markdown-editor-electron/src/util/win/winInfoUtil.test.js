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
    stat: statMock,
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
    createContentVersion: createContentVersionMock,
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
    statMock.mockReset()
    showSaveDialogSyncMock.mockReset()
    openExternalMock.mockReset()
    showItemInFolderMock.mockReset()
    openLocalResourceInFolderMock.mockReset()
    createWatchStateMock.mockReset()
    startWatchingMock.mockReset()
    stopWatchingMock.mockReset()
    markInternalSaveMock.mockReset()
    createContentVersionMock.mockClear()
    ignorePendingChangeMock.mockReset()
    settlePendingChangeMock.mockReset()
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
      expect(winInfo.tempContent).toBe('# blur 自动保存内容')
    })
    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')
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

  it('关闭链路命中草稿首次保存且 dialog.save-target-cancelled 时，必须直接取消关闭流程并保持窗口打开', async () => {
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
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'unsaved')).toBe(false)
  })

  it('document.save 在兼容旧调用方先选好路径时，仍只走一次标准选路且不会双弹窗，最终能够正确保存', async () => {
    await winInfoUtil.createNew(null)

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 草稿内容')

    // 兼容旧调用方会先把目标路径放到 winInfo 镜像里。
    // Task 2 修复后，这个路径只能被 open-save-dialog effect 内部消化，
    // 不能再由 document.save 直接带 payload.path 绕过标准命令流。
    winInfo.path = 'D:/compat-draft.md'

    await winInfoUtil.executeCommand(winInfo, 'document.save')

    expect(showSaveDialogSyncMock).not.toHaveBeenCalled()
    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledWith('D:/compat-draft.md', '# 草稿内容')
    expect(winInfo.path).toBe('D:/compat-draft.md')
    expect(winInfo.tempContent).toBe('# 草稿内容')
    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')
    expect(snapshot.content).toBe('# 草稿内容')
    expect(snapshot.saved).toBe(true)
  })

  it('document.save 在真实写盘成功后必须返回 true，而不是 effects 执行前的旧快照结果', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 已保存的新内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 已保存的新内容')
    })

    const saveResult = await winInfoUtil.executeCommand(winInfo, 'document.save')

    expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 已保存的新内容')
    expect(saveResult).toBe(true)
  })

  it('首次保存写盘成功后即使 watcher 绑定失败，save 也必须返回成功，并把失败标准化成告警', async () => {
    showSaveDialogSyncMock.mockReturnValueOnce('D:/draft.md')
    startWatchingMock.mockImplementationOnce(() => {
      throw new Error('watch bind failed')
    })

    await winInfoUtil.createNew(null)

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 草稿内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 草稿内容')
    })
    sendMock.mockClear()

    await expect(winInfoUtil.executeCommand(winInfo, 'document.save')).resolves.toBe(true)

    expect(writeFileMock).toHaveBeenCalledWith('D:/draft.md', '# 草稿内容')
    expect(winInfo.path).toBe('D:/draft.md')
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

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# blur 自动保存内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# blur 自动保存内容')
    })

    winInfo.win.emit('blur')
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# blur 自动保存内容')
    })

    sendMock.mockClear()
    let saveResolved = false
    const manualSavePromise = winInfoUtil.executeCommand(winInfo, 'document.save').then((result) => {
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

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# close 自动保存内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# close 自动保存内容')
    })

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# close 自动保存内容')
    })

    sendMock.mockClear()
    const manualSavePromise = winInfoUtil.executeCommand(winInfo, 'document.save')

    saveDeferred.resolve()
    await saveDeferred.promise

    const saveResult = await manualSavePromise

    expect(saveResult).toBe(true)
    expect(winInfoUtil.getAll()).toHaveLength(0)
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

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 第一版内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 第一版内容')
    })

    winInfo.win.emit('blur')
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 第一版内容')
    })

    sendMock.mockClear()
    const manualSavePromise = winInfoUtil.executeCommand(winInfo, 'document.save')

    firstSaveDeferred.resolve()
    await firstSaveDeferred.promise

    winInfoUtil.updateTempContent(winInfo, '# 第二版内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 第二版内容')
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

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 尚未落盘的内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 尚未落盘的内容')
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
      const manualSavePromise = winInfoUtil.executeCommand(winInfo, 'document.save').then((result) => {
        saveResolved = true
        return result
      })
      await Promise.resolve()

      // 在 manual request 还没真正完成时，把当前编辑区改回磁盘版本，
      // 当前全局快照会重新变成 saved=true；这正是旧实现会误报成功的场景。
      await winInfoUtil.executeCommand(winInfo, 'document.edit', {
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

    await winInfoUtil.executeCommand(winInfo, 'document.edit', {
      content: '# 外部新内容',
    })
    sendMock.mockClear()

    const saveResult = await winInfoUtil.executeCommand(winInfo, 'document.save')
    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')

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

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 本地保存版本')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 本地保存版本')
    })

    winInfo.win.emit('blur')
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 本地保存版本')
    })

    sendMock.mockClear()
    const manualSavePromise = winInfoUtil.executeCommand(winInfo, 'document.save')

    winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部版本',
      version: 'version-2',
      versionHash: 'hash-version-2',
    }, {
      strategy: 'prompt',
    })
    await winInfoUtil.executeCommand(winInfo, 'document.edit', {
      content: '# 外部版本',
    })

    saveDeferred.resolve()
    await saveDeferred.promise

    const saveResult = await manualSavePromise
    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')

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

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 待保存的新内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 待保存的新内容')
    })

    winInfo.win.emit('blur')
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 待保存的新内容')
    })

    sendMock.mockClear()
    const manualSavePromise = winInfoUtil.executeCommand(winInfo, 'document.save')

    await winInfoUtil.executeCommand(winInfo, 'document.edit', {
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

    const [winInfo] = winInfoUtil.getAll()
    winInfoUtil.updateTempContent(winInfo, '# 待保存内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 待保存内容')
    })
    sendMock.mockClear()

    const saveResult = await winInfoUtil.executeCommand(winInfo, 'document.save')

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

    const [winInfo] = winInfoUtil.getAll()
    sendMock.mockClear()

    await winInfoUtil.executeCommand(winInfo, 'document.save-copy')

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

    const [winInfo] = winInfoUtil.getAll()
    sendMock.mockClear()

    const result = await winInfoUtil.executeCommand(winInfo, 'dialog.open-target-selected', {
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
    expect(winInfoUtil.getAll()).toHaveLength(1)
    expect(winInfo.path).toBe('D:/demo.md')
  })

  it('handleFileMissing 只能通过 snapshot 推送最新 exists=false 与 saved=false，不能再发送 legacy file-missing / file-is-saved', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    sendMock.mockClear()

    const result = winInfoUtil.handleFileMissing(winInfo)

    expect(result).toBe('missing')
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-is-saved')).toBe(false)
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-missing')).toBe(false)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'document.snapshot.changed',
      data: expect.objectContaining({
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

  it('handleExternalChange 在 strategy=apply 时，只能通过 snapshot 收敛，不应再发送 file-content-reloaded / file-is-saved', async () => {
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
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-is-saved')).toBe(false)
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-content-reloaded')).toBe(false)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'document.snapshot.changed',
      data: expect.objectContaining({
        content: '# 外部新内容',
        exists: true,
        saved: true,
      }),
    })
  })

  it('handleExternalChange 在 strategy=prompt 时，只能通过 snapshot.externalPrompt 推送冲突，不能再发送 file-external-changed', async () => {
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
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-external-changed')).toBe(false)
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

  it('旧弹窗已经打开时，如果又来了新的外部版本，snapshot.externalPrompt 必须更新为最新 diff，且不能再发送 file-external-changed', async () => {
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

    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')

    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-external-changed')).toBe(false)
    expect(snapshot.externalPrompt).toEqual({
      visible: true,
      version: 2,
      localContent: '# 本地编辑内容',
      externalContent: '# 外部新内容 2',
      fileName: 'demo.md',
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

  it('document.external.apply / document.external.ignore 遇到 stale version 时，必须 no-op，且不能误清当前 prompt', async () => {
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
    await winInfoUtil.executeCommand(winInfo, 'document.external.ignore', {
      version: 1,
    })
    ignorePendingChangeMock.mockClear()
    settlePendingChangeMock.mockClear()

    winInfoUtil.handleExternalChange(winInfo, {
      content: '# 外部新内容 2',
      version: 'version-3',
      versionHash: 'hash-version-3',
    }, {
      strategy: 'prompt',
    })

    const staleIgnored = await winInfoUtil.executeCommand(winInfo, 'document.external.ignore', {
      version: 1,
    })
    const staleApplied = await winInfoUtil.executeCommand(winInfo, 'document.external.apply', {
      version: 1,
    })
    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')

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

  it('live watcher 的 onExternalChange 必须走统一命令流，过期 bindingToken 不能污染当前会话', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    const watchOptions = startWatchingMock.mock.calls[0][0]
    winInfoUtil.updateTempContent(winInfo, '# 本地编辑内容')
    await vi.waitFor(() => {
      expect(winInfo.tempContent).toBe('# 本地编辑内容')
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

    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')
    expect(snapshot.content).toBe('# 本地编辑内容')
    expect(snapshot.externalPrompt).toBeNull()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('live watcher 的 onMissing 必须走统一命令流，迟到 observedAt 不能把当前文档误打成 missing', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    const watchOptions = startWatchingMock.mock.calls[0][0]

    // 先用一条当前 token 的有效事件把 event floor 推到更高水位，
    // 随后的 live missing 如果还是旧 observedAt，就必须被统一状态机丢弃。
    await winInfoUtil.executeCommand(winInfo, 'watch.file-changed', {
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

    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')
    expect(snapshot.exists).toBe(true)
    expect(snapshot.saved).toBe(true)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('live watcher 的 onRestored 必须走统一命令流，过期 bindingToken 不能把 missing 会话错误恢复', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    const watchOptions = startWatchingMock.mock.calls[0][0]

    winInfoUtil.handleFileMissing(winInfo)
    sendMock.mockClear()

    watchOptions.onRestored?.('# 旧 watcher 的恢复内容', {
      bindingToken: (watchOptions.bindingToken || 0) + 1,
      watchingPath: 'D:/demo.md',
      observedAt: 1700000005020,
    })

    const snapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')
    expect(snapshot.exists).toBe(false)
    expect(snapshot.saved).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
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
    const missingSnapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')
    expect(missingSnapshot.exists).toBe(false)

    watchOptions.onRestored('# 恢复后的磁盘内容')

    const restoredSnapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')
    expect(restoredSnapshot.exists).toBe(true)
    expect(restoredSnapshot.content).toBe('# 恢复后的磁盘内容')
    expect(restoredSnapshot.saved).toBe(true)
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

    const restoredSnapshot = await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot')
    expect(restoredSnapshot.exists).toBe(true)
    expect(restoredSnapshot.content).toBe('# 原始内容')
    expect(restoredSnapshot.saved).toBe(true)
  })

  it('缺失后恢复时，即使后续 change 被 internal-save / handled 去重吞掉，也必须立刻推送最新 snapshot 清掉缺失态', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    const watchOptions = startWatchingMock.mock.calls[0][0]

    winInfoUtil.handleFileMissing(winInfo)
    sendMock.mockClear()

    watchOptions.onRestored('# 原始内容')

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

    const [winInfo] = winInfoUtil.getAll()
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
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'update-recent')).toBe(false)
  })

  it('显式路径打开入口命中缺失 Markdown 时，必须直接拒绝，不能创建 missing-path 草稿窗口', async () => {
    pathExistsMock.mockResolvedValue(false)

    const result = await winInfoUtil.openDocumentPath('D:/missing.md', {
      trigger: 'startup',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-missing',
      path: 'D:/missing.md',
    })
    expect(winInfoUtil.getAll()).toHaveLength(0)
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

    expect(winInfoUtil.getAll()).toHaveLength(1)
    expect(browserWindowInstances).toHaveLength(1)
    const [winInfo] = winInfoUtil.getAll()
    expect(winInfo.path).toBe(absolutePath)

    const openResult = await winInfoUtil.openDocumentPath(absolutePath, {
      trigger: 'user',
    })

    expect(openResult).toEqual(expect.objectContaining({
      ok: true,
      reason: 'opened',
      path: absolutePath,
    }))
    expect(winInfoUtil.getAll()).toHaveLength(1)
    expect(browserWindowInstances).toHaveLength(1)
  })

  it('显式路径打开入口命中目录型 *.md 目标时，必须按 not-file 拒绝，不能继续读文件', async () => {
    pathExistsMock.mockResolvedValue(true)
    statMock.mockResolvedValue({
      isFile: () => false,
    })

    const result = await winInfoUtil.openDocumentPath('D:/folder.md', {
      trigger: 'second-instance',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-not-file',
      path: 'D:/folder.md',
    })
    expect(readFileMock).not.toHaveBeenCalled()
    expect(winInfoUtil.getAll()).toHaveLength(0)
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
