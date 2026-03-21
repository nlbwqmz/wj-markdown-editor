/**
 * 收口预览刷新完成后的固定后置顺序：
 * 1. 重建预览布局索引
 * 2. 恢复双侧高亮
 * 3. 关闭预览搜索
 *
 * 不负责创建索引实例，也不直接依赖 composable。
 *
 * @param {{
 *   rebuildPreviewLayoutIndex: () => void,
 *   restorePreviewLinkedHighlight: () => void,
 *   closePreviewSearchBar: () => void,
 * }} options
 * @returns {{ onRefreshComplete: () => void }} 返回刷新完成回调。
 */
export function createPreviewRefreshCoordinator({
  rebuildPreviewLayoutIndex,
  restorePreviewLinkedHighlight,
  closePreviewSearchBar,
}) {
  function onRefreshComplete() {
    rebuildPreviewLayoutIndex()
    restorePreviewLinkedHighlight()
    closePreviewSearchBar()
  }

  return {
    onRefreshComplete,
  }
}
