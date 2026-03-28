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

test('编辑页菜单 select 处理必须覆盖新增资源动作，并继续保留打开目录与删除分支', () => {
  const source = readEditorViewSource()

  assert.match(
    source,
    /function onPreviewAssetMenuSelect\(actionKey\) \{[\s\S]*?actionKey === 'resource\.copy-absolute-path'[\s\S]*?copyPreviewAssetAbsolutePath\(\)[\s\S]*?actionKey === 'resource\.copy-link'[\s\S]*?copyPreviewAssetLink\(\)[\s\S]*?actionKey === 'resource\.copy-image'[\s\S]*?copyPreviewAssetImage\(\)[\s\S]*?actionKey === 'resource\.save-as'[\s\S]*?savePreviewAssetAs\(\)[\s\S]*?actionKey === 'resource\.open-in-folder'[\s\S]*?openPreviewAssetInExplorer\(\)[\s\S]*?actionKey === 'resource\.copy-markdown-reference'[\s\S]*?copyPreviewAssetMarkdownReference\(\)[\s\S]*?actionKey === 'resource\.delete'[\s\S]*?deletePreviewAsset\(\)/u,
  )
})

test('编辑页文本复制与运行时命令必须基于冻结 actionContext，并对 Markdown 引用走 renderer 剪贴板直写', () => {
  const source = readEditorViewSource()

  assert.match(
    source,
    /function resolvePreviewAssetMenuActionTarget\(options = \{\}\) \{[\s\S]*?previewAssetSessionController\.createRequestContext\(actionContext\)/u,
  )
  assert.match(
    source,
    /function copyPreviewAssetAbsolutePath\(\) \{[\s\S]*?copyPreviewAssetTextFromRuntime\('document\.resource\.copy-absolute-path'\)/u,
  )
  assert.match(
    source,
    /function copyPreviewAssetLink\(\) \{[\s\S]*?copyPreviewAssetTextFromRuntime\('document\.resource\.copy-link'\)/u,
  )
  assert.match(
    source,
    /function copyPreviewAssetImage\(\) \{[\s\S]*?event:\s*'document\.resource\.copy-image'/u,
  )
  assert.match(
    source,
    /function savePreviewAssetAs\(\) \{[\s\S]*?event:\s*'document\.resource\.save-as'/u,
  )
  assert.match(
    source,
    /copyPreviewAssetMarkdownReference\(\)[\s\S]*?markdownReference[\s\S]*?navigator\.clipboard\.writeText\(text\)/u,
  )
  assert.doesNotMatch(
    source,
    /document\.resource\.copy-markdown-reference/u,
  )
})
