import assert from 'node:assert/strict'

const { test } = await import('node:test')

let previewResourceContextUtilModule = null
let resourceUrlUtilModule = null

try {
  previewResourceContextUtilModule = await import('../previewResourceContextUtil.js')
} catch {
  previewResourceContextUtilModule = null
}

try {
  resourceUrlUtilModule = await import('../../resourceUrlUtil.js')
} catch {
  resourceUrlUtilModule = null
}

function buildRenderedImageResourceUrl(rawSrc) {
  assert.ok(resourceUrlUtilModule, '缺少 resource url util')

  const { convertResourceUrl, normalizeLocalResourcePath } = resourceUrlUtilModule
  const normalizedSrc = normalizeLocalResourcePath(rawSrc)
  return `${convertResourceUrl(normalizedSrc)}?wj_date=1700000000000`
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

test('预览资源上下文在 Windows 编码绝对路径配合稳定 wj:// 资源地址时仍应判定为 local', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.deepEqual(createPreviewResourceContext({
    assetType: 'link',
    rawSrc: 'D:/docs/demo.md',
    rawPath: 'D:%5Cdocs%5Cdemo.md',
    resourceUrl: 'wj://local/windows-demo',
  }), {
    type: 'resource',
    asset: {
      assetType: 'link',
      sourceType: 'local',
      rawSrc: 'D:/docs/demo.md',
      rawPath: 'D:%5Cdocs%5Cdemo.md',
      resourceUrl: 'wj://local/windows-demo',
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

test('预览资源上下文在 assetType 非法但 legacy kind 合法时，应回退到 legacy kind', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.deepEqual(createPreviewResourceContext({
    assetType: 'invalid-kind',
    kind: 'image',
    rawSrc: './assets/demo.png',
    rawPath: './assets/demo.png',
    resourceUrl: 'wj://local/assets/demo.png',
  }), {
    type: 'resource',
    asset: {
      assetType: 'image',
      sourceType: 'local',
      rawSrc: './assets/demo.png',
      rawPath: './assets/demo.png',
      resourceUrl: 'wj://local/assets/demo.png',
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

test('预览资源上下文在真实本地资源形态下，不应把合法本地文件名误判为未知来源', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  const rawPathList = ['README', '.env', 'Makefile', 'README#guide', 'README?tab=a', 'foo:bar.png', '?guide.md', '&cover.png', '?README', '&LICENSE']

  for (const rawPath of rawPathList) {
    const resourceUrl = buildRenderedImageResourceUrl(rawPath)
    const context = createPreviewResourceContext({
      assetType: 'image',
      rawSrc: rawPath,
      rawPath,
      resourceUrl,
    })

    assert.deepEqual(context, {
      type: 'resource',
      asset: {
        assetType: 'image',
        sourceType: 'local',
        rawSrc: rawPath,
        rawPath,
        resourceUrl,
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
  }
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

test('预览资源上下文遇到协议相对 URL 时必须 fail-closed 返回 null', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.equal(createPreviewResourceContext({
    assetType: 'image',
    rawSrc: '//cdn.example.com/demo.png',
    rawPath: '//cdn.example.com/demo.png',
    resourceUrl: '//cdn.example.com/demo.png',
  }), null)
})

test('预览资源上下文遇到仅查询串输入时必须 fail-closed 返回 null', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.equal(createPreviewResourceContext({
    assetType: 'link',
    rawSrc: '?foo=1',
    rawPath: '?foo=1',
    resourceUrl: buildRenderedImageResourceUrl('?foo=1'),
  }), null)
})

test('预览资源上下文遇到 file:// 资源地址时必须 fail-closed 返回 null', () => {
  assert.ok(previewResourceContextUtilModule, '缺少 preview resource context util')

  const { createPreviewResourceContext } = previewResourceContextUtilModule
  assert.equal(createPreviewResourceContext({
    assetType: 'image',
    rawSrc: 'file:///C:/docs/demo.png',
    rawPath: 'file:///C:/docs/demo.png',
    resourceUrl: 'file:///C:/docs/demo.png',
  }), null)
})
