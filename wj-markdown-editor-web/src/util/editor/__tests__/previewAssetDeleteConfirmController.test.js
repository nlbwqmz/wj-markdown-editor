import assert from 'node:assert/strict'

const { test } = await import('node:test')

let previewAssetDeleteConfirmControllerModule = null

try {
  previewAssetDeleteConfirmControllerModule = await import('../previewAssetDeleteConfirmController.js')
} catch {
  previewAssetDeleteConfirmControllerModule = null
}

test('单引用删除确认框在上下文失效时必须可被主动销毁，避免残留 stale UI', () => {
  assert.ok(previewAssetDeleteConfirmControllerModule, '缺少 preview asset delete confirm controller')

  const { createPreviewAssetDeleteConfirmController } = previewAssetDeleteConfirmControllerModule
  assert.equal(typeof createPreviewAssetDeleteConfirmController, 'function')

  let destroyCallCount = 0
  const controller = createPreviewAssetDeleteConfirmController({
    createModal() {
      return {
        destroy() {
          destroyCallCount += 1
        },
      }
    },
  })

  controller.open({
    title: '删除确认',
  })
  controller.destroy()

  assert.equal(destroyCallCount, 1)
  assert.equal(controller.getCurrentModal(), null)
})

test('旧确认框的 afterClose 迟到触发时，不得把新的确认框引用清空', () => {
  assert.ok(previewAssetDeleteConfirmControllerModule, '缺少 preview asset delete confirm controller')

  const { createPreviewAssetDeleteConfirmController } = previewAssetDeleteConfirmControllerModule
  const modalList = []
  const controller = createPreviewAssetDeleteConfirmController({
    createModal(config) {
      const modalInstance = {
        destroy() {},
      }
      modalList.push({
        modalInstance,
        afterClose: config.afterClose,
      })
      return modalInstance
    },
  })

  controller.open({
    title: '第一次删除确认',
  })
  controller.destroy()
  controller.open({
    title: '第二次删除确认',
  })

  modalList[0].afterClose()

  assert.equal(modalList.length, 2)
  assert.equal(controller.getCurrentModal(), modalList[1].modalInstance)
})
