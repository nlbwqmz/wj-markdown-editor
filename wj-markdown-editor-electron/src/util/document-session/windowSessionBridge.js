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
 * 这样可以把“状态”和“一次性副作用”彻底拆开，避免渲染层再去猜当前保存态。
 */
export function createWindowSessionBridge({
  store,
  sendToRenderer,
  resolveWindowById,
  getAllWindows = () => [],
}) {
  const lastSnapshotMap = new Map()
  let lastRecentListSignature = null

  function publishLegacySnapshotAliases(win, snapshot, previousSnapshot) {
    if (!snapshot) {
      return
    }

    // `file-is-saved` 仍被旧 renderer 直接消费，
    // 但它只能从 snapshot.saved 的边沿变化窄口代发，不能再回头读 winInfo 镜像。
    if (previousSnapshot && previousSnapshot.saved !== snapshot.saved) {
      sendToRenderer(win, {
        event: 'file-is-saved',
        data: snapshot.saved,
      })
    }

    // `file-external-changed` 仍然是旧 diff 提示入口，
    // 这里只在 externalPrompt 从“无”到“有”时代发，避免每次普通快照都误触发覆盖弹窗。
    if (!previousSnapshot?.externalPrompt && snapshot.externalPrompt?.visible) {
      sendToRenderer(win, {
        event: 'file-external-changed',
        data: {
          fileName: snapshot.externalPrompt.fileName,
          version: snapshot.externalPrompt.version,
          localContent: snapshot.externalPrompt.localContent,
          externalContent: snapshot.externalPrompt.externalContent,
        },
      })
    }
  }

  function getSessionSnapshot(windowId) {
    const session = store?.getSessionByWindowId(windowId)
    return session ? deriveDocumentSnapshot(session) : null
  }

  function publishSnapshotChanged({ windowId, snapshot = getSessionSnapshot(windowId) }) {
    const win = resolveWindowById?.(windowId) || null
    if (!snapshot || !isWindowUsable(win)) {
      return snapshot
    }
    const previousSnapshot = lastSnapshotMap.get(windowId) || null
    lastSnapshotMap.set(windowId, snapshot)
    sendToRenderer(win, {
      event: 'document.snapshot.changed',
      data: snapshot,
    })
    publishLegacySnapshotAliases(win, snapshot, previousSnapshot)
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
    sendToRenderer(win, {
      event: 'message',
      data,
    })
    return latestSnapshot
  }

  function publishRecentListChanged(recentList) {
    // recent 列表允许被多个入口重复回调，例如保存后 recent.add 写回、启动时 recent 初始化等。
    // 这里必须用“完整列表签名”做一次幂等收口，确保只有列表内容真的变化时才广播，
    // 避免 renderer 因重复 `update-recent` / `window.effect.recent-list-changed` 进入无意义刷新。
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
      sendToRenderer(win, {
        event: 'update-recent',
        data: nextRecentList,
      })
    })
    return nextRecentList
  }

  return {
    getSessionSnapshot,
    publishSnapshotChanged,
    publishMessage,
    publishRecentListChanged,
  }
}

export default {
  createWindowSessionBridge,
}
