/**
 * 判断某个会话的编辑器正文是否值得回推给主进程。
 *
 * 关闭链路（关单个标签 / 批量关标签 / 关窗口）会先把目标标签的正文推给主进程，
 * 因为主进程手里的 session 正文可能落后于渲染层 EditorView 里的内容。
 * 但“渲染层有这个会话的 view”不等于“这个 view 比 session 新”：
 * 后台标签的文件被外部修改且策略为「直接应用」时，主进程已经把新正文写进会话，
 * 而该标签的后台 EditorView 仍是旧正文（切回该标签时才会重建同步）。
 * 此时按 view 回推，会把会话改回陈旧内容，
 * 让一次“直接关闭一个干净的后台标签”变成“有未保存的修改”。
 *
 * 判定规则：
 * - 活动标签：必须推。正文可能还在 160ms 防抖窗口里，不推就会丢最后一次输入。
 * - 后台且脏：推。脏说明它至少不落后于磁盘，回推是幂等的。
 * - 后台且干净：不推。干净意味着主进程那份正文已经等于磁盘正文，后台 view 只可能更旧。
 *
 * @param {object} options
 * @param {string} options.sessionId 目标会话
 * @param {(object | null | undefined)} options.snapshot 渲染层当前会话快照
 * @returns {boolean} true 表示允许回推该会话正文
 */
export function shouldPushSessionContent({ sessionId, snapshot } = {}) {
  if (typeof sessionId !== 'string' || sessionId === '') {
    return false
  }

  if (sessionId === (snapshot?.activeSessionId ?? null)) {
    return true
  }

  const tabList = Array.isArray(snapshot?.tabs) ? snapshot.tabs : []
  const tab = tabList.find(item => item?.sessionId === sessionId)
  if (!tab) {
    // 快照里查不到该标签：保持旧行为，由主进程按 sessionId 自行裁决。
    return true
  }

  return tab.dirty === true
}

export default {
  shouldPushSessionContent,
}
