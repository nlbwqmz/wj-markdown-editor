import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appGetVersion,
  browserWindowFromWebContents,
  configGetConfig,
  configGetDefaultConfig,
  configSetConfig,
  configSetConfigWithRecentMax,
  configSetLanguage,
  configSetThemeGlobal,
  dialogShowOpenDialogSync,
  dialogShowSaveDialogSync,
  executeResourceCommand,
  executeResourceCommandSync,
  exportCreateExportWin,
  exportDoExport,
  fileUploadSave,
  getDocumentSessionRuntime,
  getDocumentContextMock,
  getLocalResourceComparableKey,
  getWindowByIdMock,
  getWindowIdByWinMock,
  imgCheckCallSnapshots,
  imgUtilCheck,
  imgSaveCallSnapshots,
  imgUtilSave,
  ipcMainHandle,
  ipcMainOn,
  openLocalResourceInFolder,
  recentSetMax,
  registerWindowContext,
  requestForceClose,
  resetWindowContext,
  runtimeExecuteSyncQuery,
  runtimeExecuteUiCommand,
  setDocumentContext,
  send,
  showItemInFolder,
} = vi.hoisted(() => {
  const windowByIdMap = new Map()
  const windowIdByWinMap = new Map()
  const documentContextByWindowIdMap = new Map()
  const defaultDocumentContext = {
    path: 'D:\\docs\\note.md',
    exists: true,
    content: '# 导出内容',
  }
  const emptyDocumentContext = {
    path: null,
    exists: false,
    content: '',
    saved: false,
    fileName: 'Unnamed',
  }

  function normalizeWindowId(windowId) {
    return windowId == null ? null : String(windowId)
  }

  return {
    appGetVersion: vi.fn(() => '2.15.0'),
    browserWindowFromWebContents: vi.fn(),
    configGetConfig: vi.fn(),
    configGetDefaultConfig: vi.fn(() => ({})),
    configSetConfig: vi.fn(),
    configSetConfigWithRecentMax: vi.fn(),
    configSetLanguage: vi.fn(),
    configSetThemeGlobal: vi.fn(),
    dialogShowOpenDialogSync: vi.fn(),
    dialogShowSaveDialogSync: vi.fn(),
    executeResourceCommand: vi.fn(),
    executeResourceCommandSync: vi.fn(),
    exportCreateExportWin: vi.fn(),
    exportDoExport: vi.fn(),
    fileUploadSave: vi.fn(),
    getDocumentSessionRuntime: vi.fn(),
    getDocumentContextMock: vi.fn((windowId) => {
      const normalizedWindowId = normalizeWindowId(windowId)
      if (normalizedWindowId == null) {
        return {
          ...emptyDocumentContext,
        }
      }
      const documentContext = documentContextByWindowIdMap.get(normalizedWindowId)
      return {
        ...defaultDocumentContext,
        ...(documentContext || {}),
      }
    }),
    getLocalResourceComparableKey: vi.fn(),
    getWindowByIdMock: vi.fn(windowId => windowByIdMap.get(normalizeWindowId(windowId)) || null),
    getWindowIdByWinMock: vi.fn(win => windowIdByWinMap.get(win) || null),
    imgCheckCallSnapshots: [],
    imgUtilCheck: vi.fn(),
    imgSaveCallSnapshots: [],
    imgUtilSave: vi.fn(),
    ipcMainHandle: vi.fn(),
    ipcMainOn: vi.fn(),
    openLocalResourceInFolder: vi.fn(),
    recentSetMax: vi.fn(),
    registerWindowContext: vi.fn(({ windowId, win, documentContext } = {}) => {
      const normalizedWindowId = normalizeWindowId(windowId)
      if (!normalizedWindowId || !win) {
        return
      }
      windowByIdMap.set(normalizedWindowId, win)
      windowIdByWinMap.set(win, windowId)
      if (documentContext) {
        documentContextByWindowIdMap.set(normalizedWindowId, {
          ...defaultDocumentContext,
          ...documentContext,
        })
      } else if (!documentContextByWindowIdMap.has(normalizedWindowId)) {
        documentContextByWindowIdMap.set(normalizedWindowId, {
          ...defaultDocumentContext,
        })
      }
    }),
    requestForceClose: vi.fn(),
    resetWindowContext: vi.fn(() => {
      windowByIdMap.clear()
      windowIdByWinMap.clear()
      documentContextByWindowIdMap.clear()
    }),
    runtimeExecuteSyncQuery: vi.fn(),
    runtimeExecuteUiCommand: vi.fn(),
    setDocumentContext: vi.fn((windowId, documentContext) => {
      const normalizedWindowId = normalizeWindowId(windowId)
      if (!normalizedWindowId) {
        return
      }
      documentContextByWindowIdMap.set(normalizedWindowId, {
        ...defaultDocumentContext,
        ...documentContext,
      })
    }),
    send: vi.fn(),
    showItemInFolder: vi.fn(),
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
      showItemInFolder,
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
      getConfig: configGetConfig,
      getDefaultConfig: configGetDefaultConfig,
      setConfig: configSetConfig,
      setConfigWithRecentMax: configSetConfigWithRecentMax,
      setThemeGlobal: configSetThemeGlobal,
      setLanguage: configSetLanguage,
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
      setMax: recentSetMax,
    },
  }
})

vi.mock('../fileUploadUtil.js', () => {
  return {
    default: {
      save: fileUploadSave,
    },
  }
})

