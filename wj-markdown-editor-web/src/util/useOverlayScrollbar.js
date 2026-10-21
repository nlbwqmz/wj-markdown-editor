import { computed, ref, watch } from 'vue'

import {
  DEFAULT_MIN_THUMB_WIDTH,
  resolveOverlayThumbMetrics,
  resolveScrollLeftFromThumbDrag,
} from './overlayScrollbarMathUtil.js'

/**
 * 给横向（或纵向）滚动容器挂一个自绘 overlay 滚动条。
 *
 * 为什么不用原生滚动条：`::-webkit-scrollbar` 在 Chromium 里始终占位，
 * `overflow: overlay` 也已被移除，做不到「不占尺寸、浮在内容上方、无轨道」。
 *
 * 这个 composable 只负责状态与事件，所有尺寸换算都交给 `overlayScrollbarMathUtil`：
 * - 滚动容器自己保留真实滚动能力（滚轮、触控板、键盘都照旧）
 * - 滑块只是它的镜像，既不参与布局，也不改变任何滚动语义
 *
 * @param {{
 *   scrollerRef: import('vue').Ref<HTMLElement | null>,
 *   thumbRef: import('vue').Ref<HTMLElement | null>,
 *   minThumbWidth?: number,
 * }} options
 */
export function useOverlayScrollbar({
  scrollerRef,
  thumbRef,
  minThumbWidth = DEFAULT_MIN_THUMB_WIDTH,
}) {
  const metrics = ref({ visible: false, width: 0, offset: 0 })
  const isPointerInside = ref(false)
  const isDragging = ref(false)

  /** 重新测量滚动容器。标签增删、窗口尺寸变化、滚动时都要调用。 */
  function refresh() {
    const element = scrollerRef.value
    if (!element) {
      metrics.value = { visible: false, width: 0, offset: 0 }
      return
    }

    metrics.value = resolveOverlayThumbMetrics({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollLeft: element.scrollLeft,
      minThumbWidth,
    })
  }

  // 滚动容器可能晚于挂载才出现（外层有 v-if），所以监听 ref 而不是在 onMounted 里绑一次。
  watch(scrollerRef, (element, _previousElement, onCleanup) => {
    if (!element) {
      return
    }

    const handleScroll = () => refresh()
    element.addEventListener('scroll', handleScroll, { passive: true })

    // ResizeObserver 只观察 border-box，scrollWidth 变化它感知不到，
    // 所以标签增删还要靠调用方额外 refresh()。
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => refresh())
      : null
    resizeObserver?.observe(element)

    refresh()

    onCleanup(() => {
      element.removeEventListener('scroll', handleScroll)
      resizeObserver?.disconnect()
    })
  })

  // 只有宽度不够时才渲染滑块
  const thumbVisible = computed(() => metrics.value.visible)
  // 鼠标在标签栏内、或正在拖拽时显示；拖拽中鼠标移出也不能消失
  const thumbActive = computed(() => isDragging.value || isPointerInside.value)
  const thumbStyle = computed(() => ({
    width: `${metrics.value.width}px`,
    transform: `translateX(${metrics.value.offset}px)`,
  }))

  function onPointerEnter() {
    isPointerInside.value = true
  }

  function onPointerLeave() {
    isPointerInside.value = false
  }

  function onThumbPointerDown(event) {
    const scroller = scrollerRef.value
    const thumb = thumbRef.value
    if (!scroller || !thumb || event.button !== 0) {
      return
    }

    // 阻止拖拽时选中标签文字
    event.preventDefault()
    isDragging.value = true

    const startX = event.clientX
    const startScrollLeft = scroller.scrollLeft
    const thumbWidth = metrics.value.width
    const pointerId = event.pointerId

    // pointer capture 把后续 move / up 都收在滑块上：
    // 不用挂全局监听，鼠标拖出标签栏也不会丢事件。
    thumb.setPointerCapture?.(pointerId)

    function handlePointerMove(moveEvent) {
      scroller.scrollLeft = resolveScrollLeftFromThumbDrag({
        startScrollLeft,
        pointerDeltaX: moveEvent.clientX - startX,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
        thumbWidth,
      })
      refresh()
    }

    function handlePointerUp() {
      isDragging.value = false
      thumb.releasePointerCapture?.(pointerId)
      thumb.removeEventListener('pointermove', handlePointerMove)
      thumb.removeEventListener('pointerup', handlePointerUp)
      thumb.removeEventListener('pointercancel', handlePointerUp)
    }

    thumb.addEventListener('pointermove', handlePointerMove)
    thumb.addEventListener('pointerup', handlePointerUp)
    thumb.addEventListener('pointercancel', handlePointerUp)
  }

  return {
    thumbVisible,
    thumbActive,
    thumbStyle,
    refresh,
    onPointerEnter,
    onPointerLeave,
    onThumbPointerDown,
  }
}

export default useOverlayScrollbar
