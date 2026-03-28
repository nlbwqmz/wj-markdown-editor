/**
 * 根据预览上下文与菜单配置生成菜单项。
 *
 * @param {{ context?: { type?: string, asset?: { assetType?: string, sourceType?: string, markdownReference?: string | null } }, profile?: string, t?: (key: string) => string }} options
 * @returns {{ key: string, label: string, danger: boolean }[]} 返回预览资源菜单项列表。
 */
function buildPreviewContextMenuItems({ context, profile, t }) {
  if (context?.type !== 'resource') {
    return []
  }

  if (!['editor-preview', 'standalone-preview'].includes(profile)) {
    return []
  }

  // 翻译函数允许注入，缺失时回退为直接返回文案 key。
  const translate = typeof t === 'function' ? t : key => key
  const asset = context?.asset
  const sourceType = asset?.sourceType
  const isImageAsset = asset?.assetType === 'image'
  const hasMarkdownReference = typeof asset?.markdownReference === 'string'
    && Boolean(asset.markdownReference.trim())

  if (!['local', 'remote'].includes(sourceType)) {
    return []
  }

  /**
   * 统一构造菜单项，保证矩阵拼装只关注顺序和标签 key。
   * @param {string} key - 菜单动作 key
   * @param {string} labelKey - 国际化文案 key
   * @param {boolean} [danger] - 是否危险操作
   * @returns {{ key: string, label: string, danger: boolean }} 菜单项
   */
  function createMenuItem(key, labelKey, danger = false) {
    return {
      key,
      label: translate(labelKey),
      danger,
    }
  }

  /**
   * 仅在存在稳定 Markdown 引用时追加复制引用菜单，避免空引用误导用户。
   * @param {{ key: string, label: string, danger: boolean }[]} items - 当前菜单项列表
   */
  function appendMarkdownReferenceItem(items) {
    if (!hasMarkdownReference) {
      return
    }

    items.push(createMenuItem(
      'resource.copy-markdown-reference',
      'previewAssetMenu.copyMarkdownReference',
    ))
  }

  if (sourceType === 'local') {
    const items = [
      createMenuItem('resource.copy-absolute-path', 'previewAssetMenu.copyAbsolutePath'),
    ]

    if (isImageAsset) {
      items.push(createMenuItem('resource.copy-image', 'previewAssetMenu.copyImage'))
      items.push(createMenuItem('resource.save-as', 'previewAssetMenu.saveAs'))
    }

    items.push(createMenuItem('resource.open-in-folder', 'top.openInExplorer'))
    appendMarkdownReferenceItem(items)

    if (profile === 'editor-preview') {
      items.push(createMenuItem('resource.delete', 'previewAssetMenu.delete', true))
    }

    return items
  }

  const items = [
    createMenuItem(
      'resource.copy-link',
      isImageAsset ? 'previewAssetMenu.copyImageLink' : 'previewAssetMenu.copyResourceLink',
    ),
  ]

  if (isImageAsset) {
    items.push(createMenuItem('resource.copy-image', 'previewAssetMenu.copyImage'))
    items.push(createMenuItem('resource.save-as', 'previewAssetMenu.saveAs'))
  }

  appendMarkdownReferenceItem(items)
  return items
}

export {
  buildPreviewContextMenuItems,
}

export default {
  buildPreviewContextMenuItems,
}
