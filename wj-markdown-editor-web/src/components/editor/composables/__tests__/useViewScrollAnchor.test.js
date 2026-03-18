import assert from 'node:assert/strict'

import {
  createViewScrollAnchorSessionStore,
  getAnchorRecord,
  saveAnchorRecord,
} from '../../../../util/editor/viewScrollAnchorSessionUtil.js'
import { useViewScrollAnchor } from '../useViewScrollAnchor.js'

const { test } = await import('node:test')

/**
 * 创建一个可由测试手动控制完成时机的 Promise。
 * 这样可以精确验证“等待布局完成之后才允许恢复”以及“旧 token 失效”的异步时序。
 *
 * @returns {{
 *   promise: Promise<void>,
 *   resolve: () => void,
 *   reject: (error?: unknown) => void,
 * }} 返回一个由测试手动驱动 resolve / reject 的延迟对象。
 */
function createDeferred() {
  let resolve
  let reject

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

/**
 * 创建最小可用的滚动容器桩对象。
 * composable 只会读取 scrollTop，因此这里无需实现真实 DOM 接口。
 *
 * @param {{ scrollTop?: number }} [options]
 * @returns {{ scrollTop: number }} 返回仅包含 scrollTop 的最小滚动容器桩对象。
 */
function createScrollElement(options = {}) {
  return {
    scrollTop: options.scrollTop ?? 0,
  }
}

/**
 * 向会话缓存中写入一条默认合法的锚点记录。
 * 各测试只需要覆盖与自身断言相关的字段，避免重复铺设样板数据。
 *
 * @param {Record<string, Record<string, any>>} store
 * @param {{
 *   sessionId?: string,
 *   scrollAreaKey?: string,
 *   revision?: number,
 *   fallbackScrollTop?: number,
 *   savedAt?: number,
 *   anchor?: object | null,
 * }} [options]
 * @returns {object | null} 返回写入缓存后的记录副本，便于个别测试直接复用。
 */
function seedAnchorRecord(store, options = {}) {
  return saveAnchorRecord(store, {
    sessionId: options.sessionId ?? 'session-1',
    scrollAreaKey: options.scrollAreaKey ?? 'preview-pane',
    revision: options.revision ?? 7,
    anchor: options.anchor ?? {
      type: 'preview-line',
      lineStart: 7,
      lineEnd: 9,
      elementOffsetRatio: 0.25,
    },
    fallbackScrollTop: options.fallbackScrollTop ?? 120,
    savedAt: options.savedAt ?? 123,
  })
}

/**
 * 组装 composable 运行所需的通用桩对象。
 * 当前任务只关心调度逻辑，因此把会变化的 sessionId / revision 放在可变 state 中，方便测试动态切换快照。
 *
 * @param {{
 *   store?: Record<string, Record<string, any>>,
 *   sessionId?: string,
 *   revision?: number,
 *   scrollAreaKey?: string,
 *   scrollElement?: { scrollTop: number } | null,
 *   captureAnchor?: (payload: any) => any,
 *   restoreAnchor?: (payload: any) => boolean | Promise<boolean>,
 *   waitLayoutStable?: () => Promise<void>,
 *   onRestoreStart?: (payload: any) => void,
 *   onRestoreFinish?: (payload: any) => void,
 * }} [options]
 * @returns {{
 *   state: { sessionId: string, revision: number },
 *   store: Record<string, Record<string, any>>,
 *   scrollElement: { scrollTop: number } | null,
 *   api: ReturnType<typeof useViewScrollAnchor>,
 * }} 返回测试常用的状态对象、缓存、滚动容器桩以及 composable API。
 */
function createHarness(options = {}) {
  const state = {
    sessionId: options.sessionId ?? 'session-1',
    revision: options.revision ?? 7,
  }
  const store = options.store ?? createViewScrollAnchorSessionStore()
  const scrollElement = options.scrollElement ?? createScrollElement({ scrollTop: 120 })

  return {
    state,
    store,
    scrollElement,
    api: useViewScrollAnchor({
      store,
      sessionIdGetter: () => state.sessionId,
      revisionGetter: () => state.revision,
      scrollAreaKey: options.scrollAreaKey ?? 'preview-pane',
      getScrollElement: () => scrollElement,
      captureAnchor: options.captureAnchor ?? (() => ({
        type: 'preview-line',
        lineStart: 7,
        lineEnd: 9,
        elementOffsetRatio: 0.25,
      })),
      restoreAnchor: options.restoreAnchor ?? (() => true),
      waitLayoutStable: options.waitLayoutStable,
      onRestoreStart: options.onRestoreStart,
      onRestoreFinish: options.onRestoreFinish,
    }),
  }
}

/**
 * 连续冲刷若干轮微任务队列。
 * 该辅助函数用于把 `await nextTick()` 这类 Promise 链推进到可观察状态，
 * 但不会替代 requestAnimationFrame，因此很适合拿来验证默认等待路径的阶段边界。
 *
 * @param {number} [times]
 * @returns {Promise<void>} 返回在指定轮数微任务全部冲刷完成后才 resolve 的 Promise。
 */
async function flushMicrotasks(times = 1) {
  for (let index = 0; index < times; index++) {
    await Promise.resolve()
  }
}

test('scheduleRestoreForCurrentSnapshot 会先等待布局稳定再执行恢复', async () => {
  const store = createViewScrollAnchorSessionStore()
  const callOrder = []
  const restoreCalls = []
  const deferred = createDeferred()

  seedAnchorRecord(store)

  const { api } = createHarness({
    store,
    waitLayoutStable: async () => {
      callOrder.push('wait')
      await deferred.promise
    },
    restoreAnchor: (payload) => {
      callOrder.push('restore')
      restoreCalls.push(payload)
      return true
    },
  })

  const restorePromise = api.scheduleRestoreForCurrentSnapshot()

  assert.deepEqual(callOrder, ['wait'])
  assert.equal(restoreCalls.length, 0)

  deferred.resolve()
  await restorePromise

  assert.deepEqual(callOrder, ['wait', 'restore'])
  assert.equal(restoreCalls.length, 1)
  assert.equal(restoreCalls[0].revision, 7)
})

test('恢复请求 token 过期后，不会再执行旧恢复', async () => {
  const store = createViewScrollAnchorSessionStore()
  const restoreCalls = []
  const waits = [createDeferred(), createDeferred()]
  let waitIndex = 0

  seedAnchorRecord(store)

  const { api } = createHarness({
    store,
    waitLayoutStable: () => waits[waitIndex++].promise,
    restoreAnchor: (payload) => {
      restoreCalls.push(payload)
      return true
    },
  })

  const firstPromise = api.scheduleRestoreForCurrentSnapshot()
  const secondPromise = api.scheduleRestoreForCurrentSnapshot()

  waits[0].resolve()
  await firstPromise

  assert.equal(restoreCalls.length, 0)

  waits[1].resolve()
  await secondPromise

  assert.equal(restoreCalls.length, 1)
  assert.equal(restoreCalls[0].revision, 7)
})

test('shouldRestoreAnchorRecord 为 false 时不会调用 restoreAnchor', async () => {
  const store = createViewScrollAnchorSessionStore()
  let waitCalls = 0
  let restoreCalls = 0

  seedAnchorRecord(store, { revision: 6 })

  const { api } = createHarness({
    store,
    revision: 7,
    waitLayoutStable: async () => {
      waitCalls++
    },
    restoreAnchor: () => {
      restoreCalls++
      return true
    },
  })

  await api.scheduleRestoreForCurrentSnapshot()

  assert.equal(waitCalls, 0)
  assert.equal(restoreCalls, 0)
})

test('首轮布局不可用时只额外重试一次', async () => {
  const store = createViewScrollAnchorSessionStore()
  const restoreCalls = []
  let waitCalls = 0

  seedAnchorRecord(store)

  const { api } = createHarness({
    store,
    waitLayoutStable: async () => {
      waitCalls++
    },
    restoreAnchor: (payload) => {
      restoreCalls.push(payload)
      return false
    },
  })

  await api.scheduleRestoreForCurrentSnapshot()

  assert.equal(waitCalls, 2)
  assert.equal(restoreCalls.length, 2)
  assert.equal(restoreCalls[0].revision, 7)
  assert.equal(restoreCalls[1].revision, 7)
})

test('captureCurrentAnchor 会将当前 session 与 revision 的锚点写入 store', () => {
  const store = createViewScrollAnchorSessionStore()
  const originalDateNow = Date.now

  Date.now = () => 456

  try {
    const { api } = createHarness({
      store,
      scrollElement: createScrollElement({ scrollTop: 245 }),
      captureAnchor: ({ scrollElement }) => ({
        type: 'preview-line',
        lineStart: 15,
        lineEnd: 18,
        elementOffsetRatio: scrollElement.scrollTop / 1000,
      }),
    })

    api.captureCurrentAnchor()

    assert.deepEqual(getAnchorRecord(store, {
      sessionId: 'session-1',
      scrollAreaKey: 'preview-pane',
    }), {
      sessionId: 'session-1',
      scrollAreaKey: 'preview-pane',
      revision: 7,
      anchor: {
        type: 'preview-line',
        lineStart: 15,
        lineEnd: 18,
        elementOffsetRatio: 0.245,
      },
      fallbackScrollTop: 245,
      savedAt: 456,
    })
  } finally {
    Date.now = originalDateNow
  }
})

test('hasRestorableAnchor 会随当前 snapshot 变化而变化', () => {
  const store = createViewScrollAnchorSessionStore()

  seedAnchorRecord(store, { revision: 7 })

  const { api, state } = createHarness({
    store,
    revision: 7,
  })

  assert.equal(api.hasRestorableAnchor(), true)

  state.revision = 8

  assert.equal(api.hasRestorableAnchor(), false)
})

test('未注入 waitLayoutStable 时默认会执行 nextTick 与两次 requestAnimationFrame', async () => {
  const store = createViewScrollAnchorSessionStore()
  const restoreCalls = []
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  const rafCallbacks = []
  let rafCallCount = 0

  seedAnchorRecord(store)

  globalThis.requestAnimationFrame = (callback) => {
    rafCallCount++
    rafCallbacks.push(callback)
    return rafCallCount
  }
  globalThis.cancelAnimationFrame = () => {}

  try {
    const { api } = createHarness({
      store,
      waitLayoutStable: undefined,
      restoreAnchor: (payload) => {
        restoreCalls.push(payload)
        return true
      },
    })

    const restorePromise = api.scheduleRestoreForCurrentSnapshot()

    /**
     * 刚发起恢复时只能进入 `await nextTick()` 之前的同步阶段，
     * 因此这时既不能注册第一帧 rAF，也绝不能提前执行恢复。
     */
    assert.equal(rafCallCount, 0)
    assert.equal(rafCallbacks.length, 0)
    assert.equal(restoreCalls.length, 0)

    /**
     * 冲刷 nextTick 对应的微任务后，才允许进入第一帧 rAF。
     * 若实现退化为“直接 requestAnimationFrame”，上面的同步断言就会立刻失败；
     * 若根本没有 nextTick，这里的阶段边界也会被打乱。
     */
    await flushMicrotasks(1)

    assert.equal(rafCallCount, 1)
    assert.equal(rafCallbacks.length, 1)
    assert.equal(restoreCalls.length, 0)

    /**
     * 触发第一帧回调本身只会结束第一轮等待，
     * 第二帧 rAF 应该在随后的微任务继续链路时才被注册。
     */
    rafCallbacks.shift()?.(16)

    assert.equal(rafCallCount, 1)
    assert.equal(rafCallbacks.length, 0)
    assert.equal(restoreCalls.length, 0)

    await flushMicrotasks(1)

    assert.equal(rafCallCount, 2)
    assert.equal(rafCallbacks.length, 1)
    assert.equal(restoreCalls.length, 0)

    /**
     * 第二帧回调结束时，默认等待链才算完全走完；
     * 真正调用 restoreAnchor 仍应发生在后续微任务中，而不是同步发生在回调内。
     */
    rafCallbacks.shift()?.(32)

    assert.equal(rafCallCount, 2)
    assert.equal(rafCallbacks.length, 0)
    assert.equal(restoreCalls.length, 0)

    await flushMicrotasks(2)
    await restorePromise

    assert.equal(rafCallCount, 2)
    assert.equal(restoreCalls.length, 1)
    assert.equal(restoreCalls[0].revision, 7)
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
  }
})
