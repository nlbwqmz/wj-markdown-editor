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
  rawSrc = sourceType === 'remote' ? 'https://example.com/demo.png' : './demo.png',
  rawPath = rawSrc,
  resourceUrl = sourceType === 'remote' ? rawSrc : `wj://${rawSrc.replace(/^\.\//u, '')}`,
} = {}) {
  return {
    type: 'resource',
    asset: {
      assetType,
      sourceType,
      markdownReference,
      rawSrc,
      rawPath,
      resourceUrl,
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
      key: 'resource.copy-image',
      label: 'translated:previewAssetMenu.copyImage',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyImageLink',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.save-as',
      label: 'translated:previewAssetMenu.saveAs',
      danger: false,
      group: 'file',
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
      key: 'resource.copy-image',
      label: 'translated:previewAssetMenu.copyImage',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyImageLink',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.save-as',
      label: 'translated:previewAssetMenu.saveAs',
      danger: false,
      group: 'file',
    },
    {
      key: 'resource.delete',
      label: 'translated:previewAssetMenu.delete',
      danger: true,
      group: 'danger',
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
      key: 'resource.copy-image',
      label: 'translated:previewAssetMenu.copyImage',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-absolute-path',
      label: 'translated:previewAssetMenu.copyAbsolutePath',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.save-as',
      label: 'translated:previewAssetMenu.saveAs',
      danger: false,
      group: 'file',
    },
    {
      key: 'resource.open-in-folder',
      label: 'translated:top.openInExplorer',
      danger: false,
      group: 'file',
    },
    {
      key: 'resource.delete',
      label: 'translated:previewAssetMenu.delete',
      danger: true,
      group: 'danger',
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
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-absolute-path',
      label: 'translated:previewAssetMenu.copyAbsolutePath',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.open-in-folder',
      label: 'translated:top.openInExplorer',
      danger: false,
      group: 'file',
    },
    {
      key: 'resource.delete',
      label: 'translated:previewAssetMenu.delete',
      danger: true,
      group: 'danger',
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
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyResourceLink',
      danger: false,
      group: 'copy',
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
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyResourceLink',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.delete',
      label: 'translated:previewAssetMenu.delete',
      danger: true,
      group: 'danger',
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
      key: 'resource.copy-image',
      label: 'translated:previewAssetMenu.copyImage',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyImageLink',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.save-as',
      label: 'translated:previewAssetMenu.saveAs',
      danger: false,
      group: 'file',
    },
  ])
})

test('远程 WebP 图片在 standalone-preview 下也应显示复制图片，避免菜单层与 Chromium 复制能力脱节', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'image',
      sourceType: 'remote',
      rawSrc: 'https://example.com/demo.webp',
      rawPath: 'https://example.com/demo.webp',
      resourceUrl: 'https://example.com/demo.webp',
      markdownReference: '![远程图片](https://example.com/demo.webp)',
    }),
    profile: 'standalone-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.copy-image',
      label: 'translated:previewAssetMenu.copyImage',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyImageLink',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.save-as',
      label: 'translated:previewAssetMenu.saveAs',
      danger: false,
      group: 'file',
    },
  ])
})

test('本地 SVG 图片在 editor-preview 下也应显示复制图片，避免菜单层额外维护格式白名单', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'image',
      sourceType: 'local',
      rawSrc: './demo.svg',
      rawPath: './demo.svg',
      resourceUrl: 'wj://demo.svg',
      markdownReference: '![本地图片](./demo.svg)',
    }),
    profile: 'editor-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.copy-image',
      label: 'translated:previewAssetMenu.copyImage',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-absolute-path',
      label: 'translated:previewAssetMenu.copyAbsolutePath',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.save-as',
      label: 'translated:previewAssetMenu.saveAs',
      danger: false,
      group: 'file',
    },
    {
      key: 'resource.open-in-folder',
      label: 'translated:top.openInExplorer',
      danger: false,
      group: 'file',
    },
    {
      key: 'resource.delete',
      label: 'translated:previewAssetMenu.delete',
      danger: true,
      group: 'danger',
    },
  ])
})

test('远程无扩展名图片在 standalone-preview 下也应显示复制图片，只按 image 类型裁决', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule

  assert.deepEqual(buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'image',
      sourceType: 'remote',
      rawSrc: 'https://example.com/assets/demo',
      rawPath: 'https://example.com/assets/demo',
      resourceUrl: 'https://example.com/assets/demo',
      markdownReference: '![远程图片](https://example.com/assets/demo)',
    }),
    profile: 'standalone-preview',
    t: key => `translated:${key}`,
  }), [
    {
      key: 'resource.copy-image',
      label: 'translated:previewAssetMenu.copyImage',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'translated:previewAssetMenu.copyMarkdownReference',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-link',
      label: 'translated:previewAssetMenu.copyImageLink',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.save-as',
      label: 'translated:previewAssetMenu.saveAs',
      danger: false,
      group: 'file',
    },
  ])
})

test('本地图片文件名中合法包含问号或井号时，不能误隐藏复制图片菜单项', () => {
  assert.ok(previewContextMenuActionUtilModule, '缺少 preview context menu action util')

  const { buildPreviewContextMenuItems } = previewContextMenuActionUtilModule
  const questionMarkMenu = buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'image',
      sourceType: 'local',
      rawSrc: './foo?bar.png',
      rawPath: './foo?bar.png',
      resourceUrl: 'wj://foo-question-bar-png',
      markdownReference: '![本地图片](./foo?bar.png)',
    }),
    profile: 'editor-preview',
    t: key => `translated:${key}`,
  })
  const hashMenu = buildPreviewContextMenuItems({
    context: createResourceContext({
      assetType: 'image',
      sourceType: 'local',
      rawSrc: './foo#bar.jpg',
      rawPath: './foo#bar.jpg',
      resourceUrl: 'wj://foo-hash-bar-jpg',
      markdownReference: '![本地图片](./foo#bar.jpg)',
    }),
    profile: 'editor-preview',
    t: key => `translated:${key}`,
  })

  assert.ok(questionMarkMenu.some(item => item.key === 'resource.copy-image'))
  assert.ok(hashMenu.some(item => item.key === 'resource.copy-image'))
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
      key: 'resource.copy-image',
      label: 'previewAssetMenu.copyImage',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-markdown-reference',
      label: 'previewAssetMenu.copyMarkdownReference',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.copy-absolute-path',
      label: 'previewAssetMenu.copyAbsolutePath',
      danger: false,
      group: 'copy',
    },
    {
      key: 'resource.save-as',
      label: 'previewAssetMenu.saveAs',
      danger: false,
      group: 'file',
    },
    {
      key: 'resource.open-in-folder',
      label: 'top.openInExplorer',
      danger: false,
      group: 'file',
    },
    {
      key: 'resource.delete',
      label: 'previewAssetMenu.delete',
      danger: true,
      group: 'danger',
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
