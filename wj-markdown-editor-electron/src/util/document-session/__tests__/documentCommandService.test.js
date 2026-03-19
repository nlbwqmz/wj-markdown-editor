import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDocumentCommandService } from '../documentCommandService.js'
import { createBoundFileSession, createDraftSession } from '../documentSessionFactory.js'
import { createDocumentSessionStore } from '../documentSessionStore.js'
import { createSaveCoordinator } from '../saveCoordinator.js'

const { createIdMock } = vi.hoisted(() => {
  return {
    createIdMock: vi.fn(),
  }
})

vi.mock('../../commonUtil.js', () => {
  return {
    default: {
      createId: createIdMock,
    },
  }
})

function createTestContext(config = []) {
  const normalizedConfig = Array.isArray(config)
    ? { autoSave: config }
    : { autoSave: [], ...config }
  const store = createDocumentSessionStore()
  const saveCoordinator = createSaveCoordinator()
  const service = createDocumentCommandService({
    store,
    saveCoordinator,
    getConfig: () => ({
      ...normalizedConfig,
    }),
  })

  return {
    store,
    service,
  }
}

function bindSession(store, session, windowId = 1001) {
  store.createSession(session)
  store.bindWindowToSession({
    windowId,
    sessionId: session.sessionId,
  })
  return windowId
}

