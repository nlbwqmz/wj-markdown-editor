import { message } from 'ant-design-vue'
import {
  findPreviewElementAtScrollTop,
  findPreviewElementByLine,
} from '../../../util/editor/previewLayoutIndexUtil.js'

/**
 * 编辑区与预览区滚动同步
 * 保持原有滚动映射算法，确保拆分后行为一致
 */
export function usePreviewSync({
  editorViewRef,
  previewRef,
  scrolling,
  editorScrollTop,
  previewLayoutIndex,
  restoreStateRef,
}) {
  const SCROLL_IDLE_MS = 160
  const SCROLL_MAX_WAIT_MS = 5000
  const PREVIEW_TO_EDITOR_ACTIVE_BOUNDS = 5
  const PREVIEW_TO_EDITOR_CORRECTION_EPSILON = 1
  const PREVIEW_TO_EDITOR_MAX_CORRECTIONS = 2
  let activeScrollWatch
  let previewToEditorSyncToken = 0

  function getEditorView() {
    return editorViewRef.value
  }

  // 统一复用共享 helper，索引命中时直接返回，失效时自动回退 legacy DOM 查找。
  function findPreviewElement(maxLineNumber, lineNumber, first) {
    const rootElement = previewRef.value
    if (!rootElement) {
      return { element: null, found: false }
    }
    const result = findPreviewElementByLine({
      previewLayoutIndex,
      rootElement,
      lineNumber,
      maxLineNumber,
    })
    return {
      ...result,
      element: result.entry?.element ?? null,
      found: first === false ? false : result.found,
    }
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

  /**
   * 联动滚动时直接把跟随侧滚动到目标位置。
   * 这里不能继续叠加第二条 smooth 动画，否则源侧持续滚动时，
   * 跟随侧会被上一轮动画拖住，只吃到早期目标，长距离跳转时尤其明显。
   */
  function scrollFollowerToTarget(scrollElement, targetScrollTop) {
    if (!scrollElement) {
      return
    }

    if (typeof scrollElement.scrollTo === 'function') {
      scrollElement.scrollTo({
        top: targetScrollTop,
      })
      return
    }

    scrollElement.scrollTop = targetScrollTop
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
    // 文档恢复期间，滚动位置正在由恢复流程接管，此时必须禁止编辑区反向驱动预览区，
    // 否则刚恢复出来的位置会立刻被同步逻辑覆盖，导致恢复结果不稳定。
    // 但这里仍要把当前编辑区纵向滚动值写回缓存，避免恢复结束后的第一次同步
    // 因为缓存滞后而把“未发生变化的滚动位置”误判成新滚动。
    if (restoreStateRef?.value?.active === true) {
      editorScrollTop.value = view.scrollDOM.scrollTop
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
      scrollFollowerToTarget(previewRef.value, targetScrollTop)
    }
  }

  function findElementAtPreviewScroll(scrollTop) {
    const rootElement = previewRef.value
    if (!rootElement) {
      return null
    }
    const result = findPreviewElementAtScrollTop({
      previewLayoutIndex,
      rootElement,
      scrollTop,
    })
    return result.entry?.element ?? null
  }

  /**
   * 解析“当前预览滚动位置应落到编辑区哪里”。
   * 这里单独抽成纯计算 helper，便于在首轮近似滚动后再复算一次，
   * 吃到 CodeMirror 对自动换行离屏行高的延迟测量结果。
   */
  function resolvePreviewToEditorTarget(previewScrollTop) {
    const view = getEditorView()
    const previewElementRoot = previewRef.value
    if (!view || !previewElementRoot) {
      return null
    }

    // 目录高亮使用 5px bounds 容忍“标题已经贴近顶部但 scrollTop 还欠一点点”的情况。
    // 这里同步到编辑区时也保持同一语义，避免大纲点击后因为 1px 级别欠滚而误命中上一块。
    const element = findElementAtPreviewScroll(previewScrollTop + PREVIEW_TO_EDITOR_ACTIVE_BOUNDS)
    if (!(element && element.dataset.lineStart)) {
      return null
    }

    const startLineNumber = +element.dataset.lineStart
    const endLineNumber = +element.dataset.lineEnd
    const elementTop = getElementToTopDistance(element, previewElementRoot)
    const elementScrollOffset = previewScrollTop - elementTop
    const elementHeight = element.getBoundingClientRect().height
    const scrollRatio = clampScrollRatio(elementHeight > 0 ? elementScrollOffset / elementHeight : 0)
    const startLine = view.state.doc.line(startLineNumber)
    const totalLineHeight = getTotalLineHeight(startLineNumber, endLineNumber)
    const block = view.lineBlockAt(startLine.from)

    return {
      targetScrollTop: block.top + (totalLineHeight * scrollRatio),
    }
  }

  /**
   * 预览区驱动编辑区时，需要容忍首轮目标只基于离屏估算高度得到。
   * 自动换行打开后，CodeMirror 往往要等滚动到目标附近，才会把真实行高写回 height map。
   * 因此这里在滚动稳定后，使用同一份预览滚动锚点再复算一到两次，把编辑区校正到真实位置。
   */
  function syncPreviewToEditorWithCorrection({ token, previewScrollTop, correctionCount = 0 }) {
    const view = getEditorView()
    if (!view || !previewRef.value) {
      if (token === previewToEditorSyncToken) {
        scrolling.value.preview = false
      }
      return
    }

    const resolvedTarget = resolvePreviewToEditorTarget(previewScrollTop)
    if (!resolvedTarget) {
      if (token === previewToEditorSyncToken) {
        scrolling.value.preview = false
      }
      return
    }

    const { targetScrollTop } = resolvedTarget

    scrolling.value.preview = true
    checkScrollTop(view.scrollDOM, targetScrollTop, () => {
      if (token !== previewToEditorSyncToken) {
        return
      }

      if (correctionCount < PREVIEW_TO_EDITOR_MAX_CORRECTIONS) {
        const correctedTarget = resolvePreviewToEditorTarget(previewScrollTop)?.targetScrollTop
        if (
          Number.isFinite(correctedTarget)
          && Math.abs(correctedTarget - targetScrollTop) >= PREVIEW_TO_EDITOR_CORRECTION_EPSILON
        ) {
          syncPreviewToEditorWithCorrection({
            token,
            previewScrollTop,
            correctionCount: correctionCount + 1,
          })
          return
        }
      }

      scrolling.value.preview = false
    })
    scrollFollowerToTarget(view.scrollDOM, targetScrollTop)
  }

  function syncPreviewToEditor() {
    const view = getEditorView()
    if (!view || !previewRef.value || scrolling.value.editor) {
      return
    }
    // 文档恢复期间，编辑区滚动位置同样需要保持静止，避免预览区的同步逻辑在恢复尚未完成时
    // 抢先写回编辑区，进而破坏恢复流程设定的滚动锚点。
    if (restoreStateRef?.value?.active === true) {
      return
    }
    const previewScrollTop = previewRef.value.scrollTop
    const token = ++previewToEditorSyncToken
    syncPreviewToEditorWithCorrection({
      token,
      previewScrollTop,
    })
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
