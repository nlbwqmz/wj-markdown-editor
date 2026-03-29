import path from 'node:path'
import resourceFileUtil from '../resourceFileUtil.js'
import { deriveDocumentSnapshot } from './documentSnapshotUtil.js'
import {
  buildRemoteSaveFileName,
  createRemoteImageSaveMetadataProbe,
  deriveRemoteFileNameFromUrl,
  isReliableRemoteImageFileName,
} from './remoteImageSaveFileNameUtil.js'

const DANGEROUS_SCHEME_SET = new Set([
  'about',
  'blob',
  'chrome',
  'data',
  'edge',
  'file',
  'ftp',
  'ftps',
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
const COPY_IMAGE_SUPPORTED_EXTENSION_SET = new Set([
  '.png',
  '.jpg',
  '.jpeg',
])

const DEFAULT_REMOTE_IMAGE_FETCH_TIMEOUT_MS = 15 * 1000
const DEFAULT_REMOTE_IMAGE_SAVE_PROBE_TIMEOUT_MS = 1000
const DEFAULT_REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024
const RESOURCE_ACTION_FAILURE_MESSAGE_KEY_MAP = {
  'source-type-mismatch': 'message.previewAssetSourceTypeMismatch',
  'invalid-remote-resource': 'message.previewAssetRemoteResourceInvalid',
  'remote-fetch-not-configured': 'message.previewAssetRemoteFetchUnavailable',
  'remote-resource-fetch-failed': 'message.previewAssetRemoteResourceFetchFailed',
  'remote-resource-not-image': 'message.previewAssetRemoteResourceNotImage',
  'remote-resource-too-large': 'message.previewAssetRemoteResourceTooLarge',
  'remote-resource-fetch-timeout': 'message.previewAssetRemoteResourceFetchTimeout',
  'local-resource-not-image': 'message.previewAssetLocalResourceNotImage',
  'copy-image-format-unsupported': 'message.previewAssetCopyImageFormatUnsupported',
}

function normalizeComparablePath(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    return null
  }

  const normalizedText = targetPath.trim()
  if (/^[a-z]:[\\/]/i.test(normalizedText) || normalizedText.startsWith('\\\\')) {
    return normalizedText.replaceAll('/', '\\').toLowerCase()
  }

  return normalizedText.replaceAll('\\', '/')
}

function getSessionByWindowIdOrThrow(store, windowId) {
  const session = store?.getSessionByWindowId?.(windowId)
  if (!session) {
    throw new Error(`windowId 对应的 active session 不存在: ${windowId}`)
  }
  return session
}

function normalizeStringValue(value) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue || null
}

function normalizeSourceType(value) {
  return value === 'local' || value === 'remote' ? value : null
}

function normalizePositiveInteger(value, fallbackValue) {
  if (typeof value !== 'number' || Number.isFinite(value) !== true || value <= 0) {
    return fallbackValue
  }

  return Math.floor(value)
}

function getSourceScheme(value) {
  const normalizedValue = normalizeStringValue(value)
  if (!normalizedValue) {
    return null
  }

  const schemeMatch = /^([a-z][a-z\d+.-]*):/i.exec(normalizedValue)
  return schemeMatch ? schemeMatch[1].toLowerCase() : null
}

function classifySourceCandidate(value) {
  const normalizedValue = normalizeStringValue(value)
  if (!normalizedValue) {
    return null
  }

  if (/^https?:\/\//i.test(normalizedValue)) {
    return 'remote'
  }

  if (normalizedValue.startsWith('wj://')) {
    return 'local'
  }

  if (normalizedValue.startsWith('#') || normalizedValue.startsWith('//')) {
    return 'dangerous'
  }

  const scheme = getSourceScheme(normalizedValue)
  if (!scheme) {
    return 'local'
  }

  if (/^[a-z]:[\\/]/i.test(normalizedValue)) {
    return 'local'
  }

  if (DANGEROUS_SCHEME_SET.has(scheme) || normalizedValue.slice(scheme.length + 1).startsWith('//')) {
    return 'dangerous'
  }

  return 'local'
}

