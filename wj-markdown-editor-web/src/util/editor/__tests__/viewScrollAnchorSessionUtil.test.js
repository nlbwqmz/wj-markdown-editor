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

test('documentKey 与 scrollAreaKey 应共同定位唯一滚动锚点记录，未传 documentKey 时回退 sessionId', () => {
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
    documentKey: 'session-1',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  })
})

test('createViewScrollAnchorSessionStore 与文档 bucket 应使用无原型字典，避免特殊键污染原型链', () => {
  const store = createViewScrollAnchorSessionStore()

  assert.equal(Object.getPrototypeOf(store), null)

  saveAnchorRecord(store, {
    sessionId: '__proto__',
    scrollAreaKey: 'constructor',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  })

  const specialDocumentBucket = Object.getOwnPropertyDescriptor(store, '__proto__')?.value

  assert.equal(Object.getPrototypeOf(store), null)
  assert.equal(Object.getPrototypeOf(specialDocumentBucket), null)
  assert.deepEqual(getAnchorRecord(store, {
    sessionId: '__proto__',
    scrollAreaKey: 'constructor',
  }), {
    sessionId: '__proto__',
    scrollAreaKey: 'constructor',
    documentKey: '__proto__',
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
    documentKey: 'session-1',
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
    documentKey: 'session-1',
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
    documentKey: 'session-1',
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

test('导出 API 遇到异常入参时应保持安全返回或 no-op', () => {
  assert.equal(saveAnchorRecord(null, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 1,
    anchor: { type: 'editor-line', lineNumber: 1, lineOffsetRatio: 0 },
    fallbackScrollTop: 0,
    savedAt: 1,
  }), null)
  assert.equal(getAnchorRecord(null, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
  }), null)
  assert.equal(getAnchorRecord({}, undefined), null)
  assert.doesNotThrow(() => clearSessionAnchorRecords(null, 'session-1'))
  assert.doesNotThrow(() => pruneAnchorRecords(null, 'session-1'))
  assert.equal(shouldRestoreAnchorRecord(undefined), false)
})

test('普通对象 store 应视为 invalid，避免继续读写并触发原型污染路径', () => {
  const plainStore = {}
  const pollutedKey = 'task2PollutedKey'

  delete Object.prototype[pollutedKey]

  assert.equal(saveAnchorRecord(plainStore, {
    sessionId: '__proto__',
    scrollAreaKey: pollutedKey,
    revision: 1,
    anchor: { type: 'editor-line', lineNumber: 1, lineOffsetRatio: 0 },
    fallbackScrollTop: 0,
    savedAt: 1,
  }), null)
  assert.equal(getAnchorRecord(plainStore, {
    sessionId: '__proto__',
    scrollAreaKey: 'x',
  }), null)
  assert.doesNotThrow(() => clearSessionAnchorRecords(plainStore, 'session-1'))
  assert.doesNotThrow(() => pruneAnchorRecords(plainStore, 'session-1'))
  assert.equal(Object.prototype[pollutedKey], undefined)
})

test('clearSessionAnchorRecords 应只移除指定 documentKey 的记录', () => {
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
    documentKey: 'session-2',
    revision: 2,
    anchor: { type: 'preview-line', lineStart: 10, lineEnd: 12, elementOffsetRatio: 0.1 },
    fallbackScrollTop: 240,
    savedAt: 2,
  })
})

test('pruneAnchorRecords 应只保留活动 documentKey 的记录', () => {
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

  pruneAnchorRecords(store, 'session-2', 1)

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
    documentKey: 'session-2',
    revision: 2,
    anchor: { type: 'preview-line', lineStart: 10, lineEnd: 12, elementOffsetRatio: 0.1 },
    fallbackScrollTop: 240,
    savedAt: 2,
  })
})