vi.mock('../imgUtil.js', () => {
  return {
    default: {
      check: imgUtilCheck,
      save: imgUtilSave,
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
      createExportWin: exportCreateExportWin,
      doExport: exportDoExport,
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

vi.mock('../document-session/windowLifecycleService.js', () => {
  return {
    default: {
      createNew: vi.fn(),
      executeCommand: vi.fn(),
      executeResourceCommand,
      executeResourceCommandSync,
      getDocumentContext: getDocumentContextMock,
      getWindowById: getWindowByIdMock,
      getWindowIdByWin: getWindowIdByWinMock,
      listWindows: vi.fn(() => []),
      requestForceClose,
      publishWindowMessage: vi.fn((windowId, data) => {
        const win = getWindowByIdMock(windowId)
        if (!win) {
          return null
        }
        send(win, {
          event: 'window.effect.message',
          data,
        })
        return null
      }),
      updateTempContent: vi.fn(),
    },
  }
})

vi.mock('../document-session/documentSessionRuntime.js', () => {
  return {
    getDocumentSessionRuntime,
  }
})

vi.mock('./sendUtil.js', () => {
  return {
    default: {
      send,
    },
  }
})

describe('ipcMainUtil 文档与资源打开契约', () => {
  beforeEach(() => {
    vi.resetModules()
    configGetConfig.mockReset()
    dialogShowOpenDialogSync.mockReset()
    dialogShowSaveDialogSync.mockReset()
    executeResourceCommand.mockReset()
    executeResourceCommandSync.mockReset()
    exportCreateExportWin.mockReset()
    exportDoExport.mockReset()
    fileUploadSave.mockReset()
    getDocumentContextMock.mockClear()
    getLocalResourceComparableKey.mockReset()
    getWindowByIdMock.mockClear()
    getWindowIdByWinMock.mockClear()
    imgUtilCheck.mockReset()
    imgUtilSave.mockReset()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
    browserWindowFromWebContents.mockReset()
    openLocalResourceInFolder.mockReset()
    resetWindowContext.mockClear()
    resetWindowContext()
    requestForceClose.mockReset()
    registerWindowContext.mockClear()
    getDocumentSessionRuntime.mockReset()
    runtimeExecuteSyncQuery.mockReset()
    runtimeExecuteUiCommand.mockReset()
    setDocumentContext.mockClear()
    send.mockReset()
    showItemInFolder.mockReset()
    configGetConfig.mockReturnValue({ theme: { global: 'light' } })
    imgCheckCallSnapshots.length = 0
    imgSaveCallSnapshots.length = 0
    imgUtilCheck.mockImplementation((payload) => {
      imgCheckCallSnapshots.push({
        ...payload,
        data: payload?.data ? { ...payload.data } : payload?.data,
        config: payload?.config ? JSON.parse(JSON.stringify(payload.config)) : payload?.config,
      })
      return true
    })
    imgUtilSave.mockImplementation(async (payload) => {
      imgSaveCallSnapshots.push({
        ...payload,
        data: payload?.data ? { ...payload.data } : payload?.data,
        config: payload?.config ? JSON.parse(JSON.stringify(payload.config)) : payload?.config,
      })
      return undefined
    })
    getDocumentSessionRuntime.mockReturnValue({
      executeSyncQuery: runtimeExecuteSyncQuery,
      executeUiCommand: runtimeExecuteUiCommand,
    })
  })

  async function setupOpenFolderHandler() {
    let sendToMainHandler
    ipcMainHandle.mockImplementation((channel, handler) => {
      if (channel === 'sendToMain') {
        sendToMainHandler = handler
      }
    })

    const sender = { id: 9527 }
    const win = {
      id: 1,
      getParentWindow: () => null,
    }
    browserWindowFromWebContents.mockReturnValue(win)
    registerWindowContext({
      windowId: 1,
      win,
    })

    await import('./ipcMainUtil.js')

    return {
      sender,
      win,
      sendToMainHandler,
    }
  }

  async function dispatchDocumentResourceOpen({
    sender,
    sendToMainHandler,
    data,
    openResult,
  }) {
    executeResourceCommand.mockResolvedValueOnce(openResult)
    runtimeExecuteUiCommand.mockResolvedValueOnce(openResult)

    const result = await sendToMainHandler({ sender }, {
      event: 'document.resource.open-in-folder',
      data,
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.resource.open-in-folder', data)
    expect(executeResourceCommand).not.toHaveBeenCalled()
    return result
  }

  it('资源不存在时，应该通过 window.effect.message 向渲染进程发送文件不存在提示', async () => {
    const { sender, win, sendToMainHandler } = await setupOpenFolderHandler()
    const openResult = {
      ok: true,
      opened: false,
      reason: 'not-found',
      path: 'D:\\docs\\assets\\missing.md',
    }

    const result = await dispatchDocumentResourceOpen({
      sender,
      sendToMainHandler,
      data: 'wj://2e2f6173736574732f6d697373696e672e6d64',
      openResult,
    })

    expect(result).toEqual(openResult)
    expect(send).toHaveBeenCalledWith(win, {
      event: 'window.effect.message',
      data: {
        type: 'warning',
        content: 'message.theFileDoesNotExist',
      },
    })
  })

  it('资源 payload 非法时，应该通过 window.effect.message 向渲染进程发送无效资源提示', async () => {
    const { sender, win, sendToMainHandler } = await setupOpenFolderHandler()
    const openResult = {
      ok: false,
      opened: false,
      reason: 'invalid-resource-payload',
      path: null,
    }

    const result = await dispatchDocumentResourceOpen({
      sender,
      sendToMainHandler,
      data: 'wj://zz',
      openResult,
    })

    expect(result).toEqual(openResult)
    expect(send).toHaveBeenCalledWith(win, {
      event: 'window.effect.message',
      data: {
        type: 'warning',
        content: 'message.invalidLocalResourceLink',
      },
    })
  })

  it('未保存文档中的相对资源打开失败时，应该通过 window.effect.message 向渲染进程发送明确提示', async () => {
    const { sender, win, sendToMainHandler } = await setupOpenFolderHandler()
    const openResult = {
      ok: false,
      opened: false,
      reason: 'relative-resource-without-document',
      path: null,
    }

    const result = await dispatchDocumentResourceOpen({
      sender,
      sendToMainHandler,
      data: 'wj://2e2f6173736574732f64656d6f2e706e67',
      openResult,
    })

    expect(result).toEqual(openResult)
    expect(send).toHaveBeenCalledWith(win, {
      event: 'window.effect.message',
      data: {
        type: 'warning',
        content: 'message.relativeResourceRequiresSavedFile',
      },
    })
  })

  it('打开请求携带原始路径提示时，应该原样透传给资源打开逻辑', async () => {
    const { sender, sendToMainHandler } = await setupOpenFolderHandler()
    const openPayload = {
      resourceUrl: 'wj://2e2f646f63732f696e6465782e68746d6c236775696465',
      rawPath: './docs/index.html#guide',
    }
    const openResult = {
      ok: true,
      opened: true,
      reason: 'opened',
      path: 'D:\\docs\\docs\\index.html',
    }

    const result = await dispatchDocumentResourceOpen({
      sender,
      sendToMainHandler,
      data: openPayload,
      openResult,
    })

    expect(result).toEqual(openResult)
  })

  it('document.open-in-folder 在当前文档已保存时，必须直接打开所在目录并返回结构化结果', async () => {
    const { sender, sendToMainHandler } = await setupOpenFolderHandler()

    const result = await sendToMainHandler({ sender }, {
      event: 'document.open-in-folder',
    })

    expect(showItemInFolder).toHaveBeenCalledWith('D:\\docs\\note.md')
    expect(result).toEqual({
      ok: true,
      opened: true,
      reason: 'opened',
      path: 'D:\\docs\\note.md',
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('document.open-in-folder 在当前文档未保存时，必须返回结构化失败结果，由 renderer 自行提示', async () => {
    const { sender, sendToMainHandler } = await setupOpenFolderHandler()
    setDocumentContext(1, {
      path: null,
      exists: false,
    })

    const result = await sendToMainHandler({ sender }, {
      event: 'document.open-in-folder',
    })

    expect(showItemInFolder).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      opened: false,
      reason: 'document-not-saved',
      path: null,
    })
  })

  it('新的 document.resource.open-in-folder 契约也必须先经 runtime 统一命令入口，再由 runtime 决定资源边界', async () => {
    const { sender, sendToMainHandler } = await setupOpenFolderHandler()
    const openPayload = {
      resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
    }
    const openResult = {
      ok: true,
      opened: true,
      reason: 'opened',
      path: 'D:\\docs\\assets\\demo.png',
    }

    const result = await dispatchDocumentResourceOpen({
      sender,
      sendToMainHandler,
      data: openPayload,
      openResult,
    })

    expect(result).toEqual(openResult)
  })

  it('资源管理器打开失败时，应该通过 window.effect.message 向渲染进程发送明确失败提示，而不是静默吞掉', async () => {
    const { sender, win, sendToMainHandler } = await setupOpenFolderHandler()
    const openResult = {
      ok: false,
      opened: false,
      reason: 'open-failed',
      path: 'D:\\docs\\assets\\demo.png',
    }

    const result = await dispatchDocumentResourceOpen({
      sender,
      sendToMainHandler,
      data: 'wj://2e2f6173736574732f64656d6f2e706e67',
      openResult,
    })

    expect(result).toEqual(openResult)
    expect(send).toHaveBeenCalledWith(win, {
      event: 'window.effect.message',
      data: {
        type: 'warning',
        content: 'message.openResourceLocationFailed',
      },
    })
  })

  it('open-folder 旧兼容入口必须已经删除，避免 renderer 继续依赖旧命令名', async () => {
    const { sender, sendToMainHandler } = await setupOpenFolderHandler()

    const result = await sendToMainHandler({ sender }, {
      event: 'open-folder',
    })

    expect(result).toBe(false)
  })
})

describe('ipcMainUtil sync comparable key', () => {
  beforeEach(() => {
    vi.resetModules()
    configGetConfig.mockReset()
    dialogShowOpenDialogSync.mockReset()
    dialogShowSaveDialogSync.mockReset()
    executeResourceCommand.mockReset()
    executeResourceCommandSync.mockReset()
    exportCreateExportWin.mockReset()
    exportDoExport.mockReset()
    fileUploadSave.mockReset()
    getDocumentContextMock.mockClear()
    getLocalResourceComparableKey.mockReset()
    getDocumentSessionRuntime.mockReset()
    getWindowByIdMock.mockClear()
    getWindowIdByWinMock.mockClear()
    registerWindowContext.mockClear()
    requestForceClose.mockReset()
    resetWindowContext.mockClear()
    resetWindowContext()
    setDocumentContext.mockClear()
    imgUtilCheck.mockReset()
    imgUtilSave.mockReset()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
    runtimeExecuteSyncQuery.mockReset()
    runtimeExecuteUiCommand.mockReset()
    browserWindowFromWebContents.mockReset()
    configGetConfig.mockReturnValue({ theme: { global: 'light' } })
    imgCheckCallSnapshots.length = 0
    imgSaveCallSnapshots.length = 0
    imgUtilCheck.mockImplementation((payload) => {
      imgCheckCallSnapshots.push({
        ...payload,
        data: payload?.data ? { ...payload.data } : payload?.data,
        config: payload?.config ? JSON.parse(JSON.stringify(payload.config)) : payload?.config,
      })
      return true
    })
    imgUtilSave.mockImplementation(async (payload) => {
      imgSaveCallSnapshots.push({
        ...payload,
        data: payload?.data ? { ...payload.data } : payload?.data,
        config: payload?.config ? JSON.parse(JSON.stringify(payload.config)) : payload?.config,
      })
      return undefined
    })
    getDocumentSessionRuntime.mockReturnValue({
      executeSyncQuery: runtimeExecuteSyncQuery,
      executeUiCommand: runtimeExecuteUiCommand,
    })
  })

  it('get-local-resource-comparable-key 旧别名必须已经删除，避免 renderer 继续依赖兼容通道', async () => {
    let sendToMainSyncHandler
    ipcMainOn.mockImplementation((channel, handler) => {
      if (channel === 'sendToMainSync') {
        sendToMainSyncHandler = handler
      }
    })

    const sender = { id: 9527 }
    const win = { id: 1 }
    browserWindowFromWebContents.mockReturnValue(win)

    await import('./ipcMainUtil.js')

    const event = { sender, returnValue: null }
    sendToMainSyncHandler(event, {
      event: 'get-local-resource-comparable-key',
      data: './docs/index.html#guide',
    })

    expect(event.returnValue).toBeNull()
    expect(executeResourceCommandSync).not.toHaveBeenCalled()
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
    registerWindowContext({
      windowId: 1,
      win,
    })
    executeResourceCommandSync.mockReturnValue('wj-local-file:d:/docs/demo.png')
    runtimeExecuteSyncQuery.mockReturnValue('wj-local-file:d:/docs/demo.png')

    await import('./ipcMainUtil.js')

    const event = { sender, returnValue: null }
    sendToMainSyncHandler(event, {
      event: 'resource.get-comparable-key',
      data: './docs/demo.png?size=full',
    })

    expect(runtimeExecuteSyncQuery).toHaveBeenCalledWith(1, 'resource.get-comparable-key', './docs/demo.png?size=full')
    expect(executeResourceCommandSync).not.toHaveBeenCalled()
    expect(event.returnValue).toBe('wj-local-file:d:/docs/demo.png')
  })

  it('sender 无法映射到窗口时，resource.get-comparable-key 必须平稳返回 null，供 renderer 继续回退到 rawPath', async () => {
    let sendToMainSyncHandler
    ipcMainOn.mockImplementation((channel, handler) => {
      if (channel === 'sendToMainSync') {
        sendToMainSyncHandler = handler
      }
    })

    const sender = { id: 9527 }
    const orphanWin = {
      id: 404,
      getParentWindow: () => null,
    }
    browserWindowFromWebContents.mockReturnValue(orphanWin)

    await import('./ipcMainUtil.js')

    const event = { sender, returnValue: 'initial' }

    expect(() => {
      sendToMainSyncHandler(event, {
        event: 'resource.get-comparable-key',
        data: './docs/demo.png?size=full',
      })
    }).not.toThrow()
    expect(runtimeExecuteSyncQuery).not.toHaveBeenCalled()
    expect(event.returnValue).toBeNull()
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
    configGetConfig.mockReset()
    dialogShowOpenDialogSync.mockReset()
    dialogShowSaveDialogSync.mockReset()
    executeResourceCommand.mockReset()
    executeResourceCommandSync.mockReset()
    exportCreateExportWin.mockReset()
    exportDoExport.mockReset()
    fileUploadSave.mockReset()
    getDocumentContextMock.mockClear()
    getDocumentSessionRuntime.mockReset()
    getWindowByIdMock.mockClear()
    getWindowIdByWinMock.mockClear()
    registerWindowContext.mockClear()
    requestForceClose.mockReset()
    resetWindowContext.mockClear()
    resetWindowContext()
    setDocumentContext.mockClear()
    imgUtilCheck.mockReset()
    imgUtilSave.mockReset()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
    browserWindowFromWebContents.mockReset()
    runtimeExecuteSyncQuery.mockReset()
    runtimeExecuteUiCommand.mockReset()
    send.mockReset()
    configGetConfig.mockReturnValue({ theme: { global: 'light' } })
    imgCheckCallSnapshots.length = 0
    imgSaveCallSnapshots.length = 0
    imgUtilCheck.mockImplementation((payload) => {
      imgCheckCallSnapshots.push({
        ...payload,
        data: payload?.data ? { ...payload.data } : payload?.data,
        config: payload?.config ? JSON.parse(JSON.stringify(payload.config)) : payload?.config,
      })
      return true
    })
    imgUtilSave.mockImplementation(async (payload) => {
      imgSaveCallSnapshots.push({
        ...payload,
        data: payload?.data ? { ...payload.data } : payload?.data,
        config: payload?.config ? JSON.parse(JSON.stringify(payload.config)) : payload?.config,
      })
      return undefined
    })
    getDocumentSessionRuntime.mockReturnValue({
      executeSyncQuery: runtimeExecuteSyncQuery,
      executeUiCommand: runtimeExecuteUiCommand,
    })
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
    registerWindowContext({
      windowId: 1,
      win,
    })

    await import('./ipcMainUtil.js')
    const { default: winInfoUtil } = await import('../document-session/windowLifecycleService.js')
    winInfoUtil.executeCommand.mockReset()
    winInfoUtil.requestForceClose.mockReset()
    winInfoUtil.updateTempContent.mockReset()

    return {
      sender,
      win,
      sendToMainHandler,
      winInfoUtil,
    }
  }

  it('保存被中止时，不应继续发送保存成功提示', async () => {
    const { sender, win, sendToMainHandler, winInfoUtil } = await setupSaveHandler()
    runtimeExecuteUiCommand.mockResolvedValueOnce(false)

    const result = await sendToMainHandler({ sender }, {
      event: 'document.save',
      data: null,
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.save', null)
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
    expect(result).toBe(false)
    const saveSuccessMessages = send.mock.calls.filter(([targetWin, payload]) => {
      return targetWin === win
        && payload?.event === 'window.effect.message'
        && payload?.data?.type === 'success'
        && payload?.data?.content === 'message.saveSuccessfully'
    })
    expect(saveSuccessMessages).toHaveLength(0)
  })

  it('document.save-copy 直连入口必须直接命中新命令，避免 renderer 迁移后继续依赖 save-other', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupSaveHandler()
    runtimeExecuteUiCommand.mockResolvedValueOnce({
      ok: true,
      reason: 'copy-triggered',
    })

    const result = await sendToMainHandler({ sender }, {
      event: 'document.save-copy',
      data: null,
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.save-copy', null)
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      reason: 'copy-triggered',
    })
  })
})

describe('ipcMainUtil 工具模块参数组装', () => {
  beforeEach(() => {
    vi.resetModules()
    configGetConfig.mockReset()
    dialogShowOpenDialogSync.mockReset()
    dialogShowSaveDialogSync.mockReset()
    executeResourceCommand.mockReset()
    executeResourceCommandSync.mockReset()
    exportCreateExportWin.mockReset()
    exportDoExport.mockReset()
    fileUploadSave.mockReset()
    getDocumentContextMock.mockClear()
    getDocumentSessionRuntime.mockReset()
    getWindowByIdMock.mockClear()
    getWindowIdByWinMock.mockClear()
    registerWindowContext.mockClear()
    requestForceClose.mockReset()
    resetWindowContext.mockClear()
    resetWindowContext()
    setDocumentContext.mockClear()
    imgUtilCheck.mockReset()
    imgUtilSave.mockReset()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
    browserWindowFromWebContents.mockReset()
    runtimeExecuteSyncQuery.mockReset()
    runtimeExecuteUiCommand.mockReset()
    send.mockReset()
    configGetConfig.mockReturnValue({ theme: { global: 'light' } })
    imgCheckCallSnapshots.length = 0
    imgSaveCallSnapshots.length = 0
    imgUtilCheck.mockImplementation((payload) => {
      imgCheckCallSnapshots.push({
        ...payload,
        data: payload?.data ? { ...payload.data } : payload?.data,
        config: payload?.config ? JSON.parse(JSON.stringify(payload.config)) : payload?.config,
      })
      return true
    })
    imgUtilSave.mockImplementation(async (payload) => {
      imgSaveCallSnapshots.push({
        ...payload,
        data: payload?.data ? { ...payload.data } : payload?.data,
        config: payload?.config ? JSON.parse(JSON.stringify(payload.config)) : payload?.config,
      })
      return undefined
    })
    getDocumentSessionRuntime.mockReturnValue({
      executeSyncQuery: runtimeExecuteSyncQuery,
      executeUiCommand: runtimeExecuteUiCommand,
    })
  })

  async function setupToolHandler() {
    let sendToMainHandler
    ipcMainHandle.mockImplementation((channel, handler) => {
      if (channel === 'sendToMain') {
        sendToMainHandler = handler
      }
    })

    const sender = { id: 9527 }
    const win = { id: 1 }
    browserWindowFromWebContents.mockReturnValue(win)
    registerWindowContext({
      windowId: 1,
      win,
    })

    await import('./ipcMainUtil.js')

    return {
      sender,
      win,
      sendToMainHandler,
    }
  }

  it('upload-image 必须把 win、documentPath、data、config 和 notify 组装成显式参数对象传给 imgUtil', async () => {
    const { sender, win, sendToMainHandler } = await setupToolHandler()
    configGetConfig.mockReturnValue({
      imgLocal: '4',
      imgNetwork: '4',
      imgRelativePath: 'assets',
      theme: { global: 'light' },
    })
    imgUtilSave.mockImplementationOnce(async (payload) => {
      imgSaveCallSnapshots.push({
        ...payload,
        data: payload?.data ? { ...payload.data } : payload?.data,
        config: payload?.config ? JSON.parse(JSON.stringify(payload.config)) : payload?.config,
      })
      return { name: 'image.png', path: 'assets/image.png' }
    })

    const result = await sendToMainHandler({ sender }, {
      event: 'upload-image',
      data: {
        mode: 'local',
        name: 'image',
        base64: 'data:image/png;base64,AAAA',
      },
    })

    expect(result).toEqual({ name: 'image.png', path: 'assets/image.png' })
    expect(imgCheckCallSnapshots).toHaveLength(1)
    expect(imgCheckCallSnapshots[0]).toEqual(expect.objectContaining({
      win,
      documentPath: 'D:\\docs\\note.md',
      data: {
        mode: 'local',
        name: 'image',
        base64: 'data:image/png;base64,AAAA',
      },
      config: {
        imgLocal: '4',
        imgNetwork: '4',
        imgRelativePath: 'assets',
        theme: { global: 'light' },
      },
      notify: expect.any(Function),
    }))
    expect(imgSaveCallSnapshots).toHaveLength(1)
    expect(imgSaveCallSnapshots[0]).toEqual(expect.objectContaining({
      win,
      documentPath: 'D:\\docs\\note.md',
      data: {
        mode: 'local',
        name: 'image.png',
        base64: 'data:image/png;base64,AAAA',
      },
      config: {
        imgLocal: '4',
        imgNetwork: '4',
        imgRelativePath: 'assets',
        theme: { global: 'light' },
      },
      notify: expect.any(Function),
    }))

    const notify = imgUtilSave.mock.calls[0][0].notify
    notify({ type: 'success', content: 'message.imageSavedSuccessfully' })
    expect(send).toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'success',
        content: 'message.imageSavedSuccessfully',
      },
    })
  })

  it('file-upload 必须把 win、documentPath、filePath、config 和 notify 组装成显式参数对象传给 fileUploadUtil', async () => {
    const { sender, win, sendToMainHandler } = await setupToolHandler()
    configGetConfig.mockReturnValue({
      fileMode: '4',
      fileRelativePath: 'files',
      theme: { global: 'light' },
    })
    fileUploadSave.mockResolvedValueOnce({ name: 'demo.pdf', path: 'files/demo.pdf' })

    const result = await sendToMainHandler({ sender }, {
      event: 'file-upload',
      data: 'C:\\upload\\demo.pdf',
    })

    expect(result).toEqual({ name: 'demo.pdf', path: 'files/demo.pdf' })
    expect(fileUploadSave).toHaveBeenCalledWith(expect.objectContaining({
      win,
      documentPath: 'D:\\docs\\note.md',
      filePath: 'C:\\upload\\demo.pdf',
      config: {
        fileMode: '4',
        fileRelativePath: 'files',
        theme: { global: 'light' },
      },
      notify: expect.any(Function),
    }))

    const notify = fileUploadSave.mock.calls[0][0].notify
    notify({ type: 'success', content: 'message.theFileIsSavedSuccessfully' })
    expect(send).toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'success',
        content: 'message.theFileIsSavedSuccessfully',
      },
    })
  })

  it('export-start 必须把 parentWindow、documentContext、type 和 notify 组装成显式参数对象传给 exportUtil.createExportWin', async () => {
    const { sender, win, sendToMainHandler } = await setupToolHandler()

    await sendToMainHandler({ sender }, {
      event: 'export-start',
      data: 'PDF',
    })

    expect(exportCreateExportWin).toHaveBeenCalledWith(expect.objectContaining({
      parentWindow: win,
      documentContext: expect.objectContaining({
        path: 'D:\\docs\\note.md',
        content: '# 导出内容',
      }),
      type: 'PDF',
      notify: expect.any(Function),
    }))

    const notify = exportCreateExportWin.mock.calls[0][0].notify
    notify({ type: 'loading', content: 'message.exporting' })
    expect(send).toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'loading',
        content: 'message.exporting',
      },
    })
  })

  it('export-end 必须把 data 和 notify 组装成显式参数对象传给 exportUtil.doExport', async () => {
    const { sender, win, sendToMainHandler } = await setupToolHandler()
    exportDoExport.mockResolvedValueOnce({ ok: true })

    const exportData = {
      type: 'PDF',
      filePath: 'D:\\exports\\demo.pdf',
    }

    const result = await sendToMainHandler({ sender }, {
      event: 'export-end',
      data: exportData,
    })

    expect(result).toEqual({ ok: true })
    expect(exportDoExport).toHaveBeenCalledTimes(1)
    expect(exportDoExport.mock.calls[0]).toHaveLength(1)
    expect(exportDoExport).toHaveBeenCalledWith(expect.objectContaining({
      data: exportData,
      notify: expect.any(Function),
    }))

    const notify = exportDoExport.mock.calls[0][0].notify
    notify({ type: 'success', content: 'message.exportSuccessfully' })
    expect(send).toHaveBeenCalledWith(win, {
      event: 'message',
      data: {
        type: 'success',
        content: 'message.exportSuccessfully',
      },
    })
  })
})

describe('ipcMainUtil command mapping', () => {
  beforeEach(() => {
    vi.resetModules()
    configGetConfig.mockReset()
    dialogShowOpenDialogSync.mockReset()
    executeResourceCommand.mockReset()
    executeResourceCommandSync.mockReset()
    exportCreateExportWin.mockReset()
    exportDoExport.mockReset()
    fileUploadSave.mockReset()
    getDocumentContextMock.mockClear()
    getDocumentSessionRuntime.mockReset()
    getWindowByIdMock.mockClear()
    getWindowIdByWinMock.mockClear()
    registerWindowContext.mockClear()
    requestForceClose.mockReset()
    resetWindowContext.mockClear()
    resetWindowContext()
    setDocumentContext.mockClear()
    imgUtilCheck.mockReset()
    imgUtilSave.mockReset()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
    browserWindowFromWebContents.mockReset()
    runtimeExecuteSyncQuery.mockReset()
    runtimeExecuteUiCommand.mockReset()
    configGetConfig.mockReturnValue({ theme: { global: 'light' } })
    imgCheckCallSnapshots.length = 0
    imgSaveCallSnapshots.length = 0
    imgUtilCheck.mockImplementation((payload) => {
      imgCheckCallSnapshots.push({
        ...payload,
        data: payload?.data ? { ...payload.data } : payload?.data,
        config: payload?.config ? JSON.parse(JSON.stringify(payload.config)) : payload?.config,
      })
      return true
    })
    imgUtilSave.mockImplementation(async (payload) => {
      imgSaveCallSnapshots.push({
        ...payload,
        data: payload?.data ? { ...payload.data } : payload?.data,
        config: payload?.config ? JSON.parse(JSON.stringify(payload.config)) : payload?.config,
      })
      return undefined
    })
    getDocumentSessionRuntime.mockReturnValue({
      executeSyncQuery: runtimeExecuteSyncQuery,
      executeUiCommand: runtimeExecuteUiCommand,
    })
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
    registerWindowContext({
      windowId: 1,
      win,
    })

    await import('./ipcMainUtil.js')
    const { default: winInfoUtil } = await import('../document-session/windowLifecycleService.js')
    winInfoUtil.executeCommand.mockReset()
    winInfoUtil.updateTempContent.mockReset()

    return {
      sender,
      sendToMainHandler,
      winInfoUtil,
    }
  }

  async function dispatchRuntimeResourceCommand({
    sender,
    sendToMainHandler,
    winInfoUtil,
    event,
    data,
    result,
  }) {
    winInfoUtil.executeResourceCommand.mockResolvedValueOnce(result)
    runtimeExecuteUiCommand.mockResolvedValueOnce(result)

    const commandResult = await sendToMainHandler({ sender }, {
      event,
      data,
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, event, data)
    expect(winInfoUtil.executeResourceCommand).not.toHaveBeenCalled()
    return commandResult
  }

  it('document.request-open-dialog 直连入口必须直接走统一命令流', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()

    await sendToMainHandler({ sender }, {
      event: 'document.request-open-dialog',
      data: null,
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.request-open-dialog', null)
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
    expect(dialogShowOpenDialogSync).not.toHaveBeenCalled()
  })

  it('document.open-path 直连入口必须直接把结构化 payload 送入新命令', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()

    await sendToMainHandler({ sender }, {
      event: 'document.open-path',
      data: {
        path: 'D:\\docs\\opened.md',
      },
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.open-path', {
      path: 'D:\\docs\\opened.md',
    })
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
  })

  it('document.open-path 如果显式提供 baseDir，也必须原样透传给统一命令流，不能在 IPC 层丢失', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()

    await sendToMainHandler({ sender }, {
      event: 'document.open-path',
      data: {
        path: 'docs\\opened.md',
        baseDir: 'D:\\workspace',
        trigger: 'second-instance',
      },
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.open-path', {
      path: 'docs\\opened.md',
      baseDir: 'D:\\workspace',
      trigger: 'second-instance',
    })
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
  })

  it('document.open-path 命中缺失路径时，必须把结构化失败结果原样返回给新 renderer', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    runtimeExecuteUiCommand.mockResolvedValueOnce({
      ok: false,
      reason: 'open-target-missing',
      path: 'D:\\docs\\missing.md',
    })

    const result = await sendToMainHandler({ sender }, {
      event: 'document.open-path',
      data: {
        path: 'D:\\docs\\missing.md',
      },
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.open-path', {
      path: 'D:\\docs\\missing.md',
    })
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      reason: 'open-target-missing',
      path: 'D:\\docs\\missing.md',
    })
  })

  it('document.open-path 命中非 .md 路径时，也必须保留结构化失败结果供 renderer 判定', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    runtimeExecuteUiCommand.mockResolvedValueOnce({
      ok: false,
      reason: 'open-target-invalid-extension',
      path: 'D:\\docs\\plain.txt',
    })

    const result = await sendToMainHandler({ sender }, {
      event: 'document.open-path',
      data: {
        path: 'D:\\docs\\plain.txt',
      },
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.open-path', {
      path: 'D:\\docs\\plain.txt',
    })
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
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
    runtimeExecuteUiCommand.mockResolvedValueOnce(snapshot)

    const result = await sendToMainHandler({ sender }, {
      event: 'document.get-session-snapshot',
      data: null,
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.get-session-snapshot', null)
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
    expect(result).toEqual(snapshot)
  })

  it('导出子窗口请求 document.get-session-snapshot 时，必须能回退到父窗口的 session 上下文', async () => {
    const parentWin = { id: 1 }
    const childWin = {
      id: 2,
      getParentWindow: () => parentWin,
    }
    browserWindowFromWebContents.mockReturnValue(childWin)
    registerWindowContext({
      windowId: 1,
      win: parentWin,
    })

    await import('./ipcMainUtil.js')
    const snapshot = {
      sessionId: 'session-export-parent',
      content: '# 导出内容',
      saved: true,
    }
    runtimeExecuteUiCommand.mockResolvedValueOnce(snapshot)
    const sendToMainHandler = ipcMainHandle.mock.calls.find(([channel]) => channel === 'sendToMain')?.[1]
    const sender = { id: 9527 }

    const result = await sendToMainHandler({ sender }, {
      event: 'document.get-session-snapshot',
      data: null,
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.get-session-snapshot', null)
    expect(result).toEqual(snapshot)
  })

  it('recent.clear / recent.remove 必须只暴露新的统一 IPC 命令', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()

    await sendToMainHandler({ sender }, {
      event: 'recent.clear',
      data: null,
    })
    await sendToMainHandler({ sender }, {
      event: 'recent.remove',
      data: {
        path: 'D:\\docs\\note.md',
      },
    })

    expect(runtimeExecuteUiCommand).toHaveBeenNthCalledWith(1, 1, 'recent.clear', null)
    expect(runtimeExecuteUiCommand).toHaveBeenNthCalledWith(2, 1, 'recent.remove', {
      path: 'D:\\docs\\note.md',
    })
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
  })

  it('recent.get-list 必须通过统一命令入口返回最近文件列表', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    const recentList = [
      {
        path: 'D:\\docs\\note.md',
        name: 'note.md',
      },
    ]
    runtimeExecuteUiCommand.mockResolvedValueOnce(recentList)

    const result = await sendToMainHandler({ sender }, {
      event: 'recent.get-list',
      data: null,
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'recent.get-list', null)
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
    expect(result).toEqual(recentList)
  })

  it('resource.get-info 必须先经 runtime 统一命令入口，并返回结构化资源信息', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    const infoPayload = {
      resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
    }
    const infoResult = {
      ok: true,
      reason: 'resolved',
      decodedPath: './assets/demo.png',
      exists: true,
      isDirectory: false,
      isFile: true,
      path: 'D:\\docs\\assets\\demo.png',
    }

    const result = await dispatchRuntimeResourceCommand({
      sender,
      sendToMainHandler,
      winInfoUtil,
      event: 'resource.get-info',
      data: infoPayload,
      result: infoResult,
    })

    expect(result).toEqual(infoResult)
  })

  it('document.resource.delete-local 必须先经 runtime 统一命令入口，并返回结构化删除结果', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    const deletePayload = {
      resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
    }
    const deleteResult = {
      ok: true,
      removed: true,
      reason: 'deleted',
      path: 'D:\\docs\\assets\\demo.png',
    }

    const result = await dispatchRuntimeResourceCommand({
      sender,
      sendToMainHandler,
      winInfoUtil,
      event: 'document.resource.delete-local',
      data: deletePayload,
      result: deleteResult,
    })

    expect(result).toEqual(deleteResult)
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

    expect(runtimeExecuteUiCommand).toHaveBeenNthCalledWith(1, 1, 'document.external.apply', {
      version: 2,
    })
    expect(runtimeExecuteUiCommand).toHaveBeenNthCalledWith(2, 1, 'document.external.ignore', {
      version: 3,
    })
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
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

    expect(runtimeExecuteUiCommand).toHaveBeenNthCalledWith(1, 1, 'document.cancel-close', null)
    expect(runtimeExecuteUiCommand).toHaveBeenNthCalledWith(2, 1, 'document.confirm-force-close', null)
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
  })

  it('force-close 必须先委托 requestForceClose，再由 IPC 层触发 win.close，且不能透传 requestForceClose 返回值', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()
    const close = vi.fn()
    const win = { id: 1, close }
    registerWindowContext({
      windowId: 1,
      win,
    })
    winInfoUtil.requestForceClose.mockReturnValueOnce(true)

    const result = await sendToMainHandler({ sender }, {
      event: 'force-close',
      data: null,
    })

    expect(winInfoUtil.requestForceClose).toHaveBeenCalledWith(1)
    expect(close).toHaveBeenCalledTimes(1)
    expect(winInfoUtil.requestForceClose.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0])
    expect(result).toBeUndefined()
    expect(runtimeExecuteUiCommand).not.toHaveBeenCalled()
  })

  it('document.edit 必须把结构化正文 payload 送入 runtime 命令流', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()

    await sendToMainHandler({ sender }, {
      event: 'document.edit',
      data: {
        content: '# 新正文',
      },
    })

    expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.edit', {
      content: '# 新正文',
    })
    expect(winInfoUtil.updateTempContent).not.toHaveBeenCalled()
  })

  it('已迁移完成的旧 session IPC 入口必须直接删除，不能继续保留死别名', async () => {
    const { sender, sendToMainHandler, winInfoUtil } = await setupCommandHandler()

    const removedLegacyResults = await Promise.all([
      sendToMainHandler({ sender }, { event: 'save', data: null }),
      sendToMainHandler({ sender }, { event: 'save-other', data: null }),
      sendToMainHandler({ sender }, { event: 'open-file', data: null }),
      sendToMainHandler({ sender }, { event: 'open-file', data: 'D:\\docs\\legacy.md' }),
      sendToMainHandler({ sender }, { event: 'get-file-info', data: null }),
      sendToMainHandler({ sender }, { event: 'recent-clear', data: null }),
      sendToMainHandler({ sender }, { event: 'recent-remove', data: { path: 'D:\\docs\\legacy.md' } }),
      sendToMainHandler({ sender }, { event: 'get-recent-list', data: null }),
      sendToMainHandler({ sender }, { event: 'file-external-change-apply', data: { version: 4 } }),
      sendToMainHandler({ sender }, { event: 'file-external-change-ignore', data: { version: 5 } }),
      sendToMainHandler({ sender }, { event: 'file-content-update', data: '# 旧正文' }),
      sendToMainHandler({ sender }, { event: 'delete-local-resource', data: 'wj://2e2f6173736574732f64656d6f2e706e67' }),
      sendToMainHandler({ sender }, { event: 'get-local-resource-info', data: 'wj://2e2f6173736574732f64656d6f2e706e67' }),
    ])

    expect(removedLegacyResults).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
    expect(winInfoUtil.executeCommand).not.toHaveBeenCalled()
    expect(winInfoUtil.executeResourceCommand).not.toHaveBeenCalled()
    expect(winInfoUtil.updateTempContent).not.toHaveBeenCalled()
  })
})

