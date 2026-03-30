function isCopyImageSupportedAsset(asset) {
  return asset?.assetType === 'image'
}

const MENU_GROUP_COPY = 'copy'
const MENU_GROUP_FILE = 'file'
const MENU_GROUP_DANGER = 'danger'

/**
 * 根据预览上下文与菜单配置生成菜单项。
 *
 * @param {{ context?: { type?: string, asset?: { assetType?: string, sourceType?: string, markdownReference?: string | null } }, profile?: string, t?: (key: string) => string }} options
 * @returns {{ key: string, label: string, danger: boolean, group: string }[]} 返回预览资源菜单项列表。
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
  const copyImageSupported = isCopyImageSupportedAsset(asset)
  const hasMarkdownReference = typeof asset?.markdownReference === 'string'
    && Boolean(asset.markdownReference.trim())

  if (!['local', 'remote'].includes(sourceType)) {
    return []
  }

  /**
   * 统一构造菜单项，保证矩阵拼装只关注顺序和标签 key。
   * @param {string} key - 菜单动作 key
   * @param {string} labelKey - 国际化文案 key
   * @param {{ danger?: boolean, group?: string }} [options] - 菜单项附加配置
   * @returns {{ key: string, label: string, danger: boolean, group: string }} 菜单项
   */
  function createMenuItem(key, labelKey, options = {}) {
    return {
      key,
      label: translate(labelKey),
      danger: options.danger === true,
      group: options.group ?? MENU_GROUP_COPY,
    }
  }

  /**
   * 仅在存在稳定 Markdown 引用时追加复制引用菜单，避免空引用误导用户。
   * @param {{ key: string, label: string, danger: boolean, group: string }[]} items - 当前菜单项列表
   */
  function appendMarkdownReferenceItem(items) {
    if (!hasMarkdownReference) {
      return
    }

    items.push(createMenuItem(
      'resource.copy-markdown-reference',
      'previewAssetMenu.copyMarkdownReference',
      {
        group: MENU_GROUP_COPY,
      },
    ))
  }

  if (sourceType === 'local') {
    const items = []

    if (copyImageSupported) {
      items.push(createMenuItem('resource.copy-image', 'previewAssetMenu.copyImage', {
        group: MENU_GROUP_COPY,
      }))
    }

    appendMarkdownReferenceItem(items)
    items.push(createMenuItem('resource.copy-absolute-path', 'previewAssetMenu.copyAbsolutePath', {
      group: MENU_GROUP_COPY,
    }))

    if (isImageAsset) {
      items.push(createMenuItem('resource.save-as', 'previewAssetMenu.saveAs', {
        group: MENU_GROUP_FILE,
      }))
    }

    items.push(createMenuItem('resource.open-in-folder', 'top.openInExplorer', {
      group: MENU_GROUP_FILE,
    }))

    if (profile === 'editor-preview') {
      items.push(createMenuItem('resource.delete', 'previewAssetMenu.delete', {
        danger: true,
        group: MENU_GROUP_DANGER,
      }))
    }

    return items
  }

  const items = []

  if (copyImageSupported) {
    items.push(createMenuItem('resource.copy-image', 'previewAssetMenu.copyImage', {
      group: MENU_GROUP_COPY,
    }))
  }

  appendMarkdownReferenceItem(items)
  items.push(createMenuItem(
    'resource.copy-link',
    isImageAsset ? 'previewAssetMenu.copyImageLink' : 'previewAssetMenu.copyResourceLink',
    {
      group: MENU_GROUP_COPY,
    },
  ))

  if (isImageAsset) {
    items.push(createMenuItem('resource.save-as', 'previewAssetMenu.saveAs', {
      group: MENU_GROUP_FILE,
    }))
  }

  if (profile === 'editor-preview') {
    items.push(createMenuItem('resource.delete', 'previewAssetMenu.delete', {
      danger: true,
      group: MENU_GROUP_DANGER,
    }))
  }

  return items
}

export {
  buildPreviewContextMenuItems,
}

export default {
  buildPreviewContextMenuItems,
}
