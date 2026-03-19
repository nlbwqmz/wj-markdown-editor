import { normalizeRecentList } from './documentSessionSnapshotUtil.js'

export const DOCUMENT_SESSION_SNAPSHOT_CHANGED_EVENT = 'document.snapshot.changed'
export const DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT = 'document-session-snapshot-changed'
export const WINDOW_EFFECT_MESSAGE_EVENT = 'window.effect.message'
export const WINDOW_EFFECT_RECENT_LIST_CHANGED_EVENT = 'window.effect.recent-list-changed'
export const DOCUMENT_EXTERNAL_APPLY_COMMAND = 'document.external.apply'
export const DOCUMENT_EXTERNAL_IGNORE_COMMAND = 'document.external.ignore'

/**
 * 创建首屏 snapshot 拉取保护器。
 *
 * renderer 页面在 mounted 时会：
 * 1. 先订阅主进程 push
 * 2. 再异步拉一次当前 snapshot
 *
 * 如果更晚的 push 先到，再让更早发起的 IPC 响应覆盖回去，
 * 就会把页面和 store 回滚到旧状态。这个 guard 专门用于丢弃这种过期响应。
 */
export function createDocumentSessionBootstrapGuard() {
  let requestId = 0
  let appliedSnapshotVersion = 0

  return {
    beginRequest() {
      requestId += 1
      return {
        requestId,
        appliedSnapshotVersion,
      }
    },
    markSnapshotApplied() {
      appliedSnapshotVersion += 1
      return appliedSnapshotVersion
    },
    shouldApplyRequestResult(requestContext) {
      return requestContext?.requestId === requestId
        && requestContext?.appliedSnapshotVersion === appliedSnapshotVersion
    },
  }
}

/**
 * 创建 renderer 侧的 session 事件适配器。
 *
 * 这里故意只接三类事件：
 * 1. `document.snapshot.changed` 负责状态真相
 * 2. `window.effect.message` 负责一次性提示
 * 3. `window.effect.recent-list-changed` 负责 recent 整表替换
 *
 * 这样可以保证保存态、外部修改态、标题等派生结果都只从 snapshot 推导。
 */
export function createDocumentSessionEventHandlers({
  store,
  publishSnapshotChanged,
  showMessage,
  setDocumentTitle,
  syncClosePrompt,
}) {
  return {
    [DOCUMENT_SESSION_SNAPSHOT_CHANGED_EVENT]: (snapshot) => {
      const normalizedSnapshot = store.applyDocumentSessionSnapshot(snapshot)

      if (typeof setDocumentTitle === 'function') {
        setDocumentTitle(normalizedSnapshot.windowTitle)
      }
      if (typeof publishSnapshotChanged === 'function') {
        publishSnapshotChanged(normalizedSnapshot)
      }
      if (typeof syncClosePrompt === 'function') {
        syncClosePrompt(normalizedSnapshot)
      }

      return normalizedSnapshot
    },
    [WINDOW_EFFECT_MESSAGE_EVENT]: (effect) => {
      if (effect && typeof showMessage === 'function') {
        showMessage(effect)
      }
      return effect
    },
    [WINDOW_EFFECT_RECENT_LIST_CHANGED_EVENT]: (recentList) => {
      const normalizedRecentList = normalizeRecentList(recentList)
      if (typeof store?.replaceRecentList === 'function') {
        return store.replaceRecentList(normalizedRecentList)
      }
      return normalizedRecentList
    },
  }
}

export default {
  createDocumentSessionBootstrapGuard,
  DOCUMENT_SESSION_SNAPSHOT_CHANGED_EVENT,
  DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT,
  WINDOW_EFFECT_MESSAGE_EVENT,
  WINDOW_EFFECT_RECENT_LIST_CHANGED_EVENT,
  DOCUMENT_EXTERNAL_APPLY_COMMAND,
  DOCUMENT_EXTERNAL_IGNORE_COMMAND,
  createDocumentSessionEventHandlers,
}
