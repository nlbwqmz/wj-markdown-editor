import assert from 'node:assert/strict'

const { test } = await import('node:test')

let previewAssetSessionControllerModule = null

try {
  previewAssetSessionControllerModule = await import('../previewAssetSessionController.js')
} catch {
  previewAssetSessionControllerModule = null
}

test('文档快照上下文变化后，旧的资源操作上下文必须立即失效，并触发 UI 失效回调', () => {
  assert.ok(previewAssetSessionControllerModule, '缺少 preview asset session controller')

  const { createPreviewAssetSessionController } = previewAssetSessionControllerModule
  assert.equal(typeof createPreviewAssetSessionController, 'function')

  const invalidatedSnapshots = []
  const controller = createPreviewAssetSessionController({
    onContextInvalidated(snapshot) {
      invalidatedSnapshots.push(snapshot)
    },
  })

  controller.syncSnapshot({
    sessionId: 'session-1',
    content: '# 第一版正文',
    resourceContext: {
      documentPath: 'C:/docs/demo.md',
    },
  })
  const firstActionContext = controller.captureActionContext()

  assert.equal(controller.isActiveContext(firstActionContext), true)
  assert.deepEqual(controller.createRequestContext(firstActionContext), {
    sessionId: 'session-1',
    documentPath: 'C:/docs/demo.md',
  })
  assert.equal(invalidatedSnapshots.length, 0)

  controller.syncSnapshot({
    sessionId: 'session-1',
    content: '# 第二版正文',
    resourceContext: {
      documentPath: 'C:/docs/demo.md',
    },
  })

  assert.equal(controller.isActiveContext(firstActionContext), false)
  assert.equal(invalidatedSnapshots.length, 1)
  assert.equal(invalidatedSnapshots[0].content, '# 第二版正文')
})

test('快照上下文未变化时，不应重复触发资源操作上下文失效', () => {
  assert.ok(previewAssetSessionControllerModule, '缺少 preview asset session controller')

  const { createPreviewAssetSessionController } = previewAssetSessionControllerModule
  const invalidatedSnapshots = []
  const controller = createPreviewAssetSessionController({
    onContextInvalidated(snapshot) {
      invalidatedSnapshots.push(snapshot)
    },
  })

  const snapshot = {
    sessionId: 'session-1',
    content: '# 正文保持不变',
    resourceContext: {
      documentPath: 'C:/docs/demo.md',
    },
  }

  controller.syncSnapshot(snapshot)
  const actionContext = controller.captureActionContext()
  controller.syncSnapshot({
    sessionId: 'session-1',
    content: '# 正文保持不变',
    resourceContext: {
      documentPath: 'C:/docs/demo.md',
    },
  })

  assert.equal(controller.isActiveContext(actionContext), true)
  assert.equal(invalidatedSnapshots.length, 0)
})

test('keep-alive 停用编辑页时，旧的资源操作上下文必须立即失效，避免隐藏页面继续执行删除动作', () => {
  assert.ok(previewAssetSessionControllerModule, '缺少 preview asset session controller')

  const { createPreviewAssetSessionController } = previewAssetSessionControllerModule
  const invalidationMetaList = []
  const controller = createPreviewAssetSessionController({
    onContextInvalidated(meta) {
      invalidationMetaList.push(meta)
    },
  })

  controller.syncSnapshot({
    sessionId: 'session-1',
    content: '# 正文保持不变',
    resourceContext: {
      documentPath: 'C:/docs/demo.md',
    },
  })
  const actionContext = controller.captureActionContext()

  controller.invalidateActiveContext({
    reason: 'deactivated',
  })

  assert.equal(controller.isActiveContext(actionContext), false)
  assert.deepEqual(invalidationMetaList, [
    {
      reason: 'deactivated',
    },
  ])
})
