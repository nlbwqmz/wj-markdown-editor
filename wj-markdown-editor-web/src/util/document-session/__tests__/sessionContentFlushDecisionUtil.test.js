import assert from 'node:assert/strict'

import { shouldPushSessionContent } from '../sessionContentFlushDecisionUtil.js'

const { test } = await import('node:test')

function createSnapshot({ activeSessionId, tabs }) {
  return { activeSessionId, tabs }
}

test('后台干净标签不得回推正文：后台 view 可能只是还没同步“直接应用”的新正文', () => {
  const snapshot = createSnapshot({
    activeSessionId: 'b',
    tabs: [
      { sessionId: 'a', dirty: false },
      { sessionId: 'b', dirty: false },
    ],
  })

  // 复现现场：a、b 都干净，活动标签是 b；a 的文件被外部改写且策略为「直接应用」。
  // 此时 a 的后台 EditorView 仍是旧正文，推上去会把会话改回陈旧内容并判定为脏。
  assert.equal(shouldPushSessionContent({ sessionId: 'a', snapshot }), false)
})

test('活动标签必须回推：正文可能还在 160ms 防抖窗口里', () => {
  const snapshot = createSnapshot({
    activeSessionId: 'b',
    tabs: [
      { sessionId: 'a', dirty: false },
      { sessionId: 'b', dirty: false },
    ],
  })

  assert.equal(shouldPushSessionContent({ sessionId: 'b', snapshot }), true)
})

test('后台脏标签仍然回推：脏说明它不落后于磁盘，回推是幂等的', () => {
  const snapshot = createSnapshot({
    activeSessionId: 'b',
    tabs: [
      { sessionId: 'a', dirty: true },
      { sessionId: 'b', dirty: false },
    ],
  })

  assert.equal(shouldPushSessionContent({ sessionId: 'a', snapshot }), true)
})

test('快照里查不到目标标签时保持旧行为，交由主进程裁决', () => {
  const snapshot = createSnapshot({
    activeSessionId: 'b',
    tabs: [{ sessionId: 'b', dirty: false }],
  })

  assert.equal(shouldPushSessionContent({ sessionId: 'unknown', snapshot }), true)
})

test('非法 sessionId 一律不回推', () => {
  const snapshot = createSnapshot({ activeSessionId: 'b', tabs: [] })

  assert.equal(shouldPushSessionContent({ sessionId: '', snapshot }), false)
  assert.equal(shouldPushSessionContent({ sessionId: null, snapshot }), false)
  assert.equal(shouldPushSessionContent({ sessionId: 'b' }), true)
})
