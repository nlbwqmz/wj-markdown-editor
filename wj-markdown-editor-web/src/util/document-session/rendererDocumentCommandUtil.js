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
 * 请求主进程直接打开指定路径。
 *
 * recent 菜单、历史记录点击等“已知路径”的入口都应该走这里，
 * 这样 renderer 可以直接拿到结构化打开结果，而不是继续依赖历史兼容布尔值。
 */
export function requestDocumentOpenPath(targetPath, options = {}) {
  return channelUtil.send({
    event: 'document.open-path',
    data: {
      path: targetPath,
      ...options,
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
  requestDocumentSaveCopy,
  requestDocumentEdit,
  requestDocumentOpenDialog,
  requestDocumentOpenPath,
  requestDocumentSessionSnapshot,
  requestRecentClear,
  requestRecentRemove,
  isDocumentOpenMissingResult,
}
