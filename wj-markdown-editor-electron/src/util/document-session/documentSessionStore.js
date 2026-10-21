import { toComparableDocumentPath } from './documentOpenTargetUtil.js'

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} 必须是非空字符串`)
  }
}

function assertWindowId(windowId) {
  if (typeof windowId === 'number' && Number.isFinite(windowId)) {
    return
  }

  if (typeof windowId === 'string' && windowId.trim() !== '') {
    return
  }

  throw new TypeError('windowId 必须是数字或非空字符串')
}

/**
 * 创建文档会话 store。
 *
 * 这里把“session 注册表”和“窗口持有的会话列表”拆开存储：
 * 1. `sessionMap` 是全局会话注册表，按 sessionId 索引
 * 2. `windowTabMap` 记录每个窗口持有的会话顺序与当前活动会话
 * 3. `sessionWindowMap` 是反向索引，用于按会话反查所属窗口
 *
 * 一个窗口可以持有多个文档会话（标签页），但同一时刻只有一个活动会话。
 * `getSessionByWindowId` 保留“取活动会话”的语义，这样所有按窗口取文档的既有链路
 * 不需要因为多标签而改写。
 */
export function createDocumentSessionStore() {
  const sessionMap = new Map()
  const windowTabMap = new Map()
  const sessionWindowMap = new Map()

  function getSession(sessionId) {
    return sessionMap.get(sessionId) || null
  }

  function getWindowTabState(windowId) {
    return windowTabMap.get(windowId) || null
  }

  function ensureWindowTabState(windowId) {
    let state = windowTabMap.get(windowId)
    if (!state) {
      state = { sessionIds: [], activeSessionId: null }
      windowTabMap.set(windowId, state)
    }
    return state
  }

  /**
   * 把会话从它当前所属窗口的标签列表里摘掉。
   *
   * 如果摘掉的是活动会话，活动指针交给相邻标签：
   * 优先接管原位置上的下一个标签，没有就退到最后一个，列表为空则置空。
   * 这样窗口不会停在“有标签但没有活动会话”的中间态。
   */
  function detachSessionFromWindow(sessionId) {
    const windowId = sessionWindowMap.get(sessionId)
    if (windowId === undefined) {
      return null
    }

    sessionWindowMap.delete(sessionId)
    const state = windowTabMap.get(windowId)
    if (!state) {
      return windowId
    }

    const index = state.sessionIds.indexOf(sessionId)
    if (index >= 0) {
      state.sessionIds.splice(index, 1)
    }

    if (state.activeSessionId === sessionId) {
      const fallbackIndex = index >= 0
        ? Math.min(index, state.sessionIds.length - 1)
        : 0
      state.activeSessionId = state.sessionIds[fallbackIndex] ?? null
    }

    if (state.sessionIds.length === 0) {
      windowTabMap.delete(windowId)
    }

    return windowId
  }

  /**
   * 把一个已注册的会话挂到窗口的标签列表上。
   *
   * `index` 可选，用于在指定位置插入（例如拖拽排序或恢复顺序）；
   * 不传时追加到末尾。重复挂载同一个会话不会产生第二个标签。
   */
  function addSessionToWindow({ windowId, sessionId, index = null }) {
    // 这里不能把 windowId 限死为字符串。
    // Electron 主链路会直接传 BrowserWindow.id，它本身就是数字；
    // store 只需要把它当作稳定键值保存，不应该在这里引入额外的类型收窄。
    assertWindowId(windowId)
    assertNonEmptyString(sessionId, 'sessionId')
    if (!sessionMap.has(sessionId)) {
      throw new Error(`sessionId 不存在，无法挂载到窗口: ${sessionId}`)
    }

    const ownerWindowId = sessionWindowMap.get(sessionId)
    if (ownerWindowId !== undefined && ownerWindowId !== windowId) {
      throw new Error(`sessionId 已属于其他窗口，不能重复挂载: ${sessionId}`)
    }

    const state = ensureWindowTabState(windowId)
    if (!state.sessionIds.includes(sessionId)) {
      const canInsert = Number.isInteger(index) && index >= 0 && index <= state.sessionIds.length
      if (canInsert) {
        state.sessionIds.splice(index, 0, sessionId)
      }
      else {
        state.sessionIds.push(sessionId)
      }
    }
    sessionWindowMap.set(sessionId, windowId)
    return getSession(sessionId)
  }

  function activateSession({ windowId, sessionId }) {
    assertWindowId(windowId)
    assertNonEmptyString(sessionId, 'sessionId')
    const state = ensureWindowTabState(windowId)
    if (!state.sessionIds.includes(sessionId)) {
      throw new Error(`sessionId 未挂载到该窗口，无法激活: ${sessionId}`)
    }
    state.activeSessionId = sessionId
    return getSession(sessionId)
  }

  function getSessionIdsByWindowId(windowId) {
    const state = getWindowTabState(windowId)
    return state ? [...state.sessionIds] : []
  }

  return {
    createSession(session) {
      assertNonEmptyString(session?.sessionId, 'session.sessionId')
      if (sessionMap.has(session.sessionId)) {
        throw new Error(`sessionId 已存在，不能重复注册: ${session.sessionId}`)
      }
      sessionMap.set(session.sessionId, session)
      return session
    },
    replaceSession(session) {
      assertNonEmptyString(session?.sessionId, 'session.sessionId')
      if (!sessionMap.has(session.sessionId)) {
        throw new Error(`sessionId 不存在，无法替换: ${session.sessionId}`)
      }
      sessionMap.set(session.sessionId, session)
      return session
    },
    destroySession(sessionId) {
      assertNonEmptyString(sessionId, 'sessionId')
      detachSessionFromWindow(sessionId)
      return sessionMap.delete(sessionId)
    },
    addSessionToWindow,
    activateSession,
    getSessionIdsByWindowId,
    removeSessionFromWindow({ windowId, sessionId }) {
      assertWindowId(windowId)
      assertNonEmptyString(sessionId, 'sessionId')
      if (sessionWindowMap.get(sessionId) !== windowId) {
        return false
      }
      detachSessionFromWindow(sessionId)
      return true
    },
    /**
     * 兼容入口：绑定窗口与会话，等价于“挂到标签列表末尾并激活”。
     *
     * 单会话时代所有调用点都走这里；多标签落地后它仍然是
     * “新建/打开一个文档并让它成为活动标签”的语义。
     */
    bindWindowToSession({ windowId, sessionId }) {
      addSessionToWindow({ windowId, sessionId })
      return activateSession({ windowId, sessionId })
    },
    reorderWindowSessions({ windowId, sessionIds }) {
      assertWindowId(windowId)
      if (!Array.isArray(sessionIds)) {
        throw new TypeError('sessionIds 必须是数组')
      }
      const state = getWindowTabState(windowId)
      if (!state) {
        return []
      }
      const current = state.sessionIds
      const isSameSet = sessionIds.length === current.length
        && new Set(sessionIds).size === sessionIds.length
        && sessionIds.every(sessionId => current.includes(sessionId))
      if (!isSameSet) {
        throw new Error('reorderWindowSessions 要求 sessionIds 与当前标签集合一致')
      }
      state.sessionIds = [...sessionIds]
      return [...state.sessionIds]
    },
    getSessionByWindowId(windowId) {
      assertWindowId(windowId)
      const state = getWindowTabState(windowId)
      return state?.activeSessionId ? getSession(state.activeSessionId) : null
    },
    getActiveSessionIdByWindowId(windowId) {
      return getWindowTabState(windowId)?.activeSessionId ?? null
    },
    getSessionsByWindowId(windowId) {
      return getSessionIdsByWindowId(windowId)
        .map(sessionId => getSession(sessionId))
        .filter(Boolean)
    },
    getWindowIdBySessionId(sessionId) {
      return sessionWindowMap.get(sessionId) ?? null
    },
    findSessionByComparablePath(targetPath) {
      const comparablePath = toComparableDocumentPath(targetPath)
      if (!comparablePath) {
        return null
      }

      for (const session of sessionMap.values()) {
        const sessionPath = toComparableDocumentPath(session?.documentSource?.path || null)
        if (sessionPath && sessionPath === comparablePath) {
          return session
        }
      }

      return null
    },
    getSession,
  }
}

export default {
  createDocumentSessionStore,
}
