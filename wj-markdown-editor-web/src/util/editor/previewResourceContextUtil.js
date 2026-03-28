const KNOWN_ASSET_TYPE_SET = new Set(['image', 'video', 'audio', 'link'])

/**
 * 归一化字符串输入，避免把空串当成有效元信息。
 * @param {unknown} value - 待归一化的输入
 * @returns {string | null} 非空字符串或 null
 */
function normalizeStringValue(value) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue || null
}

/**
 * 把过渡期的 kind 收口为最终对外暴露的 assetType。
 * @param {unknown} assetType - 首选的资源类型输入
 * @param {unknown} legacyKind - 兼容旧字段的资源类型输入
 * @returns {string} 归一化后的资源类型
 */
function normalizeAssetType(assetType, legacyKind) {
  const normalizedType = normalizeStringValue(assetType) || normalizeStringValue(legacyKind)
  return normalizedType && KNOWN_ASSET_TYPE_SET.has(normalizedType) ? normalizedType : 'unknown'
}

/**
 * 判断输入是否属于可稳定识别的本地来源。
 * @param {string | null} value - 待判定的来源字符串
 * @returns {boolean} 是否为稳定本地来源
 */
function isStableLocalSource(value) {
  if (!value) {
    return false
  }

  if (/^wj:\/\//iu.test(value) || /^file:\/\//iu.test(value)) {
    return true
  }

  if (/^[a-z]:[\\/]/iu.test(value) || /^\\\\/u.test(value)) {
    return true
  }

  if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
    return true
  }

  if (value.startsWith('#') || value.startsWith('//')) {
    return false
  }

  if (/^[a-z][a-z\d+.-]*:/iu.test(value)) {
    return false
  }

  return true
}

/**
 * 把单个来源字符串归类为本地、远程或未知。
 * @param {unknown} value - 待归类的来源输入
 * @returns {'local' | 'remote' | 'unknown' | null} 来源分类
 */
function classifySourceCandidate(value) {
  const normalizedValue = normalizeStringValue(value)
  if (!normalizedValue) {
    return null
  }

  if (/^https?:\/\//iu.test(normalizedValue)) {
    return 'remote'
  }

  if (isStableLocalSource(normalizedValue)) {
    return 'local'
  }

  return 'unknown'
}

/**
 * 基于多路输入共同判定来源类型，冲突或未知时 fail-closed。
 * @param {object | null | undefined} assetInfo - 资源上下文输入
 * @returns {'local' | 'remote' | null} 可稳定判定的来源类型
 */
function resolveSourceType(assetInfo) {
  const candidateTypeList = [
    classifySourceCandidate(assetInfo?.resourceUrl),
    classifySourceCandidate(assetInfo?.rawSrc),
    classifySourceCandidate(assetInfo?.rawPath),
  ].filter(Boolean)

  const hasLocalSource = candidateTypeList.includes('local')
  const hasRemoteSource = candidateTypeList.includes('remote')

  if (hasLocalSource && hasRemoteSource) {
    return null
  }

  if (hasLocalSource) {
    return 'local'
  }

  if (hasRemoteSource) {
    return 'remote'
  }

  return null
}

function createPreviewResourceContext(assetInfo) {
  // 没有可识别资源地址时，直接返回空，避免后续菜单动作落到无效上下文上。
  const resourceUrl = normalizeStringValue(assetInfo?.resourceUrl)
  if (!resourceUrl) {
    return null
  }

  const sourceType = resolveSourceType(assetInfo)
  if (!sourceType) {
    return null
  }

  const rawSrc = normalizeStringValue(assetInfo?.rawSrc)
  const rawPath = normalizeStringValue(assetInfo?.rawPath)
  const markdownReference = normalizeStringValue(assetInfo?.markdownReference)

  return {
    type: 'resource',
    asset: {
      assetType: normalizeAssetType(assetInfo?.assetType, assetInfo?.kind),
      sourceType,
      rawSrc,
      rawPath,
      resourceUrl,
      markdownReference,
      occurrence: assetInfo.occurrence,
      lineStart: assetInfo.lineStart,
      lineEnd: assetInfo.lineEnd,
    },
    menuPosition: {
      x: assetInfo.clientX ?? 0,
      y: assetInfo.clientY ?? 0,
    },
  }
}

export {
  createPreviewResourceContext,
}

export default {
  createPreviewResourceContext,
}
