import { attachWindowTabsSnapshot, deriveDocumentSnapshot, deriveDocumentTabSnapshot } from './documentSnapshotUtil.js'

/**
 * 按窗口当前持有的会话顺序生成标签列表。
 *
 * 标签顺序就是用户在标签栏里看到的顺序，必须与 store 记录的标签顺序一致；
 * 这里不做任何排序，避免主进程和渲染层各自维护一套“标签应该怎么排”。
 */
export function deriveWindowTabsSnapshot({ store, windowId }) {
  const sessionIds = store?.getSessionIdsByWindowId?.(windowId) || []
  return sessionIds
    .map(sessionId => store?.getSession?.(sessionId))
    .filter(Boolean)
    .map(session => deriveDocumentTabSnapshot(session))
}

/**
 * 生成窗口级文档快照：活动会话的完整快照 + 窗口的标签列表。
 *
 * 命令层、窗口桥、同步查询都必须经过这一个函数产出快照，
 * 否则“命令返回的快照”和“桥里重新推导的快照”结构不一致，
 * 会让 `if-changed` 这类基于快照签名的判断永远认为发生了变化。
 */
export function deriveWindowDocumentSnapshot({ store, windowId }) {
  const session = store?.getSessionByWindowId?.(windowId)
  if (!session) {
    return null
  }

  return attachWindowTabsSnapshot({
    snapshot: deriveDocumentSnapshot(session),
    tabs: deriveWindowTabsSnapshot({ store, windowId }),
    activeSessionId: store?.getActiveSessionIdByWindowId?.(windowId) || session.sessionId || null,
  })
}

export default {
  deriveWindowDocumentSnapshot,
  deriveWindowTabsSnapshot,
}
