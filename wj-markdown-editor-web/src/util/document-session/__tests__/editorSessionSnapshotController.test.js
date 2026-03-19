import assert from 'node:assert/strict'

const { test } = await import('node:test')

let editorSessionSnapshotControllerModule = null

try {
  editorSessionSnapshotControllerModule = await import('../editorSessionSnapshotController.js')
} catch {
  editorSessionSnapshotControllerModule = null
}

test('push 先到后，bootstrap 旧结果即使被 guard 丢弃，也不能把 recent-missing 提示吞掉', () => {
  assert.ok(editorSessionSnapshotControllerModule, '缺少编辑页 snapshot 协调器')

  const { createEditorSessionSnapshotController } = editorSessionSnapshotControllerModule
  assert.equal(typeof createEditorSessionSnapshotController, 'function')

  const appliedSnapshots = []
  const promptedPathList = []
  const controller = createEditorSessionSnapshotController({
    applySnapshot(snapshot) {
      appliedSnapshots.push(snapshot)
    },
    promptRecentMissing(path) {
      promptedPathList.push(path)
    },
  })

  const requestContext = controller.beginBootstrapRequest()
  controller.applyPushedSnapshot({
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
    content: '# body',
  })
  const applied = controller.applyBootstrapSnapshot(requestContext, {
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
    content: '# body',
  })

  assert.equal(applied, false)
  assert.equal(appliedSnapshots.length, 1)
  assert.deepEqual(promptedPathList, ['C:/docs/missing.md'])
})

test('bootstrap 先应用后，再收到同一路径 push 时，recent-missing 提示也只能出现一次', () => {
  assert.ok(editorSessionSnapshotControllerModule, '缺少编辑页 snapshot 协调器')

  const { createEditorSessionSnapshotController } = editorSessionSnapshotControllerModule
  const appliedSnapshots = []
  const promptedPathList = []
  const controller = createEditorSessionSnapshotController({
    applySnapshot(snapshot) {
      appliedSnapshots.push(snapshot)
    },
    promptRecentMissing(path) {
      promptedPathList.push(path)
    },
  })

  const requestContext = controller.beginBootstrapRequest()
  const applied = controller.applyBootstrapSnapshot(requestContext, {
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
    content: '# body',
  })
  controller.applyPushedSnapshot({
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
    content: '# body',
  })

  assert.equal(applied, true)
  assert.equal(appliedSnapshots.length, 2)
  assert.deepEqual(promptedPathList, ['C:/docs/missing.md'])
})

test('bootstrap 快照只有在 guard 通过时，才能更新标题并应用归一化结果', () => {
  assert.ok(editorSessionSnapshotControllerModule, '缺少编辑页 snapshot 协调器')

  const { createEditorSessionSnapshotController } = editorSessionSnapshotControllerModule
  const callOrder = []
  const controller = createEditorSessionSnapshotController({
    applySnapshot(snapshot) {
      callOrder.push({
        type: 'apply',
        snapshot,
      })
    },
    promptRecentMissing() {},
    normalizeBootstrapSnapshot(snapshot) {
      callOrder.push({
        type: 'normalize',
        snapshot,
      })
      return {
        ...snapshot,
        windowTitle: 'normalized.md',
      }
    },
    syncClosePrompt(snapshot) {
      callOrder.push({
        type: 'close-prompt',
        snapshot,
      })
    },
    setDocumentTitle(title) {
      callOrder.push({
        type: 'title',
        title,
      })
    },
  })

  const requestContext = controller.beginBootstrapRequest()
  controller.applyBootstrapSnapshot(requestContext, {
    isRecentMissing: false,
    recentMissingPath: null,
    content: '# body',
    windowTitle: 'raw.md',
  })

  assert.deepEqual(callOrder, [
    {
      type: 'normalize',
      snapshot: {
        isRecentMissing: false,
        recentMissingPath: null,
        content: '# body',
        windowTitle: 'raw.md',
      },
    },
    {
      type: 'title',
      title: 'normalized.md',
    },
    {
      type: 'close-prompt',
      snapshot: {
        isRecentMissing: false,
        recentMissingPath: null,
        content: '# body',
        windowTitle: 'normalized.md',
      },
    },
    {
      type: 'apply',
      snapshot: {
        isRecentMissing: false,
        recentMissingPath: null,
        content: '# body',
        windowTitle: 'normalized.md',
      },
    },
  ])
})

test('过期 bootstrap 不得提前更新标题，也不得执行归一化', () => {
  assert.ok(editorSessionSnapshotControllerModule, '缺少编辑页 snapshot 协调器')

  const { createEditorSessionSnapshotController } = editorSessionSnapshotControllerModule
  const callOrder = []
  const controller = createEditorSessionSnapshotController({
    applySnapshot(snapshot) {
      callOrder.push({
        type: 'apply',
        snapshot,
      })
    },
    promptRecentMissing() {},
    normalizeBootstrapSnapshot(snapshot) {
      callOrder.push({
        type: 'normalize',
        snapshot,
      })
      return snapshot
    },
    syncClosePrompt(snapshot) {
      callOrder.push({
        type: 'close-prompt',
        snapshot,
      })
    },
    setDocumentTitle(title) {
      callOrder.push({
        type: 'title',
        title,
      })
    },
  })

  const requestContext = controller.beginBootstrapRequest()
  controller.applyPushedSnapshot({
    isRecentMissing: false,
    recentMissingPath: null,
    content: '# pushed',
    windowTitle: 'pushed.md',
  })
  callOrder.length = 0

  const applied = controller.applyBootstrapSnapshot(requestContext, {
    isRecentMissing: false,
    recentMissingPath: null,
    content: '# stale',
    windowTitle: 'stale.md',
  })

  assert.equal(applied, false)
  assert.deepEqual(callOrder, [])
})

