import assert from 'node:assert/strict'

const { test } = await import('node:test')

let previewContextMenuActionUtilModule = null

try {
  previewContextMenuActionUtilModule = await import('../previewContextMenuActionUtil.js')
} catch {
  previewContextMenuActionUtilModule = null
}

function createResourceContext({
  assetType = 'image',
  sourceType = 'local',
  markdownReference = '![示例](./demo.png)',
} = {}) {
  return {
    type: 'resource',
    asset: {
      assetType,
      sourceType,
      markdownReference,
    },
  }
}

test('远程图片在 standalone-preview 下必须按顺序返回复制链接、复制图片、另存为和复制 Markdown 引用菜单项', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule
  assert.equal(typeof buildPreviewContextMenuItems, 'function')

  assert.deepEqual(buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'image',
      sourceType: 'remote',
      markdownReference: '![远程图片](https://example.com/demo.png)',
    }),
    profile: 'standalone-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyImageLink',
      danger: false,
    },
    {
      key: 'resource.copy-image',
      label: 'translated:previewAssetMenu.copyImage',
      danger: false,
    },
    {
      key: 'resource.save-as',
      label: 'translated:previewAssetMenu.saveAs',
      danger: false,
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
    },
  ])
})

test('远程图片在 editor-preview 下必须在复制菜单后保留删除入口', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'image',
      sourceType: 'remote',
      markdownReference: '![远程图片](https://example.com/demo.png)',
    }),
    profile: 'editor-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyImageLink',
      danger: false,
    },
    {
      key: 'resource.copy-image',
      label: 'translated:previewAssetMenu.copyImage',
      danger: false,
    },
    {
      key: 'resource.save-as',
      label: 'translated:previewAssetMenu.saveAs',
      danger: false,
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
    },
    {
      key: 'resource.delete',
      label: 'translated:previewAssetMenu.delete',
      danger: true,
    },
  ])
})

test('本地图片在 editor-preview 下必须按顺序返回完整编辑菜单矩阵', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'image',
      sourceType: 'local',
      markdownReference: '![本地图片](./demo.png)',
    }),
    profile: 'editor-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.copy-absolute-path',
      label: 'translated:previewAssetMenu.copyAbsolutePath',
      danger: false,
    },
    {
      key: 'resource.copy-image',
      label: 'translated:previewAssetMenu.copyImage',
      danger: false,
    },
    {
      key: 'resource.save-as',
      label: 'translated:previewAssetMenu.saveAs',
      danger: false,
    },
    {
      key: 'resource.open-in-folder',
      label: 'translated:top.openInExplorer',
      danger: false,
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
    },
    {
      key: 'resource.delete',
      label: 'translated:previewAssetMenu.delete',
      danger: true,
    },
  ])
})

test('本地非图片资源在 editor-preview 下必须按顺序返回非图片菜单矩阵，unknown 也按非图片处理', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'unknown',
      sourceType: 'local',
      markdownReference: '[附件](./demo.zip)',
    }),
    profile: 'editor-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.copy-absolute-path',
      label: 'translated:previewAssetMenu.copyAbsolutePath',
      danger: false,
    },
    {
      key: 'resource.open-in-folder',
      label: 'translated:top.openInExplorer',
      danger: false,
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
    },
    {
      key: 'resource.delete',
      label: 'translated:previewAssetMenu.delete',
      danger: true,
    },
  ])
})

test('远程非图片资源在 standalone-preview 下只能返回复制资源链接和复制 Markdown 引用菜单项', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'video',
      sourceType: 'remote',
      markdownReference: '[远程附件](https://example.com/demo.mp4)',
    }),
    profile: 'standalone-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyResourceLink',
      danger: false,
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
    },
  ])
})

test('远程非图片资源在 editor-preview 下必须保留删除入口且顺序稳定', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'video',
      sourceType: 'remote',
      markdownReference: '[远程附件](https://example.com/demo.mp4)',
    }),
    profile: 'editor-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyResourceLink',
      danger: false,
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
    },
    {
      key: 'resource.delete',
      label: 'translated:previewAssetMenu.delete',
      danger: true,
    },
  ])
})

test('markdownReference 为 null 时必须隐藏复制 Markdown 引用菜单项', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'image',
      sourceType: 'remote',
      markdownReference: null,
    }),
    profile: 'standalone-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyImageLink',
      danger: false,
    },
    {
      key: 'resource.copy-image',
      label: 'translated:previewAssetMenu.copyImage',
      danger: false,
    },
    {
      key: 'resource.save-as',
      label: 'translated:previewAssetMenu.saveAs',
      danger: false,
    },
  ])
})

test('缺少 t 时，菜单项 label 必须回退为文案 key 本身', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'image',
      sourceType: 'local',
      markdownReference: '![本地图片](./demo.png)',
    }),
    profile: 'editor-preview',
  }), [
    {
      key: 'resource.copy-absolute-path',
      label: 'previewAssetMenu.copyAbsolutePath',
      danger: false,
    },
    {
      key: 'resource.copy-image',
      label: 'previewAssetMenu.copyImage',
      danger: false,
    },
    {
      key: 'resource.save-as',
      label: 'previewAssetMenu.saveAs',
      danger: false,
    },
    {
      key: 'resource.open-in-folder',
      label: 'top.openInExplorer',
      danger: false,
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'previewAssetMenu.copyMarkdownReference',
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
