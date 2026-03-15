import assert from 'node:assert/strict'

const { test } = await import('node:test')

let rendererDocumentCommandUtilModule = null

try {
  rendererDocumentCommandUtilModule = await import('../rendererDocumentCommandUtil.js')
} catch {
  rendererDocumentCommandUtilModule = null
}

function installWindowNodeMock(impl = async () => null) {
  globalThis.window = {
    node: {
      sendToMain: impl,
    },
  }
}

test('renderer 文档命令工具必须把保存、打开、recent 与 snapshot 拉取统一映射到新协议', async () => {
  assert.ok(rendererDocumentCommandUtilModule, '缺少 renderer 文档命令工具')

  const {
    requestDocumentOpenDialog,
    requestDocumentOpenPath,
    requestDocumentSave,
    requestDocumentSaveCopy,
    requestDocumentSessionSnapshot,
    requestRecentClear,
    requestRecentRemove,
  } = rendererDocumentCommandUtilModule
  const sentPayloadList = []

  installWindowNodeMock(async (payload) => {
    sentPayloadList.push(payload)
    return payload
  })

  await requestDocumentSave()
  await requestDocumentSaveCopy()
  await requestDocumentOpenDialog()
  await requestDocumentOpenPath('C:/docs/note.md')
  await requestRecentClear()
  await requestRecentRemove('C:/docs/note.md')
  await requestDocumentSessionSnapshot()

  assert.deepEqual(sentPayloadList, [
    { event: 'document.save' },
    { event: 'document.save-copy' },
    { event: 'document.request-open-dialog' },
    {
      event: 'document.open-path',
      data: {
        path: 'C:/docs/note.md',
      },
    },
    { event: 'recent.clear' },
    {
      event: 'recent.remove',
      data: {
        path: 'C:/docs/note.md',
      },
    },
    { event: 'document.get-session-snapshot' },
  ])
})

test('recent 缺失路径判定必须兼容结构化新结果，避免继续依赖旧 false 布尔值', () => {
  assert.ok(rendererDocumentCommandUtilModule, '缺少 renderer 文档命令工具')

  const { isDocumentOpenMissingResult } = rendererDocumentCommandUtilModule

  assert.equal(isDocumentOpenMissingResult(false), true)
  assert.equal(isDocumentOpenMissingResult({
    ok: false,
    reason: 'open-target-missing',
  }), true)
  assert.equal(isDocumentOpenMissingResult({
    ok: false,
    reason: 'recent-missing',
  }), true)
  assert.equal(isDocumentOpenMissingResult({
    ok: false,
    reason: 'open-target-invalid-extension',
  }), false)
  assert.equal(isDocumentOpenMissingResult({
    ok: true,
    reason: 'opened',
  }), false)
})
