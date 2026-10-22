/**
 * 文档标签拖拽的纯计算工具。
 *
 * 拖拽交互里真正需要"判断"的部分全部收在这里：
 * 1. 什么时候算开始拖拽（鼠标阈值 / 触摸长按）
 * 2. 指针当前应该插到第几个位置（含滞回，避免在中线附近抖动）
 * 3. 其它标签该往哪边让位、让多少
 * 4. 贴边自动横向滚动的速度
 * 5. 松手后要不要真的发重排命令
 *
 * 这些函数都不碰 DOM，也不碰 Vue 响应式，
 * 因此可以直接用 node:test 覆盖所有边界分支。
 */

/** 标签之间的视觉间隙：分隔线 1px + 两侧各 4px 外边距。 */
export const DEFAULT_TAB_GAP = 9

/** 鼠标拖拽启动阈值：低于这个距离按点击处理。 */
export const DEFAULT_MOUSE_DRAG_THRESHOLD = 4

/** 触摸/触控笔需要先长按这么久才允许拖拽，否则手势让给横向滚动。 */
export const DEFAULT_TOUCH_LONG_PRESS_MS = 250

/** 触摸/触控笔的移动阈值，手指抖动比鼠标大。 */
export const DEFAULT_TOUCH_DRAG_THRESHOLD = 8

/** 指针进入滚动容器左右这么宽的边缘区后开始自动横向滚动。 */
export const DEFAULT_AUTO_SCROLL_EDGE = 32

/** 自动滚动的最小/最大速度（像素每帧）。 */
export const DEFAULT_AUTO_SCROLL_MIN_SPEED = 4
export const DEFAULT_AUTO_SCROLL_MAX_SPEED = 18

/**
 * 滞回宽度。
 *
 * 落点判定用的是"虚拟中线"模型，指针停在中线附近时，
 * 一两像素的抖动就会让插入位置来回跳、让位动画反复反向。
 * 所以切换位置需要多走这一段距离，退回原位同样需要。
 */
export const DEFAULT_HYSTERESIS = 4

/** 指针垂直方向离开标签栏超过这个距离，视为"想把它拖出去"，取消本次拖拽。 */
export const DEFAULT_VERTICAL_ESCAPE = 24

/** 拖拽启动判定结果。 */
export const DRAG_DECISION = {
  /** 还在阈值内，继续等待。 */
  PENDING: 'pending',
  /** 可以开始拖拽了。 */
  START: 'start',
  /** 手势不属于拖拽（例如未长按的触摸滑动），取消候选。 */
  IGNORE: 'ignore',
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

/**
 * 把拖拽开始时量到的几何信息归一成槽位列表。
 *
 * `rectList` 必须是内容坐标系下的值（已经加上 scrollLeft），
 * 这样拖拽过程中重新换算时不需要再区分滚动前后。
 *
 * @param {{
 *   sessionIds?: string[],
 *   rectList?: Array<{ left?: number, width?: number }>,
 * }} input
 * @returns {Array<{ sessionId: string, left: number, width: number, center: number }>} 归一化后的槽位列表，非法项已丢弃
 */
export function createDragSlotList({ sessionIds, rectList } = {}) {
  if (!Array.isArray(sessionIds) || !Array.isArray(rectList)) {
    return []
  }

  const slotList = []
  const length = Math.min(sessionIds.length, rectList.length)

  for (let i = 0; i < length; i++) {
    const sessionId = sessionIds[i]
    const rect = rectList[i]
    if (typeof sessionId !== 'string' || !sessionId) {
      continue
    }
    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.width)) {
      continue
    }
    slotList.push({
      sessionId,
      left: rect.left,
      width: rect.width,
      center: rect.left + rect.width / 2,
    })
  }

  return slotList
}

/**
 * 统计"移除被拖槽位后"的插入下标。
 *
 * 规则：所有非拖拽槽位里，中心点落在虚拟中心左侧的个数，
 * 就是被拖项应该插入的位置。
 */
function countInsertIndex({ slots, fromIndex, virtualCenterX }) {
  let index = 0

  for (let i = 0; i < slots.length; i++) {
    if (i === fromIndex) {
      continue
    }
    if (slots[i].center < virtualCenterX) {
      index++
    }
  }

  return index
}

/**
 * 从实测几何里反推标签之间的实际间隙。
 *
 * 分隔线是独立 DOM 元素（1px + 两侧各 4px 外边距），
 * 但主题或字体变化可能让实际间距和常量不一致，
 * 所以优先用「相邻标签左边缘差 − 前一个标签宽度」反推。
 *
 * @param {{
 *   rectList?: Array<{ left?: number, width?: number }>,
 *   fallback?: number,
 * }} input
 * @returns {number} 相邻标签之间的实际间隙（像素）
 */
