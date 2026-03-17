import { createDocumentCommandRunner } from './documentCommandRunner.js'
import { createDocumentCommandService } from './documentCommandService.js'
import { createDocumentEffectService } from './documentEffectService.js'
import { createDocumentSessionStore } from './documentSessionStore.js'
import { createSaveCoordinator } from './saveCoordinator.js'
import { createWindowSessionBridge } from './windowSessionBridge.js'

let activeDocumentSessionRuntime = null

function isValidWindowId(windowId) {
  return (typeof windowId === 'number' && Number.isFinite(windowId))
    || (typeof windowId === 'string' && windowId.trim() !== '')
}

function createDefaultWindowBridge(store) {
  return createWindowSessionBridge({
    store,
    sendToRenderer: () => {},
    resolveWindowById: () => null,
    getAllWindows: () => [],
  })
}

function createDefaultJobIdGenerator() {
  let sequence = 0
  return () => {
    sequence += 1
    return `document-session-job-${sequence}`
  }
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

function getWindowContextId(windowContext) {
  if (isValidWindowId(windowContext?.id)) {
    return windowContext.id
  }
  if (isValidWindowId(windowContext?.win?.id)) {
    return windowContext.win.id
  }
  return null
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

export async function openDocumentWindowWithRuntimePolicy({
  targetPath,
  trigger = 'user',
  isRecent = false,
  sourceWindowId = null,
  openWindow,
  getWindowContext = () => null,
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

  const openedWindowContext = await openWindow(targetPath, {
    isRecent,
    trigger,
  })
  if (openedWindowContext?.ok === false) {
    return openedWindowContext
  }

  const normalizedSourceWindowId = isValidWindowId(sourceWindowId)
    ? sourceWindowId
    : null
  const openedWindowId = getWindowContextId(openedWindowContext)

  if (normalizedSourceWindowId != null
    && openedWindowId != null
    && String(openedWindowId) !== String(normalizedSourceWindowId)
    && isPristineDraftWindow({
      windowId: normalizedSourceWindowId,
      getDocumentContext,
      getSessionSnapshot,
    })) {
    getWindowContext(normalizedSourceWindowId)?.win?.close?.()
  }

  const snapshot = openedWindowId == null
    ? null
    : getSessionSnapshot(openedWindowId)
  const documentContext = openedWindowId == null
    ? null
    : getDocumentContext(openedWindowId)

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
  'document.cancel-close',
  'document.confirm-force-close',
  'document.external.apply',
  'document.external.ignore',
])

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
  const now = deps.now || (() => Date.now())
  const createJobId = deps.createJobId || createDefaultJobIdGenerator()
  const getConfig = deps.getConfig || (() => ({}))
  const store = deps.store || createDocumentSessionStore()
  const saveCoordinator = deps.saveCoordinator || createSaveCoordinator({
    createJobId,
    now,
  })
  const commandService = deps.commandService || createDocumentCommandService({
    store,
    saveCoordinator,
    getConfig,
    now,
  })
  const effectService = deps.effectService || createDocumentEffectService({
    fsModule: deps.fsModule,
    dialogApi: deps.dialogApi,
    recentStore: deps.recentStore,
    getConfig,
  })
  const windowBridge = deps.windowBridge || createDefaultWindowBridge(store)
  const getWindowContext = deps.getWindowContext || (() => null)
  const getDocumentContextByWindowId = deps.getDocumentContext || null
  const openDocumentWindow = deps.openDocumentWindow || null
  const buildRunnerEffectContext = deps.buildRunnerEffectContext || (() => ({}))
  const executeDocumentCommand = deps.executeDocumentCommand || (async ({
    windowId,
    command,
    payload,
    runtime,
  }) => {
    return await runtime.dispatch(windowId, command, payload)
  })
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
  let runtimeApi = null

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

  async function executeUiCommand(windowId, command, payload) {
    const normalizedWindowId = isValidWindowId(windowId) ? windowId : null
    const winInfo = normalizedWindowId == null
      ? null
      : getWindowContext(normalizedWindowId)
    if (normalizedWindowId != null && DOCUMENT_STATE_COMMAND_SET.has(command)) {
      return await executeDocumentCommand({
        windowId: normalizedWindowId,
        command,
        payload,
        runtime: runtimeApi,
        winInfo,
      })
    }

    const result = await effectService.executeCommand({
      command,
      payload,
      winInfo,
      dispatchCommand: (nextCommand, nextPayload) => {
        return executeUiCommand(normalizedWindowId, nextCommand, nextPayload)
      },
      openDocumentWindow: (targetPath, options = {}) => {
        return openDocumentWindowWithRuntimePolicy({
          targetPath,
          trigger: options.trigger || 'user',
          isRecent: options.isRecent === true,
          sourceWindowId: normalizedWindowId,
          openWindow: openDocumentWindow,
          getWindowContext,
          getDocumentContext,
          getSessionSnapshot,
        })
      },
      getSessionSnapshot: () => getSessionSnapshot(normalizedWindowId),
    })
    const normalizedResult = normalizeOpenCommandResult({
      command,
      result,
      targetPath: typeof payload?.path === 'string' ? payload.path : null,
    })

    if (normalizedWindowId != null
      && normalizedResult?.ok === false
      && (normalizedResult.reason === 'open-target-invalid-extension' || normalizedResult.reason === 'open-target-not-file')) {
      publishWindowMessage(normalizedWindowId, {
        type: 'warning',
        content: 'message.onlyMarkdownFilesCanBeOpened',
      })
    }

    return normalizedResult
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
    windowBridge,
    dispatch,
    executeUiCommand,
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
