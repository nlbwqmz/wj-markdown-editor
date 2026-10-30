import assert from 'node:assert/strict'

import {
  createDefaultExternalFileChangeState,
  deriveDocumentSessionStoreState,
  getDocumentSessionSnapshotIdentity,
  normalizeDocumentSessionSnapshot,
} from '../documentSessionSnapshotUtil.js'

const { test } = await import('node:test')

test('recent-missing 快照应只保留当前 store 仍在消费的派生字段，展示路径等细节继续留在 snapshot 真相里', () => {
  const storeState = deriveDocumentSessionStoreState({
    revision: 2,
    sessionId: 'session-1',
    content: '# current',
    fileName: 'Untitled',
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
      fileName: 'Untitled',
      localContent: '# local',
      externalContent: '# disk',
    },
    resourceContext: {
      documentPath: null,
      saved: false,
      exists: false,
    },
  })

  assert.equal(storeState.fileName, 'Untitled')
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
    scope: 'window',
    unsavedTabCount: 0,
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
  assert.equal(normalizeDocumentSessionSnapshot({ revision: -1 }).revision, 0)
  assert.equal(normalizeDocumentSessionSnapshot({ revision: 5 }).revision, 5)
})

test('缺省快照也应被归一化为稳定结构，避免 renderer 再自行拼默认值', () => {
  const snapshot = normalizeDocumentSessionSnapshot(null)

  assert.deepEqual(snapshot, {
    sessionId: null,
    kind: 'markdown',
    content: '',
    fileName: 'Untitled',
    displayPath: null,
    recentMissingPath: null,
    windowTitle: 'wj-markdown-editor',
    saved: true,
    dirty: false,
    exists: false,
    isRecentMissing: false,
    tabs: [],
    activeSessionId: null,
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

test('getDocumentSessionSnapshotIdentity 会统一提取 sessionId 与 revision，非法 revision 回退为 0', () => {
  assert.deepEqual(getDocumentSessionSnapshotIdentity({
    sessionId: 'session-8',
    revision: 12,
  }), {
    sessionId: 'session-8',
    revision: 12,
  })

  assert.deepEqual(getDocumentSessionSnapshotIdentity({
    sessionId: null,
    revision: 'nope',
  }), {
    sessionId: null,
    revision: 0,
  })

  assert.deepEqual(getDocumentSessionSnapshotIdentity(undefined), {
    sessionId: null,
    revision: 0,
  })
})

test('归一化的标签项必须保留 exists，供标签栏判断文件是否已被外部删除', () => {
  const snapshot = normalizeDocumentSessionSnapshot({
    sessionId: 'session-tab-exists',
    tabs: [
      { sessionId: 'tab-missing', fileName: 'gone.md', displayPath: 'D:/docs/gone.md', dirty: true, exists: false },
      { sessionId: 'tab-normal', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false, exists: true },
    ],
  })

  assert.deepEqual(snapshot.tabs.map(tab => tab.exists), [false, true])
  assert.equal(snapshot.tabs[0].displayPath, 'D:/docs/gone.md')
  assert.equal(snapshot.tabs[1].displayPath, 'D:/docs/a.md')
})

test('标签项缺失 exists 字段时不得解释成“文件已被删除”，避免老主进程让所有标签都加上删除线', () => {
  const snapshot = normalizeDocumentSessionSnapshot({
    sessionId: 'session-tab-legacy',
    tabs: [
      { sessionId: 'tab-legacy', fileName: 'a.md', displayPath: 'D:/docs/a.md', dirty: false },
    ],
  })

  assert.equal(snapshot.tabs[0].exists, true)
})
