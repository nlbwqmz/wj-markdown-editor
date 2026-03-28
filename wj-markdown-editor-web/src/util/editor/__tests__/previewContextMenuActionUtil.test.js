import assert from 'node:assert/strict'

const { test } = await import('node:test')

let previewContextMenuActionUtilModule = null

try {
  previewContextMenuActionUtilModule = await import('../previewContextMenuActionUtil.js')
} catch {
  previewContextMenuActionUtilModule = null
}

test('editor-preview 在资源上下文下必须返回打开所在目录和删除两个菜单项，且顺序固定', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule
  assert.equal(typeof buildPreviewContextMenuItems, 'function')

  assert.deepEqual(buildPreviewContextMenuItems({
    context: {
      type: 'resource',
    },
    profile: 'editor-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.open-in-folder',
      label: 'translated:top.openInExplorer',
      danger: false,
    },
    {
      key: 'resource.delete',
      label: 'translated:previewAssetMenu.delete',
      danger: true,
    },
  ])
})

test('standalone-preview 在资源上下文下只能返回打开所在目录菜单项', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: {
      type: 'resource',
    },
    profile: 'standalone-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.open-in-folder',
      label: 'translated:top.openInExplorer',
      danger: false,
    },
  ])
})

test('缺少 t 时，菜单项 label 必须回退为文案 key 本身', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: {
      type: 'resource',
    },
    profile: 'editor-preview',
  }), [
    {
      key: 'resource.open-in-folder',
      label: 'top.openInExplorer',
      danger: false,
    },
    {
      key: 'resource.delete',
      label: 'previewAssetMenu.delete',
      danger: true,
    },
  ])
})

test('非资源上下文必须返回空菜单项数组', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: {
      type: 'text',
    },
    profile: 'editor-preview',
    t: key => `translated:${key}`,
  }), [])
})
