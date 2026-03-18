import { nextTick } from 'vue'

import {
  getAnchorRecord,
  saveAnchorRecord,
  shouldRestoreAnchorRecord,
} from '../../../util/editor/viewScrollAnchorSessionUtil.js'

/**
 * 等待下一帧动画时机。
 * 默认布局等待语义要求使用 requestAnimationFrame；但在测试或极少数非浏览器环境中，
 * 该 API 可能暂时不存在，因此这里保留一个安全的 setTimeout 兜底，避免直接抛异常。
 *
 * @returns {Promise<void>} 返回在下一次动画帧回调后才 resolve 的 Promise。
 */
function waitNextAnimationFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        resolve()
      })
      return
    }

    setTimeout(() => {
      resolve()
    }, 16)
  })
}

/**
 * 默认的布局稳定等待函数。
 * 这里明确执行 `nextTick + 2 * requestAnimationFrame`：
 * 1. `nextTick` 等待 Vue 把当前响应式更新和 DOM patch 刷完
 * 2. 第一帧等待浏览器接收并应用布局结果
 * 3. 第二帧再给依赖尺寸与滚动容器的读取逻辑一个稳定窗口
 * 该顺序与设计约束保持一致，避免恢复时过早读取到未稳定的布局。
 *
 * @returns {Promise<void>} 返回在默认布局稳定等待链执行完成后才 resolve 的 Promise。
 */
async function defaultWaitLayoutStable() {
  await nextTick()
  await waitNextAnimationFrame()
  await waitNextAnimationFrame()
}

/**
 * 规范化当前快照信息。
 * 这里不强制校验 sessionId / revision 的业务合法性，而是把原值继续向后传递；
 * 真正的恢复资格判断统一交给 shouldRestoreAnchorRecord，保证判定口径只有一处。
 *
 * @param {() => string | null | undefined} sessionIdGetter
 * @param {() => number | null | undefined} revisionGetter
 * @returns {{ sessionId: string, revision: number | null | undefined }} 返回当前快照的 sessionId 与 revision。
 */
function getCurrentSnapshot(sessionIdGetter, revisionGetter) {
  return {
    sessionId: typeof sessionIdGetter === 'function' ? (sessionIdGetter() ?? '') : '',
    revision: typeof revisionGetter === 'function' ? revisionGetter() : undefined,
  }
}

/**
 * 读取滚动容器当前 scrollTop，并兜底为安全数字。
 * 这样即使调用方暂时拿不到 DOM，也不会把 NaN 写入会话缓存。
 *
 * @param {{ scrollTop?: number } | null | undefined} scrollElement
 * @returns {number} 返回可安全写入缓存的回退滚动值。
 */
function getFallbackScrollTop(scrollElement) {
  return Number.isFinite(scrollElement?.scrollTop) ? scrollElement.scrollTop : 0
}

/**
 * 滚动锚点调度 composable。
 * 该层只负责会话缓存与恢复时序，不负责几何计算和 DOM 查询策略；
 * 具体锚点采集 / 恢复细节由外部通过依赖注入提供，便于独立测试。
 *
 * @param {{
 *   store?: Record<string, Record<string, any>>,
 *   sessionIdGetter?: () => string | null | undefined,
 *   revisionGetter?: () => number | null | undefined,
 *   scrollAreaKey?: string,
 *   getScrollElement?: () => any,
 *   captureAnchor?: (payload: any) => any,
 *   restoreAnchor?: (payload: any) => boolean | Promise<boolean>,
 *   waitLayoutStable?: () => Promise<void>,
 *   onRestoreStart?: (payload: any) => void,
 *   onRestoreFinish?: (payload: any) => void,
 * }} options
 */
