import assert from 'node:assert/strict'

const { test } = await import('node:test')
const gridTemplateColumnsUtilModule = await import('../markdownEditGridTemplateColumnsUtil.js')

const {
  readGridTrackValue,
  replaceGridTrackValue,
  resolveAdaptiveGridTemplateColumns,
  resolveAdaptiveGridTemplateColumnsWithFixedTrack,
} = gridTemplateColumnsUtilModule

test('readGridTrackValue 应返回指定轨道的数值，忽略单位', () => {
  assert.equal(readGridTrackValue('600px 1px 300px 1px 300px', 0), 600)
  assert.equal(readGridTrackValue('600px 1px 300px 1px 300px', 4), 300)
  assert.equal(readGridTrackValue('0.5fr 1px 0.25fr 1px 0.25fr', 2), 0.25)
})

test('readGridTrackValue 应容忍首尾与连续空白', () => {
  assert.equal(readGridTrackValue('  320px   1px  1fr  ', 0), 320)
})

test('readGridTrackValue 解析失败或下标越界时应返回 null', () => {
  assert.equal(readGridTrackValue('', 0), null)
  assert.equal(readGridTrackValue('   ', 0), null)
  assert.equal(readGridTrackValue(undefined, 0), null)
  assert.equal(readGridTrackValue(null, 0), null)
  assert.equal(readGridTrackValue('600px 1px 300px', 3), null)
  assert.equal(readGridTrackValue('600px 1px 300px', -1), null)
  assert.equal(readGridTrackValue('600px 1px 300px', 1.5), null)
  assert.equal(readGridTrackValue('600px 1px 300px', Number.NaN), null)
})

test('readGridTrackValue 遇到无法解析的轨道 token 时应整体返回 null', () => {
  assert.equal(readGridTrackValue('minmax(0, 1fr) 1px 300px', 2), null)
  assert.equal(readGridTrackValue('600px 1px auto', 0), null)
})

test('replaceGridTrackValue 应只替换目标轨道并保留其他轨道原始 token', () => {
  assert.equal(
    replaceGridTrackValue('600px 1px 300px 1px 300px', 4, 360),
    '600px 1px 300px 1px 360px',
  )
  assert.equal(
    replaceGridTrackValue('0.5fr 1px 0.25fr 1px 0.25fr', 4, 300),
    '0.5fr 1px 0.25fr 1px 300px',
  )
  assert.equal(
    replaceGridTrackValue('0.400000fr 1px 1fr', 2, 200),
    '0.400000fr 1px 200px',
  )
})

test('replaceGridTrackValue 应支持显式指定单位并规范化数值格式', () => {
  assert.equal(replaceGridTrackValue('1fr 1px 1fr', 0, 0.5, 'fr'), '0.5fr 1px 1fr')
  assert.equal(replaceGridTrackValue('1fr 1px 1fr', 0, 1 / 3, 'fr'), '0.333333fr 1px 1fr')
  assert.equal(replaceGridTrackValue('600px 1px 300px', 0, 320.5), '320.5px 1px 300px')
})

test('replaceGridTrackValue 解析失败或参数非法时应返回空串', () => {
  assert.equal(replaceGridTrackValue('', 0, 320), '')
  assert.equal(replaceGridTrackValue(undefined, 0, 320), '')
  assert.equal(replaceGridTrackValue('600px 1px 300px', 3, 320), '')
  assert.equal(replaceGridTrackValue('600px 1px 300px', -1, 320), '')
  assert.equal(replaceGridTrackValue('600px 1px 300px', 1.5, 320), '')
  assert.equal(replaceGridTrackValue('600px 1px auto', 0, 320), '')
  assert.equal(replaceGridTrackValue('600px 1px 300px', 0, Number.NaN), '')
  assert.equal(replaceGridTrackValue('600px 1px 300px', 0, Number.POSITIVE_INFINITY), '')
  assert.equal(replaceGridTrackValue('600px 1px 300px', 0, 320, ''), '')
})

test('replaceGridTrackValue 的替换结果应能被 readGridTrackValue 读回', () => {
  const replaced = replaceGridTrackValue('600px 1px 300px 1px 300px', 4, 420)

  assert.equal(readGridTrackValue(replaced, 4), 420)
})

test('resolveAdaptiveGridTemplateColumns 行为保持不变，便于与替换函数组合使用', () => {
  assert.equal(
    resolveAdaptiveGridTemplateColumns('600px 1px 300px 1px 300px'),
    '0.5fr 1px 0.25fr 1px 0.25fr',
  )
  assert.equal(resolveAdaptiveGridTemplateColumns('minmax(0, 1fr) 1px 300px'), '')
})

test('resolveAdaptiveGridTemplateColumnsWithFixedTrack 应让其余内容列 fr 之和保持为 1', () => {
  // 大纲列固定 300px 后，其余两列按彼此比例分配，0.666667 + 0.333333 = 1。
  assert.equal(
    resolveAdaptiveGridTemplateColumnsWithFixedTrack('600px 1px 300px 1px 300px', 4, 300),
    '0.666667fr 1px 0.333333fr 1px 300px',
  )
  // 大纲列位于首个轨道时同样成立。
  assert.equal(
    resolveAdaptiveGridTemplateColumnsWithFixedTrack('600px 1px 300px 1px 300px', 0, 240),
    '240px 1px 0.5fr 1px 0.5fr',
  )
  // 与普通归一化的差异：普通归一化会把大纲列也计入分母，替换后 fr 之和会小于 1。
  assert.equal(
    replaceGridTrackValue(resolveAdaptiveGridTemplateColumns('600px 1px 300px 1px 300px'), 4, 300),
    '0.5fr 1px 0.25fr 1px 300px',
  )
})

test('resolveAdaptiveGridTemplateColumnsWithFixedTrack 解析失败或参数非法时应返回空串', () => {
  assert.equal(resolveAdaptiveGridTemplateColumnsWithFixedTrack('', 0, 320), '')
  assert.equal(resolveAdaptiveGridTemplateColumnsWithFixedTrack('600px 1px 300px', 3, 320), '')
  assert.equal(resolveAdaptiveGridTemplateColumnsWithFixedTrack('600px 1px 300px', -1, 320), '')
  assert.equal(resolveAdaptiveGridTemplateColumnsWithFixedTrack('600px 1px 300px', 1.5, 320), '')
  assert.equal(resolveAdaptiveGridTemplateColumnsWithFixedTrack('600px 1px auto', 2, 320), '')
  assert.equal(resolveAdaptiveGridTemplateColumnsWithFixedTrack('600px 1px 300px', 2, Number.NaN), '')
  assert.equal(resolveAdaptiveGridTemplateColumnsWithFixedTrack('600px 1px 300px', 2, 320, ''), '')
})
