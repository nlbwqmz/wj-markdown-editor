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
