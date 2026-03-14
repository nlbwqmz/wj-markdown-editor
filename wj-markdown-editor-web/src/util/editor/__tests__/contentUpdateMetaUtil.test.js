import assert from 'node:assert/strict'
import {
  resolvePendingContentUpdateMeta,
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
