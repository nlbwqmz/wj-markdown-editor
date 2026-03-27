import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readMarkdownEditSource() {
  return fs.readFileSync(new URL('../MarkdownEdit.vue', import.meta.url), 'utf8')
}

test('MarkdownEdit 会声明 previewPosition prop 且默认回退到右侧布局', () => {
  const source = readMarkdownEditSource()

  assert.ok(source.includes('previewPosition'))
  assert.ok(source.includes('default: () => \'right\''))
})

test('MarkdownEdit 会使用 resolveMarkdownEditLayoutMode 解析布局类', () => {
  const source = readMarkdownEditSource()

  assert.ok(source.includes('resolveMarkdownEditLayoutMode'))
  assert.ok(source.includes('previewPosition: props.previewPosition'))
  assert.ok(source.includes('layoutMode.value.gridTemplateClass'))
})

test('MarkdownEdit 会按 layoutMode.columnGutters 的 refKey 绑定 Split 分隔条', () => {
  const source = readMarkdownEditSource()

  assert.ok(source.includes('layoutMode.value.columnGutters'))
  assert.ok(source.includes('refKey'))
  assert.ok(source.includes('gutterRef: gutterRef.value'))
  assert.ok(source.includes('gutterMenuRef: gutterMenuRef.value'))
  assert.ok(source.includes('[refKey]'))
})
