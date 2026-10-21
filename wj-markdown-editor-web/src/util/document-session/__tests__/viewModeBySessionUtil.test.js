import assert from 'node:assert/strict'

import {
  createViewModeBySessionStore,
  isValidViewMode,
  normalizeViewMode,
  pruneViewModeBySession,
  resolveViewModeForSession,
  seedViewModeForSession,
  seedViewModesForTabList,
  setViewModeForSession,
} from '../viewModeBySessionUtil.js'

const { test } = await import('node:test')

test('isValidViewMode 只接受三种合法视图模式', () => {
  assert.equal(isValidViewMode('source'), true)
  assert.equal(isValidViewMode('split'), true)
  assert.equal(isValidViewMode('preview'), true)

  assert.equal(isValidViewMode('editor'), false)
  assert.equal(isValidViewMode(''), false)
  assert.equal(isValidViewMode(null), false)
  assert.equal(isValidViewMode(undefined), false)
})

test('normalizeViewMode 对非法取值应逐级回退', () => {
  assert.equal(normalizeViewMode('source'), 'source')

  // 非法取值回退到显式 fallback
  assert.equal(normalizeViewMode('bogus', 'preview'), 'preview')
  // fallback 本身非法时再回退到 split
  assert.equal(normalizeViewMode('bogus', 'also-bogus'), 'split')
  // 缺省 fallback 是 split
  assert.equal(normalizeViewMode(undefined), 'split')
})

test('resolveViewModeForSession 命中会话记录时返回该会话自己的模式', () => {
  const store = setViewModeForSession(createViewModeBySessionStore(), 'session-a', 'source')
  const nextStore = setViewModeForSession(store, 'session-b', 'preview')

  assert.equal(resolveViewModeForSession(nextStore, 'session-a', 'split'), 'source')
  assert.equal(resolveViewModeForSession(nextStore, 'session-b', 'split'), 'preview')
})

test('resolveViewModeForSession 未记录的新会话一律回落到 startView', () => {
  const store = setViewModeForSession(createViewModeBySessionStore(), 'session-a', 'source')

  // 新标签永远从配置的启动视图开始，不继承当前标签
  assert.equal(resolveViewModeForSession(store, 'session-new', 'split'), 'split')
  assert.equal(resolveViewModeForSession(store, 'session-new', 'preview'), 'preview')
})

test('resolveViewModeForSession 对缺失会话或脏记录应稳定回退', () => {
  const store = setViewModeForSession(createViewModeBySessionStore(), 'session-a', 'source')

  assert.equal(resolveViewModeForSession(store, null, 'split'), 'split')
  assert.equal(resolveViewModeForSession(store, '', 'split'), 'split')
  assert.equal(resolveViewModeForSession(null, 'session-a', 'split'), 'split')
  assert.equal(resolveViewModeForSession(undefined, 'session-a', 'split'), 'split')

  // 记录里出现非法值时不能把非法值透传给布局层
  assert.equal(resolveViewModeForSession({ 'session-a': 'bogus' }, 'session-a', 'split'), 'split')
})

test('setViewModeForSession 写入后返回新字典且不修改原字典', () => {
  const original = setViewModeForSession(createViewModeBySessionStore(), 'session-a', 'source')
  const next = setViewModeForSession(original, 'session-b', 'preview')

  assert.notEqual(next, original)
  assert.equal(original['session-b'], undefined)
  assert.equal(next['session-a'], 'source')
  assert.equal(next['session-b'], 'preview')
})

test('setViewModeForSession 对非法模式与非法会话 id 应原样保留', () => {
  const original = setViewModeForSession(createViewModeBySessionStore(), 'session-a', 'source')

  assert.deepEqual({ ...setViewModeForSession(original, 'session-a', 'bogus') }, { 'session-a': 'source' })
  assert.deepEqual({ ...setViewModeForSession(original, '', 'preview') }, { 'session-a': 'source' })
  assert.deepEqual({ ...setViewModeForSession(original, null, 'preview') }, { 'session-a': 'source' })
})

