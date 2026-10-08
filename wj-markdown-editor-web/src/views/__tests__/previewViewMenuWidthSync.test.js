import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readPreviewViewSource() {
  return fs.readFileSync(new URL('../PreviewView.vue', import.meta.url), 'utf8')
}

test('预览页必须监听持久化大纲宽度变化，保证与编辑页共用同一宽度', () => {
  const source = readPreviewViewSource()

  assert.ok(
    source.includes('watch(() => store.config.menuWidth'),
    '预览页缺少 store.config.menuWidth 监听，编辑页拖拽后预览页不会同步宽度',
  )
  assert.ok(
    source.includes('applyPersistedMenuWidth()'),
    '预览页缺少大纲宽度应用逻辑，无法把持久化宽度写成行内列模板',
  )
})

test('预览页重新激活时必须补应用持久化宽度', () => {
  const source = readPreviewViewSource()

  assert.ok(
    /onActivated\(async \(\) => \{[\s\S]*?applyPersistedMenuWidth\(\)/u.test(source),
    '预览页 onActivated 缺少大纲宽度补应用，失活期间容器宽度不可用会导致宽度丢失',
  )
})
