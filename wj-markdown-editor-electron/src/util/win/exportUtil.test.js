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

  it('开始导出时，必须先向父窗口发送 exporting 提示', async () => {
    const { default: exportUtil } = await import('./exportUtil.js')
    const parentWindow = { id: 1 }

    await exportUtil.channel['export-start']({
      win: parentWindow,
    }, 'PDF')

    expect(dialogShowSaveDialogSync).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(parentWindow, expect.objectContaining({
      event: 'message',
      data: expect.objectContaining({ content: 'message.exporting' }),
    }))
    expect(browserWindowInstances).toHaveLength(1)
  })
})