test('setViewModeForSession 写出的字典不得带有原型链', () => {
  const store = setViewModeForSession(createViewModeBySessionStore(), 'session-a', 'source')

  assert.equal(Object.getPrototypeOf(store), null)
})

test('seedViewModeForSession 只给没有记录的标签写入初始模式', () => {
  const empty = createViewModeBySessionStore()
  const seeded = seedViewModeForSession(empty, 'session-a', 'source')

  assert.notEqual(seeded, empty)
  assert.equal(seeded['session-a'], 'source')
})

test('seedViewModeForSession 绝不覆盖已有记录', () => {
  const existing = setViewModeForSession(createViewModeBySessionStore(), 'session-a', 'preview')

  // 用户已经手动切过这个标签，之后 startView 怎么变都不能动它
  const next = seedViewModeForSession(existing, 'session-a', 'source')

  assert.equal(next, existing)
  assert.equal(next['session-a'], 'preview')
})

test('seedViewModeForSession 对非法入参原样返回', () => {
  const existing = setViewModeForSession(createViewModeBySessionStore(), 'session-a', 'preview')

  assert.equal(seedViewModeForSession(existing, '', 'source'), existing)
  assert.equal(seedViewModeForSession(existing, null, 'source'), existing)
  assert.equal(seedViewModeForSession(existing, 'session-b', 'bogus'), existing)
})

test('seedViewModesForTabList 会在标签首次出现时把当时的 startView 固化下来', () => {
  const tabList = [{ sessionId: 'session-a' }, { sessionId: 'session-b' }]

  // 第一次出现：startView = split
  const first = seedViewModesForTabList(createViewModeBySessionStore(), tabList, 'split')
  assert.deepEqual({ ...first }, { 'session-a': 'split', 'session-b': 'split' })

  // 设置页把 startView 改成 source 后，已有标签不得跟着变
  const second = seedViewModesForTabList(first, tabList, 'source')
  assert.equal(second, first)
  assert.deepEqual({ ...second }, { 'session-a': 'split', 'session-b': 'split' })

  // 之后新开的标签才使用新的 startView
  const third = seedViewModesForTabList(second, [...tabList, { sessionId: 'session-c' }], 'source')
  assert.deepEqual({ ...third }, {
    'session-a': 'split',
    'session-b': 'split',
    'session-c': 'source',
  })
})

test('seedViewModesForTabList 在标签列表非法时应原样返回', () => {
  const existing = setViewModeForSession(createViewModeBySessionStore(), 'session-a', 'source')

  assert.equal(seedViewModesForTabList(existing, null, 'split'), existing)
  assert.equal(seedViewModesForTabList(existing, undefined, 'split'), existing)
})

test('pruneViewModeBySession 只保留仍然打开的标签', () => {
  let store = createViewModeBySessionStore()
  store = setViewModeForSession(store, 'session-a', 'source')
  store = setViewModeForSession(store, 'session-b', 'split')
  store = setViewModeForSession(store, 'session-c', 'preview')

  const next = pruneViewModeBySession(store, ['session-a', 'session-c'], 'session-a')

  assert.deepEqual({ ...next }, { 'session-a': 'source', 'session-c': 'preview' })
})

test('pruneViewModeBySession 必须保留活动会话，即使它还没出现在 tabs 里', () => {
  const store = setViewModeForSession(createViewModeBySessionStore(), 'session-a', 'source')

  // 快照的 tabs 列表可能滞后于 activeSessionId，不能把当前标签的记录删掉
  const next = pruneViewModeBySession(store, [], 'session-a')

  assert.deepEqual({ ...next }, { 'session-a': 'source' })
})

test('pruneViewModeBySession 没有删除项时返回原引用，避免无意义触发更新', () => {
  const store = setViewModeForSession(createViewModeBySessionStore(), 'session-a', 'source')

  const next = pruneViewModeBySession(store, ['session-a', 'session-b'], 'session-a')

  assert.equal(next, store)
})
