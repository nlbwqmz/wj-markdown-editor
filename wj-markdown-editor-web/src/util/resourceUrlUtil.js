/**
 * 将字符串编码为 hex
 * @param {string} str - 要编码的字符串
 * @returns {string} - hex 编码的字符串
 */
export function stringToHex(str) {
  return Array.from(new TextEncoder().encode(str))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 规范化 markdown-it 产出的本地资源地址。
 * 主要处理 Windows 绝对路径在链接场景下被转成 `D:%5C...` 的情况。
 * @param {string} src - 原始资源地址
 * @returns {string} - 规范化后的资源地址
 */
export function normalizeLocalResourcePath(src) {
  if (!src) {
    return src
  }

  if (src.startsWith('#') || src.startsWith('//')) {
    return src
  }

  const hasExplicitScheme = /^[a-z][a-z\d+.-]*:/i.test(src)
  let decodedSrc = src
  try {
    decodedSrc = decodeURIComponent(src)
  } catch {
    decodedSrc = src
  }

  const isWindowsAbsolutePath = /^[a-z]:[\\/]/i.test(decodedSrc)
  if (hasExplicitScheme && !isWindowsAbsolutePath) {
    return src
  }

  return decodedSrc.replace(/\\/g, '/')
}

/**
 * 将资源地址转换为稳定的资源 URL。
 * 本地路径转换为 wj 协议地址，显式协议地址、锚点链接和协议相对地址保持原样。
 * @param {string} src - 资源地址
 * @returns {string} - 转换后的资源地址
 */
export function convertResourceUrl(src) {
  if (!src) {
    return src
  }

  if (src.startsWith('#') || src.startsWith('//')) {
    return src
  }

  const normalizedSrc = normalizeLocalResourcePath(src)
  const hasExplicitScheme = /^[a-z][a-z\d+.-]*:/i.test(src)
  const isWindowsAbsolutePath = /^[a-z]:[\\/]/i.test(normalizedSrc)

  if (hasExplicitScheme && !isWindowsAbsolutePath) {
    return src
  }

  return `wj://${stringToHex(normalizedSrc)}`
}

export default {
  stringToHex,
  normalizeLocalResourcePath,
  convertResourceUrl,
}
