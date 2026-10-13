const EMPTY_LINE_RESULT = Object.freeze({
  entry: null,
  found: false,
  index: -1,
  matchedLineNumber: null,
})

const EMPTY_SCROLL_RESULT = Object.freeze({
  entry: null,
  index: -1,
})

const EMPTY_SHARED_LINE_RESULT = Object.freeze({
  entry: null,
  found: false,
  index: -1,
  matchedLineNumber: null,
  source: null,
})

const EMPTY_SHARED_SCROLL_RESULT = Object.freeze({
  entry: null,
  index: -1,
  source: null,
})

function parseLineNumber(value) {
  const lineNumber = Number.parseInt(value, 10)
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    return null
  }
  return lineNumber
}

function normalizeLineRange(lineStartValue, lineEndValue) {
  const lineStart = parseLineNumber(lineStartValue)
  if (lineStart === null) {
    return null
  }
  const parsedLineEnd = parseLineNumber(lineEndValue)
  const lineEnd = parsedLineEnd === null ? lineStart : parsedLineEnd
  if (lineEnd >= lineStart) {
    return { lineStart, lineEnd }
  }
  return {
    lineStart: lineEnd,
    lineEnd: lineStart,
  }
}

function getPreviewElementDepth(rootElement, element) {
  let depth = 0
  let current = element
  while (current && current !== rootElement) {
    depth++
    current = current.parentElement ?? null
  }
  return depth
}

function normalizeEntry({ rootElement, element, order }) {
  if (!rootElement || !element) {
    return null
  }

  const lineRange = normalizeLineRange(element.dataset?.lineStart, element.dataset?.lineEnd)
  if (!lineRange) {
    return null
  }

  return {
    element,
    lineStart: lineRange.lineStart,
    lineEnd: lineRange.lineEnd,
    depth: getPreviewElementDepth(rootElement, element),
    span: lineRange.lineEnd - lineRange.lineStart,
    order,
  }
}

function collectEntries(rootElement) {
  if (!rootElement?.querySelectorAll) {
    return []
  }

  return Array.from(rootElement.querySelectorAll('[data-line-start]'))
    .map((element, order) => normalizeEntry({
      rootElement,
      element,
      order,
    }))
    .filter(entry => !!entry)
}

function compareLineMatchPriority(entryA, entryB) {
  const spanCompare = entryA.span - entryB.span
  if (spanCompare !== 0) {
    return spanCompare
  }

  const depthCompare = entryB.depth - entryA.depth
  if (depthCompare !== 0) {
    return depthCompare
  }

  return entryA.order - entryB.order
}

function normalizeLineSearchInput(lineNumber, maxLineNumber) {
  const normalizedLineNumber = parseLineNumber(lineNumber)
  const parsedMaxLineNumber = parseLineNumber(maxLineNumber)
  if (normalizedLineNumber === null || parsedMaxLineNumber === null) {
    return null
  }

  return {
    lineNumber: normalizedLineNumber,
    maxLineNumber: Math.max(normalizedLineNumber, parsedMaxLineNumber),
  }
}

function findEntryByLineFromEntries(entries, lineNumber, maxLineNumber) {
  const normalizedInput = normalizeLineSearchInput(lineNumber, maxLineNumber)
  if (!normalizedInput || entries.length === 0) {
    return EMPTY_LINE_RESULT
  }

  for (let currentLineNumber = normalizedInput.lineNumber; currentLineNumber <= normalizedInput.maxLineNumber; currentLineNumber++) {
    let bestEntry = null
    let bestIndex = -1

    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]
      if (currentLineNumber < entry.lineStart || currentLineNumber > entry.lineEnd) {
        continue
      }

      if (!bestEntry || compareLineMatchPriority(entry, bestEntry) < 0) {
        bestEntry = entry
        bestIndex = index
      }
    }

    if (bestEntry) {
      return {
        entry: bestEntry,
        found: currentLineNumber === normalizedInput.lineNumber,
        index: bestIndex,
        matchedLineNumber: currentLineNumber,
      }
    }
  }

  return EMPTY_LINE_RESULT
}

