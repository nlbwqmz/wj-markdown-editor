import assert from 'node:assert/strict'

const { test } = await import('node:test')

let rendererSessionSnapshotControllerModule = null

try {
  rendererSessionSnapshotControllerModule = await import('../rendererSessionSnapshotController.js')
} catch {
  rendererSessionSnapshotControllerModule = null
}

test('renderer 公共 snapshot controller 必须统一接上 recent-missing 提示与 bootstrap 归一逻辑', () => {
  assert.ok(rendererSessionSnapshotControllerModule, '缺少 renderer 公共 snapshot controller')

  const { createRendererSessionSnapshotController } = rendererSessionSnapshotControllerModule
  assert.equal(typeof createRendererSessionSnapshotController, 'function')

  const appliedSnapshotList = []
  const promptedPathList = []
  const closePromptSnapshotList = []
  const titleList = []
  const normalizedSnapshotList = []

  const controller = createRendererSessionSnapshotController({
    applySnapshot(snapshot) {
      appliedSnapshotList.push(snapshot)
    },
    promptRecentMissing(path) {
      promptedPathList.push(path)
    },
    syncClosePrompt(snapshot) {
      closePromptSnapshotList.push(snapshot)
    },
    setDocumentTitle(title) {
      titleList.push(title)
    },
    store: {
      applyDocumentSessionSnapshot(snapshot) {
        normalizedSnapshotList.push(snapshot)
        return {
          ...snapshot,
          windowTitle: 'normalized-preview.md',
        }
      },
    },
  })

  const requestContext = controller.beginBootstrapRequest()
  const applied = controller.applyBootstrapSnapshot(requestContext, {
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
    content: '# body',
    windowTitle: 'raw-preview.md',
    closePrompt: {
      visible: true,
      reason: 'unsaved-changes',
      allowForceClose: true,
    },
  })

  assert.equal(applied, true)
  assert.deepEqual(promptedPathList, ['C:/docs/missing.md'])
  assert.deepEqual(titleList, ['normalized-preview.md'])
  assert.deepEqual(normalizedSnapshotList, [{
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
    content: '# body',
    windowTitle: 'raw-preview.md',
    closePrompt: {
      visible: true,
      reason: 'unsaved-changes',
      allowForceClose: true,
    },
  }])
  assert.equal(closePromptSnapshotList.length, 1)
  assert.deepEqual(appliedSnapshotList, [{
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
    content: '# body',
    windowTitle: 'normalized-preview.md',
    closePrompt: {
      visible: true,
      reason: 'unsaved-changes',
      allowForceClose: true,
    },
  }])
})

test('renderer 公共 snapshot controller 如果缺少 recent-missing 提示接线，必须立即失败，避免视图静默漏功能', () => {
  assert.ok(rendererSessionSnapshotControllerModule, '缺少 renderer 公共 snapshot controller')

  const { createRendererSessionSnapshotController } = rendererSessionSnapshotControllerModule

  assert.throws(() => {
    createRendererSessionSnapshotController({
      applySnapshot() {},
      syncClosePrompt() {},
      store: {
        applyDocumentSessionSnapshot(snapshot) {
          return snapshot
        },
      },
    })
  }, /promptRecentMissing/i)
})

test('keep-alive 下两个页面共用同一 recent-missing 提示函数时，必须只弹一次确认，不能各自重复提示', () => {
  assert.ok(rendererSessionSnapshotControllerModule, '缺少 renderer 公共 snapshot controller')

  const { createRendererSessionSnapshotController } = rendererSessionSnapshotControllerModule
  const promptedPathList = []
  const sharedPrompt = (path) => {
    promptedPathList.push(path)
  }

  const createController = () => createRendererSessionSnapshotController({
    applySnapshot() {},
    promptRecentMissing: sharedPrompt,
    syncClosePrompt() {},
    store: {
      applyDocumentSessionSnapshot(snapshot) {
        return snapshot
      },
    },
  })

  const editorController = createController()
  const previewController = createController()
  const recentMissingSnapshot = {
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
    content: '# body',
    windowTitle: 'missing.md',
  }

  editorController.applyPushedSnapshot(recentMissingSnapshot)
  previewController.applyPushedSnapshot(recentMissingSnapshot)

  assert.deepEqual(promptedPathList, ['C:/docs/missing.md'])
})

