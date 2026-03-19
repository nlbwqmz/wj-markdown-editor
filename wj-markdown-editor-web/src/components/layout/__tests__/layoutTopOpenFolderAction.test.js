import assert from 'node:assert/strict'

const { test } = await import('node:test')

let layoutTopOpenFolderActionModule = null

try {
  layoutTopOpenFolderActionModule = await import('../layoutTopOpenFolderAction.js')
} catch {
  layoutTopOpenFolderActionModule = null
}

test('顶部栏打开所在目录动作必须发送 document.open-in-folder 命令', async () => {
  assert.ok(layoutTopOpenFolderActionModule, '缺少顶部栏打开所在目录动作控制器')

  const { createLayoutTopOpenFolderAction } = layoutTopOpenFolderActionModule
  assert.equal(typeof createLayoutTopOpenFolderAction, 'function')

  const sendCommandCalls = []
  const openFolder = createLayoutTopOpenFolderAction({
    sendCommand: async (payload) => {
      sendCommandCalls.push(payload)
      return {
        ok: true,
        opened: true,
        reason: 'opened',
      }
    },
    notifyDocumentNotSaved: () => {
      throw new Error('已保存场景不应提示未保存警告')
    },
  })

  const result = await openFolder()

  assert.deepEqual(sendCommandCalls, [{ event: 'document.open-in-folder' }])
  assert.deepEqual(result, {
    ok: true,
    opened: true,
    reason: 'opened',
  })
})

test('当前文档未保存时，顶部栏打开所在目录动作必须提示 warning', async () => {
  assert.ok(layoutTopOpenFolderActionModule, '缺少顶部栏打开所在目录动作控制器')

  const { createLayoutTopOpenFolderAction } = layoutTopOpenFolderActionModule
  let warningCount = 0
  const openFolder = createLayoutTopOpenFolderAction({
    sendCommand: async () => ({
      ok: false,
      opened: false,
      reason: 'document-not-saved',
      path: null,
    }),
    notifyDocumentNotSaved: () => {
      warningCount += 1
    },
  })

  const result = await openFolder()

  assert.equal(warningCount, 1)
  assert.deepEqual(result, {
    ok: false,
    opened: false,
    reason: 'document-not-saved',
    path: null,
  })
})

test('非未保存失败原因不应误提示顶部栏 warning', async () => {
  assert.ok(layoutTopOpenFolderActionModule, '缺少顶部栏打开所在目录动作控制器')

  const { createLayoutTopOpenFolderAction } = layoutTopOpenFolderActionModule
  let warningCount = 0
  const openFolder = createLayoutTopOpenFolderAction({
    sendCommand: async () => ({
      ok: false,
      opened: false,
      reason: 'open-failed',
      path: 'D:/docs/note.md',
    }),
    notifyDocumentNotSaved: () => {
      warningCount += 1
    },
  })

  const result = await openFolder()

  assert.equal(warningCount, 0)
  assert.deepEqual(result, {
    ok: false,
    opened: false,
    reason: 'open-failed',
    path: 'D:/docs/note.md',
  })
})
