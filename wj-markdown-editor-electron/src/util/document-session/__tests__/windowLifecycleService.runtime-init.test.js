import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  browserWindowFromWebContents,
  createDocumentCommandService,
  createDocumentEffectService,
  createDocumentResourceService,
  createDocumentSessionStore,
  createSaveCoordinator,
  createWindowSessionBridge,
  ipcMainHandle,
  ipcMainOn,
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
    deleteLocal: vi.fn(),
    getInfo: vi.fn(),
    getComparableKey: vi.fn(),
  }

  return {
    browserWindowFromWebContents: vi.fn(),
    createDocumentSessionStore: vi.fn(() => store),
    createSaveCoordinator: vi.fn(() => saveCoordinator),
    createDocumentCommandService: vi.fn(() => commandService),
    createDocumentEffectService: vi.fn(() => effectService),
    createWindowSessionBridge: vi.fn(() => windowBridge),
    createDocumentResourceService: vi.fn(() => resourceService),
    ipcMainHandle: vi.fn(),
    ipcMainOn: vi.fn(),
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
    dialog: {
      showOpenDialogSync: vi.fn(),
      showSaveDialogSync: vi.fn(),
    },
    ipcMain: {
      handle: ipcMainHandle,
      on: ipcMainOn,
    },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({ workAreaSize: { width: 1920, height: 1080 } })),
    },
    shell: {
      openExternal: vi.fn(),
      showItemInFolder: vi.fn(),
    },
  }
})

vi.mock('fs-extra', () => {
  return {
    default: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      pathExists: vi.fn(),
      stat: vi.fn(),
    },
  }
})

vi.mock('../../../data/configUtil.js', () => {
  return {
    default: {
      getConfig: vi.fn(() => ({ autoSave: [], startPage: 'editor', theme: { global: 'light' } })),
      getDefaultConfig: vi.fn(() => ({})),
      setConfig: vi.fn(),
      setThemeGlobal: vi.fn(),
      setLanguage: vi.fn(),
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
  beforeEach(() => {
    vi.resetModules()
    browserWindowFromWebContents.mockReset()
    createDocumentSessionStore.mockClear()
    createSaveCoordinator.mockClear()
    createDocumentCommandService.mockClear()
    createDocumentEffectService.mockClear()
    createWindowSessionBridge.mockClear()
    createDocumentResourceService.mockClear()
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

  it('windowLifecycleService 必须等显式调用 initializeSessionRuntime 后才创建 runtime 单例，且重复初始化保持幂等', async () => {
    const { default: winInfoUtil } = await import('../windowLifecycleService.js')

    expect(createDocumentSessionStore).not.toHaveBeenCalled()
    expect(createSaveCoordinator).not.toHaveBeenCalled()
    expect(createDocumentCommandService).not.toHaveBeenCalled()
    expect(createDocumentEffectService).not.toHaveBeenCalled()
    expect(createWindowSessionBridge).not.toHaveBeenCalled()
    expect(createDocumentResourceService).not.toHaveBeenCalled()

    const firstRuntime = winInfoUtil.initializeSessionRuntime()
    const secondRuntime = winInfoUtil.initializeSessionRuntime()

    expect(createDocumentSessionStore).toHaveBeenCalledTimes(1)
    expect(createSaveCoordinator).toHaveBeenCalledTimes(1)
    expect(createDocumentCommandService).toHaveBeenCalledTimes(1)
    expect(createDocumentEffectService).toHaveBeenCalledTimes(1)
    expect(createWindowSessionBridge).toHaveBeenCalledTimes(1)
    expect(createDocumentResourceService).toHaveBeenCalledTimes(1)
    expect(firstRuntime.saveCoordinator).toBeDefined()
    expect(secondRuntime.saveCoordinator).toBe(firstRuntime.saveCoordinator)
    expect(secondRuntime.store).toBe(firstRuntime.store)
    expect(secondRuntime.commandService).toBe(firstRuntime.commandService)
    expect(secondRuntime.effectService).toBe(firstRuntime.effectService)
    expect(secondRuntime.windowBridge).toBe(firstRuntime.windowBridge)
    expect(secondRuntime.resourceService).toBe(firstRuntime.resourceService)
  })
})
