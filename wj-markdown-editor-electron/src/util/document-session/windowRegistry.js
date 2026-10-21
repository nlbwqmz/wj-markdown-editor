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
 * registry 负责三件事：
 * 1. `windowId -> win`
 * 2. `windowId -> sessionId`（当前活动会话）
 * 3. `windowId -> sessionId[]`（该窗口持有的标签页顺序）
 *
 * 这里故意不承载 path、content、保存态等文档状态，
 * 避免把旧 winInfo 兼容结构继续带进新的 runtime 边界。
 */
export function createWindowRegistry() {
  const windowMap = new Map()
  const windowIdByWinMap = new Map()
  const sessionBindingMap = new Map()
  const windowSessionIdsMap = new Map()

  function getSessionIds(windowId) {
    const normalizedWindowId = normalizeWindowId(windowId)
    const sessionIds = windowSessionIdsMap.get(normalizedWindowId)
    return sessionIds ? [...sessionIds] : []
  }

  function removeSession({ windowId, sessionId }) {
    const normalizedWindowId = normalizeWindowId(windowId)
    assertSessionId(sessionId)
    const sessionIds = windowSessionIdsMap.get(normalizedWindowId)
    if (!sessionIds) {
      return false
    }

    const index = sessionIds.indexOf(sessionId)
    if (index < 0) {
      return false
    }

    sessionIds.splice(index, 1)
    if (sessionBindingMap.get(normalizedWindowId) === sessionId) {
      const fallbackIndex = Math.min(index, sessionIds.length - 1)
      const fallbackSessionId = sessionIds[fallbackIndex] ?? null
      if (fallbackSessionId) {
        sessionBindingMap.set(normalizedWindowId, fallbackSessionId)
      }
      else {
        sessionBindingMap.delete(normalizedWindowId)
      }
    }

    if (sessionIds.length === 0) {
      windowSessionIdsMap.delete(normalizedWindowId)
    }

    return true
  }

  function addSession({ windowId, sessionId }) {
    const normalizedWindowId = normalizeWindowId(windowId)
    assertSessionId(sessionId)

    if (!windowMap.has(normalizedWindowId)) {
      throw new Error(`windowId 不存在，无法绑定 session: ${normalizedWindowId}`)
    }

    let sessionIds = windowSessionIdsMap.get(normalizedWindowId)
    if (!sessionIds) {
      sessionIds = []
      windowSessionIdsMap.set(normalizedWindowId, sessionIds)
    }
    if (!sessionIds.includes(sessionId)) {
      sessionIds.push(sessionId)
    }
    return sessionId
  }

  function activateSession({ windowId, sessionId }) {
    const normalizedWindowId = normalizeWindowId(windowId)
    assertSessionId(sessionId)
    const sessionIds = windowSessionIdsMap.get(normalizedWindowId)
    if (!sessionIds || !sessionIds.includes(sessionId)) {
      throw new Error(`sessionId 未挂载到该窗口，无法激活: ${sessionId}`)
    }
    sessionBindingMap.set(normalizedWindowId, sessionId)
    return sessionId
  }

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
      windowSessionIdsMap.delete(normalizedWindowId)
      return deleted
    },
    /**
     * 把一个会话挂到窗口的标签列表上（不改变活动会话）。
     *
     * 重复挂载同一个会话不会产生第二个标签。
     */
    addSession,
    removeSession,
    activateSession,
    /**
     * 兼容入口：挂载并激活。
     *
     * 单会话时代所有调用点都走这里；多标签落地后它仍然是
     * “新建/打开一个文档并让它成为活动标签”的语义。
     */
    bindSession({ windowId, sessionId }) {
      addSession({ windowId, sessionId })
      return activateSession({ windowId, sessionId })
    },
    getWindowById(windowId) {
      return windowMap.get(normalizeWindowId(windowId)) || null
    },
    getSessionIdByWindowId(windowId) {
      return sessionBindingMap.get(normalizeWindowId(windowId)) || null
    },
    getSessionIdsByWindowId(windowId) {
      return getSessionIds(windowId)
    },
    getAllWindows() {
      return Array.from(windowMap.values())
    },
  }
}
