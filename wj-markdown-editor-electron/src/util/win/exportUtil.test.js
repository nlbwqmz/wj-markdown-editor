import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  browserWindowInstances,
  captureExportImageBuffer,
  clipboardWriteImage,
  configGetConfig,
  createId,
  dialogShowSaveDialogSync,
  fsWriteFile,
  nativeImageCreateFromBuffer,
  send,
  windowGetDocumentContext,
} = vi.hoisted(() => ({
  browserWindowInstances: [],
  captureExportImageBuffer: vi.fn(),
  clipboardWriteImage: vi.fn(),
  configGetConfig: vi.fn(),
  createId: vi.fn(() => 'export-loading-key'),
  dialogShowSaveDialogSync: vi.fn(),
  fsWriteFile: vi.fn(),
  nativeImageCreateFromBuffer: vi.fn(),
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
    clipboard: {
      writeImage: clipboardWriteImage,
    },
    dialog: {
      showSaveDialogSync: dialogShowSaveDialogSync,
    },
    nativeImage: {
      createFromBuffer: nativeImageCreateFromBuffer,
    },
  }
})

vi.mock('fs-extra', () => ({
  default: {
    writeFile: fsWriteFile,
  },
}))

vi.mock('../../data/configUtil.js', () => ({
  default: {
    getConfig: configGetConfig,
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
  captureExportImageBuffer,
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
    captureExportImageBuffer.mockReset()
    clipboardWriteImage.mockReset()
    configGetConfig.mockReset()
    createId.mockReset()
    dialogShowSaveDialogSync.mockReset()
    fsWriteFile.mockReset()
    nativeImageCreateFromBuffer.mockReset()
    send.mockReset()
    windowGetDocumentContext.mockReset()

    createId.mockReturnValue('export-loading-key')
    configGetConfig.mockReturnValue({
      export: {
        pdf: {
          footer: {
            pageNumber: false,
            content: '',
          },
          header: {
            content: '',
          },
        },
      },
    })
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

  it('createExportWin 在 target=clipboard 时不应弹出保存对话框，但仍应创建导出窗口并发送 exporting 提示', async () => {
    const { default: exportUtil } = await import('./exportUtil.js')
    const parentWindow = { id: 1 }
    const notify = vi.fn()

    const result = await exportUtil.createExportWin({
      parentWindow,
      documentContext: {
        path: 'D:/docs/demo.md',
        content: '# 导出内容',
      },
      type: 'PNG',
      target: 'clipboard',
      notify,
    })

    expect(result).toBeUndefined()
    expect(dialogShowSaveDialogSync).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      type: 'loading',
      content: 'message.exporting',
      duration: 0,
      key: 'export-loading-key',
    }))
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

  it('doExport 在 target=clipboard 且 type=PNG 时必须写入系统剪切板，而不是写文件', async () => {
    const { default: exportUtil } = await import('./exportUtil.js')
    const notify = vi.fn()
    const clipboardImage = { kind: 'clipboard-image' }

    await exportUtil.createExportWin({
      parentWindow: { id: 1 },
      documentContext: {
        path: 'D:/docs/demo.md',
        content: '# 导出内容',
      },
      type: 'PNG',
      target: 'clipboard',
      notify,
    })

    browserWindowInstances[0].webContents.executeJavaScript.mockResolvedValueOnce(480)
    captureExportImageBuffer.mockResolvedValueOnce(Buffer.from('png-buffer'))
    nativeImageCreateFromBuffer.mockReturnValueOnce(clipboardImage)

    await exportUtil.doExport({
      data: {
        type: 'PNG',
        target: 'clipboard',
        filePath: null,
      },
      notify,
    })

    expect(nativeImageCreateFromBuffer).toHaveBeenCalledWith(Buffer.from('png-buffer'))
    expect(clipboardWriteImage).toHaveBeenCalledWith(clipboardImage)
    expect(fsWriteFile).not.toHaveBeenCalled()
  })

  it('doExport 在 target=clipboard 且 type=PDF 时必须走失败分支', async () => {
    const { default: exportUtil } = await import('./exportUtil.js')
    const notify = vi.fn()

    await exportUtil.createExportWin({
      parentWindow: { id: 1 },
      documentContext: {
        path: 'D:/docs/demo.md',
        content: '# 导出内容',
      },
      type: 'PDF',
      target: 'clipboard',
      notify,
    })

    browserWindowInstances[0].webContents.printToPDF.mockResolvedValueOnce(Buffer.from('pdf-buffer'))

    await exportUtil.doExport({
      data: {
        type: 'PDF',
        target: 'clipboard',
        filePath: null,
      },
      notify,
    })

    expect(clipboardWriteImage).not.toHaveBeenCalled()
    expect(fsWriteFile).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      content: 'message.exportFailed',
      duration: 3,
      key: 'export-loading-key',
    }))
  })

  it('默认导出不应继续暴露失效的 channel 入口，避免旧形态调用绕过显式参数边界', async () => {
    const { default: exportUtil } = await import('./exportUtil.js')

    expect(exportUtil).not.toHaveProperty('channel')
  })
})
