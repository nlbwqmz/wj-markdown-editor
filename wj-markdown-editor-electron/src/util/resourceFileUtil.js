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

async function enrichResolvedPath(decodedPath, resolvedPath) {
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
}

async function resolveLocalResource(winInfo, resourceUrl) {
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

  if (!winInfo?.path) {
    return createResolveResult(false, 'relative-resource-without-document', {
      decodedPath,
    })
  }

  return await enrichResolvedPath(
    decodedPath,
    path.resolve(path.dirname(winInfo.path), decodedPath),
  )
}

/**
 * 解析本地资源对应的真实文件路径
 * @param {object} winInfo - 当前窗口信息
 * @param {string} resourceUrl - wj 协议资源地址
 * @returns {string | null} 解析后的本地文件路径，无法解析时返回 null
 */
function resolveLocalResourcePath(winInfo, resourceUrl) {
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
  if (!winInfo?.path) {
    return null
  }

  return path.resolve(path.dirname(winInfo.path), decodedPath)
}

/**
 * 删除本地资源文件，不存在时直接忽略
 * @param {object} winInfo - 当前窗口信息
 * @param {string} resourceUrl - wj 协议资源地址
 * @returns {Promise<boolean>} 删除流程是否成功进入执行分支
 */
async function deleteLocalResource(winInfo, resourceUrl) {
  const resourceInfo = await resolveLocalResource(winInfo, resourceUrl)
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
}

async function openLocalResourceInFolder(winInfo, resourceUrl, showItemInFolder) {
  const resourceInfo = await resolveLocalResource(winInfo, resourceUrl)
  if (resourceInfo.ok !== true) {
    return createOpenFolderResult(false, false, resourceInfo.reason, resourceInfo.path)
  }

  if (resourceInfo.exists !== true) {
    return createOpenFolderResult(true, false, 'not-found', resourceInfo.path)
  }

  showItemInFolder(resourceInfo.path)
  return createOpenFolderResult(true, true, 'opened', resourceInfo.path)
}

async function getLocalResourceInfo(winInfo, resourceUrl) {
  const resolveResult = await resolveLocalResource(winInfo, resourceUrl)
  return createResourceInfoResult(resolveResult.ok, resolveResult.path, resolveResult)
}

export default {
  getLocalResourceFailureMessageKey,
  openLocalResourceInFolder,
  getLocalResourceInfo,
  resolveLocalResource,
  resolveLocalResourcePath,
  deleteLocalResource,
}
