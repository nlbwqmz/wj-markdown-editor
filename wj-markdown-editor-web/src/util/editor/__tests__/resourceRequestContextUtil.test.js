import assert from 'node:assert/strict'

const { test } = await import('node:test')

let resourceRequestContextUtilModule = null

try {
  resourceRequestContextUtilModule = await import('../resourceRequestContextUtil.js')
} catch {
  resourceRequestContextUtilModule = null
}

test('资源请求上下文必须稳定提取当前 sessionId 与 documentPath，供主进程拒绝过期请求', () => {
  assert.ok(resourceRequestContextUtilModule, '缺少 resource request context util')

  const { createResourceRequestContext } = resourceRequestContextUtilModule
  assert.equal(typeof createResourceRequestContext, 'function')

  assert.deepEqual(createResourceRequestContext({
    sessionId: 'session-1',
    resourceContext: {
      documentPath: 'C:/docs/demo.md',
    },
  }), {
    sessionId: 'session-1',
    documentPath: 'C:/docs/demo.md',
  })
})

test('资源请求上下文在快照缺字段时，也必须回退成稳定的 null 结构', () => {
  assert.ok(resourceRequestContextUtilModule, '缺少 resource request context util')

  const { createResourceRequestContext } = resourceRequestContextUtilModule
  assert.deepEqual(createResourceRequestContext(null), {
    sessionId: null,
    documentPath: null,
  })
})
