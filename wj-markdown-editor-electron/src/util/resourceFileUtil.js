import path from 'node:path'
import fs from 'fs-extra'
import commonUtil from './commonUtil.js'

function createDeleteResult(ok, removed, reason, resolvedPath = null) {
  return {
    ok,
    removed,
    reason,
    path: resolvedPath,
  }
}

function createResourceInfoResult(ok, resolvedPath, options = {}) {
  return {
    ok,
    exists: options.exists === true,
    isDirectory: options.isDirectory === true,
    isFile: options.isFile === true,
    path: resolvedPath,
  }
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

  const decodedPath = commonUtil.decodeWjUrl(resourceUrl)
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
  const resourceInfo = await getLocalResourceInfo(winInfo, resourceUrl)
  if (resourceInfo.ok !== true) {
    return createDeleteResult(false, false, 'invalid-resource')
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

async function getLocalResourceInfo(winInfo, resourceUrl) {
  const resolvedPath = resolveLocalResourcePath(winInfo, resourceUrl)
  if (!resolvedPath) {
    return createResourceInfoResult(false, null)
  }

  if (!await fs.pathExists(resolvedPath)) {
    return createResourceInfoResult(true, resolvedPath)
  }

  const stat = await fs.stat(resolvedPath)
  return createResourceInfoResult(true, resolvedPath, {
    exists: true,
    isDirectory: stat.isDirectory(),
    isFile: stat.isFile(),
  })
}

export default {
  getLocalResourceInfo,
  resolveLocalResourcePath,
  deleteLocalResource,
}
