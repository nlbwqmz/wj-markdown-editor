import resourceFileUtil from '../resourceFileUtil.js'
import { deriveDocumentSnapshot } from './documentSnapshotUtil.js'

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

function normalizeResourcePayload(payload) {
  if (typeof payload === 'string') {
    return {
      resourceUrl: payload,
      rawPath: null,
      requestContext: null,
    }
  }

  return {
    resourceUrl: typeof payload?.resourceUrl === 'string' ? payload.resourceUrl : null,
    rawPath: typeof payload?.rawPath === 'string' ? payload.rawPath : null,
    requestContext: payload?.requestContext && typeof payload.requestContext === 'object'
      ? {
          sessionId: typeof payload.requestContext.sessionId === 'string' ? payload.requestContext.sessionId : null,
          documentPath: typeof payload.requestContext.documentPath === 'string' ? payload.requestContext.documentPath : null,
        }
      : null,
  }
}

function normalizeComparablePayload(payload) {
  if (typeof payload === 'string') {
    return payload
  }
  return typeof payload?.rawPath === 'string' ? payload.rawPath : null
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

  async function openInFolder({ windowId, payload }) {
    const session = getSessionByWindowIdOrThrow(store, windowId)
    const normalizedPayload = normalizeResourcePayload(payload)
    if (isStaleRequestContext(session, normalizedPayload.requestContext)) {
      return {
        ok: false,
        opened: false,
        reason: 'stale-document-context',
        path: null,
      }
    }

    const documentContext = createResourceContext(session)
    return await resourceFileUtil.openLocalResourceInFolder(
      documentContext,
      normalizedPayload,
      showItemInFolder,
    )
  }

  async function deleteLocal({ windowId, payload }) {
    const session = getSessionByWindowIdOrThrow(store, windowId)
    const normalizedPayload = normalizeResourcePayload(payload)
    if (isStaleRequestContext(session, normalizedPayload.requestContext)) {
      return {
        ok: false,
        removed: false,
        reason: 'stale-document-context',
        path: null,
      }
    }

    const documentContext = createResourceContext(session)
    return await resourceFileUtil.deleteLocalResource(
      documentContext,
      normalizedPayload.resourceUrl,
    )
  }

  async function getInfo({ windowId, payload }) {
    const session = getSessionByWindowIdOrThrow(store, windowId)
    const normalizedPayload = normalizeResourcePayload(payload)
    if (isStaleRequestContext(session, normalizedPayload.requestContext)) {
      return {
        ok: false,
        reason: 'stale-document-context',
        decodedPath: null,
        exists: false,
        isDirectory: false,
        isFile: false,
        path: null,
      }
    }

    const documentContext = createResourceContext(session)
    return await resourceFileUtil.getLocalResourceInfo(
      documentContext,
      normalizedPayload.resourceUrl,
    )
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
    deleteLocal,
    getInfo,
    getComparableKey,
  }
}

export default {
  createDocumentResourceService,
}
