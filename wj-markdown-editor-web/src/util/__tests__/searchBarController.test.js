import assert from 'node:assert/strict'

const { test } = await import('node:test')

let searchBarControllerModule = null
try {
  searchBarControllerModule = await import('../searchBarController.js')
} catch {
  searchBarControllerModule = null
}

test('关闭预览搜索时，应先清理高亮再关闭搜索栏', () => {
  assert.ok(searchBarControllerModule, '缺少预览搜索统一关闭控制器')

  const { createSearchBarController } = searchBarControllerModule
  assert.equal(typeof createSearchBarController, 'function')

  const controller = createSearchBarController()
  const callOrder = []
  const store = { searchBarVisible: true }

  controller.registerCleanup(() => {
    callOrder.push('cleanup')
    assert.equal(store.searchBarVisible, true)
  })

  controller.close(store)

  assert.equal(store.searchBarVisible, false)
  assert.deepEqual(callOrder, ['cleanup'])
})

test('搜索栏销毁后，不应继续调用已经解绑的清理函数', () => {
  assert.ok(searchBarControllerModule, '缺少预览搜索统一关闭控制器')

  const { createSearchBarController } = searchBarControllerModule
  const controller = createSearchBarController()
  const store = { searchBarVisible: true }
  let cleanupCalled = false

  const cleanup = () => {
    cleanupCalled = true
  }

  controller.registerCleanup(cleanup)
  const shouldCleanupOnUnmount = controller.unregisterCleanup(cleanup)
  controller.close(store)

  assert.equal(store.searchBarVisible, false)
  assert.equal(shouldCleanupOnUnmount, true)
  assert.equal(cleanupCalled, false)
})

test('关闭搜索栏后卸载组件时，不应重复执行清理函数', () => {
  assert.ok(searchBarControllerModule, '缺少预览搜索统一关闭控制器')

  const { createSearchBarController } = searchBarControllerModule
  const controller = createSearchBarController()
  const store = { searchBarVisible: true }
  let cleanupCallCount = 0

  const cleanup = () => {
    cleanupCallCount++
  }

  controller.registerCleanup(cleanup)
  controller.close(store)
  const shouldCleanupOnUnmount = controller.unregisterCleanup(cleanup)

  if (shouldCleanupOnUnmount) {
    cleanup()
  }

  assert.equal(store.searchBarVisible, false)
  assert.equal(cleanupCallCount, 1)
  assert.equal(shouldCleanupOnUnmount, false)
})

test('控制器应只暴露当前搜索所需的最小接口', () => {
  assert.ok(searchBarControllerModule, '缺少预览搜索统一关闭控制器')

  const { createSearchBarController } = searchBarControllerModule
  const controller = createSearchBarController()

  assert.equal(typeof controller.notifyTargetRendered, 'undefined')
  assert.equal(typeof controller.subscribeTargetChange, 'undefined')
  assert.equal(typeof controller.getTargetVersion, 'undefined')
})

test('搜索目标卸载后，应清空当前目标', () => {
  assert.ok(searchBarControllerModule, '缺少预览搜索统一关闭控制器')

  const { createSearchBarController } = searchBarControllerModule
  const controller = createSearchBarController()
  const targetProvider = () => [{ nodeType: 1, isConnected: true }]

  controller.registerTargetProvider(targetProvider)
  const removed = controller.unregisterTargetProvider(targetProvider)

  assert.equal(removed, true)
  assert.deepEqual(controller.getTargetElements(), [])
})

test('搜索目标注销后，关闭搜索栏时仍应清理缓存目标上的高亮', () => {
  assert.ok(searchBarControllerModule, '缺少预览搜索统一关闭控制器')

  const { createSearchBarController } = searchBarControllerModule
  const controller = createSearchBarController()
  const targetElement = { nodeType: 1, isConnected: true }
  const targetProvider = () => [targetElement]
  const store = { searchBarVisible: true }
  let cleanupPayload = null

  controller.registerCleanup((payload) => {
    cleanupPayload = payload
  })
  controller.registerTargetProvider(targetProvider)
  targetElement.isConnected = false
  controller.unregisterTargetProvider(targetProvider)
  controller.close(store)

  assert.equal(store.searchBarVisible, false)
  assert.deepEqual(cleanupPayload?.targetElements, [targetElement])
  assert.deepEqual(controller.getCleanupTargetElements(), [])
})

test('目标销毁且声明无需保留清理快照时，不应继续缓存旧 DOM', () => {
  assert.ok(searchBarControllerModule, '缺少预览搜索统一关闭控制器')

  const { createSearchBarController } = searchBarControllerModule
  const controller = createSearchBarController()
  const targetElement = { nodeType: 1, isConnected: true }
  const targetProvider = () => [targetElement]
  const store = { searchBarVisible: true }
  let cleanupPayload = null

  controller.registerCleanup((payload) => {
    cleanupPayload = payload
  })
  controller.registerTargetProvider(targetProvider)
  targetElement.isConnected = false
  controller.unregisterTargetProvider(targetProvider, { preserveCleanupTarget: false })
  controller.close(store)

  assert.equal(store.searchBarVisible, false)
  assert.deepEqual(cleanupPayload?.targetElements, [])
  assert.deepEqual(controller.getCleanupTargetElements(), [])
})
