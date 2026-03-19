import assert from 'node:assert/strict'

const { test } = await import('node:test')

let exportImageLoadUtilModule = null

try {
  exportImageLoadUtilModule = await import('../exportImageLoadUtil.js')
} catch {
  exportImageLoadUtilModule = null
}

function requireWaitForImagesSettled() {
  assert.ok(exportImageLoadUtilModule, '缺少 export image load util')

  const { waitForImagesSettled } = exportImageLoadUtilModule
  assert.equal(typeof waitForImagesSettled, 'function')

  return waitForImagesSettled
}

function createMockImage({ complete = false } = {}) {
  const listeners = new Map()

  return {
    complete,
    addEventListener(type, listener) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set())
      }
      listeners.get(type).add(listener)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type) {
      for (const listener of listeners.get(type) || []) {
        listener()
      }
    },
  }
}

test('已经 complete 的图片不应继续阻塞导出', async () => {
  const waitForImagesSettled = requireWaitForImagesSettled()

  await waitForImagesSettled([
    createMockImage({ complete: true }),
    createMockImage({ complete: true }),
  ])

  assert.ok(true)
})

test('图片 load 后应结束等待', async () => {
  const waitForImagesSettled = requireWaitForImagesSettled()
  const pendingImage = createMockImage({ complete: false })

  const waitingPromise = waitForImagesSettled([pendingImage])
  pendingImage.dispatch('load')

  await waitingPromise
  assert.ok(true)
})

test('图片 error 后也应结束等待，不能因为坏图阻塞导出', async () => {
  const waitForImagesSettled = requireWaitForImagesSettled()
  const brokenImage = createMockImage({ complete: false })

  const waitingPromise = waitForImagesSettled([brokenImage])
  brokenImage.dispatch('error')

  await waitingPromise
  assert.ok(true)
})
