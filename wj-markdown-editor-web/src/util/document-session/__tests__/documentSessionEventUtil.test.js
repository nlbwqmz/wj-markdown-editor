import assert from 'node:assert/strict'

import * as documentSessionEventUtil from '../documentSessionEventUtil.js'

const {
  createDocumentSessionBootstrapGuard,
  createDocumentSessionEventHandlers,
  DOCUMENT_EXTERNAL_APPLY_COMMAND,
  DOCUMENT_EXTERNAL_IGNORE_COMMAND,
  DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT,
} = documentSessionEventUtil

const { test } = await import('node:test')

function createStoreMock() {
  const calls = {
    applyDocumentSessionSnapshot: [],
    replaceRecentList: [],
  }

  return {
    calls,
    store: {
      applyDocumentSessionSnapshot(snapshot) {
        calls.applyDocumentSessionSnapshot.push(snapshot)
        return {
          ...snapshot,
          windowTitle: snapshot.windowTitle || 'wj-markdown-editor',
          closePrompt: snapshot.closePrompt || null,
        }
      },
      replaceRecentList(recentList) {
        calls.replaceRecentList.push(recentList)
        return recentList
      },
    },
  }
}

test('document session 事件适配器只应订阅快照与 effect 事件', () => {
  const { store, calls } = createStoreMock()
  const publishedEvents = []
  const messageEffects = []
  const closePromptSnapshots = []
  const titleUpdates = []
  const handlers = createDocumentSessionEventHandlers({
    store,
    publishSnapshotChanged: snapshot => publishedEvents.push(snapshot),
    showMessage: effect => messageEffects.push(effect),
    setDocumentTitle: title => titleUpdates.push(title),
    syncClosePrompt: snapshot => closePromptSnapshots.push(snapshot),
  })

  assert.deepEqual(Object.keys(handlers).sort(), [
    'document.snapshot.changed',
    'window.effect.message',
    'window.effect.recent-list-changed',
  ])

  handlers['document.snapshot.changed']({
    sessionId: 'session-1',
    content: '# body',
    fileName: 'note.md',
    displayPath: 'C:/docs/note.md',
    recentMissingPath: null,
    windowTitle: 'note.md',
    saved: false,
    dirty: true,
    exists: true,
    isRecentMissing: false,
    closePrompt: {
      visible: true,
      reason: 'unsaved-changes',
      allowForceClose: true,
    },
    externalPrompt: null,
    resourceContext: {
      documentPath: 'C:/docs/note.md',
      saved: false,
      exists: true,
    },
  })

  handlers['window.effect.message']({
    type: 'success',
    content: 'message.saved',
  })

  handlers['window.effect.recent-list-changed']([
    { path: 'C:/docs/a.md', name: 'a.md' },
  ])

  assert.equal(calls.applyDocumentSessionSnapshot.length, 1)
  assert.equal(calls.replaceRecentList.length, 1)
  assert.equal(publishedEvents.length, 1)
  assert.equal(messageEffects.length, 1)
  assert.equal(titleUpdates[0], 'note.md')
  assert.equal(closePromptSnapshots.length, 1)
})

test('内部快照广播事件名与外部修改命令名必须固定为新契约', () => {
  assert.equal(DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT, 'document-session-snapshot-changed')
  assert.equal(DOCUMENT_EXTERNAL_APPLY_COMMAND, 'document.external.apply')
  assert.equal(DOCUMENT_EXTERNAL_IGNORE_COMMAND, 'document.external.ignore')
})

test('更晚到达的 snapshot 推送出现后，首屏拉取返回的旧结果不应再覆盖当前状态', () => {
  const guard = createDocumentSessionBootstrapGuard()
  const firstRequest = guard.beginRequest()

  guard.markSnapshotApplied()

  assert.equal(guard.shouldApplyRequestResult(firstRequest), false)

  const secondRequest = guard.beginRequest()
  assert.equal(guard.shouldApplyRequestResult(secondRequest), true)
})

test('renderer session 事件适配层不应继续导出只服务 legacy message 双发的 deduper', () => {
  assert.equal('createWindowEffectMessageDeduper' in documentSessionEventUtil, false)
})