function normalizeScrollTop(scrollTop) {
  const numericScrollTop = Number(scrollTop)
  if (!Number.isFinite(numericScrollTop)) {
    return null
  }
  return Math.max(0, numericScrollTop)
}

function normalizeHintIndex(hint) {
  if (Number.isInteger(hint) && hint >= 0) {
    return hint
  }
  if (hint && Number.isInteger(hint.index) && hint.index >= 0) {
    return hint.index
  }
  return null
}

function getElementToTopDistance(rootElement, element) {
  if (!rootElement || !element) {
    return null
  }

  const rootRect = rootElement.getBoundingClientRect?.()
  const elementRect = element.getBoundingClientRect?.()
  if (!Number.isFinite(rootRect?.top) || !Number.isFinite(elementRect?.top)) {
    return null
  }

  return elementRect.top - rootRect.top - (rootElement.clientTop ?? 0) + (rootElement.scrollTop ?? 0)
}

function findEntryAtScrollTopByScan(entries, rootElement, scrollTop) {
  if (entries.length === 0 || !rootElement) {
    return EMPTY_SCROLL_RESULT
  }

  let firstValidEntry = null
  let firstValidIndex = -1
  let targetEntry = null
  let targetIndex = -1

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    const top = getElementToTopDistance(rootElement, entry.element)
    if (!Number.isFinite(top)) {
      continue
    }

    if (!firstValidEntry) {
      firstValidEntry = entry
      firstValidIndex = index
    }
    if (top <= scrollTop) {
      targetEntry = entry
      targetIndex = index
    }
  }

  if (targetEntry) {
    return {
      entry: targetEntry,
      index: targetIndex,
    }
  }
  if (firstValidEntry) {
    return {
      entry: firstValidEntry,
      index: firstValidIndex,
    }
  }

  return EMPTY_SCROLL_RESULT
}

function canUseHintResult({ entries, rootElement, scrollTop, hintIndex }) {
  if (hintIndex === null || hintIndex < 0 || hintIndex >= entries.length) {
    return null
  }

  const hintedEntry = entries[hintIndex]
  const hintedTop = getElementToTopDistance(rootElement, hintedEntry.element)
  if (!Number.isFinite(hintedTop)) {
    return null
  }

  // hint 只能在足以证明“后续节点不会再把结果推后”时直接命中；
  // 一旦后继出现乱序风险，就必须交还给完整扫描。
  let lastCheckedTop = hintedTop

  if (hintedTop <= scrollTop) {
    let candidateEntry = hintedEntry
    let candidateIndex = hintIndex

    for (let index = hintIndex + 1; index < entries.length; index++) {
      const currentEntry = entries[index]
      const currentTop = getElementToTopDistance(rootElement, currentEntry.element)
      if (!Number.isFinite(currentTop)) {
        return null
      }
      if (currentTop < lastCheckedTop) {
        return null
      }
      lastCheckedTop = currentTop
      if (currentTop <= scrollTop) {
        candidateEntry = currentEntry
        candidateIndex = index
      }
    }

    return {
      entry: candidateEntry,
      index: candidateIndex,
    }
  }

  if (hintIndex === 0) {
    for (let index = hintIndex + 1; index < entries.length; index++) {
      const currentEntry = entries[index]
      const currentTop = getElementToTopDistance(rootElement, currentEntry.element)
      if (!Number.isFinite(currentTop)) {
        return null
      }
      if (currentTop < lastCheckedTop) {
        return null
      }
      lastCheckedTop = currentTop
    }

    return {
      entry: hintedEntry,
      index: hintIndex,
    }
  }

  const previousEntry = entries[hintIndex - 1]
  const previousTop = getElementToTopDistance(rootElement, previousEntry.element)
  if (!Number.isFinite(previousTop) || previousTop > scrollTop) {
    return null
  }

  for (let index = hintIndex + 1; index < entries.length; index++) {
    const currentEntry = entries[index]
    const currentTop = getElementToTopDistance(rootElement, currentEntry.element)
    if (!Number.isFinite(currentTop)) {
      return null
    }
    if (currentTop < lastCheckedTop) {
      return null
    }
    lastCheckedTop = currentTop
  }

  return {
    entry: previousEntry,
    index: hintIndex - 1,
  }
}

