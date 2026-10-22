import channelUtil from '../channel/channelUtil.js'

/**
 * renderer 侧的文档命令统一入口。
 *
 * 这层工具的职责很单一：
 * 1. 把页面/菜单/快捷键里分散的 session 命令名收口到一个地方
 * 2. 让 renderer 不再继续散落旧 IPC 字符串，后续清理时只需要改这一层
 * 3. 把“结构化新结果如何解释”也固定下来，避免 recent 菜单继续依赖旧布尔语义
 */

/**
 * 发送“手动保存当前文档”命令。
 *
 * 新主线要求 renderer 直接发送 `document.save`，
 * 不能再绕回已经下线的历史兼容别名。
 */
export function requestDocumentSave() {
  return channelUtil.send({
    event: 'document.save',
  })
}

/**
 * 请求主进程保存当前文档，并在保存状态机确认成功后关闭当前窗口。
 *
 * 保存与关闭由主进程作为一个文档会话命令裁决，
 * 避免 renderer 在保存期间被取消后仍发送迟到的 close 请求。
 */
export function requestDocumentSaveAndClose(options = {}) {
  const event = {
    event: 'document.save-and-close',
  }
  // 不传 scope 时保持旧协议外形（不带 data），
  // 只有“只关当前标签”才需要显式声明作用域。
  if (options?.scope === 'tab') {
    event.data = { scope: 'tab' }
  }
  return channelUtil.send(event)
}

/**
 * 发送“另存为/保存副本”命令。
 *
 * 对应新的统一命令名 `document.save-copy`，
 * 后续主进程继续收缩兼容层时，这里仍然保持稳定。
 */
export function requestDocumentSaveCopy() {
  return channelUtil.send({
    event: 'document.save-copy',
  })
}

/**
 * 发送“正文编辑已变化”命令。
 *
 * renderer 不再继续透传历史兼容编辑事件名，
 * 而是统一发送结构化 `document.edit` 命令。
 */
export function requestDocumentEdit(content) {
  return channelUtil.send({
    event: 'document.edit',
    data: {
      content,
    },
  })
}

/**
 * 请求主进程弹出“打开 Markdown 文件”对话框。
 *
 * 这里明确只负责“请求打开对话框”这一层语义，
 * 真正的选中文件回流由主进程命令流内部继续处理。
 */
export function requestDocumentOpenDialog() {
  return channelUtil.send({
    event: 'document.request-open-dialog',
  })
}

/**
 * 请求主进程先对目标路径做“打开前预判”。
 *
 * renderer 不在本地猜测最终策略，
 * 而是先拿结构化预判结果再决定是否需要弹窗。
 */
export function requestDocumentResolveOpenTarget(targetPath, options = {}) {
  const data = {
    path: targetPath,
  }
  if (typeof options.entrySource === 'string' && options.entrySource) {
    data.entrySource = options.entrySource
  }
  if (typeof options.trigger === 'string' && options.trigger) {
    data.trigger = options.trigger
  }

  return channelUtil.send({
    event: 'document.resolve-open-target',
    data,
  })
}

/**
 * 请求主进程直接打开指定路径。
 *
 * recent 菜单、历史记录点击等“已知路径”的入口都应该走这里，
 * 这样 renderer 可以直接拿到结构化打开结果，而不是继续依赖历史兼容布尔值。
 */
export function requestDocumentOpenPath(targetPath, options = {}) {
  const data = {
    path: targetPath,
  }
  if (typeof options.entrySource === 'string' && options.entrySource) {
    data.entrySource = options.entrySource
  }
  if (typeof options.trigger === 'string' && options.trigger) {
    data.trigger = options.trigger
  }

  return channelUtil.send({
    event: 'document.open-path',
    data,
  })
}

/**
 * 请求主进程在执行当前窗口切换前先做预判。
 *
 * 这里会带上来源会话 identity，
 * 让主进程在 save-choice 前先决定是否允许继续切换。
 */
export function requestPrepareOpenPathInCurrentWindow(targetPath, options = {}) {
  const data = {
    path: targetPath,
  }
  if (typeof options.entrySource === 'string' && options.entrySource) {
    data.entrySource = options.entrySource
  }
  if (typeof options.trigger === 'string' && options.trigger) {
    data.trigger = options.trigger
  }
  if (typeof options.sourceSessionId === 'string' && options.sourceSessionId) {
    data.sourceSessionId = options.sourceSessionId
  }
  if (options.sourceRevision !== undefined) {
    data.sourceRevision = options.sourceRevision
  }

  return channelUtil.send({
    event: 'document.prepare-open-path-in-current-window',
    data,
  })
}

/**
 * 请求主进程在当前窗口直接切换到指定路径。
 *
 * 当前窗口执行切换时必须显式声明：
 * 1. 切换策略 `switchPolicy`
 * 2. 来源会话的 `expectedSessionId`
 * 3. 来源会话的 `expectedRevision`
 */
