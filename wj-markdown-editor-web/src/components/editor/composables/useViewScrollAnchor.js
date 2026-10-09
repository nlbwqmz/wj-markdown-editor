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
 * 读取 getter 返回的字符串值。
 *
 * @param {(() => string | null | undefined) | undefined} getter
 * @returns {string} 返回 getter 给出的字符串；getter 缺失或返回值非法时返回空字符串。
 */
function resolveGetterString(getter) {
  const value = typeof getter === 'function' ? getter() : undefined

  return typeof value === 'string' ? value : ''
}

/**
 * 规范化当前快照信息。
 * 文档身份优先取 documentKeyGetter；未注入时回退 sessionIdGetter，
 * 保证尚未迁移的调用方行为不变。
 * 这里不强制校验业务合法性，真正的恢复资格判断统一交给 shouldRestoreAnchorRecord。
 *
 * @param {(() => string | null | undefined) | undefined} documentKeyGetter
 * @param {() => string | null | undefined} sessionIdGetter
 * @param {() => number | null | undefined} revisionGetter
 * @returns {{ documentKey: string, sessionId: string, revision: number | null | undefined }} 返回当前快照的文档身份。
 */
function getCurrentSnapshot(documentKeyGetter, sessionIdGetter, revisionGetter) {
  const sessionId = resolveGetterString(sessionIdGetter)
  const documentKey = resolveGetterString(documentKeyGetter) || sessionId

  return {
    documentKey,
    sessionId,
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
 *   documentKeyGetter?: () => string | null | undefined,
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
    documentKeyGetter,
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
   * 标记当前是否有一轮恢复正在执行。
   * 恢复期间 DOM 位置可能仍是恢复前的旧值，
   * 此时采集必须被抑制，否则会把过期位置覆盖进缓存。
   */
  let restoreInFlight = false

  /**
   * 统一构造当前快照下的缓存读取结果。
   * 读取逻辑集中在这里，避免多个导出 API 对 documentKey / scrollAreaKey 拼装方式不一致。
   *
   * @returns {{
   *   documentKey: string,
   *   sessionId: string,
   *   revision: number | null | undefined,
   *   record: object | null,
   * }} 返回当前快照以及该快照对应的缓存记录。
   */
  function getSnapshotRecord() {
    const snapshot = getCurrentSnapshot(documentKeyGetter, sessionIdGetter, revisionGetter)

    return {
      ...snapshot,
      record: getAnchorRecord(store, {
        documentKey: snapshot.documentKey,
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
   * 只有在当前确实拿得到滚动容器时才允许写入缓存：
   * 1. 对 keep-alive 视图而言，区域被 v-if 隐藏时通常拿不到真实 DOM
   * 2. 此时若仍强行写入，会把上一轮可恢复的真实锚点覆盖成空记录
   * 3. 因此“容器不存在”必须视为本轮无法采集，直接保留旧记录
   *
   * 在容器存在的前提下，即使 captureAnchor 返回 null，也仍会把 fallbackScrollTop 一并保存，
   * 以便调用方在缺少精确锚点时仍可基于回退滚动值做兜底恢复。
   *
   * @returns {object | null} 返回写入缓存后的记录副本；写入失败时返回 null。
   */
  function captureCurrentAnchor() {
    const { documentKey, sessionId, revision } = getCurrentSnapshot(documentKeyGetter, sessionIdGetter, revisionGetter)

    if (restoreInFlight === true) {
      // 恢复进行中：DOM 位置可能仍是恢复前的旧值，
      // 此时采集会把过期位置覆盖进缓存，因此直接返回已有记录维持逻辑位置。
      return getAnchorRecord(store, {
        documentKey,
        scrollAreaKey,
      })
    }

    const scrollElement = typeof getScrollElement === 'function' ? getScrollElement() : null

    if (!scrollElement) {
      return null
    }

    const anchor = typeof captureAnchor === 'function'
      ? captureAnchor({
          sessionId,
          revision,
          scrollAreaKey,
          scrollElement,
        })
      : null

    return saveAnchorRecord(store, {
      documentKey,
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
    restoreInFlight = false
  }

  /**
   * 判断当前快照下是否存在可恢复的锚点记录。
   * 这里严格复用 shouldRestoreAnchorRecord，确保“是否可恢复”的语义与真正恢复前的资格判断完全一致。
   *
   * @param {{ mode?: 'same-session' | 'document' }} [options]
   * @returns {boolean} 返回当前快照是否存在可直接参与恢复的锚点记录。
   */
  function hasRestorableAnchor(options = {}) {
    const { documentKey, sessionId, revision, record } = getSnapshotRecord()

    return shouldRestoreAnchorRecord({
      record,
      documentKey,
      sessionId,
      revision,
      mode: options?.mode,
    })
  }

  /**
   * 为当前快照安排一次滚动恢复。
   * 恢复前必须先确认记录仍匹配当前文档身份；
   * `same-session` 模式额外要求 sessionId + revision 一致，
   * `document` 模式只认 documentKey，用于同一窗口切换文档的场景。
   * 若首次恢复返回 false，则只额外等待一次布局并再重试一次。
   *
   * @param {{ mode?: 'same-session' | 'document' }} [options]
   * @returns {Promise<boolean>} 返回本次请求是否已完成有效恢复；被取消、无资格或两次尝试均未成功时返回 false。
   */
  async function scheduleRestoreForCurrentSnapshot(options = {}) {
    const mode = options?.mode ?? 'same-session'
    const token = ++restoreToken
    const { documentKey, sessionId, revision, record } = getSnapshotRecord()

    if (!shouldRestoreAnchorRecord({
      record,
      documentKey,
      sessionId,
      revision,
      mode,
    })) {
      return false
    }

    restoreInFlight = true

    const restoreContext = {
      token,
      documentKey,
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
         * 既防止等待期间文档身份漂移后继续恢复旧记录，
         * 也保证当前 restore 使用的是最新缓存中的同版本记录。
         */
        const latestSnapshotRecord = getSnapshotRecord()

        if (mode === 'document') {
          if (latestSnapshotRecord.documentKey !== documentKey) {
            return false
          }
        } else if (latestSnapshotRecord.sessionId !== sessionId || latestSnapshotRecord.revision !== revision) {
          return false
        }

        if (!shouldRestoreAnchorRecord({
          record: latestSnapshotRecord.record,
          documentKey: latestSnapshotRecord.documentKey,
          sessionId: latestSnapshotRecord.sessionId,
          revision: latestSnapshotRecord.revision,
          mode,
        })) {
          return false
        }

        if (typeof restoreAnchor !== 'function') {
          return false
        }

        const latestRestoreContext = {
          ...restoreContext,
          documentKey: latestSnapshotRecord.documentKey,
          sessionId: latestSnapshotRecord.sessionId,
          revision: latestSnapshotRecord.revision,
          record: latestSnapshotRecord.record,
        }

        /**
         * 等待布局完成后，仍然必须重新确认滚动容器是否真实存在。
         * 这能覆盖“区域当前被隐藏”或“DOM 尚未挂载完成”的场景，
         * 并确保在容器缺失时不会把旧记录错误地交给 restoreAnchor 处理。
         */
        const scrollElement = typeof getScrollElement === 'function' ? getScrollElement() : null
        if (!scrollElement) {
          continue
        }

        const restoreResult = await restoreAnchor({
          ...latestRestoreContext,
          attempt,
          scrollElement,
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
      if (token === restoreToken) {
        restoreInFlight = false
      }

      onRestoreFinish?.({
        ...restoreContext,
        attempts,
        restored,
        cancelled,
      })
    }
  }

  /**
   * 将当前滚动容器重置到顶部。
   * 文档切换或显式重置场景下，调用方需要在没有可恢复记录时主动归零，
   * 避免共享滚动容器把上一篇文档的 scrollTop 残留到新文档。
   * 这里只负责取消挂起恢复并写入 scrollTop，不改动其他状态。
   *
   * @returns {boolean} 返回是否成功重置；滚动容器不存在时返回 false。
   */
  function resetToTop() {
    cancelPendingRestore()

    const scrollElement = typeof getScrollElement === 'function' ? getScrollElement() : null

    if (!scrollElement) {
      return false
    }

    scrollElement.scrollTop = 0

    return true
  }

  return {
    captureCurrentAnchor,
    scheduleRestoreForCurrentSnapshot,
    cancelPendingRestore,
    hasRestorableAnchor,
    resetToTop,
  }
}
