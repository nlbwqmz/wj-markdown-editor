import assert from 'node:assert/strict'
import {
  normalizeIndex,
  pickTabBaseline,
  resolveTargetTabBySteps,
} from '../tabNavigationUtil.js'

const { test } = await import('node:test')

const sessionIdList = ['s1', 's2', 's3']

test('normalizeIndex 必须把负数下标环绕到合法区间', () => {
  assert.equal(normalizeIndex(0, 3), 0)
  assert.equal(normalizeIndex(3, 3), 0)
  assert.equal(normalizeIndex(-1, 3), 2)
  assert.equal(normalizeIndex(-4, 3), 2)
  assert.equal(normalizeIndex(5, 3), 2)
})

test('normalizeIndex 在长度非法时必须返回 -1，不能返回 NaN', () => {
  assert.equal(normalizeIndex(2, 0), -1)
  assert.equal(normalizeIndex(2, -1), -1)
  assert.equal(normalizeIndex(2, 1.5), -1)
  assert.equal(normalizeIndex(1.5, 3), -1)
})

test('resolveTargetTabBySteps 必须支持正负位移与两端回绕', () => {
  assert.equal(
    resolveTargetTabBySteps({ sessionIdList, activeSessionId: 's1', steps: 1 }),
    's2',
  )
  assert.equal(
    resolveTargetTabBySteps({ sessionIdList, activeSessionId: 's2', steps: -1 }),
    's1',
  )
  // 最后一个的“下一个”回到第一个
  assert.equal(
    resolveTargetTabBySteps({ sessionIdList, activeSessionId: 's3', steps: 1 }),
    's1',
  )
  // 第一个的“上一个”回到最后一个
  assert.equal(
    resolveTargetTabBySteps({ sessionIdList, activeSessionId: 's1', steps: -1 }),
    's3',
  )
})

test('resolveTargetTabBySteps 必须支持位移合并后一次算到终点', () => {
  // 连按 5 次“下一个”在 3 个标签里等价于 +2
  assert.equal(
    resolveTargetTabBySteps({ sessionIdList, activeSessionId: 's1', steps: 5 }),
    's3',
  )
  assert.equal(
    resolveTargetTabBySteps({ sessionIdList, activeSessionId: 's1', steps: -5 }),
    's2',
  )
})

test('resolveTargetTabBySteps 在无法定位时必须返回 null', () => {
  assert.equal(resolveTargetTabBySteps({ sessionIdList: ['s1'], activeSessionId: 's1', steps: 1 }), null)
  assert.equal(resolveTargetTabBySteps({ sessionIdList: [], activeSessionId: null, steps: 1 }), null)
  assert.equal(resolveTargetTabBySteps({ sessionIdList, activeSessionId: 'missing', steps: 1 }), null)
  assert.equal(resolveTargetTabBySteps({ sessionIdList, activeSessionId: null, steps: 1 }), null)
  assert.equal(resolveTargetTabBySteps({ sessionIdList, activeSessionId: 's1', steps: 0 }), null)
  assert.equal(resolveTargetTabBySteps({ sessionIdList, activeSessionId: 's1', steps: 1.5 }), null)
  assert.equal(resolveTargetTabBySteps(), null)
})

test('pickTabBaseline 必须过滤非法标签项并保留顺序', () => {
  const baseline = pickTabBaseline({
    tabs: [
      { sessionId: 's1' },
      { sessionId: '' },
      { sessionId: null },
      {},
      { sessionId: 's2' },
    ],
    activeSessionId: 's2',
  })

  assert.deepEqual(baseline, {
    sessionIdList: ['s1', 's2'],
    activeSessionId: 's2',
  })
})

test('pickTabBaseline 在缺少 tabs 或列表为空时必须返回 null', () => {
  assert.equal(pickTabBaseline(null), null)
  assert.equal(pickTabBaseline({}), null)
  assert.equal(pickTabBaseline({ tabs: [] }), null)
  assert.equal(pickTabBaseline({ tabs: [{ sessionId: '' }] }), null)
})

test('pickTabBaseline 必须为单标签旧结构回退到 sessionId', () => {
  const baseline = pickTabBaseline({
    tabs: [{ sessionId: 's1' }],
    sessionId: 's1',
  })

  assert.deepEqual(baseline, {
    sessionIdList: ['s1'],
    activeSessionId: 's1',
  })
})
