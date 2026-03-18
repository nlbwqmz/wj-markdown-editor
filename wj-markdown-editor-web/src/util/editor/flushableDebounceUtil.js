/**
 * 将等待时间规范化为可交给 setTimeout 的非负数字。
 * 这里不对外扩展更多配置，只保证传入异常值时不会让调度器崩掉。
 *
 * @param {unknown} wait
 * @returns {number} 返回规范化后的等待毫秒数。
 */
function normalizeWait(wait) {
  const numericWait = Number(wait)

  if (!Number.isFinite(numericWait) || numericWait < 0) {
    return 0
  }

  return numericWait
}

/**
 * 创建一个支持手动 flush 的防抖调度器。
 * 调度器始终只保留最后一次 schedule 的参数，
 * 在等待时间结束后执行回调，或由 flush 立即执行。
 *
 * @param {(...args: any[]) => any} callback
 * @param {number} wait
 * @returns {{
 *   schedule: (...args: any[]) => void,
 *   flush: () => any,
 *   cancel: () => void,
 *   hasPending: () => boolean,
 * }} 返回包含调度、立即执行、取消和挂起状态查询能力的防抖控制器。
 */
export function createFlushableDebounce(callback, wait = 0) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback 必须是函数')
  }

  const normalizedWait = normalizeWait(wait)

  // timerId 为 null 表示当前没有激活中的定时器。
  let timerId = null

  // pendingArgs 为 null 表示当前没有待执行任务。
  // 只保留最后一次 schedule 的参数，符合典型防抖语义。
  let pendingArgs = null

  /**
   * 清理当前活动中的定时器，避免旧任务在后续被重复触发。
   */
  function clearTimer() {
    if (timerId === null) {
      return
    }

    clearTimeout(timerId)
    timerId = null
  }

  /**
   * 执行当前挂起任务，并在执行前先消费掉挂起参数。
   * 这样即便 callback 内部再次 schedule，也不会被当前这次执行覆盖。
   *
   * @returns {any} 返回 callback 的执行结果；没有挂起任务时返回 undefined。
   */
  function invokePending() {
    if (pendingArgs === null) {
      return undefined
    }

    const args = pendingArgs
    pendingArgs = null

    return callback(...args)
  }

  /**
   * 使用最新参数重新启动一次防抖调度。
   *
   * @param {...any} args
   */
  function schedule(...args) {
    pendingArgs = args
    clearTimer()

    timerId = setTimeout(() => {
      // 定时器回调开始执行时，先把 timerId 置空，
      // 这样 hasPending 的结果只由 pendingArgs 决定，不会残留过期 timer 状态。
      timerId = null
      invokePending()
    }, normalizedWait)
  }

  /**
   * 立即执行当前挂起任务，并取消原有定时器。
   *
   * @returns {any} 返回 callback 的执行结果；没有挂起任务时返回 undefined。
   */
  function flush() {
    if (pendingArgs === null) {
      return undefined
    }

    clearTimer()
    return invokePending()
  }

  /**
   * 取消当前挂起任务，不触发回调。
   */
  function cancel() {
    clearTimer()
    pendingArgs = null
  }

  /**
   * 判断当前是否仍存在待执行任务。
   *
   * @returns {boolean} 返回当前是否仍保留尚未执行的最新任务。
   */
  function hasPending() {
    return pendingArgs !== null
  }

  return {
    schedule,
    flush,
    cancel,
    hasPending,
  }
}

export default {
  createFlushableDebounce,
}
