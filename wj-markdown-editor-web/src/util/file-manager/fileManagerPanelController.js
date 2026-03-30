import { Input, message, Modal } from 'ant-design-vue'
import { computed, createVNode, onScopeDispose, ref, watch } from 'vue'
import eventEmit from '@/util/channel/eventEmit.js'
import { FILE_MANAGER_DIRECTORY_CHANGED_EVENT } from './fileManagerEventUtil.js'
import {
  createFileManagerOpenDecisionController,
  resolveDocumentOpenCurrentPath,
} from './fileManagerOpenDecisionController.js'
import {
  requestFileManagerCreateFolder,
  requestFileManagerCreateMarkdown,
  requestFileManagerDirectoryState,
  requestFileManagerOpenDirectory,
  requestFileManagerPickDirectory,
} from './fileManagerPanelCommandUtil.js'

const DRAFT_EMPTY_MESSAGE_KEY = 'message.fileManagerSelectDirectory'
const DIRECTORY_EMPTY_MESSAGE_KEY = 'message.fileManagerDirectoryEmpty'
const INVALID_ENTRY_NAME_MESSAGE_KEY = 'message.fileManagerInvalidEntryName'

function isWindowsDriveRootPath(path) {
  return /^[A-Za-z]:\/$/u.test(path)
}

function isWindowsCaseInsensitivePath(path) {
  return /^[A-Za-z]:\//u.test(path) || path.startsWith('//')
}

