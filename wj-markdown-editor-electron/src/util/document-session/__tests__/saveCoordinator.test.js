import { describe, expect, it } from 'vitest'
import { createBoundFileSession, createDraftSession } from '../documentSessionFactory.js'
import { deriveDocumentSnapshot } from '../documentSnapshotUtil.js'
import { createSaveCoordinator } from '../saveCoordinator.js'

function createDeterministicCoordinator() {
  let jobIndex = 1
  return createSaveCoordinator({
    createJobId: () => `job-${jobIndex++}`,
    now: () => 1700000001000 + jobIndex,
  })
}

describe('saveCoordinator', () => {
  it('手动保存时，同一 session 同时只能存在一个进行中的 save job', () => {
    const coordinator = createDeterministicCoordinator()
    const session = createBoundFileSession({
      sessionId: 'bound-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000001000,
    })

    // 先把会话推进到“已有未保存修改”的状态，
    // 然后连续两次请求手动保存，锁定“同一时刻最多一个进行中写盘任务”的语义。
    session.editorSnapshot.content = '# 第一次编辑'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000001001
    session.saveRuntime.requestedRevision = 1

    const firstResult = coordinator.requestSave(session, {
      trigger: 'manual-save',
    })
    const secondResult = coordinator.requestSave(firstResult.session, {
      trigger: 'manual-save',
    })

    expect(firstResult.effects).toEqual([
      {
        type: 'execute-save',
        job: expect.objectContaining({
          jobId: 'job-1',
          revision: 1,
          content: '# 第一次编辑',
          path: 'C:/docs/demo.md',
          trigger: 'manual-save',
        }),
      },
    ])
    expect(firstResult.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(firstResult.session.saveRuntime.inFlightRevision).toBe(1)
    expect(secondResult.effects).toEqual([])
    expect(secondResult.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(secondResult.session.saveRuntime.inFlightRevision).toBe(1)
  })

  it('保存进行中继续编辑时，save.succeeded 只能更新 persistedSnapshot，不能把新增编辑误标记为已保存', () => {
    const coordinator = createDeterministicCoordinator()
    const session = createBoundFileSession({
      sessionId: 'bound-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000001010,
    })

    session.editorSnapshot.content = '# 第一版内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000001011
    session.saveRuntime.requestedRevision = 1

    const saveRequested = coordinator.requestSave(session, {
      trigger: 'manual-save',
    })

    // 模拟写盘期间用户继续输入。
    // 这里直接推进 editorSnapshot，等价于命令层已经处理过新的 document.edit。
    saveRequested.session.editorSnapshot.content = '# 第二版内容'
    saveRequested.session.editorSnapshot.revision = 2
    saveRequested.session.editorSnapshot.updatedAt = 1700000001012
    saveRequested.session.saveRuntime.requestedRevision = 2

    const saveSucceeded = coordinator.handleSaveSucceeded(saveRequested.session, {
      jobId: 'job-1',
      revision: 1,
      content: '# 第一版内容',
      path: 'C:/docs/demo.md',
      trigger: 'manual-save',
      savedAt: 1700000001013,
      stat: {
        mtimeMs: 1700000001013,
      },
    })

    expect(saveSucceeded.session.persistedSnapshot).toEqual({
      content: '# 第一版内容',
      revision: 1,
      savedAt: 1700000001013,
      path: 'C:/docs/demo.md',
      jobId: 'job-1',
    })
    expect(saveSucceeded.session.diskSnapshot.content).toBe('# 第一版内容')
    expect(saveSucceeded.session.editorSnapshot.content).toBe('# 第二版内容')
    expect(deriveDocumentSnapshot(saveSucceeded.session).dirty).toBe(true)
    expect(saveSucceeded.effects).toContainEqual({
      type: 'execute-save',
      job: expect.objectContaining({
        jobId: 'job-2',
        revision: 2,
        content: '# 第二版内容',
        trigger: 'manual-save',
      }),
    })
  })

  it('未命名草稿首次保存必须先等待 dialog.save-target-selected，取消后会话保持草稿态', () => {
    const coordinator = createDeterministicCoordinator()
    const session = createDraftSession({
      sessionId: 'draft-session',
      now: 1700000001020,
    })

    session.editorSnapshot.content = '# 草稿内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000001021
    session.saveRuntime.requestedRevision = 1

    const saveRequested = coordinator.requestSave(session, {
      trigger: 'manual-save',
    })

    expect(saveRequested.effects).toEqual([
      {
        type: 'open-save-dialog',
        trigger: 'manual-save',
      },
    ])
    expect(saveRequested.session.documentSource.path).toBeNull()
    expect(saveRequested.session.saveRuntime.status).toBe('awaiting-path-selection')

    const cancelled = coordinator.cancelPendingSaveTarget(saveRequested.session)

    expect(cancelled.session.documentSource.path).toBeNull()
    expect(cancelled.session.documentSource.exists).toBe(false)
    expect(cancelled.session.saveRuntime.status).toBe('idle')
    expect(cancelled.session.saveRuntime.inFlightJobId).toBeNull()
    expect(cancelled.session.editorSnapshot.content).toBe('# 草稿内容')
  })

  it('未命名草稿首次保存时，即使 requestSave 收到 targetPath，也必须先等待 open-save-dialog 再由 resolveSaveTarget 启动写盘', () => {
    const coordinator = createDeterministicCoordinator()
    const session = createDraftSession({
      sessionId: 'draft-session-with-target-path',
      now: 1700000001022,
    })

    session.editorSnapshot.content = '# 草稿内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000001023
    session.saveRuntime.requestedRevision = 1

    const saveRequested = coordinator.requestSave(session, {
      trigger: 'manual-save',
      path: 'C:/docs/from-compat.md',
    })

    expect(saveRequested.effects).toEqual([
      {
        type: 'open-save-dialog',
        trigger: 'manual-save',
      },
    ])
    expect(saveRequested.session.saveRuntime.inFlightJobId).toBeNull()

    const targetResolved = coordinator.resolveSaveTarget(saveRequested.session, {
      path: 'C:/docs/from-compat.md',
    })

    expect(targetResolved.effects).toEqual([
      {
        type: 'execute-save',
        job: expect.objectContaining({
          path: 'C:/docs/from-compat.md',
          trigger: 'manual-save',
        }),
      },
    ])
  })

  it('草稿首次保存已经进入 in-flight save 后，再次 requestSave 不得重新进入首次保存选路', () => {
    const coordinator = createDeterministicCoordinator()
    const session = createDraftSession({
      sessionId: 'draft-in-flight-session',
      now: 1700000001025,
    })

    session.editorSnapshot.content = '# 草稿内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000001026
    session.saveRuntime.requestedRevision = 1

    const saveRequested = coordinator.requestSave(session, {
      trigger: 'manual-save',
    })
    const firstTargetResolved = coordinator.resolveSaveTarget(saveRequested.session, {
      path: 'C:/docs/draft.md',
    })
    const firstInFlightJobId = firstTargetResolved.session.saveRuntime.inFlightJobId
    const firstSaveStatus = firstTargetResolved.session.saveRuntime.status
    const secondSaveRequested = coordinator.requestSave(firstTargetResolved.session, {
      trigger: 'manual-save',
    })

    expect(firstInFlightJobId).toBe('job-1')
    expect(firstSaveStatus).toBe('queued')
    expect(secondSaveRequested.effects.find(effect => effect.type === 'open-save-dialog')).toBeUndefined()
    expect(secondSaveRequested.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(secondSaveRequested.session.saveRuntime.status).toBe('queued')
  })

  it('已有 in-flight save 时，迟到的 resolveSaveTarget 不得把当前 saveRuntime 错误改成 idle', () => {
    const coordinator = createDeterministicCoordinator()
    const session = createDraftSession({
      sessionId: 'draft-stale-target-session',
      now: 1700000001027,
    })

    session.editorSnapshot.content = '# 草稿内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000001028
    session.saveRuntime.requestedRevision = 1

    const saveRequested = coordinator.requestSave(session, {
      trigger: 'manual-save',
    })
    const firstTargetResolved = coordinator.resolveSaveTarget(saveRequested.session, {
      path: 'C:/docs/draft.md',
    })
    const staleTargetResolved = coordinator.resolveSaveTarget(firstTargetResolved.session, {
      path: 'C:/docs/other-draft.md',
    })

    expect(staleTargetResolved.effects).toEqual([])
    expect(staleTargetResolved.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(staleTargetResolved.session.saveRuntime.status).toBe('queued')
    expect(staleTargetResolved.session.saveRuntime.trigger).toBe('manual-save')
  })

  it('首次保存已经进入 in-flight save 后，迟到的 cancelPendingSaveTarget 不得污染当前 saveRuntime', () => {
    const coordinator = createDeterministicCoordinator()
    const session = createDraftSession({
      sessionId: 'draft-stale-cancel-session',
      now: 1700000001029,
    })

    session.editorSnapshot.content = '# 草稿内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000001030
    session.saveRuntime.requestedRevision = 1

    const saveRequested = coordinator.requestSave(session, {
      trigger: 'manual-save',
    })
    const targetResolved = coordinator.resolveSaveTarget(saveRequested.session, {
      path: 'C:/docs/draft.md',
    })
    const staleCancelled = coordinator.cancelPendingSaveTarget(targetResolved.session)

    expect(staleCancelled.effects).toEqual([])
    expect(staleCancelled.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(staleCancelled.session.saveRuntime.status).toBe('queued')
    expect(staleCancelled.session.saveRuntime.trigger).toBe('manual-save')
  })

  it('document.save-copy 命中 same-path 时，必须通过 copy-save.failed 标准结果命令回流，不能退化为普通保存', () => {
    const coordinator = createDeterministicCoordinator()
    const session = createBoundFileSession({
      sessionId: 'copy-session',
      path: 'C:/Docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000001030,
    })

    session.editorSnapshot.content = '# 副本内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000001031

    const copyRequested = coordinator.requestCopySave(session)
    const copySelected = coordinator.resolveCopyTarget(copyRequested.session, {
      path: 'c:\\docs\\demo.md',
    })

    expect(copyRequested.effects).toEqual([
      {
        type: 'open-copy-dialog',
      },
    ])
    expect(copySelected.effects).toEqual([
      {
        type: 'dispatch-command',
        command: {
          type: 'copy-save.failed',
          payload: {
            reason: 'same-path',
            path: 'c:\\docs\\demo.md',
          },
        },
      },
    ])
    expect(copySelected.session.documentSource.path).toBe('C:/Docs/demo.md')
    expect(copySelected.session.saveRuntime.inFlightJobId).toBeNull()
  })

  it('save-copy 不得污染当前 saveRuntime；如果普通保存进行中，也不能把 saveRuntime 覆盖成 idle', () => {
    const coordinator = createDeterministicCoordinator()
    const session = createBoundFileSession({
      sessionId: 'copy-runtime-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000001040,
    })

    session.editorSnapshot.content = '# 正在保存的内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000001041
    session.saveRuntime.requestedRevision = 1

    const saveRequested = coordinator.requestSave(session, {
      trigger: 'manual-save',
    })
    const copyRequested = coordinator.requestCopySave(saveRequested.session)
    const copyCancelled = coordinator.cancelCopyTarget(copyRequested.session)

    expect(saveRequested.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(copyRequested.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(copyRequested.session.saveRuntime.status).toBe('queued')
    expect(copyCancelled.session.saveRuntime.inFlightJobId).toBe('job-1')
    expect(copyCancelled.session.saveRuntime.status).toBe('queued')
  })

  it('waitingSaveJobId 挂靠当前 job 时，即使 revision 递增但最新内容已被当前 save 覆盖，仍必须正确关闭窗口', () => {
    const coordinator = createDeterministicCoordinator()
    const session = createBoundFileSession({
      sessionId: 'close-finished-with-same-content-session',
      path: 'C:/docs/demo.md',
      content: '# 原始内容',
      stat: null,
      now: 1700000001050,
    })

    // 先让关闭链路启动一轮 close-auto-save。
    session.editorSnapshot.content = '# 目标内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000001051
    session.saveRuntime.requestedRevision = 1

    const closeSaveRequested = coordinator.requestSave(session, {
      trigger: 'close-auto-save',
    })
    closeSaveRequested.session.closeRuntime.intent = 'close'
    closeSaveRequested.session.closeRuntime.waitingSaveJobId = 'job-1'

    // 模拟保存期间用户又编辑过，但最终编辑器内容与刚完成保存的内容一致。
    // 这里 revision 虽然增长了，但其实已经不需要补写；正确行为应当直接完成关闭。
    closeSaveRequested.session.editorSnapshot.content = '# 目标内容'
    closeSaveRequested.session.editorSnapshot.revision = 3
    closeSaveRequested.session.editorSnapshot.updatedAt = 1700000001052
    closeSaveRequested.session.saveRuntime.requestedRevision = 3

    const saveSucceeded = coordinator.handleSaveSucceeded(closeSaveRequested.session, {
      jobId: 'job-1',
      revision: 1,
      content: '# 目标内容',
      path: 'C:/docs/demo.md',
      trigger: 'close-auto-save',
      savedAt: 1700000001053,
      stat: null,
    })

    expect(saveSucceeded.effects).toEqual([
      {
        type: 'close-window',
      },
    ])
    expect(saveSucceeded.session.closeRuntime).toEqual({
      intent: null,
      promptReason: null,
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    })
    expect(saveSucceeded.session.saveRuntime.status).toBe('idle')
  })
})
