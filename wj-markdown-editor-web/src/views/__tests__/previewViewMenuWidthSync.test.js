import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readPreviewViewSource() {
  return fs.readFileSync(new URL('../PreviewView.vue', import.meta.url), 'utf8')
}

test('预览页不应再包含大纲列与大纲宽度逻辑', () => {
  const source = readPreviewViewSource()

  assert.ok(!source.includes('MarkdownMenu'), '预览页不应再渲染大纲组件，大纲已收口到侧边栏')
  assert.ok(!source.includes('menuWidth'), '预览页不应再包含大纲宽度逻辑')
  assert.ok(!source.includes('menuController'), '预览页不应再包含大纲列控制器')
})

test('预览页保持单列预览容器结构', () => {
  const source = readPreviewViewSource()

  assert.ok(source.includes('grid-cols-[1fr]'), '预览页应保持单列布局')
})