// 二分查找专用的偏移量读取器：共享一次容器 rect，按需读取单个条目的实时偏移量。
// 布局读取只发生在二分路径上（O(log n) 次），因此不需要缓存与失效处理。
function createEntryOffsetReader(rootElement) {
  const rootRect = rootElement?.getBoundingClientRect?.()
  if (!rootRect || !Number.isFinite(rootRect.top)) {
    return null
  }

  const rootTop = rootRect.top
  const clientTop = rootElement.clientTop ?? 0
  const scrollTop = rootElement.scrollTop ?? 0
  return (entry) => {
    const elementRect = entry?.element?.getBoundingClientRect?.()
    if (!elementRect || !Number.isFinite(elementRect.top)) {
      return null
    }
    return elementRect.top - rootTop - clientTop + scrollTop
  }
}

// 二分查找：条目按 DOM 顺序收集，偏移量正常情况下单调递增。
// 只读取二分路径上的条目（O(log n) 次布局读取），并对结果做边界校验；
// 检测到乱序或读取失败时返回 null，由调用方回退全量扫描，保证结果正确。
function findEntryAtScrollTopByBinarySearch(entries, rootElement, scrollTop) {
  if (entries.length === 0 || !rootElement) {
    return null
  }

  const readOffsetTop = createEntryOffsetReader(rootElement)
  if (!readOffsetTop) {
    return null
  }

  let low = 0
  let high = entries.length - 1
  let candidateIndex = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    const midTop = readOffsetTop(entries[mid])
    if (midTop === null) {
      return null
    }
    if (midTop <= scrollTop) {
      candidateIndex = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  // 全部条目都在目标位置下方时，命中第一个条目（与全量扫描语义一致）
  if (candidateIndex < 0) {
    candidateIndex = 0
  }

  // 边界校验：结果条目必须 <= scrollTop，且后续邻近窗口内不得再出现 <= scrollTop 的条目；
  // 不满足说明存在乱序，交还全量扫描处理。
  const VERIFY_WINDOW_SIZE = 4
  const candidateTop = readOffsetTop(entries[candidateIndex])
  if (candidateTop === null || candidateTop > scrollTop) {
    return null
  }
  const verifyEndIndex = Math.min(entries.length, candidateIndex + 1 + VERIFY_WINDOW_SIZE)
  for (let index = candidateIndex + 1; index < verifyEndIndex; index++) {
    const nextTop = readOffsetTop(entries[index])
    if (nextTop === null || nextTop <= scrollTop) {
      return null
    }
  }

  return {
    entry: entries[candidateIndex],
    index: candidateIndex,
  }
}

function findEntryAtScrollTopFromEntries(entries, rootElement, scrollTop, hint) {
  const normalizedScrollTop = normalizeScrollTop(scrollTop)
  if (normalizedScrollTop === null || entries.length === 0 || !rootElement) {
    return EMPTY_SCROLL_RESULT
  }

  const hintedResult = canUseHintResult({
    entries,
    rootElement,
    scrollTop: normalizedScrollTop,
    hintIndex: normalizeHintIndex(hint),
  })
  if (hintedResult?.entry) {
    return hintedResult
  }

  return findEntryAtScrollTopByScan(entries, rootElement, normalizedScrollTop)
}

function isEntryStillValid(rootElement, entry) {
  if (!rootElement || !entry?.element) {
    return false
  }

  const element = entry.element
  if (element.isConnected === false) {
    return false
  }
  if (typeof rootElement.contains !== 'function' || rootElement.contains(element) !== true) {
    return false
  }

  const lineRange = normalizeLineRange(element.dataset?.lineStart, element.dataset?.lineEnd)
  if (!lineRange) {
    return false
  }

  return lineRange.lineStart === entry.lineStart && lineRange.lineEnd === entry.lineEnd
}

function collectLegacyDomEntries(rootElement) {
  return collectEntries(rootElement).filter(entry => entry.element?.isConnected !== false)
}

export function createPreviewLayoutIndex() {
  let rootElement = null
  let entries = []

  return {
    rebuild(nextRootElement) {
      rootElement = nextRootElement ?? null
      entries = collectEntries(rootElement)
      return entries.length
    },
    clear() {
      rootElement = null
      entries = []
    },
    hasEntries() {
      return entries.length > 0
    },
    findByLine(lineNumber, maxLineNumber) {
      return findEntryByLineFromEntries(entries, lineNumber, maxLineNumber)
    },
    findAtScrollTop(scrollTop, options = {}) {
      const activeRootElement = options.rootElement ?? rootElement
      const normalizedScrollTop = normalizeScrollTop(scrollTop)
      if (normalizedScrollTop === null || entries.length === 0 || !activeRootElement) {
        return EMPTY_SCROLL_RESULT
      }

      // hint 存在时保持既有语义：先按 hint 收敛，必要时回退完整扫描
      if (normalizeHintIndex(options.hint) !== null) {
        return findEntryAtScrollTopFromEntries(
          entries,
          activeRootElement,
          normalizedScrollTop,
          options.hint,
        )
      }

      // 无 hint 时优先二分（O(log n) 实时读取，无需缓存与失效处理）；
      // 检测到乱序或读取失败时回退到全量扫描。
      const binaryResult = findEntryAtScrollTopByBinarySearch(entries, activeRootElement, normalizedScrollTop)
      if (binaryResult) {
        return binaryResult
      }

      return findEntryAtScrollTopFromEntries(
        entries,
        activeRootElement,
        normalizedScrollTop,
      )
    },
  }
}

export function findPreviewElementByLine({
  rootElement,
  previewLayoutIndex,
  index,
  lineNumber,
  maxLineNumber,
} = {}) {
  if (!rootElement) {
    return EMPTY_SHARED_LINE_RESULT
  }

  const activePreviewLayoutIndex = previewLayoutIndex ?? index
  const indexedResult = activePreviewLayoutIndex?.findByLine?.(lineNumber, maxLineNumber) ?? EMPTY_LINE_RESULT
  if (indexedResult.entry && isEntryStillValid(rootElement, indexedResult.entry)) {
    return {
      ...indexedResult,
      source: 'index',
    }
  }

  const legacyResult = findEntryByLineFromEntries(
    collectLegacyDomEntries(rootElement),
    lineNumber,
    maxLineNumber,
  )

  if (!legacyResult.entry) {
    return EMPTY_SHARED_LINE_RESULT
  }

  return {
    ...legacyResult,
    source: 'legacy-dom',
  }
}

export function findPreviewElementAtScrollTop({
  rootElement,
  previewLayoutIndex,
  index,
  scrollTop,
  hint,
} = {}) {
  if (!rootElement) {
    return EMPTY_SHARED_SCROLL_RESULT
  }

  const activePreviewLayoutIndex = previewLayoutIndex ?? index
  const indexedResult = activePreviewLayoutIndex?.findAtScrollTop?.(scrollTop, {
    rootElement,
    hint,
  }) ?? EMPTY_SCROLL_RESULT

  if (indexedResult.entry && isEntryStillValid(rootElement, indexedResult.entry)) {
    return {
      ...indexedResult,
      source: 'index',
    }
  }

  const legacyResult = findEntryAtScrollTopFromEntries(
    collectLegacyDomEntries(rootElement),
    rootElement,
    scrollTop,
    hint,
  )

  if (!legacyResult.entry) {
    return EMPTY_SHARED_SCROLL_RESULT
  }

  return {
    ...legacyResult,
    source: 'legacy-dom',
  }
}
