import { describe, expect, it } from 'vitest'
import { createDocumentCommandService } from '../documentCommandService.js'
import { createBoundFileSession, createDraftSession } from '../documentSessionFactory.js'
import { createDocumentSessionStore } from '../documentSessionStore.js'
import { createSaveCoordinator } from '../saveCoordinator.js'

function createTestContext(autoSave = []) {
  let jobIndex = 1
  const store = createDocumentSessionStore()
  const saveCoordinator = createSaveCoordinator({
    createJobId: () => `job-${jobIndex++}`,
    now: () => 1700000002000 + jobIndex,
  })
  const service = createDocumentCommandService({
    store,
    saveCoordinator,
    getConfig: () => ({
      autoSave,
    }),
    now: () => 1700000002000 + jobIndex,
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
      {
        type: 'open-copy-dialog',
      },
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

  it('dialog.save-target-cancelled 发生在关闭链路的首次保存分支时，必须回到未保存确认态', () => {
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
      intent: 'close',
      promptReason: 'unsaved-changes',
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    })
    expect(cancelled.effects).toContainEqual({
      type: 'show-unsaved-prompt',
    })
    expect(cancelled.effects.find(effect => effect.type === 'close-window')).toBeUndefined()
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
})
