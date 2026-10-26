/**
 * 异步落地动作的“代次封印”。
 *
 * 场景：同一个窗口里连着发起两次需要落地副作用的动作（切换标签、关闭标签…），
 * 动作的 dispatch 是同步的，所以状态推进不乱；但落地动作本身是异步 I/O，
 * 两次之间没有互斥——先发起、后落地的那次会把副作用写回旧状态。
 * 典型症状：标签已经是 C，侧边栏目录与外部文件监听却还停在 B。
 *
 * 这里用“每个窗口一个代次号”识别过期结果：
 * 落地完成后发现有更新的请求，就丢弃本次结果，按**当前真值**重放一次，
 * 让最新意图胜出。重放有次数上限，避免死循环。
 *
 * 必须在同一个 guard 实例上串同一个窗口的同类动作，代次号才有意义。
 */

export const DEFAULT_REBIND_MAX_REPLAY = 2

/**
 * 创建代次封印。
 *
 * @param {object} [options]
 * @param {number} [options.maxReplay] 过期后最多重放几次，默认 2。
 * @returns {object} `{ run, clear, nextGeneration, isLatest, size }`
 */
export function createRebindGuard({ maxReplay = DEFAULT_REBIND_MAX_REPLAY } = {}) {
  const generationMap = new Map()

  /**
   * 取该窗口的下一个代次号：每次发起落地动作都要先取号。
   */
  function nextGeneration(windowId) {
    const generation = (generationMap.get(windowId) || 0) + 1
    generationMap.set(windowId, generation)
    return generation
  }

  function isLatest(windowId, generation) {
    return generationMap.get(windowId) === generation
  }

  /**
   * 窗口关闭时清理代次，避免 Map 随窗口数量无限增长。
   */
  function clear(windowId) {
    generationMap.delete(windowId)
  }

  /**
   * 执行一次落地动作，过期时按真值重放。
   *
   * @param {object} params
   * @param {string|number} params.windowId 窗口 id，作为代次的隔离维度。
   * @param {*} params.target 本次要落地的目标（会话对象等）。
   * @param {(target: *) => Promise<*>} params.task 真正的落地动作。
   * @param {(windowId: string|number) => *} params.resolveLatest 读取当前真值。
   * @param {(windowId: string|number) => boolean} [params.isAlive] 目标是否还活着。
   * @param {number} [params.replayDepth] 内部重放深度，调用方不要传。
   * @returns {Promise<*>} 最后一次有效落地的结果。
   */
  async function run({ windowId, target, task, resolveLatest, isAlive, replayDepth = 0 }) {
    if (!windowId || !target) {
      return null
    }

    const generation = nextGeneration(windowId)
    const result = await task(target)

    // 落地期间没有更新的请求：本次结果有效。
    if (isLatest(windowId, generation)) {
      return result
    }

    if (replayDepth >= maxReplay) {
      return result
    }

    // 窗口已经关了：副作用由关窗流程统一回收，重放没有意义。
    if (typeof isAlive === 'function' && isAlive(windowId) === false) {
      return result
    }

    const latest = resolveLatest(windowId)
    // 真值没变（只是有人重复发起同一目标）：最新那次绑的是同一个对象，不必重放。
    if (latest == null || latest === target) {
      return result
    }

    return await run({
      windowId,
      target: latest,
      task,
      resolveLatest,
      isAlive,
      replayDepth: replayDepth + 1,
    })
  }

  return {
    run,
    clear,
    nextGeneration,
    isLatest,
    size: () => generationMap.size,
  }
}
