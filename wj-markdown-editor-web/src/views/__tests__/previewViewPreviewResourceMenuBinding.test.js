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

test('纯预览页必须接入 PreviewAssetContextMenu，并只构建 standalone-preview 菜单项', () => {
  const source = readPreviewViewSource()

  assert.match(source, /import PreviewAssetContextMenu from ['"]@\/components\/editor\/PreviewAssetContextMenu\.vue['"]/u)
  assert.match(source, /import \{ createPreviewAssetSessionController \} from ['"]@\/util\/editor\/previewAssetSessionController\.js['"]/u)
  assert.match(source, /import \{ buildPreviewContextMenuItems \} from ['"]@\/util\/editor\/previewContextMenuActionUtil\.js['"]/u)
  assert.doesNotMatch(source, /createResourceRequestContext/u)
  assert.match(
    source,
    /previewAssetMenu\.value\s*=\s*\{[\s\S]*?items:\s*buildPreviewContextMenuItems\(\{[\s\S]*?context,[\s\S]*?profile:\s*'standalone-preview'[\s\S]*?\}\)/u,
  )
  assert.match(
    source,
    /<PreviewAssetContextMenu[\s\S]*?:items="previewAssetMenu\.items"[\s\S]*?@select="onPreviewAssetMenuSelect"/u,
  )
})

test('纯预览页应用 snapshot 时必须同步 previewAssetSessionController，并在失活或卸载时失效当前上下文', () => {
  const source = readPreviewViewSource()

  assert.match(source, /const previewAssetSessionController = createPreviewAssetSessionController\(/u)
  assert.match(source, /function applyDocumentSessionSnapshot\(snapshot\) \{[\s\S]*?previewAssetSessionController\.syncSnapshot\(snapshot\)/u)
  assert.match(
    source,
    /onDeactivated\(\(\) => \{[\s\S]*?previewAssetSessionController\.invalidateActiveContext\(\{[\s\S]*?reason:\s*'deactivated'[\s\S]*?\}\)[\s\S]*?closePreviewAssetMenu\(\)/u,
  )
  assert.match(
    source,
    /onBeforeUnmount\(\(\) => \{[\s\S]*?previewAssetSessionController\.invalidateActiveContext\(\{[\s\S]*?reason:\s*'before-unmount'[\s\S]*?\}\)[\s\S]*?closePreviewAssetMenu\(\)/u,
  )
})

test('纯预览页菜单选择必须覆盖新增非删除动作，并继续基于冻结 actionContext 发命令', () => {
  const source = readPreviewViewSource()

  assert.match(
    source,
    /function onPreviewAssetMenuSelect\(actionKey\) \{[\s\S]*?actionKey === 'resource\.copy-absolute-path'[\s\S]*?copyPreviewAssetAbsolutePath\(\)[\s\S]*?actionKey === 'resource\.copy-link'[\s\S]*?copyPreviewAssetLink\(\)[\s\S]*?actionKey === 'resource\.copy-image'[\s\S]*?copyPreviewAssetImage\(\)[\s\S]*?actionKey === 'resource\.save-as'[\s\S]*?savePreviewAssetAs\(\)[\s\S]*?actionKey === 'resource\.open-in-folder'[\s\S]*?openPreviewAssetInExplorer\(\)[\s\S]*?actionKey === 'resource\.copy-markdown-reference'[\s\S]*?copyPreviewAssetMarkdownReference\(\)/u,
  )
  assert.match(
    source,
    /function resolvePreviewAssetMenuActionTarget\(options = \{\}\) \{[\s\S]*?previewAssetSessionController\.createRequestContext\(actionContext\)/u,
  )
  assert.match(
    source,
    /function openPreviewAssetInExplorer\(\) \{[\s\S]*?resolvePreviewAssetMenuActionTarget\(\)[\s\S]*?event:\s*'document\.resource\.open-in-folder'[\s\S]*?requestContext:\s*actionTarget\.requestContext/u,
  )
  assert.match(
    source,
    /function onAssetOpen\(assetInfo\) \{[\s\S]*?const actionContext = previewAssetSessionController\.captureActionContext\(\)[\s\S]*?event:\s*'document\.resource\.open-in-folder'[\s\S]*?requestContext:\s*previewAssetSessionController\.createRequestContext\(actionContext\)/u,
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
    /resource\.delete/u,
  )
  assert.doesNotMatch(
    source,
    /document\.resource\.delete-local/u,
  )
})
