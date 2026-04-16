import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  browserWindowFromWebContents,
  clipboardApi,
  createDocumentCommandService,
  createDocumentEffectService,
  createDocumentResourceService,
  createDocumentSessionStore,
  createSaveCoordinator,
  createWindowSessionBridge,
  dialogApi,
  fsModule,
  getDocumentSessionRuntime,
  initializeDocumentSessionRuntime,
  ipcMainHandle,
  ipcMainOn,
  nativeImageApi,
  shellShowItemInFolder,
} = vi.hoisted(() => {
  const store = {
    getSession: vi.fn(() => null),
    getSessionByWindowId: vi.fn(() => null),
  }
  const saveCoordinator = {
    consumeCopySaveCompletion: vi.fn(() => null),
  }
  const commandService = {
    dispatch: vi.fn(() => ({
      session: null,
      snapshot: null,
      effects: [],
    })),
  }
  const effectService = {
    applyEffect: vi.fn(),
    executeCommand: vi.fn(),
  }
  const windowBridge = {
    publishSnapshotChanged: vi.fn(),
    publishMessage: vi.fn(),
    publishRecentListChanged: vi.fn(recentList => recentList),
    getSessionSnapshot: vi.fn(() => null),
  }
  const resourceService = {
    openInFolder: vi.fn(),
    copyAbsolutePath: vi.fn(),
    copyLink: vi.fn(),
    copyImage: vi.fn(),
    saveAs: vi.fn(),
    deleteLocal: vi.fn(),
    getInfo: vi.fn(),
    getComparableKey: vi.fn(),
  }
  const dialogApi = {
    showOpenDialogSync: vi.fn(),
    showSaveDialogSync: vi.fn(),
  }
  const clipboardApi = {
    writeText: vi.fn(),
    writeImage: vi.fn(),
  }
  const nativeImageApi = {
    createFromPath: vi.fn(),
  }
  const shellShowItemInFolder = vi.fn()
  const fsModule = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    pathExists: vi.fn(),
    stat: vi.fn(),
  }

  return {
    browserWindowFromWebContents: vi.fn(),
    clipboardApi,
    createDocumentSessionStore: vi.fn(() => store),
    createSaveCoordinator: vi.fn(() => saveCoordinator),
    createDocumentCommandService: vi.fn(() => commandService),
    createDocumentEffectService: vi.fn(() => effectService),
    createWindowSessionBridge: vi.fn(() => windowBridge),
    createDocumentResourceService: vi.fn(() => resourceService),
    dialogApi,
    fsModule,
    getDocumentSessionRuntime: vi.fn(() => {
      throw new Error('导入阶段不应访问 runtime 单例')
    }),
    initializeDocumentSessionRuntime: vi.fn(() => {
      throw new Error('不应自举 runtime')
    }),
    ipcMainHandle: vi.fn(),
    ipcMainOn: vi.fn(),
    nativeImageApi,
    shellShowItemInFolder,
  }
})

vi.mock('electron', () => {
  return {
    app: {
      exit: vi.fn(),
      getVersion: vi.fn(() => '2.15.0'),
    },
    BrowserWindow: {
      fromWebContents: browserWindowFromWebContents,
    },
    clipboard: clipboardApi,
    dialog: dialogApi,
    ipcMain: {
      handle: ipcMainHandle,
      on: ipcMainOn,
    },
    nativeImage: nativeImageApi,
    screen: {
      getPrimaryDisplay: vi.fn(() => ({ workAreaSize: { width: 1920, height: 1080 } })),
    },
    shell: {
      openExternal: vi.fn(),
      showItemInFolder: shellShowItemInFolder,
    },
  }
})

vi.mock('fs-extra', () => {
  return {
    default: fsModule,
  }
})

vi.mock('../../../data/configUtil.js', () => {
  return {
    default: {
      getConfig: vi.fn(() => ({ autoSave: [], startPage: 'editor', theme: { global: 'light' } })),
      getDefaultConfig: vi.fn(() => ({})),
      updateConfig: vi.fn(),
    },
  }
})

