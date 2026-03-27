import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readEditorViewSource() {
  return fs.readFileSync(new URL('../EditorView.vue', import.meta.url), 'utf8')
}

test('编辑页会把预览位置配置透传给 MarkdownEdit', () => {
  const source = readEditorViewSource()

  assert.match(
    source,
    /<MarkdownEdit[\s\S]*?:preview-position="config\.editor\.previewPosition"/u,
  )
})