function getUncShareRoot(path) {
  return path.match(/^(\/\/[^/]+\/[^/]+)\/*$/u)?.[1] || null
}

function normalizePath(path) {
  if (typeof path !== 'string') {
    return null
  }

  const normalizedPath = path.trim().replace(/\\/g, '/')
  if (!normalizedPath) {
    return null
  }
  if (normalizedPath === '/') {
    return '/'
  }
  if (/^[A-Za-z]:\/?$/u.test(normalizedPath)) {
    return `${normalizedPath.slice(0, 2)}/`
  }

  const uncShareRoot = getUncShareRoot(normalizedPath)
  if (uncShareRoot) {
    return uncShareRoot
  }

  const trimmedPath = normalizedPath.replace(/\/+$/u, '')
  return trimmedPath || null
}

function normalizeComparablePath(path) {
  const normalizedPath = normalizePath(path)
  if (!normalizedPath) {
    return null
  }

  return isWindowsCaseInsensitivePath(normalizedPath)
    ? normalizedPath.toLowerCase()
    : normalizedPath
}

function getPathDirname(path) {
  const normalizedPath = normalizePath(path)

  if (!normalizedPath) {
    return null
  }
  if (normalizedPath === '/' || isWindowsDriveRootPath(normalizedPath) || getUncShareRoot(normalizedPath) === normalizedPath) {
    return normalizedPath
  }

  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  if (lastSlashIndex < 0) {
    return null
  }
  if (lastSlashIndex === 0) {
    return '/'
  }
  if (/^[A-Za-z]:\//u.test(normalizedPath) && lastSlashIndex === 2) {
    return `${normalizedPath.slice(0, 2)}/`
  }

  return normalizedPath.slice(0, lastSlashIndex)
}

function getPathBasename(path) {
  const normalizedPath = normalizePath(path)

  if (!normalizedPath) {
    return ''
  }

  const segmentList = normalizedPath.split('/')
  return segmentList[segmentList.length - 1] || normalizedPath
}

function isMarkdownPath(path) {
  return /\.(?:md|markdown)$/iu.test(path || '')
}

function normalizeFileManagerEntryName(name) {
  return typeof name === 'string' ? name.trim() : ''
}

function isInvalidFileManagerEntryName(name) {
  const normalizedName = normalizeFileManagerEntryName(name)

  return !normalizedName
    || normalizedName === '.'
    || normalizedName === '..'
    || /[\\/]/u.test(normalizedName)
}

function createInvalidFileManagerEntryNameResult() {
  return {
    ok: false,
    reason: 'invalid-file-manager-entry-name',
  }
}

function resolveDirectoryTargetFromSnapshot(snapshot) {
  if (snapshot?.isRecentMissing === true && snapshot?.recentMissingPath) {
    return {
      directoryPath: getPathDirname(snapshot.recentMissingPath),
      emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
      missingDirectoryEmptyMessageKey: null,
    }
  }

  const currentDocumentPath = resolveDocumentOpenCurrentPath(snapshot)
  if (!currentDocumentPath) {
    return {
      directoryPath: null,
      emptyMessageKey: DRAFT_EMPTY_MESSAGE_KEY,
    }
  }

  return {
    directoryPath: getPathDirname(currentDocumentPath),
    emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
  }
}

function resolveEntryKind(entry) {
  if (entry?.kind === 'directory' || entry?.type === 'directory' || entry?.isDirectory === true) {
    return 'directory'
  }

  if (entry?.kind === 'markdown' || entry?.type === 'markdown' || isMarkdownPath(entry?.path) || isMarkdownPath(entry?.name)) {
    return 'markdown'
  }

  return 'other'
}

function createEmptyDirectoryState(emptyMessageKey) {
  return {
    directoryPath: null,
    entryList: [],
    emptyMessageKey: emptyMessageKey === undefined ? DRAFT_EMPTY_MESSAGE_KEY : emptyMessageKey,
  }
}

function sortDirectoryEntryList(entryList) {
  const kindPriorityMap = {
    directory: 0,
    markdown: 1,
    other: 2,
  }

  return [...entryList].sort((left, right) => {
    const kindDiff = kindPriorityMap[left.kind] - kindPriorityMap[right.kind]
    if (kindDiff !== 0) {
      return kindDiff
    }

    return left.name.localeCompare(right.name, 'zh-CN', {
      sensitivity: 'base',
      numeric: true,
    })
  })
}

function normalizeDirectoryState(nextState, snapshot, fallbackEmptyMessageKey = DIRECTORY_EMPTY_MESSAGE_KEY) {
  const currentDocumentPath = normalizeComparablePath(resolveDocumentOpenCurrentPath(snapshot))
  const rawDirectoryState = nextState?.directoryState || nextState
  const directoryPath = normalizePath(rawDirectoryState?.directoryPath)

  if (!directoryPath) {
    return createEmptyDirectoryState(fallbackEmptyMessageKey)
  }

  const entryList = sortDirectoryEntryList((Array.isArray(rawDirectoryState?.entryList) ? rawDirectoryState.entryList : [])
    .map((entry) => {
      const path = normalizePath(entry?.path)
      const kind = resolveEntryKind(entry)

      return {
        name: typeof entry?.name === 'string' && entry.name
          ? entry.name
          : getPathBasename(path),
        path,
        kind,
        isActive: kind === 'markdown' && normalizeComparablePath(path) === currentDocumentPath,
      }
    })
    .filter(entry => Boolean(entry.path)))

  return {
    directoryPath,
    entryList,
    emptyMessageKey: rawDirectoryState?.emptyMessageKey || fallbackEmptyMessageKey,
  }
}

function buildBreadcrumbList(directoryPath) {
  const normalizedPath = normalizePath(directoryPath)
  if (!normalizedPath) {
    return []
  }
  if (normalizedPath === '/') {
    return [{
      path: '/',
      label: '/',
    }]
  }
  if (isWindowsDriveRootPath(normalizedPath)) {
    return [{
      path: normalizedPath,
      label: normalizedPath.slice(0, 2),
    }]
  }

  const segmentList = normalizedPath.split('/').filter(Boolean)
  if (segmentList.length === 0) {
    return []
  }

  let currentPath = normalizedPath.startsWith('//')
    ? '//'
    : normalizedPath.startsWith('/')
      ? '/'
      : ''

  return segmentList.map((segment, index) => {
    if (index === 0 && /^[A-Za-z]:$/u.test(segment)) {
      currentPath = `${segment}/`
    } else if (currentPath === '/' || currentPath === '//') {
      currentPath = `${currentPath}${segment}`
    } else {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
    }

    return {
      path: currentPath,
      label: segment,
    }
  })
}

function createDefaultOpenNameInputModal({
  t,
  createModal = config => Modal.confirm(config),
  showWarning = messageKey => message.warning(t(messageKey)),
}) {
  return async ({
    kind,
    trim = true,
    emptyMessageKey,
  }) => {
    const inputValue = ref('')

    return await new Promise((resolve) => {
      let settled = false
      const settle = (value) => {
        if (settled) {
          return
        }

        settled = true
        resolve(value)
      }

      createModal({
        title: kind === 'folder'
          ? t('message.fileManagerCreateFolder')
          : t('message.fileManagerCreateMarkdown'),
        okText: t('okText'),
        cancelText: t('cancelText'),
        centered: true,
        content: createVNode(Input, {
          'value': inputValue.value,
          'autofocus': true,
          'onUpdate:value': value => inputValue.value = value,
        }),
        onOk: async () => {
          const nextValue = trim ? normalizeFileManagerEntryName(inputValue.value) : inputValue.value
          if (!nextValue) {
            showWarning(emptyMessageKey)
            return Promise.reject(new Error('file-manager-entry-name-empty'))
          }
          if (isInvalidFileManagerEntryName(nextValue)) {
            showWarning(INVALID_ENTRY_NAME_MESSAGE_KEY)
            return Promise.reject(new Error('file-manager-entry-name-invalid'))
          }

          settle(nextValue)
          return true
        },
        onCancel: () => {
          settle(null)
        },
      })
    })
  }
}

/**
 * 统一维护文件管理栏在 renderer 侧的目录状态、目录切换和新建动作。
 */
export function createFileManagerPanelController({
  store,
  t = value => value,
  requestDirectoryState = requestFileManagerDirectoryState,
  requestOpenDirectory = requestFileManagerOpenDirectory,
  requestCreateFolder = requestFileManagerCreateFolder,
  requestCreateMarkdown = requestFileManagerCreateMarkdown,
  requestPickDirectory = requestFileManagerPickDirectory,
  createOpenDecisionController = createFileManagerOpenDecisionController,
  openNameInputModal = createDefaultOpenNameInputModal({ t }),
  showWarningMessage = messageKey => message.warning(t(messageKey)),
  subscribeEvent = (eventName, handler) => eventEmit.on(eventName, handler),
  unsubscribeEvent = (eventName, handler) => eventEmit.remove(eventName, handler),
} = {}) {
  const openDecisionController = createOpenDecisionController({
    t,
  })
  const directoryState = ref(createEmptyDirectoryState())
  const loading = ref(false)
  let latestDirectoryStateRequestId = 0
  const directoryPath = computed(() => directoryState.value.directoryPath)
  const entryList = computed(() => directoryState.value.entryList)
  const emptyMessageKey = computed(() => directoryState.value.emptyMessageKey)
  const hasDirectory = computed(() => Boolean(directoryState.value.directoryPath))
  const breadcrumbList = computed(() => buildBreadcrumbList(directoryPath.value))

  function commitDirectoryState(nextState, options = {}) {
    directoryState.value = normalizeDirectoryState(
      nextState,
      store?.documentSessionSnapshot,
      options.emptyMessageKey || emptyMessageKey.value || DIRECTORY_EMPTY_MESSAGE_KEY,
    )

    return directoryState.value
  }

  function commitEmptyDirectoryState(emptyMessageKey) {
    directoryState.value = createEmptyDirectoryState(emptyMessageKey)
    return directoryState.value
  }

  function invalidatePendingDirectoryStateRequest() {
    latestDirectoryStateRequestId += 1
    loading.value = false
    return latestDirectoryStateRequestId
  }

  function applyDirectoryState(nextState, options = {}) {
    invalidatePendingDirectoryStateRequest()
    return commitDirectoryState(nextState, options)
  }

  async function runLatestDirectoryStateRequest(requester, onResolved) {
    latestDirectoryStateRequestId += 1
    const requestId = latestDirectoryStateRequestId
    loading.value = true

    try {
      const result = await requester()
      if (requestId !== latestDirectoryStateRequestId) {
        return directoryState.value
      }

      return onResolved(result)
    } finally {
      if (requestId === latestDirectoryStateRequestId) {
        loading.value = false
      }
    }
  }

  async function reloadDirectoryStateFromSnapshot(snapshot = store?.documentSessionSnapshot) {
    const target = resolveDirectoryTargetFromSnapshot(snapshot)
    if (!target.directoryPath) {
      invalidatePendingDirectoryStateRequest()
      return commitEmptyDirectoryState(target.emptyMessageKey)
    }

    return await runLatestDirectoryStateRequest(() => requestDirectoryState({
      directoryPath: target.directoryPath,
    }), (nextState) => {
      if (!nextState) {
        return commitEmptyDirectoryState(
          Object.prototype.hasOwnProperty.call(target, 'missingDirectoryEmptyMessageKey')
            ? target.missingDirectoryEmptyMessageKey
            : target.emptyMessageKey,
        )
      }

      return commitDirectoryState(nextState, {
        emptyMessageKey: target.emptyMessageKey,
      })
    })
  }

  async function openDirectory(targetPath) {
    if (!targetPath) {
      return null
    }

    return await runLatestDirectoryStateRequest(() => requestOpenDirectory({
      directoryPath: targetPath,
    }), (nextState) => {
      if (!nextState) {
        return commitEmptyDirectoryState(DIRECTORY_EMPTY_MESSAGE_KEY)
      }

      return commitDirectoryState(nextState, {
        emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
      })
    })
  }

  async function pickDirectory() {
    const selectedPath = await requestPickDirectory()
    if (!selectedPath) {
      return null
    }

    return await openDirectory(selectedPath)
  }

  async function requestEntryName(kind) {
    return await openNameInputModal({
      kind,
      trim: true,
      emptyMessageKey: kind === 'folder'
        ? 'message.fileManagerFolderNameRequired'
        : 'message.fileManagerMarkdownNameRequired',
    })
  }

  async function createFolder(name) {
    const nextName = typeof name === 'string'
      ? normalizeFileManagerEntryName(name)
      : await requestEntryName('folder')
    if (!nextName) {
      return null
    }
    if (isInvalidFileManagerEntryName(nextName)) {
      showWarningMessage(INVALID_ENTRY_NAME_MESSAGE_KEY)
      return createInvalidFileManagerEntryNameResult()
    }

    return await runLatestDirectoryStateRequest(() => requestCreateFolder({
      name: nextName,
    }), (result) => {
      if (result?.ok === false) {
        return result
      }

      if (result) {
        commitDirectoryState(result?.directoryState || result, {
          emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
        })
      }

      return result
    })
  }

  async function createMarkdown(name) {
    const nextName = typeof name === 'string'
      ? normalizeFileManagerEntryName(name)
      : await requestEntryName('markdown')
    if (!nextName) {
      return null
    }
    if (isInvalidFileManagerEntryName(nextName)) {
      showWarningMessage(INVALID_ENTRY_NAME_MESSAGE_KEY)
      return createInvalidFileManagerEntryNameResult()
    }

    return await runLatestDirectoryStateRequest(() => requestCreateMarkdown({
      name: nextName,
    }), async (result) => {
      if (result?.ok === false) {
        return result
      }

      if (result?.directoryState) {
        commitDirectoryState(result.directoryState, {
          emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
        })
      }

      if (result?.path) {
        await openDecisionController.openDocument(result.path, {
          currentPath: resolveDocumentOpenCurrentPath(store?.documentSessionSnapshot),
          isDirty: store?.documentSessionSnapshot?.dirty === true,
          source: 'file-panel-create-markdown',
        })
      }

      return result
    })
  }

  async function requestCreateFolderFromInput() {
    return await createFolder()
  }

  async function requestCreateMarkdownFromInput() {
    return await createMarkdown()
  }

  async function openEntry(entry) {
    if (entry?.kind === 'directory') {
      return await openDirectory(entry.path)
    }

    if (entry?.kind === 'markdown') {
      const currentDocumentPath = normalizeComparablePath(resolveDocumentOpenCurrentPath(store?.documentSessionSnapshot))
      if (entry?.isActive === true || normalizeComparablePath(entry?.path) === currentDocumentPath) {
        return {
          ok: true,
          reason: 'noop-current-file',
        }
      }

      return await openDecisionController.openDocument(entry.path, {
        currentPath: resolveDocumentOpenCurrentPath(store?.documentSessionSnapshot),
        isDirty: store?.documentSessionSnapshot?.dirty === true,
        source: 'file-panel-entry',
      })
    }

    showWarningMessage('message.onlyMarkdownFilesCanBeOpened')
    return {
      ok: false,
      reason: 'unsupported-entry-kind',
    }
  }

  const documentDirectoryIdentity = computed(() => {
    const snapshot = store?.documentSessionSnapshot

    return [
      snapshot?.sessionId ?? '',
      resolveDocumentOpenCurrentPath(snapshot) ?? '',
      snapshot?.recentMissingPath ?? '',
    ].join('::')
  })

  watch([
    documentDirectoryIdentity,
    () => store?.fileManagerPanelVisible,
  ], async ([, visible]) => {
    if (visible) {
      await reloadDirectoryStateFromSnapshot(store?.documentSessionSnapshot)
    }
  }, {
    immediate: true,
  })

  const handleDirectoryChanged = (payload) => {
    applyDirectoryState(payload, {
      emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
    })
  }

  subscribeEvent(FILE_MANAGER_DIRECTORY_CHANGED_EVENT, handleDirectoryChanged)
  onScopeDispose(() => {
    unsubscribeEvent(FILE_MANAGER_DIRECTORY_CHANGED_EVENT, handleDirectoryChanged)
  })

  return {
    loading,
    directoryState,
    directoryPath,
    entryList,
    emptyMessageKey,
    hasDirectory,
    breadcrumbList,
    applyDirectoryState,
    reloadDirectoryStateFromSnapshot,
    openDirectory,
    pickDirectory,
    createFolder,
    createMarkdown,
    requestCreateFolderFromInput,
    requestCreateMarkdownFromInput,
    openEntry,
  }
}

export default {
  createFileManagerPanelController,
}
