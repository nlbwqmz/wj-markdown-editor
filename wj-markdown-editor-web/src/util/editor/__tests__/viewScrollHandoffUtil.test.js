import assert from 'node:assert/strict'

import { createViewScrollHandoffStore } from '../viewScrollHandoffUtil.js'

const { test } = await import('node:test')

test('publish 后 consume 命中时应返回记录副本并清空待消费状态', () => {
  const store = createViewScrollHandoffStore()

  const publishedRecord = store.publish({
    sessionId: 'session-1',
    revision: 3,
    lineNumber: 42,
    sourceAreaKey: 'editor-code',
  })

  assert.deepEqual(publishedRecord, {
    sessionId: 'session-1',
    revision: 3,
    lineNumber: 42,
    lineOffsetRatio: 0,
    sourceAreaKey: 'editor-code',
  })

  const consumedRecord = store.consume({
    sessionId: 'session-1',
    revision: 3,
  })

  assert.deepEqual(consumedRecord, {
    sessionId: 'session-1',
    revision: 3,
    lineNumber: 42,
    lineOffsetRatio: 0,
    sourceAreaKey: 'editor-code',
  })
})

test('publish 应保存并钳制行内像素比例，供跨视图换算复用', () => {
  const store = createViewScrollHandoffStore()

  assert.deepEqual(store.publish({
    sessionId: 'session-1',
    revision: 1,
    lineNumber: 20,
    lineOffsetRatio: 0.35,
  }), {
    sessionId: 'session-1',
    revision: 1,
    lineNumber: 20,
    lineOffsetRatio: 0.35,
    sourceAreaKey: '',
  })

  assert.equal(store.publish({
    sessionId: 'session-1',
    revision: 1,
    lineNumber: 20,
    lineOffsetRatio: 9,
  }).lineOffsetRatio, 1)

  assert.equal(store.publish({
    sessionId: 'session-1',
    revision: 1,
    lineNumber: 20,
    lineOffsetRatio: -3,
  }).lineOffsetRatio, 0)

  assert.equal(store.publish({
    sessionId: 'session-1',
    revision: 1,
    lineNumber: 20,
    lineOffsetRatio: 'invalid',
  }).lineOffsetRatio, 0)
})

test('consume 返回的记录副本不应暴露内部引用', () => {
  const store = createViewScrollHandoffStore()

  const publishedRecord = store.publish({
    sessionId: 'session-1',
    revision: 1,
    lineNumber: 10,
  })

  publishedRecord.lineNumber = 999

  const consumedRecord = store.consume({
    sessionId: 'session-1',
    revision: 1,
  })

  assert.equal(consumedRecord.lineNumber, 10)
})

test('sessionId 不匹配时 consume 应返回 null 并清空记录', () => {
  const store = createViewScrollHandoffStore()

  store.publish({
    sessionId: 'session-1',
    revision: 3,
    lineNumber: 42,
  })

  assert.equal(store.consume({
    sessionId: 'session-2',
    revision: 3,
  }), null)

  // 不匹配已清空：后续再用正确身份消费也不应命中。
  assert.equal(store.consume({
    sessionId: 'session-1',
    revision: 3,
  }), null)
})

test('revision 不匹配时 consume 应返回 null 并清空记录', () => {
  const store = createViewScrollHandoffStore()

  store.publish({
    sessionId: 'session-1',
    revision: 3,
    lineNumber: 42,
  })

  assert.equal(store.consume({
    sessionId: 'session-1',
    revision: 4,
  }), null)

  assert.equal(store.consume({
    sessionId: 'session-1',
    revision: 3,
  }), null)
})

test('二次 consume 不应重复命中同一条记录', () => {
  const store = createViewScrollHandoffStore()

  store.publish({
    sessionId: 'session-1',
    revision: 1,
    lineNumber: 8,
  })

  assert.notEqual(store.consume({
    sessionId: 'session-1',
    revision: 1,
  }), null)

  assert.equal(store.consume({
    sessionId: 'session-1',
    revision: 1,
  }), null)
})

test('非法发布参数应被忽略且不得覆盖已有记录', () => {
  const store = createViewScrollHandoffStore()

  store.publish({
    sessionId: 'session-1',
    revision: 3,
    lineNumber: 42,
  })

  assert.equal(store.publish({
    sessionId: '',
    revision: 3,
    lineNumber: 42,
  }), null)
  assert.equal(store.publish({
    sessionId: 'session-1',
    revision: 3.5,
    lineNumber: 42,
  }), null)
  assert.equal(store.publish({
    sessionId: 'session-1',
    revision: 3,
    lineNumber: 0,
  }), null)
  assert.equal(store.publish({
    sessionId: 'session-1',
    revision: 3,
    lineNumber: 42.5,
  }), null)

  assert.deepEqual(store.consume({
    sessionId: 'session-1',
    revision: 3,
  }), {
    sessionId: 'session-1',
    revision: 3,
    lineNumber: 42,
    lineOffsetRatio: 0,
    sourceAreaKey: '',
  })
})

test('clear 应清空待消费记录', () => {
  const store = createViewScrollHandoffStore()

  store.publish({
    sessionId: 'session-1',
    revision: 1,
    lineNumber: 8,
  })
  store.clear()

  assert.equal(store.consume({
    sessionId: 'session-1',
    revision: 1,
  }), null)
})

test('空容器 consume 应直接返回 null', () => {
  const store = createViewScrollHandoffStore()

  assert.equal(store.consume({
    sessionId: 'session-1',
    revision: 1,
  }), null)
})
