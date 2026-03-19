import {
  createDefaultDocumentSessionSnapshot,
  normalizeDocumentSessionSnapshot,
} from './documentSessionSnapshotUtil.js'

/**
 * 判断当前 store 里的 snapshot 是否已经是“可以直接拿来恢复页面”的真实快照。
 *
 * keep-alive 恢复时不能盲目重放 store：
 * 1. 默认占位快照只代表 renderer 还没 bootstrap，不应把页面提前从 ready=false 打开
 * 2. 但如果别的活动链路已经把 store 同步成真实 session 快照，本页即使还没本地 apply 过，
 *    也应该先立刻重放，避免继续空白等待新的 IPC
 */
export function hasRenderableStoreSnapshot(snapshot) {
  const normalizedSnapshot = normalizeDocumentSessionSnapshot(snapshot)
  const defaultSnapshot = createDefaultDocumentSessionSnapshot()

  return normalizedSnapshot.sessionId !== null
    || normalizedSnapshot.displayPath !== null
    || normalizedSnapshot.recentMissingPath !== null
    || normalizedSnapshot.resourceContext?.documentPath !== null
    || normalizedSnapshot.fileName !== defaultSnapshot.fileName
    || normalizedSnapshot.content !== defaultSnapshot.content
    || normalizedSnapshot.exists === true
    || normalizedSnapshot.closePrompt?.visible === true
    || normalizedSnapshot.externalPrompt?.visible === true
}

/**
 * 统一 keep-alive 页面恢复激活时的动作决策。
 *
 * 返回值只有三种：
 * - `replay-store`: 直接重放 store 里的最新真快照
 * - `request-bootstrap`: 当前没有可重放真快照，必须重新补拉 bootstrap
 * - `noop`: 既没有可重放真快照，也不需要额外补拉
 */
export function resolveRendererSessionActivationAction({
  hasAppliedSnapshot = false,
  needsBootstrapOnActivate = false,
  storeSnapshot = null,
} = {}) {
  if (hasAppliedSnapshot === true) {
    return 'replay-store'
  }

  if (hasRenderableStoreSnapshot(storeSnapshot)) {
    return 'replay-store'
  }

  if (needsBootstrapOnActivate === true) {
    return 'request-bootstrap'
  }

  return 'noop'
}

/**
 * 判断 keep-alive 页面在 mounted 阶段是否还需要主动拉一次 bootstrap。
 *
 * 当前路由容器统一使用 `<KeepAlive>`，因此真正的“页面进入”语义应该由 `onActivated`
 * 负责处理。这样 mounted 与 activated 不会在首次进入时双发 bootstrap / 双重放。
 * 如果未来某个页面脱离 KeepAlive 单独使用，调用方可以显式传 `insideKeepAlive: false`
 * 恢复 mounted 兜底拉取。
 */
export function shouldBootstrapSessionSnapshotOnMounted({
  insideKeepAlive = true,
} = {}) {
  return insideKeepAlive !== true
}

export default {
  hasRenderableStoreSnapshot,
  resolveRendererSessionActivationAction,
  shouldBootstrapSessionSnapshotOnMounted,
}
