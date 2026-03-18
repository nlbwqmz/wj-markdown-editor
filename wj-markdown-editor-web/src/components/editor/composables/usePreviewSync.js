import { message } from 'ant-design-vue'

/**
 * 编辑区与预览区滚动同步
 * 保持原有滚动映射算法，确保拆分后行为一致
 */
export function usePreviewSync({
  editorViewRef,
  previewRef,
  scrolling,
  editorScrollTop,
}) {
  const SCROLL_IDLE_MS = 160
  const SCROLL_MAX_WAIT_MS = 5000
  let activeScrollWatch

  function getEditorView() {
    return editorViewRef.value
  }

  function getPreviewElementDepth(element) {
    let depth = 0
    let current = element
    while (current && current !== previewRef.value) {
      depth++
      current = current.parentElement
    }
    return depth
  }

  // 查找匹配行号的元素
  function findPreviewElement(maxLineNumber, lineNumber, first) {
    if (!previewRef.value) {
      return { element: null, found: false }
    }
    const elements = previewRef.value.querySelectorAll('[data-line-start]')
    const waiting = []
    for (const element of elements) {
      const start = +element.dataset.lineStart
      const end = +element.dataset.lineEnd || start
      if (lineNumber >= start && lineNumber <= end) {
        waiting.push({ element, start, end, depth: getPreviewElementDepth(element) })
      }
    }
    if (waiting.length === 0) {
      if (lineNumber < maxLineNumber) {
        return findPreviewElement(maxLineNumber, lineNumber + 1, false)
      } else {
        return { element: null, found: false }
      }
    }
    waiting.sort((a, b) => {
      const spanCompare = (a.end - a.start) - (b.end - b.start)
      if (spanCompare !== 0) {
        return spanCompare
      }
      return b.depth - a.depth
    })
    return { element: waiting[0].element, found: first }
  }

  function scheduleAnimationFrame(callback) {
    if (typeof requestAnimationFrame === 'function') {
      return requestAnimationFrame(callback)
    }
    return setTimeout(callback, 16)
  }

  function cancelScheduledAnimationFrame(id) {
    if (id === undefined || id === null) {
      return
    }
    if (typeof cancelAnimationFrame === 'function' && typeof requestAnimationFrame === 'function') {
      cancelAnimationFrame(id)
      return
    }
    clearTimeout(id)
  }

  function clearActiveScrollWatch() {
    if (!activeScrollWatch) {
      return
    }
    activeScrollWatch.finished = true
    cancelScheduledAnimationFrame(activeScrollWatch.rafId)
    activeScrollWatch.element?.removeEventListener('scrollend', activeScrollWatch.onScrollEnd)
    activeScrollWatch = undefined
  }

  function checkScrollTop(element, top, callback) {
    if (!element) {
      callback && callback()
      return
    }

    const normalizedTop = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, top))
    if (Math.abs(element.scrollTop - normalizedTop) < 1) {
      callback && callback()
      return
    }

    clearActiveScrollWatch()

    const watch = {
      element,
      rafId: undefined,
      onScrollEnd: undefined,
      lastScrollTop: element.scrollTop,
      lastMovementAt: Date.now(),
      startedAt: Date.now(),
      finished: false,
    }

    const finish = () => {
      if (watch.finished === true) {
        return
      }
      watch.finished = true
      if (activeScrollWatch === watch) {
        activeScrollWatch = undefined
      }
      cancelScheduledAnimationFrame(watch.rafId)
      watch.element.removeEventListener('scrollend', watch.onScrollEnd)
      callback && callback()
    }

    const pollScroll = () => {
      if (watch.finished === true) {
        return
      }
      const currentScrollTop = element.scrollTop
      const now = Date.now()
      if (Math.abs(currentScrollTop - normalizedTop) < 1) {
        finish()
        return
      }
      if (Math.abs(currentScrollTop - watch.lastScrollTop) >= 1) {
        watch.lastScrollTop = currentScrollTop
        watch.lastMovementAt = now
      } else if (now - watch.lastMovementAt >= SCROLL_IDLE_MS) {
        finish()
        return
      }
      if (now - watch.startedAt >= SCROLL_MAX_WAIT_MS) {
        finish()
        return
      }
      watch.rafId = scheduleAnimationFrame(pollScroll)
    }

    watch.onScrollEnd = () => {
      if (Math.abs(element.scrollTop - normalizedTop) < 1) {
        finish()
        return
      }
      watch.lastScrollTop = element.scrollTop
      watch.lastMovementAt = Date.now()
    }

    if ('onscrollend' in element) {
      element.addEventListener('scrollend', watch.onScrollEnd)
    }

    activeScrollWatch = watch
    watch.rafId = scheduleAnimationFrame(pollScroll)
  }

  function clearScrollTimer() {
    clearActiveScrollWatch()
  }

  function getTotalLineHeight(start, end) {
    const view = getEditorView()
    if (!view) {
      return 0
    }
    let height = 0
    while (start <= end) {
      height += view.lineBlockAt(view.state.doc.line(start).from).height
      start++
    }
    return height
  }

  // 获取指定滚动容器内元素到容器顶部的距离（包含滚动偏移）
  function getElementToTopDistance(targetElement, containerElement) {
    const trRect = targetElement.getBoundingClientRect()
    const containerRect = containerElement.getBoundingClientRect()
    return trRect.top - containerRect.top - containerElement.clientTop + containerElement.scrollTop
  }

  function clampScrollRatio(value) {
    if (!Number.isFinite(value)) {
      return 0
    }
    return Math.max(0, Math.min(1, value))
  }

  function jumpToTargetLine() {
    const view = getEditorView()
    if (!previewRef.value || !view) {
      message.warning('请先打开预览')
      return
    }
    const main = view.state.selection.main
    const line = view.state.doc.lineAt(main.to)
    const lineNumber = line.number
    const previewElement = findPreviewElement(view.state.doc.lines, lineNumber, true)
    if (previewElement.element) {
      const startLineNumber = +previewElement.element.dataset.lineStart
      const endLineNumber = +previewElement.element.dataset.lineEnd
      let targetScrollTop
      if (startLineNumber === endLineNumber || previewElement.found === false) {
        targetScrollTop = getElementToTopDistance(previewElement.element, previewRef.value)
      } else {
        const totalLineHeight = getTotalLineHeight(startLineNumber, endLineNumber)
        const offsetHeight = getTotalLineHeight(startLineNumber, lineNumber - 1)
        const scrollRatio = clampScrollRatio(totalLineHeight > 0 ? offsetHeight / totalLineHeight : 0)
        const elementTop = getElementToTopDistance(previewElement.element, previewRef.value)
        const elementHeight = previewElement.element.getBoundingClientRect().height
        targetScrollTop = elementTop + (elementHeight * scrollRatio)
      }
      previewRef.value.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      })
    }
  }

  function syncEditorToPreview(refresh) {
    const view = getEditorView()
    if (!view || !previewRef.value || scrolling.value.preview) {
      return
    }

    // 若竖向滚动条值没改变则表示横向滚动，直接跳过
    if (editorScrollTop.value === view.scrollDOM.scrollTop && refresh !== true) {
      return
    }
    editorScrollTop.value = view.scrollDOM.scrollTop

    const scrollTop = view.scrollDOM.scrollTop
    const topBlock = view.lineBlockAtHeight(scrollTop)
    const lineNumber = view.state.doc.lineAt(topBlock.from).number
    const previewElement = findPreviewElement(view.state.doc.lines, lineNumber, true)

    if (previewElement.element) {
      let targetScrollTop = 0
      if (previewElement.found) {
        const startLineNumber = +previewElement.element.dataset.lineStart
        const endLineNumber = +previewElement.element.dataset.lineEnd
        let totalLineHeight
        let scrollOffsetInLine
        if (startLineNumber === endLineNumber) {
          totalLineHeight = topBlock.height
          scrollOffsetInLine = scrollTop - topBlock.top
        } else {
          totalLineHeight = getTotalLineHeight(startLineNumber, endLineNumber)
          scrollOffsetInLine = startLineNumber === lineNumber
            ? scrollTop - topBlock.top
            : getTotalLineHeight(startLineNumber, lineNumber - 1) + scrollTop - topBlock.top
        }
        const scrollRatio = clampScrollRatio(totalLineHeight > 0 ? scrollOffsetInLine / totalLineHeight : 0)
        const elementTop = getElementToTopDistance(previewElement.element, previewRef.value)
        const elementHeight = previewElement.element.getBoundingClientRect().height
        targetScrollTop = elementTop + (elementHeight * scrollRatio)
      } else {
        targetScrollTop = getElementToTopDistance(previewElement.element, previewRef.value)
      }

      scrolling.value.editor = true
      checkScrollTop(previewRef.value, targetScrollTop, () => {
        scrolling.value.editor = false
      })
      previewRef.value.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      })
    }
  }

  function findElementAtPreviewScroll(scrollTop) {
    const elements = Array.from(previewRef.value.querySelectorAll('[data-line-start]'))
    let target = elements[0]
    for (const element of elements) {
      if (getElementToTopDistance(element, previewRef.value) <= scrollTop) {
        target = element
      } else {
        break
      }
    }
    return target
  }

  function syncPreviewToEditor() {
    const view = getEditorView()
    if (!view || !previewRef.value || scrolling.value.editor) {
      return
    }
    const previewScrollTop = previewRef.value.scrollTop
    const element = findElementAtPreviewScroll(previewScrollTop)
    if (element && element.dataset.lineStart) {
      const startLineNumber = +element.dataset.lineStart
      const endLineNumber = +element.dataset.lineEnd
      const elementTop = getElementToTopDistance(element, previewRef.value)
      const elementScrollOffset = previewScrollTop - elementTop
      const elementHeight = element.getBoundingClientRect().height
      const scrollRatio = clampScrollRatio(elementHeight > 0 ? elementScrollOffset / elementHeight : 0)
      const startLine = view.state.doc.line(startLineNumber)
      const totalLineHeight = getTotalLineHeight(startLineNumber, endLineNumber)
      const block = view.lineBlockAt(startLine.from)
      const targetScrollTop = block.top + (totalLineHeight * scrollRatio)

      scrolling.value.preview = true
      checkScrollTop(view.scrollDOM, targetScrollTop, () => {
        scrolling.value.preview = false
      })
      view.scrollDOM.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      })
    }
  }

  function onEditorWheel(e) {
    const view = getEditorView()
    if (!view || !previewRef.value) {
      return
    }
    // 按住 shift 表示横向滚动，跳过
    if (e.shiftKey === true) {
      return
    }
    if (
      (e.deltaY > 0 && view.scrollDOM.scrollHeight === view.scrollDOM.scrollTop + view.scrollDOM.clientHeight)
      || (e.deltaY < 0 && view.scrollDOM.scrollTop === 0)
    ) {
      e.preventDefault()
      previewRef.value.scrollBy({ top: e.deltaY, behavior: 'smooth' })
    }
  }

  function bindEvents() {
    const view = getEditorView()
    if (!view) {
      return
    }
    view.scrollDOM.addEventListener('wheel', onEditorWheel)
    view.scrollDOM.addEventListener('scroll', syncEditorToPreview)
  }

  function unbindEvents() {
    const view = getEditorView()
    if (!view) {
      return
    }
    view.scrollDOM.removeEventListener('wheel', onEditorWheel)
    view.scrollDOM.removeEventListener('scroll', syncEditorToPreview)
  }

  return {
    findPreviewElement,
    jumpToTargetLine,
    syncEditorToPreview,
    syncPreviewToEditor,
    bindEvents,
    unbindEvents,
    clearScrollTimer,
  }
}
