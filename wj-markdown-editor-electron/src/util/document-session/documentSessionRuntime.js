import { createDocumentCommandRunner } from './documentCommandRunner.js'

let activeDocumentSessionRuntime = null
const REQUIRED_RUNTIME_DEP_KEYS = [
  'store',
  'saveCoordinator',
  'commandService',
  'effectService',
  'windowBridge',
]

function isValidWindowId(windowId) {
  return (typeof windowId === 'number' && Number.isFinite(windowId))
    || (typeof windowId === 'string' && windowId.trim() !== '')
}

function createFallbackDocumentContext(snapshot) {
  return {
    path: snapshot?.resourceContext?.documentPath || null,
    exists: snapshot?.exists === true,
    content: snapshot?.content || '',
    saved: snapshot?.saved === true,
    fileName: snapshot?.fileName || 'Unnamed',
  }
}

function isPristineDraftWindow({
  windowId,
  getDocumentContext,
  getSessionSnapshot,
}) {
  const documentContext = getDocumentContext(windowId)
  const snapshot = getSessionSnapshot(windowId)
  return !documentContext?.path
    && snapshot?.saved === true
    && snapshot?.isRecentMissing !== true
}

export function normalizeOpenCommandResult({
  command,
  result,
  targetPath = null,
}) {
  if (command === 'document.open-recent'
    && result?.ok === false
    && result.reason === 'open-recent-target-missing') {
    return {
      ok: false,
      reason: 'recent-missing',
      path: result.path ?? targetPath,
    }
  }

  return result
}

function getOpenFailureWindowMessage(result) {
  if (result?.reason === 'open-target-invalid-extension' || result?.reason === 'open-target-not-file') {
    return {
      type: 'warning',
      content: 'message.onlyMarkdownFilesCanBeOpened',
    }
  }

  if (result?.reason === 'open-target-read-failed') {
    return {
      type: 'error',
      content: 'message.openMarkdownFileFailed',
    }
  }

  return null
}

export async function openDocumentWindowWithRuntimePolicy({
  targetPath,
  trigger = 'user',
  isRecent = false,
  sourceWindowId = null,
  openWindow,
  getWindowById = () => null,
  getDocumentContext = () => null,
  getSessionSnapshot = () => null,
}) {
  if (typeof openWindow !== 'function') {
    return {
      ok: false,
      reason: 'open-document-window-not-configured',
      path: targetPath || null,
      trigger,
    }
  }

  const openedWindowId = await openWindow(targetPath, {
    isRecent,
    trigger,
  })
  if (openedWindowId?.ok === false) {
    return openedWindowId
  }

  const normalizedSourceWindowId = isValidWindowId(sourceWindowId)
    ? sourceWindowId
    : null
  const normalizedOpenedWindowId = isValidWindowId(openedWindowId)
    ? openedWindowId
    : null

  if (normalizedSourceWindowId != null
    && normalizedOpenedWindowId != null
    && String(normalizedOpenedWindowId) !== String(normalizedSourceWindowId)
    && isPristineDraftWindow({
      windowId: normalizedSourceWindowId,
      getDocumentContext,
      getSessionSnapshot,
    })) {
    getWindowById(normalizedSourceWindowId)?.close?.()
  }

  const snapshot = normalizedOpenedWindowId == null
    ? null
    : getSessionSnapshot(normalizedOpenedWindowId)
  const documentContext = normalizedOpenedWindowId == null
    ? null
    : getDocumentContext(normalizedOpenedWindowId)

  return {
    ok: true,
    reason: isRecent && normalizedSourceWindowId == null && !documentContext?.path
      ? 'recent-missing'
      : 'opened',
    path: targetPath || null,
    trigger,
    snapshot,
  }
}

const DOCUMENT_STATE_COMMAND_SET = new Set([
  'document.edit',
  'document.save',
  'document.save-copy',
  'document.request-close',
  'document.cancel-close',
  'document.confirm-force-close',
  'document.external.apply',
  'document.external.ignore',
])

