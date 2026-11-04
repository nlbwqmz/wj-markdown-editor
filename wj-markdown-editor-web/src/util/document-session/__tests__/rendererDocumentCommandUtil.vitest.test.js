import { beforeEach, describe, expect, it } from 'vitest'
import {
  releaseDocumentEditSeq,
  requestDocumentEdit,
} from '../rendererDocumentCommandUtil.js'
import { flushSessionContents, setSessionContentProvider } from '../rendererSessionContentFlushService.js'

/**
 * 正文归属协议的回归测试。
 *
 * 这两条不变量一旦被回退，关闭链路会静默写错内容：
 * 1. document.edit 必须显式带 sessionId（不能回退到“活动会话”）
 * 2. 同一会话的 seq 必须单调递增（并发 flush 时丢弃过期写入）
 */
const sentPayloadList = []

function installWindowNodeMock() {
  sentPayloadList.length = 0
  globalThis.window.node = {
    sendToMain: async (payload) => {
      sentPayloadList.push(payload)
      return { ok: true }
    },
  }
}

describe('document.edit 正文归属协议', () => {
  beforeEach(() => {
    installWindowNodeMock()
    releaseDocumentEditSeq('session-a')
    releaseDocumentEditSeq('session-b')
  })

  it('必须携带 sessionId 与单调递增的 seq', async () => {
    await requestDocumentEdit('session-a', '# 第一版')
    await requestDocumentEdit('session-a', '# 第二版')

    expect(sentPayloadList).toEqual([
      {
        event: 'document.edit',
        data: {
          sessionId: 'session-a',
          content: '# 第一版',
          seq: 1,
        },
      },
      {
        event: 'document.edit',
        data: {
          sessionId: 'session-a',
          content: '# 第二版',
          seq: 2,
        },
      },
    ])
  })

  it('不同会话各自独立计数，互不推进', async () => {
    await requestDocumentEdit('session-a', '# a1')
    await requestDocumentEdit('session-b', '# b1')
    await requestDocumentEdit('session-a', '# a2')

    expect(sentPayloadList.map(payload => [payload.data.sessionId, payload.data.seq])).toEqual([
      ['session-a', 1],
      ['session-b', 1],
      ['session-a', 2],
    ])
  })

  it('缺少 sessionId 时必须直接拒绝，不能回退到活动会话', () => {
    expect(() => requestDocumentEdit('', '# 正文')).toThrow(/sessionId/)
    expect(sentPayloadList).toEqual([])
  })
})

describe('rendererSessionContentFlushService', () => {
  beforeEach(() => {
    installWindowNodeMock()
    setSessionContentProvider(null)
    releaseDocumentEditSeq('session-a')
    releaseDocumentEditSeq('session-b')
  })

  it('只推送渲染层确实持有正文的会话，其余交给主进程现有内容', async () => {
    setSessionContentProvider((sessionId) => {
      if (sessionId === 'session-a') {
        return '# a 的最新正文'
      }
      return null
    })

    const result = await flushSessionContents(['session-a', 'session-b'])

    expect(result.ok).toBe(true)
    expect(result.flushedSessionIds).toEqual(['session-a'])
    expect(sentPayloadList).toEqual([
      {
        event: 'document.edit',
        data: {
          sessionId: 'session-a',
          content: '# a 的最新正文',
          seq: 1,
        },
      },
    ])
  })

  it('没有注册提供者时不得发送任何 edit 请求', async () => {
    const result = await flushSessionContents(['session-a'])

    expect(result).toEqual({
      ok: true,
      flushedSessionIds: [],
      failedSessionIds: [],
    })
    expect(sentPayloadList).toEqual([])
  })
})
