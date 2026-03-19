import { describe, expect, it } from 'vitest'
import { createDraftSession } from '../documentSessionFactory.js'
import { deriveDocumentSnapshot } from '../documentSnapshotUtil.js'

describe('documentSnapshotUtil', () => {
  it('deriveDocumentSnapshot 在编辑内容和磁盘基线不一致时，应返回 dirty=true', () => {
    const session = createDraftSession({
      sessionId: 'draft-session',
      now: 1700000000010,
    })

    // 这里故意直接改编辑快照，模拟“用户已经输入，但主进程尚未保存”。
    // 快照推导必须只读地识别差异，而不是依赖外部手动维护 dirty 标记。
    session.editorSnapshot.content = '# 已修改内容'
    session.editorSnapshot.revision = 1

    const snapshot = deriveDocumentSnapshot(session)

    expect(snapshot.dirty).toBe(true)
    expect(snapshot.saved).toBe(false)
    expect(snapshot.content).toBe('# 已修改内容')
    expect(snapshot.exists).toBe(false)
    expect(snapshot.resourceContext).toEqual({
      documentPath: null,
      saved: false,
      exists: false,
    })
    expect(snapshot.revision).toBe(1)
  })

  it('deriveDocumentSnapshot 在 recent-missing 会话上，应保持缺失路径展示语义', () => {
    const snapshot = deriveDocumentSnapshot({
      sessionId: 'recent-missing-session',
      documentSource: {
        path: null,
        exists: false,
        missingPath: 'C:/docs/missing.md',
        missingReason: 'recent-missing',
        encoding: 'utf-8',
        lastKnownStat: null,
      },
      editorSnapshot: {
        content: '',
        revision: 0,
        updatedAt: 1700000000020,
      },
      diskSnapshot: {
        content: '',
        versionHash: 'empty-hash',
        exists: false,
        stat: null,
        observedAt: 1700000000020,
        source: 'recent-missing',
      },
      persistedSnapshot: {
        content: '',
        revision: 0,
        savedAt: null,
        path: null,
        jobId: null,
      },
      saveRuntime: {
        status: 'idle',
        inFlightJobId: null,
        inFlightRevision: null,
        inFlightBaseDiskVersionHash: null,
        requestedRevision: 0,
        trigger: null,
        lastError: null,
      },
      externalRuntime: {
        pendingExternalChange: null,
        resolutionState: 'idle',
        lastResolutionResult: 'none',
        lastHandledVersionHash: null,
        lastKnownDiskVersionHash: 'empty-hash',
      },
      watchRuntime: {
        bindingToken: 0,
        watchingPath: null,
        watchingDirectoryPath: null,
        status: 'idle',
        fileExists: false,
        eventFloorObservedAt: 0,
        recentInternalWrites: [],
        lastError: null,
      },
      closeRuntime: {
        intent: null,
        promptReason: null,
        waitingSaveJobId: null,
        awaitingPathSelection: false,
        forceClose: false,
      },
    })

    expect(snapshot.isRecentMissing).toBe(true)
    expect(snapshot.fileName).toBe('Unnamed')
    expect(snapshot.displayPath).toBe('C:/docs/missing.md')
    expect(snapshot.recentMissingPath).toBe('C:/docs/missing.md')
    expect(snapshot.saved).toBe(true)
    expect(snapshot.dirty).toBe(false)
    expect(snapshot.revision).toBe(0)
  })

  it('deriveDocumentSnapshot 会为非法 revision 回退到 0', () => {
    const session = createDraftSession({
      sessionId: 'revision-default-session',
    })
    session.editorSnapshot.revision = 'invalid'

    const snapshot = deriveDocumentSnapshot(session)

    expect(snapshot.revision).toBe(0)
  })

  it('deriveDocumentSnapshot 会为负数 revision 回退到 0', () => {
    const session = createDraftSession({
      sessionId: 'revision-negative-session',
    })
    session.editorSnapshot.revision = -1

    const snapshot = deriveDocumentSnapshot(session)

    expect(snapshot.revision).toBe(0)
  })
})
