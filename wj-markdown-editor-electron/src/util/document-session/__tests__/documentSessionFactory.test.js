import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBoundFileSession,
  createDraftSession,
  createRecentMissingSession,
} from '../documentSessionFactory.js'
import { deriveDocumentSnapshot } from '../documentSnapshotUtil.js'

describe('documentSessionFactory', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1700000000000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('createDraftSession 应为未命名草稿建立空磁盘基线，不直接混入派生快照字段', () => {
    const session = createDraftSession({
      sessionId: 'draft-session',
    })

    // 草稿态的磁盘基线必须固定为空字符串和不存在，
    // 否则后续 dirty / saved 推导会把“尚未落盘的草稿”误当成未知态。
    // 同时 factory 只负责基础真相，不能把派生快照字段直接铺在 session 顶层。
    expect(session.diskSnapshot.content).toBe('')
    expect(session.diskSnapshot.exists).toBe(false)
    expect(session.documentSource.path).toBeNull()
    expect(session.documentSource.missingPath).toBeNull()
    expect(session).not.toHaveProperty('saved')
    expect(session).not.toHaveProperty('dirty')
    expect(session).not.toHaveProperty('fileName')

    const snapshot = deriveDocumentSnapshot(session)

    expect(snapshot.saved).toBe(true)
    expect(snapshot.fileName).toBe('Unnamed')
  })

  it('createRecentMissingSession 应只构造 startup recent-missing 会话数据，不在这里判断 trigger', () => {
    vi.setSystemTime(1700000000001)
    const session = createRecentMissingSession({
      sessionId: 'recent-missing-session',
      missingPath: 'C:/docs/missing.md',
    })

    // 这里锁定 recent-missing 会话的展示语义：
    // 标题仍然是未命名草稿，但界面需要保留缺失路径，供后续提示移除 recent。
    expect(session.documentSource.path).toBeNull()
    expect(session.documentSource.exists).toBe(false)
    expect(session.documentSource.missingPath).toBe('C:/docs/missing.md')
    expect(session.documentSource.missingReason).toBe('recent-missing')
    expect(session.diskSnapshot.source).toBe('recent-missing')
    expect(session).not.toHaveProperty('isRecentMissing')
    expect(session).not.toHaveProperty('displayPath')
    expect(session).not.toHaveProperty('fileName')

    const snapshot = deriveDocumentSnapshot(session)

    expect(snapshot.isRecentMissing).toBe(true)
    expect(snapshot.displayPath).toBe('C:/docs/missing.md')
    expect(snapshot.recentMissingPath).toBe('C:/docs/missing.md')
    expect(snapshot.fileName).toBe('Unnamed')
  })

  it('createBoundFileSession 应为已绑定文件保留路径、内容和存在态', () => {
    vi.setSystemTime(1700000000003)
    const stat = {
      size: 12,
      mtimeMs: 1700000000002,
    }
    const session = createBoundFileSession({
      sessionId: 'bound-session',
      path: 'C:/docs/demo.md',
      content: '# 标题',
      stat,
    })

    expect(session.documentSource.path).toBe('C:/docs/demo.md')
    expect(session.documentSource.exists).toBe(true)
    expect(session.diskSnapshot.content).toBe('# 标题')
    expect(session.diskSnapshot.exists).toBe(true)
    expect(session.editorSnapshot.content).toBe('# 标题')
    expect(session.persistedSnapshot.path).toBe('C:/docs/demo.md')
    expect(session).not.toHaveProperty('saved')

    const snapshot = deriveDocumentSnapshot(session)

    expect(snapshot.saved).toBe(true)
    expect(snapshot.fileName).toBe('demo.md')
    expect(snapshot.displayPath).toBe('C:/docs/demo.md')
  })
})
