function normalizeWindowId(windowId) {
  if (typeof windowId === 'number' && Number.isFinite(windowId)) {
    return String(windowId)
  }

  if (typeof windowId === 'string' && windowId.trim() !== '') {
    return windowId.trim()
  }

  throw new TypeError('windowId 必须是数字或非空字符串')
}

function assertState(state) {
  if (state && typeof state === 'object') {
    return
  }

  throw new TypeError('state 必须是对象')
}

export function createWindowHostStateStore() {
  const windowStateMap = new Map()

  return {
    registerWindowState({ windowId, state }) {
      const normalizedWindowId = normalizeWindowId(windowId)
      assertState(state)

      if (windowStateMap.has(normalizedWindowId)) {
        throw new Error(`windowId 已存在宿主状态，不能重复注册: ${normalizedWindowId}`)
      }

      const registeredState = {
        ...state,
        windowId: normalizedWindowId,
      }
      windowStateMap.set(normalizedWindowId, registeredState)
      return registeredState
    },
    getWindowState(windowId) {
      return windowStateMap.get(normalizeWindowId(windowId)) || null
    },
    updateWindowState(windowId, updater) {
      const normalizedWindowId = normalizeWindowId(windowId)
      const currentState = windowStateMap.get(normalizedWindowId) || null
      if (!currentState) {
        return null
      }

      if (typeof updater === 'function') {
        const nextState = updater(currentState)
        if (nextState && nextState !== currentState) {
          const registeredState = {
            ...nextState,
            windowId: normalizedWindowId,
          }
          windowStateMap.set(normalizedWindowId, registeredState)
          return registeredState
        }
      }

      return windowStateMap.get(normalizedWindowId) || null
    },
    unregisterWindowState(windowId) {
      return windowStateMap.delete(normalizeWindowId(windowId))
    },
    getAllWindowStates() {
      return Array.from(windowStateMap.values())
    },
    findWindowStateByWin(win) {
      for (const state of windowStateMap.values()) {
        if (state.win === win) {
          return state
        }
      }
      return null
    },
    findWindowStateByWebContentsId(webContentsId) {
      for (const state of windowStateMap.values()) {
        if (state.win?.webContents?.id === webContentsId) {
          return state
        }
      }
      return null
    },
  }
}
