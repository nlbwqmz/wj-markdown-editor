import channelUtil from '../channel/channelUtil.js'
import { requestDocumentEdit } from './rendererDocumentCommandUtil.js'

/**
 * 关闭链路前的“正文收敛”服务。
 *
 * 背景：主进程只认 session 里的正文，保存写盘也只读那一份。
 * 而每个标签的编辑器正文常驻在渲染层的 EditorView 里（切走不销毁），
 * 因此关闭一个后台标签时，主进程手上的正文可能落后于该标签的真实内容。
 *
 * 本服务负责把指定会话的**当前正文**按 sessionId 显式推给主进程，
 * 让“关闭前保存”写下去的一定是用户真正看到的内容。
 *
 * 两个入口：
 * 1. 渲染层主动调用 `flushSessionContents`（关单个标签、批量关标签）
 * 2. 主进程发起 `document.flush-request`（关窗口），渲染层处理完回 ack
 */

let sessionContentProvider = null

/**
 * 注册“读取某个会话当前正文”的提供者。
 *
 * 由编辑页在挂载时注册、卸载时清除。提供者返回 null 表示
 * 该会话在渲染层还没有自己的编辑器实例（例如后台新开、从未激活过），
 * 此时主进程手里的正文就是权威值，无需再推一次。
 *
 * @param {((sessionId: string) => string | null) | null} provider
 * @returns {Function} 注销函数
 */
export function setSessionContentProvider(provider) {
  sessionContentProvider = typeof provider === 'function' ? provider : null

  return () => {
    if (sessionContentProvider === provider) {
      sessionContentProvider = null
    }
  }
}

function readSessionContent(sessionId) {
  if (typeof sessionContentProvider !== 'function') {
    return null
  }

  const content = sessionContentProvider(sessionId)
  return typeof content === 'string' ? content : null
}

/**
 * 把一批会话的当前正文推给主进程。
 *
 * 并发发送，主进程按 sessionId 落库、按 seq 丢弃过期写入，
 * 因此这里的并发不会让同一会话的旧内容后到覆盖新内容。
 *
 * @param {string[]} sessionIds
 * @returns {Promise<{ok: boolean, flushedSessionIds: string[], failedSessionIds: string[]}>} 本批正文推送结果
 */
export async function flushSessionContents(sessionIds) {
  const idList = (Array.isArray(sessionIds) ? sessionIds : [])
    .filter(sessionId => typeof sessionId === 'string' && sessionId !== '')

  if (idList.length === 0) {
    return {
      ok: true,
      flushedSessionIds: [],
      failedSessionIds: [],
    }
  }

  const taskList = []
  const pendingSessionIds = []
  for (const sessionId of idList) {
    const content = readSessionContent(sessionId)
    if (content === null) {
      continue
    }
    pendingSessionIds.push(sessionId)
    taskList.push(
      requestDocumentEdit(sessionId, content)
        .then(() => ({ sessionId, ok: true }))
        .catch(() => ({ sessionId, ok: false })),
    )
  }

  if (taskList.length === 0) {
    return {
      ok: true,
      flushedSessionIds: [],
      failedSessionIds: [],
    }
  }

  const resultList = await Promise.all(taskList)
  const failedSessionIds = resultList
    .filter(result => result.ok !== true)
    .map(result => result.sessionId)

  return {
    ok: failedSessionIds.length === 0,
    flushedSessionIds: resultList
      .filter(result => result.ok === true)
      .map(result => result.sessionId),
    failedSessionIds,
  }
}

/**
 * 处理主进程发起的 flush 请求。
 *
 * 必须先推送正文、再回 ack：主进程收到 ack 后会立刻进入保存流程，
 * 提前 ack 等于让它拿旧正文写盘。
 *
 * @param {{requestId?: string, sessionIds?: string[]}} data
 * @returns {Promise<object>} 回给主进程的 ack 结构
 */
export async function handleFlushRequest(data) {
  const requestId = typeof data?.requestId === 'string' ? data.requestId : ''
  const flushResult = await flushSessionContents(data?.sessionIds)

  const ack = {
    requestId,
    ok: flushResult.ok === true,
    failedSessionIds: flushResult.failedSessionIds,
  }

  if (requestId) {
    await channelUtil.send({
      event: 'document.flush-ack',
      data: ack,
    }).catch(() => {})
  }

  return ack
}

export default {
  setSessionContentProvider,
  flushSessionContents,
  handleFlushRequest,
}
