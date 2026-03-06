import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()
const notificationShowMock = vi.fn()
const notificationOnMock = vi.fn()
const ignorePendingChangeMock = vi.fn((state) => {
  state.ignoredVersionHash = state.pendingChange?.versionHash || null
  state.pendingChange = null
  return state.ignoredVersionHash
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
    notificationShowMock.mockClear()
    notificationOnMock.mockClear()
  })

  it('忽略外部修改后，当前窗口应该变为未保存状态', () => {
    const winInfo = {
      win: {},
      path: 'D:/demo.md',
      exists: true,
      isRecent: false,
      content: '# 当前内容',
      tempContent: '# 当前内容',
      externalWatch: {
        pendingChange: {
          version: 3,
          versionHash: 'external-hash',
          content: '# 外部最新内容',
        },
        ignoredVersionHash: null,
      },
    }

    const result = winInfoUtil.ignoreExternalPendingChange(winInfo, 3)

    expect(result).toBe(true)
    expect(winInfo.content).toBe('# 外部最新内容')
    expect(winInfo.tempContent).toBe('# 当前内容')
    expect(ignorePendingChangeMock).toHaveBeenCalledTimes(1)
    expect(winInfoUtil.getFileInfoPayload(winInfo).saved).toBe(false)
    expect(sendMock).toHaveBeenCalledWith(winInfo.win, { event: 'file-is-saved', data: false })
  })

  it('直接应用时，系统通知正文应该携带文件地址', () => {
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
      externalWatch: {
        pendingChange: {
          version: 4,
          versionHash: 'external-hash-2',
          content: '# 外部最新内容',
        },
        ignoredVersionHash: null,
      },
    }

    const result = winInfoUtil.applyExternalPendingChange(winInfo, 4, { notify: true })

    expect(result).toBe(true)
    expect(notificationShowMock).toHaveBeenCalledTimes(1)
    expect(notificationShowMock.mock.calls[0][0].title).toContain('demo.md')
    expect(notificationShowMock.mock.calls[0][0].icon).toContain('256x256.png')
    expect(notificationShowMock.mock.calls[0][0].body).toContain('路径：')
    expect(notificationShowMock.mock.calls[0][0].body).toContain('D:/demo.md')
  })
})
