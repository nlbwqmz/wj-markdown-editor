import assert from 'node:assert/strict'

const { test } = await import('node:test')

let markdownEditLayoutModeModule = null

try {
  markdownEditLayoutModeModule = await import('../markdownEditLayoutMode.js')
} catch (error) {
  const isModuleMissing = error?.code === 'ERR_MODULE_NOT_FOUND'
    && /markdownEditLayoutMode\.js/u.test(String(error?.message))

  if (isModuleMissing) {
    markdownEditLayoutModeModule = null
  } else {
    throw error
  }
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
