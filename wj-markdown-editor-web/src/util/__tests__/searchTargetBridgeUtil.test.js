import assert from 'node:assert/strict'

const { test } = await import('node:test')

let searchBarControllerModule = null
let searchTargetBridgeUtilModule = null

try {
  searchBarControllerModule = await import('../searchBarController.js')
} catch {
  searchBarControllerModule = null
}

try {
  searchTargetBridgeUtilModule = await import('../searchTargetBridgeUtil.js')
} catch {
  searchTargetBridgeUtilModule = null
}

test('激活搜索目标桥接后，应向控制器注册当前页面目标', () => {
  assert.ok(searchBarControllerModule, '缺少搜索控制器')
  assert.ok(searchTargetBridgeUtilModule, '缺少搜索目标桥接工具')

  const { createSearchBarController } = searchBarControllerModule
  const { createSearchTargetBridge } = searchTargetBridgeUtilModule
  const controller = createSearchBarController()
  const rootElement = { nodeType: 1, isConnected: true }
  const bridge = createSearchTargetBridge({
    controller,
    getTargetElements: () => [rootElement],
  })

  const activated = bridge.activate()

  assert.equal(activated, true)
  assert.deepEqual(controller.getTargetElements(), [rootElement])
})

test('搜索目标桥接应只负责激活和停用，不再暴露重绘通知接口', () => {
  assert.ok(searchBarControllerModule, '缺少搜索控制器')
  assert.ok(searchTargetBridgeUtilModule, '缺少搜索目标桥接工具')

  const { createSearchTargetBridge } = searchTargetBridgeUtilModule
  const bridge = createSearchTargetBridge({
    controller: {},
    getTargetElements: () => [],
  })

  assert.equal(typeof bridge.notifyRendered, 'undefined')
})

test('搜索目标桥接停用后，应从控制器注销当前页面目标', () => {
  assert.ok(searchBarControllerModule, '缺少搜索控制器')
  assert.ok(searchTargetBridgeUtilModule, '缺少搜索目标桥接工具')

  const { createSearchBarController } = searchBarControllerModule
  const { createSearchTargetBridge } = searchTargetBridgeUtilModule
  const controller = createSearchBarController()
  const bridge = createSearchTargetBridge({
    controller,
    getTargetElements: () => [{ nodeType: 1, isConnected: true }],
  })

  bridge.activate()
  const deactivated = bridge.deactivate()

  assert.equal(deactivated, true)
  assert.deepEqual(controller.getTargetElements(), [])
})
