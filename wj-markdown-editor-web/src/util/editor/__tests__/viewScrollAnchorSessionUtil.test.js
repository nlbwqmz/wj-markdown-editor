import assert from 'node:assert/strict'

import {
  clearSessionAnchorRecords,
  createViewScrollAnchorSessionStore,
  getAnchorRecord,
  pruneAnchorRecords,
  saveAnchorRecord,
  shouldRestoreAnchorRecord,
} from '../viewScrollAnchorSessionUtil.js'

const { test } = await import('node:test')

test('sessionId 与 scrollAreaKey 应共同定位唯一滚动锚点记录', () => {
  const store = createViewScrollAnchorSessionStore()

  saveAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  })

  assert.deepEqual(getAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
  }), {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  })
})

test('saveAnchorRecord 写入缓存时应复制 record 与 anchor，避免外部后续修改污染缓存', () => {
  const store = createViewScrollAnchorSessionStore()
  const record = {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  }

  saveAnchorRecord(store, record)

  record.revision = 9
  record.anchor.lineNumber = 99

  assert.deepEqual(getAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
  }), {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  })
})

test('修改 saveAnchorRecord 返回值时不应反向污染缓存', () => {
  const store = createViewScrollAnchorSessionStore()
  const savedRecord = saveAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  })

  savedRecord.revision = 9
  savedRecord.anchor.lineNumber = 99

  assert.deepEqual(getAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
  }), {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  })
})

test('修改 getAnchorRecord 读取结果时不应反向污染缓存', () => {
  const store = createViewScrollAnchorSessionStore()

  saveAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  })

  const loadedRecord = getAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
  })

  loadedRecord.revision = 9
  loadedRecord.anchor.lineNumber = 99

  assert.deepEqual(getAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
  }), {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  })
})

test('不同 scrollAreaKey 的记录应互不覆盖', () => {
  const store = createViewScrollAnchorSessionStore()

  saveAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 8, lineOffsetRatio: 0.2 },
    fallbackScrollTop: 80,
    savedAt: 10,
  })
  saveAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-preview',
    revision: 3,
    anchor: { type: 'preview-line', lineStart: 6, lineEnd: 8, elementOffsetRatio: 0.4 },
    fallbackScrollTop: 180,
    savedAt: 11,
  })

  assert.equal(getAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
  }).fallbackScrollTop, 80)
  assert.equal(getAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-preview',
  }).fallbackScrollTop, 180)
})

test('shouldRestoreAnchorRecord 在 sessionId 或 revision 不匹配时应拒绝恢复', () => {
  const record = {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  }

  assert.equal(shouldRestoreAnchorRecord({
    record,
    sessionId: 'session-1',
    revision: 4,
  }), false)
  assert.equal(shouldRestoreAnchorRecord({
    record,
    sessionId: 'session-2',
    revision: 3,
  }), false)
  assert.equal(shouldRestoreAnchorRecord({
    record,
    sessionId: 'session-1',
    revision: 3,
  }), true)
})

test('clearSessionAnchorRecords 应只移除指定 sessionId 的记录', () => {
  const store = createViewScrollAnchorSessionStore()

  saveAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 1,
    anchor: { type: 'editor-line', lineNumber: 1, lineOffsetRatio: 0 },
    fallbackScrollTop: 0,
    savedAt: 1,
  })
  saveAnchorRecord(store, {
    sessionId: 'session-2',
    scrollAreaKey: 'preview-page',
    revision: 2,
    anchor: { type: 'preview-line', lineStart: 10, lineEnd: 12, elementOffsetRatio: 0.1 },
    fallbackScrollTop: 240,
    savedAt: 2,
  })

  clearSessionAnchorRecords(store, 'session-1')

  assert.equal(getAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
  }), null)
  assert.deepEqual(getAnchorRecord(store, {
    sessionId: 'session-2',
    scrollAreaKey: 'preview-page',
  }), {
    sessionId: 'session-2',
    scrollAreaKey: 'preview-page',
    revision: 2,
    anchor: { type: 'preview-line', lineStart: 10, lineEnd: 12, elementOffsetRatio: 0.1 },
    fallbackScrollTop: 240,
    savedAt: 2,
  })
})

test('pruneAnchorRecords 应只保留活动 sessionId 的记录', () => {
  const store = createViewScrollAnchorSessionStore()

  saveAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 1,
    anchor: { type: 'editor-line', lineNumber: 1, lineOffsetRatio: 0 },
    fallbackScrollTop: 0,
    savedAt: 1,
  })
  saveAnchorRecord(store, {
    sessionId: 'session-2',
    scrollAreaKey: 'preview-page',
    revision: 2,
    anchor: { type: 'preview-line', lineStart: 10, lineEnd: 12, elementOffsetRatio: 0.1 },
    fallbackScrollTop: 240,
    savedAt: 2,
  })

  pruneAnchorRecords(store, 'session-2')

  assert.equal(getAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
  }), null)
  assert.deepEqual(getAnchorRecord(store, {
    sessionId: 'session-2',
    scrollAreaKey: 'preview-page',
  }), {
    sessionId: 'session-2',
    scrollAreaKey: 'preview-page',
    revision: 2,
    anchor: { type: 'preview-line', lineStart: 10, lineEnd: 12, elementOffsetRatio: 0.1 },
    fallbackScrollTop: 240,
    savedAt: 2,
  })
})