test('saveAnchorRecord 应优先按 documentKey 建立 bucket，而不是按临时 sessionId', () => {
  const store = createViewScrollAnchorSessionStore()

  saveAnchorRecord(store, {
    documentKey: '/docs/a.md',
    sessionId: 'session-a',
    scrollAreaKey: 'editor-code',
    revision: 2,
    anchor: { type: 'editor-line', lineNumber: 3, lineOffsetRatio: 0.1 },
    fallbackScrollTop: 30,
    savedAt: 10,
  })

  assert.equal(store['/docs/a.md'] != null, true)
  assert.equal(store['session-a'], undefined)
  assert.deepEqual(getAnchorRecord(store, {
    documentKey: '/docs/a.md',
    scrollAreaKey: 'editor-code',
  }), {
    documentKey: '/docs/a.md',
    sessionId: 'session-a',
    scrollAreaKey: 'editor-code',
    revision: 2,
    anchor: { type: 'editor-line', lineNumber: 3, lineOffsetRatio: 0.1 },
    fallbackScrollTop: 30,
    savedAt: 10,
  })
})

test('未传 documentKey 的旧调用方应回退 sessionId，并在写入记录中补齐 documentKey', () => {
  const store = createViewScrollAnchorSessionStore()

  saveAnchorRecord(store, {
    sessionId: 'session-legacy',
    scrollAreaKey: 'preview-page',
    revision: 1,
    anchor: null,
    fallbackScrollTop: 12,
    savedAt: 5,
  })

  assert.equal(store['session-legacy'] != null, true)

  const record = getAnchorRecord(store, {
    sessionId: 'session-legacy',
    scrollAreaKey: 'preview-page',
  })

  assert.equal(record.documentKey, 'session-legacy')
  assert.equal(record.sessionId, 'session-legacy')
  assert.equal(record.fallbackScrollTop, 12)
})

test('getAnchorRecord 应优先使用 documentKey 读取，documentKey 缺省时才回退 sessionId', () => {
  const store = createViewScrollAnchorSessionStore()

  saveAnchorRecord(store, {
    documentKey: '/docs/a.md',
    sessionId: 'session-a',
    scrollAreaKey: 'editor-code',
    revision: 1,
    anchor: null,
    fallbackScrollTop: 1,
    savedAt: 1,
  })

  assert.equal(getAnchorRecord(store, {
    documentKey: '/docs/a.md',
    sessionId: 'session-a',
    scrollAreaKey: 'editor-code',
  })?.fallbackScrollTop, 1)

  // 传入不存在的 documentKey 时不得回退到 sessionId，避免读错文档的缓存。
  assert.equal(getAnchorRecord(store, {
    documentKey: '/docs/missing.md',
    sessionId: 'session-a',
    scrollAreaKey: 'editor-code',
  }), null)
})

test('shouldRestoreAnchorRecord 在 document 模式下只校验文档身份，不校验 sessionId 与 revision', () => {
  const record = {
    documentKey: '/docs/a.md',
    sessionId: 'session-old',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
    fallbackScrollTop: 120,
    savedAt: 1,
  }

  assert.equal(shouldRestoreAnchorRecord({
    record,
    documentKey: '/docs/a.md',
    sessionId: 'session-new',
    revision: 9,
    mode: 'document',
  }), true)

  assert.equal(shouldRestoreAnchorRecord({
    record,
    documentKey: '/docs/b.md',
    sessionId: 'session-new',
    revision: 9,
    mode: 'document',
  }), false)

  // 缺省 same-session 模式仍保持严格校验。
  assert.equal(shouldRestoreAnchorRecord({
    record,
    documentKey: '/docs/a.md',
    sessionId: 'session-new',
    revision: 3,
  }), false)
})

test('shouldRestoreAnchorRecord 应兼容只传 sessionId 的旧调用方', () => {
  const legacyRecord = {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
    revision: 3,
    anchor: null,
    fallbackScrollTop: 0,
    savedAt: 1,
  }

  assert.equal(shouldRestoreAnchorRecord({
    record: legacyRecord,
    sessionId: 'session-1',
    revision: 3,
  }), true)

  // 传入的是文档键而非裸 sessionId 时，仍必须按文档键比较，不能误判为可恢复。
  assert.equal(shouldRestoreAnchorRecord({
    record: legacyRecord,
    documentKey: 'session:session-1',
    sessionId: 'session-1',
    revision: 3,
  }), false)
})

