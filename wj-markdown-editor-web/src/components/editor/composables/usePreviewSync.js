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
  let checkScrollCallbackTimer

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

  function checkScrollTop(element, top, callback) {
    if (!element) {
      callback && callback()
      return
    }

    // 清除之前的定时器
    if (checkScrollCallbackTimer) {
      clearTimeout(checkScrollCallbackTimer)
    }

    // 标准化目标滚动位置
    top = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, top))

    const handleScrollComplete = () => {
      element.removeEventListener('scrollend', handleScrollComplete)
      clearTimeout(checkScrollCallbackTimer)
      callback && callback()
    }

    if ('onscrollend' in element) {
      element.addEventListener('scrollend', handleScrollComplete, { once: true })
      checkScrollCallbackTimer = setTimeout(() => {
        element.removeEventListener('scrollend', handleScrollComplete)
        callback && callback()
      }, 1000)
    } else {
      let lastScrollTop = -1
      const pollScroll = () => {
        const normalizedTop = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, top))
        if (Math.abs(element.scrollTop - normalizedTop) < 1 || element.scrollTop === lastScrollTop) {
          callback && callback()
        } else {
          lastScrollTop = element.scrollTop
          checkScrollCallbackTimer = requestAnimationFrame(pollScroll)
        }
      }
      pollScroll()
    }
  }

  function clearScrollTimer() {
    if (!checkScrollCallbackTimer) {
      return
    }
    clearTimeout(checkScrollCallbackTimer)
    cancelAnimationFrame(checkScrollCallbackTimer)
    checkScrollCallbackTimer = undefined
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
      if (element.offsetTop <= scrollTop) {
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
