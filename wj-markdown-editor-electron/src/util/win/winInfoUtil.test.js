import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()
const notificationShowMock = vi.fn()
const notificationOnMock = vi.fn()
const writeFileMock = vi.fn()
const readFileMock = vi.fn()
const pathExistsMock = vi.fn()
const openExternalMock = vi.fn()
const showItemInFolderMock = vi.fn()
const openLocalResourceInFolderMock = vi.fn()
const createWatchStateMock = vi.fn(() => ({ pendingChange: null }))
const startWatchingMock = vi.fn()
const stopWatchingMock = vi.fn()
const markInternalSaveMock = vi.fn()
const ignorePendingChangeMock = vi.fn((state) => {
  state.pendingChange = null
  state.lastHandledVersionHash = 'handled-from-ignore'
  return state.lastHandledVersionHash
})
const settlePendingChangeMock = vi.fn((state, versionHash) => {
  state.pendingChange = null
  state.lastHandledVersionHash = versionHash || null
  return state.lastHandledVersionHash
})
const getConfigMock = vi.fn(() => ({ language: 'zh-CN', autoSave: [], startPage: 'editor' }))
const browserWindowInstances = []
let webContentsId = 1

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

  class Notification {
    static isSupported = vi.fn(() => true)

    constructor(options) {
      this.options = options
    }

    on(...args) {
      notificationOnMock(...args)
    }

    show() {
      notificationShowMock(this.options)
    }
  }

  return {
    app: {
      exit: vi.fn(),
    },
    BrowserWindow,
    Notification,
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
    createId: vi.fn(() => 'test-id'),
    decodeWjUrl: vi.fn(),
  },
}))

vi.mock('../resourceFileUtil.js', () => ({
  default: {
    getLocalResourceFailureMessageKey: vi.fn((reason) => {
      if (reason === 'invalid-resource-payload')
        return 'message.invalidLocalResourceLink'
      if (reason === 'relative-resource-without-document')
        return 'message.relativeResourceRequiresSavedFile'
      if (reason === 'not-found')
        return 'message.theFileDoesNotExist'
      return null
    }),
    openLocalResourceInFolder: openLocalResourceInFolderMock,
  },
}))

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

