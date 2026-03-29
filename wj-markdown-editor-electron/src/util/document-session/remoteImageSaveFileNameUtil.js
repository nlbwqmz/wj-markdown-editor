import path from 'node:path'

const DEFAULT_REMOTE_IMAGE_PROBE_TIMEOUT_MS = 1000
const INVALID_FILE_NAME_CHARACTER_REGEXP = /[<>:"/\\|?*]/g
const WINDOWS_RESERVED_BASE_NAME_SET = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'clock$',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
])
const GENERIC_REMOTE_BASE_NAME_SET = new Set([
  'download',
  'file',
  'image',
])
const IMAGE_CONTENT_TYPE_EXTENSION_MAP = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif'],
  ['image/svg+xml', '.svg'],
  ['image/bmp', '.bmp'],
  ['image/x-icon', '.ico'],
  ['image/vnd.microsoft.icon', '.ico'],
])
const RELIABLE_IMAGE_EXTENSION_SET = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.bmp',
  '.ico',
])

function normalizeStringValue(value) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue || null
}

function normalizePositiveInteger(value, fallbackValue) {
  if (typeof value !== 'number' || Number.isFinite(value) !== true || value <= 0) {
    return fallbackValue
  }

  return Math.floor(value)
}

function normalizeContentType(contentType) {
  const normalizedContentType = normalizeStringValue(contentType)
  if (!normalizedContentType) {
    return null
  }

  return normalizedContentType.split(';')[0].trim().toLowerCase()
}

function getImageExtensionFromContentType(contentType) {
  return IMAGE_CONTENT_TYPE_EXTENSION_MAP.get(normalizeContentType(contentType)) || null
}

function stripTrailingDotsAndSpaces(value) {
  return value.replace(/[.\s]+$/g, '')
}

function sanitizeFileNameText(fileName) {
  const normalizedFileName = normalizeStringValue(fileName)
  if (!normalizedFileName) {
    return null
  }

  const withoutWindowsControlCharacter = Array.from(normalizedFileName)
    .filter(character => character.charCodeAt(0) > 0x1F)
    .join('')
  const sanitizedFileName = stripTrailingDotsAndSpaces(
    withoutWindowsControlCharacter.replace(INVALID_FILE_NAME_CHARACTER_REGEXP, ''),
  )

  return sanitizedFileName || null
}

function sanitizeBaseNamePartWithMetadata(baseName) {
  const sanitizedBaseName = sanitizeFileNameText(baseName)
  if (!sanitizedBaseName) {
    return {
      value: null,
      usedReservedFallback: false,
      isGenericBaseName: false,
    }
  }

  const normalizedBaseName = sanitizedBaseName.toLowerCase()
  if (WINDOWS_RESERVED_BASE_NAME_SET.has(normalizedBaseName)) {
    return {
      value: 'image',
      usedReservedFallback: true,
      isGenericBaseName: true,
    }
  }

  return {
    value: sanitizedBaseName,
    usedReservedFallback: false,
    isGenericBaseName: GENERIC_REMOTE_BASE_NAME_SET.has(normalizedBaseName),
  }
}

function sanitizeFileExtension(extension) {
  const sanitizedExtension = sanitizeFileNameText(extension)
  if (!sanitizedExtension) {
    return null
  }

  const normalizedExtension = sanitizedExtension.startsWith('.')
    ? sanitizedExtension.toLowerCase()
    : `.${sanitizedExtension.toLowerCase()}`

  return normalizedExtension === '.' ? null : normalizedExtension
}

function parseRemoteFileNameCandidate(fileName) {
  const sanitizedFileName = sanitizeFileNameText(fileName)
  if (!sanitizedFileName) {
    return {
      fileName: null,
      baseName: null,
      extension: null,
      imageExtension: null,
      isGenericBaseName: false,
      isReliableImageFileName: false,
      usedReservedFallback: false,
    }
  }

  if (sanitizedFileName.startsWith('.')) {
    const extension = sanitizeFileExtension(sanitizedFileName)
    return {
      fileName: null,
      baseName: null,
      extension,
      imageExtension: RELIABLE_IMAGE_EXTENSION_SET.has(extension) ? extension : null,
      isGenericBaseName: false,
      isReliableImageFileName: false,
      usedReservedFallback: false,
    }
  }

  const extensionStartIndex = sanitizedFileName.lastIndexOf('.')
  const rawBaseName = extensionStartIndex > 0
    ? sanitizedFileName.slice(0, extensionStartIndex)
    : sanitizedFileName
  const rawExtension = extensionStartIndex > 0
    ? sanitizedFileName.slice(extensionStartIndex)
    : null
  const baseNameState = sanitizeBaseNamePartWithMetadata(rawBaseName)
  const extension = sanitizeFileExtension(rawExtension)
  const imageExtension = RELIABLE_IMAGE_EXTENSION_SET.has(extension) ? extension : null
  const fileNameValue = baseNameState.value
    ? `${baseNameState.value}${extension || ''}`
    : null

  return {
    fileName: fileNameValue,
    baseName: baseNameState.value,
    extension,
    imageExtension,
    isGenericBaseName: baseNameState.isGenericBaseName,
    isReliableImageFileName: Boolean(
      baseNameState.value
      && imageExtension
      && baseNameState.usedReservedFallback !== true
      && baseNameState.isGenericBaseName !== true,
    ),
    usedReservedFallback: baseNameState.usedReservedFallback,
  }
}

function unwrapQuotedHeaderValue(value) {
  const normalizedValue = normalizeStringValue(value)
  if (!normalizedValue) {
    return null
  }

  if (normalizedValue.startsWith('"') && normalizedValue.endsWith('"')) {
    return normalizedValue.slice(1, -1)
  }

  return normalizedValue
}

