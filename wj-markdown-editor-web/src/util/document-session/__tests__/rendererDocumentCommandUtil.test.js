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
    requestDocumentEdit,
    requestDocumentOpenDialog,
    requestDocumentResolveOpenTarget,
    requestPrepareOpenPathInCurrentWindow,
    requestDocumentOpenPath,
    requestDocumentOpenPathInCurrentWindow,
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
  await requestDocumentEdit('# 新内容')
  await requestDocumentOpenDialog()
  await requestDocumentResolveOpenTarget('C:/docs/note.md', {
    entrySource: 'recent',
    trigger: 'user',
  })
  await requestPrepareOpenPathInCurrentWindow('C:/docs/note.md', {
    entrySource: 'recent',
    sourceSessionId: 'session-1',
    sourceRevision: 5,
    trigger: 'user',
  })
  await requestDocumentOpenPath('C:/docs/note.md', {
    entrySource: 'recent',
    trigger: 'user',
  })
  await requestDocumentOpenPathInCurrentWindow('C:/docs/note.md', {
    entrySource: 'recent',
    switchPolicy: 'discard-switch',
    expectedSessionId: 'session-1',
    expectedRevision: 5,
    trigger: 'user',
  })
  await requestRecentClear()
  await requestRecentRemove('C:/docs/note.md')
  await requestDocumentSessionSnapshot()

  assert.deepEqual(sentPayloadList, [
    { event: 'document.save' },
    { event: 'document.save-copy' },
    {
      event: 'document.edit',
      data: {
        content: '# 新内容',
      },
    },
    { event: 'document.request-open-dialog' },
    {
      event: 'document.resolve-open-target',
      data: {
        entrySource: 'recent',
        path: 'C:/docs/note.md',
        trigger: 'user',
      },
    },
    {
      event: 'document.prepare-open-path-in-current-window',
      data: {
        entrySource: 'recent',
        path: 'C:/docs/note.md',
        sourceSessionId: 'session-1',
        sourceRevision: 5,
        trigger: 'user',
      },
    },
    {
      event: 'document.open-path',
      data: {
        entrySource: 'recent',
        path: 'C:/docs/note.md',
        trigger: 'user',
      },
    },
    {
      event: 'document.open-path-in-current-window',
      data: {
        entrySource: 'recent',
        path: 'C:/docs/note.md',
        switchPolicy: 'discard-switch',
        expectedSessionId: 'session-1',
        expectedRevision: 5,
        trigger: 'user',
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

test('打开相关 renderer wrapper 必须使用白名单 payload，不能让冲突字段覆盖关键参数', async () => {
  assert.ok(rendererDocumentCommandUtilModule, '缺少 renderer 文档命令工具')

  const {
    requestDocumentResolveOpenTarget,
    requestPrepareOpenPathInCurrentWindow,
    requestDocumentOpenPath,
    requestDocumentOpenPathInCurrentWindow,
  } = rendererDocumentCommandUtilModule
  const sentPayloadList = []

  installWindowNodeMock(async (payload) => {
    sentPayloadList.push(payload)
    return payload
  })

  await requestDocumentResolveOpenTarget('C:/docs/actual.md', {
    path: 'C:/docs/forbidden.md',
    entrySource: 'recent',
    trigger: 'user',
    unexpected: 'ignored',
  })
  await requestPrepareOpenPathInCurrentWindow('C:/docs/actual.md', {
    path: 'C:/docs/forbidden.md',
    entrySource: 'file-manager',
    trigger: 'user',
    sourceSessionId: 'session-current',
    sourceRevision: 12,
    unexpected: 'ignored',
  })
  await requestDocumentOpenPath('C:/docs/actual.md', {
    path: 'C:/docs/forbidden.md',
    entrySource: 'menu-open',
    trigger: 'user',
    unexpected: 'ignored',
  })
  await requestDocumentOpenPathInCurrentWindow('C:/docs/actual.md', {
    path: 'C:/docs/forbidden.md',
    entrySource: 'shortcut-open-file',
    trigger: 'user',
    switchPolicy: 'discard-switch',
    expectedSessionId: 'session-current',
    expectedRevision: 12,
    unexpected: 'ignored',
  })

  assert.deepEqual(sentPayloadList, [
    {
      event: 'document.resolve-open-target',
      data: {
        path: 'C:/docs/actual.md',
        entrySource: 'recent',
        trigger: 'user',
      },
    },
    {
      event: 'document.prepare-open-path-in-current-window',
      data: {
        path: 'C:/docs/actual.md',
        entrySource: 'file-manager',
        trigger: 'user',
        sourceSessionId: 'session-current',
        sourceRevision: 12,
      },
    },
    {
      event: 'document.open-path',
      data: {
        path: 'C:/docs/actual.md',
        entrySource: 'menu-open',
        trigger: 'user',
      },
    },
    {
      event: 'document.open-path-in-current-window',
      data: {
        path: 'C:/docs/actual.md',
        entrySource: 'shortcut-open-file',
        trigger: 'user',
        switchPolicy: 'discard-switch',
        expectedSessionId: 'session-current',
        expectedRevision: 12,
      },
    },
  ])
})
