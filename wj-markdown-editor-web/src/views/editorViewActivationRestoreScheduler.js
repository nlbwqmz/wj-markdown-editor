import { nextTick } from 'vue'

import { getDocumentSessionSnapshotIdentity } from '../util/document-session/documentSessionSnapshotUtil.js'

/**
 * 创建 EditorView 激活后的滚动恢复调度器。
 * 该调度器只解决视图层恢复时序，不关心正文同步或具体滚动实现：
 * 1. `onActivated` 只声明“本轮允许恢复”
 * 2. `applyDocumentSessionSnapshot` 每次都可推进最新 snapshot identity
 * 3. 真正进入 nextTick 时，总是读取激活窗口内最后一份仍有效的 identity
 *
 * 这样可以避免“较早 snapshot 在 nextTick 回调里闭包住旧 revision，
 * 后续 pushed snapshot 已经推进到新 revision，但恢复仍按旧 identity 执行”的竞态。
 *
 * @param {{
 *   schedule?: (callback: () => void) => void,
 *   cancelActiveRestore?: () => void,
 *   restoreSnapshot?: (snapshotIdentity: { sessionId: string | null, revision: number }) => void | Promise<void>,
 * }} options
 */
export function createEditorViewActivationRestoreScheduler(options = {}) {
  const {
    schedule = (callback) => {
      nextTick(() => {
        callback()
      })
    },
    cancelActiveRestore,
    restoreSnapshot,
  } = options

  let pendingRestore = false
  let scheduled = false
  let restoreInFlight = false
  let rescheduleAfterInFlight = false
  let requestToken = 0
  let latestSnapshotIdentity = null

  /**
   * 真正安排一次 nextTick 恢复。
   * 同一激活窗口内最多只排一轮 tick，后续 snapshot 只更新 latest identity。
   */
  function ensureScheduled() {
    if (scheduled === true) {
      return
    }

    scheduled = true
    const scheduledToken = requestToken

    schedule(() => {
      scheduled = false

      if (
        scheduledToken !== requestToken
        || pendingRestore !== true
        || latestSnapshotIdentity == null
        || restoreInFlight === true
      ) {
        return
      }

      restoreInFlight = true
      pendingRestore = false

      Promise.resolve(restoreSnapshot?.(latestSnapshotIdentity))
        .finally(() => {
          restoreInFlight = false

          if (scheduledToken !== requestToken) {
            return
          }

          if (rescheduleAfterInFlight === true && pendingRestore === true && latestSnapshotIdentity != null) {
            rescheduleAfterInFlight = false
            ensureScheduled()
            return
          }

          rescheduleAfterInFlight = false
        })
    })
  }

  return {
    /**
     * keep-alive 激活时只声明“下一次 snapshot 应允许触发恢复”。
     */
    markPendingRestore() {
      pendingRestore = true
      latestSnapshotIdentity = null
      rescheduleAfterInFlight = false
      requestToken++
      scheduled = false
    },

    /**
     * 页面失活或销毁时取消当前激活窗口的恢复资格。
     */
    cancelPendingRestore() {
      pendingRestore = false
      latestSnapshotIdentity = null
      rescheduleAfterInFlight = false
      requestToken++
      scheduled = false
      cancelActiveRestore?.()
    },

    /**
     * 每次应用 snapshot 时推进“当前激活窗口内最新的恢复目标”。
     *
     * @param {object | null | undefined} snapshot
     */
    applySnapshot(snapshot) {
      if (!snapshot) {
        return
      }

      if (pendingRestore !== true && restoreInFlight !== true) {
        return
      }

      latestSnapshotIdentity = getDocumentSessionSnapshotIdentity(snapshot)

      if (restoreInFlight === true) {
        pendingRestore = true
        rescheduleAfterInFlight = true
        cancelActiveRestore?.()
        return
      }

      ensureScheduled()
    },
  }
}

export default {
  createEditorViewActivationRestoreScheduler,
}
