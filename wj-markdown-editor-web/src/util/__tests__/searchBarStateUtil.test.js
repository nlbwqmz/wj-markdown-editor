import assert from 'node:assert/strict'

import {
  createEmptySearchResult,
  getNextSearchCurrent,
  resolveSearchResult,
} from '../searchBarStateUtil.js'

const { test } = await import('node:test')

test('查询条件变化后重建结果时，应默认聚焦到第一条命中', () => {
  const result = resolveSearchResult({
    total: 3,
    previousCurrent: 2,
    preserveCurrent: false,
  })

  assert.deepEqual(result, {
    total: 3,
    current: 1,
  })
})

test('目标 DOM 重绘后重建结果时，应尽量保留当前命中并在越界时收敛', () => {
  const result = resolveSearchResult({
    total: 2,
    previousCurrent: 5,
    preserveCurrent: true,
  })

  assert.deepEqual(result, {
    total: 2,
    current: 2,
  })
})

test('没有搜索结果时，应回到空结果状态', () => {
  const result = resolveSearchResult({
    total: 0,
    previousCurrent: 3,
    preserveCurrent: true,
  })

  assert.deepEqual(result, createEmptySearchResult())
})

test('上下导航应支持循环切换当前命中', () => {
  assert.equal(getNextSearchCurrent({ current: 1, total: 3, direction: 'up' }), 3)
  assert.equal(getNextSearchCurrent({ current: 3, total: 3, direction: 'down' }), 1)
  assert.equal(getNextSearchCurrent({ current: 0, total: 0, direction: 'down' }), 0)
})
