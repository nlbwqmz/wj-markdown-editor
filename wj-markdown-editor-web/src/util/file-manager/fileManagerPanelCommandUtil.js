import channelUtil from '@/util/channel/channelUtil.js'

/**
 * 请求指定目录的文件管理栏目录状态。
 *
 * Electron 侧真正的目录扫描稍后再实现，
 * renderer 当前只负责把 IPC 契约和入参固定下来。
 */
export function requestFileManagerDirectoryState(payload) {
  return channelUtil.send({
    event: 'file-manager.get-directory-state',
    data: payload,
  })
}

/**
 * 请求打开并切换文件管理栏当前目录。
 */
export function requestFileManagerOpenDirectory(payload) {
  return channelUtil.send({
    event: 'file-manager.open-directory',
    data: payload,
  })
}

/**
 * 请求在当前目录下创建文件夹。
 */
export function requestFileManagerCreateFolder(payload) {
  return channelUtil.send({
    event: 'file-manager.create-folder',
    data: payload,
  })
}

/**
 * 请求在当前目录下创建 Markdown 文件。
 */
export function requestFileManagerCreateMarkdown(payload) {
  return channelUtil.send({
    event: 'file-manager.create-markdown',
    data: payload,
  })
}

/**
 * 轻量同步当前目录 watcher 的读取选项，不触发额外目录重扫。
 */
export function requestFileManagerSyncCurrentDirectoryOptions(payload) {
  return channelUtil.send({
    event: 'file-manager.sync-current-directory-options',
    data: payload,
  })
}

/**
 * 复用已有的目录选择 IPC，让文件管理栏无需另起一套协议。
 */
export function requestFileManagerPickDirectory() {
  return channelUtil.send({
    event: 'open-dir-select',
  })
}

export default {
  requestFileManagerDirectoryState,
  requestFileManagerOpenDirectory,
  requestFileManagerCreateFolder,
  requestFileManagerCreateMarkdown,
  requestFileManagerSyncCurrentDirectoryOptions,
  requestFileManagerPickDirectory,
}
