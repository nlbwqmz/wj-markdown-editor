import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  browserWindowInstances,
  createId,
  dialogShowSaveDialogSync,
  send,
  windowGetDocumentContext,
} = vi.hoisted(() => ({
  browserWindowInstances: [],
  createId: vi.fn(() => 'export-loading-key'),
  dialogShowSaveDialogSync: vi.fn(),
  send: vi.fn(),
  windowGetDocumentContext: vi.fn(),
}))

vi.mock('electron', () => {
  class BrowserWindow {
    constructor(options) {
      this.options = options
      this.webContents = {
        executeJavaScript: vi.fn(),
        printToPDF: vi.fn(),
      }
      browserWindowInstances.push(this)
    }

    close() {}

    loadURL() {
      return Promise.resolve()
    }

    loadFile() {
      return Promise.resolve()
    }
  }

  return {
    BrowserWindow,
    dialog: {
      showSaveDialogSync: dialogShowSaveDialogSync,
    },
  }
})

vi.mock('fs-extra', () => ({
  default: {
    writeFile: vi.fn(),
  },
}))

vi.mock('../../data/configUtil.js', () => ({
  default: {
    getConfig: vi.fn(),
  },
}))

vi.mock('../channel/sendUtil.js', () => ({
  default: {
    send,
  },
}))

vi.mock('../commonUtil.js', () => ({
  default: {
    createId,
  },
}))

vi.mock('../document-session/windowLifecycleService.js', () => ({
  default: {
    getDocumentContext: windowGetDocumentContext,
  },
}))

vi.mock('./exportImageCaptureUtil.js', () => ({
  captureExportImageBuffer: vi.fn(),
}))

vi.mock('./exportWindowOptionsUtil.js', () => ({
  createExportWindowOptions: vi.fn(({ parentWindow, preloadPath }) => ({
    parent: parentWindow,
    preload: preloadPath,
  })),
}))

describe('exportUtil', () => {
  beforeEach(() => {
    vi.resetModules()
    browserWindowInstances.length = 0
    createId.mockReset()
    dialogShowSaveDialogSync.mockReset()
    send.mockReset()
    windowGetDocumentContext.mockReset()

    createId.mockReturnValue('export-loading-key')
    dialogShowSaveDialogSync.mockReturnValue('D:/exports/demo.pdf')
    windowGetDocumentContext.mockReturnValue({
      path: 'D:/docs/demo.md',
      content: '# 导出内容',
    })
  })

  it('createExportWin 使用显式参数对象时，必须先通过 notify 向父窗口发送 exporting 提示', async () => {
    const { default: exportUtil } = await import('./exportUtil.js')
    const parentWindow = { id: 1 }
    const notify = vi.fn()

    const result = await exportUtil.createExportWin({
      parentWindow,
      documentContext: {
        path: 'D:/docs/demo.md',
        content: '# 导出内容',
      },
      type: 'PDF',
      notify,
    })

    expect(result).toBeUndefined()
    expect(dialogShowSaveDialogSync).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      type: 'loading',
      content: 'message.exporting',
      duration: 0,
      key: 'export-loading-key',
    }))
    expect(send).not.toHaveBeenCalled()
    expect(browserWindowInstances).toHaveLength(1)
  })

  it('documentContext.content 为空时，必须通过 notify 发出 contentIsEmpty 提示且不启动导出流程', async () => {
    const { default: exportUtil } = await import('./exportUtil.js')
    const parentWindow = { id: 1 }
    const notify = vi.fn()

    const result = await exportUtil.createExportWin({
      parentWindow,
      documentContext: {
        path: 'D:/docs/demo.md',
        content: '',
      },
      type: 'PDF',
      notify,
    })

    expect(result).toBeUndefined()
    expect(notify).toHaveBeenCalledWith({
      type: 'warning',
      content: 'message.contentIsEmpty',
    })
    expect(dialogShowSaveDialogSync).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(browserWindowInstances).toHaveLength(0)
  })

  it('默认导出不应继续暴露失效的 channel 入口，避免旧形态调用绕过显式参数边界', async () => {
    const { default: exportUtil } = await import('./exportUtil.js')

    expect(exportUtil).not.toHaveProperty('channel')
  })
})
