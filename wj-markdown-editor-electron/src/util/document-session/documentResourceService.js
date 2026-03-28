import path from 'node:path'
import resourceFileUtil from '../resourceFileUtil.js'
import { deriveDocumentSnapshot } from './documentSnapshotUtil.js'

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
  ['image/svg+xml', '.svg'],
  ['image/bmp', '.bmp'],
  ['image/x-icon', '.ico'],
  ['image/vnd.microsoft.icon', '.ico'],
])

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

function deriveRemoteFileName(remoteUrl, contentType) {
  let remoteFileName = null
  try {
    const urlObject = new URL(remoteUrl)
    const pathName = typeof urlObject.pathname === 'string' ? decodeURIComponent(urlObject.pathname) : ''
    remoteFileName = sanitizeFileName(path.posix.basename(pathName))
  } catch {
    remoteFileName = null
  }

  const imageExtension = getImageExtensionFromContentType(contentType) || '.png'
  if (!remoteFileName || remoteFileName === '.') {
    return `image${imageExtension}`
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

function createTextCopySuccessResult(text, options = {}) {
  return {
    ok: true,
    reason: 'copied',
    text,
    ...(options.path ? { path: options.path } : {}),
  }
}

function createTextCopyFailureResult(reason, options = {}) {
  return {
    ok: false,
    reason,
    text: null,
    ...(options.path !== undefined ? { path: options.path } : {}),
  }
}

function createBinaryActionFailureResult(reason, options = {}) {
  return {
    ok: false,
    reason,
    ...(options.path ? { path: options.path } : {}),
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
}) {
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

  async function readLocalImageBuffer(documentContext, payload) {
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

    try {
      const buffer = await fsModule?.readFile?.(resourceInfo.path)
      return {
        ok: true,
        buffer,
        path: resourceInfo.path,
        fileName: deriveLocalFileName(resourceInfo.path),
      }
    } catch {
      return createBinaryActionFailureResult('read-local-resource-failed', {
        path: resourceInfo.path,
      })
    }
  }

  async function fetchRemoteImageBuffer(remoteUrl) {
    if (typeof fetchImpl !== 'function') {
      return createBinaryActionFailureResult('remote-fetch-not-configured')
    }

    let response = null
    try {
      response = await fetchImpl(remoteUrl)
    } catch {
      return createBinaryActionFailureResult('remote-resource-fetch-failed')
    }

    if (!response?.ok) {
      return createBinaryActionFailureResult('remote-resource-fetch-failed')
    }

    const contentType = normalizeContentType(response.headers?.get?.('content-type'))
    if (!contentType?.startsWith('image/')) {
      return createBinaryActionFailureResult('remote-resource-not-image')
    }

    try {
      const arrayBuffer = await response.arrayBuffer()
      return {
        ok: true,
        buffer: Buffer.from(arrayBuffer),
        fileName: deriveRemoteFileName(remoteUrl, contentType),
        contentType,
      }
    } catch {
      return createBinaryActionFailureResult('remote-resource-fetch-failed')
    }
  }

  function createNativeImageFromBuffer(buffer) {
    if (typeof nativeImageApi?.createFromBuffer !== 'function') {
      return null
    }

    return nativeImageApi.createFromBuffer(buffer)
  }

  async function openInFolder({ windowId, payload }) {
    const actionContext = getFreshActionContext(windowId, payload, () => ({
      ok: false,
      opened: false,
      reason: 'stale-document-context',
      path: null,
    }))
    if (actionContext.error) {
      return actionContext.error
    }

    return await resourceFileUtil.openLocalResourceInFolder(
      actionContext.documentContext,
      actionContext.normalizedPayload,
      showItemInFolder,
    )
  }

  async function deleteLocal({ windowId, payload }) {
    const actionContext = getFreshActionContext(windowId, payload, () => ({
      ok: false,
      removed: false,
      reason: 'stale-document-context',
      path: null,
    }))
    if (actionContext.error) {
      return actionContext.error
    }

    return await resourceFileUtil.deleteLocalResource(
      actionContext.documentContext,
      actionContext.normalizedPayload,
    )
  }

  async function getInfo({ windowId, payload }) {
    const actionContext = getFreshActionContext(windowId, payload, () => ({
      ok: false,
      reason: 'stale-document-context',
      decodedPath: null,
      exists: false,
      isDirectory: false,
      isFile: false,
      path: null,
    }))
    if (actionContext.error) {
      return actionContext.error
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
      const resourceInfo = await resourceFileUtil.resolveLocalResource(
        actionContext.documentContext,
        actionContext.normalizedPayload,
      )
      if (resourceInfo.ok !== true) {
        return createTextCopyFailureResult(resourceInfo.reason, {
          path: resourceInfo.path,
        })
      }

      return createTextCopySuccessResult(resourceInfo.path, {
        path: resourceInfo.path,
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

    const imageBufferResult = runtimeSourceType === 'local'
      ? await readLocalImageBuffer(actionContext.documentContext, actionContext.normalizedPayload)
      : await fetchRemoteImageBuffer(actionContext.normalizedPayload.rawSrc || actionContext.normalizedPayload.resourceUrl)
    if (imageBufferResult.ok !== true) {
      return imageBufferResult
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

    const imageBufferResult = runtimeSourceType === 'local'
      ? await readLocalImageBuffer(actionContext.documentContext, actionContext.normalizedPayload)
      : await fetchRemoteImageBuffer(actionContext.normalizedPayload.rawSrc || actionContext.normalizedPayload.resourceUrl)
    if (imageBufferResult.ok !== true) {
      return imageBufferResult
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

      const selectedPath = dialogApi?.showSaveDialogSync?.({
        defaultPath: imageBufferResult.fileName,
      })
      if (!selectedPath) {
        return {
          ok: false,
          cancelled: true,
          reason: 'cancelled',
        }
      }

      await fsModule?.writeFile?.(selectedPath, imageBufferResult.buffer)
      return {
        ok: true,
        reason: 'saved',
        targetPath: selectedPath,
        messageKey: 'message.saveAsSuccessfully',
      }
    } catch {
      return createBinaryActionFailureResult('save-as-failed', {
        path: imageBufferResult.path,
      })
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
