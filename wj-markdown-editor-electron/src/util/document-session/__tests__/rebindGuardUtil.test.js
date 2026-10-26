import { describe, expect, it, vi } from 'vitest'
import { createRebindGuard, DEFAULT_REBIND_MAX_REPLAY } from '../rebindGuardUtil.js'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolveInner, rejectInner) => {
    resolve = resolveInner
    reject = rejectInner
  })
  return { promise, resolve, reject }
}

describe('createRebindGuard', () => {
  it('没有重叠请求时只落地一次并原样返回结果', async () => {
    const guard = createRebindGuard()
    const session = { sessionId: 'tab-a' }
    const task = vi.fn(async () => ({ ok: true, boundSessionId: 'tab-a' }))

    const result = await guard.run({
      windowId: 'win-1',
      target: session,
      task,
      resolveLatest: () => session,
      isAlive: () => true,
    })

    expect(task).toHaveBeenCalledTimes(1)
    expect(task).toHaveBeenCalledWith(session)
    expect(result).toEqual({ ok: true, boundSessionId: 'tab-a' })
  })

  it('先发起、后落地的过期结果必须按最新真值重放一次', async () => {
    const guard = createRebindGuard()
    const slowSession = { sessionId: 'tab-b' }
    const fastSession = { sessionId: 'tab-c' }
    let activeSession = slowSession
    const slowDeferred = createDeferred()
    const task = vi.fn(async (session) => {
      if (session === slowSession) {
        await slowDeferred.promise
        return { ok: true, boundSessionId: session.sessionId }
      }
      return { ok: true, boundSessionId: session.sessionId }
    })

    const runParams = {
      windowId: 'win-1',
      task,
      resolveLatest: () => activeSession,
      isAlive: () => true,
    }

    // 第一次落地（目标是 B）发起后迟迟不返回
    const slowRun = guard.run({ ...runParams, target: slowSession })
    // 期间活动会话被改成 C，第二次落地立即完成
    activeSession = fastSession
    await guard.run({ ...runParams, target: fastSession })

    // 旧结果这才落地：它会把绑定写回 B，必须被封印并重放成 C
    slowDeferred.resolve()
    const slowResult = await slowRun

    expect(task).toHaveBeenCalledTimes(3)
    expect(task.mock.calls[2][0]).toBe(fastSession)
    expect(slowResult).toEqual({ ok: true, boundSessionId: 'tab-c' })
  })

  it('真值没变时不得重放（重复发起同一目标是常态）', async () => {
    const guard = createRebindGuard()
    const session = { sessionId: 'tab-a' }
    const slowDeferred = createDeferred()
    let callCount = 0
    const task = vi.fn(async () => {
      callCount += 1
      // 只让第一次落地变慢，第二次立即完成
      if (callCount === 1) {
        await slowDeferred.promise
      }
      return { ok: true }
    })
    const runParams = {
      windowId: 'win-1',
      task,
      resolveLatest: () => session,
      isAlive: () => true,
    }

    const firstRun = guard.run({ ...runParams, target: session })
    await Promise.resolve()
    await guard.run({ ...runParams, target: session })
    slowDeferred.resolve()
    await firstRun

    expect(task).toHaveBeenCalledTimes(2)
  })

  it('重放必须有次数上限，避免死循环', async () => {
    const guard = createRebindGuard({ maxReplay: 1 })
    let latestIndex = 0
    const task = vi.fn(async () => {
      // 每次落地期间都模拟“又来了一个新请求”，让本次结果永远过期
      guard.nextGeneration('win-1')
      return { ok: true }
    })

    await guard.run({
      windowId: 'win-1',
      target: { sessionId: 'tab-0' },
      task,
      // 每次读真值都返回新对象，保证重放条件成立
      resolveLatest: () => ({ sessionId: `tab-${++latestIndex}` }),
      isAlive: () => true,
    })

    expect(task).toHaveBeenCalledTimes(1 + 1)
    expect(guard.size()).toBe(1)
  })

  it('默认重放上限为 2', () => {
    expect(DEFAULT_REBIND_MAX_REPLAY).toBe(2)
  })

  it('窗口已关闭时不得重放', async () => {
    const guard = createRebindGuard()
    const task = vi.fn(async () => {
      guard.nextGeneration('win-1')
      return { ok: true }
    })

    await guard.run({
      windowId: 'win-1',
      target: { sessionId: 'tab-a' },
      task,
      resolveLatest: () => ({ sessionId: 'tab-b' }),
      isAlive: () => false,
    })

    expect(task).toHaveBeenCalledTimes(1)
  })

  it('窗口已没有活动会话时不得重放', async () => {
    const guard = createRebindGuard()
    const task = vi.fn(async () => {
      guard.nextGeneration('win-1')
      return { ok: true }
    })

    await guard.run({
      windowId: 'win-1',
      target: { sessionId: 'tab-a' },
      task,
      resolveLatest: () => null,
      isAlive: () => true,
    })

    expect(task).toHaveBeenCalledTimes(1)
  })

  it('缺少窗口 id 或目标时直接返回 null 且不落地', async () => {
    const guard = createRebindGuard()
    const task = vi.fn(async () => ({ ok: true }))

    expect(await guard.run({ windowId: null, target: { sessionId: 'a' }, task, resolveLatest: () => null })).toBe(null)
    expect(await guard.run({ windowId: 'win-1', target: null, task, resolveLatest: () => null })).toBe(null)
    expect(task).not.toHaveBeenCalled()
  })

  it('落地动作抛错时必须向上抛，不得吞掉', async () => {
    const guard = createRebindGuard()
    const error = new Error('rebind failed')

    await expect(guard.run({
      windowId: 'win-1',
      target: { sessionId: 'tab-a' },
      task: async () => {
        throw error
      },
      resolveLatest: () => null,
    })).rejects.toThrow('rebind failed')
  })

  it('clear 之后代次号归零，窗口不会无限累积', async () => {
    const guard = createRebindGuard()
    const session = { sessionId: 'tab-a' }

    await guard.run({
      windowId: 'win-1',
      target: session,
      task: async () => ({ ok: true }),
      resolveLatest: () => session,
    })
    expect(guard.size()).toBe(1)

    guard.clear('win-1')
    expect(guard.size()).toBe(0)
    expect(guard.isLatest('win-1', 1)).toBe(false)
  })
})
