import assert from 'node:assert/strict'

const { test } = await import('node:test')

let previewResourceContextUtilModule = null

try {
  previewResourceContextUtilModule = await import('../previewResourceContextUtil.js')
} catch {
  previewResourceContextUtilModule = null
}

test('预览资源上下文必须保留现有资源字段，并把菜单坐标归一化到 menuPosition 结构中', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.equal(typeof createPreviewResourceContext, 'function')

  assert.deepEqual(createPreviewResourceContext({
    kind: 'image',
    rawSrc: './assets/demo.png',
    rawPath: 'C:/docs/assets/demo.png',
    resourceUrl: 'wj://local/assets/demo.png',
    occurrence: 2,
    lineStart: 8,
    lineEnd: 10,
    clientX: 160,
    clientY: 240,
  }), {
    type: 'resource',
    asset: {
      kind: 'image',
      rawSrc: './assets/demo.png',
      rawPath: 'C:/docs/assets/demo.png',
      resourceUrl: 'wj://local/assets/demo.png',
      occurrence: 2,
      lineStart: 8,
      lineEnd: 10,
    },
    menuPosition: {
      x: 160,
      y: 240,
    },
  })
})

test('预览资源上下文在缺少 resourceUrl 时必须返回 null，避免生成无效菜单上下文', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.equal(createPreviewResourceContext({
    kind: 'image',
    rawSrc: './assets/demo.png',
    clientX: 10,
    clientY: 20,
  }), null)
})

test('预览资源上下文在缺少坐标时必须回退为 0，保证菜单定位结构稳定', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.deepEqual(createPreviewResourceContext({
    kind: 'link',
    rawSrc: './assets/demo.pdf',
    rawPath: 'C:/docs/assets/demo.pdf',
    resourceUrl: 'wj://local/assets/demo.pdf',
    occurrence: 1,
    lineStart: 12,
    lineEnd: 12,
  }), {
    type: 'resource',
    asset: {
      kind: 'link',
      rawSrc: './assets/demo.pdf',
      rawPath: 'C:/docs/assets/demo.pdf',
      resourceUrl: 'wj://local/assets/demo.pdf',
      occurrence: 1,
      lineStart: 12,
      lineEnd: 12,
    },
    menuPosition: {
      x: 0,
      y: 0,
    },
  })
})
