import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STARTUP_LOADING_DISMISSED_EVENT,
  waitForStartupLoadingDismissed,
} from '@/util/startupLoadingUtil.js'

function createStartupLoadingElement() {
  const startupLoading = document.createElement('div')
  startupLoading.id = 'startup-loading'
  document.body.appendChild(startupLoading)
  return startupLoading
}

describe('waitForStartupLoadingDismissed', () => {
  afterEach(() => {
    document.getElementById('startup-loading')?.remove()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('遮罩不存在时必须立即完成，不需要等事件', async () => {
    await expect(waitForStartupLoadingDismissed()).resolves.toBeUndefined()
  })

  it('遮罩存在时必须等 DISMISSED 事件后才完成', async () => {
    createStartupLoadingElement()

    let settled = false
    const promise = waitForStartupLoadingDismissed().then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)

    document.getElementById('startup-loading')?.remove()
    window.dispatchEvent(new CustomEvent(STARTUP_LOADING_DISMISSED_EVENT))
    await promise

    expect(settled).toBe(true)
  })

  it('遮罩一直不撤时必须在超时后完成，不能永远挂起', async () => {
    vi.useFakeTimers()
    createStartupLoadingElement()

    let settled = false
    const promise = waitForStartupLoadingDismissed({ timeoutMs: 50 }).then(() => {
      settled = true
    })

    vi.advanceTimersByTime(49)
    await Promise.resolve()
    expect(settled).toBe(false)

    vi.advanceTimersByTime(1)
    await promise
    expect(settled).toBe(true)
  })

  it('超时后到达的 DISMISSED 事件不得重复完成或抛错', async () => {
    vi.useFakeTimers()
    createStartupLoadingElement()

    const promise = waitForStartupLoadingDismissed({ timeoutMs: 10 })
    vi.advanceTimersByTime(10)
    await promise

    expect(() => {
      window.dispatchEvent(new CustomEvent(STARTUP_LOADING_DISMISSED_EVENT))
    }).not.toThrow()
  })
})
