import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appGetVersion,
  browserWindowFromWebContents,
  dialogShowOpenDialogSync,
  dialogShowSaveDialogSync,
  executeCommand,
  executeResourceCommand,
  executeResourceCommandSync,
  getLocalResourceComparableKey,
  ipcMainHandle,
  ipcMainOn,
  openLocalResourceInFolder,
  send,
} = vi.hoisted(() => {
  return {
    appGetVersion: vi.fn(() => '2.15.0'),
    browserWindowFromWebContents: vi.fn(),
    dialogShowOpenDialogSync: vi.fn(),
    dialogShowSaveDialogSync: vi.fn(),
    executeCommand: vi.fn(),
    executeResourceCommand: vi.fn(),
    executeResourceCommandSync: vi.fn(),
    getLocalResourceComparableKey: vi.fn(),
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
      showOpenDialogSync: dialogShowOpenDialogSync,
      showSaveDialogSync: dialogShowSaveDialogSync,
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

vi.mock('../resourceFileUtil.js', async () => {
  const actual = await vi.importActual('../resourceFileUtil.js')
  return {
    default: {
      ...actual.default,
      openLocalResourceInFolder,
      deleteLocalResource: vi.fn(),
      getLocalResourceInfo: vi.fn(),
      getLocalResourceComparableKey,
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
      executeCommand,
      executeResourceCommand,
      executeResourceCommandSync,
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
    dialogShowOpenDialogSync.mockReset()
    dialogShowSaveDialogSync.mockReset()
    executeCommand.mockReset()
    executeResourceCommand.mockReset()
    executeResourceCommandSync.mockReset()
    getLocalResourceComparableKey.mockReset()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
    browserWindowFromWebContents.mockReset()
    openLocalResourceInFolder.mockReset()
    send.mockReset()
  })

  async function setupOpenFolderHandler() {
    let sendToMainHandler
    ipcMainHandle.mockImplementation((channel, handler) => {
      if (channel === 'sendToMain') {
        sendToMainHandler = handler
      }
    })

    const sender = { id: 9527 }
    const win = { id: 1 }
    browserWindowFromWebContents.mockReturnValue(win)

    await import('./ipcMainUtil.js')

    return {
      sender,
      win,
      sendToMainHandler,
    }
  }

  it('资源不存在时，应该向渲染进程发送文件不存在提示', async () => {
    const { sender, win, sendToMainHandler } = await setupOpenFolderHandler()
    executeResourceCommand.mockResolvedValue({
      ok: true,
      opened: false,
      reason: 'not-found',
      path: 'D:\\docs\\assets\\missing.md',
    })

    await sendToMainHandler({ sender }, {
      event: 'open-folder',
      data: 'wj://2e2f6173736574732f6d697373696e672e6d64',
    })

    expect(executeResourceCommand).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.resource.open-in-folder', 'wj://2e2f6173736574732f6d697373696e672e6d64')
    expect(send).toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'warning',
        content: 'message.theFileDoesNotExist',
      },
    })
  })

  it('资源 payload 非法时，应该向渲染进程发送无效资源提示', async () => {
    const { sender, win, sendToMainHandler } = await setupOpenFolderHandler()
    executeResourceCommand.mockResolvedValue({
      ok: false,
      opened: false,
      reason: 'invalid-resource-payload',
      path: null,
    })

    await sendToMainHandler({ sender }, {
      event: 'open-folder',
      data: 'wj://zz',
    })

    expect(send).toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'warning',
        content: 'message.invalidLocalResourceLink',
      },
    })
  })

  it('未保存文档中的相对资源打开失败时，应该向渲染进程发送明确提示', async () => {
    const { sender, win, sendToMainHandler } = await setupOpenFolderHandler()
    executeResourceCommand.mockResolvedValue({
      ok: false,
      opened: false,
      reason: 'relative-resource-without-document',
      path: null,
    })

    await sendToMainHandler({ sender }, {
      event: 'open-folder',
      data: 'wj://2e2f6173736574732f64656d6f2e706e67',
    })

    expect(send).toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'warning',
        content: 'message.relativeResourceRequiresSavedFile',
      },
    })
  })

  it('打开请求携带原始路径提示时，应该原样透传给资源打开逻辑', async () => {
    const { sender, sendToMainHandler } = await setupOpenFolderHandler()
    executeResourceCommand.mockResolvedValue({
      ok: true,
      opened: true,
      reason: 'opened',
      path: 'D:\\docs\\docs\\index.html',
    })

    await sendToMainHandler({ sender }, {
      event: 'open-folder',
      data: {
        resourceUrl: 'wj://2e2f646f63732f696e6465782e68746d6c236775696465',
        rawPath: './docs/index.html#guide',
      },
    })

    expect(executeResourceCommand).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.resource.open-in-folder', {
      resourceUrl: 'wj://2e2f646f63732f696e6465782e68746d6c236775696465',
      rawPath: './docs/index.html#guide',
    })
  })

  it('新的 document.resource.open-in-folder 契约也必须走统一资源服务边界', async () => {
    const { sender, sendToMainHandler } = await setupOpenFolderHandler()
    executeResourceCommand.mockResolvedValue({
      ok: true,
      opened: true,
      reason: 'opened',
      path: 'D:\\docs\\assets\\demo.png',
    })

    await sendToMainHandler({ sender }, {
      event: 'document.resource.open-in-folder',
      data: {
        resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
      },
    })

    expect(executeResourceCommand).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.resource.open-in-folder', {
      resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
    })
  })

  it('资源管理器打开失败时，应该向渲染进程发送明确失败提示，而不是静默吞掉', async () => {
    const { sender, win, sendToMainHandler } = await setupOpenFolderHandler()
    executeResourceCommand.mockResolvedValue({
      ok: false,
      opened: false,
      reason: 'open-failed',
      path: 'D:\\docs\\assets\\demo.png',
    })

    await sendToMainHandler({ sender }, {
      event: 'open-folder',
      data: 'wj://2e2f6173736574732f64656d6f2e706e67',
    })

    expect(send).toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'warning',
        content: 'message.openResourceLocationFailed',
      },
    })
  })
})