vi.mock('../../../data/recent.js', () => {
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

vi.mock('../../channel/sendUtil.js', () => {
  return {
    default: {
      send: vi.fn(),
    },
  }
})

vi.mock('../../commonUtil.js', () => {
  return {
    default: {
      createId: vi.fn(() => 'test-id-1'),
      decodeWjUrl: vi.fn(),
    },
  }
})

vi.mock('../documentCommandService.js', () => {
  return {
    createDocumentCommandService,
  }
})

vi.mock('../documentEffectService.js', () => {
  return {
    createDocumentEffectService,
  }
})

vi.mock('../documentResourceService.js', () => {
  return {
    createDocumentResourceService,
  }
})

vi.mock('../documentSessionStore.js', () => {
  return {
    createDocumentSessionStore,
  }
})

vi.mock('../saveCoordinator.js', () => {
  return {
    createSaveCoordinator,
  }
})

vi.mock('../windowSessionBridge.js', () => {
  return {
    createWindowSessionBridge,
  }
})

vi.mock('../documentSessionRuntime.js', () => {
  return {
    getDocumentSessionRuntime,
    initializeDocumentSessionRuntime,
  }
})

vi.mock('../../fileUploadUtil.js', () => {
  return {
    default: {
      save: vi.fn(),
    },
  }
})

vi.mock('../../fileWatchUtil.js', () => {
  return {
    default: {
      createWatchState: vi.fn(() => ({ pendingChange: null })),
      startWatching: vi.fn(),
      stopWatching: vi.fn(),
      markInternalSave: vi.fn(),
      settlePendingChange: vi.fn(),
      ignorePendingChange: vi.fn(),
    },
  }
})

vi.mock('../../imgUtil.js', () => {
  return {
    default: {
      check: vi.fn(() => true),
      save: vi.fn(),
    },
  }
})

vi.mock('../../resourceFileUtil.js', () => {
  return {
    default: {
      getLocalResourceFailureMessageKey: vi.fn(() => null),
    },
  }
})

vi.mock('../../updateUtil.js', () => {
  return {
    default: {
      checkUpdate: vi.fn(),
      downloadUpdate: vi.fn(),
      cancelDownloadUpdate: vi.fn(),
      executeUpdate: vi.fn(),
    },
  }
})

vi.mock('../../win/aboutUtil.js', () => {
  return {
    default: {
      channel: {},
      get: vi.fn(),
    },
  }
})

vi.mock('../../win/exportUtil.js', () => {
  return {
    default: {
      channel: {},
    },
  }
})

vi.mock('../../win/guideUtil.js', () => {
  return {
    default: {
      channel: {},
    },
  }
})

vi.mock('../../win/screenshotsUtil.js', () => {
  return {
    default: {
      startCapture: vi.fn(),
    },
  }
})

vi.mock('../../win/settingUtil.js', () => {
  return {
    default: {
      channel: {},
    },
  }
})

describe('windowLifecycleService runtime 初始化时机', () => {
  function createRegistryStub() {
    return {
      registerWindow: vi.fn(),
      unregisterWindow: vi.fn(),
      bindSession: vi.fn(),
      getSessionIdByWindowId: vi.fn(() => null),
      getWindowById: vi.fn(() => null),
      getAllWindows: vi.fn(() => []),
    }
  }

  beforeEach(() => {
    vi.resetModules()
    browserWindowFromWebContents.mockReset()
    createDocumentSessionStore.mockClear()
    createSaveCoordinator.mockClear()
    createDocumentCommandService.mockClear()
    createDocumentEffectService.mockClear()
    createWindowSessionBridge.mockClear()
    createDocumentResourceService.mockClear()
    getDocumentSessionRuntime.mockClear()
    initializeDocumentSessionRuntime.mockClear()
    ipcMainHandle.mockReset()
    ipcMainOn.mockReset()
  })

  it('真实导入 ipcMainUtil 时，不得因为 windowLifecycleService 被连带导入而提前创建 runtime 单例', async () => {
    await import('../../channel/ipcMainUtil.js')

    expect(createDocumentSessionStore).not.toHaveBeenCalled()
    expect(createSaveCoordinator).not.toHaveBeenCalled()
    expect(createDocumentCommandService).not.toHaveBeenCalled()
    expect(createDocumentEffectService).not.toHaveBeenCalled()
    expect(createWindowSessionBridge).not.toHaveBeenCalled()
    expect(createDocumentResourceService).not.toHaveBeenCalled()
  })

  it('windowLifecycleService 不应再对外暴露 initializeSessionRuntime，避免主入口继续拼装 runtime 初始化依赖', async () => {
    const moduleNs = await import('../windowLifecycleService.js')
    const winInfoUtil = moduleNs.default

    expect(createDocumentSessionStore).not.toHaveBeenCalled()
    expect(createSaveCoordinator).not.toHaveBeenCalled()
    expect(createDocumentCommandService).not.toHaveBeenCalled()
    expect(createDocumentEffectService).not.toHaveBeenCalled()
    expect(createWindowSessionBridge).not.toHaveBeenCalled()
    expect(createDocumentResourceService).not.toHaveBeenCalled()
    expect(moduleNs.initializeSessionRuntime).toBeUndefined()
    expect(Object.keys(moduleNs)).not.toContain('initializeSessionRuntime')
    expect(winInfoUtil.initializeSessionRuntime).toBeUndefined()
    expect(Object.keys(winInfoUtil)).not.toContain('initializeSessionRuntime')
  })

  it('documentSessionRuntimeComposition 必须集中给 resourceService 装配桌面依赖，避免主入口继续手动拼接资源宿主对象', async () => {
    const previousFetch = globalThis.fetch
    const fetchImpl = vi.fn()
    globalThis.fetch = fetchImpl

    try {
      const { createDocumentSessionRuntimeComposition } = await import('../documentSessionRuntimeComposition.js')

      createDocumentSessionRuntimeComposition({
        registry: createRegistryStub(),
        getConfig: vi.fn(() => ({ language: 'zh-CN' })),
        recentStore: {
          add: vi.fn(),
          clear: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(() => []),
        },
        sendToRenderer: vi.fn(),
      })

      expect(createDocumentResourceService).toHaveBeenCalledWith(expect.objectContaining({
        store: expect.any(Object),
        showItemInFolder: shellShowItemInFolder,
        dialogApi,
        fsModule,
        fetchImpl,
        resolveWindowById: expect.any(Function),
      }))
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('windowLifecycleService 必须删除旧 winInfo facade 导出，避免主进程消费者继续走隐式上下文', async () => {
    const moduleNs = await import('../windowLifecycleService.js')
    const winInfoUtil = moduleNs.default

    expect(moduleNs.getAllWindowInfoFacades).toBeUndefined()
    expect(moduleNs.windowInfoFacadeMap).toBeUndefined()
    expect(moduleNs.createWindowInfoFacade).toBeUndefined()
    expect(moduleNs.ensureWindowInfoFacade).toBeUndefined()
    expect(moduleNs.getWinInfo).toBeUndefined()
    expect(moduleNs.getAll).toBeUndefined()
    expect(moduleNs.getByWebContentsId).toBeUndefined()
    expect(winInfoUtil.getAllWindowInfoFacades).toBeUndefined()
    expect(winInfoUtil.windowInfoFacadeMap).toBeUndefined()
    expect(winInfoUtil.createWindowInfoFacade).toBeUndefined()
    expect(winInfoUtil.ensureWindowInfoFacade).toBeUndefined()
    expect(winInfoUtil.getWinInfo).toBeUndefined()
    expect(winInfoUtil.getAll).toBeUndefined()
    expect(winInfoUtil.getByWebContentsId).toBeUndefined()
  })

  it('windowLifecycleService 导入阶段不得偷读 runtime 单例，避免把显式初始化重新变回隐式副作用', async () => {
    await import('../windowLifecycleService.js')

    expect(getDocumentSessionRuntime).not.toHaveBeenCalled()
  })

  it('windowLifecycleService 在未显式配置 registry 时，不能暴露 host deps 给主入口继续初始化', async () => {
    const moduleNs = await import('../windowLifecycleService.js')

    expect(() => moduleNs.default.getDocumentSessionRuntimeHostDeps()).toThrow('windowLifecycleService 尚未配置 windowRegistry')
  })

  it('windowLifecycleService 配置过 registry 后，不能静默切换到另一份实例', async () => {
    const moduleNs = await import('../windowLifecycleService.js')
    const firstRegistry = createRegistryStub()
    const secondRegistry = createRegistryStub()

    expect(() => moduleNs.default.configure({
      registry: firstRegistry,
    })).not.toThrow()
    expect(() => moduleNs.default.configure({
      registry: secondRegistry,
    })).toThrow('windowLifecycleService 已绑定其他 windowRegistry')
  })

  it('未显式初始化 runtime 时，windowLifecycleService.createNew 必须直接失败，不能在内部自举 runtime', async () => {
    getDocumentSessionRuntime.mockImplementation(() => {
      throw new Error('document session runtime 尚未初始化')
    })
    const moduleNs = await import('../windowLifecycleService.js')
    moduleNs.default.configure({
      registry: createRegistryStub(),
    })

    await expect(moduleNs.default.createNew(null)).rejects.toThrow('document session runtime 尚未初始化')
    expect(initializeDocumentSessionRuntime).not.toHaveBeenCalled()
  })
})
