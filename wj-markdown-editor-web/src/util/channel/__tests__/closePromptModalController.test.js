import assert from 'node:assert/strict'

const { test } = await import('node:test')

let closePromptModalControllerModule = null

try {
  closePromptModalControllerModule = await import('../closePromptModalController.js')
} catch {
  closePromptModalControllerModule = null
}

test('closePrompt 已打开时，新的 snapshot 必须更新当前 modal，而不是直接忽略', () => {
  assert.ok(closePromptModalControllerModule, '缺少 close prompt modal 控制器')

  const { createClosePromptModalController } = closePromptModalControllerModule
  assert.equal(typeof createClosePromptModalController, 'function')

  const createdConfigs = []
  const updatedConfigs = []
  let destroyCallCount = 0

  const modalInstance = {
    update(nextConfig) {
      updatedConfigs.push(nextConfig)
    },
    destroy() {
      destroyCallCount += 1
    },
  }

  const controller = createClosePromptModalController({
    createModal(config) {
      createdConfigs.push(config)
      return modalInstance
    },
    buildModalConfig(snapshot) {
      return {
        fileName: snapshot.fileName,
        allowForceClose: snapshot.closePrompt.allowForceClose,
      }
    },
  })

  controller.sync({
    fileName: 'draft.md',
    closePrompt: {
      visible: true,
      allowForceClose: false,
    },
  })
  controller.sync({
    fileName: 'saved.md',
    closePrompt: {
      visible: true,
      allowForceClose: true,
    },
  })

  assert.equal(createdConfigs.length, 1)
  assert.equal(updatedConfigs.length, 1)
  assert.deepEqual(createdConfigs[0], {
    fileName: 'draft.md',
    allowForceClose: false,
  })
  assert.deepEqual(updatedConfigs[0], {
    fileName: 'saved.md',
    allowForceClose: true,
  })
  assert.equal(destroyCallCount, 0)
})

test('closePrompt 不再可见时，控制器必须销毁当前 modal 并清空引用', () => {
  assert.ok(closePromptModalControllerModule, '缺少 close prompt modal 控制器')

  const { createClosePromptModalController } = closePromptModalControllerModule
  let destroyCallCount = 0
  const modalInstance = {
    update() {},
    destroy() {
      destroyCallCount += 1
    },
  }

  const controller = createClosePromptModalController({
    createModal() {
      return modalInstance
    },
    buildModalConfig(snapshot) {
      return snapshot
    },
  })

  controller.sync({
    fileName: 'draft.md',
    closePrompt: {
      visible: true,
      allowForceClose: false,
    },
  })
  controller.sync({
    fileName: 'draft.md',
    closePrompt: null,
  })

  assert.equal(destroyCallCount, 1)
  assert.equal(controller.getCurrentModal(), null)
})

test('旧 modal 的 afterClose 迟到触发时，不得把新的 modal 引用清空', () => {
  assert.ok(closePromptModalControllerModule, '缺少 close prompt modal 控制器')

  const { createClosePromptModalController } = closePromptModalControllerModule
  const createdModalList = []

  const controller = createClosePromptModalController({
    createModal(config) {
      const modalInstance = {
        destroy() {},
      }
      createdModalList.push({
        modalInstance,
        afterClose: config.afterClose,
      })
      return modalInstance
    },
    buildModalConfig(snapshot, { afterClose }) {
      return {
        fileName: snapshot.fileName,
        afterClose,
      }
    },
  })

  controller.sync({
    fileName: 'draft.md',
    closePrompt: {
      visible: true,
      allowForceClose: false,
    },
  })
  controller.sync({
    fileName: 'draft.md',
    closePrompt: null,
  })
  controller.sync({
    fileName: 'saved.md',
    closePrompt: {
      visible: true,
      allowForceClose: true,
    },
  })

  createdModalList[0].afterClose()

  assert.equal(createdModalList.length, 2)
  assert.equal(controller.getCurrentModal(), createdModalList[1].modalInstance)
})
