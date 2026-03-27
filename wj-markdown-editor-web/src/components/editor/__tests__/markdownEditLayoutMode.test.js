import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const { test } = await import('node:test')

const markdownEditLayoutModeModuleUrl = new URL('../markdownEditLayoutMode.js', import.meta.url)

const markdownEditLayoutModeModule = await loadMarkdownEditLayoutModeModule()

/**
 * 按“先检查文件是否存在，再决定是否导入”的顺序探测模块。
 * 文件不存在时返回 null；文件存在时若导入失败，必须直接抛出真实错误。
 *
 * @param {{
 *   moduleUrl?: URL,
 *   fileExists?: (url: URL) => boolean,
 *   importModule?: (specifier: string) => Promise<unknown>,
 * }} options
 * @returns {Promise<unknown | null>} 返回模块导出；文件不存在时返回 null。
 */
async function loadMarkdownEditLayoutModeModule(options = {}) {
  const {
    moduleUrl = markdownEditLayoutModeModuleUrl,
    fileExists = existsSync,
    importModule = specifier => import(specifier),
  } = options

  if (fileExists(moduleUrl) !== true) {
    return null
  }

  return importModule(moduleUrl.href)
}

/**
 * 统一校验编辑页布局解析 helper 已经存在。
 * RED 阶段若模块尚未创建，会直接失败在这里并提示缺失实现。
 *
 * @returns {Function} 返回待测的 resolveMarkdownEditLayoutMode 函数。
 */
function requireResolveMarkdownEditLayoutMode() {
  assert.ok(markdownEditLayoutModeModule, '缺少 markdown edit layout mode 模块')

  const { resolveMarkdownEditLayoutMode } = markdownEditLayoutModeModule
  assert.equal(typeof resolveMarkdownEditLayoutMode, 'function')

  return resolveMarkdownEditLayoutMode
}

/**
 * 统一校验 Split gutter 绑定 helper 已经存在。
 * RED 阶段若缺少实现，会直接失败在这里并指向缺失导出。
 *
 * @returns {Function} 返回待测的 resolveMarkdownEditSplitColumnGutters 函数。
 */
function requireResolveMarkdownEditSplitColumnGutters() {
  assert.ok(markdownEditLayoutModeModule, '缺少 markdown edit layout mode 模块')

  const { resolveMarkdownEditSplitColumnGutters } = markdownEditLayoutModeModule
  assert.equal(typeof resolveMarkdownEditSplitColumnGutters, 'function')

  return resolveMarkdownEditSplitColumnGutters
}

