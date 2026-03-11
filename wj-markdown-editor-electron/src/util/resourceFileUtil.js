import path from 'node:path'
import fs from 'fs-extra'
import commonUtil from './commonUtil.js'

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
  const resolvedPath = resolveLocalResourcePath(winInfo, resourceUrl)
  if (!resolvedPath) {
    return false
  }

  if (await fs.pathExists(resolvedPath)) {
    await fs.remove(resolvedPath)
  }

  return true
}

export default {
  resolveLocalResourcePath,
  deleteLocalResource,
}
