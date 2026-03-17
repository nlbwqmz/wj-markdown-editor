import { beforeEach, describe, expect, it, vi } from 'vitest'

const createWatchStateMock = vi.fn(() => ({
  watcher: null,
  subscription: null,
  subscriptionToken: 0,
  watchingPath: null,
  watchingDirectoryPath: null,
  currentVersion: 0,
  lastInternalSaveAt: 0,
  lastInternalSavedVersion: null,
  recentInternalSaves: [],
  lastHandledVersionHash: null,
  pendingChange: null,
  fileExists: null,
  stopped: false,
}))
const startWatchingMock = vi.fn()
const stopWatchingMock = vi.fn((state) => {
  state.watcher = null
  state.subscription = null
  state.watchingPath = null
  state.watchingDirectoryPath = null
})
const markInternalSaveMock = vi.fn()
const settlePendingChangeMock = vi.fn()
const ignorePendingChangeMock = vi.fn()
const createContentVersionMock = vi.fn((content = '') => `hash:${content}`)

vi.mock('../../fileWatchUtil.js', () => ({
  default: {
    createWatchState: createWatchStateMock,
    startWatching: startWatchingMock,
    stopWatching: stopWatchingMock,
    markInternalSave: markInternalSaveMock,
    settlePendingChange: settlePendingChangeMock,
    ignorePendingChange: ignorePendingChangeMock,
    createContentVersion: createContentVersionMock,
  },
}))

async function createBridgeContext(overrides = {}) {
  const dispatchCommand = overrides.dispatchCommand || vi.fn().mockResolvedValue({})
  const getCurrentBindingToken = overrides.getCurrentBindingToken || (() => 5)
  const getCurrentObservedFloor = overrides.getCurrentObservedFloor || (() => 10)
  const watch = overrides.watch || vi.fn(() => ({ close: vi.fn() }))
  const watchState = overrides.watchState || createWatchStateMock()

  const { createExternalWatchBridge } = await import('../externalWatchBridge.js')
  const bridge = createExternalWatchBridge({
    watch,
    watchState,
    dispatchCommand,
    getCurrentBindingToken,
    getCurrentObservedFloor,
  })

  return {
    bridge,
    dispatchCommand,
    watch,
    watchState,
  }
}

