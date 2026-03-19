import { describe, expect, it } from 'vitest'

let protocolRequestContextUtilModule = null

try {
  protocolRequestContextUtilModule = await import('./protocolRequestContextUtil.js')
} catch {
  protocolRequestContextUtilModule = null
}

function requireResolveWindowIdForProtocolRequest() {
  expect(protocolRequestContextUtilModule, '缺少 protocol request context util').toBeTruthy()

  const { resolveWindowIdForProtocolRequest } = protocolRequestContextUtilModule
  expect(typeof resolveWindowIdForProtocolRequest).toBe('function')

  return resolveWindowIdForProtocolRequest
}

describe('resolveWindowIdForProtocolRequest', () => {
  it('应优先使用当前请求 webContents 直接关联到的窗口 ID', () => {
    const resolveWindowIdForProtocolRequest = requireResolveWindowIdForProtocolRequest()

    const result = resolveWindowIdForProtocolRequest({
      webContentsId: 11,
      getWindowIdByWebContentsId: id => id === 11 ? 'window-11' : null,
      getParentWindowIdByWebContentsId: () => 'parent-window',
    })

    expect(result).toBe('window-11')
  })

  it('导出子窗口未注册到窗口生命周期时，应回退到父窗口 ID', () => {
    const resolveWindowIdForProtocolRequest = requireResolveWindowIdForProtocolRequest()

    const result = resolveWindowIdForProtocolRequest({
      webContentsId: 22,
      getWindowIdByWebContentsId: () => null,
      getParentWindowIdByWebContentsId: id => id === 22 ? 'parent-window-22' : null,
    })

    expect(result).toBe('parent-window-22')
  })

  it('当前窗口和父窗口都不存在时，应稳定返回 null', () => {
    const resolveWindowIdForProtocolRequest = requireResolveWindowIdForProtocolRequest()

    const result = resolveWindowIdForProtocolRequest({
      webContentsId: 33,
      getWindowIdByWebContentsId: () => null,
      getParentWindowIdByWebContentsId: () => null,
    })

    expect(result).toBeNull()
  })
})
