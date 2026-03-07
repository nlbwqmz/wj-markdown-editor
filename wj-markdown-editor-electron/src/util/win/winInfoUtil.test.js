import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()
const notificationShowMock = vi.fn()
const notificationOnMock = vi.fn()
const ignorePendingChangeMock = vi.fn((state) => {
  state.pendingChange = null
  state.ignoredVersionHash = null
  state.lastHandledVersionHash = 'handled-from-ignore'
  return state.lastHandledVersionHash
})
const settlePendingChangeMock = vi.fn((state, versionHash) => {
  state.pendingChange = null
  state.ignoredVersionHash = null
  state.lastHandledVersionHash = versionHash || null
  return state.lastHandledVersionHash
})

vi.mock('electron', () => {
  class BrowserWindow {}
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
      openExternal: vi.fn(),
      showItemInFolder: vi.fn(),
    },
  }
})

vi.mock('fs-extra', () => ({
  default: {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    pathExists: vi.fn(),
  },
}))

vi.mock('../../data/configUtil.js', () => ({
  default: {
    getConfig: vi.fn(() => ({ language: 'zh-CN', autoSave: [] })),
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

vi.mock('../fileWatchUtil.js', () => ({
  default: {
    createWatchState: vi.fn(() => ({ pendingChange: null })),
    ignorePendingChange: ignorePendingChangeMock,
    settlePendingChange: settlePendingChangeMock,
    stopWatching: vi.fn(),
    startWatching: vi.fn(),
    markInternalSave: vi.fn(),
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
    ignorePendingChangeMock.mockClear()
    settlePendingChangeMock.mockClear()
    notificationShowMock.mockClear()
    notificationOnMock.mockClear()
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
        ignoredVersionHash: 'stale-ignore',
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
    expect(winInfo.externalWatch.ignoredVersionHash).toBeNull()
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
        ignoredVersionHash: 'stale-ignore',
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
        ignoredVersionHash: null,
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
        ignoredVersionHash: null,
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
        ignoredVersionHash: null,
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
        ignoredVersionHash: 'stale-ignore',
      },
    }

    const result = winInfoUtil.applyExternalPendingChange(winInfo, 6)

    expect(result).toBe(true)
    expect(winInfo.content).toBe('# 外部最新内容')
    expect(winInfo.tempContent).toBe('# 外部最新内容')
    expect(settlePendingChangeMock).toHaveBeenCalledWith(winInfo.externalWatch, 'external-hash-4')
    expect(winInfo.externalWatch.pendingChange).toBeNull()
    expect(winInfo.externalWatch.ignoredVersionHash).toBeNull()
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
        ignoredVersionHash: null,
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
        ignoredVersionHash: null,
      },
    }

    const result = winInfoUtil.applyExternalPendingChange(winInfo, 7)

    expect(result).toBe(true)
    expect(notificationShowMock).not.toHaveBeenCalled()
  })
})