describe('documentCommandService', () => {
  beforeEach(() => {
    let jobIndex = 1
    createIdMock.mockReset()
    createIdMock.mockImplementation(() => `job-${jobIndex++}`)
    vi.useFakeTimers()
    vi.setSystemTime(1700000002000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('window.blur 触发自动保存时，必须走统一保存管线且 trigger=blur-auto-save，并且不发送成功提示', () => {
    const { store, service } = createTestContext(['blur'])
    const session = createBoundFileSession({
      sessionId: 'blur-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002001,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# blur 自动保存内容',
      },
    })

    const blurRequested = service.dispatch({
      windowId,
      command: 'window.blur',
    })

    expect(blurRequested.effects).toEqual([
      {
        type: 'execute-save',
        job: expect.objectContaining({
          trigger: 'blur-auto-save',
          content: '# blur 自动保存内容',
        }),
      },
    ])

    const blurSaveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-1',
        revision: 1,
        content: '# blur 自动保存内容',
        path: 'C:/docs/demo.md',
        trigger: 'blur-auto-save',
        savedAt: 1700000002002,
        stat: null,
      },
    })

    expect(blurSaveSucceeded.effects.find(effect => effect.type === 'show-message')).toBeUndefined()
  })

  it('document.edit 命中相同内容时必须走 no-op，不能继续推进 revision 或 requestedRevision', () => {
    const { store, service } = createTestContext([])
    const session = createBoundFileSession({
      sessionId: 'document-edit-noop-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002001,
    })
    const windowId = bindSession(store, session)

    const firstEdited = service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 最终内容',
      },
    })
    const firstUpdatedAt = firstEdited.session.editorSnapshot.updatedAt

    vi.setSystemTime(1700000002002)
    const secondEdited = service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 最终内容',
      },
    })

    expect(firstEdited.snapshot.revision).toBe(1)
    expect(firstEdited.session.saveRuntime.requestedRevision).toBe(1)
    expect(secondEdited.snapshot.content).toBe('# 最终内容')
    expect(secondEdited.snapshot.revision).toBe(1)
    expect(secondEdited.session.editorSnapshot.updatedAt).toBe(firstUpdatedAt)
    expect(secondEdited.session.saveRuntime.requestedRevision).toBe(1)
  })

  it('blur-auto-save 进行中收到 document.save 时，当前 save 失败通知必须升级为 manual-save', () => {
    const { store, service } = createTestContext(['blur'])
    const session = createBoundFileSession({
      sessionId: 'manual-save-should-upgrade-current-auto-save-failure-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002003,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# blur 自动保存内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'window.blur',
    })

    const manualSaveRequested = service.dispatch({
      windowId,
      command: 'document.save',
    })

    expect(manualSaveRequested.effects).toEqual([])
    expect(manualSaveRequested.session.saveRuntime.trigger).toBe('manual-save')

    const saveFailed = service.dispatch({
      windowId,
      command: 'save.failed',
      payload: {
        jobId: 'job-1',
        trigger: 'blur-auto-save',
        error: new Error('磁盘写入失败'),
      },
    })

    expect(saveFailed.effects).toContainEqual({
      type: 'notify-save-failed',
      trigger: 'manual-save',
      error: {
        name: 'Error',
        message: '磁盘写入失败',
      },
    })
  })

  it('blur-auto-save 进行中收到 document.save 后，如果保存期间又有新编辑，后续补写必须沿用 manual-save', () => {
    const { store, service } = createTestContext(['blur'])
    const session = createBoundFileSession({
      sessionId: 'manual-save-should-upgrade-follow-up-save-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002004,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 第一版内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'window.blur',
    })
    service.dispatch({
      windowId,
      command: 'document.save',
    })

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 第二版内容',
      },
    })

    const saveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-1',
        revision: 1,
        content: '# 第一版内容',
        path: 'C:/docs/demo.md',
        trigger: 'blur-auto-save',
        savedAt: 1700000002005,
        stat: null,
      },
    })

    expect(saveSucceeded.effects).toContainEqual({
      type: 'execute-save',
      job: expect.objectContaining({
        jobId: 'job-2',
        trigger: 'manual-save',
        revision: 2,
        content: '# 第二版内容',
      }),
    })
  })

  it('copy-save.succeeded / copy-save.failed 必须作为标准结果命令回流命令层，而不是旁路返回给 renderer', () => {
    const { store, service } = createTestContext([])
    const session = createBoundFileSession({
      sessionId: 'copy-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002010,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 副本内容',
      },
    })

    const copyRequested = service.dispatch({
      windowId,
      command: 'document.save-copy',
    })
    const copySelected = service.dispatch({
      windowId,
      command: 'dialog.copy-target-selected',
      payload: {
        path: 'C:/docs/demo-copy.md',
      },
    })
    const copySucceeded = service.dispatch({
      windowId,
      command: 'copy-save.succeeded',
      payload: {
        path: 'C:/docs/demo-copy.md',
      },
    })
    const copyFailed = service.dispatch({
      windowId,
      command: 'copy-save.failed',
      payload: {
        reason: 'write-failed',
        path: 'C:/docs/demo-copy.md',
      },
    })

    expect(copyRequested.effects).toEqual([
      expect.objectContaining({
        type: 'open-copy-dialog',
        requestId: 'copy-save-request-1',
      }),
    ])
    expect(copySelected.effects).toEqual([
      {
        type: 'execute-copy-save',
        job: expect.objectContaining({
          path: 'C:/docs/demo-copy.md',
          content: '# 副本内容',
        }),
      },
    ])
    expect(copySelected).not.toHaveProperty('copySaveResult')
    expect(copySucceeded.snapshot.saved).toBe(false)
    expect(copyFailed.snapshot.saved).toBe(false)
  })

  it('dialog.copy-target-cancelled 发生后不得改动当前 active session、当前保存态或 watcher 绑定', () => {
    const { store, service } = createTestContext([])
    const session = createBoundFileSession({
      sessionId: 'cancel-copy-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002020,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.save-copy',
    })
    const cancelled = service.dispatch({
      windowId,
      command: 'dialog.copy-target-cancelled',
    })

    expect(store.getSessionByWindowId(windowId)?.sessionId).toBe('cancel-copy-session')
    expect(cancelled.snapshot.saved).toBe(true)
    expect(cancelled.session.watchRuntime.bindingToken).toBe(0)
  })

  it('save-copy 成功后，当前 active session 的 path、saved、watch 绑定与标题都不变化', () => {
    const { store, service } = createTestContext([])
    const session = createBoundFileSession({
      sessionId: 'copy-success-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002021,
    })
    session.watchRuntime.bindingToken = 7
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 未保存内容',
      },
    })

    service.dispatch({
      windowId,
      command: 'document.save-copy',
    })
    service.dispatch({
      windowId,
      command: 'dialog.copy-target-selected',
      payload: {
        path: 'C:/docs/demo-copy.md',
      },
    })
    const copySucceeded = service.dispatch({
      windowId,
      command: 'copy-save.succeeded',
      payload: {
        path: 'C:/docs/demo-copy.md',
      },
    })

    expect(copySucceeded.session.documentSource.path).toBe('C:/docs/demo.md')
    expect(copySucceeded.session.persistedSnapshot.path).toBe('C:/docs/demo.md')
    expect(copySucceeded.snapshot.saved).toBe(false)
    expect(copySucceeded.snapshot.windowTitle).toBe('demo.md')
    expect(copySucceeded.session.watchRuntime.bindingToken).toBe(7)
    expect(copySucceeded.session.watchRuntime.watchingPath).toBe('C:/docs/demo.md')
  })

  it('关闭请求命中 autoSave=close 且已有有效路径时，必须走同一保存管线而不是旁路写盘', () => {
    const { store, service } = createTestContext(['close'])
    const session = createBoundFileSession({
      sessionId: 'close-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002030,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 关闭前自动保存内容',
      },
    })

    const closeRequested = service.dispatch({
      windowId,
      command: 'document.request-close',
    })

    expect(closeRequested.effects).toEqual([
      {
        type: 'hold-window-close',
      },
      {
        type: 'execute-save',
        job: expect.objectContaining({
          trigger: 'close-auto-save',
          content: '# 关闭前自动保存内容',
        }),
      },
    ])
    expect(closeRequested.session.closeRuntime.waitingSaveJobId).toBe('job-1')
  })

  it('document.cancel-close 会清空 closeRuntime 并回到继续编辑态', () => {
    const { store, service } = createTestContext([])
    const session = createBoundFileSession({
      sessionId: 'cancel-close-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002040,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 未保存内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'document.request-close',
    })
    const cancelled = service.dispatch({
      windowId,
      command: 'document.cancel-close',
    })

    expect(cancelled.session.closeRuntime).toEqual({
      intent: null,
      promptReason: null,
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    })
    expect(cancelled.snapshot.saved).toBe(false)
  })

  it('document.confirm-force-close 会把 forceClose=true 并允许窗口立即关闭', () => {
    const { store, service } = createTestContext([])
    const session = createBoundFileSession({
      sessionId: 'force-close-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002050,
    })
    const windowId = bindSession(store, session)

    const confirmed = service.dispatch({
      windowId,
      command: 'document.confirm-force-close',
    })

    expect(confirmed.session.closeRuntime.forceClose).toBe(true)
    expect(confirmed.effects).toEqual([
      {
        type: 'close-window',
      },
    ])
  })

  it('关闭请求发生时如果已有 in-flight save 且已覆盖当前 revision，应等待已有 job，而不是重复起并发保存', () => {
    const { store, service } = createTestContext(['close'])
    const session = createBoundFileSession({
      sessionId: 'wait-job-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002060,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 第一版内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'document.save',
    })

    const closeRequested = service.dispatch({
      windowId,
      command: 'document.request-close',
    })

    expect(closeRequested.effects).toEqual([
      {
        type: 'hold-window-close',
      },
    ])
    expect(closeRequested.session.closeRuntime.waitingSaveJobId).toBe('job-1')
  })

  it('即使当前 dirty=false，只要已有 in-flight save，关闭请求也必须先等待 waitingSaveJobId，而不是直接关闭', () => {
    const { store, service } = createTestContext(['close'])
    const session = createBoundFileSession({
      sessionId: 'close-wait-even-clean-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002065,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 第一版内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'document.save',
    })

    // 这里故意把磁盘基线改成与编辑态一致，模拟“当前 dirty=false，但已有 save job 仍在飞行中”。
    // reviewer 指出的 blocker 正是：这种情况下不能因为 dirty=false 就绕过等待矩阵直接关闭。
    const inFlightSession = store.getSessionByWindowId(windowId)
    inFlightSession.diskSnapshot.content = '# 第一版内容'
    inFlightSession.diskSnapshot.exists = true

    const closeRequested = service.dispatch({
      windowId,
      command: 'document.request-close',
    })

    expect(closeRequested.effects).toEqual([
      {
        type: 'hold-window-close',
      },
    ])
    expect(closeRequested.session.closeRuntime.waitingSaveJobId).toBe('job-1')
  })

  it('关闭请求发生时如果已有 in-flight save 但未覆盖当前最新 revision，应等待已有 job 后补写最新 revision', () => {
    const { store, service } = createTestContext(['close'])
    const session = createBoundFileSession({
      sessionId: 'close-matrix-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002070,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 第一版内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'document.save',
    })
    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 第二版内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'document.request-close',
    })

    const firstSaveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-1',
        revision: 1,
        content: '# 第一版内容',
        path: 'C:/docs/demo.md',
        trigger: 'manual-save',
        savedAt: 1700000002071,
        stat: null,
      },
    })

    expect(firstSaveSucceeded.effects).toEqual([
      {
        type: 'execute-save',
        job: expect.objectContaining({
          jobId: 'job-2',
          revision: 2,
          trigger: 'close-auto-save',
        }),
      },
    ])
    expect(firstSaveSucceeded.session.closeRuntime.waitingSaveJobId).toBe('job-2')

    const secondSaveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-2',
        revision: 2,
        content: '# 第二版内容',
        path: 'C:/docs/demo.md',
        trigger: 'close-auto-save',
        savedAt: 1700000002072,
        stat: null,
      },
    })

    expect(secondSaveSucceeded.effects).toEqual([
      {
        type: 'close-window',
      },
    ])
  })

  it('关闭链路等待 manual-save 结果时，如果 watcher 已先观测到外部版本，save.succeeded 不得继续关闭窗口', () => {
    const { store, service } = createTestContext({
      autoSave: ['close'],
      externalFileChangeStrategy: 'prompt',
    })
    const session = createBoundFileSession({
      sessionId: 'close-after-manual-save-with-external-change-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002073,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 本地保存内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'document.save',
    })

    const closeRequested = service.dispatch({
      windowId,
      command: 'document.request-close',
    })
    const waitingSaveJobId = closeRequested.session.closeRuntime.waitingSaveJobId
    const watched = service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002074,
        diskContent: '# 外部版本',
        diskStat: {
          mtimeMs: 1700000002074,
        },
      },
    })
    const pendingVersionHash = watched.session.externalRuntime.pendingExternalChange?.versionHash

    const saveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-1',
        revision: 1,
        content: '# 本地保存内容',
        path: 'C:/docs/demo.md',
        trigger: 'manual-save',
        savedAt: 1700000002075,
        stat: {
          mtimeMs: 1700000002075,
        },
      },
    })

    expect(waitingSaveJobId).toBe('job-1')
    expect(saveSucceeded.effects.find(effect => effect.type === 'close-window')).toBeUndefined()
    expect(saveSucceeded.effects).toContainEqual({
      type: 'show-unsaved-prompt',
    })
    expect(saveSucceeded.snapshot.saved).toBe(false)
    expect(saveSucceeded.snapshot.dirty).toBe(true)
    expect(saveSucceeded.snapshot.closePrompt).toEqual({
      visible: true,
      reason: 'unsaved-changes',
      allowForceClose: true,
    })
    expect(saveSucceeded.snapshot.externalPrompt).toMatchObject({
      version: 1,
      externalContent: '# 外部版本',
    })
    expect(saveSucceeded.session.diskSnapshot.content).toBe('# 外部版本')
    expect(saveSucceeded.session.diskSnapshot.versionHash).toBe(pendingVersionHash)
    expect(saveSucceeded.session.closeRuntime).toEqual({
      intent: 'close',
      promptReason: 'unsaved-changes',
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    })
  })

  it('close-auto-save 遇到保存期间外部变更时，save.succeeded 不得继续关闭窗口', () => {
    const { store, service } = createTestContext({
      autoSave: ['close'],
      externalFileChangeStrategy: 'prompt',
    })
    const session = createBoundFileSession({
      sessionId: 'close-auto-save-with-external-change-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002076,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 关闭前自动保存内容',
      },
    })
    const closeRequested = service.dispatch({
      windowId,
      command: 'document.request-close',
    })
    const watched = service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002077,
        diskContent: '# 外部版本',
        diskStat: {
          mtimeMs: 1700000002077,
        },
      },
    })
    const pendingVersionHash = watched.session.externalRuntime.pendingExternalChange?.versionHash

    const saveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-1',
        revision: 1,
        content: '# 关闭前自动保存内容',
        path: 'C:/docs/demo.md',
        trigger: 'close-auto-save',
        savedAt: 1700000002078,
        stat: {
          mtimeMs: 1700000002078,
        },
      },
    })

    expect(closeRequested.effects).toEqual([
      {
        type: 'hold-window-close',
      },
      {
        type: 'execute-save',
        job: expect.objectContaining({
          jobId: 'job-1',
          trigger: 'close-auto-save',
          content: '# 关闭前自动保存内容',
        }),
      },
    ])
    expect(saveSucceeded.effects.find(effect => effect.type === 'close-window')).toBeUndefined()
    expect(saveSucceeded.effects).toContainEqual({
      type: 'show-unsaved-prompt',
    })
    expect(saveSucceeded.snapshot.saved).toBe(false)
    expect(saveSucceeded.snapshot.externalPrompt).toMatchObject({
      version: 1,
      externalContent: '# 外部版本',
    })
    expect(saveSucceeded.session.diskSnapshot.content).toBe('# 外部版本')
    expect(saveSucceeded.session.diskSnapshot.versionHash).toBe(pendingVersionHash)
    expect(saveSucceeded.session.closeRuntime).toEqual({
      intent: 'close',
      promptReason: 'unsaved-changes',
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    })
  })

  it('关闭链路等待中的 save 若已无须补写且当前内容已收敛到 watcher 外部版本，仍应正常关闭窗口', () => {
    const { store, service } = createTestContext({
      autoSave: ['close'],
      externalFileChangeStrategy: 'prompt',
    })
    const session = createBoundFileSession({
      sessionId: 'close-after-save-already-converged-to-external-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002079,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 本地保存内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'document.save',
    })
    service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002080,
        diskContent: '# 外部版本',
        diskStat: {
          mtimeMs: 1700000002080,
        },
      },
    })
    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 外部版本',
      },
    })
    const closeRequested = service.dispatch({
      windowId,
      command: 'document.request-close',
    })
    const waitingSaveJobId = closeRequested.session.closeRuntime.waitingSaveJobId

    const saveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-1',
        revision: 1,
        content: '# 本地保存内容',
        path: 'C:/docs/demo.md',
        trigger: 'manual-save',
        savedAt: 1700000002081,
        stat: {
          mtimeMs: 1700000002081,
        },
      },
    })

    expect(waitingSaveJobId).toBe('job-1')
    expect(saveSucceeded.effects).toEqual([
      {
        type: 'close-window',
      },
    ])
    expect(saveSucceeded.snapshot.saved).toBe(true)
    expect(saveSucceeded.snapshot.dirty).toBe(false)
    expect(saveSucceeded.snapshot.externalPrompt).toBeNull()
    expect(saveSucceeded.session.closeRuntime).toEqual({
      intent: null,
      promptReason: null,
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    })
  })

  it('dialog.save-target-cancelled 发生在关闭链路的首次保存分支时，必须清空 closeRuntime 并保持窗口打开', () => {
    const { store, service } = createTestContext(['close'])
    const session = createDraftSession({
      sessionId: 'draft-close-session',
      now: 1700000002080,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 草稿内容',
      },
    })
    const closeRequested = service.dispatch({
      windowId,
      command: 'document.request-close',
    })
    const cancelled = service.dispatch({
      windowId,
      command: 'dialog.save-target-cancelled',
    })

    expect(closeRequested.effects).toEqual([
      {
        type: 'hold-window-close',
      },
      {
        type: 'open-save-dialog',
        trigger: 'close-auto-save',
      },
    ])
    expect(cancelled.session.documentSource.path).toBeNull()
    expect(cancelled.session.closeRuntime).toEqual({
      intent: null,
      promptReason: null,
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    })
    expect(cancelled.effects.find(effect => effect.type === 'show-unsaved-prompt')).toBeUndefined()
    expect(cancelled.effects.find(effect => effect.type === 'close-window')).toBeUndefined()
  })

  it('关闭链路首次保存已选路径并进入 in-flight 后，迟到的 dialog.save-target-cancelled 不得把状态拖回未保存确认态', () => {
    const { store, service } = createTestContext(['close'])
    const session = createDraftSession({
      sessionId: 'draft-close-stale-cancel-session',
      now: 1700000002083,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 草稿内容',
      },
    })

    const closeRequested = service.dispatch({
      windowId,
      command: 'document.request-close',
    })
    const pathSelected = service.dispatch({
      windowId,
      command: 'dialog.save-target-selected',
      payload: {
        path: 'C:/docs/draft-close.md',
      },
    })
    const staleCancelled = service.dispatch({
      windowId,
      command: 'dialog.save-target-cancelled',
    })

    expect(closeRequested.effects).toEqual([
      {
        type: 'hold-window-close',
      },
      {
        type: 'open-save-dialog',
        trigger: 'close-auto-save',
      },
    ])
    expect(pathSelected.effects).toEqual([
      {
        type: 'execute-save',
        job: expect.objectContaining({
          jobId: 'job-1',
          path: 'C:/docs/draft-close.md',
          trigger: 'close-auto-save',
        }),
      },
    ])
    expect(staleCancelled.effects.find(effect => effect.type === 'show-unsaved-prompt')).toBeUndefined()
    expect(staleCancelled.effects.find(effect => effect.type === 'close-window')).toBeUndefined()
    expect(staleCancelled.session.closeRuntime).toEqual({
      intent: 'close',
      promptReason: null,
      waitingSaveJobId: 'job-1',
      awaitingPathSelection: false,
      forceClose: false,
    })
    expect(staleCancelled.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(staleCancelled.session.saveRuntime.status).toBe('queued')
    expect(staleCancelled.session.saveRuntime.trigger).toBe('close-auto-save')
  })

  it('草稿手动保存时，即使带了 payload.path，document.save 首次也必须先产出 open-save-dialog，不能直接 execute-save', () => {
    const { store, service } = createTestContext([])
    const session = createDraftSession({
      sessionId: 'draft-manual-save-with-path-session',
      now: 1700000002084,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 草稿内容',
      },
    })

    const saveRequested = service.dispatch({
      windowId,
      command: 'document.save',
      payload: {
        path: 'C:/docs/draft-from-compat.md',
      },
    })

    expect(saveRequested.effects).toEqual([
      {
        type: 'open-save-dialog',
        trigger: 'manual-save',
      },
    ])
    expect(saveRequested.effects.find(effect => effect.type === 'execute-save')).toBeUndefined()

    const targetSelected = service.dispatch({
      windowId,
      command: 'dialog.save-target-selected',
      payload: {
        path: 'C:/docs/draft-from-compat.md',
      },
    })

    expect(targetSelected.effects).toEqual([
      {
        type: 'execute-save',
        job: expect.objectContaining({
          path: 'C:/docs/draft-from-compat.md',
          trigger: 'manual-save',
        }),
      },
    ])
  })

  it('草稿首次保存已进入 in-flight save 后，再次 document.save 不得再次弹 open-save-dialog', () => {
    const { store, service } = createTestContext([])
    const session = createDraftSession({
      sessionId: 'draft-save-in-flight-session',
      now: 1700000002085,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 草稿内容',
      },
    })

    const firstSaveRequested = service.dispatch({
      windowId,
      command: 'document.save',
    })
    const firstPathSelected = service.dispatch({
      windowId,
      command: 'dialog.save-target-selected',
      payload: {
        path: 'C:/docs/draft.md',
      },
    })
    const secondSaveRequested = service.dispatch({
      windowId,
      command: 'document.save',
    })

    expect(firstSaveRequested.effects).toEqual([
      {
        type: 'open-save-dialog',
        trigger: 'manual-save',
      },
    ])
    expect(firstPathSelected.effects).toEqual([
      {
        type: 'execute-save',
        job: expect.objectContaining({
          jobId: 'job-1',
          path: 'C:/docs/draft.md',
          trigger: 'manual-save',
        }),
      },
    ])
    expect(secondSaveRequested.effects.find(effect => effect.type === 'open-save-dialog')).toBeUndefined()
    expect(secondSaveRequested.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(secondSaveRequested.session.saveRuntime.status).toBe('queued')
  })

  it('首次保存已经进入 in-flight save 后，迟到的 dialog.save-target-cancelled 不得污染 saveRuntime 或触发未保存确认', () => {
    const { store, service } = createTestContext([])
    const session = createDraftSession({
      sessionId: 'draft-stale-cancel-command-session',
      now: 1700000002086,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 草稿内容',
      },
    })

    service.dispatch({
      windowId,
      command: 'document.save',
    })
    const pathSelected = service.dispatch({
      windowId,
      command: 'dialog.save-target-selected',
      payload: {
        path: 'C:/docs/draft.md',
      },
    })
    const staleCancelled = service.dispatch({
      windowId,
      command: 'dialog.save-target-cancelled',
    })

    expect(pathSelected.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(staleCancelled.effects.find(effect => effect.type === 'show-unsaved-prompt')).toBeUndefined()
    expect(staleCancelled.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(staleCancelled.session.saveRuntime.status).toBe('queued')
    expect(staleCancelled.session.saveRuntime.trigger).toBe('manual-save')
  })

  it('普通 save 进行中触发 save-copy，再收到 copy-save 结果时，不得改写当前 saveRuntime', () => {
    const { store, service } = createTestContext([])
    const session = createBoundFileSession({
      sessionId: 'copy-with-save-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002090,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 当前内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'document.save',
    })
    service.dispatch({
      windowId,
      command: 'document.save-copy',
    })
    service.dispatch({
      windowId,
      command: 'dialog.copy-target-selected',
      payload: {
        path: 'C:/docs/demo-copy.md',
      },
    })

    const copySucceeded = service.dispatch({
      windowId,
      command: 'copy-save.succeeded',
      payload: {
        path: 'C:/docs/demo-copy.md',
      },
    })

    expect(copySucceeded.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(copySucceeded.session.saveRuntime.status).toBe('queued')
  })

  it('close-auto-save 发出后如果用户取消关闭，迟到的 save.succeeded 不得再继续关闭窗口', () => {
    const { store, service } = createTestContext(['close'])
    const session = createBoundFileSession({
      sessionId: 'cancel-close-after-save-started-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002100,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 关闭前自动保存内容',
      },
    })
    const closeRequested = service.dispatch({
      windowId,
      command: 'document.request-close',
    })
    const waitingSaveJobId = closeRequested.session.closeRuntime.waitingSaveJobId
    const cancelled = service.dispatch({
      windowId,
      command: 'document.cancel-close',
    })
    const lateSaveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-1',
        revision: 1,
        content: '# 关闭前自动保存内容',
        path: 'C:/docs/demo.md',
        trigger: 'close-auto-save',
        savedAt: 1700000002101,
        stat: null,
      },
    })

    expect(waitingSaveJobId).toBe('job-1')
    expect(cancelled.session.closeRuntime).toEqual({
      intent: null,
      promptReason: null,
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    })
    expect(lateSaveSucceeded.effects.find(effect => effect.type === 'close-window')).toBeUndefined()
    expect(lateSaveSucceeded.effects.find(effect => effect.type === 'show-unsaved-prompt')).toBeUndefined()
    expect(lateSaveSucceeded.session.closeRuntime).toEqual({
      intent: null,
      promptReason: null,
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    })
  })

  it('close-auto-save 发出后如果用户取消关闭，迟到的 save.failed 不得再重新进入未保存确认态', () => {
    const { store, service } = createTestContext(['close'])
    const session = createBoundFileSession({
      sessionId: 'cancel-close-after-save-failed-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002110,
    })
    const windowId = bindSession(store, session)

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 关闭前自动保存内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'document.request-close',
    })
    service.dispatch({
      windowId,
      command: 'document.cancel-close',
    })

    const lateSaveFailed = service.dispatch({
      windowId,
      command: 'save.failed',
      payload: {
        jobId: 'job-1',
        revision: 1,
        content: '# 关闭前自动保存内容',
        path: 'C:/docs/demo.md',
        trigger: 'close-auto-save',
        error: new Error('disk full'),
      },
    })

    expect(lateSaveFailed.effects).toContainEqual({
      type: 'notify-save-failed',
      trigger: 'close-auto-save',
      error: {
        name: 'Error',
        message: 'disk full',
      },
    })
    expect(lateSaveFailed.effects.find(effect => effect.type === 'close-window')).toBeUndefined()
    expect(lateSaveFailed.effects.find(effect => effect.type === 'show-unsaved-prompt')).toBeUndefined()
    expect(lateSaveFailed.session.closeRuntime).toEqual({
      intent: null,
      promptReason: null,
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    })
  })

  it('watch.file-changed 在 prompt 模式下创建 pending 后，继续 document.edit 也不能清掉外部待处理项', () => {
    const { store, service } = createTestContext({
      externalFileChangeStrategy: 'prompt',
    })
    const session = createBoundFileSession({
      sessionId: 'watch-prompt-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002120,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    const watched = service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002121,
        diskContent: '# 外部版本 1',
        diskStat: {
          mtimeMs: 1700000002121,
        },
      },
    })
    const edited = service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 用户继续编辑',
      },
    })

    expect(watched.snapshot.externalPrompt).toEqual({
      visible: true,
      version: 1,
      localContent: '# 原始内容',
      externalContent: '# 外部版本 1',
      fileName: 'demo.md',
    })
    expect(edited.snapshot.externalPrompt).toEqual({
      visible: true,
      version: 1,
      localContent: '# 用户继续编辑',
      externalContent: '# 外部版本 1',
      fileName: 'demo.md',
    })
    expect(edited.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 1,
      diskContent: '# 外部版本 1',
      watchBindingToken: 1,
    })
  })

  it('watch.file-changed 在 apply 模式下必须自动应用磁盘内容，而不是创建 pendingExternalChange', () => {
    const { store, service } = createTestContext({
      externalFileChangeStrategy: 'apply',
    })
    const session = createBoundFileSession({
      sessionId: 'watch-apply-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002130,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 本地未保存内容',
      },
    })

    const watched = service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002131,
        diskContent: '# 外部最新内容',
        diskStat: {
          mtimeMs: 1700000002131,
        },
      },
    })

    expect(watched.snapshot.content).toBe('# 外部最新内容')
    expect(watched.snapshot.saved).toBe(true)
    expect(watched.snapshot.externalPrompt).toBeNull()
    expect(watched.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(watched.session.externalRuntime.lastResolutionResult).toBe('applied')
    expect(watched.session.externalRuntime.lastHandledVersionHash)
      .toBe(watched.session.diskSnapshot.versionHash)
  })

  it('document.external.apply / document.external.ignore 必须通过命令层更新外部修改审计字段', () => {
    const { store, service } = createTestContext({
      externalFileChangeStrategy: 'prompt',
    })
    const session = createBoundFileSession({
      sessionId: 'watch-external-command-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002140,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 用户本地内容',
      },
    })

    service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002141,
        diskContent: '# 外部版本 1',
        diskStat: {
          mtimeMs: 1700000002141,
        },
      },
    })
    const ignored = service.dispatch({
      windowId,
      command: 'document.external.ignore',
    })

    expect(ignored.snapshot.content).toBe('# 用户本地内容')
    expect(ignored.snapshot.externalPrompt).toBeNull()
    expect(ignored.session.externalRuntime.lastResolutionResult).toBe('ignored')
    expect(ignored.session.externalRuntime.lastHandledVersionHash).toBeTruthy()

    service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002142,
        diskContent: '# 外部版本 2',
        diskStat: {
          mtimeMs: 1700000002142,
        },
      },
    })
    const applied = service.dispatch({
      windowId,
      command: 'document.external.apply',
    })

    expect(applied.snapshot.content).toBe('# 外部版本 2')
    expect(applied.snapshot.saved).toBe(true)
    expect(applied.snapshot.externalPrompt).toBeNull()
    expect(applied.session.externalRuntime.lastResolutionResult).toBe('applied')
    expect(applied.session.externalRuntime.lastHandledVersionHash)
      .toBe(applied.session.diskSnapshot.versionHash)
  })

  it('document.external.apply / document.external.ignore 遇到 stale prompt version 时，命令层必须保持当前 pending 不变', () => {
    const { store, service } = createTestContext({
      externalFileChangeStrategy: 'prompt',
    })
    const session = createBoundFileSession({
      sessionId: 'watch-external-stale-version-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002143,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'
    session.externalRuntime.lastResolutionResult = 'ignored'
    session.externalRuntime.lastHandledVersionHash = 'handled-before'

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 用户本地内容',
      },
    })

    service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002144,
        diskContent: '# 外部版本 1',
        diskStat: {
          mtimeMs: 1700000002144,
        },
      },
    })
    const latestPending = service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002145,
        diskContent: '# 外部版本 2',
        diskStat: {
          mtimeMs: 1700000002145,
        },
      },
    })
    const beforeStaleActionPrompt = latestPending.snapshot.externalPrompt
    const beforeStaleActionResolutionResult = latestPending.session.externalRuntime.lastResolutionResult
    const beforeStaleActionHandledVersionHash = latestPending.session.externalRuntime.lastHandledVersionHash

    const staleApplied = service.dispatch({
      windowId,
      command: 'document.external.apply',
      payload: {
        version: 1,
      },
    })

    expect(staleApplied.snapshot.content).toBe('# 用户本地内容')
    expect(staleApplied.snapshot.externalPrompt).toEqual(beforeStaleActionPrompt)
    expect(staleApplied.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 2,
      diskContent: '# 外部版本 2',
    })
    expect(staleApplied.session.externalRuntime.lastResolutionResult).toBe(beforeStaleActionResolutionResult)
    expect(staleApplied.session.externalRuntime.lastHandledVersionHash).toBe(beforeStaleActionHandledVersionHash)

    const staleIgnored = service.dispatch({
      windowId,
      command: 'document.external.ignore',
      payload: {
        version: 1,
      },
    })

    expect(staleIgnored.snapshot.content).toBe('# 用户本地内容')
    expect(staleIgnored.snapshot.externalPrompt).toEqual(beforeStaleActionPrompt)
    expect(staleIgnored.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 2,
      diskContent: '# 外部版本 2',
    })
    expect(staleIgnored.session.externalRuntime.lastResolutionResult).toBe(beforeStaleActionResolutionResult)
    expect(staleIgnored.session.externalRuntime.lastHandledVersionHash).toBe(beforeStaleActionHandledVersionHash)
  })

  it('save.succeeded 如果把既有外部差异消解掉，必须收敛为 noop 并清掉 pendingExternalChange', () => {
    const { store, service } = createTestContext({
      externalFileChangeStrategy: 'prompt',
    })
    const session = createBoundFileSession({
      sessionId: 'save-noop-after-pending-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002145,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 本地未保存内容',
      },
    })

    const watched = service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002146,
        diskContent: '# 外部版本 1',
        diskStat: {
          mtimeMs: 1700000002146,
        },
      },
    })
    const pendingVersionHash = watched.session.externalRuntime.pendingExternalChange?.versionHash

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 外部版本 1',
      },
    })
    service.dispatch({
      windowId,
      command: 'document.save',
    })

    const saveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-1',
        revision: 2,
        content: '# 外部版本 1',
        path: 'C:/docs/demo.md',
        trigger: 'manual-save',
        savedAt: 1700000002147,
        stat: {
          mtimeMs: 1700000002147,
        },
      },
    })

    expect(saveSucceeded.snapshot.content).toBe('# 外部版本 1')
    expect(saveSucceeded.snapshot.saved).toBe(true)
    expect(saveSucceeded.snapshot.externalPrompt).toBeNull()
    expect(saveSucceeded.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(saveSucceeded.session.externalRuntime.resolutionState).toBe('resolved')
    expect(saveSucceeded.session.externalRuntime.lastResolutionResult).toBe('noop')
    expect(saveSucceeded.session.externalRuntime.lastHandledVersionHash).toBe(pendingVersionHash)
  })

  it('save.succeeded 不得把保存途中出现的新外部版本误收敛成 noop', () => {
    const { store, service } = createTestContext({
      externalFileChangeStrategy: 'prompt',
    })
    const session = createBoundFileSession({
      sessionId: 'save-should-keep-midflight-external-pending-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002147,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 本地内容',
      },
    })
    service.dispatch({
      windowId,
      command: 'document.save',
    })

    const watched = service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002148,
        diskContent: '# 外部版本',
        diskStat: {
          mtimeMs: 1700000002148,
        },
      },
    })
    const pendingVersionHash = watched.session.externalRuntime.pendingExternalChange?.versionHash

    const saveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-1',
        revision: 1,
        content: '# 本地内容',
        path: 'C:/docs/demo.md',
        trigger: 'manual-save',
        savedAt: 1700000002149,
        stat: {
          mtimeMs: 1700000002149,
        },
      },
    })

    expect(saveSucceeded.snapshot.content).toBe('# 本地内容')
    expect(saveSucceeded.snapshot.saved).toBe(false)
    expect(saveSucceeded.snapshot.dirty).toBe(true)
    expect(saveSucceeded.snapshot.externalPrompt).toMatchObject({
      version: 1,
      externalContent: '# 外部版本',
    })
    expect(saveSucceeded.session.diskSnapshot.content).toBe('# 外部版本')
    expect(saveSucceeded.session.diskSnapshot.versionHash).toBe(pendingVersionHash)
    expect(saveSucceeded.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 1,
      versionHash: pendingVersionHash,
      diskContent: '# 外部版本',
    })
    expect(saveSucceeded.session.externalRuntime.resolutionState).toBe('pending-user')
    expect(saveSucceeded.session.externalRuntime.lastResolutionResult).toBe('none')
    expect(saveSucceeded.session.externalRuntime.lastHandledVersionHash).toBeNull()
  })

  it('同一路径 watch.error 重绑后，save.succeeded 不得吞掉旧 pendingExternalChange', () => {
    const { store, service } = createTestContext({
      externalFileChangeStrategy: 'prompt',
    })
    const session = createBoundFileSession({
      sessionId: 'save-should-keep-pending-after-same-path-rebind-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002150,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 本地内容',
      },
    })

    const watched = service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002151,
        diskContent: '# 外部版本',
        diskStat: {
          mtimeMs: 1700000002151,
        },
      },
    })
    const pendingVersionHash = watched.session.externalRuntime.pendingExternalChange?.versionHash

    const rebindRequested = service.dispatch({
      windowId,
      command: 'watch.error',
      payload: {
        bindingToken: 1,
        watchingPath: 'C:/docs/demo.md',
        error: {
          name: 'Error',
          message: 'watch crashed',
          code: 'EIO',
        },
      },
    })

    expect(rebindRequested.session.watchRuntime.bindingToken).toBe(2)
    expect(rebindRequested.session.watchRuntime.watchingPath).toBe('C:/docs/demo.md')

    service.dispatch({
      windowId,
      command: 'document.save',
    })

    const saveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-1',
        revision: 1,
        content: '# 本地内容',
        path: 'C:/docs/demo.md',
        trigger: 'manual-save',
        savedAt: 1700000002152,
        stat: {
          mtimeMs: 1700000002152,
        },
      },
    })

    expect(saveSucceeded.snapshot.content).toBe('# 本地内容')
    expect(saveSucceeded.snapshot.saved).toBe(true)
    expect(saveSucceeded.snapshot.externalPrompt).toMatchObject({
      version: 1,
      externalContent: '# 外部版本',
    })
    expect(saveSucceeded.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 1,
      versionHash: pendingVersionHash,
      diskContent: '# 外部版本',
      watchBindingToken: 1,
    })
    expect(saveSucceeded.session.externalRuntime.resolutionState).toBe('pending-user')
    expect(saveSucceeded.session.externalRuntime.lastResolutionResult).toBe('none')
    expect(saveSucceeded.session.externalRuntime.lastHandledVersionHash).toBeNull()
  })

  it('save.succeeded 如果切换到了新路径，不得用旧 bindingToken 的 pendingExternalChange 做 noop 收敛', () => {
    const { store, service } = createTestContext({
      externalFileChangeStrategy: 'prompt',
    })
    const session = createBoundFileSession({
      sessionId: 'save-path-switch-with-stale-pending-session',
      path: 'C:/docs/old.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002148,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/old.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 本地旧路径内容',
      },
    })

    service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002149,
        diskContent: '# 旧路径外部冲突内容',
        diskStat: {
          mtimeMs: 1700000002149,
        },
      },
    })

    service.dispatch({
      windowId,
      command: 'document.save',
    })
    service.dispatch({
      windowId,
      command: 'document.edit',
      payload: {
        content: '# 旧路径外部冲突内容',
      },
    })

    const saveSucceeded = service.dispatch({
      windowId,
      command: 'save.succeeded',
      payload: {
        jobId: 'job-1',
        revision: 1,
        content: '# 本地旧路径内容',
        path: 'C:/docs/new.md',
        trigger: 'manual-save',
        savedAt: 1700000002150,
        stat: {
          mtimeMs: 1700000002150,
        },
      },
    })

    expect(saveSucceeded.session.documentSource.path).toBe('C:/docs/new.md')
    expect(saveSucceeded.session.watchRuntime.bindingToken).toBe(2)
    expect(saveSucceeded.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(saveSucceeded.session.externalRuntime.lastHandledVersionHash).toBeNull()
    expect(saveSucceeded.session.externalRuntime.lastResolutionResult).not.toBe('noop')
    expect(saveSucceeded.snapshot.externalPrompt).toBeNull()
  })

  it('watch.error 必须生成新 token 的重绑 effect，且旧 token 的迟到事件不能污染当前路径', () => {
    const { store, service } = createTestContext({
      externalFileChangeStrategy: 'prompt',
    })
    const session = createBoundFileSession({
      sessionId: 'watch-rebind-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000002150,
    })
    const windowId = bindSession(store, session)

    session.watchRuntime.bindingToken = 1
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingPath = 'C:/docs/demo.md'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    const rebindRequested = service.dispatch({
      windowId,
      command: 'watch.error',
      payload: {
        bindingToken: 1,
        watchingPath: 'C:/docs/demo.md',
        error: {
          name: 'Error',
          message: 'watch crashed',
          code: 'EIO',
        },
      },
    })

    expect(rebindRequested.session.watchRuntime.bindingToken).toBe(2)
    expect(rebindRequested.session.watchRuntime.status).toBe('rebinding')
    expect(rebindRequested.effects).toEqual([
      {
        type: 'notify-watch-warning',
        level: 'warning',
        reason: 'watch-error',
        error: {
          name: 'Error',
          message: 'watch crashed',
          code: 'EIO',
        },
      },
      {
        type: 'rebind-watch',
        bindingToken: 2,
        watchingPath: 'C:/docs/demo.md',
      },
    ])

    const staleChanged = service.dispatch({
      windowId,
      command: 'watch.file-changed',
      payload: {
        bindingToken: 1,
        observedAt: 1700000002151,
        diskContent: '# 旧 token 的迟到内容',
        diskStat: {
          mtimeMs: 1700000002151,
        },
      },
    })

    expect(staleChanged.snapshot.content).toBe('# 原始内容')
    expect(staleChanged.session.diskSnapshot.content).toBe('# 原始内容')
    expect(staleChanged.session.watchRuntime.bindingToken).toBe(2)

    const degraded = service.dispatch({
      windowId,
      command: 'watch.rebind-failed',
      payload: {
        bindingToken: 2,
        watchingPath: 'C:/docs/demo.md',
        error: {
          name: 'Error',
          message: 'rebind failed',
          code: 'EACCES',
        },
      },
    })

    expect(degraded.session.watchRuntime.status).toBe('degraded')
    expect(degraded.effects).toEqual([
      {
        type: 'notify-watch-warning',
        level: 'warning',
        reason: 'watch-rebind-failed',
        error: {
          name: 'Error',
          message: 'rebind failed',
          code: 'EACCES',
        },
      },
    ])
  })
})