function resolveRuntimeSourceType(payload) {
  const candidateTypeList = [
    classifySourceCandidate(payload?.resourceUrl),
    classifySourceCandidate(payload?.rawSrc),
    classifySourceCandidate(payload?.rawPath),
  ].filter(Boolean)

  if (candidateTypeList.length === 0 || candidateTypeList.includes('dangerous')) {
    return null
  }

  const hasLocalSource = candidateTypeList.includes('local')
  const hasRemoteSource = candidateTypeList.includes('remote')
  if (hasLocalSource && hasRemoteSource) {
    return null
  }

  if (hasRemoteSource) {
    return 'remote'
  }

  return hasLocalSource ? 'local' : null
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

function parseContentLength(contentLength) {
  const normalizedContentLength = normalizeStringValue(contentLength)
  if (!normalizedContentLength) {
    return null
  }

  const parsedValue = Number.parseInt(normalizedContentLength, 10)
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return null
  }

  return parsedValue
}

function isAbortError(error) {
  return error?.name === 'AbortError'
}

function normalizeBufferChunk(chunk) {
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk)
  }

  if (chunk instanceof ArrayBuffer) {
    return Buffer.from(chunk)
  }

  if (ArrayBuffer.isView(chunk)) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  }

  return null
}

function sanitizeFileName(fileName) {
  const normalizedFileName = normalizeStringValue(fileName)
  if (!normalizedFileName) {
    return null
  }

  const safeFileName = normalizedFileName.replace(/[<>:"/\\|?*]/g, '-')
  return safeFileName || null
}

function deriveLocalFileName(targetPath) {
  const normalizedPath = normalizeStringValue(targetPath)
  if (!normalizedPath) {
    return 'image.png'
  }

  return sanitizeFileName(path.basename(normalizedPath)) || 'image.png'
}

function deriveCopyImageExtension(targetPathOrUrl) {
  const normalizedValue = normalizeStringValue(targetPathOrUrl)
  if (!normalizedValue) {
    return null
  }

  try {
    if (/^(?:https?|wj):\/\//iu.test(normalizedValue)) {
      const urlObject = new URL(normalizedValue)
      const pathName = decodeURIComponent(urlObject.pathname || '')
      const extension = path.posix.extname(path.posix.basename(pathName))
      return extension ? extension.toLowerCase() : null
    }
  } catch {
    // URL 解析失败时回退到普通路径裁决。
  }

  const comparablePath = normalizedValue.replaceAll('\\', '/')
  const baseName = comparablePath.split('/').pop() || ''
  const directExtension = path.posix.extname(baseName)
  if (directExtension && !/[?#]/u.test(directExtension)) {
    return directExtension.toLowerCase()
  }

  const fallbackPath = comparablePath.split(/[?#]/u)[0]
  const fallbackBaseName = fallbackPath.split('/').pop() || ''
  const fallbackExtension = path.posix.extname(fallbackBaseName)
  return fallbackExtension ? fallbackExtension.toLowerCase() : null
}

function isCopyImageFormatSupported(targetPathOrUrl) {
  return COPY_IMAGE_SUPPORTED_EXTENSION_SET.has(deriveCopyImageExtension(targetPathOrUrl))
}

function deriveRemoteFileName(remoteUrl, contentType) {
  let remoteFileName = null
  try {
    const urlObject = new URL(remoteUrl)
    const pathName = typeof urlObject.pathname === 'string' ? decodeURIComponent(urlObject.pathname) : ''
    remoteFileName = sanitizeFileName(path.posix.basename(pathName))
  } catch {
    remoteFileName = null
  }

  const imageExtension = getImageExtensionFromContentType(contentType)
  if (!remoteFileName || remoteFileName === '.') {
    return `image${imageExtension || '.png'}`
  }

  const remotePathInfo = path.posix.parse(remoteFileName)
  const normalizedBaseName = sanitizeFileName(remotePathInfo.name) || 'image'
  if (imageExtension) {
    return `${normalizedBaseName}${imageExtension}`
  }

  if (remotePathInfo.ext) {
    return `${normalizedBaseName}${remotePathInfo.ext}`
  }

  return `${normalizedBaseName}.png`
}

function getResourceActionFailureMessageKey(reason) {
  if (typeof reason !== 'string' || !reason) {
    return null
  }

  return resourceFileUtil.getLocalResourceFailureMessageKey(reason)
    || RESOURCE_ACTION_FAILURE_MESSAGE_KEY_MAP[reason]
    || null
}

function createTextCopySuccessResult(text, options = {}) {
  return {
    ok: true,
    reason: 'copied',
    text,
    ...(options.path ? { path: options.path } : {}),
  }
}

function createTextCopyFailureResult(reason, options = {}) {
  const messageKey = typeof options.messageKey === 'string'
    ? options.messageKey
    : getResourceActionFailureMessageKey(reason)
  return {
    ok: false,
    reason,
    text: null,
    ...(options.path !== undefined ? { path: options.path } : {}),
    ...(messageKey ? { messageKey } : {}),
  }
}

function createBinaryActionFailureResult(reason, options = {}) {
  const messageKey = typeof options.messageKey === 'string'
    ? options.messageKey
    : getResourceActionFailureMessageKey(reason)
  return {
    ok: false,
    reason,
    ...(options.path ? { path: options.path } : {}),
    ...(messageKey ? { messageKey } : {}),
  }
}

function createOpenFolderFailureResult(reason, options = {}) {
  const messageKey = typeof options.messageKey === 'string'
    ? options.messageKey
    : getResourceActionFailureMessageKey(reason)
  return {
    ok: false,
    opened: false,
    reason,
    path: options.path ?? null,
    ...(messageKey ? { messageKey } : {}),
  }
}

function createDeleteFailureResult(reason, options = {}) {
  const messageKey = typeof options.messageKey === 'string'
    ? options.messageKey
    : getResourceActionFailureMessageKey(reason)
  return {
    ok: false,
    removed: false,
    reason,
    path: options.path ?? null,
    ...(messageKey ? { messageKey } : {}),
  }
}

function createResourceInfoFailureResult(reason, options = {}) {
  const messageKey = typeof options.messageKey === 'string'
    ? options.messageKey
    : getResourceActionFailureMessageKey(reason)
  return {
    ok: false,
    reason,
    decodedPath: options.decodedPath ?? null,
    exists: false,
    isDirectory: false,
    isFile: false,
    path: options.path ?? null,
    ...(messageKey ? { messageKey } : {}),
  }
}

function normalizeResourcePayload(payload) {
  if (typeof payload === 'string') {
    return {
      sourceType: null,
      resourceUrl: payload,
      rawSrc: null,
      rawPath: null,
      requestContext: null,
    }
  }

  return {
    sourceType: normalizeSourceType(payload?.sourceType),
    resourceUrl: normalizeStringValue(payload?.resourceUrl),
    rawSrc: normalizeStringValue(payload?.rawSrc),
    rawPath: normalizeStringValue(payload?.rawPath),
    requestContext: payload?.requestContext && typeof payload.requestContext === 'object'
      ? {
          sessionId: normalizeStringValue(payload.requestContext.sessionId),
          documentPath: normalizeStringValue(payload.requestContext.documentPath),
        }
      : null,
  }
}

function normalizeComparablePayload(payload) {
  if (typeof payload === 'string') {
    return {
      rawPath: payload,
    }
  }
  return {
    rawPath: normalizeStringValue(payload?.rawPath),
    resourceUrl: normalizeStringValue(payload?.resourceUrl),
  }
}

function createResourceContext(session) {
  const snapshot = deriveDocumentSnapshot(session)
  return {
    documentPath: session?.documentSource?.path || null,
    content: session?.editorSnapshot?.content || '',
    saved: snapshot.saved,
    exists: snapshot.exists,
  }
}

/**
 * 资源服务只负责两件事：
 * 1. 从当前 active session 提取稳定的资源解析上下文
 * 2. 把具体文件系统能力委托给底层 resource util
 *
 * 这里故意不把 `winInfo` 暴露给上层调用方。
 * 原因是 Task 6 的目标就是把资源能力从旧窗口状态容器里剥离出来，
 * 避免 renderer、IPC、窗口菜单各自偷读 `winInfo.path/tempContent` 形成多套真相。
 */
export function createDocumentResourceService({
  store,
  showItemInFolder = () => {},
  dialogApi = null,
  clipboardApi = null,
  nativeImageApi = null,
  fetchImpl = null,
  fsModule = null,
  remoteImageFetchTimeoutMs = DEFAULT_REMOTE_IMAGE_FETCH_TIMEOUT_MS,
  remoteImageSaveProbeTimeoutMs = DEFAULT_REMOTE_IMAGE_SAVE_PROBE_TIMEOUT_MS,
  remoteImageMaxBytes = DEFAULT_REMOTE_IMAGE_MAX_BYTES,
}) {
  const resolvedRemoteImageFetchTimeoutMs = normalizePositiveInteger(
    remoteImageFetchTimeoutMs,
    DEFAULT_REMOTE_IMAGE_FETCH_TIMEOUT_MS,
  )
  const resolvedRemoteImageSaveProbeTimeoutMs = normalizePositiveInteger(
    remoteImageSaveProbeTimeoutMs,
    DEFAULT_REMOTE_IMAGE_SAVE_PROBE_TIMEOUT_MS,
  )
  const resolvedRemoteImageMaxBytes = normalizePositiveInteger(
    remoteImageMaxBytes,
    DEFAULT_REMOTE_IMAGE_MAX_BYTES,
  )
  const probeRemoteImageSaveMetadata = createRemoteImageSaveMetadataProbe({
    fetchImpl,
    timeoutMs: resolvedRemoteImageSaveProbeTimeoutMs,
  })

  function isStaleRequestContext(session, requestContext) {
    if (!requestContext) {
      return false
    }

    if (requestContext.sessionId && requestContext.sessionId !== session?.sessionId) {
      return true
    }

    const requestDocumentPath = normalizeComparablePath(requestContext.documentPath)
    const currentDocumentPath = normalizeComparablePath(session?.documentSource?.path || null)
    if (requestDocumentPath !== currentDocumentPath) {
      return true
    }

    return false
  }

  function getSessionResourceContext(windowId) {
    const session = getSessionByWindowIdOrThrow(store, windowId)
    return createResourceContext(session)
  }

  function createCapturedActionContext(session, normalizedPayload) {
    return {
      sessionId: normalizeStringValue(session?.sessionId),
      documentPath: normalizeComparablePath(session?.documentSource?.path || null),
      requestContext: normalizedPayload?.requestContext || null,
    }
  }

  function isCapturedActionContextStale(windowId, capturedActionContext) {
    const currentSession = store?.getSessionByWindowId?.(windowId) || null
    if (!currentSession) {
      return true
    }

    if (capturedActionContext?.sessionId
      && capturedActionContext.sessionId !== currentSession.sessionId) {
      return true
    }

    const currentDocumentPath = normalizeComparablePath(currentSession?.documentSource?.path || null)
    if (capturedActionContext?.documentPath !== currentDocumentPath) {
      return true
    }

    return isStaleRequestContext(currentSession, capturedActionContext?.requestContext)
  }

  function getStaleActionError(windowId, capturedActionContext, staleResultFactory) {
    return isCapturedActionContextStale(windowId, capturedActionContext)
      ? staleResultFactory()
      : null
  }

  function getFreshActionContext(windowId, payload, staleResultFactory) {
    const session = getSessionByWindowIdOrThrow(store, windowId)
    const normalizedPayload = normalizeResourcePayload(payload)
    if (isStaleRequestContext(session, normalizedPayload.requestContext)) {
      return {
        error: staleResultFactory(),
      }
    }

    return {
      session,
      normalizedPayload,
      documentContext: createResourceContext(session),
      capturedActionContext: createCapturedActionContext(session, normalizedPayload),
    }
  }

  function isSourceTypeAccepted(payload, expectedSourceType) {
    const runtimeSourceType = resolveRuntimeSourceType(payload)
    if (runtimeSourceType !== expectedSourceType) {
      return false
    }

    if (payload?.sourceType && payload.sourceType !== runtimeSourceType) {
      return false
    }

    return true
  }

  async function resolveLocalImageSource(documentContext, payload) {
    const resourceInfo = await resourceFileUtil.resolveLocalResource(documentContext, payload, {
      preferPathnameFallback: true,
    })
    if (resourceInfo.ok !== true) {
      return createBinaryActionFailureResult(resourceInfo.reason, {
        path: resourceInfo.path,
      })
    }

    if (resourceInfo.exists !== true) {
      return createBinaryActionFailureResult('not-found', {
        path: resourceInfo.path,
      })
    }

    if (resourceInfo.isDirectory === true) {
      return createBinaryActionFailureResult('directory-not-allowed', {
        path: resourceInfo.path,
      })
    }

    if (resourceInfo.isFile !== true) {
      return createBinaryActionFailureResult('unsupported-target', {
        path: resourceInfo.path,
      })
    }

    return {
      ok: true,
      path: resourceInfo.path,
      fileName: deriveLocalFileName(resourceInfo.path),
    }
  }

  async function readResolvedLocalImageBuffer(localImageSource) {
    try {
      const buffer = await fsModule?.readFile?.(localImageSource.path)
      return {
        ...localImageSource,
        buffer,
      }
    } catch {
      return createBinaryActionFailureResult('read-local-resource-failed', {
        path: localImageSource.path,
      })
    }
  }

  async function fetchRemoteImageBuffer(remoteUrl) {
    if (typeof fetchImpl !== 'function') {
      return createBinaryActionFailureResult('remote-fetch-not-configured')
    }

    const normalizedRemoteUrl = normalizeStringValue(remoteUrl)
    if (!normalizedRemoteUrl) {
      return createBinaryActionFailureResult('invalid-remote-resource')
    }

    const abortController = typeof AbortController === 'function'
      ? new AbortController()
      : null
    const timeoutId = setTimeout(() => {
      abortController?.abort()
    }, resolvedRemoteImageFetchTimeoutMs)

    try {
      const response = await fetchImpl(normalizedRemoteUrl, {
        ...(abortController ? { signal: abortController.signal } : {}),
      })
      if (!response?.ok) {
        return createBinaryActionFailureResult('remote-resource-fetch-failed')
      }

      const contentType = normalizeContentType(response.headers?.get?.('content-type'))
      if (!contentType?.startsWith('image/')) {
        return createBinaryActionFailureResult('remote-resource-not-image')
      }

      const contentLength = parseContentLength(response.headers?.get?.('content-length'))
      if (contentLength !== null && contentLength > resolvedRemoteImageMaxBytes) {
        return createBinaryActionFailureResult('remote-resource-too-large')
      }

      let buffer = null
      let readAbortedBySizeLimit = false
      let streamReader = null

      try {
        streamReader = typeof response.body?.getReader === 'function'
          ? response.body.getReader()
          : null
      } catch {
        streamReader = null
      }

      if (streamReader) {
        const chunkBufferList = []
        let totalBytes = 0

        try {
          while (true) {
            const { done, value } = await streamReader.read()
            if (done) {
              break
            }

            const chunkBuffer = normalizeBufferChunk(value)
            if (!chunkBuffer) {
              return createBinaryActionFailureResult('remote-resource-fetch-failed')
            }

            totalBytes += chunkBuffer.byteLength
            if (totalBytes > resolvedRemoteImageMaxBytes) {
              readAbortedBySizeLimit = true
              abortController?.abort()
              try {
                await streamReader.cancel('remote-resource-too-large')
              } catch {
                // 部分 fetch 实现不支持主动取消，超限后直接按结构化错误返回即可。
              }
              return createBinaryActionFailureResult('remote-resource-too-large')
            }

            chunkBufferList.push(chunkBuffer)
          }

          buffer = Buffer.concat(chunkBufferList, totalBytes)
        } catch (error) {
          if (readAbortedBySizeLimit || isAbortError(error)) {
            return createBinaryActionFailureResult(
              readAbortedBySizeLimit ? 'remote-resource-too-large' : 'remote-resource-fetch-timeout',
            )
          }
          return createBinaryActionFailureResult('remote-resource-fetch-failed')
        }
      } else {
        const arrayBuffer = await response.arrayBuffer()
        buffer = Buffer.from(arrayBuffer)
      }

      if (buffer.byteLength > resolvedRemoteImageMaxBytes) {
        return createBinaryActionFailureResult('remote-resource-too-large')
      }

      return {
        ok: true,
        buffer,
        fileName: deriveRemoteFileName(normalizedRemoteUrl, contentType),
        contentType,
      }
    } catch (error) {
      if (isAbortError(error)) {
        return createBinaryActionFailureResult('remote-resource-fetch-timeout')
      }
      return createBinaryActionFailureResult('remote-resource-fetch-failed')
    } finally {
      clearTimeout(timeoutId)
    }
  }

  function createNativeImageFromBuffer(buffer) {
    if (typeof nativeImageApi?.createFromBuffer !== 'function') {
      return null
    }

    return nativeImageApi.createFromBuffer(buffer)
  }

  async function resolveRemoteImageSaveSource(windowId, payload, capturedActionContext) {
    const remoteUrl = normalizeStringValue(payload?.rawSrc)
    if (!remoteUrl) {
      return createBinaryActionFailureResult('invalid-remote-resource')
    }

    const urlFileName = deriveRemoteFileNameFromUrl(remoteUrl)
    let probeMetadata = null

    if (isReliableRemoteImageFileName(urlFileName) !== true) {
      const staleBeforeProbeError = getStaleActionError(
        windowId,
        capturedActionContext,
        () => createBinaryActionFailureResult('stale-document-context'),
      )
      if (staleBeforeProbeError) {
        return staleBeforeProbeError
      }

      // 默认文件名探测阶段只观察响应头，失败统一静默回退到最终文件名裁决。
      probeMetadata = await probeRemoteImageSaveMetadata(remoteUrl)

      const staleAfterProbeError = getStaleActionError(
        windowId,
        capturedActionContext,
        () => createBinaryActionFailureResult('stale-document-context'),
      )
      if (staleAfterProbeError) {
        return staleAfterProbeError
      }
    }

    return {
      ok: true,
      remoteUrl,
      fileName: buildRemoteSaveFileName({
        urlFileName,
        headerFileName: probeMetadata?.fileName,
        contentType: probeMetadata?.contentType,
      }),
    }
  }

  function buildSaveAsSuccessResult(selectedPath) {
    return {
      ok: true,
      reason: 'saved',
      path: selectedPath,
      targetPath: selectedPath,
      messageKey: 'message.saveAsSuccessfully',
    }
  }

  async function openInFolder({ windowId, payload }) {
    const actionContext = getFreshActionContext(windowId, payload, () => createOpenFolderFailureResult('stale-document-context'))
    if (actionContext.error) {
      return actionContext.error
    }

    if (isSourceTypeAccepted(actionContext.normalizedPayload, 'local') !== true) {
      return createOpenFolderFailureResult('source-type-mismatch')
    }

    return await resourceFileUtil.openLocalResourceInFolder(
      actionContext.documentContext,
      actionContext.normalizedPayload,
      showItemInFolder,
    )
  }

  async function deleteLocal({ windowId, payload }) {
    const actionContext = getFreshActionContext(windowId, payload, () => createDeleteFailureResult('stale-document-context'))
    if (actionContext.error) {
      return actionContext.error
    }

    if (isSourceTypeAccepted(actionContext.normalizedPayload, 'local') !== true) {
      return createDeleteFailureResult('source-type-mismatch')
    }

    return await resourceFileUtil.deleteLocalResource(
      actionContext.documentContext,
      actionContext.normalizedPayload,
    )
  }

  async function getInfo({ windowId, payload }) {
    const actionContext = getFreshActionContext(windowId, payload, () => createResourceInfoFailureResult('stale-document-context'))
    if (actionContext.error) {
      return actionContext.error
    }

    if (isSourceTypeAccepted(actionContext.normalizedPayload, 'local') !== true) {
      return createResourceInfoFailureResult('source-type-mismatch')
    }

    return await resourceFileUtil.getLocalResourceInfo(
      actionContext.documentContext,
      actionContext.normalizedPayload,
    )
  }

  async function copyAbsolutePath({ windowId, payload }) {
    const actionContext = getFreshActionContext(windowId, payload, () => {
      return createTextCopyFailureResult('stale-document-context', {
        path: null,
      })
    })
    if (actionContext.error) {
      return actionContext.error
    }

    if (isSourceTypeAccepted(actionContext.normalizedPayload, 'local') !== true) {
      return createTextCopyFailureResult('source-type-mismatch')
    }

    try {
      const resourceTarget = resourceFileUtil.resolveLocalResourceTarget(
        actionContext.documentContext,
        actionContext.normalizedPayload,
      )
      if (resourceTarget.ok !== true) {
        return createTextCopyFailureResult(resourceTarget.reason, {
          path: resourceTarget.path,
        })
      }

      let resolvedPath = resourceTarget.path
      if (resourceFileUtil.hasDistinctFallbackPath(resourceTarget) === true) {
        try {
          // 复制绝对路径也要沿用本地资源动作的 query/hash 裁决：
          // 先探测完整路径，只有完整路径不可用时才回退到 pathname fallback。
          const resolvedResource = await resourceFileUtil.resolveLocalResource(
            actionContext.documentContext,
            actionContext.normalizedPayload,
            {
              preferPathnameFallback: true,
            },
          )
          if (resolvedResource.ok === true && resolvedResource.path) {
            resolvedPath = resolvedResource.path
          }
        } catch {
          // 剪贴板文本复制不能因为磁盘探测失败而结构化失败，探测异常时回退到完整解析路径。
          resolvedPath = resourceTarget.path
        }
      }

      return createTextCopySuccessResult(resolvedPath, {
        path: resolvedPath,
      })
    } catch {
      return createTextCopyFailureResult('copy-absolute-path-failed')
    }
  }

  async function copyLink({ windowId, payload }) {
    const actionContext = getFreshActionContext(windowId, payload, () => {
      return createTextCopyFailureResult('stale-document-context')
    })
    if (actionContext.error) {
      return actionContext.error
    }

    if (isSourceTypeAccepted(actionContext.normalizedPayload, 'remote') !== true) {
      return createTextCopyFailureResult('source-type-mismatch')
    }

    const remoteText = normalizeStringValue(actionContext.normalizedPayload.rawSrc)
    if (!remoteText) {
      return createTextCopyFailureResult('invalid-remote-resource')
    }

    return createTextCopySuccessResult(remoteText)
  }

  async function copyImage({ windowId, payload }) {
    const actionContext = getFreshActionContext(windowId, payload, () => ({
      ok: false,
      reason: 'stale-document-context',
    }))
    if (actionContext.error) {
      return actionContext.error
    }

    const runtimeSourceType = resolveRuntimeSourceType(actionContext.normalizedPayload)
    if (!runtimeSourceType
      || (actionContext.normalizedPayload.sourceType
        && actionContext.normalizedPayload.sourceType !== runtimeSourceType)) {
      return createBinaryActionFailureResult('source-type-mismatch')
    }

    let imageBufferResult = null
    if (runtimeSourceType === 'local') {
      const localImageSource = await resolveLocalImageSource(
        actionContext.documentContext,
        actionContext.normalizedPayload,
      )
      if (localImageSource.ok !== true) {
        return localImageSource
      }

      if (isCopyImageFormatSupported(localImageSource.path) !== true) {
        return createBinaryActionFailureResult('copy-image-format-unsupported', {
          path: localImageSource.path,
        })
      }

      imageBufferResult = await readResolvedLocalImageBuffer(localImageSource)
    } else {
      const remoteImageUrl = actionContext.normalizedPayload.rawSrc
      if (!remoteImageUrl) {
        return createBinaryActionFailureResult('invalid-remote-resource')
      }
      if (isCopyImageFormatSupported(remoteImageUrl) !== true) {
        return createBinaryActionFailureResult('copy-image-format-unsupported')
      }

      imageBufferResult = await fetchRemoteImageBuffer(remoteImageUrl)
    }
    if (imageBufferResult.ok !== true) {
      return imageBufferResult
    }

    const staleActionError = getStaleActionError(
      windowId,
      actionContext.capturedActionContext,
      () => createBinaryActionFailureResult('stale-document-context'),
    )
    if (staleActionError) {
      return staleActionError
    }

    try {
      const nativeImage = createNativeImageFromBuffer(imageBufferResult.buffer)
      if (!nativeImage || nativeImage.isEmpty?.() === true) {
        return createBinaryActionFailureResult(
          runtimeSourceType === 'remote' ? 'remote-resource-not-image' : 'local-resource-not-image',
          {
            path: imageBufferResult.path,
          },
        )
      }

      clipboardApi?.writeImage?.(nativeImage)
      return {
        ok: true,
        reason: 'copied',
        ...(imageBufferResult.path ? { path: imageBufferResult.path } : {}),
      }
    } catch {
      return createBinaryActionFailureResult('copy-image-failed', {
        path: imageBufferResult.path,
      })
    }
  }

  async function saveAs({ windowId, payload }) {
    const actionContext = getFreshActionContext(windowId, payload, () => ({
      ok: false,
      reason: 'stale-document-context',
    }))
    if (actionContext.error) {
      return actionContext.error
    }

    const runtimeSourceType = resolveRuntimeSourceType(actionContext.normalizedPayload)
    if (!runtimeSourceType
      || (actionContext.normalizedPayload.sourceType
        && actionContext.normalizedPayload.sourceType !== runtimeSourceType)) {
      return createBinaryActionFailureResult('source-type-mismatch')
    }

    try {
      const saveSource = runtimeSourceType === 'local'
        ? await resolveLocalImageSource(actionContext.documentContext, actionContext.normalizedPayload)
        : await resolveRemoteImageSaveSource(
            windowId,
            actionContext.normalizedPayload,
            actionContext.capturedActionContext,
          )
      if (saveSource.ok !== true) {
        return saveSource
      }

      const staleBeforeDialogError = getStaleActionError(
        windowId,
        actionContext.capturedActionContext,
        () => createBinaryActionFailureResult('stale-document-context'),
      )
      if (staleBeforeDialogError) {
        return staleBeforeDialogError
      }

      const selectedPath = dialogApi?.showSaveDialogSync?.({
        defaultPath: saveSource.fileName,
      })
      if (!selectedPath) {
        return {
          ok: false,
          cancelled: true,
          reason: 'cancelled',
        }
      }

      const staleAfterDialogError = getStaleActionError(
        windowId,
        actionContext.capturedActionContext,
        () => createBinaryActionFailureResult('stale-document-context'),
      )
      if (staleAfterDialogError) {
        return staleAfterDialogError
      }

      if (runtimeSourceType === 'local') {
        if (normalizeComparablePath(selectedPath) === normalizeComparablePath(saveSource.path)) {
          const sourceBuffer = await fsModule?.readFile?.(saveSource.path)
          await fsModule?.writeFile?.(selectedPath, sourceBuffer)
        } else {
          await fsModule?.copyFile?.(saveSource.path, selectedPath)
        }

        return buildSaveAsSuccessResult(selectedPath)
      }

      const remoteImageBufferResult = await fetchRemoteImageBuffer(saveSource.remoteUrl)
      if (remoteImageBufferResult.ok !== true) {
        return remoteImageBufferResult
      }

      const staleAfterFetchError = getStaleActionError(
        windowId,
        actionContext.capturedActionContext,
        () => createBinaryActionFailureResult('stale-document-context'),
      )
      if (staleAfterFetchError) {
        return staleAfterFetchError
      }

      await fsModule?.writeFile?.(selectedPath, remoteImageBufferResult.buffer)
      return buildSaveAsSuccessResult(selectedPath)
    } catch {
      return createBinaryActionFailureResult('save-as-failed')
    }
  }

  function getComparableKey({ windowId, payload }) {
    const documentContext = getSessionResourceContext(windowId)
    return resourceFileUtil.getLocalResourceComparableKey(
      documentContext,
      normalizeComparablePayload(payload),
    )
  }

  return {
    getSessionResourceContext,
    openInFolder,
    copyAbsolutePath,
    copyLink,
    copyImage,
    saveAs,
    deleteLocal,
    getInfo,
    getComparableKey,
  }
}

export default {
  createDocumentResourceService,
}