describe('winInfoUtil.ignoreExternalPendingChange', () => {
  beforeEach(() => {
    sendMock.mockClear()
    writeFileMock.mockReset()
    readFileMock.mockReset()
    pathExistsMock.mockReset()
    openExternalMock.mockClear()
    showItemInFolderMock.mockClear()
    openLocalResourceInFolderMock.mockClear()
    createWatchStateMock.mockClear()
    startWatchingMock.mockClear()
    stopWatchingMock.mockClear()
    markInternalSaveMock.mockClear()
    ignorePendingChangeMock.mockClear()
    settlePendingChangeMock.mockClear()
    notificationShowMock.mockClear()
    notificationOnMock.mockClear()
    getConfigMock.mockReset()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: [], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(false)
    readFileMock.mockResolvedValue('')
    writeFileMock.mockResolvedValue(undefined)
    browserWindowInstances.length = 0
    webContentsId = 1
    winInfoUtil.getAll().length = 0
  })

  it('删除不存在的窗口 id 时，不应误删最后一个窗口', () => {
    const list = winInfoUtil.getAll()
    list.push({ id: 'win-1' }, { id: 'win-2' })

    winInfoUtil.deleteEditorWin('missing-win')

    expect(list).toEqual([{ id: 'win-1' }, { id: 'win-2' }])
  })

  it('忽略外部修改后，不应再次改写真实内容，并应清理待处理状态', () => {
    const winInfo = {
      win: {},
      path: 'D:/demo.md',
      exists: true,
      isRecent: false,
      content: '# 外部最新内容',
      tempContent: '# 当前内容',
      lastNotifiedSavedState: false,
      externalWatch: {
        pendingChange: {
          version: 3,
          versionHash: 'external-hash',
          content: '# 外部最新内容',
        },
      },
    }

    const result = winInfoUtil.ignoreExternalPendingChange(winInfo, 3)

    expect(result).toBe(true)
    expect(winInfo.content).toBe('# 外部最新内容')
    expect(winInfo.tempContent).toBe('# 当前内容')
    expect(ignorePendingChangeMock).toHaveBeenCalledTimes(1)
    expect(winInfoUtil.getFileInfoPayload(winInfo).saved).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
    expect(winInfo.externalWatch.pendingChange).toBeNull()
  })

  it('外部修改后若真实值与当前编辑值相同，应仅同步保存状态且不弹窗', () => {
    const winInfo = {
      win: {},
      path: 'D:/demo.md',
      exists: true,
      isRecent: false,
      content: '# 旧磁盘内容',
      tempContent: '# 外部最新内容',
      lastNotifiedSavedState: false,
      externalWatch: {
        pendingChange: {
          version: 4,
          versionHash: 'external-hash-2',
          content: '# 外部最新内容',
        },
      },
    }

    const result = winInfoUtil.handleExternalChange(winInfo, {
      version: 4,
      versionHash: 'external-hash-2',
      content: '# 外部最新内容',
    }, {
      strategy: 'prompt',
    })

    expect(result).toBe('resolved')
    expect(winInfo.content).toBe('# 外部最新内容')
    expect(settlePendingChangeMock).toHaveBeenCalledWith(winInfo.externalWatch, 'external-hash-2')
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, { event: 'file-is-saved', data: true })
    expect(sendMock.mock.calls.find(call => call[1]?.event === 'file-external-changed')).toBeUndefined()
  })

  it('保存状态未变化且已同步过时，不应重复发送 file-is-saved', () => {
    const winInfo = {
      win: {},
      path: 'D:/demo.md',
      exists: true,
      isRecent: false,
      content: '# 当前内容',
      tempContent: '# 当前内容',
      lastNotifiedSavedState: true,
      externalWatch: {
        pendingChange: null,
      },
    }

    winInfoUtil.updateTempContent(winInfo, '# 当前内容')

    expect(sendMock).not.toHaveBeenCalled()
  })

  it('编辑内容更新时，即使内容等于 pending 外部内容，也不应在这里清理 pending', () => {
    const winInfo = {
      win: {},
      path: 'D:/demo.md',
      exists: true,
      isRecent: false,
      content: '# 外部最新内容',
      tempContent: '# 当前内容',
      lastNotifiedSavedState: false,
      externalWatch: {
        pendingChange: {
          version: 8,
          versionHash: 'external-hash-8',
          content: '# 外部最新内容',
        },
      },
    }

    winInfoUtil.updateTempContent(winInfo, '# 外部最新内容')

    expect(settlePendingChangeMock).not.toHaveBeenCalled()
    expect(winInfo.externalWatch.pendingChange).toEqual({
      version: 8,
      versionHash: 'external-hash-8',
      content: '# 外部最新内容',
    })
  })

  it('提醒策略下，外部修改应先更新真实值和保存态，再发送差异事件', () => {
    const winInfo = {
      win: {},
      path: 'D:/demo.md',
      exists: true,
      isRecent: false,
      content: '# 磁盘旧内容',
      tempContent: '# 当前内容',
      lastNotifiedSavedState: true,
      externalWatch: {
        pendingChange: {
          version: 5,
          versionHash: 'external-hash-3',
          content: '# 外部最新内容',
        },
      },
    }

    const result = winInfoUtil.handleExternalChange(winInfo, {
      version: 5,
      versionHash: 'external-hash-3',
      content: '# 外部最新内容',
    }, {
      strategy: 'prompt',
    })

    expect(result).toBe('prompted')
    expect(winInfo.content).toBe('# 外部最新内容')
    expect(sendMock.mock.calls[0]).toEqual([winInfo.win, { event: 'file-is-saved', data: false }])
    expect(sendMock.mock.calls[1][1].event).toBe('file-external-changed')
    expect(sendMock.mock.calls[1][1].data.localContent).toBe('# 当前内容')
    expect(sendMock.mock.calls[1][1].data.externalContent).toBe('# 外部最新内容')
    expect(sendMock.mock.calls[1][1].data.filePath).toBeUndefined()
    expect(sendMock.mock.calls[1][1].data.saved).toBeUndefined()
    expect(sendMock.mock.calls[1][1].data.exists).toBeUndefined()
    expect(winInfo.externalWatch.pendingChange?.version).toBe(5)
  })

  it('提醒策略下检测到外部修改时，也应发送系统通知，并使用待处理文案', () => {
    const winInfo = {
      win: {
        isDestroyed: vi.fn(() => false),
        isMinimized: vi.fn(() => false),
        restore: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
      },
      path: 'D:/prompt-demo.md',
      exists: true,
      isRecent: false,
      content: '# 磁盘旧内容',
      tempContent: '# 当前内容',
      lastNotifiedSavedState: true,
      externalWatch: {
        pendingChange: {
          version: 9,
          versionHash: 'external-hash-9',
          content: '# 外部最新内容',
        },
      },
    }

    const result = winInfoUtil.handleExternalChange(winInfo, {
      version: 9,
      versionHash: 'external-hash-9',
      content: '# 外部最新内容',
    }, {
      strategy: 'prompt',
    })

    expect(result).toBe('prompted')
    expect(notificationShowMock).toHaveBeenCalledTimes(1)
    expect(notificationShowMock.mock.calls[0][0].title).toContain('prompt-demo.md')
    expect(notificationShowMock.mock.calls[0][0].body).toContain('请返回编辑器查看并处理')
    expect(notificationShowMock.mock.calls[0][0].body).toContain('D:/prompt-demo.md')
    expect(notificationShowMock.mock.calls[0][0].body).not.toContain('已自动应用')
  })

  it('提醒策略下手动应用时，应由 Electron 更新内容并通知渲染端刷新', () => {
    const winInfo = {
      win: {},
      path: 'D:/demo.md',
      exists: true,
      isRecent: false,
      content: '# 外部最新内容',
      tempContent: '# 当前内容',
      lastNotifiedSavedState: false,
      externalWatch: {
        pendingChange: {
          version: 6,
          versionHash: 'external-hash-4',
          content: '# 外部最新内容',
        },
      },
    }

    const result = winInfoUtil.applyExternalPendingChange(winInfo, 6)

    expect(result).toBe(true)
    expect(winInfo.content).toBe('# 外部最新内容')
    expect(winInfo.tempContent).toBe('# 外部最新内容')
    expect(settlePendingChangeMock).toHaveBeenCalledWith(winInfo.externalWatch, 'external-hash-4')
    expect(winInfo.externalWatch.pendingChange).toBeNull()
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'file-content-reloaded',
      data: winInfoUtil.getFileInfoPayload(winInfo),
    })
  })

  it('直接应用时，即使不传 notify 也应该发送系统通知', () => {
    const winInfo = {
      win: {
        isDestroyed: vi.fn(() => false),
        isMinimized: vi.fn(() => false),
        restore: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
      },
      path: 'D:/demo.md',
      exists: true,
      isRecent: false,
      content: '# 当前内容',
      tempContent: '# 当前内容',
      lastNotifiedSavedState: true,
      externalWatch: {
        pendingChange: {
          version: 4,
          versionHash: 'external-hash-2',
          content: '# 外部最新内容',
        },
      },
    }

    const result = winInfoUtil.handleExternalChange(winInfo, {
      version: 4,
      versionHash: 'external-hash-2',
      content: '# 外部最新内容',
    }, {
      strategy: 'apply',
    })

    expect(result).toBe('applied')
    expect(settlePendingChangeMock).toHaveBeenCalledWith(winInfo.externalWatch, 'external-hash-2')
    expect(notificationShowMock).toHaveBeenCalledTimes(1)
    expect(notificationShowMock.mock.calls[0][0].title).toContain('demo.md')
    expect(notificationShowMock.mock.calls[0][0].icon).toContain('256x256.png')
    expect(notificationShowMock.mock.calls[0][0].body).toContain('路径：')
    expect(notificationShowMock.mock.calls[0][0].body).toContain('D:/demo.md')
  })

  it('提醒策略下手动应用时，默认不应该发送系统通知', () => {
    const winInfo = {
      win: {
        isDestroyed: vi.fn(() => false),
        isMinimized: vi.fn(() => false),
        restore: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
      },
      path: 'D:/demo.md',
      exists: true,
      isRecent: false,
      content: '# 外部最新内容',
      tempContent: '# 当前内容',
      lastNotifiedSavedState: false,
      externalWatch: {
        pendingChange: {
          version: 7,
          versionHash: 'external-hash-7',
          content: '# 外部最新内容',
        },
      },
    }

    const result = winInfoUtil.applyExternalPendingChange(winInfo, 7)

    expect(result).toBe(true)
    expect(notificationShowMock).not.toHaveBeenCalled()
  })

  it('文件被删除时，应清空真实内容、保留编辑内容、同步保存状态并发送缺失通知', () => {
    const winInfo = {
      win: {
        isDestroyed: vi.fn(() => false),
        isMinimized: vi.fn(() => false),
        restore: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
      },
      path: 'D:/demo.md',
      missingPath: null,
      exists: true,
      isRecent: false,
      content: '# 磁盘内容',
      tempContent: '# 当前编辑内容',
      lastNotifiedSavedState: true,
      externalWatch: {
        pendingChange: {
          version: 10,
          versionHash: 'external-hash-10',
          content: '# 外部版本',
        },
      },
    }

    winInfoUtil.startExternalWatch(winInfo)
    const onMissing = startWatchingMock.mock.calls[0][0].onMissing
    onMissing()

    expect(winInfo.content).toBe('')
    expect(winInfo.tempContent).toBe('# 当前编辑内容')
    expect(winInfo.exists).toBe(false)
    expect(winInfo.path).toBe('D:/demo.md')
    expect(winInfo.missingPath).toBeNull()
    expect(winInfo.externalWatch.pendingChange).toBeNull()
    expect(notificationShowMock).toHaveBeenCalledTimes(1)
    expect(notificationShowMock.mock.calls[0][0].title).toContain('文件被删除')
    expect(notificationShowMock.mock.calls[0][0].body).toContain('D:/demo.md')
    expect(sendMock.mock.calls).toContainEqual([winInfo.win, { event: 'file-is-saved', data: false }])
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'file-missing')).toBe(true)
  })

  it('文件缺失时，文件名仍应保持原路径对应的名称，而不是 Unnamed', () => {
    const payload = winInfoUtil.getFileInfoPayload({
      path: 'D:/missing/demo.md',
      missingPath: null,
      exists: false,
      isRecent: false,
      content: '',
      tempContent: '# 编辑内容',
    })

    expect(payload.fileName).toBe('demo.md')
    expect(payload.path).toBe('D:/missing/demo.md')
    expect(payload.saved).toBe(false)
  })

  it('最近文件不存在时，应回退为 Unnamed，但仍保留缺失路径用于提示', () => {
    const payload = winInfoUtil.getFileInfoPayload({
      path: null,
      missingPath: 'D:/missing/recent-demo.md',
      missingPathReason: 'open-target-missing',
      exists: false,
      isRecent: true,
      content: '',
      tempContent: '',
    })

    expect(payload.fileName).toBe('Unnamed')
    expect(payload.path).toBe('D:/missing/recent-demo.md')
    expect(payload.exists).toBe(false)
    expect(payload.isRecent).toBe(true)
  })

  it('missingPath 没有明确场景标记时，不应参与当前文件路径展示', () => {
    const payload = winInfoUtil.getFileInfoPayload({
      path: null,
      missingPath: 'D:/missing/should-not-display.md',
      missingPathReason: null,
      exists: false,
      isRecent: false,
      content: '',
      tempContent: '',
    })

    expect(payload.fileName).toBe('Unnamed')
    expect(payload.path).toBeNull()
  })

  it('未保存的新文件不应注册外部监听', () => {
    const winInfo = {
      win: {},
      path: null,
      externalWatch: {
        pendingChange: null,
      },
    }

    const result = winInfoUtil.startExternalWatch(winInfo)

    expect(result).toBe(false)
    expect(startWatchingMock).not.toHaveBeenCalled()
  })

  it('无路径草稿在 blur 时不应触发自动保存', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })

    await winInfoUtil.createNew(null)

    const [winInfo] = winInfoUtil.getAll()
    winInfo.tempContent = '# 草稿内容'

    winInfo.win.emit('blur')

    expect(writeFileMock).not.toHaveBeenCalled()
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'unsaved')).toBe(false)
    expect(winInfoUtil.getAll()).toHaveLength(1)
  })

  it('无路径草稿在 close 时不应自动保存，但应拦截关闭并提示未保存', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })

    await winInfoUtil.createNew(null)

    const [winInfo] = winInfoUtil.getAll()
    winInfo.tempContent = '# 草稿内容'

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(writeFileMock).not.toHaveBeenCalled()
    expect(sendMock.mock.calls).toContainEqual([winInfo.win, { event: 'unsaved' }])
    expect(winInfoUtil.getAll()).toHaveLength(1)
  })

  it('首次保存成功后应创建外部监听状态并注册目录监听', async () => {
    const winInfo = {
      win: {},
      path: 'D:/demo.md',
      tempContent: '# 当前内容',
      content: '',
      exists: false,
      missingPath: 'D:/demo.md',
      missingPathReason: 'open-target-missing',
      externalWatch: null,
      lastNotifiedSavedState: false,
    }

    await winInfoUtil.save(winInfo)

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 当前内容')
    expect(createWatchStateMock).toHaveBeenCalledTimes(1)
    expect(startWatchingMock).toHaveBeenCalledTimes(1)
    expect(startWatchingMock.mock.calls[0][0]).toMatchObject({
      state: winInfo.externalWatch,
      filePath: 'D:/demo.md',
    })
    expect(markInternalSaveMock).toHaveBeenCalledTimes(1)
    expect(winInfo.exists).toBe(true)
    expect(winInfo.missingPath).toBeNull()
    expect(winInfo.missingPathReason).toBeNull()
  })

  it('首次保存空白文件时，仍应创建目标文件并注册目录监听', async () => {
    const winInfo = {
      win: {},
      path: 'D:/blank.md',
      tempContent: '',
      content: '',
      exists: false,
      missingPath: 'D:/blank.md',
      missingPathReason: 'open-target-missing',
      externalWatch: null,
      lastNotifiedSavedState: true,
    }

    await winInfoUtil.save(winInfo)

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledWith('D:/blank.md', '')
    expect(createWatchStateMock).toHaveBeenCalledTimes(1)
    expect(startWatchingMock).toHaveBeenCalledTimes(1)
    expect(winInfo.exists).toBe(true)
  })

  it('文件缺失后再次保存时，仍应直接写回原路径', async () => {
    const winInfo = {
      win: {},
      path: 'D:/demo.md',
      missingPath: null,
      tempContent: '# 当前内容',
      content: '',
      exists: false,
      externalWatch: {
        watcher: {},
        pendingChange: null,
      },
      lastNotifiedSavedState: false,
    }

    await winInfoUtil.save(winInfo)

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 当前内容')
  })

  it('文件缺失且内容为空时再次保存，仍应直接写回原路径', async () => {
    const winInfo = {
      win: {},
      path: 'D:/blank-missing.md',
      missingPath: null,
      tempContent: '',
      content: '',
      exists: false,
      externalWatch: {
        watcher: {},
        pendingChange: null,
      },
      lastNotifiedSavedState: true,
    }

    await winInfoUtil.save(winInfo)

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledWith('D:/blank-missing.md', '')
    expect(winInfo.exists).toBe(true)
  })

  it('保存过程中若继续编辑，应继续补写最新内容直到保存状态真正收敛', async () => {
    const firstSaveDeferred = createDeferred()
    const secondSaveDeferred = createDeferred()
    const winInfo = {
      win: {},
      path: 'D:/demo.md',
      tempContent: '# 第一次内容',
      content: '# 旧内容',
      exists: true,
      externalWatch: {
        watcher: {},
        pendingChange: null,
      },
      lastNotifiedSavedState: false,
    }
    writeFileMock
      .mockReturnValueOnce(firstSaveDeferred.promise)
      .mockReturnValueOnce(secondSaveDeferred.promise)

    const savePromise = winInfoUtil.save(winInfo)
    winInfo.tempContent = '# 第二次内容'

    firstSaveDeferred.resolve()
    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 第二次内容')
    })

    expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 第一次内容')

    secondSaveDeferred.resolve()
    await savePromise

    expect(winInfo.content).toBe('# 第二次内容')
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, {
      event: 'save-success',
      data: {
        fileName: 'demo.md',
        saved: true,
      },
    })
  })

  it('autoSave=close 时，应先同步阻止关闭，再等待保存完成后继续关闭', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValueOnce(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfo.tempContent = '# 已编辑内容'

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(winInfoUtil.getAll()).toHaveLength(1)

    saveDeferred.resolve()
    await saveDeferred.promise
    await vi.waitFor(() => {
      expect(winInfo.win.closeEvents).toHaveLength(2)
      expect(winInfoUtil.getAll()).toHaveLength(0)
    })
    expect(stopWatchingMock).toHaveBeenCalled()
  })

  it('autoSave=blur 时，多次失焦不应并发触发重复保存', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValue(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfo.tempContent = '# 已编辑内容'

    winInfo.win.emit('blur')
    winInfo.win.emit('blur')

    expect(writeFileMock).toHaveBeenCalledTimes(1)

    saveDeferred.resolve()
    await saveDeferred.promise
  })

  it('autoSave=blur 时，同一轮失败保存被重复复用，也只应提示一次错误', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValue(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    sendMock.mockClear()
    winInfo.tempContent = '# 已编辑内容'

    // 连续两次 blur 会复用同一个 saveTask。
    // 这里故意让这一轮保存失败，验证失败提示不能因为重复复用而弹两次。
    winInfo.win.emit('blur')
    winInfo.win.emit('blur')

    expect(writeFileMock).toHaveBeenCalledTimes(1)

    saveDeferred.reject(new Error('disk full'))

    await vi.waitFor(() => {
      const autoSaveErrorCalls = sendMock.mock.calls.filter(call => call[1]?.event === 'message'
        && call[1]?.data?.type === 'error'
        && call[1]?.data?.content === '自动保存失败。 disk full')
      expect(autoSaveErrorCalls).toHaveLength(1)
    })
  })

  it('force-close 时，不应再次进入 autoSave=close 的阻止关闭流程', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfo.tempContent = '# 已编辑内容'
    winInfo.forceClose = true

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).not.toHaveBeenCalled()
    expect(writeFileMock).not.toHaveBeenCalled()
    expect(winInfoUtil.getAll()).toHaveLength(0)
  })

  it('手动保存进行中强制关闭时，应放弃后续补写且不再重绑 watcher 或发送保存成功事件', async () => {
    const firstSaveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: [], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock
      .mockReturnValueOnce(firstSaveDeferred.promise)
      .mockResolvedValueOnce(undefined)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    startWatchingMock.mockClear()
    sendMock.mockClear()
    writeFileMock.mockClear()

    winInfo.tempContent = '# 第一版内容'
    const savePromise = winInfoUtil.save(winInfo)
    winInfo.tempContent = '# 第二版内容'
    winInfo.forceClose = true

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).not.toHaveBeenCalled()
    expect(winInfoUtil.getAll()).toHaveLength(0)

    firstSaveDeferred.resolve()
    await savePromise

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledWith('D:/demo.md', '# 第一版内容')
    expect(startWatchingMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalledWith(winInfo.win, expect.objectContaining({
      event: 'save-success',
    }))
  })

  it('手动保存进行中触发 autoSave=close 时，应复用同一个保存并等待关闭', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValueOnce(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfo.tempContent = '# 已编辑内容'

    const manualSavePromise = winInfoUtil.save(winInfo)
    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledTimes(1)

    saveDeferred.resolve()
    await manualSavePromise
    await vi.waitFor(() => {
      expect(winInfo.win.closeEvents).toHaveLength(2)
      expect(winInfoUtil.getAll()).toHaveLength(0)
    })
  })

  it('手动保存进行中触发 autoSave=blur 时，不应启动第二次写盘', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValueOnce(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfo.tempContent = '# 已编辑内容'

    const manualSavePromise = winInfoUtil.save(winInfo)
    winInfo.win.emit('blur')

    expect(writeFileMock).toHaveBeenCalledTimes(1)

    saveDeferred.resolve()
    await manualSavePromise
  })

  it('autoSave=blur 与 autoSave=close 复用同一轮失败保存时，只应提示一次错误', async () => {
    const saveDeferred = createDeferred()
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur', 'close'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockReturnValue(saveDeferred.promise)

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    sendMock.mockClear()
    winInfo.tempContent = '# 已编辑内容'

    // blur 先启动自动保存，close 再复用同一个 saveTask。
    // 如果这一轮写盘失败，主进程只能发出一条自动保存失败消息。
    winInfo.win.emit('blur')
    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledTimes(1)

    saveDeferred.reject(new Error('disk full'))

    await vi.waitFor(() => {
      const autoSaveErrorCalls = sendMock.mock.calls.filter(call => call[1]?.event === 'message'
        && call[1]?.data?.type === 'error'
        && call[1]?.data?.content === '自动保存失败。 disk full')
      expect(autoSaveErrorCalls).toHaveLength(1)
      expect(sendMock.mock.calls).toContainEqual([winInfo.win, { event: 'unsaved' }])
    })
  })

  it('autoSave=close 保存失败时，应保持窗口打开并同时提示错误与未保存状态', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['close'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockRejectedValueOnce(new Error('disk full'))

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfo.tempContent = '# 已编辑内容'

    const closeEvent = winInfo.win.close()

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(sendMock.mock.calls).toContainEqual([winInfo.win, {
        event: 'message',
        data: {
          type: 'error',
          content: '自动保存失败。 disk full',
        },
      }])
      expect(sendMock.mock.calls).toContainEqual([winInfo.win, { event: 'unsaved' }])
    })
    expect(winInfoUtil.getAll()).toHaveLength(1)
    expect(winInfo.win.closeEvents).toHaveLength(1)
  })

  it('autoSave=blur 保存失败时，应只提示错误且不关闭窗口', async () => {
    getConfigMock.mockReturnValue({ language: 'zh-CN', autoSave: ['blur'], startPage: 'editor' })
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('# 原始内容')
    writeFileMock.mockRejectedValueOnce(new Error('disk full'))

    await winInfoUtil.createNew('D:/demo.md')

    const [winInfo] = winInfoUtil.getAll()
    winInfo.tempContent = '# 已编辑内容'

    expect(() => {
      winInfo.win.emit('blur')
    }).not.toThrow()

    await vi.waitFor(() => {
      expect(sendMock.mock.calls).toContainEqual([winInfo.win, {
        event: 'message',
        data: {
          type: 'error',
          content: '自动保存失败。 disk full',
        },
      }])
    })
    expect(sendMock.mock.calls.some(call => call[1]?.event === 'unsaved')).toBe(false)
    expect(winInfoUtil.getAll()).toHaveLength(1)
  })

  it('点击无效 wj 资源链接时，不应抛错，应发送无效资源提示', async () => {
    const win = { id: 1 }
    const winInfo = {
      path: 'D:/demo.md',
    }
    openLocalResourceInFolderMock.mockResolvedValue({
      ok: false,
      opened: false,
      reason: 'invalid-resource-payload',
      path: null,
    })

    await winInfoUtil.handleLocalResourceLinkOpen(win, winInfo, 'wj://zz')

    expect(openLocalResourceInFolderMock).toHaveBeenCalledWith(winInfo, 'wj://zz', showItemInFolderMock)
    expect(showItemInFolderMock).not.toHaveBeenCalled()
    expect(sendMock).toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'warning',
        content: 'message.invalidLocalResourceLink',
      },
    })
  })

  it('点击未保存文档中的相对资源时，应发送明确提示', async () => {
    const win = { id: 1 }
    const winInfo = {
      path: '',
    }
    openLocalResourceInFolderMock.mockResolvedValue({
      ok: false,
      opened: false,
      reason: 'relative-resource-without-document',
      path: null,
    })

    await winInfoUtil.handleLocalResourceLinkOpen(win, winInfo, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(openLocalResourceInFolderMock).toHaveBeenCalledWith(winInfo, 'wj://2e2f6173736574732f64656d6f2e706e67', showItemInFolderMock)
    expect(showItemInFolderMock).not.toHaveBeenCalled()
    expect(sendMock).toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'warning',
        content: 'message.relativeResourceRequiresSavedFile',
      },
    })
  })
})
