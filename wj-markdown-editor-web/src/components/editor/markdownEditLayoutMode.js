const LAYOUT_MODE_MAP = {
  'editor-only': {
    columnOrder: ['editor'],
    gridTemplateClass: 'markdown-edit-layout--editor-only',
    columnGutters: [],
  },
  'editor-preview': {
    columnOrder: ['editor', 'preview'],
    gridTemplateClass: 'markdown-edit-layout--editor-preview',
    columnGutters: [{ track: 1, refKey: 'gutterRef' }],
  },
  'preview-editor': {
    // columnOrder 同时作为真实渲染顺序和视觉顺序来源。
    columnOrder: ['preview', 'editor'],
    gridTemplateClass: 'markdown-edit-layout--preview-editor',
    columnGutters: [{ track: 1, refKey: 'gutterRef' }],
  },
  'preview-only': {
    // columnOrder 仍然包含 editor，保证编辑器实例不随布局切换销毁，
    // 真实宽度由 CSS 把 editor 列压到 0 实现；没有分隔条，因此不挂 Split 拖拽。
    columnOrder: ['editor', 'preview'],
    gridTemplateClass: 'markdown-edit-layout--preview-only',
    columnGutters: [],
  },
}

/**
 * 将编辑页视图模式解析为稳定且纯粹的布局描述。
 * 这里只负责列顺序、模板类名和分隔条轨道，不处理任何 DOM 或 Split 接线。
 *
 * @param {{
 *   viewMode?: 'source' | 'split' | 'preview' | string,
 *   previewPosition?: string,
 * }} options
 * @returns {{
 *   columnOrder: string[],
 *   gridTemplateClass: string,
 *   columnGutters: Array<{ track: number, refKey: string }>,
 * }} 返回可供编辑页布局和分隔条接线消费的稳定描述对象。
 */
export function resolveMarkdownEditLayoutMode(options = {}) {
  const viewMode = options.viewMode === 'source' || options.viewMode === 'preview'
    ? options.viewMode
    : 'split'

  if (viewMode === 'source') {
    return cloneLayoutMode('editor-only')
  }

  if (viewMode === 'preview') {
    return cloneLayoutMode('preview-only')
  }

  const resolvedPreviewPosition = options.previewPosition === 'left' ? 'left' : 'right'

  return cloneLayoutMode(resolvedPreviewPosition === 'left' ? 'preview-editor' : 'editor-preview')
}

/**
 * 将布局 helper 返回的 gutter 描述映射为 Split 需要的运行时配置。
 * 当某个 ref 尚未渲染完成或当前布局不需要该 gutter 时，会自动过滤掉无效项。
 *
 * @param {Array<{ track: number, refKey: string }> | undefined} columnGutters
 * @param {Record<string, unknown> | undefined} gutterRefMap
 * @returns {Array<{ track: number, element: unknown }>} 返回可直接传给 Split 的分隔条配置。
 */
export function resolveMarkdownEditSplitColumnGutters(columnGutters = [], gutterRefMap = {}) {
  return columnGutters
    .map(({ track, refKey }) => ({
      track,
      element: gutterRefMap[refKey],
    }))
    .filter(({ element }) => Boolean(element))
}

/**
 * 返回布局描述的浅拷贝，避免调用方意外修改共享静态配置。
 *
 * @param {keyof typeof LAYOUT_MODE_MAP} layoutModeKey
 */
function cloneLayoutMode(layoutModeKey) {
  const layoutMode = LAYOUT_MODE_MAP[layoutModeKey]

  return {
    columnOrder: [...layoutMode.columnOrder],
    gridTemplateClass: layoutMode.gridTemplateClass,
    columnGutters: layoutMode.columnGutters.map(gutter => ({ ...gutter })),
  }
}
