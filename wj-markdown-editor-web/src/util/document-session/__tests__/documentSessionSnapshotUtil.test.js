import assert from 'node:assert/strict'

import {
  createDefaultExternalFileChangeState,
  deriveDocumentSessionStoreState,
  normalizeDocumentSessionSnapshot,
} from '../documentSessionSnapshotUtil.js'

const { test } = await import('node:test')

test('recent-missing 快照应映射出当前 store 需要的展示路径与提示可见性', () => {
  const storeState = deriveDocumentSessionStoreState({
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
  assert.equal(storeState.displayPath, 'C:/docs/missing.md')
  assert.equal(storeState.closePromptVisible, true)
  assert.equal(storeState.externalPromptVisible, true)
  assert.equal(storeState.documentSessionSnapshot.recentMissingPath, 'C:/docs/missing.md')
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
    resourceContext: {
      documentPath: null,
      saved: true,
      exists: false,
    },
  })
})
