import assert from 'node:assert/strict'
import {
  resolvePendingContentUpdateMeta,
  shouldDeferStaleContentSync,
  shouldSuppressNextContentSync,
} from '../contentUpdateMetaUtil.js'

const { test } = await import('node:test')

test('新的内容更新元数据只应消费一次', () => {
  const firstResult = resolvePendingContentUpdateMeta({
    handledToken: 0,
    contentUpdateMeta: {
      token: 3,
      cursorPosition: 18,
      focus: true,
      scrollIntoView: true,
    },
  })

  assert.equal(firstResult.shouldApplySelection, true)
  assert.equal(firstResult.cursorPosition, 18)
  assert.equal(firstResult.focus, true)
  assert.equal(firstResult.scrollIntoView, true)
  assert.equal(firstResult.nextHandledToken, 3)

  const secondResult = resolvePendingContentUpdateMeta({
    handledToken: firstResult.nextHandledToken,
    contentUpdateMeta: {
      token: 3,
      cursorPosition: 18,
      focus: true,
      scrollIntoView: true,
    },
  })

  assert.equal(secondResult.shouldApplySelection, false)
  assert.equal(secondResult.cursorPosition, null)
  assert.equal(secondResult.focus, false)
  assert.equal(secondResult.scrollIntoView, false)
  assert.equal(secondResult.nextHandledToken, 3)
})

test('session 快照回放为 no-op 时，不应继续吞掉下一次真实用户输入', () => {
  assert.equal(shouldSuppressNextContentSync({
    currentContent: '',
    nextContent: '',
    skipContentSync: true,
  }), false)

  assert.equal(shouldSuppressNextContentSync({
    currentContent: '# old',
    nextContent: '# new',
    skipContentSync: true,
  }), true)
})

test('滞后的内容回放不应覆盖编辑器中尚未上浮的新输入', () => {
  assert.equal(shouldDeferStaleContentSync({
    currentContent: '# 当前更近的本地内容',
    nextContent: '# 上一轮已经上浮过的内容',
    lastExposedContent: '# 上一轮已经上浮过的内容',
    hasExplicitSelection: false,
  }), true)
})

test('显式光标定位的内容更新不得被误判成滞后回放', () => {
  assert.equal(shouldDeferStaleContentSync({
    currentContent: '# 当前更近的本地内容',
    nextContent: '# 上一轮已经上浮过的内容',
    lastExposedContent: '# 上一轮已经上浮过的内容',
    hasExplicitSelection: true,
  }), false)
})

test('真正的新外部内容变化不应被误判成滞后回放', () => {
  assert.equal(shouldDeferStaleContentSync({
    currentContent: '# 当前更近的本地内容',
    nextContent: '# 外部新内容',
    lastExposedContent: '# 上一轮已经上浮过的内容',
    hasExplicitSelection: false,
  }), false)
})
