import assert from 'node:assert/strict'

import {
  createDefaultExternalFileChangeState,
  deriveDocumentSessionStoreState,
  normalizeDocumentSessionSnapshot,
} from '../documentSessionSnapshotUtil.js'

const { test } = await import('node:test')

test('recent-missing 快照应只保留当前 store 仍在消费的派生字段，展示路径等细节继续留在 snapshot 真相里', () => {
  const storeState = deriveDocumentSessionStoreState({
    revision: 2,
    sessionId: 'session-1',
    content: '# current',
    fileName: 'Unnamed',
    displayPath: 'C:/docs/missing.md',
    recentMissingPath: 'C:/docs/missing.md',
    windowTitle: 'wj-markdown-editor',
    saved: false,
    dirty: true,
    exists: false,
    isRecentMissing: true,
    closePrompt: {
      visible: true,
      reason: 'unsaved-changes',
      allowForceClose: true,
    },
    externalPrompt: {
      visible: true,
      version: 3,
      fileName: 'Unnamed',
      localContent: '# local',
      externalContent: '# disk',
    },
    resourceContext: {
      documentPath: null,
      saved: false,
      exists: false,
    },
  })

  assert.equal(storeState.fileName, 'Unnamed')
  assert.equal(storeState.saved, false)
  assert.equal('displayPath' in storeState, false)
  assert.equal('recentMissingPath' in storeState, false)
  assert.equal('exists' in storeState, false)
  assert.equal('closePrompt' in storeState, false)
  assert.equal('closePromptVisible' in storeState, false)
  assert.equal('externalPromptVisible' in storeState, false)
  assert.equal(storeState.externalFileChange.visible, true)
  assert.equal(storeState.documentSessionSnapshot.recentMissingPath, 'C:/docs/missing.md')
  assert.equal(storeState.documentSessionSnapshot.displayPath, 'C:/docs/missing.md')
  assert.deepEqual(storeState.documentSessionSnapshot.closePrompt, {
    visible: true,
    reason: 'unsaved-changes',
    allowForceClose: true,
  })
  assert.equal(storeState.documentSessionSnapshot.revision, 2)
})

test('外部修改 prompt 为同一版本时应保留 loading，新版本则必须重置 loading', () => {
  const currentExternalFileChange = {
    ...createDefaultExternalFileChangeState(),
    visible: true,
    loading: true,
    fileName: 'note.md',
    version: 7,
    localContent: '# local',
    externalContent: '# old-disk',
  }

  const sameVersionState = deriveDocumentSessionStoreState({
    sessionId: 'session-2',
    content: '# local',
    fileName: 'note.md',
    displayPath: 'C:/docs/note.md',
    recentMissingPath: null,
    windowTitle: 'note.md',
    saved: false,
    dirty: true,
    exists: true,
    isRecentMissing: false,
    closePrompt: null,
    externalPrompt: {
      visible: true,
      version: 7,
      fileName: 'note.md',
      localContent: '# local',
      externalContent: '# old-disk',
    },
    resourceContext: {
      documentPath: 'C:/docs/note.md',
      saved: false,
      exists: true,
    },
  }, currentExternalFileChange)

  const nextVersionState = deriveDocumentSessionStoreState({
    sessionId: 'session-2',
    content: '# local',
    fileName: 'note.md',
    displayPath: 'C:/docs/note.md',
    recentMissingPath: null,
    windowTitle: 'note.md',
    saved: false,
    dirty: true,
    exists: true,
    isRecentMissing: false,
    closePrompt: null,
    externalPrompt: {
      visible: true,
      version: 8,
      fileName: 'note.md',
      localContent: '# local',
      externalContent: '# new-disk',
    },
    resourceContext: {
      documentPath: 'C:/docs/note.md',
      saved: false,
      exists: true,
    },
  }, currentExternalFileChange)

  assert.equal(sameVersionState.externalFileChange.loading, true)
  assert.equal(nextVersionState.externalFileChange.loading, false)
  assert.equal(nextVersionState.externalFileChange.version, 8)
})

test('normalizeDocumentSessionSnapshot 会把 revision 恢复成有效值', () => {
  assert.equal(normalizeDocumentSessionSnapshot({ revision: 'nope' }).revision, 0)
  assert.equal(normalizeDocumentSessionSnapshot({ revision: 5 }).revision, 5)
})

test('缺省快照也应被归一化为稳定结构，避免 renderer 再自行拼默认值', () => {
  const snapshot = normalizeDocumentSessionSnapshot(null)

  assert.deepEqual(snapshot, {
    sessionId: null,
    content: '',
    fileName: 'Unnamed',
    displayPath: null,
    recentMissingPath: null,
    windowTitle: 'wj-markdown-editor',
    saved: true,
    dirty: false,
    exists: false,
    isRecentMissing: false,
    closePrompt: null,
    externalPrompt: null,
    revision: 0,
    resourceContext: {
      documentPath: null,
      saved: true,
      exists: false,
    },
  })
})
