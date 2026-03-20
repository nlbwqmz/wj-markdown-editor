import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDocumentSessionRuntime,
  getDocumentSessionRuntime,
  initializeDocumentSessionRuntime,
  resetDocumentSessionRuntime,
} from '../documentSessionRuntime.js'

function createRuntimeContext() {
  const windowContextMap = new Map()

  function getOrCreateWindowContext(windowId) {
    if (!windowContextMap.has(windowId)) {
      windowContextMap.set(windowId, {
        id: windowId,
        win: {
          id: windowId,
          close: vi.fn(),
        },
      })
    }
    return windowContextMap.get(windowId)
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
  const getWindowContext = vi.fn(windowId => (windowId == null
    ? null
    : getOrCreateWindowContext(windowId)))
  const getDocumentContext = vi.fn(windowId => ({
    path: windowId == null ? null : `C:/docs/${windowId}.md`,
    exists: true,
    content: '# 内容',
    saved: false,
    fileName: `${windowId}.md`,
  }))
  const openDocumentWindow = vi.fn(async (_targetPath, options = {}) => getOrCreateWindowContext(
    options.isRecent === true ? 19 : 18,
  ))

  const runtime = createDocumentSessionRuntime({
    commandRunner,
    effectService,
    executeDocumentCommand,
    executeResourceCommand,
    executeSyncQuery,
    windowBridge,
    getWindowContext,
    getDocumentContext,
    openDocumentWindow,
  })

  return {
    runtime,
    commandRunner,
    effectService,
    executeDocumentCommand,
    executeResourceCommand,
    executeSyncQuery,
    windowBridge,
    getWindowContext,
    getDocumentContext,
    openDocumentWindow,
  }
}

describe('documentSessionRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('必须作为统一组合根暴露 dispatch / executeUiCommand / getSessionSnapshot / getDocumentContext', () => {
    const { runtime } = createRuntimeContext()

    expect(typeof runtime.dispatch).toBe('function')
    expect(typeof runtime.executeUiCommand).toBe('function')
    expect(typeof runtime.executeSyncQuery).toBe('function')
    expect(typeof runtime.getSessionSnapshot).toBe('function')
    expect(typeof runtime.getDocumentContext).toBe('function')
    expect(typeof runtime.publishRecentListChanged).toBe('function')
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

  it('document.save / save-copy / document.edit 这类状态推进命令必须经 runtime 回流到真实 dispatch 链路', async () => {
    const { runtime, executeDocumentCommand, commandRunner } = createRuntimeContext()

    await runtime.executeUiCommand(4, 'document.save', null)
    await runtime.executeUiCommand(4, 'document.save-copy', null)
    await runtime.executeUiCommand(4, 'document.edit', {
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
  })

  it('document.request-close 也必须经 runtime 回流到真实 dispatch 链路，不能继续散落在外围关窗适配器里', async () => {
    const { runtime, executeDocumentCommand, commandRunner, effectService } = createRuntimeContext()

    await runtime.executeUiCommand(4, 'document.request-close', null)

    expect(executeDocumentCommand).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 4,
      command: 'document.request-close',
      payload: null,
      runtime,
    }))
    expect(commandRunner.run).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 4,
      command: 'document.request-close',
      payload: null,
    }))
    expect(effectService.executeCommand).not.toHaveBeenCalled()
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

  it('document.resource.open-in-folder / delete-local / resource.get-info 必须经 runtime 统一资源路由，不能继续回落到 effectService', async () => {
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

    await runtime.executeUiCommand(6, 'document.resource.open-in-folder', openPayload)
    await runtime.executeUiCommand(6, 'document.resource.delete-local', deletePayload)
    await runtime.executeUiCommand(6, 'resource.get-info', infoPayload)

    expect(executeResourceCommand).toHaveBeenNthCalledWith(1, expect.objectContaining({
      windowId: 6,
      command: 'document.resource.open-in-folder',
      payload: openPayload,
      runtime,
    }))
    expect(executeResourceCommand).toHaveBeenNthCalledWith(2, expect.objectContaining({
      windowId: 6,
      command: 'document.resource.delete-local',
      payload: deletePayload,
      runtime,
    }))
    expect(executeResourceCommand).toHaveBeenNthCalledWith(3, expect.objectContaining({
      windowId: 6,
      command: 'resource.get-info',
      payload: infoPayload,
      runtime,
    }))
    expect(effectService.executeCommand).not.toHaveBeenCalled()
  })

  it('resource.get-comparable-key 必须通过 runtime 的专用同步入口执行，不能继续混入 executeUiCommand 异步链路', () => {
    const { runtime, executeSyncQuery, effectService } = createRuntimeContext()
    const payload = './assets/demo.png?size=full'

    const result = runtime.executeSyncQuery?.(7, 'resource.get-comparable-key', payload)

    expect(typeof runtime.executeSyncQuery).toBe('function')
    expect(executeSyncQuery).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 7,
      command: 'resource.get-comparable-key',
      payload,
      runtime,
    }))
    expect(result).toBe(`comparable:${payload}`)
    expect(effectService.executeCommand).not.toHaveBeenCalled()
  })

  it('document.open-path 必须由 runtime 组装打开结果，并在打开其他文档后关闭空白草稿源窗口', async () => {
    const {
      runtime,
      openDocumentWindow,
      getDocumentContext,
      getWindowContext,
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

    const sourceWindow = getWindowContext(7)
    const result = await runtime.executeUiCommand(7, 'document.open-path', {
      path: 'C:/docs/opened.md',
      trigger: 'user',
    })

    expect(openDocumentWindow).toHaveBeenCalledWith('C:/docs/opened.md', {
      isRecent: false,
      trigger: 'user',
    })
    expect(sourceWindow.win.close).toHaveBeenCalledTimes(1)
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

  it('source recent-missing 窗口打开其他文档时，不得被当成 pristine draft 自动关闭', async () => {
    const {
      runtime,
      getDocumentContext,
      getWindowContext,
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

    const sourceWindow = getWindowContext(7)
    await runtime.executeUiCommand(7, 'document.open-path', {
      path: 'C:/docs/opened.md',
      trigger: 'user',
    })

    expect(sourceWindow.win.close).not.toHaveBeenCalled()
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
      commandRunner: {
        run: vi.fn(),
      },
      effectService: {
        executeCommand: vi.fn(),
      },
      windowBridge: {
        getSessionSnapshot: vi.fn(() => null),
        publishSnapshotChanged: vi.fn(),
        publishMessage: vi.fn(),
        publishRecentListChanged: vi.fn(),
      },
      executeDocumentCommand: vi.fn(),
    })

    expect(getDocumentSessionRuntime()).toBe(runtime)
    resetDocumentSessionRuntime()
  })
})