export function resolveTabGap({ rectList, fallback = DEFAULT_TAB_GAP } = {}) {
  if (!Array.isArray(rectList) || rectList.length < 2) {
    return fallback
  }

  for (let i = 1; i < rectList.length; i++) {
    const previousRect = rectList[i - 1]
    const currentRect = rectList[i]
    if (!previousRect || !currentRect) {
      continue
    }
    if (!Number.isFinite(previousRect.left) || !Number.isFinite(previousRect.width)) {
      continue
    }
    if (!Number.isFinite(currentRect.left)) {
      continue
    }
    const gap = currentRect.left - (previousRect.left + previousRect.width)
    if (gap > 0) {
      return gap
    }
  }

  return fallback
}

/**
 * 计算当前指针位置对应的插入下标（带滞回）。
 *
 * 滞回只对"相邻切换"生效：
 * - 跨多格快速拖动时直接取基础结果，避免快速拖动少跳一格
 * - 相邻切换时，虚拟中心要多走 `hysteresis` 才允许生效
 *
 * @param {{
 *   slots?: Array<{ center?: number }>,
 *   fromIndex?: number,
 *   virtualCenterX?: number,
 *   previousIndex?: number | null,
 *   hysteresis?: number,
 * }} input
 * @returns {number} 插入下标，范围 0..slots.length - 1
 */
export function resolveDragTargetIndex({
  slots,
  fromIndex,
  virtualCenterX,
  previousIndex = null,
  hysteresis = DEFAULT_HYSTERESIS,
} = {}) {
  if (!Array.isArray(slots) || slots.length === 0) {
    return 0
  }
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= slots.length) {
    return 0
  }
  if (!Number.isFinite(virtualCenterX)) {
    return fromIndex
  }

  const baseIndex = countInsertIndex({ slots, fromIndex, virtualCenterX })

  // 没有上一帧、不需要滞回、或者位置本来就没变，直接用基础结果
  if (!Number.isInteger(previousIndex) || hysteresis <= 0 || baseIndex === previousIndex) {
    return baseIndex
  }

  // 跨多格的快速拖动不受滞回影响，否则会明显"跟不上手"
  if (Math.abs(baseIndex - previousIndex) !== 1) {
    return baseIndex
  }

  // 把虚拟中心朝"回退方向"偏移一段再算一次：
  // 偏移后仍指向新位置，才说明真的越过了中线足够远。
  const direction = baseIndex > previousIndex ? 1 : -1
  const biasedIndex = countInsertIndex({
    slots,
    fromIndex,
    virtualCenterX: virtualCenterX - direction * hysteresis,
  })

  return biasedIndex === previousIndex ? previousIndex : biasedIndex
}

/**
 * 计算其它标签的让位位移。
 *
 * 采用"移除-插入"模型：
 * - 被拖项向右移动时，它右边到目标位置之间的标签整体左移
 * - 被拖项向左移动时，目标位置到它左边之间的标签整体右移
 * - 位移量统一是「被拖标签宽度 + 标签间隙」
 *
 * 分隔线在拖拽期间是隐藏的（保留占位），
 * 所以让位只需要按标签本身计算，不需要再处理分隔线的归属。
 *
 * @param {{
 *   slots?: Array<{ sessionId?: string, width?: number }>,
 *   fromIndex?: number,
 *   targetIndex?: number,
 *   gap?: number,
 * }} input
 * @returns {Map<string, number>} sessionId → 水平位移（像素）
 */
export function resolveDragOffsetMap({
  slots,
  fromIndex,
  targetIndex,
  gap = DEFAULT_TAB_GAP,
} = {}) {
  const offsetMap = new Map()

  if (!Array.isArray(slots) || slots.length === 0) {
    return offsetMap
  }
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= slots.length) {
    return offsetMap
  }
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= slots.length) {
    return offsetMap
  }
  if (targetIndex === fromIndex) {
    return offsetMap
  }

  const dragWidth = slots[fromIndex].width + gap

  if (targetIndex > fromIndex) {
    for (let i = fromIndex + 1; i <= targetIndex; i++) {
      offsetMap.set(slots[i].sessionId, -dragWidth)
    }
    return offsetMap
  }

  for (let i = targetIndex; i <= fromIndex - 1; i++) {
    offsetMap.set(slots[i].sessionId, dragWidth)
  }

  return offsetMap
}

/**
 * 计算贴边自动横向滚动的速度。
 *
 * 返回值是"每帧滚动多少像素"，符号表示方向：
 * 负数向左滚、正数向右滚、0 表示不需要滚。
 * 越靠近边缘滚得越快，避免在边缘区里"卡住不动"。
 *
 * @param {{
 *   pointerX?: number,
 *   viewLeft?: number,
 *   viewRight?: number,
 *   edge?: number,
 *   minSpeed?: number,
 *   maxSpeed?: number,
 * }} input
 * @returns {number} 每帧滚动像素数，符号表示方向
 */