describe('externalWatchBridge', () => {
  beforeEach(() => {
    vi.resetModules()
    createWatchStateMock.mockClear()
    startWatchingMock.mockReset()
    stopWatchingMock.mockClear()
    markInternalSaveMock.mockClear()
    settlePendingChangeMock.mockClear()
    ignorePendingChangeMock.mockClear()
    createContentVersionMock.mockClear()
  })

  it('watch bridge 必须把 onExternalChange / onMissing / onRestored / onError 全部回流到统一命令', async () => {
    const dispatchCommand = vi.fn()
      .mockResolvedValueOnce({
        session: {
          watchRuntime: {
            eventFloorObservedAt: 11,
          },
          externalRuntime: {
            pendingExternalChange: null,
            lastHandledVersionHash: 'hash:# 外部内容',
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          watchRuntime: {
            eventFloorObservedAt: 12,
          },
          documentSource: {
            exists: false,
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          watchRuntime: {
            eventFloorObservedAt: 13,
          },
        },
      })
      .mockResolvedValueOnce({})
    const { bridge, watchState } = await createBridgeContext({
      dispatchCommand,
    })

    const startResult = bridge.start({
      watchingPath: 'C:/docs/demo.md',
      bindingToken: 7,
    })

    expect(startResult).toEqual({
      ok: true,
      watchingPath: 'C:/docs/demo.md',
      watchingDirectoryPath: 'C:/docs',
    })
    expect(startWatchingMock).toHaveBeenCalledTimes(1)

    const watchOptions = startWatchingMock.mock.calls[0][0]
    await watchOptions.onExternalChange({
      content: '# 外部内容',
    }, {
      bindingToken: 7,
      watchingPath: 'C:/docs/demo.md',
      observedAt: 11,
      diskStat: {
        mtimeMs: 11,
      },
    })
    await watchOptions.onMissing(new Error('ENOENT'), {
      bindingToken: 7,
      watchingPath: 'C:/docs/demo.md',
      observedAt: 12,
    })
    await watchOptions.onRestored('# 恢复内容', {
      bindingToken: 7,
      watchingPath: 'C:/docs/demo.md',
      observedAt: 13,
      diskStat: {
        mtimeMs: 13,
      },
    })
    watchOptions.onError(new Error('watch failed'), {
      bindingToken: 7,
      watchingPath: 'C:/docs/demo.md',
    })
    await Promise.resolve()

    expect(dispatchCommand.mock.calls).toEqual([
      ['watch.file-changed', {
        bindingToken: 7,
        watchingPath: 'C:/docs/demo.md',
        observedAt: 11,
        diskContent: '# 外部内容',
        diskStat: {
          mtimeMs: 11,
        },
      }, {
        publishSnapshotChanged: 'if-changed',
      }],
      ['watch.file-missing', {
        bindingToken: 7,
        watchingPath: 'C:/docs/demo.md',
        observedAt: 12,
        error: expect.any(Error),
      }, {
        publishSnapshotChanged: 'if-changed',
      }],
      ['watch.file-restored', {
        bindingToken: 7,
        watchingPath: 'C:/docs/demo.md',
        observedAt: 13,
        diskContent: '# 恢复内容',
        diskStat: {
          mtimeMs: 13,
        },
      }, {
        publishSnapshotChanged: 'if-changed',
      }],
      ['watch.error', {
        bindingToken: 7,
        watchingPath: 'C:/docs/demo.md',
        error: expect.any(Error),
      }],
    ])
    expect(settlePendingChangeMock).toHaveBeenCalledWith(watchState, 'hash:# 外部内容')
    expect(watchState.recentInternalSaves).toEqual([])
    expect(watchState.lastInternalSaveAt).toBe(0)
    expect(watchState.lastInternalSavedVersion).toBeNull()
    expect(watchState.lastHandledVersionHash).toBeNull()
    expect(watchState.pendingChange).toBeNull()
    expect(watchState.fileExists).toBe(false)
  })

  it('live watcher 事件如果未被统一命令流接收，bridge 不能错误 settle pending 或重置历史', async () => {
    const watchState = createWatchStateMock()
    watchState.recentInternalSaves = [{ versionHash: 'hash:# 外部内容', savedAt: 1 }]
    watchState.lastInternalSaveAt = 1
    watchState.lastInternalSavedVersion = 'hash:# 外部内容'
    watchState.lastHandledVersionHash = 'hash:# 外部内容'
    watchState.pendingChange = {
      version: 1,
      versionHash: 'hash:# 外部内容',
    }
    const dispatchCommand = vi.fn()
      .mockResolvedValueOnce({
        session: {
          watchRuntime: {
            eventFloorObservedAt: 10,
          },
          externalRuntime: {
            pendingExternalChange: null,
            lastHandledVersionHash: 'hash:# 外部内容',
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          watchRuntime: {
            eventFloorObservedAt: 10,
          },
          documentSource: {
            exists: false,
          },
        },
      })
    const { bridge } = await createBridgeContext({
      dispatchCommand,
      watchState,
      getCurrentObservedFloor: () => 10,
    })

    bridge.start({
      watchingPath: 'C:/docs/demo.md',
      bindingToken: 7,
    })
    const watchOptions = startWatchingMock.mock.calls[0][0]

    await watchOptions.onExternalChange({
      content: '# 外部内容',
    }, {
      bindingToken: 7,
      watchingPath: 'C:/docs/demo.md',
      observedAt: 10,
    })
    await watchOptions.onMissing(new Error('ENOENT'), {
      bindingToken: 7,
      watchingPath: 'C:/docs/demo.md',
      observedAt: 10,
    })

    expect(settlePendingChangeMock).not.toHaveBeenCalled()
    expect(watchState.recentInternalSaves).toEqual([{ versionHash: 'hash:# 外部内容', savedAt: 1 }])
    expect(watchState.lastInternalSaveAt).toBe(1)
    expect(watchState.lastInternalSavedVersion).toBe('hash:# 外部内容')
    expect(watchState.lastHandledVersionHash).toBe('hash:# 外部内容')
    expect(watchState.pendingChange).toEqual({
      version: 1,
      versionHash: 'hash:# 外部内容',
    })
  })

  it('bridge 必须暴露 stop / markInternalSave / settlePendingChange / ignorePendingChange，并保持底层状态透传', async () => {
    const watchState = createWatchStateMock()
    watchState.watcher = { close: vi.fn() }
    watchState.subscription = {
      bindingToken: 9,
    }
    const { bridge } = await createBridgeContext({
      watchState,
    })

    bridge.markInternalSave('# demo')
    bridge.settlePendingChange('hash:# demo')
    bridge.ignorePendingChange()
    const stopped = bridge.stop()

    expect(markInternalSaveMock).toHaveBeenCalledWith(watchState, '# demo')
    expect(settlePendingChangeMock).toHaveBeenCalledWith(watchState, 'hash:# demo')
    expect(ignorePendingChangeMock).toHaveBeenCalledWith(watchState)
    expect(stopWatchingMock).toHaveBeenCalledWith(watchState)
    expect(stopped).toBe(true)
  })

  it('watch bridge 在缺少 watchingPath 时必须返回稳定失败结果，而不是抛异常', async () => {
    const { bridge } = await createBridgeContext()

    expect(bridge.start()).toEqual({
      ok: false,
      watchingPath: null,
      watchingDirectoryPath: null,
      error: expect.objectContaining({
        message: 'watch path missing',
      }),
    })
    expect(startWatchingMock).not.toHaveBeenCalled()
  })
})
