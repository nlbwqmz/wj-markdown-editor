import assert from 'node:assert/strict'

const { test } = await import('node:test')

let rendererSessionEventSubscriptionModule = null

try {
  rendererSessionEventSubscriptionModule = await import('../rendererSessionEventSubscription.js')
} catch {
  rendererSessionEventSubscriptionModule = null
}

test('keep-alive 页面失活时，snapshot 监听必须解除；重新激活后再恢复监听', () => {
  assert.ok(rendererSessionEventSubscriptionModule, '缺少 renderer snapshot 事件订阅控制器')

  const { createRendererSessionEventSubscription } = rendererSessionEventSubscriptionModule
  assert.equal(typeof createRendererSessionEventSubscription, 'function')

  const callList = []
  const listener = () => {}
  const subscription = createRendererSessionEventSubscription({
    eventName: 'document-session-snapshot-changed',
    listener,
    addListener(eventName, callback) {
      callList.push({
        type: 'add',
        eventName,
        callback,
      })
    },
    removeListener(eventName, callback) {
      callList.push({
        type: 'remove',
        eventName,
        callback,
      })
    },
  })

  assert.equal(subscription.activate(), true)
  assert.equal(subscription.deactivate(), true)
  assert.equal(subscription.activate(), true)

  assert.deepEqual(callList, [
    {
      type: 'add',
      eventName: 'document-session-snapshot-changed',
      callback: listener,
    },
    {
      type: 'remove',
      eventName: 'document-session-snapshot-changed',
      callback: listener,
    },
    {
      type: 'add',
      eventName: 'document-session-snapshot-changed',
      callback: listener,
    },
  ])
})

test('subscription dispose 后，必须彻底停止监听，且不能再被重新激活', () => {
  assert.ok(rendererSessionEventSubscriptionModule, '缺少 renderer snapshot 事件订阅控制器')

  const { createRendererSessionEventSubscription } = rendererSessionEventSubscriptionModule
  const callList = []
  const listener = () => {}
  const subscription = createRendererSessionEventSubscription({
    eventName: 'document-session-snapshot-changed',
    listener,
    addListener(eventName, callback) {
      callList.push({
        type: 'add',
        eventName,
        callback,
      })
    },
    removeListener(eventName, callback) {
      callList.push({
        type: 'remove',
        eventName,
        callback,
      })
    },
  })

  subscription.activate()
  assert.equal(subscription.dispose(), true)
  assert.equal(subscription.activate(), false)

  assert.deepEqual(callList, [
    {
      type: 'add',
      eventName: 'document-session-snapshot-changed',
      callback: listener,
    },
    {
      type: 'remove',
      eventName: 'document-session-snapshot-changed',
      callback: listener,
    },
  ])
})
