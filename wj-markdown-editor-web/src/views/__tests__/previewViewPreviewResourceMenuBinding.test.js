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

test('纯预览页菜单选择与资源打开都必须基于 controller requestContext 继续走 document.resource.open-in-folder', () => {
  const source = readPreviewViewSource()

  assert.match(
    source,
    /function onPreviewAssetMenuSelect\(actionKey\) \{[\s\S]*?actionKey === 'resource\.open-in-folder'[\s\S]*?openPreviewAssetInExplorer\(\)/u,
  )
  assert.match(
    source,
    /function openPreviewAssetInExplorer\(\) \{[\s\S]*?previewAssetSessionController\.isActiveContext\(actionContext\) !== true[\s\S]*?closePreviewAssetMenu\(\)[\s\S]*?event:\s*'document\.resource\.open-in-folder'[\s\S]*?requestContext:\s*previewAssetSessionController\.createRequestContext\(actionContext\)/u,
  )
  assert.match(
    source,
    /function onAssetOpen\(assetInfo\) \{[\s\S]*?const actionContext = previewAssetSessionController\.captureActionContext\(\)/u,
  )
  assert.match(
    source,
    /function onAssetOpen\(assetInfo\) \{[\s\S]*?event:\s*'document\.resource\.open-in-folder'[\s\S]*?requestContext:\s*previewAssetSessionController\.createRequestContext\(actionContext\)/u,
  )
})
