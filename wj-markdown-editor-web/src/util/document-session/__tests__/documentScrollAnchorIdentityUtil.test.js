import assert from 'node:assert/strict'

import { resolveDocumentScrollAnchorIdentity } from '../documentScrollAnchorIdentityUtil.js'

const { test } = await import('node:test')

test('已保存文件快照应使用 resourceContext.documentPath 作为 documentKey', () => {
  const identity = resolveDocumentScrollAnchorIdentity({
    sessionId: 'session-1',
    revision: 3,
    displayPath: '/docs/a.md',
    recentMissingPath: null,
    resourceContext: {
      documentPath: '/docs/a.md',
    },
  })

  assert.deepEqual(identity, {
    documentKey: '/docs/a.md',
    sessionId: 'session-1',
    revision: 3,
  })
})

test('recent-missing 快照应回退 recentMissingPath 作为 documentKey', () => {
  const identity = resolveDocumentScrollAnchorIdentity({
    sessionId: 'session-2',
    revision: 0,
    displayPath: '/docs/missing.md',
    recentMissingPath: '/docs/missing.md',
    resourceContext: {
      documentPath: null,
    },
  })

  assert.deepEqual(identity, {
    documentKey: '/docs/missing.md',
    sessionId: 'session-2',
    revision: 0,
  })
})

test('草稿快照没有文件路径时应回退 session 前缀键', () => {
  const identity = resolveDocumentScrollAnchorIdentity({
    sessionId: 'session-3',
    revision: 1,
    displayPath: null,
    recentMissingPath: null,
    resourceContext: {
      documentPath: null,
    },
  })

  assert.deepEqual(identity, {
    documentKey: 'session:session-3',
    sessionId: 'session-3',
    revision: 1,
  })
})

test('传入已含 documentKey 的对象时应原样沿用，保证解析幂等', () => {
  const resolvedIdentity = {
    documentKey: '/docs/a.md',
    sessionId: 'session-1',
    revision: 3,
  }

  // 已解析的 identity 没有 resourceContext / displayPath，
  // 二次解析必须沿用原 documentKey，而不是退化成 session:xxx。
  assert.deepEqual(resolveDocumentScrollAnchorIdentity(resolvedIdentity), resolvedIdentity)

  // 优先级最高：即使同时带有真实路径字段，也以已有 documentKey 为准。
  assert.deepEqual(resolveDocumentScrollAnchorIdentity({
    documentKey: '/docs/resolved.md',
    sessionId: 'session-1',
    revision: 3,
    displayPath: '/docs/display.md',
    resourceContext: {
      documentPath: '/docs/current.md',
    },
  }), {
    documentKey: '/docs/resolved.md',
    sessionId: 'session-1',
    revision: 3,
  })

  // 空字符串不算有效 documentKey，仍按原有路径优先级回退。
  assert.equal(resolveDocumentScrollAnchorIdentity({
    documentKey: '',
    sessionId: 'session-1',
    revision: 3,
    resourceContext: {
      documentPath: '/docs/a.md',
    },
  }).documentKey, '/docs/a.md')
})

test('空快照应返回空文档身份与归一化 revision', () => {
  assert.deepEqual(resolveDocumentScrollAnchorIdentity(null), {
    documentKey: '',
    sessionId: '',
    revision: 0,
  })
  assert.deepEqual(resolveDocumentScrollAnchorIdentity(undefined), {
    documentKey: '',
    sessionId: '',
    revision: 0,
  })
})

test('documentKey 解析优先级应为 resourceContext.documentPath、recentMissingPath、displayPath', () => {
  const fullIdentity = resolveDocumentScrollAnchorIdentity({
    sessionId: 'session-4',
    revision: 2,
    displayPath: '/docs/display.md',
    recentMissingPath: '/docs/recent.md',
    resourceContext: {
      documentPath: '/docs/current.md',
    },
  })

  assert.equal(fullIdentity.documentKey, '/docs/current.md')

  const recentMissingIdentity = resolveDocumentScrollAnchorIdentity({
    sessionId: 'session-4',
    revision: 2,
    displayPath: '/docs/display.md',
    recentMissingPath: '/docs/recent.md',
    resourceContext: {},
  })

  assert.equal(recentMissingIdentity.documentKey, '/docs/recent.md')

  const displayPathIdentity = resolveDocumentScrollAnchorIdentity({
    sessionId: 'session-4',
    revision: 2,
    displayPath: '/docs/display.md',
    resourceContext: {},
  })

  assert.equal(displayPathIdentity.documentKey, '/docs/display.md')
})

test('非法 revision 与非字符串 sessionId 应被归一化', () => {
  assert.deepEqual(resolveDocumentScrollAnchorIdentity({
    sessionId: 'session-5',
    revision: -1,
    resourceContext: {
      documentPath: '',
    },
  }), {
    documentKey: 'session:session-5',
    sessionId: 'session-5',
    revision: 0,
  })

  assert.deepEqual(resolveDocumentScrollAnchorIdentity({
    sessionId: 123,
    revision: 1.5,
  }), {
    documentKey: '',
    sessionId: '',
    revision: 0,
  })
})
