import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const { test } = await import('node:test')

const markdownEditRenderItemsModuleUrl = new URL('../markdownEditRenderItems.js', import.meta.url)

const markdownEditRenderItemsModule = await loadMarkdownEditRenderItemsModule()

async function loadMarkdownEditRenderItemsModule(options = {}) {
  const {
    moduleUrl = markdownEditRenderItemsModuleUrl,
    fileExists = existsSync,
    importModule = specifier => import(specifier),
  } = options

  if (fileExists(moduleUrl) !== true) {
    return null
  }

  return importModule(moduleUrl.href)
}

function requireResolveMarkdownEditRenderItems() {
  assert.ok(markdownEditRenderItemsModule, '缺少 markdown edit render items 模块')

  const { resolveMarkdownEditRenderItems } = markdownEditRenderItemsModule
  assert.equal(typeof resolveMarkdownEditRenderItems, 'function')

  return resolveMarkdownEditRenderItems
}

test('模块文件不存在时，render items 模块探测会返回 null', async () => {
  const importCalls = []

  const moduleExports = await loadMarkdownEditRenderItemsModule({
    fileExists() {
      return false
    },
    async importModule(specifier) {
      importCalls.push(specifier)
      return {}
    },
  })

  assert.equal(moduleExports, null)
  assert.deepEqual(importCalls, [])
})

test('左侧双栏布局会生成 preview -> gutter-preview -> editor 的渲染顺序', () => {
  const resolveMarkdownEditRenderItems = requireResolveMarkdownEditRenderItems()

  const renderItems = resolveMarkdownEditRenderItems({
    columnOrder: ['preview', 'editor'],
  })

  assert.deepEqual(renderItems, [
    { key: 'preview', type: 'preview' },
    { key: 'gutter-preview', type: 'gutter-preview' },
    { key: 'editor', type: 'editor' },
  ])
})

test('左侧三栏布局会生成 menu -> gutter-menu -> preview -> gutter-preview -> editor 的渲染顺序', () => {
  const resolveMarkdownEditRenderItems = requireResolveMarkdownEditRenderItems()

  const renderItems = resolveMarkdownEditRenderItems({
    columnOrder: ['menu', 'preview', 'editor'],
  })

  assert.deepEqual(renderItems, [
    { key: 'menu', type: 'menu' },
    { key: 'gutter-menu', type: 'gutter-menu' },
    { key: 'preview', type: 'preview' },
    { key: 'gutter-preview', type: 'gutter-preview' },
    { key: 'editor', type: 'editor' },
  ])
})

test('右侧三栏布局会生成 editor -> gutter-preview -> preview -> gutter-menu -> menu 的渲染顺序', () => {
  const resolveMarkdownEditRenderItems = requireResolveMarkdownEditRenderItems()

  const renderItems = resolveMarkdownEditRenderItems({
    columnOrder: ['editor', 'preview', 'menu'],
  })

  assert.deepEqual(renderItems, [
    { key: 'editor', type: 'editor' },
    { key: 'gutter-preview', type: 'gutter-preview' },
    { key: 'preview', type: 'preview' },
    { key: 'gutter-menu', type: 'gutter-menu' },
    { key: 'menu', type: 'menu' },
  ])
})

test('仅编辑区布局不会生成任何 gutter', () => {
  const resolveMarkdownEditRenderItems = requireResolveMarkdownEditRenderItems()

  const renderItems = resolveMarkdownEditRenderItems({
    columnOrder: ['editor'],
  })

  assert.deepEqual(renderItems, [
    { key: 'editor', type: 'editor' },
  ])
})
