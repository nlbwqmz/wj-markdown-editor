import path from 'node:path'
import { net, protocol } from 'electron'
import commonUtil from './commonUtil.js'
import winInfoUtil from './win/winInfoUtil.js'

export default {
  handleProtocol: () => {
    protocol.handle('wj', (request) => {
      const url = decodeURIComponent(commonUtil.hexToString(request.url.slice('wj:///'.length)))
      if (path.isAbsolute(url)) {
        return net.fetch(`file:///${url}`)
      } else {
        const winInfo = winInfoUtil.getWinInfo(request.headers.get('X-Window-ID'))
        if (winInfo.path) {
          return net.fetch(`file:///${path.resolve(path.dirname(winInfo.path), url)}`)
        }
      }
    })
  },
}