describe('ipcMainUtil sync comparable key', () => {
  beforeEach(() => {
    vi.resetModules()
    dialogShowOpenDialogSync.mockReset()
    dialogShowSaveDialogSync.mockReset()
    executeCommand.mockReset()
    executeResourceCommand.mockReset()
    executeResourceCommandSync.mockReset()
    getLocalResourceComparableKey.mockReset()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
    browserWindowFromWebContents.mockReset()
  })

  it('应该通过 sendToMainSync 暴露本地资源比较 key 解析能力', async () => {
    let sendToMainSyncHandler
    ipcMainOn.mockImplementation((channel, handler) => {
      if (channel === 'sendToMainSync') {
        sendToMainSyncHandler = handler
      }
    })

    const sender = { id: 9527 }
    const win = { id: 1 }
    browserWindowFromWebContents.mockReturnValue(win)
    executeResourceCommandSync.mockReturnValue('wj-local-file:d:/docs/index.html')

    await import('./ipcMainUtil.js')

    const event = { sender, returnValue: null }
    sendToMainSyncHandler(event, {
      event: 'get-local-resource-comparable-key',
      data: './docs/index.html#guide',
    })

    expect(executeResourceCommandSync).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'resource.get-comparable-key', './docs/index.html#guide')
    expect(event.returnValue).toBe('wj-local-file:d:/docs/index.html')
  })

  it('新的 resource.get-comparable-key 契约也必须保持同步查询语义', async () => {
    let sendToMainSyncHandler
    ipcMainOn.mockImplementation((channel, handler) => {
      if (channel === 'sendToMainSync') {
        sendToMainSyncHandler = handler
      }
    })

    const sender = { id: 9527 }
    const win = { id: 1 }
    browserWindowFromWebContents.mockReturnValue(win)
    executeResourceCommandSync.mockReturnValue('wj-local-file:d:/docs/demo.png')

    await import('./ipcMainUtil.js')

    const event = { sender, returnValue: null }
    sendToMainSyncHandler(event, {
      event: 'resource.get-comparable-key',
      data: './docs/demo.png?size=full',
    })

    expect(executeResourceCommandSync).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'resource.get-comparable-key', './docs/demo.png?size=full')
    expect(event.returnValue).toBe('wj-local-file:d:/docs/demo.png')
  })

  it('resource.get-comparable-key 不应继续暴露在异步 sendToMain 通道', async () => {
    let sendToMainHandler
    ipcMainHandle.mockImplementation((channel, handler) => {
      if (channel === 'sendToMain') {
        sendToMainHandler = handler
      }
    })

    const sender = { id: 9527 }
    const win = { id: 1 }
    browserWindowFromWebContents.mockReturnValue(win)

    await import('./ipcMainUtil.js')

    const result = await sendToMainHandler({ sender }, {
      event: 'resource.get-comparable-key',
      data: './docs/demo.png?size=full',
    })

    expect(result).toBe(false)
    expect(executeResourceCommandSync).not.toHaveBeenCalled()
    expect(executeResourceCommand).not.toHaveBeenCalled()
  })
})

