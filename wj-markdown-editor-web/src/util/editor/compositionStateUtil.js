/**
 * 统一判断编辑器当前是否仍处于组合输入窗口。
 * CodeMirror 自身状态优先，DOM 事件兜底标记只用于覆盖极短的事件时序空窗。
 *
 * @param {{ view?: { composing?: boolean, compositionStarted?: boolean } | null, fallbackActive?: boolean }} options
 * @returns {boolean} 返回当前编辑器是否仍处于组合输入窗口。
 */
function isEditorCompositionActive({ view, fallbackActive = false } = {}) {
  return fallbackActive === true
    || view?.composing === true
    || view?.compositionStarted === true
}

/**
 * 判断这次外部同步是否会向编辑器发起 dispatch，且当前是否必须挂起。
 *
 * @param {{
 *   compositionActive?: boolean,
 *   currentContent?: string,
 *   nextContent?: string,
 *   shouldApplySelection?: boolean,
 * }} options
 * @returns {boolean} 返回当前外部同步是否必须挂起，避免在组合输入期间直接 dispatch。
 */
function shouldDeferExternalEditorDispatch({
  compositionActive = false,
  currentContent = '',
  nextContent = '',
  shouldApplySelection = false,
} = {}) {
  if (compositionActive !== true) {
    return false
  }

  return currentContent !== nextContent || shouldApplySelection === true
}

export {
  isEditorCompositionActive,
  shouldDeferExternalEditorDispatch,
}
