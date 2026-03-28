import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readPreviewViewSource() {
  return fs.readFileSync(new URL('../PreviewView.vue', import.meta.url), 'utf8')
}

test('纯预览页必须监听 preview-contextmenu 事件', () => {
  const source = readPreviewViewSource()

  assert.match(source, /function onPreviewContextmenu\(context\) \{/u)
  assert.match(source, /<MarkdownPreview[\s\S]*?@preview-contextmenu="onPreviewContextmenu"/u)
})

test('纯预览页收到统一 context 后仍保留 document.resource.open-in-folder 行为', () => {
  const source = readPreviewViewSource()

  assert.match(
    source,
    /function onPreviewContextmenu\(context\) \{[\s\S]*?context\?\.asset\?\.resourceUrl[\s\S]*?event:\s*'document\.resource\.open-in-folder'[\s\S]*?resourceUrl:\s*context\.asset\.resourceUrl[\s\S]*?rawPath:\s*context\.asset\.rawPath/u,
  )
})
