import assert from 'node:assert/strict'

const { test } = await import('node:test')

let searchBarLifecycleUtilModule = null

try {
  searchBarLifecycleUtilModule = await import('../searchBarLifecycleUtil.js')
} catch {
  searchBarLifecycleUtilModule = null
}

test('搜索可见时，应调用控制器关闭搜索栏', () => {
  assert.ok(searchBarLifecycleUtilModule, '缺少搜索栏生命周期工具')

  const { closeSearchBarIfVisible } = searchBarLifecycleUtilModule
  const store = { searchBarVisible: true }
  const calls = []
  const controller = {
    close(receivedStore) {
      calls.push(receivedStore)
    },
  }

  closeSearchBarIfVisible({ controller, store })

  assert.deepEqual(calls, [store])
})

test('搜索不可见时，不应重复触发关闭逻辑', () => {
  assert.ok(searchBarLifecycleUtilModule, '缺少搜索栏生命周期工具')

  const { closeSearchBarIfVisible } = searchBarLifecycleUtilModule
  const store = { searchBarVisible: false }
  let closeCalled = false
  const controller = {
    close() {
      closeCalled = true
    },
  }

  closeSearchBarIfVisible({ controller, store })

  assert.equal(closeCalled, false)
})
