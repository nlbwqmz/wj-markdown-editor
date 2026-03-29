const COPY_IMAGE_SUPPORTED_EXTENSION_SET = new Set([
  '.png',
  '.jpg',
  '.jpeg',
])

function normalizeStringValue(value) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue || null
}

function deriveAssetExtension(value) {
  const normalizedValue = normalizeStringValue(value)
  if (!normalizedValue) {
    return null
  }

  let normalizedPath = normalizedValue
  try {
    if (/^(?:https?|wj):\/\//iu.test(normalizedValue)) {
      const urlObject = new URL(normalizedValue)
      normalizedPath = decodeURIComponent(urlObject.pathname || '')
    }
  } catch {
    normalizedPath = normalizedValue
  }

  const extractExtension = (targetPath) => {
    const baseName = targetPath.split('/').pop() || ''
    const extensionIndex = baseName.lastIndexOf('.')
    if (extensionIndex <= 0) {
      return null
    }

    return baseName.slice(extensionIndex).toLowerCase()
  }

  const comparablePath = normalizedPath.replaceAll('\\', '/')
  const directExtension = extractExtension(comparablePath)
  if (directExtension && !/[?#]/u.test(directExtension)) {
    return directExtension
  }

  const fallbackPath = comparablePath.split(/[?#]/u)[0]
  const baseName = fallbackPath.split('/').pop() || ''
  const extensionIndex = baseName.lastIndexOf('.')
  if (extensionIndex <= 0) {
    return null
  }

  return baseName.slice(extensionIndex).toLowerCase()
}

/**
 * “复制图片”当前只对 Electron 能稳定解码并写入剪贴板的格式开放。
 * 菜单层先做同步能力收口，runtime 还会再次校验，避免 UI 与底层能力脱节。
 */
function isCopyImageSupportedAsset(asset) {
  if (asset?.assetType !== 'image') {
    return false
  }

  const extension = deriveAssetExtension(asset?.rawPath)
    || deriveAssetExtension(asset?.rawSrc)
    || deriveAssetExtension(asset?.resourceUrl)

  return COPY_IMAGE_SUPPORTED_EXTENSION_SET.has(extension)
}

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

    if (copyImageSupported) {
      items.push(createMenuItem('resource.copy-image', 'previewAssetMenu.copyImage'))
    }

    if (isImageAsset) {
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

  if (copyImageSupported) {
    items.push(createMenuItem('resource.copy-image', 'previewAssetMenu.copyImage'))
  }

  if (isImageAsset) {
    items.push(createMenuItem('resource.save-as', 'previewAssetMenu.saveAs'))
  }

  appendMarkdownReferenceItem(items)

  if (profile === 'editor-preview') {
    items.push(createMenuItem('resource.delete', 'previewAssetMenu.delete', true))
  }

  return items
}

export {
  buildPreviewContextMenuItems,
}

export default {
  buildPreviewContextMenuItems,
}
