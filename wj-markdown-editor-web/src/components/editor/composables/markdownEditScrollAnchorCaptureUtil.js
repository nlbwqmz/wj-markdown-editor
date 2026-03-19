/**
 * 创建 MarkdownEdit 组件侧的滚动锚点采集入口。
 * 这一层的职责不是做几何计算，而是把组件内部两份锚点控制器按可见性规则串起来：
 * 1. 每次采集前先把当前 session snapshot 写入本地引用
 * 2. 左侧编辑区始终采集
 * 3. 右侧预览区只有当前真实可见时才采集
 *
 * 之所以单独抽出这层，是为了让测试直接覆盖组件暴露的 capture 行为，
 * 而不是停留在单个底层 composable 的局部语义。
 *
 * @param {{
 *   updateCurrentScrollSnapshot?: (snapshot: { sessionId?: string, revision?: number } | undefined) => void,
 *   editorCodeScrollAnchor?: { captureCurrentAnchor?: () => object | null },
 *   editorPreviewScrollAnchor?: { captureCurrentAnchor?: () => object | null },
 *   previewControllerRef?: { value?: boolean },
 * }} options
 * @returns {(snapshot?: { sessionId?: string, revision?: number }) => {
 *   editorCode: object | null,
 *   editorPreview: object | null,
 * }} 返回组件侧用于暴露给外层的 captureViewScrollAnchors 方法。
 */
export function createMarkdownEditScrollAnchorCapture(options = {}) {
  const {
    updateCurrentScrollSnapshot,
    editorCodeScrollAnchor,
    editorPreviewScrollAnchor,
    previewControllerRef,
  } = options

  /**
   * 采集当前编辑页滚动锚点。
   * 右侧预览隐藏时必须完全跳过 editor-preview 控制器，
   * 这样才能保留上一轮已存在的预览记录，而不是把它覆盖成空值。
   *
   * @param {{ sessionId?: string, revision?: number } | undefined} snapshot
   * @returns {{ editorCode: object | null, editorPreview: object | null }} 返回本轮左右区域采集结果。
   */
  return function captureViewScrollAnchors(snapshot) {
    updateCurrentScrollSnapshot?.(snapshot)

    return {
      editorCode: editorCodeScrollAnchor?.captureCurrentAnchor?.() ?? null,
      editorPreview: previewControllerRef?.value === true
        ? (editorPreviewScrollAnchor?.captureCurrentAnchor?.() ?? null)
        : null,
    }
  }
}

/**
 * 创建 MarkdownEdit 组件侧的预览区滚动恢复入口。
 * 这一层负责把“锚点元素查找”“fallbackScrollTop 兜底”“最终写回滚动容器”串起来，
 * 从而让组件 wiring 不会因为找不到精确 DOM 元素而直接放弃恢复。
 *
 * @param {{
 *   findPreviewElementByAnchor?: (scrollElement: any, anchor: any) => any,
 *   resolvePreviewLineAnchorScrollTop?: (payload: {
 *     container: any,
 *     element: any,
 *     anchor: any,
 *     fallbackScrollTop: number | undefined,
 *   }) => number,
 *   setScrollElementScrollTop?: (scrollElement: any, targetScrollTop: number) => void,
 * }} options
 * @returns {(payload: {
 *   record?: { anchor?: any, fallbackScrollTop?: number } | null,
 *   scrollElement?: any,
 * }) => boolean} 返回供 useViewScrollAnchor 使用的 restoreAnchor 实现。
 */
export function createMarkdownEditPreviewScrollAnchorRestore(options = {}) {
  const {
    findPreviewElementByAnchor,
    resolvePreviewLineAnchorScrollTop,
    setScrollElementScrollTop,
  } = options

  /**
   * 恢复右侧预览区滚动位置。
   * 即使找不到精确锚点元素，也必须让 resolvePreviewLineAnchorScrollTop 接管兜底逻辑，
   * 从而把已保存的 fallbackScrollTop 应用回滚动容器，而不是直接返回 false。
   *
   * @param {{
   *   record?: { anchor?: any, fallbackScrollTop?: number } | null,
   *   scrollElement?: any,
   * }} payload
   * @returns {boolean} 返回本轮是否已经完成一次有效恢复。
   */
  return function restorePreviewScrollAnchor(payload = {}) {
    const { record, scrollElement } = payload
    if (!scrollElement || typeof resolvePreviewLineAnchorScrollTop !== 'function') {
      return false
    }

    const targetElement = typeof findPreviewElementByAnchor === 'function'
      ? findPreviewElementByAnchor(scrollElement, record?.anchor)
      : null

    const targetScrollTop = resolvePreviewLineAnchorScrollTop({
      container: scrollElement,
      element: targetElement,
      anchor: record?.anchor,
      fallbackScrollTop: record?.fallbackScrollTop,
    })

    if (typeof setScrollElementScrollTop === 'function') {
      setScrollElementScrollTop(scrollElement, targetScrollTop)
      return true
    }

    return false
  }
}

export default {
  createMarkdownEditScrollAnchorCapture,
  createMarkdownEditPreviewScrollAnchorRestore,
}
