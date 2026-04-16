import { Input, message, Modal } from 'ant-design-vue'
import { computed, createVNode, onScopeDispose, ref, watch } from 'vue'
import channelUtil from '@/util/channel/channelUtil.js'
import eventEmit from '@/util/channel/eventEmit.js'
import { getConfigUpdateFailureMessageKey } from '@/util/config/configUpdateResultUtil.js'
import { requestDocumentOpenPathByInteraction } from '@/util/document-session/documentOpenInteractionService.js'
import { resolveFileManagerEntryType, sortFileManagerEntryList } from './fileManagerEntryMetaUtil.js'
import { FILE_MANAGER_DIRECTORY_CHANGED_EVENT } from './fileManagerEventUtil.js'
import { resolveDocumentOpenCurrentPath } from './fileManagerOpenDecisionController.js'
import {
  requestFileManagerCreateFolder,
  requestFileManagerCreateMarkdown,
  requestFileManagerDirectoryState,
  requestFileManagerOpenDirectory,
  requestFileManagerPickDirectory,
  requestFileManagerSyncCurrentDirectoryOptions,
} from './fileManagerPanelCommandUtil.js'

const DRAFT_EMPTY_MESSAGE_KEY = 'message.fileManagerSelectDirectory'
const DIRECTORY_EMPTY_MESSAGE_KEY = 'message.fileManagerDirectoryEmpty'
const INVALID_ENTRY_NAME_MESSAGE_KEY = 'message.fileManagerInvalidEntryName'
const FILE_MANAGER_SORT_FIELD_SET = new Set(['name', 'modifiedTime', 'type'])
const FILE_MANAGER_SORT_DIRECTION_SET = new Set(['asc', 'desc'])
const DEFAULT_FILE_MANAGER_SORT_CONFIG = Object.freeze({
  field: 'type',
  direction: 'asc',
})

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

function normalizeFileManagerEntryName(name) {
  return typeof name === 'string' ? name.trim() : ''
}

