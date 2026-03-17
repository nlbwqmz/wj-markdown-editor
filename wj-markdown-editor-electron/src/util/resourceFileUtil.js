import path from 'node:path'
import fs from 'fs-extra'
import commonUtil from './commonUtil.js'

function createResolveResult(ok, reason, options = {}) {
  return {
    ok,
    reason,
    decodedPath: options.decodedPath ?? null,
    exists: options.exists === true,
    isDirectory: options.isDirectory === true,
    isFile: options.isFile === true,
    path: options.path ?? null,
  }
}

function getLocalResourceFailureMessageKey(reason) {
  if (reason === 'not-found') {
    return 'message.theFileDoesNotExist'
  }
  if (reason === 'relative-resource-without-document') {
    return 'message.relativeResourceRequiresSavedFile'
  }
  // `open-failed` 代表底层 shell / 文件系统已经明确失败。
  // 这个分支必须继续走统一消息 key，而不是让上层各自特判，
  // 否则旧 IPC、窗口内链接点击和后续新资源命令会再次分叉出多套提示语义。
  if (reason === 'open-failed') {
    return 'message.openResourceLocationFailed'
  }
  if (reason === 'invalid-resource-url' || reason === 'invalid-resource-payload') {
    return 'message.invalidLocalResourceLink'
  }
  return null
}

function createDeleteResult(ok, removed, reason, resolvedPath = null) {
  return {
    ok,
    removed,
    reason,
    path: resolvedPath,
  }
}

function createOpenFolderResult(ok, opened, reason, resolvedPath = null) {
  return {
    ok,
    opened,
    reason,
    path: resolvedPath,
  }
}

function createResourceInfoResult(ok, resolvedPath, options = {}) {
  return {
    ok,
    reason: options.reason ?? (ok === true ? 'resolved' : 'invalid-resource'),
    decodedPath: options.decodedPath ?? null,
    exists: options.exists === true,
    isDirectory: options.isDirectory === true,
    isFile: options.isFile === true,
    path: resolvedPath,
  }
}

function createComparableKey(resolvedPath) {
  if (!resolvedPath) {
    return null
  }
  const normalizedPath = resolvedPath.replace(/\\/g, '/')
  const comparablePath = /^[a-z]:\//i.test(normalizedPath) ? normalizedPath.toLowerCase() : normalizedPath
  return `wj-local-file:${comparablePath}`
}

function normalizeResourceOpenInput(resourceData) {
  if (resourceData && typeof resourceData === 'object') {
    return {
      resourceUrl: typeof resourceData.resourceUrl === 'string' ? resourceData.resourceUrl : null,
      rawPath: typeof resourceData.rawPath === 'string' ? resourceData.rawPath : null,
    }
  }
  return {
    resourceUrl: typeof resourceData === 'string' ? resourceData : null,
    rawPath: null,
  }
}

function getDocumentPathFromContext(documentContext) {
  return typeof documentContext?.documentPath === 'string' && documentContext.documentPath.trim() !== ''
    ? documentContext.documentPath
    : null
}

/**
 * 同步比较 key 查询必须保持“尽力返回结果”。
 *
 * 这个 helper 故意吞掉 `pathExistsSync` 的异常，
 * 因为当前编辑区引用统计是同步流程，任何底层瞬时 I/O 异常都不应该把整次右键删除交互打崩。
 */
function pathExistsSyncSafe(targetPath) {
  if (!targetPath) {
    return false
  }
  try {
    return fs.pathExistsSync(targetPath)
  } catch {
    return false
  }
}

function attachResourceErrorContext(error, { decodedPath, resolvedPath }) {
  if (error && typeof error === 'object') {
    error.decodedPath = decodedPath ?? null
    error.resourcePath = resolvedPath ?? null
  }
  return error
}

function resolveRawLocalPath(documentContext, rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return null
  }
  if (path.isAbsolute(rawPath)) {
    return path.normalize(rawPath)
  }
  const documentPath = getDocumentPathFromContext(documentContext)
  if (!documentPath) {
    return null
  }
  return path.resolve(path.dirname(documentPath), rawPath)
}

function decodeRawLocalPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return rawPath
  }
  let decodedPath = rawPath
  try {
    decodedPath = decodeURIComponent(rawPath)
  } catch {
    decodedPath = rawPath
  }
  return decodedPath.replace(/\\/g, '/')
}

function extractRawPathname(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return rawPath
  }
  const queryIndex = rawPath.indexOf('?')
  const hashIndex = rawPath.indexOf('#')
  const suffixIndexList = [queryIndex, hashIndex].filter(index => index >= 0)
  if (suffixIndexList.length === 0) {
    return rawPath
  }
  return rawPath.slice(0, Math.min(...suffixIndexList))
}

function getLocalResourceComparableKey(documentContext, rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return null
  }

  const trimmedRawPath = rawPath.trim()
  if (!trimmedRawPath || trimmedRawPath.startsWith('#') || trimmedRawPath.startsWith('//')) {
    return null
  }

  const hasExplicitScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmedRawPath)
  const isWindowsAbsolutePath = /^[a-z]:[\\/]/i.test(trimmedRawPath)
  if (hasExplicitScheme && !isWindowsAbsolutePath) {
    return null
  }

  const exactResolvedPath = resolveRawLocalPath(documentContext, trimmedRawPath)
  if (pathExistsSyncSafe(exactResolvedPath)) {
    return createComparableKey(exactResolvedPath)
  }

  const pathname = extractRawPathname(trimmedRawPath)
  if (pathname !== trimmedRawPath) {
    const pathnameResolvedPath = resolveRawLocalPath(documentContext, pathname)
    if (pathExistsSyncSafe(pathnameResolvedPath)) {
      return createComparableKey(pathnameResolvedPath)
    }
    return null
  }

  return createComparableKey(exactResolvedPath)
}

async function enrichResolvedPath(decodedPath, resolvedPath) {
  try {
    if (!await fs.pathExists(resolvedPath)) {
      return createResolveResult(true, 'resolved', {
        decodedPath,
        path: resolvedPath,
      })
    }

    const resourceStat = await fs.stat(resolvedPath)
    return createResolveResult(true, 'resolved', {
      decodedPath,
      path: resolvedPath,
      exists: true,
      isDirectory: resourceStat.isDirectory(),
      isFile: resourceStat.isFile(),
    })
  } catch (error) {
    throw attachResourceErrorContext(error, {
      decodedPath,
      resolvedPath,
    })
  }
}

async function resolveLocalResource(documentContext, resourceUrl) {
  if (!resourceUrl || typeof resourceUrl !== 'string' || !resourceUrl.startsWith('wj://')) {
    return createResolveResult(false, 'invalid-resource-url')
  }

  let decodedPath = null
  try {
    decodedPath = commonUtil.decodeWjUrl(resourceUrl)
  } catch {
    return createResolveResult(false, 'invalid-resource-payload')
  }

  if (path.isAbsolute(decodedPath)) {
    return await enrichResolvedPath(decodedPath, decodedPath)
  }

  const documentPath = getDocumentPathFromContext(documentContext)
  if (!documentPath) {
    return createResolveResult(false, 'relative-resource-without-document', {
      decodedPath,
    })
  }

  return await enrichResolvedPath(
    decodedPath,
    path.resolve(path.dirname(documentPath), decodedPath),
  )
}

/**
 * 解析本地资源对应的真实文件路径
 * @param {object} documentContext - 当前文档上下文
 * @param {string} resourceUrl - wj 协议资源地址
 * @returns {string | null} 解析后的本地文件路径，无法解析时返回 null
 */
function resolveLocalResourcePath(documentContext, resourceUrl) {
  if (!resourceUrl || typeof resourceUrl !== 'string' || !resourceUrl.startsWith('wj://')) {
    return null
  }

  let decodedPath = null
  try {
    decodedPath = commonUtil.decodeWjUrl(resourceUrl)
  } catch {
    return null
  }

  if (path.isAbsolute(decodedPath)) {
    return decodedPath
  }
  const documentPath = getDocumentPathFromContext(documentContext)
  if (!documentPath) {
    return null
  }

  return path.resolve(path.dirname(documentPath), decodedPath)
}

/**
 * 删除本地资源文件，不存在时直接忽略
 * @param {object} documentContext - 当前文档上下文
 * @param {string} resourceUrl - wj 协议资源地址
 * @returns {Promise<object>} 结构化删除结果
 */
