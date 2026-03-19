/**
 * 为协议请求解析稳定的窗口 ID。
 *
 * 优先使用当前发起请求的窗口；
 * 如果当前窗口没有注册到生命周期服务（例如导出子窗口），
 * 再回退到它的父窗口。
 *
 * @param {{
 *   webContentsId: number | null | undefined,
 *   getWindowIdByWebContentsId?: (webContentsId: number) => string | null | undefined,
 *   getParentWindowIdByWebContentsId?: (webContentsId: number) => string | null | undefined,
 * }} options
 * @returns {string | null} 返回可用于协议解析的窗口 ID
 */
export function resolveWindowIdForProtocolRequest(options = {}) {
  const {
    webContentsId,
    getWindowIdByWebContentsId,
    getParentWindowIdByWebContentsId,
  } = options

  if (!Number.isInteger(webContentsId)) {
    return null
  }

  const directWindowId = typeof getWindowIdByWebContentsId === 'function'
    ? getWindowIdByWebContentsId(webContentsId)
    : null
  if (typeof directWindowId === 'string' && directWindowId.trim() !== '') {
    return directWindowId
  }

  const parentWindowId = typeof getParentWindowIdByWebContentsId === 'function'
    ? getParentWindowIdByWebContentsId(webContentsId)
    : null
  if (typeof parentWindowId === 'string' && parentWindowId.trim() !== '') {
    return parentWindowId
  }

  return null
}

export default {
  resolveWindowIdForProtocolRequest,
}
