import assert from 'node:assert/strict'

const { test } = await import('node:test')

let flushableDebounceUtilModule = null

try {
  // 这里先尝试加载目标模块。
  // 在 TDD 的红灯阶段，该文件尚未创建时会进入 catch，
  // 让测试以“缺少模块”的预期原因失败。
  flushableDebounceUtilModule = await import('../flushableDebounceUtil.js')
} catch {
  flushableDebounceUtilModule = null
}

/**
 * 统一校验目标模块是否已经存在，并返回工厂函数。
 * 这样每条测试在红灯阶段都会给出一致且可读的失败信息。
 *
 * @returns {Function} 返回待测的 createFlushableDebounce 工厂函数。
 */
function requireCreateFlushableDebounce() {
  assert.ok(flushableDebounceUtilModule, '缺少 flushable debounce util')

  const { createFlushableDebounce } = flushableDebounceUtilModule
  assert.equal(typeof createFlushableDebounce, 'function')

  return createFlushableDebounce
}

test('flush 应立即执行最后一次调度的参数', (t) => {
  const createFlushableDebounce = requireCreateFlushableDebounce()

  // 使用 mock timers 精确推进时间，避免真实等待导致测试不稳定。
  t.mock.timers.enable({ apis: ['setTimeout'] })

  const calls = []
  const runner = createFlushableDebounce((value) => {
    calls.push(value)
  }, 160)

  runner.schedule('a')
  runner.schedule('b')
  runner.flush()

  assert.deepEqual(calls, ['b'])
  assert.equal(runner.hasPending(), false)

  // flush 之后原本的定时器不应再重复触发。
  t.mock.timers.tick(160)
  assert.deepEqual(calls, ['b'])
})

test('未 flush 时应按最后一次参数延迟执行', (t) => {
  const createFlushableDebounce = requireCreateFlushableDebounce()

  t.mock.timers.enable({ apis: ['setTimeout'] })

  const calls = []
  const runner = createFlushableDebounce((value) => {
    calls.push(value)
  }, 160)

  runner.schedule('a')
  t.mock.timers.tick(80)
  runner.schedule('b')

  // 第二次调度后应重新开始计时，在等待未满时不能提前执行。
  t.mock.timers.tick(159)
  assert.deepEqual(calls, [])
  assert.equal(runner.hasPending(), true)

  t.mock.timers.tick(1)
  assert.deepEqual(calls, ['b'])
  assert.equal(runner.hasPending(), false)
})

test('cancel 后不应再执行回调', (t) => {
  const createFlushableDebounce = requireCreateFlushableDebounce()

  t.mock.timers.enable({ apis: ['setTimeout'] })

  const calls = []
  const runner = createFlushableDebounce((value) => {
    calls.push(value)
  }, 160)

  runner.schedule('cancel-me')
  assert.equal(runner.hasPending(), true)

  runner.cancel()
  assert.equal(runner.hasPending(), false)

  t.mock.timers.tick(160)
  assert.deepEqual(calls, [])
})

test('hasPending 应反映当前是否仍有待执行任务', (t) => {
  const createFlushableDebounce = requireCreateFlushableDebounce()

  t.mock.timers.enable({ apis: ['setTimeout'] })

  const runner = createFlushableDebounce(() => {}, 160)

  assert.equal(runner.hasPending(), false)

  runner.schedule('pending')
  assert.equal(runner.hasPending(), true)

  runner.flush()
  assert.equal(runner.hasPending(), false)

  runner.schedule('pending-again')
  assert.equal(runner.hasPending(), true)

  runner.cancel()
  assert.equal(runner.hasPending(), false)
})
