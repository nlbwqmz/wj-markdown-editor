import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { test } = await import('node:test')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.resolve(__dirname, '../MarkdownEdit.vue'), 'utf8')

/**
 * 断言多个源码片段按既定顺序出现，避免测试把空白、注释或换行格式写死。
 *
 * @param {string[]} fragmentList
 */
function assertSourceContainsInOrder(fragmentList) {
  let searchStart = 0

  for (const fragment of fragmentList) {
    const fragmentIndex = source.indexOf(fragment, searchStart)

    assert.notEqual(
      fragmentIndex,
      -1,
      `未在预期位置找到源码片段: ${fragment}`,
    )

    searchStart = fragmentIndex + fragment.length
  }
}

test('MarkdownEdit 会在输入期跳过 onSelectionChange 里的关联高亮事务', () => {
  assertSourceContainsInOrder([
    'if (isCompositionActive() === true) {',
    'return',
    'if (update.docChanged === true) {',
    'highlightByEditorCursor(update.state, { previewOnly: true })',
    'return',
  ])
})

test('MarkdownEdit 会在正文上浮 debounce 收敛后再补做一次关联高亮刷新', () => {
  assertSourceContainsInOrder([
    'lastExposedContent.value = view.state.doc.toString()',
    'highlightByEditorCursor(view.state)',
    'emits(\'update:modelValue\', lastExposedContent.value)',
  ])
})

test('MarkdownEdit 会在组合输入稳定后补做关联高亮刷新', () => {
  assertSourceContainsInOrder([
    'onCompositionIdle: () => {',
    'const handledExternalSync = flushPendingExternalSync()',
    'highlightByEditorCursor()',
  ])
})

test('MarkdownEdit 会在 click 入口复用同一套组合输入 guard，再决定是否执行关联高亮', () => {
  assertSourceContainsInOrder([
    'onClick: (view) => {',
    'if (isCompositionActive() === true) {',
    'return',
    'highlightByEditorCursor(view.state)',
  ])
})

test('MarkdownEdit 在 keep-alive 失活时会取消挂起的正文 debounce，避免隐藏实例再补发高亮事务', () => {
  assertSourceContainsInOrder([
    'onDeactivated(() => {',
    'modelSyncScheduler.cancel()',
    'cancelPendingViewScrollRestore()',
  ])
})
