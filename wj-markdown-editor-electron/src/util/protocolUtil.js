import path from 'node:path'
import { net, protocol, session } from 'electron'
import commonUtil from './commonUtil.js'
import winInfoUtil from './win/winInfoUtil.js'

let headerHookInitialized = false

function initHeaderHook() {
  if (headerHookInitialized) {
    return
  }
  headerHookInitialized = true
  // 全局只注册一次：按请求来源 webContents 注入窗口 ID，避免多窗口相互覆盖
  // 注意：webRequest 的 urls 过滤器不支持自定义协议匹配模式（如 wj://*/*）
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = details.requestHeaders || {}
    if (details.url.startsWith('wj:') || details.url.startsWith('wj-stream:')) {
      const winInfo = winInfoUtil.getByWebContentsId(details.webContentsId)
      if (winInfo) {
        requestHeaders['X-Window-ID'] = winInfo.id
      }
    }
    callback({ requestHeaders })
  })
}

export default {
  handleProtocol: () => {
    initHeaderHook()
    protocol.handle('wj', (request) => {
      const url = decodeURIComponent(commonUtil.hexToString(request.url.slice('wj:///'.length)))
      if (path.isAbsolute(url)) {
        return net.fetch(`file:///${url}`)
      } else {
        const winInfo = winInfoUtil.getWinInfo(request.headers.get('X-Window-ID'))
        if (winInfo && winInfo.path) {
          return net.fetch(`file:///${path.resolve(path.dirname(winInfo.path), url)}`)
        }
      }
    })
  },
}
