import { onBeforeUnmount, ref } from 'vue'
import {
  createDragSlotList,
  DEFAULT_TAB_GAP,
  DEFAULT_VERTICAL_ESCAPE,
  DRAG_DECISION,
  isSameSessionIdList,
  resolveAutoScrollDelta,
  resolveDragOffsetMap,
  resolveDragStartDecision,
  resolveDragTargetIndex,
  resolveReorderSessionIds,
  resolveTabGap,
} from './document-session/documentTabDragUtil.js'
import { resolveTabScrollLeftToReveal } from './overlayScrollbarMathUtil.js'

/** 拖拽结束后的回弹时长，比让位动画略短。 */
const SETTLE_DURATION_MS = 120

/** 提交后等主进程确认新顺序的兜底时长。 */
const COMMIT_TIMEOUT_MS = 1500

/** 拖拽结束后吞掉本次 click 的有效期。 */
const SUPPRESS_CLICK_MS = 250

/**
 * 文档标签栏的拖拽重排交互。
 *
 * 职责边界很硬：
 * 1. 只处理指针事件、浮层、让位位移与自动横向滚动
 * 2. 不排序标签数组、不改 store、不发 IPC
 * 3. 松手时只把「目标顺序」回调给调用方，由调用方决定发什么命令
 *
 * 为什么用自绘浮层而不是给原标签加 transform：
 * 标签栏是 `overflow-x: auto` 的滚动容器，原标签一旦被拖出容器边界就会被裁掉，
 * 视觉上等于"标签凭空消失"。所以拖拽期间原标签保持不可见，
 * 由一个 `position: fixed` 的克隆节点跟手。
 *
 * 为什么要单独一个 `committing` 阶段：
 * 重排命令是异步的。如果松手就清掉让位位移，标签会先弹回旧顺序、
 * 等快照回来再跳到新顺序，中间有一次肉眼可见的闪回。
 * 所以提交后视觉保持冻结，等快照确认新顺序再瞬清。
 *
 * @param {{
 *   scrollerRef: import('vue').Ref<HTMLElement | null>,
 *   getSessionIds: () => string[],
 *   onCommit: (nextSessionIds: string[]) => unknown,
 *   onError?: () => void,
 * }} options
 */
