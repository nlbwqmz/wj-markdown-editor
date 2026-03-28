import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readEditorViewSource() {
  return fs.readFileSync(new URL('../EditorView.vue', import.meta.url), 'utf8')
}

test('编辑页必须监听 preview-contextmenu，并把预览资源菜单项透传给 PreviewAssetContextMenu', () => {
  const source = readEditorViewSource()

  assert.match(source, /function onPreviewContextmenu\(context\) \{/u)
  assert.match(
    source,
    /buildPreviewContextMenuItems\(\{[\s\S]*context,[\s\S]*profile:\s*'editor-preview'[\s\S]*\}\)/u,
  )
  assert.match(
    source,
    /<MarkdownEdit[\s\S]*?@preview-contextmenu="onPreviewContextmenu"/u,
  )
  assert.match(
    source,
    /<PreviewAssetContextMenu[\s\S]*?:items="previewAssetMenu\.items"[\s\S]*?@select="onPreviewAssetMenuSelect"/u,
  )
})

test('编辑页在菜单 select 处理中仍保留打开目录与 resource.delete 动作分支', () => {
  const source = readEditorViewSource()

  assert.match(
    source,
    /function onPreviewAssetMenuSelect\(actionKey\) \{[\s\S]*?actionKey === 'resource\.open-in-folder'[\s\S]*?openPreviewAssetInExplorer\(\)[\s\S]*?actionKey === 'resource\.delete'[\s\S]*?deletePreviewAsset\(\)/u,
  )
})