describe('ipcMainUtil 配置更新契约', () => {
  let consoleErrorSpy

  beforeEach(() => {
    vi.resetModules()
    browserWindowFromWebContents.mockReset()
    configGetConfig.mockReset()
    configGetDefaultConfig.mockReset()
    configSetConfig.mockReset()
    configSetConfigWithRecentMax.mockReset()
    configSetLanguage.mockReset()
    configSetThemeGlobal.mockReset()
    getDocumentSessionRuntime.mockReset()
    getWindowByIdMock.mockClear()
    getWindowIdByWinMock.mockClear()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
    recentSetMax.mockReset()
    registerWindowContext.mockClear()
    resetWindowContext.mockClear()
    resetWindowContext()
    runtimeExecuteSyncQuery.mockReset()
    runtimeExecuteUiCommand.mockReset()
    browserWindowFromWebContents.mockReset()
    configGetConfig.mockReturnValue({ theme: { global: 'light' } })
    configGetDefaultConfig.mockReturnValue({
      theme: { global: 'dark' },
      recentMax: 12,
    })
    getDocumentSessionRuntime.mockReturnValue({
      executeSyncQuery: runtimeExecuteSyncQuery,
      executeUiCommand: runtimeExecuteUiCommand,
    })
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy?.mockRestore()
  })

  async function setupConfigHandler() {
    let sendToMainHandler
    ipcMainHandle.mockImplementation((channel, handler) => {
      if (channel === 'sendToMain') {
        sendToMainHandler = handler
      }
    })

    const sender = { id: 9527 }
    const win = { id: 1 }
    browserWindowFromWebContents.mockReturnValue(win)
    registerWindowContext({
      windowId: 1,
      win,
    })

    await import('./ipcMainUtil.js')

    return {
      sender,
      sendToMainHandler,
    }
  }

  async function dispatch(event, payload) {
    const { sender, sendToMainHandler } = await setupConfigHandler()
    return await sendToMainHandler({ sender }, {
      event,
      data: payload,
    })
  }

  it('user-update-config 在配置写盘失败时必须返回 messageKey，而不是直接抛出中文提示', async () => {
    const payload = {
      recentMax: 7,
      theme: { global: 'dark' },
    }
    configSetConfigWithRecentMax.mockResolvedValueOnce({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })

    await expect(dispatch('user-update-config', payload)).resolves.toEqual({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })
  })

  it('user-update-config 在配置写盘失败时不得继续触发 recent.setMax', async () => {
    const payload = {
      recentMax: 9,
    }
    configSetConfigWithRecentMax.mockResolvedValueOnce({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    await dispatch('user-update-config', payload)

    expect(recentSetMax).not.toHaveBeenCalled()
  })

  it('user-update-config 在配置服务整体成功时必须返回结构化成功结果，且 IPC 不再单独调用 recent.setMax', async () => {
    const payload = {
      recentMax: 15,
      startupPage: 'editor',
    }
    configSetConfigWithRecentMax.mockResolvedValueOnce({ ok: true })

    await expect(dispatch('user-update-config', payload)).resolves.toEqual({ ok: true })
    expect(configSetConfigWithRecentMax).toHaveBeenCalledWith(payload, expect.objectContaining({
      setMax: recentSetMax,
    }))
    expect(configSetConfig).not.toHaveBeenCalled()
    expect(recentSetMax).not.toHaveBeenCalled()
  })

  it('user-update-config 在配置服务返回结构化失败时必须透传整体失败结果，且 IPC 不再吞异常伪造成功', async () => {
    const payload = {
      recentMax: 11,
    }
    configSetConfigWithRecentMax.mockResolvedValueOnce({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })

    await expect(dispatch('user-update-config', payload)).resolves.toEqual({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })
    expect(configSetConfigWithRecentMax).toHaveBeenCalledWith(payload, expect.objectContaining({
      setMax: recentSetMax,
    }))
    expect(configSetConfig).not.toHaveBeenCalled()
    expect(recentSetMax).not.toHaveBeenCalled()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('user-update-theme-global 在配置写盘失败时必须透传结构化结果', async () => {
    configSetThemeGlobal.mockResolvedValueOnce({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })

    await expect(dispatch('user-update-theme-global', 'dark')).resolves.toEqual({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    })
  })

  it('user-update-theme-global 在配置写盘成功时必须返回结构化成功结果', async () => {
    configSetThemeGlobal.mockResolvedValueOnce({ ok: true })

    await expect(dispatch('user-update-theme-global', 'light')).resolves.toEqual({ ok: true })
    expect(configSetThemeGlobal).toHaveBeenCalledWith('light')
  })

  it('user-update-language 在配置写盘失败时必须透传结构化结果', async () => {
    configSetLanguage.mockResolvedValueOnce({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })

    await expect(dispatch('user-update-language', 'zh-CN')).resolves.toEqual({
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    })
  })

  it('user-update-language 在配置写盘成功时必须返回结构化成功结果', async () => {
    configSetLanguage.mockResolvedValueOnce({ ok: true })

    await expect(dispatch('user-update-language', 'en-US')).resolves.toEqual({ ok: true })
    expect(configSetLanguage).toHaveBeenCalledWith('en-US')
  })

  it('get-config 读取型 IPC 必须继续返回原始 payload，而不是包装成 { ok, data }', async () => {
    const config = {
      recentMax: 18,
      theme: { global: 'light' },
    }
    configGetConfig.mockReturnValueOnce(config)

    await expect(dispatch('get-config', null)).resolves.toBe(config)
  })

  it('get-default-config 读取型 IPC 必须继续返回原始 payload，而不是包装成 { ok, data }', async () => {
    const defaultConfig = {
      recentMax: 20,
      theme: { global: 'dark' },
    }
    configGetDefaultConfig.mockReturnValueOnce(defaultConfig)

    await expect(dispatch('get-default-config', null)).resolves.toBe(defaultConfig)
  })
})
