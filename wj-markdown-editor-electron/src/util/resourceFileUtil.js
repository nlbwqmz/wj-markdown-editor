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

function createResolvedTargetResult(ok, reason, options = {}) {
  return {
    ok,
    reason,
    decodedPath: options.decodedPath ?? null,
    path: options.path ?? null,
    fallbackPath: options.fallbackPath ?? null,
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
  if (reason === 'resource-path-conflict') {
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

function normalizeStringValue(value) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue || null
}

function isWindowsAbsolutePath(targetPath) {
  return typeof targetPath === 'string' && /^[a-z]:[\\/]/i.test(targetPath)
}

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

function getScheme(targetPath) {
  if (typeof targetPath !== 'string') {
    return null
  }

  const schemeMatch = /^([a-z][a-z\d+.-]*):/i.exec(targetPath)
  return schemeMatch ? schemeMatch[1].toLowerCase() : null
}

function isDangerousExplicitSource(targetPath) {
  const scheme = getScheme(targetPath)
  if (!scheme) {
    return false
  }

  if (DANGEROUS_SCHEME_SET.has(scheme)) {
    return true
  }

  return targetPath.slice(scheme.length + 1).startsWith('//')
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

function resolveDecodedLocalPath(documentContext, decodedPath) {
  if (!decodedPath || typeof decodedPath !== 'string') {
    return null
  }

  if (path.isAbsolute(decodedPath)) {
    return path.normalize(decodedPath)
  }

  const documentPath = getDocumentPathFromContext(documentContext)
  if (!documentPath) {
    return null
  }

  return path.resolve(path.dirname(documentPath), decodedPath)
}

function resolveDecodedAbsolutePath(decodedPath, options = {}) {
  if (path.isAbsolute(decodedPath) !== true) {
    return null
  }

  if (options.normalizeAbsolutePath === true) {
    return path.normalize(decodedPath)
  }

  return decodedPath
}

function resolveRawLocalPath(documentContext, rawPath) {
  if (!rawPath || typeof rawPath !== 'string') {
    return null
  }

  return resolveDecodedLocalPath(documentContext, decodeRawLocalPath(rawPath))
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

function resolveRawPathFallbackPath(documentContext, rawPath) {
  const normalizedRawPath = normalizeStringValue(rawPath)
  if (!normalizedRawPath) {
    return null
  }

  const pathname = extractRawPathname(normalizedRawPath)
  if (pathname === normalizedRawPath) {
    return null
  }

  return resolveRawLocalPath(documentContext, pathname)
}

function createRawPathCandidate(documentContext, rawPath) {
  const normalizedRawPath = normalizeStringValue(rawPath)
  if (!normalizedRawPath) {
    return createResolvedTargetResult(false, 'missing-raw-path')
  }

  if (normalizedRawPath.startsWith('#') || normalizedRawPath.startsWith('//')) {
    return {
      participates: false,
    }
  }

  const decodedPath = decodeRawLocalPath(normalizedRawPath)
  if (isDangerousExplicitSource(decodedPath) && !isWindowsAbsolutePath(decodedPath)) {
    return {
      participates: false,
    }
  }

  const resolvedPath = resolveDecodedAbsolutePath(decodedPath, {
    normalizeAbsolutePath: true,
  }) || resolveDecodedLocalPath(documentContext, decodedPath)
  if (!resolvedPath) {
    return {
      participates: true,
      ...createResolvedTargetResult(false, 'relative-resource-without-document', {
        decodedPath,
      }),
    }
  }

  return {
    participates: true,
    ...createResolvedTargetResult(true, 'resolved', {
      decodedPath,
      path: resolvedPath,
      fallbackPath: resolveRawPathFallbackPath(documentContext, normalizedRawPath),
    }),
  }
}

function createResourceUrlCandidate(documentContext, resourceUrl) {
  const normalizedResourceUrl = normalizeStringValue(resourceUrl)
  if (!normalizedResourceUrl) {
    return {
      participates: false,
    }
  }

  if (!normalizedResourceUrl.startsWith('wj://')) {
    return {
      participates: false,
    }
  }

  let decodedPath = null
  try {
    decodedPath = commonUtil.decodeWjUrl(normalizedResourceUrl)
  } catch {
    return {
      participates: true,
      ...createResolvedTargetResult(false, 'invalid-resource-payload'),
    }
  }

  const resolvedPath = resolveDecodedAbsolutePath(decodedPath, {
    normalizeAbsolutePath: false,
  }) || resolveDecodedLocalPath(documentContext, decodedPath)
  if (!resolvedPath) {
    return {
      participates: true,
      ...createResolvedTargetResult(false, 'relative-resource-without-document', {
        decodedPath,
      }),
    }
  }

  return {
    participates: true,
    ...createResolvedTargetResult(true, 'resolved', {
      decodedPath,
      path: resolvedPath,
    }),
  }
}

function isSameResolvedPath(firstPath, secondPath) {
  if (!firstPath || !secondPath) {
    return false
  }

  const normalizeResolvedPathForCompare = (targetPath) => {
    if (typeof targetPath !== 'string' || targetPath.trim() === '') {
      return null
    }

    const normalizedText = targetPath.trim()
    if (/^[a-z]:[\\/]/i.test(normalizedText) || normalizedText.startsWith('\\\\')) {
      return path.win32.normalize(normalizedText.replace(/\//g, '\\')).toLowerCase()
    }

    return path.posix.normalize(normalizedText.replace(/\\/g, '/'))
  }

  return normalizeResolvedPathForCompare(firstPath) === normalizeResolvedPathForCompare(secondPath)
}

function resolveLocalResourceTarget(documentContext, resourceData) {
  const normalizedResourceData = normalizeResourceOpenInput(resourceData)
  const rawPathCandidate = createRawPathCandidate(documentContext, normalizedResourceData.rawPath)
  const resourceUrlCandidate = createResourceUrlCandidate(documentContext, normalizedResourceData.resourceUrl)

  if (rawPathCandidate.participates === true) {
    if (rawPathCandidate.ok !== true) {
      return createResolvedTargetResult(false, rawPathCandidate.reason, {
        decodedPath: rawPathCandidate.decodedPath,
        path: rawPathCandidate.path,
      })
    }

    if (resourceUrlCandidate.participates === true
      && resourceUrlCandidate.ok === true
      && isSameResolvedPath(rawPathCandidate.path, resourceUrlCandidate.path) !== true) {
      return createResolvedTargetResult(false, 'resource-path-conflict', {
        decodedPath: rawPathCandidate.decodedPath,
        path: rawPathCandidate.path,
      })
    }

    return createResolvedTargetResult(true, 'resolved', {
      decodedPath: rawPathCandidate.decodedPath,
      path: rawPathCandidate.path,
      fallbackPath: rawPathCandidate.fallbackPath,
    })
  }

  if (resourceUrlCandidate.participates === true) {
    return createResolvedTargetResult(resourceUrlCandidate.ok, resourceUrlCandidate.reason, {
      decodedPath: resourceUrlCandidate.decodedPath,
      path: resourceUrlCandidate.path,
      fallbackPath: resourceUrlCandidate.fallbackPath,
    })
  }

  return createResolvedTargetResult(false, 'invalid-resource-url')
}

function getCandidateResolvedPathList(target, options = {}) {
  const resolvedPathList = []
  if (target?.path) {
    resolvedPathList.push(target.path)
  }

  if (options.preferPathnameFallback === true
    && target?.fallbackPath
    && isSameResolvedPath(target.path, target.fallbackPath) !== true) {
    resolvedPathList.push(target.fallbackPath)
  }

  return resolvedPathList
}

function hasDistinctFallbackPath(target) {
  return Boolean(
    target?.fallbackPath
    && isSameResolvedPath(target.path, target.fallbackPath) !== true,
  )
}

async function enrichResolvedPath(decodedPath, target, options = {}) {
  const resolvedPathList = getCandidateResolvedPathList(target, options)
  let inspectedPath = target?.path ?? null
  try {
    for (const resolvedPath of resolvedPathList) {
      inspectedPath = resolvedPath
      if (!await fs.pathExists(resolvedPath)) {
        continue
      }

      const resourceStat = await fs.stat(resolvedPath)
      return createResolveResult(true, 'resolved', {
        decodedPath,
        path: resolvedPath,
        exists: true,
        isDirectory: resourceStat.isDirectory(),
        isFile: resourceStat.isFile(),
      })
    }

    return createResolveResult(true, 'resolved', {
      decodedPath,
      path: target?.path ?? null,
    })
  } catch (error) {
    throw attachResourceErrorContext(error, {
      decodedPath,
      resolvedPath: inspectedPath,
    })
  }
}

async function resolveLocalResource(documentContext, resourceData, options = {}) {
  const target = resolveLocalResourceTarget(documentContext, resourceData)
  if (target.ok !== true) {
    return createResolveResult(false, target.reason, {
      decodedPath: target.decodedPath,
      path: target.path,
    })
  }

  return await enrichResolvedPath(target.decodedPath, target, {
    preferPathnameFallback: options.preferPathnameFallback === true,
  })
}

/**
 * 解析本地资源对应的真实文件路径
 * @param {object} documentContext - 当前文档上下文
 * @param {string | object} resourceData - 资源地址或带原始路径的资源负载
 * @returns {string | null} 解析后的本地文件路径，无法解析时返回 null
 */
function resolveLocalResourcePath(documentContext, resourceData) {
  const target = resolveLocalResourceTarget(documentContext, resourceData)
  return target.ok === true ? target.path : null
}

/**
 * 删除本地资源文件，不存在时直接忽略
 * @param {object} documentContext - 当前文档上下文
 * @param {string | object} resourceData - 资源地址或带原始路径的资源负载
 * @returns {Promise<object>} 结构化删除结果
 */
async function deleteLocalResource(documentContext, resourceData) {
  let resolvedPath = resolveLocalResourcePath(documentContext, resourceData)
  try {
    const resourceInfo = await resolveLocalResource(documentContext, resourceData, {
      preferPathnameFallback: true,
    })
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
  let resolvedPath = resolveLocalResourcePath(documentContext, resourceUrl)
  try {
    const resourceInfo = await resolveLocalResource(documentContext, resourceUrl, {
      preferPathnameFallback: true,
    })
    resolvedPath = resourceInfo.path
    if (resourceInfo.ok !== true) {
      return createOpenFolderResult(false, false, resourceInfo.reason, resourceInfo.path)
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
    const resolveResult = await resolveLocalResource(documentContext, resourceUrl, {
      preferPathnameFallback: true,
    })
    return createResourceInfoResult(resolveResult.ok, resolveResult.path, resolveResult)
  } catch (error) {
    resolvedPath = error?.resourcePath ?? resolvedPath
    return createResourceInfoResult(false, resolvedPath, {
      reason: 'info-failed',
      decodedPath: error?.decodedPath ?? null,
    })
  }
}

function getLocalResourceComparableKey(documentContext, resourceData) {
  const target = resolveLocalResourceTarget(
    documentContext,
    typeof resourceData === 'string'
      ? { rawPath: resourceData }
      : resourceData,
  )
  if (target.ok !== true) {
    return null
  }

  const resolvedPathList = getCandidateResolvedPathList(target, {
    preferPathnameFallback: true,
  })
  for (const resolvedPath of resolvedPathList) {
    if (pathExistsSyncSafe(resolvedPath)) {
      return createComparableKey(resolvedPath)
    }
  }

  return createComparableKey(target.path)
}

export default {
  getLocalResourceFailureMessageKey,
  getLocalResourceComparableKey,
  hasDistinctFallbackPath,
  openLocalResourceInFolder,
  getLocalResourceInfo,
  resolveLocalResource,
  resolveLocalResourceTarget,
  resolveLocalResourcePath,
  deleteLocalResource,
}
