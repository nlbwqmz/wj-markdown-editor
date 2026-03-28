import assert from 'node:assert/strict'

const { test } = await import('node:test')

let previewResourceContextUtilModule = null

try {
  previewResourceContextUtilModule = await import('../previewResourceContextUtil.js')
} catch {
  previewResourceContextUtilModule = null
}

test('预览资源上下文必须归一化 assetType 和 sourceType，并保留稳定的 Markdown 引用元信息', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.equal(typeof createPreviewResourceContext, 'function')

  const context = createPreviewResourceContext({
    assetType: 'image',
    rawSrc: './assets/demo.png',
    rawPath: './assets/demo.png',
    resourceUrl: 'wj://local/assets/demo.png',
    markdownReference: '![demo](./assets/demo.png)',
    clientX: 160,
    clientY: 240,
  })

  assert.deepEqual(context, {
    type: 'resource',
    asset: {
      assetType: 'image',
      sourceType: 'local',
      rawSrc: './assets/demo.png',
      rawPath: './assets/demo.png',
      resourceUrl: 'wj://local/assets/demo.png',
      markdownReference: '![demo](./assets/demo.png)',
      occurrence: undefined,
      lineStart: undefined,
      lineEnd: undefined,
    },
    menuPosition: {
      x: 160,
      y: 240,
    },
  })

  assert.equal('kind' in context.asset, false)
})

test('预览资源上下文在缺少 Markdown 引用元信息时必须稳定返回 null，而不是伪造引用文本', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.deepEqual(createPreviewResourceContext({
    assetType: 'link',
    rawSrc: 'https://example.com/demo.pdf',
    rawPath: 'https://example.com/demo.pdf',
    resourceUrl: 'https://example.com/demo.pdf',
  }), {
    type: 'resource',
    asset: {
      assetType: 'link',
      sourceType: 'remote',
      rawSrc: 'https://example.com/demo.pdf',
      rawPath: 'https://example.com/demo.pdf',
      resourceUrl: 'https://example.com/demo.pdf',
      markdownReference: null,
      occurrence: undefined,
      lineStart: undefined,
      lineEnd: undefined,
    },
    menuPosition: {
      x: 0,
      y: 0,
    },
  })
})

test('预览资源上下文在无法稳定判定来源时必须 fail-closed 返回 null', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.equal(createPreviewResourceContext({
    assetType: 'image',
    rawSrc: 'blob:https://example.com/demo.png',
    rawPath: 'blob:https://example.com/demo.png',
    resourceUrl: 'blob:https://example.com/demo.png',
    clientX: 10,
    clientY: 20,
  }), null)
})

test('预览资源上下文在稳定来源与不稳定来源混合时必须 fail-closed 返回 null', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.equal(createPreviewResourceContext({
    assetType: 'image',
    rawSrc: 'blob:https://example.com/demo.png',
    rawPath: 'blob:https://example.com/demo.png',
    resourceUrl: 'wj://local/assets/demo.png',
  }), null)
})