async function deleteLocalResource(documentContext, resourceUrl) {
  let resolvedPath = resolveLocalResourcePath(documentContext, resourceUrl)
  try {
    const resourceInfo = await resolveLocalResource(documentContext, resourceUrl)
    resolvedPath = resourceInfo.path
    if (resourceInfo.ok !== true) {
      return createDeleteResult(false, false, resourceInfo.reason, resourceInfo.path)
    }

    if (resourceInfo.exists !== true) {
      return createDeleteResult(true, false, 'not-found', resourceInfo.path)
    }

    if (resourceInfo.isDirectory === true) {
      return createDeleteResult(false, false, 'directory-not-allowed', resourceInfo.path)
    }
    if (resourceInfo.isFile !== true) {
      return createDeleteResult(false, false, 'unsupported-target', resourceInfo.path)
    }

    await fs.remove(resourceInfo.path)
    return createDeleteResult(true, true, 'deleted', resourceInfo.path)
  } catch (error) {
    // 删除动作一旦进入文件系统分支，就必须在主进程内统一吸收异常并裁决成 `delete-failed`。
    // 否则 renderer 无法区分“还能继续只清理 Markdown”的软失败，和“本地文件其实没删掉”的硬失败，
    // 会直接把原文误清掉，造成设计文档禁止的语义回退。
    return createDeleteResult(false, false, 'delete-failed', error?.resourcePath ?? resolvedPath)
  }
}

async function openLocalResourceInFolder(documentContext, resourceUrl, showItemInFolder) {
  const { resourceUrl: normalizedResourceUrl, rawPath } = normalizeResourceOpenInput(resourceUrl)
  let resolvedPath = resolveLocalResourcePath(documentContext, normalizedResourceUrl)
  try {
    const resourceInfo = await resolveLocalResource(documentContext, normalizedResourceUrl)
    resolvedPath = resourceInfo.path
    if (resourceInfo.ok !== true) {
      return createOpenFolderResult(false, false, resourceInfo.reason, resourceInfo.path)
    }

    if (resourceInfo.exists !== true && rawPath) {
      const pathname = extractRawPathname(rawPath)
      if (pathname !== rawPath) {
        const pathnameResolvedPath = resolveRawLocalPath(documentContext, decodeRawLocalPath(pathname))
        if (pathnameResolvedPath && await fs.pathExists(pathnameResolvedPath)) {
          resolvedPath = pathnameResolvedPath
          showItemInFolder(pathnameResolvedPath)
          return createOpenFolderResult(true, true, 'opened', pathnameResolvedPath)
        }
      }
    }

    if (resourceInfo.exists !== true) {
      return createOpenFolderResult(true, false, 'not-found', resourceInfo.path)
    }

    resolvedPath = resourceInfo.path
    showItemInFolder(resourceInfo.path)
    return createOpenFolderResult(true, true, 'opened', resourceInfo.path)
  } catch (error) {
    // “在资源管理器打开”只允许把结构化结果回给上层，不能把 shell / fs 的原始异常抛给 renderer。
    // 这样旧 IPC、新 IPC、预览区 query/hash 回退三条兼容链路，才能共享同一个 `open-failed` 裁决出口。
    return createOpenFolderResult(false, false, 'open-failed', error?.resourcePath ?? resolvedPath)
  }
}

async function getLocalResourceInfo(documentContext, resourceUrl) {
  let resolvedPath = resolveLocalResourcePath(documentContext, resourceUrl)
  try {
    const resolveResult = await resolveLocalResource(documentContext, resourceUrl)
    return createResourceInfoResult(resolveResult.ok, resolveResult.path, resolveResult)
  } catch (error) {
    resolvedPath = error?.resourcePath ?? resolvedPath
    return createResourceInfoResult(false, resolvedPath, {
      reason: 'info-failed',
      decodedPath: error?.decodedPath ?? null,
    })
  }
}

export default {
  getLocalResourceFailureMessageKey,
  getLocalResourceComparableKey,
  openLocalResourceInFolder,
  getLocalResourceInfo,
  resolveLocalResource,
  resolveLocalResourcePath,
  deleteLocalResource,
}