test('共享 recent-missing 去重在离开 missing 态后，必须允许同一路径未来再次提示', () => {
  assert.ok(rendererSessionSnapshotControllerModule, '缺少 renderer 公共 snapshot controller')

  const { createRendererSessionSnapshotController } = rendererSessionSnapshotControllerModule
  const promptedPathList = []
  const controller = createRendererSessionSnapshotController({
    applySnapshot() {},
    promptRecentMissing(path) {
      promptedPathList.push(path)
    },
    syncClosePrompt() {},
    store: {
      applyDocumentSessionSnapshot(snapshot) {
        return snapshot
      },
    },
  })

  controller.applyPushedSnapshot({
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
    content: '# missing',
  })
  controller.applyPushedSnapshot({
    isRecentMissing: false,
    recentMissingPath: null,
    content: '# normal',
  })
  controller.applyPushedSnapshot({
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
    content: '# missing again',
  })

  assert.deepEqual(promptedPathList, [
    'C:/docs/missing.md',
    'C:/docs/missing.md',
  ])
})

test('首次 keep-alive 激活前，controller 必须能识别“尚未应用过任何 snapshot”，避免页面重放 store 默认空快照', () => {
  assert.ok(rendererSessionSnapshotControllerModule, '缺少 renderer 公共 snapshot controller')

  const { createRendererSessionSnapshotController } = rendererSessionSnapshotControllerModule
  const controller = createRendererSessionSnapshotController({
    applySnapshot() {},
    promptRecentMissing() {},
    syncClosePrompt() {},
    setDocumentTitle() {},
    store: {
      applyDocumentSessionSnapshot(snapshot) {
        return snapshot
      },
    },
  })

  assert.equal(typeof controller.hasAppliedSnapshot, 'function')
  assert.equal(controller.hasAppliedSnapshot(), false)

  controller.deactivate()
  controller.activate()

  assert.equal(controller.hasAppliedSnapshot(), false)

  const requestContext = controller.beginBootstrapRequest()
  controller.applyBootstrapSnapshot(requestContext, {
    content: '# body',
    windowTitle: 'demo.md',
  })

  assert.equal(controller.hasAppliedSnapshot(), true)
})

test('首轮 bootstrap 因页面失活而失效后，重新激活必须要求视图重新补拉一次 bootstrap', () => {
  assert.ok(rendererSessionSnapshotControllerModule, '缺少 renderer 公共 snapshot controller')

  const { createRendererSessionSnapshotController } = rendererSessionSnapshotControllerModule
  const controller = createRendererSessionSnapshotController({
    applySnapshot() {},
    promptRecentMissing() {},
    syncClosePrompt() {},
    setDocumentTitle() {},
    store: {
      applyDocumentSessionSnapshot(snapshot) {
        return snapshot
      },
    },
  })

  const firstRequestContext = controller.beginBootstrapRequest()

  assert.equal(typeof controller.needsBootstrapOnActivate, 'function')
  assert.equal(controller.needsBootstrapOnActivate(), false)

  controller.deactivate()
  controller.activate()

  assert.equal(controller.hasAppliedSnapshot(), false)
  assert.equal(controller.needsBootstrapOnActivate(), true)
  assert.equal(controller.applyBootstrapSnapshot(firstRequestContext, {
    content: '# stale',
    windowTitle: 'stale.md',
  }), false)

  const secondRequestContext = controller.beginBootstrapRequest()
  assert.equal(controller.needsBootstrapOnActivate(), false)
  assert.equal(controller.applyBootstrapSnapshot(secondRequestContext, {
    content: '# fresh',
    windowTitle: 'fresh.md',
  }), true)
  assert.equal(controller.hasAppliedSnapshot(), true)
  assert.equal(controller.needsBootstrapOnActivate(), false)
})