export function useDocumentTabDrag({
  scrollerRef,
  getSessionIds,
  onCommit,
  onError,
}) {
  const isDragging = ref(false)

  /** @type {null | object} 当前拖拽会话，null 表示空闲。 */
  let dragState = null
  /** 每次真正开始拖拽时递增，用于让回弹定时器认领自己那一次。 */
  let dragTokenSequence = 0
  /** 拖拽结束后要吞掉的那次 click 属于哪个标签。 */
  let suppressClickSessionId = null
  let suppressClickDeadline = 0

  function resolveSessionIdList() {
    const sessionIds = typeof getSessionIds === 'function' ? getSessionIds() : []
    return Array.isArray(sessionIds) ? sessionIds : []
  }

  function cleanupFrame(state) {
    if (state?.frameId) {
      cancelAnimationFrame(state.frameId)
      state.frameId = 0
    }
  }

  function cleanupAutoScroll(state) {
    if (state?.autoScrollFrameId) {
      cancelAnimationFrame(state.autoScrollFrameId)
      state.autoScrollFrameId = 0
    }
    const scroller = scrollerRef.value
    if (scroller) {
      scroller.style.touchAction = ''
    }
  }

  function detachListeners(state) {
    if (!state?.listeners) {
      return
    }
    const { listeners } = state
    window.removeEventListener('pointermove', listeners.pointermove, true)
    window.removeEventListener('pointerup', listeners.pointerup, true)
    window.removeEventListener('pointercancel', listeners.pointercancel, true)
    window.removeEventListener('keydown', listeners.keydown, true)
    window.removeEventListener('contextmenu', listeners.contextmenu, true)
    window.removeEventListener('resize', listeners.resize)
    state.scroller?.removeEventListener('scroll', listeners.scroll)
    state.listeners = null
  }

  function cleanupSettleTimers(state) {
    if (state?.ghostCleanupTimeoutId) {
      clearTimeout(state.ghostCleanupTimeoutId)
      state.ghostCleanupTimeoutId = null
    }
    if (state?.originRestoreTimeoutId) {
      clearTimeout(state.originRestoreTimeoutId)
      state.originRestoreTimeoutId = null
    }
  }

  /**
   * 主动释放指针捕获。
   *
   * 不释放的话，取消后用户继续按住鼠标移动时，
   * 所有 pointer 事件会继续重定向到那个标签，其它元素的 hover 会失灵。
   */
  function releasePointerCapture(state) {
    const originElement = state?.elementMap?.get(state.sessionId)
    if (!originElement || typeof originElement.hasPointerCapture !== 'function') {
      return
    }
    if (originElement.hasPointerCapture(state.pointerId)) {
      originElement.releasePointerCapture(state.pointerId)
    }
  }

  /**
   * 把被按下的标签无动画滚进可视区。
   *
   * 只露出一半的标签被拖拽时，浮层的初始位置会落在可视区外，
   * 抓取点也会和用户按下的位置错开，所以先把位置补齐再采集几何。
   */
  function scrollTabIntoViewIfNeeded({ scroller, element }) {
    const scrollerRect = scroller.getBoundingClientRect()
    const contentLeft = scrollerRect.left + scroller.clientLeft
    const elementRect = element.getBoundingClientRect()

    const targetScrollLeft = resolveTabScrollLeftToReveal({
      tabLeft: elementRect.left - contentLeft + scroller.scrollLeft,
      tabWidth: elementRect.width,
      scrollLeft: scroller.scrollLeft,
      clientWidth: scroller.clientWidth,
    })

    if (targetScrollLeft !== null) {
      scroller.scrollLeft = targetScrollLeft
    }
  }

  /**
   * 创建跟手的浮层。
   *
   * 用克隆节点而不是 Vue 渲染的浮层组件，是因为标签内部的布局
   * （脏点槽、文件名截断、关闭槽宽度）已经全部由现有样式表达，
   * 克隆能保证浮层和真实标签在任何主题下都逐像素一致。
   */
  function createGhostElement(originElement, originRect) {
    const ghost = originElement.cloneNode(true)

    // 浮层只是视觉副本，不能带着可交互语义和测试钩子
    ghost.removeAttribute('data-session-id')
    ghost.removeAttribute('data-active')
    ghost.removeAttribute('data-dirty')
    ghost.removeAttribute('data-testid')
    // 关闭按钮在浮层里点不到，留着只会让用户以为可以点
    ghost.querySelector('[data-testid="document-tab-close"]')?.remove()

    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${originRect.left}px`,
      top: `${originRect.top}px`,
      width: `${originRect.width}px`,
      margin: '0',
      zIndex: '60',
      pointerEvents: 'none',
      opacity: '1',
      transition: 'none',
      transform: 'translate3d(0, 0, 0)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
    })

    document.body.appendChild(ghost)
    return ghost
  }

  function applySlotOffset(element, offset) {
    const normalizedOffset = Number.isFinite(offset) ? offset : 0
    if (Number(element.dataset.dragOffset || 0) === normalizedOffset) {
      return
    }
    element.dataset.dragOffset = String(normalizedOffset)
    element.style.transform = normalizedOffset === 0
      ? ''
      : `translate3d(${normalizedOffset}px, 0, 0)`
  }

  function clearAllSlotOffsets(state) {
    for (const [sessionId, element] of state.elementMap) {
      if (sessionId === state.sessionId) {
        continue
      }
      applySlotOffset(element, 0)
    }
  }

  /**
   * 重算浮层位置、落点与让位位移。
   *
   * 每帧只做「读一次布局 → 写一次样式」，
   * 全程不碰 Vue 响应式，也不查 DOM 选择器（元素引用在开始拖拽时就缓存了）。
   */
  function updateDragFrame() {
    const state = dragState
    if (!state || state.phase !== 'dragging') {
      return
    }

    const scroller = scrollerRef.value
    if (!scroller) {
      return
    }

    const scrollerRect = scroller.getBoundingClientRect()
    const scrollLeft = scroller.scrollLeft

    // 浮层只做水平跟手：垂直方向固定，明确告诉用户"这是排序，不是搬运"
    if (state.ghostElement) {
      const ghostOffsetX = state.lastClientX - state.startClientX
      state.ghostElement.style.transform = `translate3d(${ghostOffsetX}px, 0, 0)`
    }

    // 虚拟中心用内容坐标：自动滚动改变了 scrollLeft，但指针可能没动
    const pointerContentX = state.lastClientX - scrollerRect.left - scroller.clientLeft + scrollLeft
    const virtualCenterX = pointerContentX - state.grabOffsetX + state.tabWidth / 2

    state.targetIndex = resolveDragTargetIndex({
      slots: state.slots,
      fromIndex: state.fromIndex,
      virtualCenterX,
      previousIndex: state.targetIndex,
    })

    const offsetMap = resolveDragOffsetMap({
      slots: state.slots,
      fromIndex: state.fromIndex,
      targetIndex: state.targetIndex,
      gap: state.gap,
    })

    for (const [sessionId, element] of state.elementMap) {
      if (sessionId === state.sessionId) {
        continue
      }
      applySlotOffset(element, offsetMap.get(sessionId) || 0)
    }
  }

  function scheduleFrame() {
    const state = dragState
    if (!state || state.frameId) {
      return
    }
    state.frameId = requestAnimationFrame(() => {
      if (dragState !== state) {
        return
      }
      state.frameId = 0
      updateDragFrame()
    })
  }

  function autoScrollTick() {
    const state = dragState
    if (!state || state.phase !== 'dragging') {
      return
    }
    state.autoScrollFrameId = 0

    const scroller = scrollerRef.value
    if (!scroller) {
      return
    }

    const scrollerRect = scroller.getBoundingClientRect()
    const delta = resolveAutoScrollDelta({
      pointerX: state.lastClientX,
      viewLeft: scrollerRect.left,
      viewRight: scrollerRect.right,
    })

    if (delta === 0) {
      // 指针已经离开边缘区，等下一次 pointermove 再决定要不要继续
      return
    }

    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
    const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, scroller.scrollLeft + delta))
    if (nextScrollLeft === scroller.scrollLeft) {
      // 已经滚到边界，停在这里等用户往回拖
      return
    }

    scroller.scrollLeft = nextScrollLeft
    // 内容滚了但指针没动，落点与让位必须立刻重算
    updateDragFrame()

    state.autoScrollFrameId = requestAnimationFrame(autoScrollTick)
  }

  function scheduleAutoScroll() {
    const state = dragState
    if (!state || state.autoScrollFrameId) {
      return
    }
    state.autoScrollFrameId = requestAnimationFrame(autoScrollTick)
  }

  /**
   * 采集几何并把候选升级成真正的拖拽。
   *
   * @returns {boolean} 采集失败时返回 false，调用方会直接取消本次候选。
   */
  function beginDrag(event) {
    const state = dragState
    const scroller = scrollerRef.value
    if (!state || !scroller) {
      return false
    }

    const sessionIds = resolveSessionIdList()
    if (sessionIds.length < 2) {
      return false
    }

    const elementList = [...scroller.querySelectorAll('[data-session-id]')]
    const originElement = elementList.find(element => element.dataset.sessionId === state.sessionId)
    if (!originElement) {
      return false
    }

    scrollTabIntoViewIfNeeded({ scroller, element: originElement })

    const scrollerRect = scroller.getBoundingClientRect()
    const contentLeft = scrollerRect.left + scroller.clientLeft
    const elementMap = new Map()
    for (const element of elementList) {
      const sessionId = element.dataset.sessionId
      if (sessionId) {
        elementMap.set(sessionId, element)
      }
    }

    const slotSessionIds = []
    const rectList = []
    for (const sessionId of sessionIds) {
      const element = elementMap.get(sessionId)
      if (!element) {
        return false
      }
      const rect = element.getBoundingClientRect()
      slotSessionIds.push(sessionId)
      rectList.push({
        left: rect.left - contentLeft + scroller.scrollLeft,
        width: rect.width,
      })
    }

    const slots = createDragSlotList({ sessionIds: slotSessionIds, rectList })
    if (slots.length !== sessionIds.length) {
      return false
    }

    const fromIndex = sessionIds.indexOf(state.sessionId)
    if (fromIndex < 0) {
      return false
    }

    const originRect = originElement.getBoundingClientRect()

    state.phase = 'dragging'
    state.dragToken = ++dragTokenSequence
    state.fromIndex = fromIndex
    state.elementMap = elementMap
    state.slots = slots
    state.gap = resolveTabGap({ rectList, fallback: DEFAULT_TAB_GAP })
    state.tabWidth = originRect.width
    state.grabOffsetX = event.clientX - originRect.left
    state.barRect = scrollerRect
    state.targetIndex = fromIndex
    state.ghostElement = createGhostElement(originElement, originRect)

    // 原标签让位给浮层：留一个"空位"能让让位动画的语义更清楚。
    // 带上本次拖拽的 token，回弹定时器靠它判断自己是否已经过期。
    originElement.dataset.dragToken = String(state.dragToken)
    originElement.style.opacity = '0'
    isDragging.value = true

    // 指针捕获只在真正拖拽时开启：普通点击完全不受影响，
    // 而拖拽过程中鼠标移出窗口也不会丢事件。
    originElement.setPointerCapture?.(state.pointerId)
    scroller.style.touchAction = 'none'

    return true
  }

  /**
   * 顺序没变 / 被取消：让位平滑归零，浮层回位后销毁。
   *
   * 这里刻意保留 CSS 常驻的 transform 过渡，
   * 因为 DOM 没有重排，过渡就是把偏移收回原位，视觉连续。
   */
  function settleWithoutCommit() {
    const state = dragState
    if (!state) {
      return
    }

    dragState = null
    cleanupFrame(state)
    cleanupAutoScroll(state)
    detachListeners(state)
    clearTimeout(state.commitTimeoutId)
    cleanupSettleTimers(state)

    clearAllSlotOffsets(state)
    releasePointerCapture(state)

    const originElement = state.elementMap.get(state.sessionId)
    const ghost = state.ghostElement
    if (ghost) {
      ghost.style.transition = `transform ${SETTLE_DURATION_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1), opacity ${SETTLE_DURATION_MS}ms linear`
      // 浮层创建时是 `transition: none`。同一个任务里既改 transition 又改 transform
      // 会被浏览器合并成一次样式计算，过渡不会生效，所以先强制一次重排。
      void ghost.offsetWidth
      ghost.style.transform = 'translate3d(0, 0, 0)'
      ghost.style.opacity = '0'
      state.ghostCleanupTimeoutId = setTimeout(() => {
        ghost.remove()
      }, SETTLE_DURATION_MS)
    }
    if (originElement) {
      // 浮层还在飞回来的路上，原标签先别出现，避免双影。
      // 如果 120ms 内又开始了新一次拖拽，token 已经变了，
      // 这次恢复必须作废，否则会把新拖拽的原标签提前显示出来。
      const dragToken = state.dragToken
      state.originRestoreTimeoutId = setTimeout(() => {
        if (originElement.dataset.dragToken !== String(dragToken)) {
          return
        }
        delete originElement.dataset.dragToken
        originElement.style.opacity = ''
      }, SETTLE_DURATION_MS)
    }

    isDragging.value = false
  }

  /**
   * 提交成功：DOM 已经按新顺序重排，必须禁用过渡后瞬清。
   *
   * 如果这时还带着 transform 过渡，元素会从"旧位置的让位偏移"
   * 滑向"新位置的自然位置"，出现一次短暂错位。
   */
  function settleCommit() {
    const state = dragState
    if (!state) {
      return
    }

    dragState = null
    cleanupFrame(state)
    cleanupAutoScroll(state)
    detachListeners(state)
    clearTimeout(state.commitTimeoutId)
    cleanupSettleTimers(state)

    const elementList = [...state.elementMap.values()]
    for (const element of elementList) {
      element.style.transition = 'none'
    }

    clearAllSlotOffsets(state)
    releasePointerCapture(state)

    const originElement = state.elementMap.get(state.sessionId)
    if (originElement) {
      delete originElement.dataset.dragToken
      originElement.style.opacity = ''
    }
    state.ghostElement?.remove()

    // 强制一次样式计算，确保 transition: none 在清 transform 时已经生效
    if (elementList.length > 0) {
      void elementList[0].offsetWidth
    }
    for (const element of elementList) {
      element.style.transition = ''
    }

    isDragging.value = false
  }

  function rollback() {
    const state = dragState
    if (!state || state.phase !== 'committing') {
      return
    }

    // 兜底触发时快照可能已经到位，只是没走到 notifyTabsChanged：
    // 顺序已经是目标顺序就不该再回弹，也不该报错。
    if (isSameSessionIdList(resolveSessionIdList(), state.pendingSessionIds)) {
      settleCommit()
      return
    }

    // 主进程拒绝了这次重排，DOM 仍是旧顺序，按“顺序没变”回弹即可
    settleWithoutCommit()
    if (typeof onError === 'function') {
      onError()
    }
  }

  function cancelDrag() {
    const state = dragState
    if (!state) {
      return
    }

    if (state.phase === 'dragging') {
      settleWithoutCommit()
      return
    }

    dragState = null
    cleanupFrame(state)
    cleanupAutoScroll(state)
    detachListeners(state)
    clearTimeout(state.commitTimeoutId)
    cleanupSettleTimers(state)
    clearAllSlotOffsets(state)
    releasePointerCapture(state)
    state.ghostElement?.remove()

    const originElement = state.elementMap?.get(state.sessionId)
    if (originElement) {
      delete originElement.dataset.dragToken
      originElement.style.opacity = ''
    }

    isDragging.value = false
  }

  function handleWindowPointerMove(event) {
    const state = dragState
    if (!state || event.pointerId !== state.pointerId) {
      return
    }

    state.lastClientX = event.clientX
    state.lastClientY = event.clientY

    if (state.phase === 'candidate') {
      const decision = resolveDragStartDecision({
        pointerType: state.pointerType,
        deltaX: event.clientX - state.startClientX,
        deltaY: event.clientY - state.startClientY,
        pressDurationMs: performance.now() - state.startTime,
      })

      if (decision === DRAG_DECISION.IGNORE) {
        // 未长按的触摸滑动：这是横向滚动，不是拖拽
        cancelDrag()
        return
      }
      if (decision === DRAG_DECISION.PENDING) {
        return
      }
      if (!beginDrag(event)) {
        cancelDrag()
        return
      }
    }

    if (state.phase !== 'dragging') {
      return
    }

    // 垂直方向跑出标签栏太多，视为"想把它拖出去"，本次取消
    if (state.barRect) {
      const escapeDistance = DEFAULT_VERTICAL_ESCAPE
      if (event.clientY < state.barRect.top - escapeDistance
        || event.clientY > state.barRect.bottom + escapeDistance) {
        cancelDrag()
        return
      }
    }

    event.preventDefault()
    scheduleFrame()
    scheduleAutoScroll()
  }

  function handleWindowPointerUp(event) {
    const state = dragState
    if (!state || event.pointerId !== state.pointerId) {
      return
    }

    // 只认主键松开。
    // 鼠标的 pointerId 对所有按键都是同一个，不加这层判断的话，
    // 拖拽中按一下右键就会把 pointerup 当成“左键松手”，拖拽直接提前结束。
    if (event.button !== 0) {
      return
    }

    if (state.phase === 'candidate') {
      // 没越过阈值：交给原有 click 逻辑处理，这里只清理候选态
      dragState = null
      detachListeners(state)
      cleanupAutoScroll(state)
      return
    }

    if (state.phase !== 'dragging') {
      return
    }

    // 触发过拖拽就吞掉本次 click：
    // 否则"拖了一下没换位"会顺手把后台标签激活，完全不符合预期
    suppressClickSessionId = state.sessionId
    suppressClickDeadline = performance.now() + SUPPRESS_CLICK_MS

    const sessionIds = resolveSessionIdList()

    // 拖拽期间标签集合被外部改动（例如快捷键关了后台标签）：
    // 此刻的 fromIndex 已经不可信，直接按“顺序没变”收尾，不发命令。
    const originalSessionIds = state.slots.map(slot => slot.sessionId)
    if (!isSameSessionIdList(sessionIds, originalSessionIds)) {
      settleWithoutCommit()
      return
    }

    const nextSessionIds = resolveReorderSessionIds({
      sessionIds,
      fromIndex: state.fromIndex,
      targetIndex: state.targetIndex,
    })

    if (!nextSessionIds) {
      // 触发过拖拽但顺序实际上没变：不发命令，浮层回弹
      settleWithoutCommit()
      return
    }

    state.phase = 'committing'
    state.pendingSessionIds = nextSessionIds
    detachListeners(state)
    cleanupAutoScroll(state)

    Promise.resolve()
      .then(() => onCommit(nextSessionIds))
      .catch(() => {
        rollback()
      })

    state.commitTimeoutId = setTimeout(() => {
      rollback()
    }, COMMIT_TIMEOUT_MS)
  }

  function handleWindowPointerCancel() {
    cancelDrag()
  }

  function handleWindowKeyDown(event) {
    if (event.key === 'Escape') {
      cancelDrag()
    }
  }

  /**
   * 拖拽中按右键：只屏蔽菜单，不打断拖拽。
   *
   * 早期实现会把右键当成“取消拖拽”，但用户按右键往往是误触，
   * 直接丢掉整个拖拽反而更困惑；同时菜单弹出来会挡住落点，所以仍然拦掉。
   * 注意不能只 preventDefault：Dropdown 的 contextmenu 监听在标签元素上，
   * 必须一并 stopPropagation 才能阻止它弹菜单。
   */
  function handleWindowContextMenu(event) {
    const state = dragState
    if (!state) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  function handleWindowResize() {
    // 缓存的几何全部失效，中途重测容易错位，直接取消更稳
    cancelDrag()
  }

  /**
   * 滚动容器自己动了（滚轮、触控板、自动滚动）：
   * 内容位置变了但指针可能没动，落点与让位必须跟着重算。
   */
  function handleScrollerScroll() {
    scheduleFrame()
  }

  function attachWindowListeners() {
    const state = dragState
    if (!state) {
      return
    }

    const listeners = {
      pointermove: handleWindowPointerMove,
      pointerup: handleWindowPointerUp,
      pointercancel: handleWindowPointerCancel,
      keydown: handleWindowKeyDown,
      contextmenu: handleWindowContextMenu,
      resize: handleWindowResize,
      scroll: handleScrollerScroll,
    }

    // 用捕获阶段：保证在标签自身的 click / contextmenu 之前拿到事件
    window.addEventListener('pointermove', listeners.pointermove, true)
    window.addEventListener('pointerup', listeners.pointerup, true)
    window.addEventListener('pointercancel', listeners.pointercancel, true)
    window.addEventListener('keydown', listeners.keydown, true)
    window.addEventListener('contextmenu', listeners.contextmenu, true)
    window.addEventListener('resize', listeners.resize)

    const scroller = scrollerRef.value
    if (scroller) {
      scroller.addEventListener('scroll', listeners.scroll, { passive: true })
    }
    state.scroller = scroller

    state.listeners = listeners
  }

  /**
   * 标签上的 pointerdown 入口。
   *
   * 这里不做任何"拖拽准备"（不捕获指针、不 preventDefault、不建浮层），
   * 所以普通点击路径和没有拖拽功能时完全一致。
   */
  function handlePointerDown(sessionId, event) {
    if (event.button !== 0 || event.isPrimary === false) {
      return
    }
    if (dragState) {
      return
    }
    // 关闭按钮有自己的点击语义：按下它不该进入拖拽候选
    if (typeof event.target?.closest === 'function'
      && event.target.closest('[data-testid="document-tab-close"]')) {
      return
    }

    const sessionIds = resolveSessionIdList()
    if (sessionIds.length < 2) {
      return
    }

    const fromIndex = sessionIds.indexOf(sessionId)
    if (fromIndex < 0) {
      return
    }

    dragState = {
      phase: 'candidate',
      sessionId,
      fromIndex,
      pointerId: event.pointerId,
      pointerType: event.pointerType || 'mouse',
      dragToken: 0,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTime: performance.now(),
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      elementMap: new Map(),
      slots: [],
      gap: DEFAULT_TAB_GAP,
      tabWidth: 0,
      grabOffsetX: 0,
      barRect: null,
      ghostElement: null,
      targetIndex: fromIndex,
      pendingSessionIds: null,
      frameId: 0,
      autoScrollFrameId: 0,
      commitTimeoutId: null,
      ghostCleanupTimeoutId: null,
      originRestoreTimeoutId: null,
      scroller: null,
      listeners: null,
    }

    attachWindowListeners()
  }

  /**
   * 判断这次 click 是不是拖拽结束后的那一次。
   *
   * 用「sessionId + 时间戳」而不是布尔标志：
   * 如果 pointerup 之后 click 没有派发（例如在窗口外松手），
   * 布尔标志会残留下来，把下一次真实点击吞掉。
   */
  function shouldSuppressClick(sessionId) {
    if (!suppressClickSessionId) {
      return false
    }
    if (performance.now() >= suppressClickDeadline) {
      suppressClickSessionId = null
      return false
    }
    if (sessionId !== suppressClickSessionId) {
      return false
    }
    suppressClickSessionId = null
    return true
  }

  /**
   * 标签列表变化时由调用方通知。
   *
   * 提交阶段：顺序变成目标顺序就清掉拖拽态；
   * 拖拽阶段：集合或顺序被外部改动说明主进程才是真相，直接取消。
   */
  function notifyTabsChanged(sessionIds) {
    const state = dragState
    if (!state) {
      return
    }

    const currentSessionIds = Array.isArray(sessionIds) ? sessionIds : []

    if (state.phase === 'committing') {
      if (isSameSessionIdList(currentSessionIds, state.pendingSessionIds)) {
        settleCommit()
      }
      return
    }

    const originalSessionIds = state.slots.map(slot => slot.sessionId)
    if (originalSessionIds.length > 0 && !isSameSessionIdList(currentSessionIds, originalSessionIds)) {
      cancelDrag()
    }
  }

  onBeforeUnmount(() => {
    cancelDrag()
    dragState = null
  })

  return {
    isDragging,
    handlePointerDown,
    shouldSuppressClick,
    notifyTabsChanged,
    cancelDrag,
  }
}

export default useDocumentTabDrag
