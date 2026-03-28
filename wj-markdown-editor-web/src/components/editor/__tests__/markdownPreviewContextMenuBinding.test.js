import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readMarkdownPreviewSource() {
  return fs.readFileSync(new URL('../MarkdownPreview.vue', import.meta.url), 'utf8')
}

function readMarkdownEditSource() {
  return fs.readFileSync(new URL('../MarkdownEdit.vue', import.meta.url), 'utf8')
}

test('MarkdownPreview 会把资源右键事件升级为统一的 previewContextmenu 事件', () => {
  const source = readMarkdownPreviewSource()

  assert.match(
    source,
    /defineEmits\(\[\s*'refreshComplete',\s*'anchorChange',\s*'previewContextmenu',\s*'assetOpen'\s*\]\)/u,
  )
  assert.match(source, /createPreviewResourceContext\(assetInfo\)/u)
})

test('MarkdownEdit 会声明统一的 previewContextmenu 事件并中继给宿主', () => {
  const source = readMarkdownEditSource()

  assert.match(
    source,
    /defineEmits\(\[\s*'update:modelValue',\s*'upload',\s*'save',\s*'anchorChange',\s*'previewContextmenu',\s*'assetOpen'\s*\]\)/u,
  )
  assert.match(source, /function onPreviewContextmenu\(context\) \{[\s\S]*?emits\('previewContextmenu', context\)/u)
})

test('MarkdownEdit 模板会监听 MarkdownPreview 的 preview-contextmenu 事件', () => {
  const source = readMarkdownEditSource()

  assert.match(source, /@preview-contextmenu="onPreviewContextmenu"/u)
})
