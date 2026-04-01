import assert from 'node:assert/strict'

const { test } = await import('node:test')

let currentWindowOpenPreparationServiceModule = null

try {
  currentWindowOpenPreparationServiceModule = await import('../currentWindowOpenPreparationService.js')
} catch {
  currentWindowOpenPreparationServiceModule = null
}

test('未注册准备器时，应返回结构化 unavailable 结果', async () => {
  assert.ok(currentWindowOpenPreparationServiceModule, '缺少当前窗口切换前准备 service')

  const {
    requestCurrentWindowOpenPreparation,
  } = currentWindowOpenPreparationServiceModule

  const result = await requestCurrentWindowOpenPreparation()

  assert.deepEqual(result, {
    ok: false,
    reason: 'preparation-unavailable',
  })
})

test('仅注册 handler 但 provider 缺失时，应回退为 unavailable', async () => {
  assert.ok(currentWindowOpenPreparationServiceModule, '缺少当前窗口切换前准备 service')

  const {
    registerCurrentWindowOpenPreparation,
    requestCurrentWindowOpenPreparation,
  } = currentWindowOpenPreparationServiceModule

  const unregister = registerCurrentWindowOpenPreparation(async ({ provider }) => {
    if (typeof provider !== 'function') {
      return {
        ok: false,
        reason: 'preparation-unavailable',
      }
    }

    return await provider()
  })

  assert.deepEqual(await requestCurrentWindowOpenPreparation(), {
    ok: false,
    reason: 'preparation-unavailable',
  })

  unregister()
})

test('注册准备器后，应转发准备结果，并在卸载后回退为 unavailable', async () => {
  assert.ok(currentWindowOpenPreparationServiceModule, '缺少当前窗口切换前准备 service')

  const {
    registerCurrentWindowOpenPreparation,
    requestCurrentWindowOpenPreparation,
  } = currentWindowOpenPreparationServiceModule

  const unregister = registerCurrentWindowOpenPreparation(async () => ({
    ok: true,
    reason: 'prepared',
    snapshot: {
      sessionId: 'session-1',
      revision: 7,
    },
  }))

  assert.deepEqual(await requestCurrentWindowOpenPreparation(), {
    ok: true,
    reason: 'prepared',
    snapshot: {
      sessionId: 'session-1',
      revision: 7,
    },
  })

  unregister()

  assert.deepEqual(await requestCurrentWindowOpenPreparation(), {
    ok: false,
    reason: 'preparation-unavailable',
  })
})

test('provider 注册后，handler 应透传 provider 结果；provider 清理后回退 unavailable', async () => {
  assert.ok(currentWindowOpenPreparationServiceModule, '缺少当前窗口切换前准备 service')

  const {
    registerCurrentWindowOpenPreparation,
    requestCurrentWindowOpenPreparation,
    setCurrentWindowOpenPreparationProvider,
  } = currentWindowOpenPreparationServiceModule

  const unregisterHandler = registerCurrentWindowOpenPreparation(async ({ provider }) => {
    if (typeof provider !== 'function') {
      return {
        ok: false,
        reason: 'preparation-unavailable',
      }
    }

    return await provider()
  })
  const clearProvider = setCurrentWindowOpenPreparationProvider(async () => ({
    ok: true,
    reason: 'prepared-by-provider',
    snapshot: {
      sessionId: 'session-provider',
      revision: 9,
    },
  }))

  assert.deepEqual(await requestCurrentWindowOpenPreparation(), {
    ok: true,
    reason: 'prepared-by-provider',
    snapshot: {
      sessionId: 'session-provider',
      revision: 9,
    },
  })

  clearProvider()

  assert.deepEqual(await requestCurrentWindowOpenPreparation(), {
    ok: false,
    reason: 'preparation-unavailable',
  })

  unregisterHandler()
})

test('新的准备器注册后，应替换旧准备器', async () => {
  assert.ok(currentWindowOpenPreparationServiceModule, '缺少当前窗口切换前准备 service')

  const {
    registerCurrentWindowOpenPreparation,
    requestCurrentWindowOpenPreparation,
  } = currentWindowOpenPreparationServiceModule

  const unregisterFirst = registerCurrentWindowOpenPreparation(async () => ({
    ok: true,
    reason: 'first',
  }))
  const unregisterSecond = registerCurrentWindowOpenPreparation(async () => ({
    ok: true,
    reason: 'second',
  }))

  assert.deepEqual(await requestCurrentWindowOpenPreparation(), {
    ok: true,
    reason: 'second',
  })

  unregisterFirst()
  unregisterSecond()
})