export function requestDocumentOpenPathInCurrentWindow(targetPath, options = {}) {
  const data = {
    path: targetPath,
  }
  if (typeof options.entrySource === 'string' && options.entrySource) {
    data.entrySource = options.entrySource
  }
  if (typeof options.trigger === 'string' && options.trigger) {
    data.trigger = options.trigger
  }
  if (typeof options.switchPolicy === 'string' && options.switchPolicy) {
    data.switchPolicy = options.switchPolicy
  }
  if (typeof options.expectedSessionId === 'string' && options.expectedSessionId) {
    data.expectedSessionId = options.expectedSessionId
  }
  if (options.expectedRevision !== undefined) {
    data.expectedRevision = options.expectedRevision
  }

  return channelUtil.send({
    event: 'document.open-path-in-current-window',
    data,
  })
}

/**
 * 请求主进程把活动标签页切到指定会话。
 *
 * 标签切换是窗口级动作：主进程负责重绑目录监听、同步窗口状态并广播快照，
 * renderer 只表达“我要看哪个标签”。
 */
export function requestDocumentActivateTab(sessionId) {
  return channelUtil.send({
    event: 'document.activate-tab',
    data: {
      sessionId,
    },
  })
}

/**
 * 请求主进程关闭指定标签页。
 *
 * 脏标签由主进程进入确认流程，renderer 不做脏判断。
 */
export function requestDocumentCloseTab(sessionId) {
  return channelUtil.send({
    event: 'document.close-tab',
    data: {
      sessionId,
    },
  })
}

/**
 * 请求主进程批量关闭标签页。
 *
 * 用于「关闭其他 / 关闭右侧」：一次请求只广播一次快照，
 * 避免逐个关闭时活动标签在渲染层来回跳。
 *
 * 脏标签由主进程过滤后保留，renderer 不做脏判断。
 */
export function requestDocumentCloseTabs(sessionIds) {
  return channelUtil.send({
    event: 'document.close-tabs',
    data: {
      sessionIds,
    },
  })
}

/**
 * 请求主进程在系统资源管理器中定位某个本地文件。
 *
 * 标签右键菜单必须显式给出路径：目标标签可能不是活动标签，
 * 不能依赖“当前活动文档”这条隐含语义。
 */
export function requestDocumentRevealInFolder(targetPath) {
  return channelUtil.send({
    event: 'document.open-in-folder',
    data: {
      path: targetPath,
    },
  })
}

/**
 * 请求主进程重排标签顺序。
 *
 * 顺序本身会被持久化，所以必须由主进程收口，不能在渲染层只改一份本地副本。
 */
export function requestDocumentReorderTabs(sessionIds) {
  return channelUtil.send({
    event: 'document.reorder-tabs',
    data: {
      sessionIds: Array.isArray(sessionIds) ? sessionIds : [],
    },
  })
}

/**
 * 请求主进程返回当前窗口对应的 document session snapshot。
 *
 * 导出页等只读页面不再依赖旧的兼容返回形状，
 * 而是直接从快照真相里读取自己需要的字段。
 */
export function requestDocumentSessionSnapshot() {
  return channelUtil.send({
    event: 'document.get-session-snapshot',
  })
}

/**
 * 清空 recent 列表。
 *
 * 新命令名已经切到 `recent.clear`，
 * 这里保留单独工具函数，避免菜单层继续直接拼 IPC 字符串。
 */
export function requestRecentClear() {
  return channelUtil.send({
    event: 'recent.clear',
  })
}

/**
 * 删除指定 recent 记录。
 *
 * payload 统一改为结构化 `{ path }`，
 * 这样后续 recent 命令如果再扩展额外字段，不需要再改调用方签名。
 */
export function requestRecentRemove(targetPath) {
  return channelUtil.send({
    event: 'recent.remove',
    data: {
      path: targetPath,
    },
  })
}

/**
 * recent 打开失败的统一判定。
 *
 * 兼容期内 renderer 还会遇到两种结果：
 * 1. 历史兼容路径返回 `false`
 * 2. 新命令返回 `{ ok: false, reason: 'open-target-missing' | 'recent-missing' }`
 *
 * 这里统一吸收这两种语义，避免菜单/提示逻辑重复判断。
 */
export function isDocumentOpenMissingResult(result) {
  if (result === false) {
    return true
  }

  return result?.ok === false
    && (result?.reason === 'open-target-missing' || result?.reason === 'recent-missing')
}

export default {
  requestDocumentSave,
  requestDocumentSaveAndClose,
  requestDocumentSaveCopy,
  requestDocumentEdit,
  requestDocumentOpenDialog,
  requestDocumentResolveOpenTarget,
  requestPrepareOpenPathInCurrentWindow,
  requestDocumentOpenPath,
  requestDocumentOpenPathInCurrentWindow,
  requestDocumentActivateTab,
  requestDocumentCloseTab,
  requestDocumentReorderTabs,
  requestDocumentSessionSnapshot,
  requestRecentClear,
  requestRecentRemove,
  isDocumentOpenMissingResult,
}
