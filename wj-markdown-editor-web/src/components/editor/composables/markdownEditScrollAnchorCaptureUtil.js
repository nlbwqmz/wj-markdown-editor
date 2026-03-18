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

export default {
  createMarkdownEditScrollAnchorCapture,
}