describe('ipcMainUtil save', () => {
  beforeEach(() => {
    vi.resetModules()
    dialogShowOpenDialogSync.mockReset()
    dialogShowSaveDialogSync.mockReset()
    executeCommand.mockReset()
    executeResourceCommand.mockReset()
    executeResourceCommandSync.mockReset()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
    browserWindowFromWebContents.mockReset()
    send.mockReset()
  })

  async function setupSaveHandler() {
    let sendToMainHandler
    ipcMainHandle.mockImplementation((channel, handler) => {
      if (channel === 'sendToMain') {
        sendToMainHandler = handler
      }
    })

    const sender = { id: 9527 }
    const win = { id: 1 }
    browserWindowFromWebContents.mockReturnValue(win)

    await import('./ipcMainUtil.js')
    const { default: winInfoUtil } = await import('../win/winInfoUtil.js')

    return {
      sender,
      win,
      sendToMainHandler,
      winInfoUtil,
    }
  }

  it('保存被中止时，不应继续发送保存成功提示', async () => {
    const { sender, win, sendToMainHandler, winInfoUtil } = await setupSaveHandler()
    winInfoUtil.executeCommand.mockResolvedValueOnce(false)

    await sendToMainHandler({ sender }, {
      event: 'save',
      data: null,
    })

    expect(winInfoUtil.executeCommand).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.save', null)
    expect(send).not.toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'success',
        content: 'message.saveSuccessfully',
      },
    })
  })
})