function getContentDispositionParameterValue(headerValue, parameterName) {
  const normalizedHeaderValue = normalizeStringValue(headerValue)
  if (!normalizedHeaderValue) {
    return null
  }

  const parameterRegExp = new RegExp(`(?:^|;)\\s*${parameterName}\\s*=\\s*(\"[^\"]*\"|[^;]*)`, 'i')
  const matchedValue = parameterRegExp.exec(normalizedHeaderValue)
  return matchedValue ? unwrapQuotedHeaderValue(matchedValue[1]) : null
}

function decodeContentDispositionExtendedValue(value) {
  const normalizedValue = unwrapQuotedHeaderValue(value)
  if (!normalizedValue) {
    return null
  }

  const firstQuoteIndex = normalizedValue.indexOf('\'')
  const secondQuoteIndex = firstQuoteIndex >= 0
    ? normalizedValue.indexOf('\'', firstQuoteIndex + 1)
    : -1
  const encodedFileName = secondQuoteIndex >= 0
    ? normalizedValue.slice(secondQuoteIndex + 1)
    : normalizedValue

  try {
    return decodeURIComponent(encodedFileName)
  } catch {
    return null
  }
}

function isAbortError(error) {
  return error?.name === 'AbortError'
}

function canUseHeaderBaseName(candidate) {
  return Boolean(
    candidate?.baseName
    && candidate.isGenericBaseName !== true
    && candidate.usedReservedFallback !== true,
  )
}

export function sanitizeRemoteFileNamePart(fileNamePart) {
  return sanitizeBaseNamePartWithMetadata(fileNamePart).value
}

export function deriveRemoteFileNameFromUrl(remoteUrl) {
  const normalizedRemoteUrl = normalizeStringValue(remoteUrl)
  if (!normalizedRemoteUrl) {
    return null
  }

  try {
    const urlObject = new URL(normalizedRemoteUrl)
    let pathName = typeof urlObject.pathname === 'string' ? urlObject.pathname : ''
    try {
      pathName = decodeURIComponent(pathName)
    } catch {
      pathName = typeof urlObject.pathname === 'string' ? urlObject.pathname : ''
    }

    return parseRemoteFileNameCandidate(path.posix.basename(pathName)).fileName
  } catch {
    return null
  }
}

export function isReliableRemoteImageFileName(fileName) {
  return parseRemoteFileNameCandidate(fileName).isReliableImageFileName
}

export function parseContentDispositionFileName(headerValue) {
  const extendedFileName = decodeContentDispositionExtendedValue(
    getContentDispositionParameterValue(headerValue, 'filename\\*'),
  )
  if (extendedFileName) {
    return parseRemoteFileNameCandidate(extendedFileName).fileName
  }

  const simpleFileName = getContentDispositionParameterValue(headerValue, 'filename')
  return parseRemoteFileNameCandidate(simpleFileName).fileName
}

export function buildRemoteSaveFileName({
  urlFileName,
  headerFileName,
  contentType,
} = {}) {
  const urlCandidate = parseRemoteFileNameCandidate(urlFileName)
  const headerCandidate = parseRemoteFileNameCandidate(headerFileName)
  const contentTypeExtension = getImageExtensionFromContentType(contentType)
  const hasUsableHeaderBaseName = canUseHeaderBaseName(headerCandidate)

  // 这里是唯一的状态机闭合点：基础名与扩展名分别按来源优先级裁决，不复用 probe 决策语义。
  const preferredBaseName = hasUsableHeaderBaseName
    ? headerCandidate.baseName
    : urlCandidate.baseName || headerCandidate.baseName || 'image'
  const preferredExtension = (hasUsableHeaderBaseName ? headerCandidate.imageExtension : null)
    || contentTypeExtension
    || urlCandidate.imageExtension
    || '.png'

  return `${sanitizeRemoteFileNamePart(preferredBaseName) || 'image'}${preferredExtension || '.png'}`
}

export function createRemoteImageSaveMetadataProbe({
  fetchImpl,
  timeoutMs = DEFAULT_REMOTE_IMAGE_PROBE_TIMEOUT_MS,
  AbortControllerClass = typeof AbortController === 'function' ? AbortController : null,
} = {}) {
  const resolvedTimeoutMs = normalizePositiveInteger(
    timeoutMs,
    DEFAULT_REMOTE_IMAGE_PROBE_TIMEOUT_MS,
  )

  return async function probeRemoteImageSaveMetadata(remoteUrl) {
    const normalizedRemoteUrl = normalizeStringValue(remoteUrl)
    if (!normalizedRemoteUrl || typeof fetchImpl !== 'function') {
      return { ok: false }
    }

    const abortController = typeof AbortControllerClass === 'function'
      ? new AbortControllerClass()
      : null
    const timeoutId = setTimeout(() => {
      abortController?.abort()
    }, resolvedTimeoutMs)

    try {
      const response = await fetchImpl(normalizedRemoteUrl, {
        method: 'HEAD',
        ...(abortController ? { signal: abortController.signal } : {}),
      })

      if (!response?.ok) {
        return { ok: false }
      }

      // probe 只允许观察响应头，任何失败都静默回退给统一文件名裁决。
      return {
        ok: true,
        fileName: parseContentDispositionFileName(response.headers?.get?.('content-disposition')),
        contentType: normalizeContentType(response.headers?.get?.('content-type')),
      }
    } catch (error) {
      if (isAbortError(error)) {
        return { ok: false }
      }

      return { ok: false }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

export default {
  sanitizeRemoteFileNamePart,
  deriveRemoteFileNameFromUrl,
  isReliableRemoteImageFileName,
  parseContentDispositionFileName,
  buildRemoteSaveFileName,
  createRemoteImageSaveMetadataProbe,
}
