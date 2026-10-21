import assert from 'node:assert/strict'

import {
  bindHorizontalWheelScroll,
  resolveHorizontalWheelScrollDelta,
} from '../horizontalWheelScrollUtil.js'

const { test } = await import('node:test')

/** 构造最小 wheel 事件桩：只保留判定用到的字段。 */
function createWheelEvent(options = {}) {
  return {
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    shiftKey: false,
    ...options,
  }
}

/** 内容宽度大于可视宽度：横向可滚。 */
const OVERFLOWING_METRICS = { scrollWidth: 800, clientWidth: 400 }
/** 内容宽度等于可视宽度：横向不可滚。 */
const FITTED_METRICS = { scrollWidth: 400, clientWidth: 400 }

test('垂直滚轮在内容溢出时必须转成横向滚动像素', () => {
  assert.equal(
    resolveHorizontalWheelScrollDelta(createWheelEvent({ deltaY: 120 }), OVERFLOWING_METRICS),
    120,
  )
})

test('向上滚动必须返回负值，保持与滚轮方向一致', () => {
  assert.equal(
    resolveHorizontalWheelScrollDelta(createWheelEvent({ deltaY: -120 }), OVERFLOWING_METRICS),
    -120,
  )
})

test('触控板横向手势必须放行，否则会与原生横滚叠加成双倍', () => {
  assert.equal(
    resolveHorizontalWheelScrollDelta(
      createWheelEvent({ deltaX: 40, deltaY: 40 }),
      OVERFLOWING_METRICS,
    ),
    null,
  )
})

test('shift + wheel 必须放行，Chromium 原生已按横滚处理', () => {
  assert.equal(
    resolveHorizontalWheelScrollDelta(
      createWheelEvent({ deltaY: 120, shiftKey: true }),
      OVERFLOWING_METRICS,
    ),
    null,
  )
})

test('内容未横向溢出时必须放行，不能白吞滚轮', () => {
  assert.equal(
    resolveHorizontalWheelScrollDelta(createWheelEvent({ deltaY: 120 }), FITTED_METRICS),
    null,
  )
})

test('deltaMode 为行 / 页时必须归一化成像素', () => {
  // 行模式按 16px 行高折算
  assert.equal(
    resolveHorizontalWheelScrollDelta(
      createWheelEvent({ deltaY: 3, deltaMode: 1 }),
      OVERFLOWING_METRICS,
    ),
    48,
  )
  // 页模式按一屏宽度折算
  assert.equal(
    resolveHorizontalWheelScrollDelta(
      createWheelEvent({ deltaY: 1, deltaMode: 2 }),
      OVERFLOWING_METRICS,
    ),
    400,
  )
})

test('deltaY 为 0 时不得接管', () => {
  assert.equal(
    resolveHorizontalWheelScrollDelta(createWheelEvent({ deltaY: 0 }), OVERFLOWING_METRICS),
    null,
  )
  assert.equal(resolveHorizontalWheelScrollDelta(null, OVERFLOWING_METRICS), null)
})

/**
 * 创建可观测监听器注册情况的滚动容器桩。
 */
function createScrollElement({ scrollWidth = 800, clientWidth = 400 } = {}) {
  const listenerList = []
  return {
    scrollWidth,
    clientWidth,
    scrollLeft: 0,
    listenerList,
    addEventListener(type, handler, options) {
      listenerList.push({ type, handler, options })
    },
    removeEventListener(type, handler) {
      const index = listenerList.findIndex(item => item.type === type && item.handler === handler)
      if (index >= 0) {
        listenerList.splice(index, 1)
      }
    },
  }
}

test('绑定必须使用非 passive 监听，否则 preventDefault 会被浏览器忽略', () => {
  const element = createScrollElement()
  const unbind = bindHorizontalWheelScroll(element)

  assert.equal(element.listenerList.length, 1)
  assert.equal(element.listenerList[0].type, 'wheel')
  assert.deepEqual(element.listenerList[0].options, { passive: false })

  unbind()
})

test('接管时必须同时改 scrollLeft 并阻止默认行为，解绑后监听彻底移除', () => {
  const element = createScrollElement()
  const unbind = bindHorizontalWheelScroll(element)
  const { handler } = element.listenerList[0]

  let prevented = false
  handler({
    ...createWheelEvent({ deltaY: 60 }),
    preventDefault() {
      prevented = true
    },
  })

  assert.equal(element.scrollLeft, 60)
  assert.equal(prevented, true)

  unbind()
  assert.equal(element.listenerList.length, 0)
})

test('放行时不得改 scrollLeft，也不得阻止默认行为', () => {
  const element = createScrollElement({ scrollWidth: 400, clientWidth: 400 })
  const unbind = bindHorizontalWheelScroll(element)
  const { handler } = element.listenerList[0]

  let prevented = false
  handler({
    ...createWheelEvent({ deltaY: 60 }),
    preventDefault() {
      prevented = true
    },
  })

  assert.equal(element.scrollLeft, 0)
  assert.equal(prevented, false)

  unbind()
})

test('元素无效时必须返回可安全调用的空解绑函数', () => {
  const unbind = bindHorizontalWheelScroll(null)

  assert.equal(typeof unbind, 'function')
  assert.doesNotThrow(() => unbind())
})