describe('ipcMainUtil command mapping', () => {
  beforeEach(() => {
    vi.resetModules()
    dialogShowOpenDialogSync.mockReset()
    executeCommand.mockReset()
    executeResourceCommand.mockReset()
    executeResourceCommandSync.mockReset()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
    browserWindowFromWebContents.mockReset()
  })

  async function setupCommandHandler() {
    let sendToMainHandler
    ipcMainHandle.mockImplementation((channel, handler) => {
      if (channel === 'sendToMain') {
        sendToMainHandler = handler
      }
    })

    const sender = { id: 9527 }
    const win = { id: 1 }
    browserWindowFromWebContents.mockReturnValue(win)

    await import('./ipcMainUtil.js')
    const { default: winInfoUtil } = await import('../win/winInfoUtil.js')

    return {
      sender,
      sendToMainHandler,
      winInfoUtil,
    }
  }

  it('open-file 未传路径时，必须映射到 document.request-open-dialog，而不是在 IPC handler 里直接弹框', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()

    await sendToMainHandler({ sender }, {
      event: 'open-file',
      data: null,
    })

    expect(winInfoUtil.executeCommand).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.request-open-dialog', null)
    expect(dialogShowOpenDialogSync).not.toHaveBeenCalled()
  })

  it('open-file 直接携带目标路径时，必须通过 dialog.open-target-selected 进入新命令模型', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()

    await sendToMainHandler({ sender }, {
      event: 'open-file',
      data: 'D:\\docs\\opened.md',
    })

    expect(winInfoUtil.executeCommand).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'dialog.open-target-selected', {
      path: 'D:\\docs\\opened.md',
    })
  })

  it('open-file 直接携带缺失路径时，旧 compat 返回值必须仍为 false，供旧 renderer 继续走移除历史记录提示', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    winInfoUtil.executeCommand.mockResolvedValueOnce({
      ok: false,
      reason: 'open-target-missing',
      path: 'D:\\docs\\missing.md',
    })

    const result = await sendToMainHandler({ sender }, {
      event: 'open-file',
      data: 'D:\\docs\\missing.md',
    })

    expect(winInfoUtil.executeCommand).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'dialog.open-target-selected', {
      path: 'D:\\docs\\missing.md',
    })
    expect(result).toBe(false)
  })

  it('open-file 直接携带非 .md 路径时，不能再回退为 false，否则 recent 菜单会误判成“文件不存在”', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    winInfoUtil.executeCommand.mockResolvedValueOnce({
      ok: false,
      reason: 'open-target-invalid-extension',
      path: 'D:\\docs\\plain.txt',
    })

    const result = await sendToMainHandler({ sender }, {
      event: 'open-file',
      data: 'D:\\docs\\plain.txt',
    })

    expect(winInfoUtil.executeCommand).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'dialog.open-target-selected', {
      path: 'D:\\docs\\plain.txt',
    })
    expect(result).toEqual({
      ok: false,
      reason: 'open-target-invalid-extension',
      path: 'D:\\docs\\plain.txt',
    })
  })

  it('document.get-session-snapshot 必须通过统一命令入口返回会话快照', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    const snapshot = {
      sessionId: 'session-1',
      content: '# 内容',
      saved: false,
    }
    winInfoUtil.executeCommand.mockResolvedValueOnce(snapshot)

    const result = await sendToMainHandler({ sender }, {
      event: 'document.get-session-snapshot',
      data: null,
    })

    expect(winInfoUtil.executeCommand).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.get-session-snapshot', null)
    expect(result).toEqual(snapshot)
  })

  it('recent.get-list 必须通过统一命令入口返回最近文件列表', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    const recentList = [
      {
        path: 'D:\\docs\\note.md',
        name: 'note.md',
      },
    ]
    winInfoUtil.executeCommand.mockResolvedValueOnce(recentList)

    const result = await sendToMainHandler({ sender }, {
      event: 'recent.get-list',
      data: null,
    })

    expect(winInfoUtil.executeCommand).toHaveBeenCalledWith({
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'recent.get-list', null)
    expect(result).toEqual(recentList)
  })

  it('get-local-resource-info / resource.get-info 必须统一委托给 documentResourceService 边界', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    winInfoUtil.executeResourceCommand.mockResolvedValue({
      ok: true,
      reason: 'resolved',
      decodedPath: './assets/demo.png',
      exists: true,
      isDirectory: false,
      isFile: true,
      path: 'D:\\docs\\assets\\demo.png',
    })

    await sendToMainHandler({ sender }, {
      event: 'get-local-resource-info',
      data: 'wj://2e2f6173736574732f64656d6f2e706e67',
    })
    await sendToMainHandler({ sender }, {
      event: 'resource.get-info',
      data: {
        resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
      },
    })

    expect(winInfoUtil.executeResourceCommand).toHaveBeenNthCalledWith(1, {
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'resource.get-info', 'wj://2e2f6173736574732f64656d6f2e706e67')
    expect(winInfoUtil.executeResourceCommand).toHaveBeenNthCalledWith(2, {
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'resource.get-info', {
      resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
    })
  })

  it('delete-local-resource / document.resource.delete-local 必须统一委托给 documentResourceService 边界', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    winInfoUtil.executeResourceCommand.mockResolvedValue({
      ok: true,
      removed: true,
      reason: 'deleted',
      path: 'D:\\docs\\assets\\demo.png',
    })

    await sendToMainHandler({ sender }, {
      event: 'delete-local-resource',
      data: 'wj://2e2f6173736574732f64656d6f2e706e67',
    })
    await sendToMainHandler({ sender }, {
      event: 'document.resource.delete-local',
      data: {
        resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
      },
    })

    expect(winInfoUtil.executeResourceCommand).toHaveBeenNthCalledWith(1, {
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.resource.delete-local', 'wj://2e2f6173736574732f64656d6f2e706e67')
    expect(winInfoUtil.executeResourceCommand).toHaveBeenNthCalledWith(2, {
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.resource.delete-local', {
      resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
    })
  })

  it('document.external.apply / document.external.ignore 必须暴露为新的统一 IPC 命令', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()

    await sendToMainHandler({ sender }, {
      event: 'document.external.apply',
      data: {
        version: 2,
      },
    })
    await sendToMainHandler({ sender }, {
      event: 'document.external.ignore',
      data: {
        version: 3,
      },
    })

    expect(winInfoUtil.executeCommand).toHaveBeenNthCalledWith(1, {
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.external.apply', {
      version: 2,
    })
    expect(winInfoUtil.executeCommand).toHaveBeenNthCalledWith(2, {
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.external.ignore', {
      version: 3,
    })
  })

  it('document.cancel-close / document.confirm-force-close 必须暴露为新的关闭确认命令', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()

    await sendToMainHandler({ sender }, {
      event: 'document.cancel-close',
      data: null,
    })
    await sendToMainHandler({ sender }, {
      event: 'document.confirm-force-close',
      data: null,
    })

    expect(winInfoUtil.executeCommand).toHaveBeenNthCalledWith(1, {
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.cancel-close', null)
    expect(winInfoUtil.executeCommand).toHaveBeenNthCalledWith(2, {
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 'document.confirm-force-close', null)
  })

  it('旧 file-external-change-apply / ignore 兼容入口也必须回流到新的统一命令', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()

    await sendToMainHandler({ sender }, {
      event: 'file-external-change-apply',
      data: {
        version: 4,
      },
    })
    await sendToMainHandler({ sender }, {
      event: 'file-external-change-ignore',
      data: {
        version: 5,
      },
    })

    expect(winInfoUtil.applyExternalPendingChange).toHaveBeenNthCalledWith(1, {
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 4)
    expect(winInfoUtil.ignoreExternalPendingChange).toHaveBeenNthCalledWith(1, {
      path: 'D:\\docs\\note.md',
      exists: true,
      win: { id: 1 },
    }, 5)
  })
})
