import { normalizeLocalResourcePath } from '../resourceUrlUtil.js'

const KNOWN_ASSET_TYPE_SET = new Set(['image', 'video', 'audio', 'link'])
const DANGEROUS_SCHEME_SET = new Set([
  'about',
  'blob',
  'chrome',
  'data',
  'edge',
  'file',
  'ftp',
  'ftps',
  'http',
  'https',
  'javascript',
  'mailto',
  'sftp',
  'smb',
  'ssh',
  'tel',
  'view-source',
  'ws',
  'wss',
])

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
  const normalizedAssetType = normalizeStringValue(assetType)
  if (normalizedAssetType && KNOWN_ASSET_TYPE_SET.has(normalizedAssetType)) {
    return normalizedAssetType
  }

  const normalizedLegacyKind = normalizeStringValue(legacyKind)
  if (normalizedLegacyKind && KNOWN_ASSET_TYPE_SET.has(normalizedLegacyKind)) {
    return normalizedLegacyKind
  }

  return 'unknown'
}

/**
 * 提取冒号前的前缀，供来源类型判定复用。
 * @param {string | null} value - 待提取的来源字符串
 * @returns {string | null} 小写 scheme 前缀
 */
function getSourceScheme(value) {
  if (!value) {
    return null
  }

  const schemeMatch = /^([a-z][a-z\d+.-]*):/iu.exec(value)
  return schemeMatch ? schemeMatch[1].toLowerCase() : null
}

/**
 * 判断输入是否属于危险的未知来源形态。
 * 这类输入一旦混入上下文，即使有稳定来源也要 fail-closed。
 * @param {string | null} value - 待判定的来源字符串
 * @returns {boolean} 是否为危险未知来源
 */
function isDangerousUnknownSource(value) {
  if (!value) {
    return false
  }

  if (value.startsWith('#') || value.startsWith('//')) {
    return true
  }

  const scheme = getSourceScheme(value)
  if (!scheme) {
    return false
  }

  if (DANGEROUS_SCHEME_SET.has(scheme)) {
    return true
  }

  return value.slice(scheme.length + 1).startsWith('//')
}

/**
 * 把单个来源字符串归类为本地、远程或危险来源。
 * 除了显式远程和显式危险输入，其余非冲突形态统一按本地候选处理。
 * @param {unknown} value - 待归类的来源输入
 * @returns {'local' | 'remote' | 'dangerous' | null} 来源分类
 */
function classifySourceCandidate(value) {
  const normalizedValue = normalizeStringValue(value)
  if (!normalizedValue) {
    return null
  }

  const inspectionValue = normalizeLocalResourcePath(normalizedValue)

  if (/^https?:\/\//iu.test(inspectionValue)) {
    return 'remote'
  }

  if (/^wj:\/\//iu.test(inspectionValue)) {
    return 'local'
  }

  if (isDangerousUnknownSource(inspectionValue)) {
    return 'dangerous'
  }

  return 'local'
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

  if (candidateTypeList.length === 0 || candidateTypeList.includes('dangerous')) {
    return null
  }

  const hasLocalSource = candidateTypeList.includes('local')
  const hasRemoteSource = candidateTypeList.includes('remote')

  if (hasRemoteSource && hasLocalSource) {
    return null
  }

  if (hasRemoteSource) {
    return 'remote'
  }

  return hasLocalSource ? 'local' : null
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
