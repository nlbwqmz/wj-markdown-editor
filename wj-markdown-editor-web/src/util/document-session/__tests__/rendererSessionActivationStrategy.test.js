import assert from 'node:assert/strict'

const { test } = await import('node:test')

let rendererSessionActivationStrategyModule = null

try {
  rendererSessionActivationStrategyModule = await import('../rendererSessionActivationStrategy.js')
} catch {
  rendererSessionActivationStrategyModule = null
}

test('默认空 store 快照且当前生命周期也不需要补拉时，激活策略必须保持 noop，避免首屏重放占位快照', () => {
  assert.ok(rendererSessionActivationStrategyModule, '缺少 renderer keep-alive 激活策略模块')

  const { resolveRendererSessionActivationAction } = rendererSessionActivationStrategyModule
  assert.equal(typeof resolveRendererSessionActivationAction, 'function')

  assert.equal(resolveRendererSessionActivationAction({
    hasAppliedSnapshot: false,
    needsBootstrapOnActivate: false,
    storeSnapshot: {
      sessionId: null,
      fileName: 'Unnamed',
      displayPath: null,
      recentMissingPath: null,
      exists: false,
      content: '',
      closePrompt: null,
      externalPrompt: null,
    },
  }), 'noop')
})

test('当前视图还未本地应用快照，但全局 store 已经有真实 session 快照时，激活策略必须优先重放 store', () => {
  assert.ok(rendererSessionActivationStrategyModule, '缺少 renderer keep-alive 激活策略模块')

  const { resolveRendererSessionActivationAction } = rendererSessionActivationStrategyModule

  assert.equal(resolveRendererSessionActivationAction({
    hasAppliedSnapshot: false,
    needsBootstrapOnActivate: true,
    storeSnapshot: {
      sessionId: 'session-1',
      fileName: 'demo.md',
      displayPath: 'C:/docs/demo.md',
      recentMissingPath: null,
      exists: true,
      content: '# body',
      closePrompt: null,
      externalPrompt: null,
    },
  }), 'replay-store')
})

test('当前视图还没有任何可重放真快照时，激活策略必须要求补拉 bootstrap', () => {
  assert.ok(rendererSessionActivationStrategyModule, '缺少 renderer keep-alive 激活策略模块')

  const { resolveRendererSessionActivationAction } = rendererSessionActivationStrategyModule

  assert.equal(resolveRendererSessionActivationAction({
    hasAppliedSnapshot: false,
    needsBootstrapOnActivate: true,
    storeSnapshot: {
      sessionId: null,
      fileName: 'Unnamed',
      displayPath: null,
      recentMissingPath: null,
      exists: false,
      content: '',
      closePrompt: null,
      externalPrompt: null,
    },
  }), 'request-bootstrap')
})

test('keep-alive 页面首次挂载时，mounted 不得再额外发起 bootstrap，避免和 onActivated 双通路重叠', () => {
  assert.ok(rendererSessionActivationStrategyModule, '缺少 renderer keep-alive 激活策略模块')

  const { shouldBootstrapSessionSnapshotOnMounted } = rendererSessionActivationStrategyModule
  assert.equal(typeof shouldBootstrapSessionSnapshotOnMounted, 'function')

  assert.equal(shouldBootstrapSessionSnapshotOnMounted({
    insideKeepAlive: true,
  }), false)
  assert.equal(shouldBootstrapSessionSnapshotOnMounted({
    insideKeepAlive: false,
  }), true)
})
