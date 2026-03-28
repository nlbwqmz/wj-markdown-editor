import assert from 'node:assert/strict'

const { test } = await import('node:test')

let previewRefreshCoordinatorModule = null

try {
  previewRefreshCoordinatorModule = await import('../previewRefreshCoordinator.js')
} catch {
  previewRefreshCoordinatorModule = null
}

/**
 * 统一校验预览刷新协调器模块已经存在。
 * RED 阶段若模块尚未创建，这里会直接给出稳定且清晰的失败信息。
 *
 * @returns {Function} 返回待测的 createPreviewRefreshCoordinator 工厂函数。
 */
function requireCreatePreviewRefreshCoordinator() {
  assert.ok(previewRefreshCoordinatorModule, '缺少 preview refresh coordinator 模块')

  const { createPreviewRefreshCoordinator } = previewRefreshCoordinatorModule
  assert.equal(typeof createPreviewRefreshCoordinator, 'function')

  return createPreviewRefreshCoordinator
}

test('onRefreshComplete 会按先重建索引、再恢复高亮、最后关闭搜索的顺序执行', () => {
  const createPreviewRefreshCoordinator = requireCreatePreviewRefreshCoordinator()
  const callOrder = []

  const { onRefreshComplete } = createPreviewRefreshCoordinator({
    rebuildPreviewLayoutIndex() {
      callOrder.push('rebuild-index')
    },
    restorePreviewLinkedHighlight() {
      callOrder.push('restore-highlight')
    },
    closePreviewSearchBar() {
      callOrder.push('close-search')
    },
  })

  onRefreshComplete()

  assert.deepEqual(callOrder, [
    'rebuild-index',
    'restore-highlight',
    'close-search',
  ])
})

test('onRefreshComplete 在需要时会先补做预览滚动同步，再恢复高亮和关闭搜索', () => {
  const createPreviewRefreshCoordinator = requireCreatePreviewRefreshCoordinator()
  const callOrder = []

  const { onRefreshComplete } = createPreviewRefreshCoordinator({
    rebuildPreviewLayoutIndex() {
      callOrder.push('rebuild-index')
    },
    syncPreviewAfterRefresh() {
      callOrder.push('sync-preview')
    },
    restorePreviewLinkedHighlight() {
      callOrder.push('restore-highlight')
    },
    closePreviewSearchBar() {
      callOrder.push('close-search')
    },
  })

  onRefreshComplete()

  assert.deepEqual(callOrder, [
    'rebuild-index',
    'sync-preview',
    'restore-highlight',
    'close-search',
  ])
})