export function useViewScrollAnchor(options = {}) {
  const {
    store,
    sessionIdGetter,
    revisionGetter,
    scrollAreaKey = '',
    getScrollElement,
    captureAnchor,
    restoreAnchor,
    waitLayoutStable = defaultWaitLayoutStable,
    onRestoreStart,
    onRestoreFinish,
  } = options

  /**
   * 递增 token 用于让旧的异步恢复请求在 await 之后自动失效。
   * 每发起一次新的恢复或显式取消，都必须推进该计数。
   */
  let restoreToken = 0

  /**
   * 统一构造当前快照下的缓存读取结果。
   * 读取逻辑集中在这里，避免多个导出 API 对 sessionId / scrollAreaKey 拼装方式不一致。
   *
   * @returns {{
   *   sessionId: string,
   *   revision: number | null | undefined,
   *   record: object | null,
   * }} 返回当前快照以及该快照对应的缓存记录。
   */
  function getSnapshotRecord() {
    const snapshot = getCurrentSnapshot(sessionIdGetter, revisionGetter)

    return {
      ...snapshot,
      record: getAnchorRecord(store, {
        sessionId: snapshot.sessionId,
        scrollAreaKey,
      }),
    }
  }

  /**
   * 判断某个 token 在当前时刻是否仍是最新请求。
   * 所有异步等待点恢复后都必须再次调用该函数，避免旧请求越过新请求继续操作滚动条。
   *
   * @param {number} token
   * @returns {boolean} 返回该 token 是否仍代表当前最新恢复请求。
   */
  function isActiveRestoreToken(token) {
    return token === restoreToken
  }

  /**
   * 记录当前快照对应的滚动锚点。
   * 即使 captureAnchor 返回 null，也仍会把 fallbackScrollTop 一并保存，
   * 以便调用方在缺少精确锚点时仍可基于回退滚动值做兜底恢复。
   *
   * @returns {object | null} 返回写入缓存后的记录副本；写入失败时返回 null。
   */
  function captureCurrentAnchor() {
    const { sessionId, revision } = getCurrentSnapshot(sessionIdGetter, revisionGetter)
    const scrollElement = typeof getScrollElement === 'function' ? getScrollElement() : null
    const anchor = typeof captureAnchor === 'function'
      ? captureAnchor({
          sessionId,
          revision,
          scrollAreaKey,
          scrollElement,
        })
      : null

    return saveAnchorRecord(store, {
      sessionId,
      scrollAreaKey,
      revision,
      anchor,
      fallbackScrollTop: getFallbackScrollTop(scrollElement),
      savedAt: Date.now(),
    })
  }

  /**
   * 取消当前挂起的恢复请求。
   * 这里不需要显式中断 Promise，只要推进 token，旧请求在下一个 await 恢复点就会自动失效。
   */
  function cancelPendingRestore() {
    restoreToken++
  }

  /**
   * 判断当前快照下是否存在可恢复的锚点记录。
   * 这里严格复用 shouldRestoreAnchorRecord，确保“是否可恢复”的语义与真正恢复前的资格判断完全一致。
   *
   * @returns {boolean} 返回当前快照是否存在可直接参与恢复的锚点记录。
   */
  function hasRestorableAnchor() {
    const { sessionId, revision, record } = getSnapshotRecord()

    return shouldRestoreAnchorRecord({
      record,
      sessionId,
      revision,
    })
  }

  /**
   * 为当前快照安排一次滚动恢复。
   * 恢复前必须先确认记录仍匹配当前 sessionId + revision；
   * 若首次恢复返回 false，则只额外等待一次布局并再重试一次。
   *
   * @returns {Promise<boolean>} 返回本次请求是否已完成有效恢复；被取消、无资格或两次尝试均未成功时返回 false。
   */
  async function scheduleRestoreForCurrentSnapshot() {
    const token = ++restoreToken
    const { sessionId, revision, record } = getSnapshotRecord()

    if (!shouldRestoreAnchorRecord({
      record,
      sessionId,
      revision,
    })) {
      return false
    }

    const restoreContext = {
      token,
      sessionId,
      revision,
      scrollAreaKey,
      record,
    }

    onRestoreStart?.(restoreContext)

    let attempts = 0
    let restored = false
    let cancelled = false

    try {
      /**
       * 最多执行两轮：
       * 1. 首轮等待布局稳定后尝试恢复
       * 2. 若返回 false，说明布局或元素尚未就绪，再额外等待一次并只重试一次
       */
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (!isActiveRestoreToken(token)) {
          cancelled = true
          return false
        }

        attempts = attempt
        await waitLayoutStable()

        if (!isActiveRestoreToken(token)) {
          cancelled = true
          return false
        }

        /**
         * 即使 token 仍然有效，也不能假设等待前读取到的快照仍然成立。
         * 这里必须在真正 restore 前重新读取当前 snapshot 与缓存记录，
         * 既防止等待期间 sessionId / revision 漂移后继续恢复旧记录，
         * 也保证当前 restore 使用的是最新缓存中的同版本记录。
         */
        const latestSnapshotRecord = getSnapshotRecord()

        if (latestSnapshotRecord.sessionId !== sessionId || latestSnapshotRecord.revision !== revision) {
          return false
        }

        if (!shouldRestoreAnchorRecord({
          record: latestSnapshotRecord.record,
          sessionId: latestSnapshotRecord.sessionId,
          revision: latestSnapshotRecord.revision,
        })) {
          return false
        }

        if (typeof restoreAnchor !== 'function') {
          return false
        }

        const latestRestoreContext = {
          ...restoreContext,
          sessionId: latestSnapshotRecord.sessionId,
          revision: latestSnapshotRecord.revision,
          record: latestSnapshotRecord.record,
        }

        const restoreResult = await restoreAnchor({
          ...latestRestoreContext,
          attempt,
          scrollElement: typeof getScrollElement === 'function' ? getScrollElement() : null,
        })

        if (!isActiveRestoreToken(token)) {
          cancelled = true
          return false
        }

        /**
         * 只有显式返回 false 才表示“当前布局未就绪，需要再试一次”。
         * 其余返回值都视为本轮已结束，避免把缺省实现或无返回值误判为失败。
         */
        if (restoreResult !== false) {
          restored = true
          return true
        }
      }

      return false
    } finally {
      onRestoreFinish?.({
        ...restoreContext,
        attempts,
        restored,
        cancelled,
      })
    }
  }

  return {
    captureCurrentAnchor,
    scheduleRestoreForCurrentSnapshot,
    cancelPendingRestore,
    hasRestorableAnchor,
  }
}
