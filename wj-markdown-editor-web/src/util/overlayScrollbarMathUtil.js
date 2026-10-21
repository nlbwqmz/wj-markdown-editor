/**
 * overlay 滚动条的尺寸换算工具。
 *
 * 原生 `::-webkit-scrollbar` 在 Chromium 里始终占位，`overflow: overlay` 也早已移除，
 * 所以「不占尺寸、浮在内容上方、无轨道」的滚动条只能自绘。这里收口两件纯计算：
 * 1. 滑块该不该显示、多宽、偏移多少
 * 2. 拖拽滑块时内容应该滚多少
 *
 * 两者都不碰 DOM，便于单测。
 */

/** 滑块最小宽度：长列表下滑块会细到抓不住，必须设下限。 */
export const DEFAULT_MIN_THUMB_WIDTH = 24

/** 内容溢出的容差：亚像素布局会让两个宽度差 1px 以内，不能当成溢出。 */
const OVERFLOW_TOLERANCE_PX = 1

/**
 * 计算 overlay 滑块的可视状态。
 *
 * 三条规则：
 * 1. 只有内容真的溢出才显示（留容差，避免亚像素抖动导致闪烁）
 * 2. 宽度按可视比例缩放并设下限，且不能超过可视宽度
 * 3. 偏移按「内容可滚距离 → 滑块可移距离」线性映射，两端严格对齐
 *
 * @param {{ scrollWidth?: number, clientWidth?: number, scrollLeft?: number, minThumbWidth?: number }} input
 * @returns {{ visible: boolean, width: number, offset: number }} 滑块的可见性、像素宽度与像素偏移
 */
export function resolveOverlayThumbMetrics({
  scrollWidth = 0,
  clientWidth = 0,
  scrollLeft = 0,
  minThumbWidth = DEFAULT_MIN_THUMB_WIDTH,
} = {}) {
  if (!(scrollWidth > clientWidth + OVERFLOW_TOLERANCE_PX) || clientWidth <= 0) {
    return { visible: false, width: 0, offset: 0 }
  }

  const width = Math.min(
    clientWidth,
    Math.max(minThumbWidth, clientWidth * clientWidth / scrollWidth),
  )
  const maxOffset = Math.max(0, clientWidth - width)
  const maxScrollLeft = scrollWidth - clientWidth
  const ratio = maxScrollLeft > 0 ? scrollLeft / maxScrollLeft : 0
  const offset = Math.min(maxOffset, Math.max(0, maxOffset * ratio))

  return { visible: true, width, offset }
}

/**
 * 把「拖拽滑块移动了多少像素」换算成「内容应该滚多少像素」。
 *
 * 分母必须是滑块可移距离而不是 clientWidth：滑块本身有宽度，
 * 用 clientWidth 当分母会在拖到两端时对不齐。
 *
 * @param {{ startScrollLeft?: number, pointerDeltaX?: number, scrollWidth?: number, clientWidth?: number, thumbWidth?: number }} input
 * @returns {number} 目标 scrollLeft，已夹到 [0, scrollWidth - clientWidth]
 */
export function resolveScrollLeftFromThumbDrag({
  startScrollLeft = 0,
  pointerDeltaX = 0,
  scrollWidth = 0,
  clientWidth = 0,
  thumbWidth = 0,
} = {}) {
  const maxOffset = Math.max(1, clientWidth - thumbWidth)
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)
  const nextScrollLeft = startScrollLeft + pointerDeltaX * maxScrollLeft / maxOffset

  return Math.min(maxScrollLeft, Math.max(0, nextScrollLeft))
}

export default {
  DEFAULT_MIN_THUMB_WIDTH,
  resolveOverlayThumbMetrics,
  resolveScrollLeftFromThumbDrag,
}
