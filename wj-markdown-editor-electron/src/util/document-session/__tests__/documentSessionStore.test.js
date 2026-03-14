import { describe, expect, it } from 'vitest'
import { createDraftSession } from '../documentSessionFactory.js'
import { createDocumentSessionStore } from '../documentSessionStore.js'

describe('documentSessionStore', () => {
  it('应能按数字型 windowId 绑定 active session', () => {
    const store = createDocumentSessionStore()
    const session = createDraftSession({
      sessionId: 'draft-session',
      now: 1700000000030,
    })

    store.createSession(session)
    store.bindWindowToSession({
      windowId: 1001,
      sessionId: 'draft-session',
    })

    expect(store.getSessionByWindowId(1001)).toBe(session)
  })

  it('应拒绝重复注册相同 sessionId', () => {
    const store = createDocumentSessionStore()
    const firstSession = createDraftSession({
      sessionId: 'duplicate-session',
      now: 1700000000040,
    })
    const secondSession = createDraftSession({
      sessionId: 'duplicate-session',
      now: 1700000000041,
    })

    store.createSession(firstSession)

    expect(() => {
      store.createSession(secondSession)
    }).toThrow(/sessionId/i)
  })

  it('replaceSession 应使用相同 sessionId 的新对象覆盖旧对象', () => {
    const store = createDocumentSessionStore()
    const firstSession = createDraftSession({
      sessionId: 'replace-session',
      now: 1700000000045,
    })
    const replacedSession = {
      ...createDraftSession({
        sessionId: 'replace-session',
        now: 1700000000046,
      }),
      editorSnapshot: {
        content: '# 已替换内容',
        revision: 2,
        updatedAt: 1700000000046,
      },
    }

    store.createSession(firstSession)
    store.replaceSession(replacedSession)

    expect(store.getSession('replace-session')).toBe(replacedSession)
  })

  it('bindWindowToSession 绑定不存在的 session 时，应明确失败', () => {
    const store = createDocumentSessionStore()

    expect(() => {
      store.bindWindowToSession({
        windowId: 1002,
        sessionId: 'missing-session',
      })
    }).toThrow(/sessionId/i)
  })

  it('findSessionByComparablePath 应为 Windows 路径预留大小写不敏感比较', () => {
    const store = createDocumentSessionStore()
    const session = {
      ...createDraftSession({
        sessionId: 'bound-session',
        now: 1700000000050,
      }),
      documentSource: {
        path: 'C:/Docs/Example.md',
        exists: true,
        missingPath: null,
        missingReason: null,
        encoding: 'utf-8',
        lastKnownStat: null,
      },
      displayPath: 'C:/Docs/Example.md',
      fileName: 'Example.md',
    }

    store.createSession(session)

    expect(store.findSessionByComparablePath('c:\\docs\\example.md')).toBe(session)
  })

  it('destroySession 应同步清理 window 绑定，避免窗口继续指向已销毁会话', () => {
    const store = createDocumentSessionStore()
    const session = createDraftSession({
      sessionId: 'draft-session',
      now: 1700000000060,
    })

    store.createSession(session)
    store.bindWindowToSession({
      windowId: 1003,
      sessionId: 'draft-session',
    })

    store.destroySession('draft-session')

    expect(store.getSessionByWindowId(1003)).toBeNull()
  })
})