// 文件管理栏的新建 Markdown 统一收口为单个 .md 后缀，避免出现 .md.md。
function ensureMarkdownFileManagerEntryName(name) {
  const normalizedName = normalizeFileManagerEntryName(name)
  if (!normalizedName) {
    return ''
  }
  if (/\.(?:md|markdown)$/iu.test(normalizedName)) {
    return normalizedName.replace(/(?:\.(?:md|markdown))+$/iu, '.md')
  }

  return `${normalizedName}.md`
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

function normalizeFileManagerSortConfig(sortConfig) {
  const field = FILE_MANAGER_SORT_FIELD_SET.has(sortConfig?.field)
    ? sortConfig.field
    : DEFAULT_FILE_MANAGER_SORT_CONFIG.field
  const direction = FILE_MANAGER_SORT_DIRECTION_SET.has(sortConfig?.direction)
    ? sortConfig.direction
    : DEFAULT_FILE_MANAGER_SORT_CONFIG.direction

  return {
    field,
    direction,
  }
}

function shouldIncludeModifiedTime(sortConfig) {
  return normalizeFileManagerSortConfig(sortConfig).field === 'modifiedTime'
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

function resolveSnapshotEmptyMessageKey(snapshot, fallbackEmptyMessageKey = DIRECTORY_EMPTY_MESSAGE_KEY) {
  const target = resolveDirectoryTargetFromSnapshot(snapshot)

  if (snapshot?.isRecentMissing === true
    && Object.prototype.hasOwnProperty.call(target, 'missingDirectoryEmptyMessageKey')) {
    return target.missingDirectoryEmptyMessageKey
  }
  if (Object.prototype.hasOwnProperty.call(target, 'emptyMessageKey')) {
    return target.emptyMessageKey
  }

  return fallbackEmptyMessageKey
}

function createEmptyDirectoryState(emptyMessageKey) {
  return {
    directoryPath: null,
    entryList: [],
    emptyMessageKey: emptyMessageKey === undefined ? DRAFT_EMPTY_MESSAGE_KEY : emptyMessageKey,
  }
}

function normalizeDirectoryState(nextState, snapshot, sortConfig, fallbackEmptyMessageKey = DIRECTORY_EMPTY_MESSAGE_KEY) {
  const currentDocumentPath = normalizeComparablePath(resolveDocumentOpenCurrentPath(snapshot))
  const rawDirectoryState = nextState?.directoryState || nextState
  const directoryPath = normalizePath(rawDirectoryState?.directoryPath)

  if (!directoryPath) {
    return createEmptyDirectoryState(resolveSnapshotEmptyMessageKey(snapshot, fallbackEmptyMessageKey))
  }

  const entryList = sortFileManagerEntryList((Array.isArray(rawDirectoryState?.entryList) ? rawDirectoryState.entryList : [])
    .map((entry) => {
      const path = normalizePath(entry?.path)
      const kind = resolveFileManagerEntryType({
        ...entry,
        path,
      })

      return {
        name: typeof entry?.name === 'string' && entry.name
          ? entry.name
          : getPathBasename(path),
        path,
        kind,
        modifiedTimeMs: entry?.modifiedTimeMs,
        isActive: kind === 'markdown' && normalizeComparablePath(path) === currentDocumentPath,
      }
    })
    .filter(entry => Boolean(entry.path)), sortConfig)

  return {
    directoryPath,
    entryList,
    emptyMessageKey: rawDirectoryState && Object.prototype.hasOwnProperty.call(rawDirectoryState, 'emptyMessageKey')
      ? rawDirectoryState.emptyMessageKey
      : fallbackEmptyMessageKey,
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
    } else if (currentPath.endsWith('/')) {
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
        }, kind === 'markdown'
          ? {
              // 新建 Markdown 时固定展示 .md，用户只输入基础名称即可。
              addonAfter: () => createVNode('span', {
                style: {
                  color: 'var(--wj-markdown-text-primary)',
                },
              }, '.md'),
            }
          : undefined),
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

          settle(kind === 'markdown'
            ? ensureMarkdownFileManagerEntryName(nextValue)
            : nextValue)
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
  sendCommand = payload => channelUtil.send(payload),
  requestDirectoryState = requestFileManagerDirectoryState,
  requestOpenDirectory = requestFileManagerOpenDirectory,
  requestCreateFolder = requestFileManagerCreateFolder,
  requestCreateMarkdown = requestFileManagerCreateMarkdown,
  requestSyncCurrentDirectoryOptions = requestFileManagerSyncCurrentDirectoryOptions,
  requestPickDirectory = requestFileManagerPickDirectory,
  requestDocumentOpenPathByInteraction: requestOpenDocumentPath = requestDocumentOpenPathByInteraction,
  openNameInputModal = createDefaultOpenNameInputModal({ t }),
  showWarningMessage = messageKey => message.warning(t(messageKey)),
  subscribeEvent = (eventName, handler) => eventEmit.on(eventName, handler),
  unsubscribeEvent = (eventName, handler) => eventEmit.remove(eventName, handler),
} = {}) {
  const directoryState = ref(createEmptyDirectoryState())
  const loading = ref(false)
  let latestDirectoryStateRequestId = 0
  let latestDirectoryStateSource = null
  let latestDirectoryStateEmptyMessageKey = DIRECTORY_EMPTY_MESSAGE_KEY
  let latestDirectoryStateIncludeModifiedTime = shouldIncludeModifiedTime(store?.config?.fileManagerSort)
  let latestDirectoryBindingIncludeModifiedTime = shouldIncludeModifiedTime(store?.config?.fileManagerSort)
  // 目录 watcher 选项同步是异步的，这里单独记录“当前希望生效”的目标值，避免快切排序时被旧响应回滚。
  let latestDirectoryBindingTargetIncludeModifiedTime = shouldIncludeModifiedTime(store?.config?.fileManagerSort)
  let latestDirectoryBindingRequestId = 0
  const directoryPath = computed(() => directoryState.value.directoryPath)
  const entryList = computed(() => directoryState.value.entryList)
  const emptyMessageKey = computed(() => directoryState.value.emptyMessageKey)
  const hasDirectory = computed(() => Boolean(directoryState.value.directoryPath))
  const breadcrumbList = computed(() => buildBreadcrumbList(directoryPath.value))
  const parentDirectoryPath = computed(() => getPathDirname(directoryPath.value))
  const currentDocumentDirectoryPath = computed(() => getPathDirname(
    resolveDocumentOpenCurrentPath(store?.documentSessionSnapshot),
  ))
  const canOpenParentDirectory = computed(() => {
    const currentPath = normalizeComparablePath(directoryPath.value)
    const parentPath = normalizeComparablePath(parentDirectoryPath.value)

    return Boolean(currentPath && parentPath && currentPath !== parentPath)
  })
  const canFocusCurrentDocumentDirectory = computed(() => Boolean(
    normalizeComparablePath(currentDocumentDirectoryPath.value),
  ))

  function resolveDirectoryRequestIncludeModifiedTime(includeModifiedTime) {
    if (includeModifiedTime === true) {
      return true
    }

    if (includeModifiedTime === false) {
      return false
    }

    return shouldIncludeModifiedTime(store?.config?.fileManagerSort)
  }

  function createDirectoryRequestPayload(targetDirectoryPath, includeModifiedTime = undefined) {
    const payload = {
      directoryPath: targetDirectoryPath,
    }
    if (includeModifiedTime === true || includeModifiedTime === false) {
      payload.includeModifiedTime = includeModifiedTime
    }

    return payload
  }

  function commitDirectoryState(nextState, options = {}) {
    latestDirectoryStateSource = nextState
    latestDirectoryStateEmptyMessageKey = options.emptyMessageKey || emptyMessageKey.value || DIRECTORY_EMPTY_MESSAGE_KEY
    if (Object.prototype.hasOwnProperty.call(options, 'includeModifiedTime')) {
      latestDirectoryStateIncludeModifiedTime = options.includeModifiedTime === true
      latestDirectoryBindingIncludeModifiedTime = options.includeModifiedTime === true
      latestDirectoryBindingTargetIncludeModifiedTime = options.includeModifiedTime === true
    }
    directoryState.value = normalizeDirectoryState(
      nextState,
      store?.documentSessionSnapshot,
      store?.config?.fileManagerSort,
      latestDirectoryStateEmptyMessageKey,
    )

    return directoryState.value
  }

  function commitEmptyDirectoryState(emptyMessageKey) {
    latestDirectoryStateSource = null
    latestDirectoryStateEmptyMessageKey = emptyMessageKey === undefined
      ? DRAFT_EMPTY_MESSAGE_KEY
      : emptyMessageKey
    latestDirectoryStateIncludeModifiedTime = false
    latestDirectoryBindingIncludeModifiedTime = false
    latestDirectoryBindingTargetIncludeModifiedTime = false
    directoryState.value = createEmptyDirectoryState(emptyMessageKey)
    return directoryState.value
  }

  function recomputeDirectoryStateFromLatestSource() {
    if (!latestDirectoryStateSource || !directoryState.value.directoryPath) {
      return directoryState.value
    }

    directoryState.value = normalizeDirectoryState(
      latestDirectoryStateSource,
      store?.documentSessionSnapshot,
      store?.config?.fileManagerSort,
      latestDirectoryStateEmptyMessageKey,
    )

    return directoryState.value
  }

  async function reloadCurrentDirectoryState(includeModifiedTime = undefined) {
    if (!directoryPath.value) {
      return directoryState.value
    }

    const nextIncludeModifiedTime = resolveDirectoryRequestIncludeModifiedTime(includeModifiedTime)
    const nextEmptyMessageKey = latestDirectoryStateEmptyMessageKey || DIRECTORY_EMPTY_MESSAGE_KEY

    return await runLatestDirectoryStateRequest(() => requestDirectoryState(
      createDirectoryRequestPayload(
        directoryPath.value,
        includeModifiedTime === undefined && nextIncludeModifiedTime !== true
          ? undefined
          : nextIncludeModifiedTime,
      ),
    ), (nextState) => {
      const failureResult = resolveDirectoryFailureResult(nextState)
      if (failureResult) {
        return failureResult
      }

      const rawDirectoryState = nextState?.directoryState || nextState
      if (!rawDirectoryState?.directoryPath) {
        return commitEmptyDirectoryState(nextEmptyMessageKey)
      }

      return commitDirectoryState(nextState, {
        emptyMessageKey: nextEmptyMessageKey,
        includeModifiedTime: nextIncludeModifiedTime,
      })
    })
  }

  async function syncCurrentDirectoryOptions(includeModifiedTime) {
    if (!directoryPath.value) {
      return {
        ok: true,
        synced: false,
        reason: 'noop-current-directory-options',
      }
    }

    const nextIncludeModifiedTime = includeModifiedTime === true
    latestDirectoryBindingTargetIncludeModifiedTime = nextIncludeModifiedTime
    latestDirectoryBindingRequestId += 1
    const requestId = latestDirectoryBindingRequestId

    try {
      const result = await requestSyncCurrentDirectoryOptions({
        includeModifiedTime: nextIncludeModifiedTime,
      })
      if (requestId !== latestDirectoryBindingRequestId) {
        return {
          ok: true,
          synced: false,
          reason: 'stale-current-directory-options',
          includeModifiedTime: latestDirectoryBindingTargetIncludeModifiedTime,
        }
      }

      const failureResult = resolveDirectoryFailureResult(result)
      if (failureResult) {
        return failureResult
      }

      if (result?.synced !== false) {
        latestDirectoryBindingIncludeModifiedTime = result?.includeModifiedTime === true
        latestDirectoryBindingTargetIncludeModifiedTime = latestDirectoryBindingIncludeModifiedTime
      }

      return result
    } catch {
      if (requestId !== latestDirectoryBindingRequestId) {
        return {
          ok: true,
          synced: false,
          reason: 'stale-current-directory-options',
          includeModifiedTime: latestDirectoryBindingTargetIncludeModifiedTime,
        }
      }

      showWarningMessage('message.fileManagerOpenDirectoryFailed')
      return {
        ok: false,
        reason: 'open-directory-watch-failed',
      }
    }
  }

  async function updateFileManagerSortConfig(nextSortConfig) {
    const normalizedSortConfig = normalizeFileManagerSortConfig(nextSortConfig)
    const nextConfigPatch = {
      fileManagerSort: normalizedSortConfig,
    }

    try {
      const result = await sendCommand({
        event: 'user-update-config',
        data: nextConfigPatch,
      })
      const failureMessageKey = getConfigUpdateFailureMessageKey(result)
      if (failureMessageKey) {
        showWarningMessage(failureMessageKey)
        return result
      }

      if (typeof store?.config === 'object' && store.config) {
        store.config.fileManagerSort = normalizedSortConfig
      } else if (store) {
        store.config = nextConfigPatch
      }
      return result
    } catch {
      showWarningMessage('message.configWriteFailed')
      return {
        ok: false,
        messageKey: 'message.configWriteFailed',
        reason: 'config-update-transport-failed',
      }
    }
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

  function resolveDirectoryFailureResult(nextState) {
    if (nextState?.ok !== false) {
      return null
    }

    if (nextState.reason === 'open-directory-watch-failed') {
      showWarningMessage('message.fileManagerOpenDirectoryFailed')
    } else if (nextState.reason === 'file-manager-entry-already-exists') {
      showWarningMessage('message.fileManagerEntryAlreadyExists')
    }

    return nextState
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

    const includeModifiedTime = resolveDirectoryRequestIncludeModifiedTime()
    return await runLatestDirectoryStateRequest(() => requestDirectoryState(
      createDirectoryRequestPayload(target.directoryPath, includeModifiedTime ? true : undefined),
    ), (nextState) => {
      const failureResult = resolveDirectoryFailureResult(nextState)
      if (failureResult) {
        return failureResult
      }

      const rawDirectoryState = nextState?.directoryState || nextState
      if (!rawDirectoryState?.directoryPath) {
        return commitEmptyDirectoryState(resolveSnapshotEmptyMessageKey(snapshot, target.emptyMessageKey))
      }

      return commitDirectoryState(nextState, {
        emptyMessageKey: target.emptyMessageKey,
        includeModifiedTime,
      })
    })
  }

  async function openDirectory(targetPath) {
    if (!targetPath) {
      return null
    }

    const includeModifiedTime = resolveDirectoryRequestIncludeModifiedTime()
    return await runLatestDirectoryStateRequest(() => requestOpenDirectory(
      createDirectoryRequestPayload(targetPath, includeModifiedTime ? true : undefined),
    ), (nextState) => {
      const failureResult = resolveDirectoryFailureResult(nextState)
      if (failureResult) {
        return failureResult
      }

      if (!nextState) {
        return commitEmptyDirectoryState(DIRECTORY_EMPTY_MESSAGE_KEY)
      }

      return commitDirectoryState(nextState, {
        emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
        includeModifiedTime,
      })
    })
  }

  async function openParentDirectory() {
    if (canOpenParentDirectory.value !== true || !parentDirectoryPath.value) {
      return {
        ok: true,
        reason: 'noop-parent-directory',
      }
    }

    return await openDirectory(parentDirectoryPath.value)
  }

  async function focusCurrentDocumentDirectory() {
    const targetDirectoryPath = currentDocumentDirectoryPath.value
    const currentPath = normalizeComparablePath(directoryPath.value)
    const targetPath = normalizeComparablePath(targetDirectoryPath)

    if (!targetDirectoryPath || !targetPath || canFocusCurrentDocumentDirectory.value !== true) {
      return {
        ok: true,
        reason: 'noop-current-document-directory',
      }
    }

    if (currentPath === targetPath) {
      return {
        ok: true,
        reason: 'current-document-directory-ready',
        directoryPath: targetDirectoryPath,
      }
    }

    return await openDirectory(targetDirectoryPath)
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
      const failureResult = resolveDirectoryFailureResult(result)
      if (failureResult) {
        return failureResult
      }

      if (result) {
        commitDirectoryState(result?.directoryState || result, {
          emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
          includeModifiedTime: latestDirectoryBindingIncludeModifiedTime,
        })
      }

      return result
    })
  }

  async function createMarkdown(name) {
    const rawName = typeof name === 'string'
      ? normalizeFileManagerEntryName(name)
      : await requestEntryName('markdown')
    if (!rawName) {
      return null
    }
    if (isInvalidFileManagerEntryName(rawName)) {
      showWarningMessage(INVALID_ENTRY_NAME_MESSAGE_KEY)
      return createInvalidFileManagerEntryNameResult()
    }
    const nextName = ensureMarkdownFileManagerEntryName(rawName)

    return await runLatestDirectoryStateRequest(() => requestCreateMarkdown({
      name: nextName,
    }), async (result) => {
      const failureResult = resolveDirectoryFailureResult(result)
      if (failureResult) {
        return failureResult
      }

      const nestedFailureResult = resolveDirectoryFailureResult(result?.directoryState)
      if (nestedFailureResult) {
        return result
      }

      if (result?.directoryState) {
        commitDirectoryState(result.directoryState, {
          emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
          includeModifiedTime: latestDirectoryBindingIncludeModifiedTime,
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

      return await requestOpenDocumentPath(entry.path, {
        entrySource: 'file-manager',
        trigger: 'user',
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

  watch([
    () => store?.config?.fileManagerSort?.field,
    () => store?.config?.fileManagerSort?.direction,
  ], async ([field, direction]) => {
    const nextIncludeModifiedTime = shouldIncludeModifiedTime({
      field,
      direction,
    })

    if (directoryState.value.directoryPath
      && nextIncludeModifiedTime
      && latestDirectoryStateIncludeModifiedTime !== true) {
      await reloadCurrentDirectoryState(true)
      return
    }

    recomputeDirectoryStateFromLatestSource()

    if (!directoryState.value.directoryPath) {
      return
    }

    if (latestDirectoryBindingTargetIncludeModifiedTime !== nextIncludeModifiedTime) {
      await syncCurrentDirectoryOptions(nextIncludeModifiedTime)
    }
  })

  const handleDirectoryChanged = (payload) => {
    applyDirectoryState(payload, {
      emptyMessageKey: DIRECTORY_EMPTY_MESSAGE_KEY,
      includeModifiedTime: latestDirectoryBindingIncludeModifiedTime,
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
    canOpenParentDirectory,
    canFocusCurrentDocumentDirectory,
    applyDirectoryState,
    reloadDirectoryStateFromSnapshot,
    openDirectory,
    openParentDirectory,
    focusCurrentDocumentDirectory,
    pickDirectory,
    createFolder,
    createMarkdown,
    updateFileManagerSortConfig,
    requestCreateFolderFromInput,
    requestCreateMarkdownFromInput,
    openEntry,
  }
}

export default {
  createFileManagerPanelController,
}
