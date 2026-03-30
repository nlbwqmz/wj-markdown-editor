import { Input, message, Modal } from 'ant-design-vue'
import { computed, createVNode, onScopeDispose, ref, watch } from 'vue'
import eventEmit from '@/util/channel/eventEmit.js'
import { FILE_MANAGER_DIRECTORY_CHANGED_EVENT } from './fileManagerEventUtil.js'
import { createFileManagerOpenDecisionController } from './fileManagerOpenDecisionController.js'
import {
  requestFileManagerCreateFolder,
  requestFileManagerCreateMarkdown,
  requestFileManagerDirectoryState,
  requestFileManagerOpenDirectory,
  requestFileManagerPickDirectory,
} from './fileManagerPanelCommandUtil.js'

const DRAFT_EMPTY_MESSAGE_KEY = 'message.fileManagerSelectDirectory'
const DIRECTORY_EMPTY_MESSAGE_KEY = 'message.fileManagerDirectoryEmpty'

function normalizeComparablePath(path) {
  if (typeof path !== 'string') {
    return null
  }

  const normalizedPath = path.trim().replace(/\\/g, '/').replace(/\/+$/u, '')

  return normalizedPath ? normalizedPath.toLowerCase() : null
}

function normalizePath(path) {
  if (typeof path !== 'string') {
    return null
  }

  const normalizedPath = path.trim().replace(/\\/g, '/').replace(/\/+$/u, '')
  return normalizedPath || null
}

function getPathDirname(path) {
  const normalizedPath = normalizePath(path)

  if (!normalizedPath) {
    return null
  }

  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  if (lastSlashIndex <= 0) {
    return null
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

function resolveCurrentDocumentPath(snapshot) {
  if (snapshot?.isRecentMissing === true) {
    return null
  }

  return normalizePath(snapshot?.resourceContext?.documentPath || snapshot?.displayPath || null)
}

function resolveDirectoryTargetFromSnapshot(snapshot) {
  if (snapshot?.isRecentMissing === true && snapshot?.recentMissingPath) {
    return {
      directoryPath: getPathDirname(snapshot.recentMissingPath),
      emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
      missingDirectoryEmptyMessageKey: null,
    }
  }

  const currentDocumentPath = resolveCurrentDocumentPath(snapshot)
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
  const currentDocumentPath = normalizeComparablePath(resolveCurrentDocumentPath(snapshot))
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

  const segmentList = normalizedPath.split('/').filter(Boolean)
  if (segmentList.length === 0) {
    return []
  }

  let currentPath = ''

  return segmentList.map((segment, index) => {
    if (index === 0 && /^[A-Za-z]:$/u.test(segment)) {
      currentPath = segment
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
          const nextValue = trim ? inputValue.value.trim() : inputValue.value
          if (!nextValue) {
            showWarning(emptyMessageKey)
            return Promise.reject(new Error('file-manager-entry-name-empty'))
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
  subscribeEvent = (eventName, handler) => eventEmit.on(eventName, handler),
  unsubscribeEvent = (eventName, handler) => eventEmit.remove(eventName, handler),
} = {}) {
  const openDecisionController = createOpenDecisionController({
    t,
  })
  const directoryState = ref(createEmptyDirectoryState())
  const loading = ref(false)
  const directoryPath = computed(() => directoryState.value.directoryPath)
  const entryList = computed(() => directoryState.value.entryList)
  const emptyMessageKey = computed(() => directoryState.value.emptyMessageKey)
  const hasDirectory = computed(() => Boolean(directoryState.value.directoryPath))
  const breadcrumbList = computed(() => buildBreadcrumbList(directoryPath.value))

  function applyDirectoryState(nextState, options = {}) {
    directoryState.value = normalizeDirectoryState(
      nextState,
      store?.documentSessionSnapshot,
      options.emptyMessageKey || emptyMessageKey.value || DIRECTORY_EMPTY_MESSAGE_KEY,
    )

    return directoryState.value
  }

  async function reloadDirectoryStateFromSnapshot(snapshot = store?.documentSessionSnapshot) {
    const target = resolveDirectoryTargetFromSnapshot(snapshot)
    if (!target.directoryPath) {
      directoryState.value = createEmptyDirectoryState(target.emptyMessageKey)
      return directoryState.value
    }

    loading.value = true
    try {
      const nextState = await requestDirectoryState({
        directoryPath: target.directoryPath,
      })

      if (!nextState) {
        directoryState.value = createEmptyDirectoryState(
          Object.prototype.hasOwnProperty.call(target, 'missingDirectoryEmptyMessageKey')
            ? target.missingDirectoryEmptyMessageKey
            : target.emptyMessageKey,
        )
        return directoryState.value
      }

      return applyDirectoryState(nextState, {
        emptyMessageKey: target.emptyMessageKey,
      })
    } finally {
      loading.value = false
    }
  }

  async function openDirectory(targetPath) {
    if (!targetPath) {
      return null
    }

    const nextState = await requestOpenDirectory({
      directoryPath: targetPath,
    })

    if (!nextState) {
      directoryState.value = createEmptyDirectoryState(DIRECTORY_EMPTY_MESSAGE_KEY)
      return directoryState.value
    }

    return applyDirectoryState(nextState, {
      emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
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
    const result = await requestCreateFolder({
      name,
    })

    if (result) {
      applyDirectoryState(result?.directoryState || result, {
        emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
      })
    }

    return result
  }

  async function createMarkdown(name) {
    const result = await requestCreateMarkdown({
      name,
    })

    if (result?.directoryState) {
      applyDirectoryState(result.directoryState, {
        emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
      })
    }

    if (result?.path) {
      await openDecisionController.openDocument(result.path, {
        currentPath: resolveCurrentDocumentPath(store?.documentSessionSnapshot),
        isDirty: store?.documentSessionSnapshot?.dirty === true,
        source: 'file-panel-create-markdown',
      })
    }

    return result
  }

  async function requestCreateFolderFromInput() {
    const name = await requestEntryName('folder')
    if (!name) {
      return null
    }

    return await createFolder(name)
  }

  async function requestCreateMarkdownFromInput() {
    const name = await requestEntryName('markdown')
    if (!name) {
      return null
    }

    return await createMarkdown(name)
  }

  async function openEntry(entry) {
    if (entry?.kind === 'directory') {
      return await openDirectory(entry.path)
    }

    if (entry?.kind === 'markdown') {
      return await openDecisionController.openDocument(entry.path, {
        currentPath: resolveCurrentDocumentPath(store?.documentSessionSnapshot),
        isDirty: store?.documentSessionSnapshot?.dirty === true,
        source: 'file-panel-entry',
      })
    }

    return {
      ok: false,
      reason: 'unsupported-entry-kind',
    }
  }

  const documentDirectoryIdentity = computed(() => {
    const snapshot = store?.documentSessionSnapshot

    return [
      snapshot?.sessionId ?? '',
      resolveCurrentDocumentPath(snapshot) ?? '',
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
