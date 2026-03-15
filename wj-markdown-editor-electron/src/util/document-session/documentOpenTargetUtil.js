import path from 'node:path'

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function isWindowsAbsolutePath(targetPath) {
  return /^[a-z]:[\\/]/i.test(targetPath) || targetPath.startsWith('\\\\')
}

function resolveBaseDir(baseDir) {
  if (!isNonEmptyString(baseDir)) {
    return process.cwd()
  }
  return baseDir.trim()
}

function toPublicPath(targetPath) {
  return targetPath.replaceAll('\\', '/')
}

/**
 * 把任意文档打开目标解析成稳定绝对路径。
 *
 * 这里统一收口“启动参数 / second-instance / 对话框 / recent”几条入口的路径语义：
 * 1. 相对路径必须在进入校验、查重、建窗前就绝对化
 * 2. Windows 路径需要保持盘符 / UNC 解析语义
 * 3. POSIX 路径需要保持 `/` 根路径解析语义
 *
 * 只有这样，同一文档才不会因为入口不同而被识别成两个 session。
 */
function resolveDocumentOpenPath(targetPath, { baseDir } = {}) {
  if (!isNonEmptyString(targetPath)) {
    return null
  }

  const normalizedTargetPath = targetPath.trim()
  const normalizedBaseDir = resolveBaseDir(baseDir)

  if (isWindowsAbsolutePath(normalizedTargetPath) || isWindowsAbsolutePath(normalizedBaseDir)) {
    return toPublicPath(path.win32.resolve(
      normalizedBaseDir.replaceAll('/', '\\'),
      normalizedTargetPath.replaceAll('/', '\\'),
    ))
  }

  return path.posix.resolve(
    normalizedBaseDir.replaceAll('\\', '/'),
    normalizedTargetPath.replaceAll('\\', '/'),
  )
}

/**
 * 归一化“是否同一文档”的比较键。
 *
 * 规则和 `resolveDocumentOpenPath()` 共享同一套绝对化前提：
 * - 先消掉相对路径差异
 * - 再做平台相关的大小写 / 分隔符折叠
 *
 * 这样 store、窗口复用、same-path 检查就不会各自维护一套近似但不完全相同的语义。
 */
function toComparableDocumentPath(targetPath, options = {}) {
  const resolvedPath = resolveDocumentOpenPath(targetPath, options)
  if (!resolvedPath) {
    return null
  }

  if (isWindowsAbsolutePath(resolvedPath) || process.platform === 'win32') {
    return path.win32.normalize(resolvedPath.replaceAll('/', '\\')).toLowerCase()
  }

  return path.posix.normalize(resolvedPath.replaceAll('\\', '/'))
}

function isMarkdownFilePath(targetPath) {
  if (!isNonEmptyString(targetPath)) {
    return false
  }

  const normalizedTargetPath = targetPath.trim().toLowerCase()
  if (normalizedTargetPath.endsWith('/') || normalizedTargetPath.endsWith('\\')) {
    return false
  }

  return normalizedTargetPath.endsWith('.md')
}

export {
  isMarkdownFilePath,
  resolveDocumentOpenPath,
  toComparableDocumentPath,
}

export default {
  isMarkdownFilePath,
  resolveDocumentOpenPath,
  toComparableDocumentPath,
}
