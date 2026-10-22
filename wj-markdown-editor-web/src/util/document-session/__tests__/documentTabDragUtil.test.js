import assert from 'node:assert/strict'

import {
  createDragSlotList,
  DRAG_DECISION,
  isSameSessionIdList,
  resolveAutoScrollDelta,
  resolveDragOffsetMap,
  resolveDragStartDecision,
  resolveDragTargetIndex,
  resolveReorderSessionIds,
  resolveTabGap,
} from '../documentTabDragUtil.js'

const { test } = await import('node:test')

/**
 * 构造一组等宽槽位。
 *
 * 默认间隙取 9px，与标签栏里「1px 分隔线 + 两侧各 4px」一致。
 */
function createSlots(widthList, gap = 9) {
  let left = 0
  return widthList.map((width, index) => {
    const slot = {
      sessionId: `tab-${index}`,
      left,
      width,
      center: left + width / 2,
    }
    left += width + gap
    return slot
  })
}

function assertCloseTo(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message || '数值不一致'}：expected ${expected}, actual ${actual}`,
  )
}

test('createDragSlotList 按 sessionIds 与实测矩形生成槽位', () => {
  const slots = createDragSlotList({
    sessionIds: ['a', 'b'],
    rectList: [
      { left: 0, width: 100 },
      { left: 109, width: 60 },
    ],
  })

  assert.equal(slots.length, 2)
  assert.deepEqual(slots[0], { sessionId: 'a', left: 0, width: 100, center: 50 })
  assert.deepEqual(slots[1], { sessionId: 'b', left: 109, width: 60, center: 139 })
})

test('createDragSlotList 丢弃非法 sessionId 与非法矩形', () => {
  const slots = createDragSlotList({
    sessionIds: ['a', '', 'c', 'd'],
    rectList: [
      { left: 0, width: 100 },
      { left: 109, width: 100 },
      { left: 218, width: Number.NaN },
      { left: 327, width: 100 },
    ],
  })

  // 空 sessionId 与 NaN 宽度都不参与拖拽几何
  assert.deepEqual(slots.map(slot => slot.sessionId), ['a', 'd'])
})

test('createDragSlotList 对非数组入参返回空列表', () => {
  assert.deepEqual(createDragSlotList(), [])
  assert.deepEqual(createDragSlotList({ sessionIds: null, rectList: [] }), [])
})

test('resolveTabGap 用相邻标签的实测间距反推间隙', () => {
  assert.equal(resolveTabGap({
    rectList: [
      { left: 0, width: 100 },
      { left: 112, width: 100 },
    ],
  }), 12)
})

test('resolveTabGap 在间距不可信时回退到默认值', () => {
  // 只有一项时无法反推
  assert.equal(resolveTabGap({ rectList: [{ left: 0, width: 100 }] }), 9)
  // 标签重叠（间距为负）同样不可信
  assert.equal(resolveTabGap({
    rectList: [
      { left: 100, width: 100 },
      { left: 150, width: 100 },
    ],
  }), 9)
  assert.equal(resolveTabGap({ rectList: null }), 9)
})

test('resolveDragTargetIndex 统计中心点在虚拟中心左侧的槽位数量', () => {
  const slots = createSlots([100, 100, 100])
  // 槽位中心：50 / 159 / 268

  // 落在第一个槽位左侧
  assert.equal(resolveDragTargetIndex({ slots, fromIndex: 1, virtualCenterX: 20 }), 0)
  // 落在第一个与第二个之间
  assert.equal(resolveDragTargetIndex({ slots, fromIndex: 1, virtualCenterX: 100 }), 1)
  // 落在最右侧
  assert.equal(resolveDragTargetIndex({ slots, fromIndex: 1, virtualCenterX: 400 }), 2)
})

test('resolveDragTargetIndex 跳过被拖槽位自身', () => {
  const slots = createSlots([100, 100, 100])

  // 被拖的是 tab-1，它的中心点不参与统计，所以结果只由另外两个决定
  assert.equal(resolveDragTargetIndex({ slots, fromIndex: 1, virtualCenterX: 159 }), 1)
})

test('resolveDragTargetIndex 滞回：向右切换需要多走一段距离', () => {
  const slots = createSlots([100, 100, 100])

  // tab-2 的中心是 268。刚越过一点点时不应该切换
  assert.equal(resolveDragTargetIndex({
    slots,
    fromIndex: 1,
    virtualCenterX: 270,
    previousIndex: 1,
  }), 1)

  // 越过中线超过滞回宽度才真正切换
  assert.equal(resolveDragTargetIndex({
    slots,
    fromIndex: 1,
    virtualCenterX: 275,
    previousIndex: 1,
  }), 2)
})

test('resolveDragTargetIndex 滞回：向左切换同样需要多走一段距离', () => {
  const slots = createSlots([100, 100, 100])

  // 从 2 往左退，刚越过 tab-2 的中心 268 时不切换
  assert.equal(resolveDragTargetIndex({
    slots,
    fromIndex: 1,
    virtualCenterX: 266,
    previousIndex: 2,
  }), 2)

  // 继续往左超过滞回宽度才回到 1
  assert.equal(resolveDragTargetIndex({
    slots,
    fromIndex: 1,
    virtualCenterX: 260,
    previousIndex: 2,
  }), 1)
})

test('resolveDragTargetIndex 跨多格快速拖动不受滞回影响', () => {
  const slots = createSlots([100, 100, 100])

  // 从 0 一口气拖到最右，不能因为滞回少跳一格
  assert.equal(resolveDragTargetIndex({
    slots,
    fromIndex: 0,
    virtualCenterX: 300,
    previousIndex: 0,
  }), 2)
})

test('resolveDragTargetIndex 关闭滞回后直接返回基础结果', () => {
  const slots = createSlots([100, 100, 100])

  assert.equal(resolveDragTargetIndex({
    slots,
    fromIndex: 1,
    virtualCenterX: 270,
    previousIndex: 1,
    hysteresis: 0,
  }), 2)
})

test('resolveDragTargetIndex 对非法入参稳定回退', () => {
  const slots = createSlots([100, 100])

  assert.equal(resolveDragTargetIndex({ slots: [], fromIndex: 0, virtualCenterX: 10 }), 0)
  assert.equal(resolveDragTargetIndex({ slots, fromIndex: 5, virtualCenterX: 10 }), 0)
  assert.equal(resolveDragTargetIndex({ slots, fromIndex: 0, virtualCenterX: Number.NaN }), 0)
})

test('resolveDragOffsetMap 向右移动时中间槽位整体左移', () => {
  const slots = createSlots([100, 100, 100])
  const offsetMap = resolveDragOffsetMap({ slots, fromIndex: 0, targetIndex: 2, gap: 9 })

  // 被拖标签宽度 100 + 间隙 9
  assert.equal(offsetMap.get('tab-1'), -109)
  assert.equal(offsetMap.get('tab-2'), -109)
  assert.equal(offsetMap.has('tab-0'), false)
})

test('resolveDragOffsetMap 向左移动时中间槽位整体右移', () => {
  const slots = createSlots([100, 100, 100])
  const offsetMap = resolveDragOffsetMap({ slots, fromIndex: 2, targetIndex: 0, gap: 9 })

  assert.equal(offsetMap.get('tab-0'), 109)
  assert.equal(offsetMap.get('tab-1'), 109)
  assert.equal(offsetMap.has('tab-2'), false)
})

test('resolveDragOffsetMap 原地不动时不产生任何位移', () => {
  const slots = createSlots([100, 100, 100])

  assert.equal(resolveDragOffsetMap({ slots, fromIndex: 1, targetIndex: 1 }).size, 0)
})

test('resolveDragOffsetMap 对越界下标返回空表', () => {
  const slots = createSlots([100, 100])

  assert.equal(resolveDragOffsetMap({ slots, fromIndex: 0, targetIndex: 5 }).size, 0)
  assert.equal(resolveDragOffsetMap({ slots, fromIndex: -1, targetIndex: 0 }).size, 0)
  assert.equal(resolveDragOffsetMap({ slots: [], fromIndex: 0, targetIndex: 0 }).size, 0)
})

test('resolveAutoScrollDelta 在中间区域不滚动', () => {
  const delta = resolveAutoScrollDelta({ pointerX: 500, viewLeft: 0, viewRight: 1000 })

  assert.equal(delta, 0)
})

test('resolveAutoScrollDelta 越靠近边缘速度越快', () => {
  // 左边缘区是 [0, 32]
  const nearLeft = resolveAutoScrollDelta({ pointerX: 30, viewLeft: 0, viewRight: 1000 })
  const deepLeft = resolveAutoScrollDelta({ pointerX: 0, viewLeft: 0, viewRight: 1000 })

  assert.ok(nearLeft < 0)
  assert.ok(deepLeft < nearLeft)
  assertCloseTo(deepLeft, -18)

  const nearRight = resolveAutoScrollDelta({ pointerX: 970, viewLeft: 0, viewRight: 1000 })
  const deepRight = resolveAutoScrollDelta({ pointerX: 1000, viewLeft: 0, viewRight: 1000 })

  assert.ok(nearRight > 0)
  assert.ok(deepRight > nearRight)
  assertCloseTo(deepRight, 18)
})

test('resolveAutoScrollDelta 对指针跑出容器的情况做钳制', () => {
  // 指针已经在容器外，速度不能继续线性增长
  assertCloseTo(
    resolveAutoScrollDelta({ pointerX: -100, viewLeft: 0, viewRight: 1000 }),
    -18,
  )
  assertCloseTo(
    resolveAutoScrollDelta({ pointerX: 1100, viewLeft: 0, viewRight: 1000 }),
    18,
  )
})

test('resolveAutoScrollDelta 对非法几何返回 0', () => {
  assert.equal(resolveAutoScrollDelta({ pointerX: Number.NaN, viewLeft: 0, viewRight: 1000 }), 0)
  assert.equal(resolveAutoScrollDelta({ pointerX: 10, viewLeft: 1000, viewRight: 0 }), 0)
  assert.equal(resolveAutoScrollDelta({ pointerX: 10, viewLeft: 0, viewRight: 1000, edge: 0 }), 0)
})

test('resolveReorderSessionIds 支持向右与向左移动', () => {
  assert.deepEqual(
    resolveReorderSessionIds({ sessionIds: ['a', 'b', 'c'], fromIndex: 0, targetIndex: 2 }),
    ['b', 'c', 'a'],
  )
  assert.deepEqual(
    resolveReorderSessionIds({ sessionIds: ['a', 'b', 'c'], fromIndex: 2, targetIndex: 0 }),
    ['c', 'a', 'b'],
  )
  assert.deepEqual(
    resolveReorderSessionIds({ sessionIds: ['a', 'b', 'c', 'd'], fromIndex: 1, targetIndex: 2 }),
    ['a', 'c', 'b', 'd'],
  )
})

test('resolveReorderSessionIds 在顺序没变时返回 null', () => {
  // 这是「触发过拖拽但落回原位」的统一出口：调用方拿到 null 就不发命令
  assert.equal(
    resolveReorderSessionIds({ sessionIds: ['a', 'b', 'c'], fromIndex: 1, targetIndex: 1 }),
    null,
  )
})

test('resolveReorderSessionIds 对单标签与越界下标返回 null', () => {
  assert.equal(resolveReorderSessionIds({ sessionIds: ['a'], fromIndex: 0, targetIndex: 0 }), null)
  assert.equal(resolveReorderSessionIds({ sessionIds: ['a', 'b'], fromIndex: 0, targetIndex: 5 }), null)
  assert.equal(resolveReorderSessionIds({ sessionIds: ['a', 'b'], fromIndex: -1, targetIndex: 0 }), null)
  assert.equal(resolveReorderSessionIds({ sessionIds: null, fromIndex: 0, targetIndex: 1 }), null)
})

test('resolveReorderSessionIds 不修改原数组', () => {
  const sessionIds = ['a', 'b', 'c']
  resolveReorderSessionIds({ sessionIds, fromIndex: 0, targetIndex: 2 })

  assert.deepEqual(sessionIds, ['a', 'b', 'c'])
})

test('resolveDragStartDecision 鼠标按最大位移判定阈值', () => {
  assert.equal(resolveDragStartDecision({ deltaX: 3, deltaY: 0 }), DRAG_DECISION.PENDING)
  assert.equal(resolveDragStartDecision({ deltaX: 4, deltaY: 0 }), DRAG_DECISION.START)
  // 斜向抖动：取水平/垂直里更大的那个，不能因为总量超了就触发
  assert.equal(resolveDragStartDecision({ deltaX: 3, deltaY: 3 }), DRAG_DECISION.PENDING)
  assert.equal(resolveDragStartDecision({ deltaX: 3, deltaY: 5 }), DRAG_DECISION.START)
})

test('resolveDragStartDecision 触摸未长按时滑动应让给横向滚动', () => {
  assert.equal(resolveDragStartDecision({
    pointerType: 'touch',
    deltaX: 10,
    deltaY: 0,
    pressDurationMs: 100,
  }), DRAG_DECISION.IGNORE)

  // 位移还很小，继续等待（可能只是按下抖动）
  assert.equal(resolveDragStartDecision({
    pointerType: 'touch',
    deltaX: 3,
    deltaY: 0,
    pressDurationMs: 100,
  }), DRAG_DECISION.PENDING)
})

test('resolveDragStartDecision 触摸长按后按触摸阈值启动', () => {
  assert.equal(resolveDragStartDecision({
    pointerType: 'touch',
    deltaX: 10,
    deltaY: 0,
    pressDurationMs: 300,
  }), DRAG_DECISION.START)

  // 长按了但还没动够，继续等待
  assert.equal(resolveDragStartDecision({
    pointerType: 'touch',
    deltaX: 5,
    deltaY: 0,
    pressDurationMs: 300,
  }), DRAG_DECISION.PENDING)
})

test('isSameSessionIdList 要求长度与顺序完全一致', () => {
  assert.equal(isSameSessionIdList(['a', 'b'], ['a', 'b']), true)
  assert.equal(isSameSessionIdList(['a', 'b'], ['b', 'a']), false)
  assert.equal(isSameSessionIdList(['a'], ['a', 'b']), false)
  assert.equal(isSameSessionIdList(null, ['a']), false)
  assert.equal(isSameSessionIdList(['a'], undefined), false)
})
