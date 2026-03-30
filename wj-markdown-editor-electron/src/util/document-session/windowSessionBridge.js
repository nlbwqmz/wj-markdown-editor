import { deriveDocumentSnapshot } from './documentSnapshotUtil.js'

function isWindowUsable(win) {
  if (!win) {
    return false
  }
  if (typeof win.isDestroyed === 'function' && win.isDestroyed()) {
    return false
  }
  if (win.webContents && typeof win.webContents.isDestroyed === 'function' && win.webContents.isDestroyed()) {
    return false
  }
  return true
}

/**
 * 统一负责把主进程当前 active session 真相投影给渲染层。
 *
 * 这里故意只暴露 `document.snapshot.changed` / `window.effect.*` 三类推送：
 * 1. `document.snapshot.changed` 是 renderer 唯一允许依赖的状态真相
 * 2. `window.effect.message` 只承载一次性提示，不能混入持久状态
 * 3. `window.effect.recent-list-changed` 只承载完整 recent 列表刷新
 *
 * Task 7 起不再补发 `file-is-saved`、`file-external-changed`、`update-recent`
 * 这类 legacy 文档事件；Task 5 起 session 路径上的一次性提示也不再补发
 * legacy `message`，避免主进程再次长出第二套状态出口。
 */
export function createWindowSessionBridge({
  store,
  sendToRenderer,
  resolveWindowById,
  getAllWindows = () => [],
}) {
  const lastSnapshotMap = new Map()
  let lastRecentListSignature = null

  function getSessionSnapshot(windowId) {
    const session = store?.getSessionByWindowId(windowId)
    return session ? deriveDocumentSnapshot(session) : null
  }

  function publishSnapshotChanged({ windowId, snapshot = getSessionSnapshot(windowId) }) {
    const win = resolveWindowById?.(windowId) || null
    if (!snapshot || !isWindowUsable(win)) {
      return snapshot
    }
    lastSnapshotMap.set(windowId, snapshot)
    sendToRenderer(win, {
      event: 'document.snapshot.changed',
      data: snapshot,
    })
    return snapshot
  }

  function publishMessage({ windowId, data, snapshot }) {
    const win = resolveWindowById?.(windowId) || null
    if (!data || !isWindowUsable(win)) {
      return null
    }

    const latestSnapshot = publishSnapshotChanged({
      windowId,
      snapshot,
    })
    sendToRenderer(win, {
      event: 'window.effect.message',
      data,
    })
    return latestSnapshot
  }

  function publishRecentListChanged(recentList) {
    // recent 列表允许被多个入口重复回调，例如保存后 recent.add 写回、启动时 recent 初始化等。
    // 这里必须用“完整列表签名”做一次幂等收口，确保只有列表内容真的变化时才广播，
    // 避免 renderer 因重复 recent 刷新进入无意义重渲染。
    const nextRecentList = Array.isArray(recentList) ? recentList : []
    const nextSignature = JSON.stringify(nextRecentList)
    if (nextSignature === lastRecentListSignature) {
      return nextRecentList
    }

    lastRecentListSignature = nextSignature
    getAllWindows().forEach((win) => {
      if (!isWindowUsable(win)) {
        return
      }
      sendToRenderer(win, {
        event: 'window.effect.recent-list-changed',
        data: nextRecentList,
      })
    })
    return nextRecentList
  }

  function publishFileManagerDirectoryChanged({ windowId, directoryState }) {
    const win = resolveWindowById?.(windowId) || null
    if (!directoryState || !isWindowUsable(win)) {
      return null
    }

    sendToRenderer(win, {
      event: 'window.effect.file-manager-directory-changed',
      data: directoryState,
    })
    return directoryState
  }

  return {
    getSessionSnapshot,
    publishFileManagerDirectoryChanged,
    publishSnapshotChanged,
    publishMessage,
    publishRecentListChanged,
  }
}

export default {
  createWindowSessionBridge,
}
