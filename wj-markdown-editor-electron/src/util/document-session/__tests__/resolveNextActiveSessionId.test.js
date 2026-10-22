import { describe, expect, it } from 'vitest'

import { resolveNextActiveSessionId } from '../tabCloseMathUtil.js'

/**
 * 批量关闭后活动标签的落点规则。
 *
 * 这套规则必须与「一次只关一个」的结果一致，否则用户会看到
 * 单个关闭与批量关闭停在不同标签上。
 */
describe('resolveNextActiveSessionId', () => {
  it('活动标签不在关闭列表时必须保持不变', () => {
    expect(resolveNextActiveSessionId({
      windowSessionIds: ['a', 'b', 'c', 'd'],
      remainingSessionIds: ['a', 'b'],
      previousActiveSessionId: 'a',
    })).toBe('a')
  })

  it('活动标签是最后一个且被关掉时必须退到最后一个保留标签', () => {
    // 关掉 c、d，活动标签 d（索引 3）→ 落点退到 b
    expect(resolveNextActiveSessionId({
      windowSessionIds: ['a', 'b', 'c', 'd'],
      remainingSessionIds: ['a', 'b'],
      previousActiveSessionId: 'd',
    })).toBe('b')
  })

  it('活动标签是第一个且被关掉时必须取剩余列表的第一个', () => {
    expect(resolveNextActiveSessionId({
      windowSessionIds: ['a', 'b', 'c'],
      remainingSessionIds: ['c'],
      previousActiveSessionId: 'a',
    })).toBe('c')
  })

  it('活动标签在中间被关掉时落点对齐原位置', () => {
    // 原 [a, b, c, d]，活动 b（索引 1），关掉 a、b → 剩余 [c, d]；
    // b 之前保留 0 个，落点就是 c
    expect(resolveNextActiveSessionId({
      windowSessionIds: ['a', 'b', 'c', 'd'],
      remainingSessionIds: ['c', 'd'],
      previousActiveSessionId: 'b',
    })).toBe('c')
  })

  it('活动标签之后的标签被关掉时活动标签不受影响', () => {
    expect(resolveNextActiveSessionId({
      windowSessionIds: ['a', 'b', 'c', 'd'],
      remainingSessionIds: ['a', 'b', 'c'],
      previousActiveSessionId: 'b',
    })).toBe('b')
  })

  it('全部关闭时返回 null，交给关窗口流程', () => {
    expect(resolveNextActiveSessionId({
      windowSessionIds: ['a', 'b'],
      remainingSessionIds: [],
      previousActiveSessionId: 'a',
    })).toBeNull()
  })

  it('没有活动标签时取剩余列表的第一个', () => {
    expect(resolveNextActiveSessionId({
      windowSessionIds: ['a', 'b'],
      remainingSessionIds: ['b'],
      previousActiveSessionId: null,
    })).toBe('b')
  })

  it('活动标签已不在原列表里时也要给出确定的落点', () => {
    expect(resolveNextActiveSessionId({
      windowSessionIds: ['a', 'b'],
      remainingSessionIds: ['b'],
      previousActiveSessionId: 'gone',
    })).toBe('b')
  })
})
