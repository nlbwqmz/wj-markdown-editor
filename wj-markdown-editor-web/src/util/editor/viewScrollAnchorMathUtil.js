/**
 * 将任意输入规范化为可安全使用的回退滚动值。
 * 当调用方未提供合法数字时，统一回退到 0，避免继续传播 NaN。
 */
function normalizeFallbackScrollTop(fallbackScrollTop) {
  return Number.isFinite(fallbackScrollTop) ? fallbackScrollTop : 0
}

/**
 * 将比例值夹紧到 0 到 1 之间。
 * 这样既能容忍边界上的浮点误差，也能避免异常输入把滚动位置推到元素外部。
 */
function clampRatio(ratio) {
  if (!Number.isFinite(ratio)) {
    return 0
  }
  if (ratio <= 0) {
    return 0
  }
  if (ratio >= 1) {
    return 1
  }
  return ratio
}

/**
 * 解析行号字段。
 * dataset 里的值通常是字符串，这里统一转成数字，并在非法时返回 null。
 */
function parseLineNumber(value) {
  const lineNumber = Number(value)
  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    return null
  }
  return lineNumber
}

/**
 * 计算预览元素在容器滚动内容中的真实顶部位置。
 * 该公式与现有 usePreviewSync 中的坐标语义保持一致，可正确处理嵌套节点与表格场景。
 */
function getElementToContainerTopDistance(container, element) {
  if (!container || !element || typeof container.getBoundingClientRect !== 'function' || typeof element.getBoundingClientRect !== 'function') {
    return null
  }

  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const clientTop = Number.isFinite(container.clientTop) ? container.clientTop : 0
  const containerScrollTop = Number.isFinite(container.scrollTop) ? container.scrollTop : 0

  if (!Number.isFinite(containerRect?.top) || !Number.isFinite(elementRect?.top)) {
    return null
  }

  return elementRect.top - containerRect.top - clientTop + containerScrollTop
}

/**
 * 读取预览元素的行范围。
 * 若 lineEnd 缺失，则退化为单行块，保持与现有 Markdown 渲染数据兼容。
 */
function getPreviewElementLineRange(element) {
  const lineStart = parseLineNumber(element?.dataset?.lineStart)
  if (lineStart === null) {
    return null
  }

  const parsedLineEnd = parseLineNumber(element?.dataset?.lineEnd)
  const lineEnd = parsedLineEnd ?? lineStart

  return {
    lineStart,
    lineEnd: Math.max(lineStart, lineEnd),
  }
}

/**
 * 采集编辑区当前顶部可见行块的锚点。
 * 只返回纯数据，不依赖外部状态，也不会直接操作滚动条。
 */
export function captureEditorLineAnchor({ view, scrollTop }) {
  if (!view || typeof view.lineBlockAtHeight !== 'function' || typeof view.state?.doc?.lineAt !== 'function' || !Number.isFinite(scrollTop)) {
    return null
  }

  const lineBlock = view.lineBlockAtHeight(scrollTop)
  if (!lineBlock || !Number.isFinite(lineBlock.from) || !Number.isFinite(lineBlock.top) || !Number.isFinite(lineBlock.height)) {
    return null
  }

  const lineNumber = view.state.doc.lineAt(lineBlock.from)?.number
  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    return null
  }

  const lineOffsetRatio = clampRatio(lineBlock.height > 0 ? (scrollTop - lineBlock.top) / lineBlock.height : 0)

  return {
    type: 'editor-line',
    lineNumber,
    lineOffsetRatio,
  }
}

/**
 * 根据编辑区行锚点还原目标 scrollTop。
 * 若锚点无效、行块丢失或 view 接口不完整，则直接回退到调用方给定的滚动值。
 */
export function resolveEditorLineAnchorScrollTop({ view, anchor, fallbackScrollTop }) {
  const safeFallbackScrollTop = normalizeFallbackScrollTop(fallbackScrollTop)
  if (!view || typeof view.lineBlockAt !== 'function' || typeof view.state?.doc?.line !== 'function') {
    return safeFallbackScrollTop
  }
  if (anchor?.type !== 'editor-line' || !Number.isInteger(anchor.lineNumber) || anchor.lineNumber <= 0) {
    return safeFallbackScrollTop
  }

  let line
  try {
    /**
     * 真实 CodeMirror 在行号越界时会直接抛出 RangeError。
     * 本工具的契约是任何无法解析的锚点都优先回退，而不是把异常继续抛给调用方。
     */
    line = view.state.doc.line(anchor.lineNumber)
  } catch {
    return safeFallbackScrollTop
  }
  if (!line || !Number.isFinite(line.from)) {
    return safeFallbackScrollTop
  }

  const lineBlock = view.lineBlockAt(line.from)
  if (!lineBlock || !Number.isFinite(lineBlock.top) || !Number.isFinite(lineBlock.height)) {
    return safeFallbackScrollTop
  }

  return lineBlock.top + (lineBlock.height * clampRatio(anchor.lineOffsetRatio))
}

/**
 * 采集预览区元素锚点。
 * 锚点由元素映射的 Markdown 行范围，以及当前滚动位置落在元素内部的比例共同组成。
 */
export function capturePreviewLineAnchor({ container, element, scrollTop }) {
  if (!container || !element || !Number.isFinite(scrollTop)) {
    return null
  }

  const lineRange = getPreviewElementLineRange(element)
  if (!lineRange) {
    return null
  }

  const elementTop = getElementToContainerTopDistance(container, element)
  const elementHeight = element.getBoundingClientRect?.().height
  if (!Number.isFinite(elementTop) || !Number.isFinite(elementHeight)) {
    return null
  }

  const elementOffsetRatio = clampRatio(elementHeight > 0 ? (scrollTop - elementTop) / elementHeight : 0)

  return {
    type: 'preview-line',
    lineStart: lineRange.lineStart,
    lineEnd: lineRange.lineEnd,
    elementOffsetRatio,
  }
}

/**
 * 根据预览区元素锚点还原目标 scrollTop。
 * 调用方负责在外部完成元素查找；若当前拿不到目标元素，工具函数只负责返回安全回退值。
 */
export function resolvePreviewLineAnchorScrollTop({ container, element, anchor, fallbackScrollTop }) {
  const safeFallbackScrollTop = normalizeFallbackScrollTop(fallbackScrollTop)
  if (!container || !element) {
    return safeFallbackScrollTop
  }
  if (anchor?.type !== 'preview-line') {
    return safeFallbackScrollTop
  }

  const lineRange = getPreviewElementLineRange(element)
  if (!lineRange || lineRange.lineStart !== anchor.lineStart || lineRange.lineEnd !== anchor.lineEnd) {
    return safeFallbackScrollTop
  }

  const elementTop = getElementToContainerTopDistance(container, element)
  const elementHeight = element.getBoundingClientRect?.().height
  if (!Number.isFinite(elementTop) || !Number.isFinite(elementHeight)) {
    return safeFallbackScrollTop
  }

  return elementTop + (elementHeight * clampRatio(anchor.elementOffsetRatio))
}