test('pruneAnchorRecords 应保留活动文档，其余按 savedAt 从新到旧保留并限制总条目数', () => {
  const store = createViewScrollAnchorSessionStore()
  const documents = [
    { documentKey: '/docs/active.md', savedAt: 1 },
    { documentKey: '/docs/newest.md', savedAt: 90 },
    { documentKey: '/docs/middle.md', savedAt: 60 },
    { documentKey: '/docs/oldest.md', savedAt: 30 },
  ]

  for (const document of documents) {
    saveAnchorRecord(store, {
      documentKey: document.documentKey,
      sessionId: `session-${document.documentKey}`,
      scrollAreaKey: 'editor-code',
      revision: 1,
      anchor: null,
      fallbackScrollTop: 0,
      savedAt: document.savedAt,
    })
  }

  pruneAnchorRecords(store, '/docs/active.md', 3)

  assert.equal(store['/docs/active.md'] != null, true)
  assert.equal(store['/docs/newest.md'] != null, true)
  assert.equal(store['/docs/middle.md'] != null, true)
  assert.equal(store['/docs/oldest.md'], undefined)
})

test('pruneAnchorRecords 应将无有效 savedAt 的文档按最旧优先淘汰', () => {
  const store = createViewScrollAnchorSessionStore()

  saveAnchorRecord(store, {
    documentKey: '/docs/active.md',
    sessionId: 'session-active',
    scrollAreaKey: 'editor-code',
    revision: 1,
    anchor: null,
    fallbackScrollTop: 0,
    savedAt: 1,
  })
  saveAnchorRecord(store, {
    documentKey: '/docs/undated.md',
    sessionId: 'session-undated',
    scrollAreaKey: 'editor-code',
    revision: 1,
    anchor: null,
    fallbackScrollTop: 0,
  })
  saveAnchorRecord(store, {
    documentKey: '/docs/dated.md',
    sessionId: 'session-dated',
    scrollAreaKey: 'editor-code',
    revision: 1,
    anchor: null,
    fallbackScrollTop: 0,
    savedAt: 50,
  })

  pruneAnchorRecords(store, '/docs/active.md', 2)

  assert.equal(store['/docs/active.md'] != null, true)
  assert.equal(store['/docs/dated.md'] != null, true)
  assert.equal(store['/docs/undated.md'], undefined)
})

test('pruneAnchorRecords 在总条目数不超过上限时应原样保留', () => {
  const store = createViewScrollAnchorSessionStore()

  saveAnchorRecord(store, {
    documentKey: '/docs/a.md',
    sessionId: 'session-a',
    scrollAreaKey: 'editor-code',
    revision: 1,
    anchor: null,
    fallbackScrollTop: 0,
    savedAt: 1,
  })
  saveAnchorRecord(store, {
    documentKey: '/docs/b.md',
    sessionId: 'session-b',
    scrollAreaKey: 'editor-code',
    revision: 1,
    anchor: null,
    fallbackScrollTop: 0,
    savedAt: 2,
  })

  pruneAnchorRecords(store, '/docs/a.md', 2)

  assert.equal(store['/docs/a.md'] != null, true)
  assert.equal(store['/docs/b.md'] != null, true)
})

test('clearSessionAnchorRecords 应按 documentKey 删除，不影响其他文档', () => {
  const store = createViewScrollAnchorSessionStore()

  saveAnchorRecord(store, {
    documentKey: '/docs/a.md',
    sessionId: 'session-a',
    scrollAreaKey: 'editor-code',
    revision: 1,
    anchor: null,
    fallbackScrollTop: 1,
    savedAt: 1,
  })
  saveAnchorRecord(store, {
    documentKey: '/docs/b.md',
    sessionId: 'session-b',
    scrollAreaKey: 'editor-code',
    revision: 1,
    anchor: null,
    fallbackScrollTop: 2,
    savedAt: 2,
  })

  clearSessionAnchorRecords(store, '/docs/a.md')

  assert.equal(getAnchorRecord(store, {
    documentKey: '/docs/a.md',
    scrollAreaKey: 'editor-code',
  }), null)
  assert.equal(getAnchorRecord(store, {
    documentKey: '/docs/b.md',
    scrollAreaKey: 'editor-code',
  })?.fallbackScrollTop, 2)
})
