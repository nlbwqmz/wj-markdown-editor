/**
 * 横向滚动容器的滚轮适配工具。
 *
 * 浏览器不会把垂直滚轮映射成横向滚动，所以「用滚轮让标签栏左右滚」必须自己接管。
 * 但接管必须是**有条件**的：有些场景原生已经做对了，再接管就会滚两倍。
 * 这里把判定规则收口成唯一一套，避免每个横向容器各自写一份近似实现。
 */

/** 行模式（deltaMode === 1）下的近似行高。Chromium 几乎不会走到，仅作跨内核兜底。 */
const APPROX_LINE_HEIGHT = 16

/**
 * 计算一次 wheel 事件应该让横向容器滚动多少像素。
 *
 * 返回 null 表示**放行**：调用方不得改 scrollLeft，也不得 preventDefault。
 * 判定顺序就是优先级，每条都对应一种「原生已经做对」的情况：
 * 1. 触控板横向手势（deltaX ≠ 0）→ 原生按 deltaX 精确横滚，接管会滚两倍
 * 2. shift + wheel → Chromium 原生按横滚处理
 * 3. 内容没有横向溢出 → 没有可滚的量，接管只会白吞滚轮
 * 4. deltaMode 归一化：0 = 像素、1 = 行、2 = 页
 *
 * @param {WheelEvent} event
 * @param {{ scrollWidth?: number, clientWidth?: number }} metrics 滚动容器的尺寸
 * @returns {number | null} 应累加到 scrollLeft 的像素值；放行时返回 null
 */
export function resolveHorizontalWheelScrollDelta(event, { scrollWidth, clientWidth } = {}) {
  if (!event) {
    return null
  }

  // 触控板横向手势：deltaX 才是主分量，deltaY 往往只是噪声。
  if (Math.abs(event.deltaX || 0) > 0) {
    return null
  }

  // Chromium 原生支持 shift + wheel 横滚，接管会双倍滚动。
  if (event.shiftKey === true) {
    return null
  }

  if (!(scrollWidth > clientWidth)) {
    return null
  }

  const unit = event.deltaMode === 1
    ? APPROX_LINE_HEIGHT
    : event.deltaMode === 2
      ? clientWidth
      : 1
  const delta = (event.deltaY || 0) * unit

  return delta === 0 ? null : delta
}

/**
 * 把「垂直滚轮 → 横向滚动」绑定到指定元素上，返回解绑函数。
 *
 * 必须用 `{ passive: false }`：只有非 passive 监听才能 `preventDefault()`，
 * 否则浏览器会忽略取消动作，结果变成「我们滚一次 + 原生再滚一次」。
 *
 * @param {HTMLElement | null} element
 * @returns {() => void} 解绑函数；元素无效时返回空函数
 */
export function bindHorizontalWheelScroll(element) {
  if (!element?.addEventListener) {
    return () => {}
  }

  function onWheel(event) {
    const delta = resolveHorizontalWheelScrollDelta(event, element)
    if (delta === null) {
      return
    }
    element.scrollLeft += delta
    event.preventDefault()
  }

  element.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    element.removeEventListener('wheel', onWheel)
  }
}

export default {
  bindHorizontalWheelScroll,
  resolveHorizontalWheelScrollDelta,
}
