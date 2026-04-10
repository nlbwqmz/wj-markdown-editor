import assert from 'node:assert/strict'

const { test } = await import('node:test')
const {
  isEditorCompositionActive,
  shouldDeferExternalEditorDispatch,
} = await import('../compositionStateUtil.js')

test('当 view.composing 为 true 时应判定为组合输入中', () => {
  assert.equal(isEditorCompositionActive({
    view: {
      composing: true,
      compositionStarted: false,
    },
    fallbackActive: false,
  }), true)
})

test('当 compositionStarted 为 true 时也应判定为组合输入窗口中', () => {
  assert.equal(isEditorCompositionActive({
    view: {
      composing: false,
      compositionStarted: true,
    },
    fallbackActive: false,
  }), true)
})

test('当 view 没有组合输入状态但兜底标记为 true 时仍应视为组合输入中', () => {
  assert.equal(isEditorCompositionActive({
    view: {
      composing: false,
      compositionStarted: false,
    },
    fallbackActive: true,
  }), true)
})

test('当正文和选区都不需要回放时不应挂起外部 dispatch', () => {
  assert.equal(shouldDeferExternalEditorDispatch({
    compositionActive: true,
    currentContent: '# same',
    nextContent: '# same',
    shouldApplySelection: false,
  }), false)
})

test('组合输入期间正文变化应挂起外部 dispatch', () => {
  assert.equal(shouldDeferExternalEditorDispatch({
    compositionActive: true,
    currentContent: '# current',
    nextContent: '# next',
    shouldApplySelection: false,
  }), true)
})

test('组合输入期间显式选区恢复也应挂起外部 dispatch', () => {
  assert.equal(shouldDeferExternalEditorDispatch({
    compositionActive: true,
    currentContent: '# same',
    nextContent: '# same',
    shouldApplySelection: true,
  }), true)
})
