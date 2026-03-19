import assert from 'node:assert/strict'

const { test } = await import('node:test')

let resourceUrlUtilModule = null

try {
  resourceUrlUtilModule = await import('../resourceUrlUtil.js')
} catch {
  resourceUrlUtilModule = null
}

function requireNormalizeMarkdownAnchorHref() {
  assert.ok(resourceUrlUtilModule, '缺少 resource url util')

  const { normalizeMarkdownAnchorHref } = resourceUrlUtilModule
  assert.equal(typeof normalizeMarkdownAnchorHref, 'function')

  return normalizeMarkdownAnchorHref
}

function requireShouldOpenMarkdownLinkInNewWindow() {
  assert.ok(resourceUrlUtilModule, '缺少 resource url util')

  const { shouldOpenMarkdownLinkInNewWindow } = resourceUrlUtilModule
  assert.equal(typeof shouldOpenMarkdownLinkInNewWindow, 'function')

  return shouldOpenMarkdownLinkInNewWindow
}

test('markdown 锚点链接应按标题锚点规则编码普通中文标题', () => {
  const normalizeMarkdownAnchorHref = requireNormalizeMarkdownAnchorHref()

  assert.equal(
    normalizeMarkdownAnchorHref('#中文标题'),
    '#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98',
  )
})

test('markdown 锚点链接应将连续空白折叠为单个连字符', () => {
  const normalizeMarkdownAnchorHref = requireNormalizeMarkdownAnchorHref()

  assert.equal(
    normalizeMarkdownAnchorHref('#中文   标题'),
    '#%E4%B8%AD%E6%96%87-%E6%A0%87%E9%A2%98',
  )
})

test('markdown 锚点链接应保留中间特殊符号并按标题规则编码', () => {
  const normalizeMarkdownAnchorHref = requireNormalizeMarkdownAnchorHref()

  assert.equal(
    normalizeMarkdownAnchorHref('#中文 /  标题'),
    '#%E4%B8%AD%E6%96%87-%2F-%E6%A0%87%E9%A2%98',
  )
})

test('markdown 锚点链接末尾的编号后缀不应参与额外推断，只按标题规则编码', () => {
  const normalizeMarkdownAnchorHref = requireNormalizeMarkdownAnchorHref()

  assert.equal(
    normalizeMarkdownAnchorHref('#中文  ---  标题-2'),
    '#%E4%B8%AD%E6%96%87-----%E6%A0%87%E9%A2%98-2',
  )
})

test('markdown 锚点链接末尾存在组合编号后缀时应原样保留，只处理中间值', () => {
  const normalizeMarkdownAnchorHref = requireNormalizeMarkdownAnchorHref()

  assert.equal(
    normalizeMarkdownAnchorHref('#中文 /  标题-1-2'),
    '#%E4%B8%AD%E6%96%87-%2F-%E6%A0%87%E9%A2%98-1-2',
  )
})

test('markdown 锚点链接末尾存在特殊符号时应按标题规则编码', () => {
  const normalizeMarkdownAnchorHref = requireNormalizeMarkdownAnchorHref()

  assert.equal(
    normalizeMarkdownAnchorHref('#中文 /  标题+++'),
    '#%E4%B8%AD%E6%96%87-%2F-%E6%A0%87%E9%A2%98%2B%2B%2B',
  )
})

test('非锚点链接不应被 markdown 锚点规则改写', () => {
  const normalizeMarkdownAnchorHref = requireNormalizeMarkdownAnchorHref()

  assert.equal(
    normalizeMarkdownAnchorHref('https://example.com/#中文标题'),
    'https://example.com/#中文标题',
  )
  assert.equal(normalizeMarkdownAnchorHref('#'), '#')
})

test('markdown 井号锚点链接不应被标记为新窗口打开', () => {
  const shouldOpenMarkdownLinkInNewWindow = requireShouldOpenMarkdownLinkInNewWindow()

  assert.equal(shouldOpenMarkdownLinkInNewWindow('#标题锚点'), false)
  assert.equal(shouldOpenMarkdownLinkInNewWindow('#'), false)
})

test('普通外链与资源链接仍应允许新窗口打开', () => {
  const shouldOpenMarkdownLinkInNewWindow = requireShouldOpenMarkdownLinkInNewWindow()

  assert.equal(shouldOpenMarkdownLinkInNewWindow('https://example.com'), true)
  assert.equal(shouldOpenMarkdownLinkInNewWindow('wj://74657374'), true)
  assert.equal(shouldOpenMarkdownLinkInNewWindow('./docs/demo.md'), true)
})
