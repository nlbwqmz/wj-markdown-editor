function normalizeToken(token) {
  return Number.isInteger(token) && token > 0 ? token : 0
}

function normalizeCursorPosition(cursorPosition) {
  return Number.isInteger(cursorPosition) ? cursorPosition : null
}

/**
 * 判断一次快照回写是否发生了“视图与会话错配”。
 *
 * 典型场景：用户新建/切换标签，目标标签的容器还没渲染出来，
 * 此时编辑器里仍是上一个标签的 view。
 * 如果把新文档的正文（例如空草稿的 `''`）写进旧视图，
 * 旧标签的内容会被静默清空；关闭标签时的正文收敛还会把这个空内容写进磁盘。
 *
 * @param {object} options
 * @param {string | null | undefined} options.snapshotSessionId 快照声明的目标会话
 * @param {string | null | undefined} options.viewSessionId 当前活动视图所属的会话
 * @returns {boolean} true 表示本次回写必须跳过
 */
export function isContentSyncTargetMismatch({ snapshotSessionId = null, viewSessionId = null } = {}) {
  if (!snapshotSessionId || !viewSessionId) {
    return false
  }

  return snapshotSessionId !== viewSessionId
}

/**
 * 判断这次内容同步是否属于“滞后的 echo 回放”。
 *
 * 典型场景：
 * 1. 编辑器本地已经继续输入，`currentContent` 比父层更近
 * 2. 父层/主进程这时又把上一轮已经上浮过的内容 `nextContent` 回推回来
 * 3. 如果直接整段回放，会把 CodeMirror 光标映射到错误位置
 *
 * 只有在“回推内容正好等于上一轮已上浮内容”且这次没有显式选区意图时，
 * 才把它识别为可安全忽略的滞后 echo。
 */
export function shouldDeferStaleContentSync({
  currentContent = '',
  nextContent = '',
  lastExposedContent = '',
  hasExplicitSelection = false,
} = {}) {
  if (hasExplicitSelection === true) {
    return false
  }

  if (currentContent === nextContent) {
    return false
  }

  return currentContent !== lastExposedContent
    && nextContent === lastExposedContent
}

/**
 * 判断下一次内容变更是否需要抑制向主进程回写。
 *
 * 这里专门处理“session snapshot 回放”这种程序性内容替换：
 * - 只有明确标记了 `skipContentSync=true`
 * - 且新旧内容确实发生变化
 * 才应该吞掉后续那一次 watch 回调。
 *
 * 如果这次回放本身是 no-op，就绝不能把保护位留下来，
 * 否则下一次真实用户输入会被误判成程序同步。
 */
export function shouldSuppressNextContentSync({
  currentContent = '',
  nextContent = '',
  skipContentSync = false,
} = {}) {
  return skipContentSync === true && currentContent !== nextContent
}

export function resolvePendingContentUpdateMeta({ handledToken = 0, contentUpdateMeta } = {}) {
  const normalizedHandledToken = normalizeToken(handledToken)
  const currentToken = normalizeToken(contentUpdateMeta?.token)

  if (currentToken === 0 || currentToken === normalizedHandledToken) {
    return {
      shouldApplySelection: false,
      cursorPosition: null,
      focus: false,
      scrollIntoView: false,
      nextHandledToken: normalizedHandledToken,
    }
  }

  const cursorPosition = normalizeCursorPosition(contentUpdateMeta?.cursorPosition)
  const shouldApplySelection = cursorPosition !== null

  return {
    shouldApplySelection,
    cursorPosition,
    focus: shouldApplySelection && contentUpdateMeta?.focus === true,
    scrollIntoView: shouldApplySelection && contentUpdateMeta?.scrollIntoView === true,
    nextHandledToken: currentToken,
  }
}

export default {
  isContentSyncTargetMismatch,
  shouldDeferStaleContentSync,
  shouldSuppressNextContentSync,
  resolvePendingContentUpdateMeta,
}
