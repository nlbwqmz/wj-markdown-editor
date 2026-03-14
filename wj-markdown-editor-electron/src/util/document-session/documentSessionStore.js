import path from 'node:path'

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
 * 归一化可比较路径。
 *
 * 当前 store 先把“是否为同一个本地路径”的规则集中到这里，
 * 后续 same-path 保存副本、按路径查重、窗口复用都可以共享同一套比较语义。
 *
 * 这里特别为 Windows 预留了大小写不敏感逻辑：
 * - 统一折叠分隔符
 * - 统一规范化 `.` / `..`
 * - 对盘符路径和 UNC 路径转小写
 */
function toComparablePath(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    return null
  }

  const normalizedText = targetPath.trim()
  if (/^[a-z]:[\\/]/i.test(normalizedText) || normalizedText.startsWith('\\\\')) {
    return path.win32.normalize(normalizedText.replaceAll('/', '\\')).toLowerCase()
  }

  return path.posix.normalize(normalizedText.replaceAll('\\', '/'))
}

/**
 * 创建文档会话 store。
 *
 * 这里把“session 注册表”和“window -> active session 绑定表”拆开存储，
 * 是为了让窗口和文档身份从一开始就不是一对一硬编码关系。
 * 即使当前只用到单窗口单 active session，后续多标签也不需要推翻这个基础结构。
 */
export function createDocumentSessionStore() {
  const sessionMap = new Map()
  const windowSessionMap = new Map()

  function getSession(sessionId) {
    return sessionMap.get(sessionId) || null
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
      const deleted = sessionMap.delete(sessionId)

      for (const [windowId, activeSessionId] of windowSessionMap.entries()) {
        if (activeSessionId === sessionId) {
          windowSessionMap.delete(windowId)
        }
      }

      return deleted
    },
    bindWindowToSession({ windowId, sessionId }) {
      // 这里不能把 windowId 限死为字符串。
      // Electron 主链路会直接传 BrowserWindow.id，它本身就是数字；
      // store 只需要把它当作稳定键值保存，不应该在这里引入额外的类型收窄。
      assertWindowId(windowId)
      assertNonEmptyString(sessionId, 'sessionId')
      if (!sessionMap.has(sessionId)) {
        throw new Error(`sessionId 不存在，无法绑定窗口: ${sessionId}`)
      }
      windowSessionMap.set(windowId, sessionId)
      return getSession(sessionId)
    },
    getSessionByWindowId(windowId) {
      assertWindowId(windowId)
      const sessionId = windowSessionMap.get(windowId)
      return sessionId ? getSession(sessionId) : null
    },
    findSessionByComparablePath(targetPath) {
      const comparablePath = toComparablePath(targetPath)
      if (!comparablePath) {
        return null
      }

      for (const session of sessionMap.values()) {
        const sessionPath = toComparablePath(session?.documentSource?.path || null)
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
