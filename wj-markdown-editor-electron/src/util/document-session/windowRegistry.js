function normalizeWindowId(windowId) {
  if (typeof windowId === 'number' && Number.isFinite(windowId)) {
    return String(windowId)
  }

  if (typeof windowId === 'string' && windowId.trim() !== '') {
    return windowId.trim()
  }

  throw new TypeError('windowId 必须是数字或非空字符串')
}

function assertWindowReference(win) {
  if (win) {
    return
  }

  throw new TypeError('win 必须存在')
}

function assertSessionId(sessionId) {
  if (typeof sessionId === 'string' && sessionId.trim() !== '') {
    return
  }

  throw new TypeError('sessionId 必须是非空字符串')
}

/**
 * 只维护窗口身份映射真相。
 *
 * registry 只负责两件事：
 * 1. `windowId -> win`
 * 2. `windowId -> sessionId`
 *
 * 这里故意不承载 path、content、保存态等文档状态，
 * 避免把旧 winInfo 兼容结构继续带进新的 runtime 边界。
 */
export function createWindowRegistry() {
  const windowMap = new Map()
  const windowIdByWinMap = new Map()
  const sessionBindingMap = new Map()

  return {
    registerWindow({ windowId, win }) {
      const normalizedWindowId = normalizeWindowId(windowId)
      assertWindowReference(win)

      if (windowMap.has(normalizedWindowId)) {
        throw new Error(`windowId 已存在，不能重复注册: ${normalizedWindowId}`)
      }

      if (windowIdByWinMap.has(win)) {
        throw new Error('win 已存在，不能重复注册')
      }

      windowMap.set(normalizedWindowId, win)
      windowIdByWinMap.set(win, normalizedWindowId)
      return win
    },
    unregisterWindow(windowId) {
      const normalizedWindowId = normalizeWindowId(windowId)
      const win = windowMap.get(normalizedWindowId) || null
      const deleted = windowMap.delete(normalizedWindowId)
      if (win) {
        windowIdByWinMap.delete(win)
      }
      sessionBindingMap.delete(normalizedWindowId)
      return deleted
    },
    bindSession({ windowId, sessionId }) {
      const normalizedWindowId = normalizeWindowId(windowId)
      assertSessionId(sessionId)

      if (!windowMap.has(normalizedWindowId)) {
        throw new Error(`windowId 不存在，无法绑定 session: ${normalizedWindowId}`)
      }

      sessionBindingMap.set(normalizedWindowId, sessionId)
      return sessionId
    },
    getWindowById(windowId) {
      return windowMap.get(normalizeWindowId(windowId)) || null
    },
    getSessionIdByWindowId(windowId) {
      return sessionBindingMap.get(normalizeWindowId(windowId)) || null
    },
    getAllWindows() {
      return Array.from(windowMap.values())
    },
  }
}
