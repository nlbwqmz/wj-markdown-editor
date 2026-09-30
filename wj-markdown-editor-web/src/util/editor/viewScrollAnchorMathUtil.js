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

/**
 * 计算元素相对文档根的嵌套深度。
 * 交接恢复时用于在行范围相同的候选节点中优先选择更内层的真实内容节点，
 * 该排序语义与组件内按锚点精确查找的策略保持一致。
 *
 * @param {any} element
 * @returns {number} 返回元素嵌套深度。
 */
function getElementDepth(element) {
  let depth = 0
  let current = element?.parentElement ?? null

  while (current) {
    depth++
    current = current.parentElement
  }

  return depth
}

/**
 * 在预览锚点元素集合中查找包含指定行号的元素。
 * 若存在多个候选节点，则优先选择行范围最精确（span 最小）的节点；
 * span 相同时再优先选择嵌套更深的真实内容节点。
 *
 * @param {Iterable<any> | null | undefined} elements
 * @param {number} lineNumber
 * @returns {any | null} 返回命中的预览元素；找不到时返回 null。
 */
export function resolvePreviewLineElement(elements, lineNumber) {
  const parsedLineNumber = parseLineNumber(lineNumber)

  if (parsedLineNumber === null || elements == null) {
    return null
  }

  const containingCandidateList = []
  const previousCandidateList = []
  const nextCandidateList = []

  for (const element of elements) {
    const lineRange = getPreviewElementLineRange(element)
    if (!lineRange) {
      continue
    }

    const candidate = {
      element,
      lineStart: lineRange.lineStart,
      lineEnd: lineRange.lineEnd,
      span: lineRange.lineEnd - lineRange.lineStart,
      depth: getElementDepth(element),
    }

    if (lineRange.lineStart <= parsedLineNumber && parsedLineNumber <= lineRange.lineEnd) {
      containingCandidateList.push(candidate)
      continue
    }

    if (lineRange.lineEnd < parsedLineNumber) {
      previousCandidateList.push(candidate)
      continue
    }

    nextCandidateList.push(candidate)
  }

  if (containingCandidateList.length > 0) {
    containingCandidateList.sort(compareCandidatePrecision)
    return containingCandidateList[0].element
  }

  // 行号落在块间隙（空行、注释等没有行号映射的内容）时，
  // 退化为选择距离最近的块，避免恢复因“精确命中失败”直接回退到顶部。
  const previousCandidate = pickNearestCandidate(previousCandidateList, (left, right) => right.lineEnd - left.lineEnd)
  const nextCandidate = pickNearestCandidate(nextCandidateList, (left, right) => left.lineStart - right.lineStart)

  if (previousCandidate && nextCandidate) {
    const previousDistance = parsedLineNumber - previousCandidate.lineEnd
    const nextDistance = nextCandidate.lineStart - parsedLineNumber

    if (previousDistance !== nextDistance) {
      return previousDistance < nextDistance ? previousCandidate.element : nextCandidate.element
    }

    return compareCandidatePrecision(previousCandidate, nextCandidate) <= 0
      ? previousCandidate.element
      : nextCandidate.element
  }

  return (previousCandidate ?? nextCandidate)?.element ?? null
}

/**
 * 比较两个候选元素的定位精度：行范围越窄、嵌套越深，优先级越高。
 *
 * @param {{ span: number, depth: number }} left
 * @param {{ span: number, depth: number }} right
 * @returns {number} 返回排序差值。
 */
function compareCandidatePrecision(left, right) {
  const spanCompare = left.span - right.span
  if (spanCompare !== 0) {
    return spanCompare
  }
  return right.depth - left.depth
}

/**
 * 在候选列表中挑选最贴近目标行号的元素。
 * 主排序由调用方给出的距离比较函数决定，距离相同时再按定位精度决胜。
 *
 * @param {Array<{ element: any, span: number, depth: number }>} candidateList
 * @param {(left: any, right: any) => number} compareDistance
 * @returns {{ element: any } | null} 返回命中候选；列表为空时返回 null。
 */
function pickNearestCandidate(candidateList, compareDistance) {
  if (candidateList.length === 0) {
    return null
  }

  const sortedList = [...candidateList].sort((left, right) => compareDistance(left, right) || compareCandidatePrecision(left, right))

  return sortedList[0]
}

/**
 * 把源码行号与行内像素比例换算成它在预览块内的相对位置比例。
 * 跨视图交接必须与 resolvePreviewLineNumberFromAnchor 共用同一套“行号偏移 + 行内比例”语义，
 * 否则每次往返都会向块起始行漂移。
 *
 * @param {{ lineNumber?: number, lineOffsetRatio?: number, lineStart?: number, lineEnd?: number }} options
 * @returns {number} 返回 0 到 1 之间的行内相对位置比例。
 */
export function resolvePreviewLineNumberOffsetRatio(options) {
  const parsedLineNumber = parseLineNumber(options?.lineNumber)
  const parsedLineStart = parseLineNumber(options?.lineStart)

  if (parsedLineNumber === null || parsedLineStart === null) {
    return 0
  }

  const parsedLineEnd = parseLineNumber(options?.lineEnd) ?? parsedLineStart
  const lineSpan = Math.max(0, parsedLineEnd - parsedLineStart)
  const relativeLineIndex = Math.min(Math.max(parsedLineNumber - parsedLineStart, 0), lineSpan)

  // 以“行号偏移 + 行内像素比例”共同换算，保证与反向函数严格互逆。
  return (relativeLineIndex + clampRatio(options?.lineOffsetRatio)) / (lineSpan + 1)
}

/**
 * 把预览锚点换算回源码行号与行内像素比例。
 * 与 resolvePreviewLineNumberOffsetRatio 共用同一套行内比例语义，
 * 返回结构可直接用于构造 editor-line 锚点。
 *
 * @param {{ type?: string, lineStart?: number, lineEnd?: number, elementOffsetRatio?: number } | null | undefined} anchor
 * @returns {{ lineNumber: number, lineOffsetRatio: number } | null} 返回换算后的行号与行内比例；锚点非法时返回 null。
 */
export function resolvePreviewLineNumberFromAnchor(anchor) {
  if (anchor?.type !== 'preview-line') {
    return null
  }

  const lineStart = parseLineNumber(anchor.lineStart)
  if (lineStart === null) {
    return null
  }

  const lineEnd = parseLineNumber(anchor.lineEnd) ?? lineStart
  const lineSpan = Math.max(0, lineEnd - lineStart)
  const position = clampRatio(anchor.elementOffsetRatio) * (lineSpan + 1)
  // 消除浮点乘法误差，避免 floor 落到相邻行造成往返漂移。
  const normalizedPosition = Math.round(position * 1e6) / 1e6
  const lineIndex = Math.min(Math.floor(normalizedPosition), lineSpan)

  return {
    lineNumber: lineStart + lineIndex,
    lineOffsetRatio: clampRatio(normalizedPosition - lineIndex),
  }
}
