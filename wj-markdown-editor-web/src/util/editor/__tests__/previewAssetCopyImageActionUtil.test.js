import assert from 'node:assert/strict'

const { test } = await import('node:test')

test('preparePreviewAssetCopyImagePayload 在下一帧无法命中同一资源时，返回 copy-image-target-unavailable', async () => {
  const helperModule = await import('../previewAssetCopyImageActionUtil.js').catch(() => ({}))
  const { preparePreviewAssetCopyImagePayload } = helperModule

  assert.equal(typeof preparePreviewAssetCopyImagePayload, 'function')

  const result = await preparePreviewAssetCopyImagePayload({
    asset: {
      assetType: 'image',
      resourceUrl: 'https://example.com/demo.webp',
      rawSrc: 'https://example.com/demo.webp',
    },
    menuPosition: { x: 180, y: 260 },
    closeMenu: async () => {},
    waitForNextFrame: async () => {},
    resolveElementFromPoint: () => null,
  })

  assert.deepEqual(result, {
    ok: false,
    reason: 'copy-image-target-unavailable',
  })
})
