import assert from 'node:assert/strict'

const { test } = await import('node:test')

let searchTargetUtilModule = null
try {
  searchTargetUtilModule = await import('../searchTargetUtil.js')
} catch {
  searchTargetUtilModule = null
}

test('搜索目标收集应包含命中 allow-search 的根节点自身', () => {
  assert.ok(searchTargetUtilModule, '缺少搜索目标收集工具')

  const { collectSearchTargetElements } = searchTargetUtilModule
  assert.equal(typeof collectSearchTargetElements, 'function')

  const rootElement = {
    matches(selector) {
      return selector === '.allow-search'
    },
    querySelectorAll() {
      return []
    },
  }

  assert.deepEqual(collectSearchTargetElements(rootElement), [rootElement])
})

test('搜索目标收集应兼容仅后代命中 allow-search 的场景', () => {
  assert.ok(searchTargetUtilModule, '缺少搜索目标收集工具')

  const { collectSearchTargetElements } = searchTargetUtilModule
  const childElement = { id: 'child' }
  const rootElement = {
    matches() {
      return false
    },
    querySelectorAll(selector) {
      return selector === '.allow-search' ? [childElement] : []
    },
  }

  assert.deepEqual(collectSearchTargetElements(rootElement), [childElement])
})
