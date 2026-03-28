import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDocumentSessionRuntime,
  getDocumentSessionRuntime,
  initializeDocumentSessionRuntime,
  openDocumentWindowWithRuntimePolicy,
  resetDocumentSessionRuntime,
} from '../documentSessionRuntime.js'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolveInner, rejectInner) => {
    resolve = resolveInner
    reject = rejectInner
  })
  return {
    promise,
    resolve,
    reject,
  }
}

const DOCUMENT_STATE_COMMAND_SET = new Set([
  'document.edit',
  'document.save',
  'document.save-copy',
  'document.request-close',
  'document.cancel-close',
  'document.confirm-force-close',
  'document.external.apply',
  'document.external.ignore',
])

const RESOURCE_COMMAND_SET = new Set([
  'document.resource.open-in-folder',
  'document.resource.copy-absolute-path',
  'document.resource.copy-link',
  'document.resource.copy-image',
  'document.resource.save-as',
  'document.resource.delete-local',
  'resource.get-info',
])

const SYNC_QUERY_SET = new Set([
  'resource.get-comparable-key',
])

function createRequiredRuntimeDeps(overrides = {}) {
  return {
    store: {
      getSession: vi.fn(() => null),
      getSessionByWindowId: vi.fn(() => null),
    },
    saveCoordinator: {
      consumeCopySaveCompletion: vi.fn(() => null),
    },
    commandService: {
      dispatch: vi.fn(() => ({
        session: null,
        snapshot: null,
        effects: [],
      })),
    },
    effectService: {
      executeCommand: vi.fn(async () => ({
        ok: true,
      })),
    },
    windowBridge: {
      getSessionSnapshot: vi.fn(() => null),
      publishSnapshotChanged: vi.fn(),
      publishMessage: vi.fn(),
      publishRecentListChanged: vi.fn(recentList => recentList),
    },
    ...overrides,
  }
}

function createRuntimeContext(overrides = {}) {
  const windowByIdMap = new Map()

  function getOrCreateWindow(windowId) {
    if (!windowByIdMap.has(windowId)) {
      windowByIdMap.set(windowId, {
        id: windowId,
        close: vi.fn(),
      })
    }
    return windowByIdMap.get(windowId)
  }

  const commandRunner = {
    run: vi.fn().mockResolvedValue({
      snapshot: {
        sessionId: 'session-1',
        content: '# 内容',
      },
      effects: [],
    }),
  }
  const effectService = {
    executeCommand: vi.fn(async ({
      command,
      payload,
      openDocumentWindow,
      getSessionSnapshot,
    }) => {
      switch (command) {
        case 'document.open-path':
          return await openDocumentWindow(payload.path, {
            isRecent: false,
            trigger: payload.trigger,
          })
        case 'document.open-recent':
          return await openDocumentWindow(payload.path, {
            isRecent: true,
            trigger: payload.trigger,
          })
        case 'document.get-session-snapshot':
          return getSessionSnapshot()
        default:
          return {
            ok: true,
          }
      }
    }),
  }
  const executeDocumentCommand = vi.fn(async ({
    windowId,
    command,
    payload,
    runtime,
  }) => {
    return await runtime.dispatch(windowId, command, payload)
  })
  const executeResourceCommand = vi.fn(async ({
    command,
    payload,
  }) => {
    switch (command) {
      case 'document.resource.open-in-folder':
        return {
          ok: true,
          opened: true,
          reason: 'opened',
          path: payload?.resourceUrl || null,
        }
      case 'document.resource.copy-absolute-path':
        return {
          ok: true,
          reason: 'copied',
          value: payload?.resourceUrl || null,
        }
      case 'document.resource.copy-link':
        return {
          ok: true,
          reason: 'copied',
          value: payload?.resourceUrl || null,
        }
      case 'document.resource.copy-image':
        return {
          ok: true,
          reason: 'copied',
        }
      case 'document.resource.save-as':
        return {
          ok: true,
          reason: 'saved',
          targetPath: payload?.resourceUrl || null,
        }
      case 'document.resource.delete-local':
        return {
          ok: true,
          removed: true,
          reason: 'deleted',
          path: payload?.resourceUrl || null,
        }
      case 'resource.get-info':
        return {
          ok: true,
          reason: 'resolved',
          path: payload?.resourceUrl || null,
        }
      default:
        return {
          ok: true,
        }
    }
  })
  const executeSyncQuery = vi.fn(({
    command,
    payload,
  }) => {
    if (command === 'resource.get-comparable-key') {
      return `comparable:${payload}`
    }
    return null
  })
  const windowBridge = {
    getSessionSnapshot: vi.fn(windowId => ({
      sessionId: `session-${windowId}`,
      content: `# ${windowId}`,
      saved: windowId === 7,
    })),
    publishMessage: vi.fn(),
    publishRecentListChanged: vi.fn(recentList => recentList),
  }
  const getWindowById = vi.fn(windowId => (windowId == null
    ? null
    : getOrCreateWindow(windowId)))
  const getDocumentContext = vi.fn(windowId => ({
    path: windowId == null ? null : `C:/docs/${windowId}.md`,
    exists: true,
    content: '# 内容',
    saved: false,
    fileName: `${windowId}.md`,
  }))
  const openDocumentWindow = vi.fn(async (_targetPath, options = {}) => (
    options.isRecent === true ? 19 : 18
  ))
  const publishOpenFailureSystemNotification = vi.fn()

  const runtime = createDocumentSessionRuntime({
    store: {
      getSession: vi.fn(() => null),
      getSessionByWindowId: vi.fn(() => null),
    },
    saveCoordinator: {
      consumeCopySaveCompletion: vi.fn(() => null),
    },
    commandService: {
      dispatch: vi.fn(() => ({
        session: null,
        snapshot: null,
        effects: [],
      })),
    },
    commandRunner,
    effectService,
    executeDocumentCommand,
    executeResourceCommand,
    executeSyncQuery,
    windowBridge,
    getWindowById,
    getDocumentContext,
    openDocumentWindow,
    publishOpenFailureSystemNotification,
    ...overrides,
  })

  return {
    runtime,
    commandRunner,
    effectService,
    executeDocumentCommand,
    executeResourceCommand,
    executeSyncQuery,
    windowBridge,
    getWindowById,
    getDocumentContext,
    openDocumentWindow,
    publishOpenFailureSystemNotification,
  }
}