test('push snapshot 也必须同步 closePrompt，避免 bootstrap 与 push 的关闭确认态分叉', () => {
  assert.ok(editorSessionSnapshotControllerModule, '缺少编辑页 snapshot 协调器')

  const { createEditorSessionSnapshotController } = editorSessionSnapshotControllerModule
  const callOrder = []
  const controller = createEditorSessionSnapshotController({
    applySnapshot(snapshot) {
      callOrder.push({
        type: 'apply',
        snapshot,
      })
    },
    promptRecentMissing() {},
    syncClosePrompt(snapshot) {
      callOrder.push({
        type: 'close-prompt',
        snapshot,
      })
    },
  })

  controller.applyPushedSnapshot({
    content: '# pushed',
    windowTitle: 'pushed.md',
    closePrompt: {
      visible: true,
      reason: 'unsaved-changes',
      allowForceClose: true,
    },
  })

  assert.deepEqual(callOrder, [
    {
      type: 'close-prompt',
      snapshot: {
        content: '# pushed',
        windowTitle: 'pushed.md',
        closePrompt: {
          visible: true,
          reason: 'unsaved-changes',
          allowForceClose: true,
        },
      },
    },
    {
      type: 'apply',
      snapshot: {
        content: '# pushed',
        windowTitle: 'pushed.md',
        closePrompt: {
          visible: true,
          reason: 'unsaved-changes',
          allowForceClose: true,
        },
      },
    },
  ])
})

test('controller 失活后，迟到 bootstrap 不得再更新标题、关闭提示或正文；重新激活后才允许继续消费 push', () => {
  assert.ok(editorSessionSnapshotControllerModule, '缺少编辑页 snapshot 协调器')

  const { createEditorSessionSnapshotController } = editorSessionSnapshotControllerModule
  const callOrder = []
  const controller = createEditorSessionSnapshotController({
    applySnapshot(snapshot) {
      callOrder.push({
        type: 'apply',
        snapshot,
      })
    },
    promptRecentMissing(path) {
      callOrder.push({
        type: 'prompt',
        path,
      })
    },
    syncClosePrompt(snapshot) {
      callOrder.push({
        type: 'close-prompt',
        snapshot,
      })
    },
    setDocumentTitle(title) {
      callOrder.push({
        type: 'title',
        title,
      })
    },
  })

  const requestContext = controller.beginBootstrapRequest()
  controller.deactivate()

  const bootstrapApplied = controller.applyBootstrapSnapshot(requestContext, {
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
    content: '# stale bootstrap',
    windowTitle: 'stale.md',
    closePrompt: {
      visible: true,
      reason: 'unsaved-changes',
      allowForceClose: true,
    },
  })

  assert.equal(bootstrapApplied, false)
  assert.deepEqual(callOrder, [])

  const pushedWhileInactive = controller.applyPushedSnapshot({
    content: '# pushed while inactive',
    windowTitle: 'inactive.md',
  })
  assert.equal(pushedWhileInactive, false)
  assert.deepEqual(callOrder, [])

  controller.activate()
  const pushedAfterReactivated = controller.applyPushedSnapshot({
    content: '# pushed after active',
    windowTitle: 'active.md',
  })

  assert.equal(pushedAfterReactivated, true)
  assert.deepEqual(callOrder, [
    {
      type: 'close-prompt',
      snapshot: {
        content: '# pushed after active',
        windowTitle: 'active.md',
      },
    },
    {
      type: 'apply',
      snapshot: {
        content: '# pushed after active',
        windowTitle: 'active.md',
      },
    },
  ])
})

test('controller dispose 后，任何迟到 bootstrap / push 都必须失效，避免页面卸载后继续执行副作用', () => {
  assert.ok(editorSessionSnapshotControllerModule, '缺少编辑页 snapshot 协调器')

  const { createEditorSessionSnapshotController } = editorSessionSnapshotControllerModule
  const callOrder = []
  const controller = createEditorSessionSnapshotController({
    applySnapshot(snapshot) {
      callOrder.push({
        type: 'apply',
        snapshot,
      })
    },
    promptRecentMissing(path) {
      callOrder.push({
        type: 'prompt',
        path,
      })
    },
    syncClosePrompt(snapshot) {
      callOrder.push({
        type: 'close-prompt',
        snapshot,
      })
    },
    setDocumentTitle(title) {
      callOrder.push({
        type: 'title',
        title,
      })
    },
  })

  const requestContext = controller.beginBootstrapRequest()
  controller.dispose()

  assert.equal(controller.applyBootstrapSnapshot(requestContext, {
    content: '# disposed bootstrap',
    windowTitle: 'disposed.md',
  }), false)
  assert.equal(controller.applyPushedSnapshot({
    content: '# disposed push',
    windowTitle: 'disposed-push.md',
  }), false)
  assert.deepEqual(callOrder, [])
})