const RESOURCE_COMMAND_SET = new Set([
  'document.resource.open-in-folder',
  'document.resource.copy-absolute-path',
  'document.resource.copy-link',
  'document.resource.copy-image',
  'document.resource.save-as',
  'document.resource.delete-local',
  'resource.get-info',
])

const SYNC_QUERY_SET = new Set([
  'resource.get-comparable-key',
])

function assertRequiredRuntimeDeps(deps) {
  const missingDepList = REQUIRED_RUNTIME_DEP_KEYS.filter((depKey) => {
    return deps?.[depKey] == null
  })

  if (missingDepList.length > 0) {
    throw new Error(`createDocumentSessionRuntime 缺少必要依赖: ${missingDepList.join(', ')}`)
  }
}

/**
 * 创建 document-session 统一运行时。
 *
 * 当前 Task 3 先收口三类入口：
 * - startup / second-instance 的 open-path
 * - recent 打开与 recent 列表操作
 * - session snapshot 查询
 *
 * 窗口生命周期、BrowserWindow 事件接线仍保留给 Task 5。
 */
export function createDocumentSessionRuntime(deps = {}) {
  assertRequiredRuntimeDeps(deps)

  const store = deps.store
  const saveCoordinator = deps.saveCoordinator
  const resourceService = deps.resourceService || null
  const fileManagerService = deps.fileManagerService || null
  const directoryWatchService = deps.directoryWatchService || null
  const commandService = deps.commandService
  const effectService = deps.effectService
  const windowBridge = deps.windowBridge
  const getWindowById = deps.getWindowById || (() => null)
  const getDocumentContextByWindowId = deps.getDocumentContext || null
  const openDocumentWindow = deps.openDocumentWindow || null
  const openDocumentInCurrentWindow = deps.openDocumentInCurrentWindow || null
  const publishOpenFailureSystemNotification = deps.publishOpenFailureSystemNotification || (() => null)
  const buildRunnerEffectContext = deps.buildRunnerEffectContext || (() => ({}))
  let runtimeApi = null
  const executeDocumentCommand = deps.executeDocumentCommand || (async ({
    windowId,
    command,
    payload,
    runtime,
  }) => {
    return await runtime.dispatch(windowId, command, payload)
  })
  async function executeResourceCommand({
    windowId,
    command,
    payload,
  }) {
    if (typeof deps.executeResourceCommand === 'function') {
      return await deps.executeResourceCommand({
        windowId,
        command,
        payload,
        runtime: runtimeApi,
      })
    }

    if (!resourceService) {
      throw new Error('document resource service 尚未配置')
    }

    switch (command) {
      case 'document.resource.open-in-folder':
        return await resourceService.openInFolder({
          windowId,
          payload,
        })

      case 'document.resource.copy-absolute-path':
        return await resourceService.copyAbsolutePath({
          windowId,
          payload,
        })

      case 'document.resource.copy-link':
        return await resourceService.copyLink({
          windowId,
          payload,
        })

      case 'document.resource.copy-image':
        return await resourceService.copyImage({
          windowId,
          payload,
        })

      case 'document.resource.save-as':
        return await resourceService.saveAs({
          windowId,
          payload,
        })

      case 'document.resource.delete-local':
        return await resourceService.deleteLocal({
          windowId,
          payload,
        })

      case 'resource.get-info':
        return await resourceService.getInfo({
          windowId,
          payload,
        })

      default:
        throw new Error(`未知资源命令: ${command}`)
    }
  }

  function executeResourceQuery({
    windowId,
    command,
    payload,
  }) {
    if (typeof deps.executeResourceQuery === 'function') {
      return deps.executeResourceQuery({
        windowId,
        command,
        payload,
        runtime: runtimeApi,
      })
    }
    if (typeof deps.executeSyncQuery === 'function') {
      return deps.executeSyncQuery({
        windowId,
        command,
        payload,
        runtime: runtimeApi,
      })
    }

    if (!resourceService) {
      throw new Error('document resource service 尚未配置')
    }

    if (command === 'resource.get-comparable-key') {
      return resourceService.getComparableKey({
        windowId,
        payload,
      })
    }

    throw new Error(`未知同步资源查询: ${command}`)
  }
  const commandRunner = deps.commandRunner || createDocumentCommandRunner({
    commandService,
    getSessionSnapshot: windowId => getSessionSnapshot(windowId),
    publishSnapshotChanged: ({ windowId, snapshot }) => {
      return windowBridge.publishSnapshotChanged?.({
        windowId,
        snapshot,
      })
    },
    applyEffect: async ({ effect, dispatchCommand, windowId, ...effectContext }) => {
      return await effectService.applyEffect?.({
        effect,
        dispatchCommand,
        windowId,
        ...effectContext,
      })
    },
  })

  function getSessionSnapshot(windowId) {
    if (!isValidWindowId(windowId)) {
      return null
    }
    return windowBridge.getSessionSnapshot?.(windowId) || null
  }

  function getDocumentContext(windowId) {
    if (!isValidWindowId(windowId)) {
      return null
    }
    const documentContext = getDocumentContextByWindowId?.(windowId)
    if (documentContext) {
      return documentContext
    }
    return createFallbackDocumentContext(getSessionSnapshot(windowId))
  }

  function publishWindowMessage(windowId, data) {
    if (!isValidWindowId(windowId) || !data) {
      return null
    }
    return windowBridge.publishMessage?.({
      windowId,
      data,
      snapshot: getSessionSnapshot(windowId),
    }) || null
  }

  function publishOpenFailureNotification(windowId, result, payload) {
    if (result?.ok !== false || result.reason !== 'open-target-read-failed') {
      return null
    }

    const targetPath = typeof result.path === 'string'
      ? result.path
      : (typeof payload?.path === 'string' ? payload.path : null)

    try {
      return publishOpenFailureSystemNotification({
        windowId: isValidWindowId(windowId) ? windowId : null,
        path: targetPath,
      }) || null
    } catch {
      // 通知失败不能反向打断打开链路的结构化返回。
      return null
    }
  }

  function createUiDispatchCommand(windowId) {
    return (nextCommand, nextPayload) => {
      return executeUiCommand(windowId, nextCommand, nextPayload)
    }
  }

  async function dispatch(windowId, command, payload, options = {}) {
    return await commandRunner.run({
      windowId,
      command,
      payload,
      publishSnapshotMode: options.publishSnapshotChanged || 'always',
      effectContext: buildRunnerEffectContext({
        windowId,
        dispatchCommand: (nextCommand, nextPayload, nextOptions = {}) => {
          return dispatch(windowId, nextCommand, nextPayload, nextOptions)
        },
      }),
    })
  }

  function normalizeEffectCommandResult(normalizedWindowId, command, payload, result) {
    const normalizedResult = normalizeOpenCommandResult({
      command,
      result,
      targetPath: typeof payload?.path === 'string' ? payload.path : null,
    })

    const windowMessageData = normalizedWindowId != null
      && normalizedResult?.ok === false
      ? getOpenFailureWindowMessage(normalizedResult)
      : null
    if (windowMessageData) {
      publishWindowMessage(normalizedWindowId, windowMessageData)
    }
    publishOpenFailureNotification(normalizedWindowId, normalizedResult, payload)

    return normalizedResult
  }

  function executeUiCommand(windowId, command, payload) {
    const normalizedWindowId = isValidWindowId(windowId) ? windowId : null
    if (normalizedWindowId != null && DOCUMENT_STATE_COMMAND_SET.has(command)) {
      return executeDocumentCommand({
        windowId: normalizedWindowId,
        command,
        payload,
        runtime: runtimeApi,
      })
    }

    if (normalizedWindowId != null && RESOURCE_COMMAND_SET.has(command)) {
      return executeResourceCommand({
        windowId: normalizedWindowId,
        command,
        payload,
      })
    }

    const dispatchCommand = createUiDispatchCommand(normalizedWindowId)
    const effectContext = normalizedWindowId == null
      ? {}
      : buildRunnerEffectContext({
          windowId: normalizedWindowId,
          dispatchCommand,
        })

    return Promise.resolve(effectService.executeCommand({
      windowId: normalizedWindowId,
      command,
      payload,
      dispatchCommand,
      openDocumentWindow: (targetPath, options = {}) => {
        return openDocumentWindowWithRuntimePolicy({
          targetPath,
          trigger: options.trigger || 'user',
          isRecent: options.isRecent === true,
          sourceWindowId: normalizedWindowId,
          openWindow: openDocumentWindow,
          getWindowById,
          getDocumentContext,
          getSessionSnapshot,
        })
      },
      openDocumentInCurrentWindow: (targetPath, options = {}) => {
        if (typeof openDocumentInCurrentWindow !== 'function') {
          return {
            ok: false,
            reason: 'open-document-in-current-window-not-configured',
            path: targetPath || null,
          }
        }

        return openDocumentInCurrentWindow(normalizedWindowId, targetPath, {
          trigger: options.trigger || 'user',
          saveBeforeSwitch: options.saveBeforeSwitch === true,
        })
      },
      getSessionSnapshot: () => getSessionSnapshot(normalizedWindowId),
      ...effectContext,
    })).then(result => normalizeEffectCommandResult(
      normalizedWindowId,
      command,
      payload,
      result,
    ))
  }

  function executeSyncQuery(windowId, command, payload) {
    const normalizedWindowId = isValidWindowId(windowId) ? windowId : null
    if (normalizedWindowId != null && SYNC_QUERY_SET.has(command)) {
      return executeResourceQuery({
        windowId: normalizedWindowId,
        command,
        payload,
      })
    }
    throw new Error(`未知同步查询: ${command}`)
  }

  function publishRecentListChanged(recentList) {
    return windowBridge.publishRecentListChanged?.(recentList) || recentList
  }

  function openDocumentPath(targetPath, options = {}) {
    return executeUiCommand(options.sourceWindowId || null, 'document.open-path', {
      path: targetPath,
      trigger: options.trigger || 'user',
      baseDir: options.baseDir || null,
    })
  }

  function openRecent(targetPath, options = {}) {
    return executeUiCommand(options.sourceWindowId || null, 'document.open-recent', {
      path: targetPath,
      trigger: options.trigger || 'user',
      baseDir: options.baseDir || null,
    })
  }

  runtimeApi = {
    store,
    saveCoordinator,
    commandService,
    effectService,
    fileManagerService,
    directoryWatchService,
    windowBridge,
    resourceService,
    dispatch,
    executeUiCommand,
    executeSyncQuery,
    getSessionSnapshot,
    getDocumentContext,
    publishRecentListChanged,
    openDocumentPath,
    openRecent,
  }

  return runtimeApi
}

export function initializeDocumentSessionRuntime(deps = {}) {
  activeDocumentSessionRuntime = createDocumentSessionRuntime(deps)
  return activeDocumentSessionRuntime
}

export function getDocumentSessionRuntime() {
  if (!activeDocumentSessionRuntime) {
    throw new Error('document session runtime 尚未初始化')
  }
  return activeDocumentSessionRuntime
}

export function resetDocumentSessionRuntime() {
  activeDocumentSessionRuntime = null
}

export default {
  createDocumentSessionRuntime,
  initializeDocumentSessionRuntime,
  getDocumentSessionRuntime,
  normalizeOpenCommandResult,
  openDocumentWindowWithRuntimePolicy,
  resetDocumentSessionRuntime,
}
