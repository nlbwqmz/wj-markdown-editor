import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appGetVersion,
  browserWindowFromWebContents,
  ipcMainHandle,
  ipcMainOn,
  openLocalResourceInFolder,
  send,
} = vi.hoisted(() => {
  return {
    appGetVersion: vi.fn(() => '2.15.0'),
    browserWindowFromWebContents: vi.fn(),
    ipcMainHandle: vi.fn(),
    ipcMainOn: vi.fn(),
    openLocalResourceInFolder: vi.fn(),
    send: vi.fn(),
  }
})

vi.mock('electron', () => {
  return {
    app: {
      getVersion: appGetVersion,
    },
    BrowserWindow: {
      fromWebContents: browserWindowFromWebContents,
    },
    dialog: {
      showOpenDialogSync: vi.fn(),
      showSaveDialogSync: vi.fn(),
    },
    ipcMain: {
      handle: ipcMainHandle,
      on: ipcMainOn,
    },
    shell: {
      showItemInFolder: vi.fn(),
    },
  }
})

vi.mock('fs-extra', () => {
  return {
    default: {
      writeFile: vi.fn(),
      pathExists: vi.fn(),
    },
  }
})

vi.mock('../../data/configUtil.js', () => {
  return {
    default: {
      getConfig: vi.fn(() => ({ theme: { global: 'light' } })),
      getDefaultConfig: vi.fn(() => ({})),
      setConfig: vi.fn(),
      setThemeGlobal: vi.fn(),
      setLanguage: vi.fn(),
    },
  }
})

vi.mock('../../data/recent.js', () => {
  return {
    default: {
      add: vi.fn(),
      clear: vi.fn(),
      remove: vi.fn(),
      get: vi.fn(() => []),
      setMax: vi.fn(),
    },
  }
})

vi.mock('../fileUploadUtil.js', () => {
  return {
    default: {
      save: vi.fn(),
    },
  }
})

vi.mock('../imgUtil.js', () => {
  return {
    default: {
      check: vi.fn(() => true),
      save: vi.fn(),
    },
  }
})

vi.mock('../resourceFileUtil.js', () => {
  return {
    default: {
      openLocalResourceInFolder,
      deleteLocalResource: vi.fn(),
      getLocalResourceInfo: vi.fn(),
      resolveLocalResourcePath: vi.fn(),
    },
  }
})

vi.mock('../updateUtil.js', () => {
  return {
    default: {
      checkUpdate: vi.fn(),
      downloadUpdate: vi.fn(),
      cancelDownloadUpdate: vi.fn(),
      executeUpdate: vi.fn(),
    },
  }
})

vi.mock('../win/aboutUtil.js', () => {
  return {
    default: {
      channel: {},
      get: vi.fn(),
    },
  }
})

vi.mock('../win/exportUtil.js', () => {
  return {
    default: {
      channel: {},
    },
  }
})

vi.mock('../win/guideUtil.js', () => {
  return {
    default: {
      channel: {},
    },
  }
})

vi.mock('../win/screenshotsUtil.js', () => {
  return {
    default: {
      startCapture: vi.fn(),
    },
  }
})

vi.mock('../win/settingUtil.js', () => {
  return {
    default: {
      channel: {},
    },
  }
})

vi.mock('../win/winInfoUtil.js', () => {
  return {
    default: {
      getWinInfo: vi.fn(() => ({
        path: 'D:\\docs\\note.md',
        exists: true,
        win: { id: 1 },
      })),
      getAll: vi.fn(() => []),
      createNew: vi.fn(),
      save: vi.fn(),
      getFileInfoPayload: vi.fn(),
      updateTempContent: vi.fn(),
      applyExternalPendingChange: vi.fn(),
      ignoreExternalPendingChange: vi.fn(),
    },
  }
})

vi.mock('./sendUtil.js', () => {
  return {
    default: {
      send,
    },
  }
})

describe('ipcMainUtil open-folder', () => {
  beforeEach(() => {
    vi.resetModules()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
    browserWindowFromWebContents.mockReset()
    openLocalResourceInFolder.mockReset()
    send.mockReset()
  })

  it('资源不存在时，应该向渲染进程发送文件不存在提示', async () => {
    let sendToMainHandler
    ipcMainHandle.mockImplementation((channel, handler) => {
      if (channel === 'sendToMain') {
        sendToMainHandler = handler
      }
    })

    const sender = { id: 9527 }
    const win = { id: 1 }
    browserWindowFromWebContents.mockReturnValue(win)
    openLocalResourceInFolder.mockResolvedValue({
      ok: true,
      opened: false,
      reason: 'not-found',
      path: 'D:\\docs\\assets\\missing.md',
    })

    await import('./ipcMainUtil.js')
    await sendToMainHandler({ sender }, {
      event: 'open-folder',
      data: 'wj://2e2f6173736574732f6d697373696e672e6d64',
    })

    expect(openLocalResourceInFolder).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'warning',
        content: 'message.theFileDoesNotExist',
      },
    })
  })
})
