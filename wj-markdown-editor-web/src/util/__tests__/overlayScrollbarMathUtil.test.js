import assert from 'node:assert/strict'

import {
  DEFAULT_MIN_THUMB_WIDTH,
  resolveOverlayThumbMetrics,
  resolveScrollLeftFromThumbDrag,
} from '../overlayScrollbarMathUtil.js'

const { test } = await import('node:test')

test('内容没有横向溢出时不得显示滑块', () => {
  assert.deepEqual(
    resolveOverlayThumbMetrics({ scrollWidth: 400, clientWidth: 400, scrollLeft: 0 }),
    { visible: false, width: 0, offset: 0 },
  )
})

test('溢出量在 1px 容差内时不得显示滑块，避免亚像素抖动导致闪烁', () => {
  assert.deepEqual(
    resolveOverlayThumbMetrics({ scrollWidth: 401, clientWidth: 400, scrollLeft: 0 }),
    { visible: false, width: 0, offset: 0 },
  )
  assert.equal(
    resolveOverlayThumbMetrics({ scrollWidth: 402, clientWidth: 400, scrollLeft: 0 }).visible,
    true,
  )
})

test('滑块宽度必须按可视比例缩放', () => {
  // 可视 400 / 内容 800 → 滑块占一半
  assert.equal(
    resolveOverlayThumbMetrics({ scrollWidth: 800, clientWidth: 400, scrollLeft: 0 }).width,
    200,
  )
  // 可视 400 / 内容 1600 → 滑块占四分之一
  assert.equal(
    resolveOverlayThumbMetrics({ scrollWidth: 1600, clientWidth: 400, scrollLeft: 0 }).width,
    100,
  )
})

test('滑块宽度不得小于下限，否则长列表下滑块会细到抓不住', () => {
  const metrics = resolveOverlayThumbMetrics({ scrollWidth: 100000, clientWidth: 400, scrollLeft: 0 })

  assert.equal(metrics.width, DEFAULT_MIN_THUMB_WIDTH)
})

test('滑块宽度不得超过可视宽度，否则 offset 会变成负数', () => {
  const metrics = resolveOverlayThumbMetrics({
    scrollWidth: 402,
    clientWidth: 400,
    scrollLeft: 0,
    minThumbWidth: 500,
  })

  assert.equal(metrics.width, 400)
  assert.equal(metrics.offset, 0)
})

test('滚动到两端时滑块必须严格贴边', () => {
  const atStart = resolveOverlayThumbMetrics({ scrollWidth: 800, clientWidth: 400, scrollLeft: 0 })
  const atEnd = resolveOverlayThumbMetrics({ scrollWidth: 800, clientWidth: 400, scrollLeft: 400 })

  assert.equal(atStart.offset, 0)
  // 滑块宽 200，可视 400 → 最大偏移 200
  assert.equal(atEnd.offset, 200)
})

test('滚动位置超出范围时偏移必须夹到 [0, 最大偏移]', () => {
  assert.equal(
    resolveOverlayThumbMetrics({ scrollWidth: 800, clientWidth: 400, scrollLeft: -50 }).offset,
    0,
  )
  assert.equal(
    resolveOverlayThumbMetrics({ scrollWidth: 800, clientWidth: 400, scrollLeft: 9999 }).offset,
    200,
  )
})

test('中间位置必须线性映射，不能按 clientWidth 当分母', () => {
  // 滑块 200，可移 200；滚到一半 → 偏移 100
  assert.equal(
    resolveOverlayThumbMetrics({ scrollWidth: 800, clientWidth: 400, scrollLeft: 200 }).offset,
    100,
  )
})

test('拖拽换算必须用滑块可移距离当分母，拖到边缘才对齐', () => {
  // 滑块 200，可移 200；内容可滚 400。拖满 200px → 滚满 400px
  assert.equal(
    resolveScrollLeftFromThumbDrag({
      startScrollLeft: 0,
      pointerDeltaX: 200,
      scrollWidth: 800,
      clientWidth: 400,
      thumbWidth: 200,
    }),
    400,
  )
  // 拖一半 → 滚一半
  assert.equal(
    resolveScrollLeftFromThumbDrag({
      startScrollLeft: 0,
      pointerDeltaX: 100,
      scrollWidth: 800,
      clientWidth: 400,
      thumbWidth: 200,
    }),
    200,
  )
})

test('拖拽换算必须从当前滚动位置继续，并夹到合法范围', () => {
  assert.equal(
    resolveScrollLeftFromThumbDrag({
      startScrollLeft: 200,
      pointerDeltaX: 100,
      scrollWidth: 800,
      clientWidth: 400,
      thumbWidth: 200,
    }),
    400,
  )
  // 反向拖出边界 → 夹到 0
  assert.equal(
    resolveScrollLeftFromThumbDrag({
      startScrollLeft: 50,
      pointerDeltaX: -500,
      scrollWidth: 800,
      clientWidth: 400,
      thumbWidth: 200,
    }),
    0,
  )
  // 正向拖出边界 → 夹到最大可滚距离
  assert.equal(
    resolveScrollLeftFromThumbDrag({
      startScrollLeft: 300,
      pointerDeltaX: 500,
      scrollWidth: 800,
      clientWidth: 400,
      thumbWidth: 200,
    }),
    400,
  )
})

test('滑块宽度等于可视宽度时不得除零', () => {
  assert.equal(
    resolveScrollLeftFromThumbDrag({
      startScrollLeft: 0,
      pointerDeltaX: 100,
      scrollWidth: 800,
      clientWidth: 400,
      thumbWidth: 400,
    }),
    400,
  )
})
