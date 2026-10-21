import path from 'node:path'
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

  it('findSessionByComparablePath 必须把相对路径和绝对路径识别为同一文档，避免重复开窗', () => {
    const store = createDocumentSessionStore()
    const absolutePath = path.resolve('docs/demo.md')
    const session = {
      ...createDraftSession({
        sessionId: 'relative-bound-session',
        now: 1700000000055,
      }),
      documentSource: {
        path: 'docs/demo.md',
        exists: true,
        missingPath: null,
        missingReason: null,
        encoding: 'utf-8',
        lastKnownStat: null,
      },
      displayPath: 'docs/demo.md',
      fileName: 'demo.md',
    }

    store.createSession(session)

    expect(store.findSessionByComparablePath(absolutePath)).toBe(session)
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

  it('同一窗口应能持有多个会话，getSessionByWindowId 只返回活动会话', () => {
    const store = createDocumentSessionStore()
    store.createSession(createDraftSession({ sessionId: 'tab-a' }))
    store.createSession(createDraftSession({ sessionId: 'tab-b' }))

    store.addSessionToWindow({ windowId: 2001, sessionId: 'tab-a' })
    store.addSessionToWindow({ windowId: 2001, sessionId: 'tab-b' })
    store.activateSession({ windowId: 2001, sessionId: 'tab-a' })

    expect(store.getSessionIdsByWindowId(2001)).toEqual(['tab-a', 'tab-b'])
    expect(store.getActiveSessionIdByWindowId(2001)).toBe('tab-a')
    expect(store.getSessionByWindowId(2001)?.sessionId).toBe('tab-a')
    expect(store.getSessionsByWindowId(2001).map(session => session.sessionId))
      .toEqual(['tab-a', 'tab-b'])
  })

  it('addSessionToWindow 应支持在指定位置插入标签', () => {
    const store = createDocumentSessionStore()
    store.createSession(createDraftSession({ sessionId: 'insert-a' }))
    store.createSession(createDraftSession({ sessionId: 'insert-b' }))
    store.createSession(createDraftSession({ sessionId: 'insert-c' }))

    store.addSessionToWindow({ windowId: 2002, sessionId: 'insert-a' })
    store.addSessionToWindow({ windowId: 2002, sessionId: 'insert-c' })
    store.addSessionToWindow({ windowId: 2002, sessionId: 'insert-b', index: 1 })

    expect(store.getSessionIdsByWindowId(2002)).toEqual(['insert-a', 'insert-b', 'insert-c'])
  })

  it('removeSessionFromWindow 摘掉活动会话时，应把活动指针交给相邻标签', () => {
    const store = createDocumentSessionStore()
    for (const sessionId of ['close-a', 'close-b', 'close-c']) {
      store.createSession(createDraftSession({ sessionId }))
      store.addSessionToWindow({ windowId: 2003, sessionId })
    }
    store.activateSession({ windowId: 2003, sessionId: 'close-b' })

    store.removeSessionFromWindow({ windowId: 2003, sessionId: 'close-b' })

    expect(store.getSessionIdsByWindowId(2003)).toEqual(['close-a', 'close-c'])
    expect(store.getActiveSessionIdByWindowId(2003)).toBe('close-c')
  })

  it('destroySession 应同时从窗口标签列表里摘除该会话', () => {
    const store = createDocumentSessionStore()
    store.createSession(createDraftSession({ sessionId: 'destroy-a' }))
    store.createSession(createDraftSession({ sessionId: 'destroy-b' }))
    store.bindWindowToSession({ windowId: 2004, sessionId: 'destroy-a' })
    store.addSessionToWindow({ windowId: 2004, sessionId: 'destroy-b' })

    store.destroySession('destroy-a')

    expect(store.getSessionIdsByWindowId(2004)).toEqual(['destroy-b'])
    expect(store.getSessionByWindowId(2004)?.sessionId).toBe('destroy-b')
  })

  it('同一个会话不能同时挂到两个窗口上', () => {
    const store = createDocumentSessionStore()
    store.createSession(createDraftSession({ sessionId: 'exclusive-session' }))
    store.addSessionToWindow({ windowId: 2005, sessionId: 'exclusive-session' })

    expect(() => {
      store.addSessionToWindow({ windowId: 2006, sessionId: 'exclusive-session' })
    }).toThrow(/sessionId/i)
  })

  it('getWindowIdBySessionId 应能反查会话所属窗口', () => {
    const store = createDocumentSessionStore()
    store.createSession(createDraftSession({ sessionId: 'owner-session' }))
    store.bindWindowToSession({ windowId: 2007, sessionId: 'owner-session' })

    expect(store.getWindowIdBySessionId('owner-session')).toBe(2007)
    expect(store.getWindowIdBySessionId('unknown-session')).toBeNull()
  })

  it('reorderWindowSessions 只接受与当前标签集合一致的顺序', () => {
    const store = createDocumentSessionStore()
    for (const sessionId of ['order-a', 'order-b']) {
      store.createSession(createDraftSession({ sessionId }))
      store.addSessionToWindow({ windowId: 2008, sessionId })
    }

    expect(store.reorderWindowSessions({
      windowId: 2008,
      sessionIds: ['order-b', 'order-a'],
    })).toEqual(['order-b', 'order-a'])

    expect(() => {
      store.reorderWindowSessions({
        windowId: 2008,
        sessionIds: ['order-a'],
      })
    }).toThrow(/sessionIds/i)
  })
})
