import assert from 'node:assert/strict'

const { test } = await import('node:test')

let schedulerModule = null

try {
  schedulerModule = await import('../editorViewActivationRestoreScheduler.js')
} catch {
  schedulerModule = null
}

/**
 * 统一断言视图层恢复调度器存在。
 * 红灯阶段若模块尚未提供，测试会稳定失败在这里，避免把问题误报成断言条件书写错误。
 *
 * @returns {Function} 返回待测的工厂函数。
 */
function requireCreateEditorViewActivationRestoreScheduler() {
  assert.ok(schedulerModule, '缺少 EditorView 激活恢复调度器模块')

  const { createEditorViewActivationRestoreScheduler } = schedulerModule
  assert.equal(typeof createEditorViewActivationRestoreScheduler, 'function')

  return createEditorViewActivationRestoreScheduler
}

/**
 * 创建一个可手动冲刷的 nextTick 调度器桩。
 * 测试通过显式 flush 来模拟“激活后 nextTick 才真正执行恢复”的时序窗口。
 *
 * @returns {{
 *   queueSize: () => number,
 *   schedule: (callback: () => void) => void,
 *   flush: () => void,
 * }} 返回调度器桩对象。
 */
function createDeferredScheduler() {
  const callbacks = []

  return {
    queueSize() {
      return callbacks.length
    },
    schedule(callback) {
      callbacks.push(callback)
    },
    flush() {
      while (callbacks.length > 0) {
        callbacks.shift()?.()
      }
    },
  }
}

test('激活恢复应绑定激活窗口内最后一份仍有效的 snapshot identity，而不是较早闭包值', () => {
  const createEditorViewActivationRestoreScheduler = requireCreateEditorViewActivationRestoreScheduler()
  const deferredScheduler = createDeferredScheduler()
  const restoreCalls = []

  const scheduler = createEditorViewActivationRestoreScheduler({
    schedule: deferredScheduler.schedule,
    restoreSnapshot: (snapshotIdentity) => {
      restoreCalls.push(snapshotIdentity)
    },
  })

  scheduler.markPendingRestore()
  scheduler.applySnapshot({
    sessionId: 'session-1',
    revision: 7,
  })
  scheduler.applySnapshot({
    sessionId: 'session-1',
    revision: 8,
  })

  assert.equal(deferredScheduler.queueSize(), 1)
  assert.deepEqual(restoreCalls, [])

  deferredScheduler.flush()

  assert.deepEqual(restoreCalls, [{
    sessionId: 'session-1',
    revision: 8,
  }])
})