export function resolveAutoScrollDelta({
  pointerX,
  viewLeft,
  viewRight,
  edge = DEFAULT_AUTO_SCROLL_EDGE,
  minSpeed = DEFAULT_AUTO_SCROLL_MIN_SPEED,
  maxSpeed = DEFAULT_AUTO_SCROLL_MAX_SPEED,
} = {}) {
  if (!Number.isFinite(pointerX) || !Number.isFinite(viewLeft) || !Number.isFinite(viewRight)) {
    return 0
  }
  if (viewRight <= viewLeft || edge <= 0 || maxSpeed <= 0) {
    return 0
  }

  if (pointerX < viewLeft + edge) {
    const depth = clamp01((viewLeft + edge - pointerX) / edge)
    return -(minSpeed + (maxSpeed - minSpeed) * depth)
  }

  if (pointerX > viewRight - edge) {
    const depth = clamp01((pointerX - (viewRight - edge)) / edge)
    return minSpeed + (maxSpeed - minSpeed) * depth
  }

  return 0
}

/**
 * 计算松手后的标签顺序。
 *
 * 返回 `null` 表示"顺序没有变化，不需要发命令"：
 * 这是拖拽触发过、但最终落回原位时的统一出口。
 *
 * @param {{
 *   sessionIds?: string[],
 *   fromIndex?: number,
 *   targetIndex?: number,
 * }} input
 * @returns {string[] | null} 新顺序；顺序未变或参数非法时返回 null
 */
export function resolveReorderSessionIds({ sessionIds, fromIndex, targetIndex } = {}) {
  if (!Array.isArray(sessionIds) || sessionIds.length < 2) {
    return null
  }
  if (!Number.isInteger(fromIndex) || !Number.isInteger(targetIndex)) {
    return null
  }
  if (fromIndex < 0 || fromIndex >= sessionIds.length) {
    return null
  }
  if (targetIndex < 0 || targetIndex >= sessionIds.length) {
    return null
  }
  if (fromIndex === targetIndex) {
    return null
  }

  const nextSessionIds = [...sessionIds]
  const [movedSessionId] = nextSessionIds.splice(fromIndex, 1)
  nextSessionIds.splice(targetIndex, 0, movedSessionId)

  return nextSessionIds
}

/**
 * 判断一次指针移动是否应该把候选升级成拖拽。
 *
 * 鼠标用「水平/垂直位移取较大值」判定：斜向轻微抖动不该触发拖拽。
 * 触摸/触控笔必须先长按：没长按就开始滑动，说明用户想横向滚动标签栏。
 *
 * @param {{
 *   pointerType?: string,
 *   deltaX?: number,
 *   deltaY?: number,
 *   pressDurationMs?: number,
 *   mouseThreshold?: number,
 *   touchThreshold?: number,
 *   longPressMs?: number,
 * }} input
 * @returns {'pending' | 'start' | 'ignore'} 本次指针移动的处理结论
 */
export function resolveDragStartDecision({
  pointerType = 'mouse',
  deltaX = 0,
  deltaY = 0,
  pressDurationMs = 0,
  mouseThreshold = DEFAULT_MOUSE_DRAG_THRESHOLD,
  touchThreshold = DEFAULT_TOUCH_DRAG_THRESHOLD,
  longPressMs = DEFAULT_TOUCH_LONG_PRESS_MS,
} = {}) {
  const distance = Math.hypot(deltaX, deltaY)

  if (pointerType === 'touch' || pointerType === 'pen') {
    if (pressDurationMs < longPressMs) {
      return distance >= touchThreshold ? DRAG_DECISION.IGNORE : DRAG_DECISION.PENDING
    }
    return distance >= touchThreshold ? DRAG_DECISION.START : DRAG_DECISION.PENDING
  }

  return Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= mouseThreshold
    ? DRAG_DECISION.START
    : DRAG_DECISION.PENDING
}

/**
 * 判断两个 sessionId 序列是否完全一致。
 *
 * 提交重排后要用它确认"主进程回来的顺序就是我要的顺序"，
 * 只有顺序真的变了才清掉拖拽态，否则会闪回。
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean} 两个序列长度与顺序完全一致时为 true
 */
export function isSameSessionIdList(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return false
  }
  if (a.length !== b.length) {
    return false
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }

  return true
}

export default {
  DEFAULT_TAB_GAP,
  DEFAULT_MOUSE_DRAG_THRESHOLD,
  DEFAULT_TOUCH_LONG_PRESS_MS,
  DEFAULT_TOUCH_DRAG_THRESHOLD,
  DEFAULT_AUTO_SCROLL_EDGE,
  DEFAULT_AUTO_SCROLL_MIN_SPEED,
  DEFAULT_AUTO_SCROLL_MAX_SPEED,
  DEFAULT_HYSTERESIS,
  DEFAULT_VERTICAL_ESCAPE,
  DRAG_DECISION,
  createDragSlotList,
  resolveTabGap,
  resolveDragTargetIndex,
  resolveDragOffsetMap,
  resolveAutoScrollDelta,
  resolveReorderSessionIds,
  resolveDragStartDecision,
  isSameSessionIdList,
}