test('模块文件不存在时，模块探测会返回 null 而不是尝试导入', async () => {
  const importCalls = []

  const moduleExports = await loadMarkdownEditLayoutModeModule({
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

test('模块文件存在但导入失败时，模块探测必须抛出原始错误', async () => {
  const importError = new Error('boom')

  await assert.rejects(
    async () => loadMarkdownEditLayoutModeModule({
      fileExists() {
        return true
      },
      async importModule() {
        throw importError
      },
    }),
    error => error === importError,
  )
})

test('右侧模式且大纲开启时，返回编辑区、预览区、大纲的列顺序与双分隔条', () => {
  const resolveMarkdownEditLayoutMode = requireResolveMarkdownEditLayoutMode()

  const layoutMode = resolveMarkdownEditLayoutMode({
    previewVisible: true,
    menuVisible: true,
    previewPosition: 'right',
  })

  assert.deepEqual(layoutMode, {
    columnOrder: ['editor', 'preview', 'menu'],
    gridTemplateClass: 'markdown-edit-layout--editor-preview-menu',
    columnGutters: [
      { track: 1, refKey: 'gutterRef' },
      { track: 3, refKey: 'gutterMenuRef' },
    ],
  })
})

test('左侧模式且大纲开启时，返回大纲、预览区、编辑区的列顺序与双分隔条', () => {
  const resolveMarkdownEditLayoutMode = requireResolveMarkdownEditLayoutMode()

  const layoutMode = resolveMarkdownEditLayoutMode({
    previewVisible: true,
    menuVisible: true,
    previewPosition: 'left',
  })

  assert.deepEqual(layoutMode, {
    columnOrder: ['menu', 'preview', 'editor'],
    gridTemplateClass: 'markdown-edit-layout--menu-preview-editor',
    columnGutters: [
      { track: 1, refKey: 'gutterMenuRef' },
      { track: 3, refKey: 'gutterRef' },
    ],
  })
})

test('左侧模式且大纲关闭时，返回预览区、编辑区的列顺序与单分隔条', () => {
  const resolveMarkdownEditLayoutMode = requireResolveMarkdownEditLayoutMode()

  const layoutMode = resolveMarkdownEditLayoutMode({
    previewVisible: true,
    menuVisible: false,
    previewPosition: 'left',
  })

  assert.deepEqual(layoutMode, {
    columnOrder: ['preview', 'editor'],
    gridTemplateClass: 'markdown-edit-layout--preview-editor',
    columnGutters: [
      { track: 1, refKey: 'gutterRef' },
    ],
  })
})

test('预览关闭时，无论大纲开关如何都只保留编辑区且不返回任何分隔条', () => {
  const resolveMarkdownEditLayoutMode = requireResolveMarkdownEditLayoutMode()

  const layoutMode = resolveMarkdownEditLayoutMode({
    previewVisible: false,
    menuVisible: true,
    previewPosition: 'left',
  })

  assert.deepEqual(layoutMode, {
    columnOrder: ['editor'],
    gridTemplateClass: 'markdown-edit-layout--editor-only',
    columnGutters: [],
  })
})

test('非法 previewPosition 会回退到 right 模式', () => {
  const resolveMarkdownEditLayoutMode = requireResolveMarkdownEditLayoutMode()

  const layoutMode = resolveMarkdownEditLayoutMode({
    previewVisible: true,
    menuVisible: false,
    previewPosition: 'bottom',
  })

  assert.deepEqual(layoutMode, {
    columnOrder: ['editor', 'preview'],
    gridTemplateClass: 'markdown-edit-layout--editor-preview',
    columnGutters: [
      { track: 1, refKey: 'gutterRef' },
    ],
  })
})

test('左侧三栏布局会把 track 1 绑定到 gutterMenuRef，track 3 绑定到 gutterRef', () => {
  const resolveMarkdownEditLayoutMode = requireResolveMarkdownEditLayoutMode()
  const resolveMarkdownEditSplitColumnGutters = requireResolveMarkdownEditSplitColumnGutters()
  const gutterRef = { name: 'editor-preview-gutter' }
  const gutterMenuRef = { name: 'menu-preview-gutter' }
  const layoutMode = resolveMarkdownEditLayoutMode({
    previewVisible: true,
    menuVisible: true,
    previewPosition: 'left',
  })

  const columnGutters = resolveMarkdownEditSplitColumnGutters(layoutMode.columnGutters, {
    gutterRef,
    gutterMenuRef,
  })

  assert.deepEqual(columnGutters, [
    { track: 1, element: gutterMenuRef },
    { track: 3, element: gutterRef },
  ])
})

test('缺失 gutter ref 时会过滤掉无法绑定的 Split 分隔条', () => {
  const resolveMarkdownEditLayoutMode = requireResolveMarkdownEditLayoutMode()
  const resolveMarkdownEditSplitColumnGutters = requireResolveMarkdownEditSplitColumnGutters()
  const gutterMenuRef = { name: 'menu-preview-gutter' }
  const layoutMode = resolveMarkdownEditLayoutMode({
    previewVisible: true,
    menuVisible: true,
    previewPosition: 'left',
  })

  const columnGutters = resolveMarkdownEditSplitColumnGutters(layoutMode.columnGutters, {
    gutterMenuRef,
  })

  assert.deepEqual(columnGutters, [
    { track: 1, element: gutterMenuRef },
  ])
})
