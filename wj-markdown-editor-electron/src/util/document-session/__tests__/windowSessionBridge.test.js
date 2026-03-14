import { describe, expect, it, vi } from 'vitest'
import { createBoundFileSession } from '../documentSessionFactory.js'
import { createDocumentSessionStore } from '../documentSessionStore.js'

async function createBridgeContext() {
  const sendToRenderer = vi.fn()
  const store = createDocumentSessionStore()
  const session = createBoundFileSession({
    sessionId: 'session-1',
    path: 'C:/docs/demo.md',
    content: '# 原始内容',
    stat: null,
    now: 1700000003001,
  })

  session.editorSnapshot.content = '# 已修改内容'
  session.editorSnapshot.revision = 1

  store.createSession(session)
  store.bindWindowToSession({
    windowId: 1001,
    sessionId: session.sessionId,
  })

  const win = { id: 1001 }
  const { createWindowSessionBridge } = await import('../windowSessionBridge.js')
  const bridge = createWindowSessionBridge({
    store,
    sendToRenderer,
    resolveWindowById: windowId => windowId === 1001 ? win : null,
    getAllWindows: () => [win],
  })

  return {
    bridge,
    sendToRenderer,
    win,
  }
}

describe('windowSessionBridge', () => {
  it('document.get-session-snapshot 与 document.snapshot.changed 必须返回同结构', async () => {
    const { bridge, sendToRenderer, win } = await createBridgeContext()

    const snapshot = bridge.getSessionSnapshot(1001)
    bridge.publishSnapshotChanged({
      windowId: 1001,
    })

    expect(sendToRenderer).toHaveBeenCalledWith(win, {
      event: 'document.snapshot.changed',
      data: snapshot,
    })
  })

  it('命令收敛后发送一次性消息时，必须先推快照，再推 window.effect.message', async () => {
    const { bridge, sendToRenderer, win } = await createBridgeContext()

    bridge.publishMessage({
      windowId: 1001,
      data: {
        type: 'success',
        content: 'message.saveSuccessfully',
      },
    })

    expect(sendToRenderer).toHaveBeenNthCalledWith(1, win, {
      event: 'document.snapshot.changed',
      data: bridge.getSessionSnapshot(1001),
    })
    expect(sendToRenderer).toHaveBeenNthCalledWith(2, win, {
      event: 'window.effect.message',
      data: {
        type: 'success',
        content: 'message.saveSuccessfully',
      },
    })
    expect(sendToRenderer).toHaveBeenNthCalledWith(3, win, {
      event: 'message',
      data: {
        type: 'success',
        content: 'message.saveSuccessfully',
      },
    })
  })

  it('recent 列表变更时，window.effect.recent-list-changed 必须直接携带完整列表', async () => {
    const { bridge, sendToRenderer, win } = await createBridgeContext()
    const recentList = [
      {
        name: 'demo.md',
        path: 'C:/docs/demo.md',
      },
    ]

    bridge.publishRecentListChanged(recentList)

    expect(sendToRenderer).toHaveBeenCalledWith(win, {
      event: 'window.effect.recent-list-changed',
      data: recentList,
    })
    expect(sendToRenderer.mock.calls.some(call => call[1]?.event === 'update-recent')).toBe(false)
  })

  it('recent 列表内容未变化时，不能重复广播 window.effect.recent-list-changed', async () => {
    const { bridge, sendToRenderer } = await createBridgeContext()
    const recentList = [
      {
        name: 'demo.md',
        path: 'C:/docs/demo.md',
      },
    ]

    bridge.publishRecentListChanged(recentList)
    sendToRenderer.mockClear()

    bridge.publishRecentListChanged([
      {
        name: 'demo.md',
        path: 'C:/docs/demo.md',
      },
    ])

    expect(sendToRenderer).not.toHaveBeenCalled()
  })

  it('snapshot.saved 变化时，桥层只能继续发布 snapshot 真相，不能再代发 file-is-saved / file-content-reloaded', async () => {
    const { bridge, sendToRenderer } = await createBridgeContext()

    bridge.publishSnapshotChanged({
      windowId: 1001,
      snapshot: {
        ...bridge.getSessionSnapshot(1001),
        saved: false,
        externalPrompt: null,
      },
    })
    sendToRenderer.mockClear()

    bridge.publishSnapshotChanged({
      windowId: 1001,
      snapshot: {
        ...bridge.getSessionSnapshot(1001),
        saved: true,
        externalPrompt: null,
      },
    })

    expect(sendToRenderer.mock.calls.some(call => call[1]?.event === 'file-is-saved')).toBe(false)
    expect(sendToRenderer.mock.calls.some(call => call[1]?.event === 'file-content-reloaded')).toBe(false)
  })

  it('snapshot.externalPrompt 出现时，桥层只能通过 snapshot 收敛，不能再代发 file-external-changed / file-missing', async () => {
    const { bridge, sendToRenderer } = await createBridgeContext()

    bridge.publishSnapshotChanged({
      windowId: 1001,
      snapshot: {
        ...bridge.getSessionSnapshot(1001),
        externalPrompt: {
          visible: true,
          version: 'version-2',
          fileName: 'demo.md',
          localContent: '# 本地内容',
          externalContent: '# 外部内容',
        },
      },
    })

    expect(sendToRenderer.mock.calls.some(call => call[1]?.event === 'file-external-changed')).toBe(false)
    expect(sendToRenderer.mock.calls.some(call => call[1]?.event === 'file-missing')).toBe(false)
  })

  it('externalPrompt.version 变化时，桥层仍必须把最新版本写进 snapshot，但不能再补发 file-external-changed', async () => {
    const { bridge, sendToRenderer } = await createBridgeContext()

    bridge.publishSnapshotChanged({
      windowId: 1001,
      snapshot: {
        ...bridge.getSessionSnapshot(1001),
        externalPrompt: {
          visible: true,
          version: 1,
          fileName: 'demo.md',
          localContent: '# 本地内容',
          externalContent: '# 外部内容 1',
        },
      },
    })
    sendToRenderer.mockClear()

    bridge.publishSnapshotChanged({
      windowId: 1001,
      snapshot: {
        ...bridge.getSessionSnapshot(1001),
        externalPrompt: {
          visible: true,
          version: 2,
          fileName: 'demo.md',
          localContent: '# 本地内容',
          externalContent: '# 外部内容 2',
        },
      },
    })

    expect(sendToRenderer.mock.calls.some(call => call[1]?.event === 'file-external-changed')).toBe(false)
    expect(sendToRenderer).toHaveBeenCalledWith(expect.anything(), {
      event: 'document.snapshot.changed',
      data: expect.objectContaining({
        externalPrompt: expect.objectContaining({
          version: 2,
          externalContent: '# 外部内容 2',
        }),
      }),
    })
  })
})
