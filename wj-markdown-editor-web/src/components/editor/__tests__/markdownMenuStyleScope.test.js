import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readMarkdownMenuSource() {
  return fs.readFileSync(new URL('../MarkdownMenu.vue', import.meta.url), 'utf8')
}

test('MarkdownMenu 对 v-html 注入的目录富文本样式必须使用 deep 选择器', () => {
  const source = readMarkdownMenuSource()

  assert.match(source, /v-html="item\.titleHtml"/u)
  assert.match(source, /:deep\(code\)/u)
  assert.match(source, /:deep\(strong\)/u)
  assert.match(source, /:deep\(em\)/u)
  assert.match(source, /:deep\(s\)/u)
  assert.match(source, /:deep\(mark\)/u)
  assert.match(source, /:deep\(ins\)/u)
  assert.match(source, /:deep\(u\)/u)
  assert.match(source, /:deep\(sub\)/u)
  assert.match(source, /:deep\(sup\)/u)
})
