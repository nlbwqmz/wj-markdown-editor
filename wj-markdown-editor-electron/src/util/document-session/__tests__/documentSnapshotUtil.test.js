import { describe, expect, it } from 'vitest'
import { createBoundFileSession, createDraftSession, createRecentMissingSession } from '../documentSessionFactory.js'
import { deriveDocumentSnapshot, deriveDocumentTabSnapshot } from '../documentSnapshotUtil.js'

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
    expect(snapshot.fileName).toBe('Untitled')
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

  it('新建会话默认是 markdown 类型，并把类型透传到快照', () => {
    const session = createDraftSession({ sessionId: 'kind-default-session' })

    expect(session.kind).toBe('markdown')
    expect(deriveDocumentSnapshot(session).kind).toBe('markdown')
  })

  it('未知会话类型应回退到 markdown，避免渲染层落到没有类型的分支', () => {
    const session = {
      ...createDraftSession({ sessionId: 'kind-unknown-session' }),
      kind: 'pdf',
    }

    expect(deriveDocumentSnapshot(session).kind).toBe('markdown')
  })

  it('deriveDocumentTabSnapshot 必须把 exists 下发到标签栏，外部删除后为 false', () => {
    const session = createBoundFileSession({
      sessionId: 'bound-file-session',
      path: 'D:/docs/a.md',
      content: '# 正文',
    })

    expect(deriveDocumentTabSnapshot(session).exists).toBe(true)

    // 外部删除：watch.file-missing 会把 documentSource.exists 打成 false
    session.documentSource.exists = false

    const tabSnapshot = deriveDocumentTabSnapshot(session)
    expect(tabSnapshot.exists).toBe(false)
    // 路径与脏态必须照旧下发，否则渲染层无法区分“草稿”与“文件被删”
    expect(tabSnapshot.displayPath).toBe('D:/docs/a.md')
    expect(tabSnapshot.dirty).toBe(true)
  })

  it('deriveDocumentTabSnapshot 在 recent-missing 会话上必须同时下发 exists=false 与 isRecentMissing=true', () => {
    const session = createRecentMissingSession({
      sessionId: 'recent-missing-tab-session',
      missingPath: 'C:/docs/missing.md',
    })

    const tabSnapshot = deriveDocumentTabSnapshot(session)

    // 两个字段必须共存：渲染层要能靠 isRecentMissing 把这种“记录失效”
    // 与“文件被外部删除”区分开，不能互相替代。
    expect(tabSnapshot.exists).toBe(false)
    expect(tabSnapshot.isRecentMissing).toBe(true)
    expect(tabSnapshot.displayPath).toBe('C:/docs/missing.md')
  })

  it('deriveDocumentTabSnapshot 对未命名草稿下发 exists=false，且不带展示路径', () => {
    const tabSnapshot = deriveDocumentTabSnapshot(createDraftSession({ sessionId: 'draft-tab-session' }))

    expect(tabSnapshot.exists).toBe(false)
    expect(tabSnapshot.displayPath).toBeNull()
  })
})