describe('documentSessionRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runtime 组合根必须集中装配依赖，并允许 initializeDocumentSessionRuntime 直接复用这些实例', async () => {
    vi.resetModules()
    resetDocumentSessionRuntime()

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
    const registry = {
      getWindowById: vi.fn(() => null),
      getAllWindows: vi.fn(() => []),
    }
    const createDocumentSessionStore = vi.fn(() => store)
    const createSaveCoordinator = vi.fn(() => saveCoordinator)
    const createDocumentCommandService = vi.fn(() => commandService)
    const createDocumentEffectService = vi.fn(() => effectService)
    const createWindowSessionBridge = vi.fn(() => ({
      getSessionSnapshot: vi.fn(() => null),
      publishSnapshotChanged: vi.fn(),
      publishMessage: vi.fn(),
      publishRecentListChanged: vi.fn(recentList => recentList),
    }))
    const createDocumentResourceService = vi.fn(() => resourceService)
    const showItemInFolder = vi.fn()
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
    const fsModule = {
      pathExists: vi.fn(),
      copyFile: vi.fn(),
    }
    const fetchImpl = vi.fn()

    vi.doMock('../documentSessionStore.js', () => ({
      createDocumentSessionStore,
    }))
    vi.doMock('../saveCoordinator.js', () => ({
      createSaveCoordinator,
    }))
    vi.doMock('../documentCommandService.js', () => ({
      createDocumentCommandService,
    }))
    vi.doMock('../documentEffectService.js', () => ({
      createDocumentEffectService,
    }))
    vi.doMock('../windowSessionBridge.js', () => ({
      createWindowSessionBridge,
    }))
    vi.doMock('../documentResourceService.js', () => ({
      createDocumentResourceService,
    }))

    const { createDocumentSessionRuntimeComposition } = await import('../documentSessionRuntimeComposition.js')
    const composition = createDocumentSessionRuntimeComposition({
      registry,
      getConfig: () => ({ language: 'zh-CN' }),
      recentStore: {
        add: vi.fn(),
      },
      sendToRenderer: vi.fn(),
      showItemInFolder,
      dialogApi,
      clipboardApi,
      nativeImageApi,
      fsModule,
      fetchImpl,
    })
    const runtime = initializeDocumentSessionRuntime({
      ...composition,
      getWindowById: () => null,
      getDocumentContext: () => null,
      buildRunnerEffectContext: () => ({}),
      openDocumentWindow: vi.fn(),
    })

    expect(createDocumentSessionStore).toHaveBeenCalledTimes(1)
    expect(createSaveCoordinator).toHaveBeenCalledTimes(1)
    expect(createDocumentCommandService).toHaveBeenCalledWith({
      store,
      saveCoordinator,
      getConfig: expect.any(Function),
    })
    expect(createDocumentEffectService).toHaveBeenCalledWith(expect.objectContaining({
      recentStore: expect.objectContaining({
        add: expect.any(Function),
      }),
      getConfig: expect.any(Function),
    }))
    expect(createWindowSessionBridge).toHaveBeenCalledWith({
      store,
      sendToRenderer: expect.any(Function),
      resolveWindowById: expect.any(Function),
      getAllWindows: expect.any(Function),
    })
    expect(createDocumentResourceService).toHaveBeenCalledWith({
      store,
      showItemInFolder,
      dialogApi,
      clipboardApi,
      nativeImageApi,
      fsModule,
      fetchImpl,
    })
    expect(composition.store).toBe(store)
    expect(composition.saveCoordinator).toBe(saveCoordinator)
    expect(composition.commandService).toBe(commandService)
    expect(composition.effectService).toBe(effectService)
    expect(composition.resourceService).toBe(resourceService)
    expect(runtime.store).toBe(store)
    expect(runtime.saveCoordinator).toBe(saveCoordinator)
    expect(runtime.commandService).toBe(commandService)
    expect(runtime.effectService).toBe(effectService)
    expect(runtime.resourceService).toBe(resourceService)
    expect(runtime.windowBridge).toBe(composition.windowBridge)
  })

  it('initializeDocumentSessionRuntime 在缺少必要依赖时必须直接失败，不能静默走默认组装路径', () => {
    resetDocumentSessionRuntime()

    expect(() => initializeDocumentSessionRuntime({
      effectService: {
        executeCommand: vi.fn(),
      },
      windowBridge: {
        getSessionSnapshot: vi.fn(() => null),
        publishSnapshotChanged: vi.fn(),
        publishMessage: vi.fn(),
        publishRecentListChanged: vi.fn(),
      },
    })).toThrow('createDocumentSessionRuntime 缺少必要依赖')
  })

  it('必须作为统一组合根暴露 dispatch / executeUiCommand / executeSyncQuery / getSessionSnapshot / getDocumentContext', () => {
    const { runtime } = createRuntimeContext()

    expect(typeof runtime.dispatch).toBe('function')
    expect(typeof runtime.executeUiCommand).toBe('function')
    expect(typeof runtime.executeSyncQuery).toBe('function')
    expect(typeof runtime.getSessionSnapshot).toBe('function')
    expect(typeof runtime.getDocumentContext).toBe('function')
    expect(typeof runtime.publishRecentListChanged).toBe('function')
  })

  it('task 4 路由表必须显式覆盖关闭命令、资源命令与同步查询命令', () => {
    expect(DOCUMENT_STATE_COMMAND_SET.has('document.request-close')).toBe(true)
    expect(DOCUMENT_STATE_COMMAND_SET.has('document.cancel-close')).toBe(true)
    expect(DOCUMENT_STATE_COMMAND_SET.has('document.confirm-force-close')).toBe(true)
    expect(DOCUMENT_STATE_COMMAND_SET.has('document.external.apply')).toBe(true)
    expect(DOCUMENT_STATE_COMMAND_SET.has('document.external.ignore')).toBe(true)
    expect(RESOURCE_COMMAND_SET.has('document.resource.open-in-folder')).toBe(true)
    expect(RESOURCE_COMMAND_SET.has('document.resource.copy-absolute-path')).toBe(true)
    expect(RESOURCE_COMMAND_SET.has('document.resource.copy-link')).toBe(true)
    expect(RESOURCE_COMMAND_SET.has('document.resource.copy-image')).toBe(true)
    expect(RESOURCE_COMMAND_SET.has('document.resource.save-as')).toBe(true)
    expect(RESOURCE_COMMAND_SET.has('document.resource.delete-local')).toBe(true)
    expect(RESOURCE_COMMAND_SET.has('resource.get-info')).toBe(true)
    expect(SYNC_QUERY_SET.has('resource.get-comparable-key')).toBe(true)
  })

  it('dispatch 必须委托给 commandRunner.run', async () => {
    const { runtime, commandRunner } = createRuntimeContext()

    await runtime.dispatch(3, 'document.save', {
      trigger: 'manual-save',
    })

    expect(commandRunner.run).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 3,
      command: 'document.save',
      payload: {
        trigger: 'manual-save',
      },
    }))
  })

  it('非状态 UI 命令只应向 effectService 暴露显式 effectContext，不再透传公共 winInfo', async () => {
    const closeHostController = {
      requestForceClose: vi.fn(),
      continueWindowClose: vi.fn(),
      finalizeWindowClose: vi.fn(),
      getClosedManualRequestCompletions: vi.fn(() => []),
    }
    const externalWatchController = {
      start: vi.fn(),
      stop: vi.fn(),
      getContext: vi.fn(() => ({
        bindingToken: 11,
        watchingPath: 'C:/docs/11.md',
        shouldRebindAfterSave: false,
      })),
      markInternalSave: vi.fn(),
      settlePendingChange: vi.fn(),
      ignorePendingChange: vi.fn(),
    }
    const windowMessageController = {
      publishWindowMessage: vi.fn(),
      publishSnapshotChanged: vi.fn(),
    }
    const buildRunnerEffectContext = vi.fn(({ dispatchCommand, windowId }) => ({
      closeHostController,
      externalWatchController,
      windowMessageController,
      marker: `${windowId}:${typeof dispatchCommand}`,
    }))
    const effectService = {
      executeCommand: vi.fn(async () => ({
        ok: true,
      })),
    }
    const runtime = createDocumentSessionRuntime({
      ...createRequiredRuntimeDeps({
        effectService,
      }),
      effectService,
      buildRunnerEffectContext,
      getWindowById: vi.fn(windowId => ({
        id: windowId,
        close: vi.fn(),
      })),
    })

    await runtime.executeUiCommand(11, 'document.request-open-dialog', null)

    expect(buildRunnerEffectContext).toHaveBeenCalledWith({
      windowId: 11,
      dispatchCommand: expect.any(Function),
    })
    const effectCommandCall = effectService.executeCommand.mock.calls[0]?.[0]
    expect(effectCommandCall).toEqual(expect.objectContaining({
      command: 'document.request-open-dialog',
      payload: null,
      dispatchCommand: expect.any(Function),
      openDocumentWindow: expect.any(Function),
      getSessionSnapshot: expect.any(Function),
      closeHostController,
      externalWatchController,
      windowMessageController,
      marker: '11:function',
    }))
    expect(effectCommandCall).not.toHaveProperty('winInfo')
  })

  it('document.save / save-copy / document.edit 这类状态推进命令必须经 runtime 回流到真实 dispatch 链路', async () => {
    const { runtime, executeDocumentCommand, commandRunner } = createRuntimeContext()

    const saveResult = await runtime.executeUiCommand(4, 'document.save', null)
    const saveCopyResult = await runtime.executeUiCommand(4, 'document.save-copy', null)
    const editResult = await runtime.executeUiCommand(4, 'document.edit', {
      content: '# 新内容',
    })

    expect(executeDocumentCommand).toHaveBeenNthCalledWith(1, expect.objectContaining({
      windowId: 4,
      command: 'document.save',
      payload: null,
      runtime,
    }))
    expect(executeDocumentCommand).toHaveBeenNthCalledWith(2, expect.objectContaining({
      windowId: 4,
      command: 'document.save-copy',
      payload: null,
      runtime,
    }))
    expect(executeDocumentCommand).toHaveBeenNthCalledWith(3, expect.objectContaining({
      windowId: 4,
      command: 'document.edit',
      payload: {
        content: '# 新内容',
      },
      runtime,
    }))
    expect(commandRunner.run).toHaveBeenCalledTimes(3)
    expect(saveResult).toEqual({
      snapshot: {
        sessionId: 'session-1',
        content: '# 内容',
      },
      effects: [],
    })
    expect(saveCopyResult).toEqual({
      snapshot: {
        sessionId: 'session-1',
        content: '# 内容',
      },
      effects: [],
    })
    expect(editResult).toEqual({
      snapshot: {
        sessionId: 'session-1',
        content: '# 内容',
      },
      effects: [],
    })
  })

  it('document.edit 作为 runtime UI 命令必须等待最终快照 ready 后再返回，随后 get-session-snapshot 也要读到同一 revision', async () => {
    const dispatchDeferred = createDeferred()
    let currentSnapshot = {
      sessionId: 'session-6',
      content: '# 原始内容',
      saved: false,
      revision: 0,
    }
    const effectService = {
      executeCommand: vi.fn(async ({
        command,
        getSessionSnapshot,
      }) => {
        if (command === 'document.get-session-snapshot') {
          return getSessionSnapshot()
        }
        return {
          ok: true,
        }
      }),
    }
    const executeDocumentCommand = vi.fn(async ({
      payload,
    }) => {
      await dispatchDeferred.promise
      currentSnapshot = {
        ...currentSnapshot,
        content: payload.content,
        revision: 1,
      }
      return {
        snapshot: currentSnapshot,
        effects: [],
      }
    })
    const runtime = createDocumentSessionRuntime({
      ...createRequiredRuntimeDeps({
        effectService,
        windowBridge: {
          getSessionSnapshot: vi.fn(() => currentSnapshot),
          publishSnapshotChanged: vi.fn(),
          publishMessage: vi.fn(),
          publishRecentListChanged: vi.fn(recentList => recentList),
        },
      }),
      effectService,
      executeDocumentCommand,
      getWindowById: vi.fn(windowId => ({
        id: windowId,
        close: vi.fn(),
      })),
      getDocumentContext: vi.fn(() => ({
        path: 'C:/docs/demo.md',
        exists: true,
        content: currentSnapshot.content,
        saved: false,
        fileName: 'demo.md',
      })),
    })

    let editResolved = false
    const editPromise = runtime.executeUiCommand(6, 'document.edit', {
      content: '# 最终正文',
    }).then((result) => {
      editResolved = true
      return result
    })

    await Promise.resolve()

    expect(editResolved).toBe(false)
    expect(runtime.getSessionSnapshot(6)).toEqual({
      sessionId: 'session-6',
      content: '# 原始内容',
      saved: false,
      revision: 0,
    })

    dispatchDeferred.resolve()
    const editResult = await editPromise
    const snapshot = await runtime.executeUiCommand(6, 'document.get-session-snapshot', null)

    expect(editResult.snapshot.content).toBe('# 最终正文')
    expect(editResult.snapshot.revision).toBe(1)
    expect(snapshot.content).toBe('# 最终正文')
    expect(snapshot.revision).toBe(1)
    expect(executeDocumentCommand).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 6,
      command: 'document.edit',
      payload: {
        content: '# 最终正文',
      },
      runtime,
    }))
  })

  it('document.request-close 必须返回统一命令链路的结构化结果，且不能继续落到 effectService', async () => {
    const { runtime, commandRunner, effectService } = createRuntimeContext()
    const closeResult = {
      snapshot: {
        sessionId: 'session-close',
        content: '# 待关闭',
      },
      effects: [
        {
          type: 'hold-window-close',
        },
      ],
    }
    commandRunner.run.mockResolvedValueOnce(closeResult)

    const result = await runtime.executeUiCommand(4, 'document.request-close', null)

    expect(result).toEqual(closeResult)
    expect(effectService.executeCommand).not.toHaveBeenCalled()
    expect(commandRunner.run).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 4,
      command: 'document.request-close',
      payload: null,
    }))
  })

  it('document.cancel-close / confirm-force-close / external.apply / external.ignore 也必须经 runtime 进入统一命令链路', async () => {
    const { runtime, executeDocumentCommand } = createRuntimeContext()

    await runtime.executeUiCommand(5, 'document.cancel-close', null)
    await runtime.executeUiCommand(5, 'document.confirm-force-close', null)
    await runtime.executeUiCommand(5, 'document.external.apply', {
      version: 2,
    })
    await runtime.executeUiCommand(5, 'document.external.ignore', {
      version: 3,
    })

    expect(executeDocumentCommand).toHaveBeenNthCalledWith(1, expect.objectContaining({
      windowId: 5,
      command: 'document.cancel-close',
      payload: null,
    }))
    expect(executeDocumentCommand).toHaveBeenNthCalledWith(2, expect.objectContaining({
      windowId: 5,
      command: 'document.confirm-force-close',
      payload: null,
    }))
    expect(executeDocumentCommand).toHaveBeenNthCalledWith(3, expect.objectContaining({
      windowId: 5,
      command: 'document.external.apply',
      payload: {
        version: 2,
      },
    }))
    expect(executeDocumentCommand).toHaveBeenNthCalledWith(4, expect.objectContaining({
      windowId: 5,
      command: 'document.external.ignore',
      payload: {
        version: 3,
      },
    }))
  })

  it('document.resource.open-in-folder / delete-local / resource.get-info 必须返回统一资源路由结果，且不能继续回落到 effectService', async () => {
    const {
      runtime,
      executeResourceCommand,
      effectService,
    } = createRuntimeContext()
    const openPayload = {
      resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
    }
    const deletePayload = {
      resourceUrl: 'wj://2e2f6173736574732f72656d6f76652e706e67',
    }
    const infoPayload = {
      resourceUrl: 'wj://2e2f6173736574732f696e666f2e706e67',
    }
    const openResult = {
      ok: true,
      opened: true,
      reason: 'opened',
      path: openPayload.resourceUrl,
    }
    const deleteResult = {
      ok: true,
      removed: true,
      reason: 'deleted',
      path: deletePayload.resourceUrl,
    }
    const infoResult = {
      ok: true,
      reason: 'resolved',
      path: infoPayload.resourceUrl,
    }
    executeResourceCommand
      .mockResolvedValueOnce(openResult)
      .mockResolvedValueOnce(deleteResult)
      .mockResolvedValueOnce(infoResult)

    const results = await Promise.all([
      runtime.executeUiCommand(6, 'document.resource.open-in-folder', openPayload),
      runtime.executeUiCommand(6, 'document.resource.delete-local', deletePayload),
      runtime.executeUiCommand(6, 'resource.get-info', infoPayload),
    ])

    expect(results).toEqual([
      openResult,
      deleteResult,
      infoResult,
    ])
    expect(effectService.executeCommand).not.toHaveBeenCalled()
    expect(executeResourceCommand).toHaveBeenCalledTimes(3)
  })

  it('document.resource.delete-local / resource.get-info 必须把结构化返回原样透传给调用方', async () => {
    const { runtime, executeResourceCommand } = createRuntimeContext()
    const deletePayload = {
      resourceUrl: 'wj://2e2f6173736574732f64656c6574652e706e67',
    }
    const infoPayload = {
      resourceUrl: 'wj://2e2f6173736574732f696e666f2e706e67',
    }
    const deleteResult = {
      ok: true,
      removed: true,
      reason: 'deleted',
      path: 'C:/docs/assets/delete.png',
    }
    const infoResult = {
      ok: true,
      reason: 'resolved',
      decodedPath: './assets/info.png',
      exists: true,
      isDirectory: false,
      isFile: true,
      path: 'C:/docs/assets/info.png',
    }
    executeResourceCommand
      .mockResolvedValueOnce(deleteResult)
      .mockResolvedValueOnce(infoResult)

    const deleted = await runtime.executeUiCommand(7, 'document.resource.delete-local', deletePayload)
    const info = await runtime.executeUiCommand(7, 'resource.get-info', infoPayload)

    expect(deleted).toEqual(deleteResult)
    expect(info).toEqual(infoResult)
    expect(executeResourceCommand).toHaveBeenNthCalledWith(1, expect.objectContaining({
      windowId: 7,
      command: 'document.resource.delete-local',
      payload: deletePayload,
      runtime,
    }))
    expect(executeResourceCommand).toHaveBeenNthCalledWith(2, expect.objectContaining({
      windowId: 7,
      command: 'resource.get-info',
      payload: infoPayload,
      runtime,
    }))
  })

  it('document.resource.copy-absolute-path / copy-link / copy-image / save-as 必须继续走统一资源命令路由，且不能回落到 effectService', async () => {
    const {
      runtime,
      executeResourceCommand,
      effectService,
    } = createRuntimeContext()
    const copyAbsolutePathPayload = {
      resourceUrl: 'wj://2e2f6173736574732f636f70792d706174682e706e67',
    }
    const copyLinkPayload = {
      resourceUrl: 'wj://2e2f6173736574732f636f70792d6c696e6b2e706e67',
    }
    const copyImagePayload = {
      resourceUrl: 'wj://2e2f6173736574732f636f70792d696d6167652e706e67',
    }
    const saveAsPayload = {
      resourceUrl: 'wj://2e2f6173736574732f736176652d61732e706e67',
    }
    const copyAbsolutePathResult = {
      ok: true,
      reason: 'copied',
      value: 'C:/docs/assets/copy-path.png',
    }
    const copyLinkResult = {
      ok: true,
      reason: 'copied',
      value: '![copy-link](./assets/copy-link.png)',
    }
    const copyImageResult = {
      ok: true,
      reason: 'copied',
    }
    const saveAsResult = {
      ok: true,
      reason: 'saved',
      targetPath: 'C:/exports/save-as.png',
    }
    executeResourceCommand
      .mockResolvedValueOnce(copyAbsolutePathResult)
      .mockResolvedValueOnce(copyLinkResult)
      .mockResolvedValueOnce(copyImageResult)
      .mockResolvedValueOnce(saveAsResult)

    const results = await Promise.all([
      runtime.executeUiCommand(8, 'document.resource.copy-absolute-path', copyAbsolutePathPayload),
      runtime.executeUiCommand(8, 'document.resource.copy-link', copyLinkPayload),
      runtime.executeUiCommand(8, 'document.resource.copy-image', copyImagePayload),
      runtime.executeUiCommand(8, 'document.resource.save-as', saveAsPayload),
    ])

    expect(results).toEqual([
      copyAbsolutePathResult,
      copyLinkResult,
      copyImageResult,
      saveAsResult,
    ])
    expect(effectService.executeCommand).not.toHaveBeenCalled()
    expect(executeResourceCommand).toHaveBeenNthCalledWith(1, expect.objectContaining({
      windowId: 8,
      command: 'document.resource.copy-absolute-path',
      payload: copyAbsolutePathPayload,
      runtime,
    }))
    expect(executeResourceCommand).toHaveBeenNthCalledWith(2, expect.objectContaining({
      windowId: 8,
      command: 'document.resource.copy-link',
      payload: copyLinkPayload,
      runtime,
    }))
    expect(executeResourceCommand).toHaveBeenNthCalledWith(3, expect.objectContaining({
      windowId: 8,
      command: 'document.resource.copy-image',
      payload: copyImagePayload,
      runtime,
    }))
    expect(executeResourceCommand).toHaveBeenNthCalledWith(4, expect.objectContaining({
      windowId: 8,
      command: 'document.resource.save-as',
      payload: saveAsPayload,
      runtime,
    }))
  })

  it('resource.get-comparable-key 必须通过 runtime 的专用同步入口返回稳定 key，且不能继续混入 executeUiCommand 异步链路', () => {
    const { runtime, executeSyncQuery, effectService } = createRuntimeContext()
    const payload = './assets/demo.png?size=full'

    expect(typeof runtime.executeSyncQuery).toBe('function')
    if (typeof runtime.executeSyncQuery !== 'function') {
      return
    }

    const result = runtime.executeSyncQuery(7, 'resource.get-comparable-key', payload)

    expect(result).toBe(`comparable:${payload}`)
    expect(effectService.executeCommand).not.toHaveBeenCalled()
    expect(executeSyncQuery).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 7,
      command: 'resource.get-comparable-key',
      payload,
      runtime,
    }))
  })

  it('openDocumentWindowWithRuntimePolicy 必须只接受 openWindow 返回的 windowId，并通过 getWindowById 关闭空白草稿源窗口', async () => {
    const sourceWin = {
      id: 7,
      close: vi.fn(),
    }
    const getWindowById = vi.fn(windowId => (windowId === 7 ? sourceWin : null))
    const getDocumentContext = vi.fn((windowId) => {
      if (windowId === 7) {
        return {
          path: null,
          exists: false,
          content: '',
          saved: true,
          fileName: 'Unnamed',
        }
      }
      if (windowId === 18) {
        return {
          path: 'C:/docs/opened.md',
          exists: true,
          content: '# 打开的内容',
          saved: false,
          fileName: 'opened.md',
        }
      }
      return null
    })
    const getSessionSnapshot = vi.fn((windowId) => {
      if (windowId === 7) {
        return {
          sessionId: 'session-7',
          content: '',
          saved: true,
        }
      }
      if (windowId === 18) {
        return {
          sessionId: 'session-18',
          content: '# 18',
          saved: false,
        }
      }
      return null
    })
    const openWindow = vi.fn(async () => 18)

    const result = await openDocumentWindowWithRuntimePolicy({
      targetPath: 'C:/docs/opened.md',
      trigger: 'user',
      sourceWindowId: 7,
      openWindow,
      getWindowById,
      getDocumentContext,
      getSessionSnapshot,
    })

    expect(openWindow).toHaveBeenCalledWith('C:/docs/opened.md', {
      isRecent: false,
      trigger: 'user',
    })
    expect(getWindowById).toHaveBeenCalledWith(7)
    expect(sourceWin.close).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ok: true,
      reason: 'opened',
      path: 'C:/docs/opened.md',
      trigger: 'user',
      snapshot: {
        sessionId: 'session-18',
        content: '# 18',
        saved: false,
      },
    })
  })

  it('document.open-path 必须由 runtime 组装打开结果，并在打开其他文档后关闭空白草稿源窗口', async () => {
    const {
      runtime,
      openDocumentWindow,
      getDocumentContext,
      getWindowById,
      windowBridge,
    } = createRuntimeContext()
    getDocumentContext.mockImplementation((windowId) => {
      if (windowId === 7) {
        return {
          path: null,
          exists: false,
          content: '',
          saved: true,
          fileName: 'Unnamed',
        }
      }
      if (windowId === 18) {
        return {
          path: 'C:/docs/opened.md',
          exists: true,
          content: '# 打开的内容',
          saved: false,
          fileName: 'opened.md',
        }
      }
      return {
        path: windowId == null ? null : `C:/docs/${windowId}.md`,
        exists: true,
        content: '# 内容',
        saved: false,
        fileName: `${windowId}.md`,
      }
    })
    windowBridge.getSessionSnapshot.mockImplementation(windowId => ({
      sessionId: `session-${windowId}`,
      content: `# ${windowId}`,
      saved: windowId === 7,
    }))

    const sourceWindow = getWindowById(7)
    const result = await runtime.executeUiCommand(7, 'document.open-path', {
      path: 'C:/docs/opened.md',
      trigger: 'user',
    })

    expect(openDocumentWindow).toHaveBeenCalledWith('C:/docs/opened.md', {
      isRecent: false,
      trigger: 'user',
    })
    expect(sourceWindow.close).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ok: true,
      reason: 'opened',
      path: 'C:/docs/opened.md',
      trigger: 'user',
      snapshot: {
        sessionId: 'session-18',
        content: '# 18',
        saved: false,
      },
    })
  })

  it('document.open-path 命中 invalid-extension 时，必须保留结构化结果并补统一 warning 消息', async () => {
    const { runtime, effectService, windowBridge } = createRuntimeContext()
    effectService.executeCommand.mockResolvedValueOnce({
      ok: false,
      reason: 'open-target-invalid-extension',
      path: 'C:/docs/plain.txt',
    })

    const result = await runtime.executeUiCommand(8, 'document.open-path', {
      path: 'C:/docs/plain.txt',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-invalid-extension',
      path: 'C:/docs/plain.txt',
    })
    expect(windowBridge.publishMessage).toHaveBeenCalledWith({
      windowId: 8,
      data: {
        type: 'warning',
        content: 'message.onlyMarkdownFilesCanBeOpened',
      },
      snapshot: {
        sessionId: 'session-8',
        content: '# 8',
        saved: false,
      },
    })
  })

  it('document.open-path 命中 open-target-read-failed 时，有窗口上下文必须同时发送窗口消息和系统通知', async () => {
    const {
      runtime,
      effectService,
      windowBridge,
      publishOpenFailureSystemNotification,
    } = createRuntimeContext()
    effectService.executeCommand.mockResolvedValueOnce({
      ok: false,
      reason: 'open-target-read-failed',
      path: 'C:/docs/locked.md',
    })

    const result = await runtime.executeUiCommand(8, 'document.open-path', {
      path: 'C:/docs/locked.md',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-read-failed',
      path: 'C:/docs/locked.md',
    })
    expect(windowBridge.publishMessage).toHaveBeenCalledWith({
      windowId: 8,
      data: {
        type: 'error',
        content: 'message.openMarkdownFileFailed',
      },
      snapshot: {
        sessionId: 'session-8',
        content: '# 8',
        saved: false,
      },
    })
    expect(publishOpenFailureSystemNotification).toHaveBeenCalledWith({
      windowId: 8,
      path: 'C:/docs/locked.md',
    })
  })

  it('openDocumentPath(trigger=second-instance) 命中 open-target-read-failed 时，即使没有窗口上下文也必须发送系统通知', async () => {
    const {
      runtime,
      effectService,
      windowBridge,
      publishOpenFailureSystemNotification,
    } = createRuntimeContext()
    effectService.executeCommand.mockResolvedValueOnce({
      ok: false,
      reason: 'open-target-read-failed',
      path: 'C:/docs/locked.md',
    })

    const result = await runtime.openDocumentPath('C:/docs/locked.md', {
      trigger: 'second-instance',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-read-failed',
      path: 'C:/docs/locked.md',
    })
    expect(windowBridge.publishMessage).not.toHaveBeenCalled()
    expect(publishOpenFailureSystemNotification).toHaveBeenCalledWith({
      windowId: null,
      path: 'C:/docs/locked.md',
    })
  })

  it('document.get-session-snapshot 必须返回 windowBridge 中的快照真相', async () => {
    const { runtime } = createRuntimeContext()

    const snapshot = await runtime.executeUiCommand(9, 'document.get-session-snapshot', null)

    expect(snapshot).toEqual({
      sessionId: 'session-9',
      content: '# 9',
      saved: false,
    })
  })

  it('document.open-recent(trigger=user) 必须由 runtime 把内部 missing 信号映射成 recent-missing 结果', async () => {
    const {
      runtime,
      effectService,
    } = createRuntimeContext()
    effectService.executeCommand.mockResolvedValueOnce({
      ok: false,
      reason: 'open-recent-target-missing',
      path: 'C:/docs/missing-user.md',
    })

    const result = await runtime.openRecent('C:/docs/missing-user.md', {
      trigger: 'user',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'recent-missing',
      path: 'C:/docs/missing-user.md',
    })
  })

  it('document.open-recent(trigger=startup) 必须由 runtime 组装 recent-missing 结果，而不是把裁决留给主入口适配器', async () => {
    const {
      runtime,
      getDocumentContext,
      windowBridge,
    } = createRuntimeContext()
    getDocumentContext.mockImplementation((windowId) => {
      if (windowId === 19) {
        return {
          path: null,
          exists: false,
          content: '',
          saved: true,
          fileName: 'Unnamed',
        }
      }
      return {
        path: windowId == null ? null : `C:/docs/${windowId}.md`,
        exists: true,
        content: '# 内容',
        saved: false,
        fileName: `${windowId}.md`,
      }
    })
    windowBridge.getSessionSnapshot.mockImplementation(windowId => ({
      sessionId: `session-${windowId}`,
      content: `# ${windowId}`,
      saved: windowId === 19,
    }))

    const result = await runtime.openRecent('C:/docs/missing.md', {
      trigger: 'startup',
    })

    expect(result).toEqual({
      ok: true,
      reason: 'recent-missing',
      path: 'C:/docs/missing.md',
      trigger: 'startup',
      snapshot: {
        sessionId: 'session-19',
        content: '# 19',
        saved: true,
      },
    })
  })

  it('document.open-recent(trigger=startup) 命中 open-target-read-failed 时，即使没有窗口上下文也必须发送系统通知', async () => {
    const {
      runtime,
      effectService,
      windowBridge,
      publishOpenFailureSystemNotification,
    } = createRuntimeContext()
    effectService.executeCommand.mockResolvedValueOnce({
      ok: false,
      reason: 'open-target-read-failed',
      path: 'C:/docs/locked.md',
    })

    const result = await runtime.openRecent('C:/docs/locked.md', {
      trigger: 'startup',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-read-failed',
      path: 'C:/docs/locked.md',
    })
    expect(windowBridge.publishMessage).not.toHaveBeenCalled()
    expect(publishOpenFailureSystemNotification).toHaveBeenCalledWith({
      windowId: null,
      path: 'C:/docs/locked.md',
    })
  })

  it('source recent-missing 窗口打开其他文档时，不得被当成 pristine draft 自动关闭', async () => {
    const {
      runtime,
      getDocumentContext,
      getWindowById,
      windowBridge,
    } = createRuntimeContext()
    getDocumentContext.mockImplementation((windowId) => {
      if (windowId === 7) {
        return {
          path: null,
          exists: false,
          content: '',
          saved: true,
          fileName: 'Unnamed',
        }
      }
      if (windowId === 18) {
        return {
          path: 'C:/docs/opened.md',
          exists: true,
          content: '# 打开的内容',
          saved: false,
          fileName: 'opened.md',
        }
      }
      return {
        path: windowId == null ? null : `C:/docs/${windowId}.md`,
        exists: true,
        content: '# 内容',
        saved: false,
        fileName: `${windowId}.md`,
      }
    })
    windowBridge.getSessionSnapshot.mockImplementation(windowId => ({
      sessionId: `session-${windowId}`,
      content: windowId === 7 ? '' : `# ${windowId}`,
      saved: true,
      isRecentMissing: windowId === 7,
    }))

    const sourceWindow = getWindowById(7)
    await runtime.executeUiCommand(7, 'document.open-path', {
      path: 'C:/docs/opened.md',
      trigger: 'user',
    })

    expect(sourceWindow.close).not.toHaveBeenCalled()
  })

  it('recent 列表广播必须继续走 windowBridge 的统一出口', () => {
    const { runtime, windowBridge } = createRuntimeContext()
    const recentList = [
      {
        path: 'C:/docs/demo.md',
        name: 'demo.md',
      },
    ]

    const result = runtime.publishRecentListChanged(recentList)

    expect(windowBridge.publishRecentListChanged).toHaveBeenCalledWith(recentList)
    expect(result).toEqual(recentList)
  })

  it('runtime 单例必须等待显式 initialize 后才可读取，不能在模块加载时隐式完成初始化', () => {
    resetDocumentSessionRuntime()
    expect(() => getDocumentSessionRuntime()).toThrow('document session runtime 尚未初始化')

    const runtime = initializeDocumentSessionRuntime({
      ...createRequiredRuntimeDeps({
        effectService: {
          executeCommand: vi.fn(),
        },
        windowBridge: {
          getSessionSnapshot: vi.fn(() => null),
          publishSnapshotChanged: vi.fn(),
          publishMessage: vi.fn(),
          publishRecentListChanged: vi.fn(),
        },
      }),
      commandRunner: {
        run: vi.fn(),
      },
      executeDocumentCommand: vi.fn(),
    })

    expect(getDocumentSessionRuntime()).toBe(runtime)
    resetDocumentSessionRuntime()
  })
})
