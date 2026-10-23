import { watch } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, screen, shell, webContents } from 'electron'
import fs from 'fs-extra'
import configUtil from '../../data/configUtil.js'
import recent from '../../data/recent.js'
import tabGroup from '../../data/tabGroup.js'
import { WINDOW_ICON_PATH } from '../appIconUtil.js'
import sendUtil from '../channel/sendUtil.js'
import commonUtil from '../commonUtil.js'
import fileWatchUtil from '../fileWatchUtil.js'
import resourceFileUtil from '../resourceFileUtil.js'
import { resolveLanguagePreference } from '../systemLocaleUtil.js'
import updateUtil from '../updateUtil.js'
import {
  appendMarkdownExtension,
  isMarkdownFilePath,
  MARKDOWN_FILE_EXTENSION_LIST,
  resolveDocumentOpenPath,
  toComparableDocumentPath,
} from './documentOpenTargetUtil.js'
import {
  createBoundFileSession,
  createDraftSession,
  createRecentMissingSession,
} from './documentSessionFactory.js'
import {
  getDocumentSessionRuntime,
} from './documentSessionRuntime.js'
import { deriveDocumentSnapshot } from './documentSnapshotUtil.js'
import { createExternalWatchBridge } from './externalWatchBridge.js'
import { resolveNextActiveSessionId } from './tabCloseMathUtil.js'
import { createWindowHostStateStore } from './windowHostStateStore.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MISSING_PATH_REASON = {
  OPEN_TARGET_MISSING: 'open-target-missing',
}

const OPEN_CURRENT_WINDOW_SWITCH_POLICY_SET = new Set([
  'direct-switch',
  'save-before-switch',
  'discard-switch',
])

const REQUIRED_WINDOW_REGISTRY_METHODS = [
  'registerWindow',
  'unregisterWindow',
  'bindSession',
  'getSessionIdByWindowId',
  'getWindowById',
  'getAllWindows',
]

let activeWindowRegistry = null
const hostStateStore = createWindowHostStateStore()
const windowLifecycleService = {}
// 最近一次获得焦点的编辑窗口。
// 系统级“双击文件 / 第二实例”没有发起窗口，只能靠这个记录决定该把新标签开在哪个窗口里；
// 进程重启或窗口全部关闭后自然失效，读取时会再校验存活。
let lastActiveEditorWindowId = null

function assertWindowRegistryContract(registry) {
  if (!registry || typeof registry !== 'object') {
    throw new TypeError('windowLifecycleService.configure 需要有效的 windowRegistry')
  }

  const missingMethod = REQUIRED_WINDOW_REGISTRY_METHODS.find((methodName) => {
    return typeof registry[methodName] !== 'function'
  })
  if (missingMethod) {
    throw new TypeError(`windowRegistry 缺少必要方法: ${missingMethod}`)
  }
}

export function configureWindowLifecycleService({ registry } = {}) {
  assertWindowRegistryContract(registry)

  if (activeWindowRegistry && activeWindowRegistry !== registry) {
    throw new Error('windowLifecycleService 已绑定其他 windowRegistry，不能静默切换')
  }

  activeWindowRegistry = registry
  return windowLifecycleService
}

function getWindowRegistry() {
  if (!activeWindowRegistry) {
    throw new Error('windowLifecycleService 尚未配置 windowRegistry')
  }
  return activeWindowRegistry
}

function getOptionalWindowRegistry() {
  return activeWindowRegistry
}

function normalizeWindowId(windowId) {
  if (typeof windowId === 'number' && Number.isFinite(windowId)) {
    return String(windowId)
  }

  if (typeof windowId === 'string' && windowId.trim() !== '') {
    return windowId.trim()
  }

  return null
}

function getRegistrySessionId(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  return getOptionalWindowRegistry()?.getSessionIdByWindowId?.(normalizedWindowId) || null
}

function getRegistryWindow(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  return getOptionalWindowRegistry()?.getWindowById?.(normalizedWindowId) || null
}

function getHostWindowState(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  return hostStateStore.getWindowState(normalizedWindowId)
}

// 启动恢复时被跳过的路径：窗口级的一次性提示数据，随窗口生命周期存在。
// 不走快照也不走推送：窗口创建时就写进来，渲染层挂载后主动消费一次。
const startupSkippedPathListByWindowId = new Map()

/**
 * 读取并清空窗口的“启动跳过列表”。
 *
 * 语义是一次性消费：渲染层启动后主动拉一次，拿到就清掉，
 * 后续再拉（组件重挂载、页面刷新）都不会重复弹窗。
 */
function consumeStartupSkippedPathList(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return []
  }

  const pathList = startupSkippedPathListByWindowId.get(normalizedWindowId) || []
  startupSkippedPathListByWindowId.delete(normalizedWindowId)
  return [...pathList]
}

function setStartupSkippedPathList(windowId, pathList) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return
  }

  const normalizedPathList = Array.isArray(pathList)
    ? pathList.filter(item => typeof item === 'string' && item !== '')
    : []
  if (normalizedPathList.length === 0) {
    startupSkippedPathListByWindowId.delete(normalizedWindowId)
    return
  }

  startupSkippedPathListByWindowId.set(normalizedWindowId, normalizedPathList)
}

function updateHostWindowState(windowId, updater) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  return hostStateStore.updateWindowState(normalizedWindowId, updater)
}

function getRegisteredWindowIdList() {
  const registry = getOptionalWindowRegistry()
  if (!registry) {
    return []
  }

  return hostStateStore.getAllWindowStates()
    .map(windowState => normalizeWindowId(windowState.windowId))
    .filter(windowId => windowId && registry.getWindowById?.(windowId))
}

function findRegisteredWindowIdByWin(win) {
  if (!win) {
    return null
  }

  const registry = getOptionalWindowRegistry()
  if (!registry) {
    return null
  }

  const windowState = hostStateStore.findWindowStateByWin(win)
  if (windowState && registry.getWindowById?.(windowState.windowId) === win) {
    return normalizeWindowId(windowState.windowId)
  }

  return null
}

function findRegisteredWindowIdBySessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    return null
  }

  return getRegisteredWindowIdList().find((windowId) => {
    return getRegistrySessionId(windowId) === sessionId
  }) || null
}

function getWindowById(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  return getOptionalWindowRegistry()?.getWindowById?.(normalizedWindowId) || null
}

function getWindowIdByWin(win) {
  return findRegisteredWindowIdByWin(win)
}

function getWindowIdByWebContentsId(webContentsId) {
  const win = (getOptionalWindowRegistry()?.getAllWindows?.() || []).find(item => item?.webContents?.id === webContentsId) || null
  return win ? findRegisteredWindowIdByWin(win) : null
}

function getParentWindowIdByWebContentsId(webContentsId) {
  if (!Number.isInteger(webContentsId)) {
    return null
  }

  const requestWebContents = webContents.fromId(webContentsId)
  if (!requestWebContents) {
    return null
  }

  const parentWindow = BrowserWindow.fromWebContents(requestWebContents)?.getParentWindow?.()
  return parentWindow ? getWindowIdByWin(parentWindow) : null
}

function listWindows() {
  return getOptionalWindowRegistry()?.getAllWindows?.() || []
}

function buildRuntimeHostDeps() {
  return {
    getWindowById: windowId => getWindowById(windowId),
    getDocumentContext: windowId => getDocumentContext(windowId),
    resolveOpenExistingTab: (targetPath, currentWindowId) => resolveOpenExistingTab(targetPath, currentWindowId),
    focusWindowById: windowId => focusWindow(windowId),
    buildRunnerEffectContext: ({ windowId, dispatchCommand }) => {
      if (!getWindowById(windowId)) {
        return {}
      }
      return buildEffectContextForWindow(windowId, {
        dispatchCommand,
      })
    },
    executeDocumentCommand: ({
      windowId,
      command,
      payload,
      runtime,
    }) => {
      if (!getWindowById(windowId)) {
        return null
      }

      const dispatch = createRuntimeDispatchAdapter(windowId, runtime)

      switch (command) {
        case 'document.save':
          return executeDocumentSaveCommandWithDispatcher(windowId, dispatch)

        case 'document.save-and-close':
          return dispatch(command, payload)

        case 'document.save-copy':
          return executeDocumentCopySaveCommandWithDispatcher(windowId, dispatch)

        case 'document.external.apply':
        case 'document.external.ignore':
          return executeExternalResolutionCommandWithDispatcher(
            windowId,
            command,
            payload || {},
            dispatch,
          ).then(result => result.commandResult)

        case 'document.edit':
          // route leave 需要把 document.edit 当成“session 已经推进到最终正文”的可等待屏障，
          // 因此这里必须等待真实 dispatch 完成，并把最新快照直接返回给调用方。
          return updateTempContentWithDispatcher(windowId, payload?.content, dispatch)

        case 'document.request-close':
          // BrowserWindow close 事件需要先拿到结构化 effects，再决定 preventDefault 与执行时机；
          // 因此这里不能像普通 UI 命令那样直接跑完整 effect 链。
          return dispatchCommandStateOnly(windowId, command, payload)

        case 'document.cancel-close':
          return dispatch(command, payload)

        case 'document.confirm-force-close':
          // 旧 force-close 宿主入口会先打 host flag 再触发原生 close；
          // 此时 close 事件仍需保留既有 preventDefault / finalize 语义，先只推进状态不落地 effect。
          if (isForceCloseRequested(windowId)) {
            return dispatchCommandStateOnly(windowId, command, payload)
          }
          return dispatch(command, payload)

        case 'document.reorder-tabs':
          // 标签顺序本身是持久化对象，重排后必须同步 tab-group.json，
          // 否则重启恢复会回到旧顺序。
          return dispatch(command, payload).then(async (result) => {
            await persistCurrentTabGroup(windowId)
            return result
          })

        default:
          return dispatch(command, payload)
      }
    },
    openDocumentWindow: async (targetPath, options = {}) => {
      return await createNew(targetPath, options.isRecent === true)
    },
    prepareOpenPathInCurrentWindow: async (windowId, targetPath, options = {}) => {
      return await prepareOpenPathInCurrentWindow(windowId, targetPath, options)
    },
    openDocumentInCurrentWindow: async (windowId, targetPath, options = {}) => {
      return await openDocumentInCurrentWindow(windowId, targetPath, options)
    },
    openDocumentTabInWindow: async (windowId, targetPath, options = {}) => {
      return await openDocumentTabInWindow(windowId, targetPath, options)
    },
    getTargetEditorWindowId: () => resolveTargetEditorWindowId(),
  }
}

export function getDocumentSessionRuntimeHostDeps() {
  getWindowRegistry()
  return buildRuntimeHostDeps()
}

function ensureSessionRuntimeInitialized() {
  return getDocumentSessionRuntime()
}

function deleteEditorWin(id) {
  const normalizedWindowId = normalizeWindowId(id)
  if (!normalizedWindowId) {
    return false
  }

  const registeredWin = getRegistryWindow(normalizedWindowId)
  const hostState = hostStateStore.getWindowState(normalizedWindowId)
  if (!registeredWin && !hostState) {
    return false
  }

  getWindowRegistry().unregisterWindow?.(normalizedWindowId)
  hostStateStore.unregisterWindowState(normalizedWindowId)
  startupSkippedPathListByWindowId.delete(normalizedWindowId)
  return true
}

function checkWinList() {
  if ((getOptionalWindowRegistry()?.getAllWindows?.() || []).length === 0) {
    app.exit()
  }
}

/**
 * 把“可能没传 sessionId”的调用收敛成具体会话 id。
 *
 * 多标签下外部监听必须按会话隔离，所以每个监听入口都需要明确自己服务于哪个会话；
 * 不传时一律回退到窗口当前活动会话，保持既有调用点语义不变。
 */
function resolveWatchSessionId(windowId, sessionId) {
  if (typeof sessionId === 'string' && sessionId.trim() !== '') {
    return sessionId.trim()
  }
  return getSessionByWindowId(windowId)?.sessionId || null
}

function getExternalWatchState(windowId, sessionId) {
  const resolvedSessionId = resolveWatchSessionId(windowId, sessionId)
  if (!resolvedSessionId) {
    return null
  }
  return getHostWindowState(windowId)?.externalWatchMap?.get(resolvedSessionId) || null
}

function ensureExternalWatchState(windowId, sessionId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const resolvedSessionId = resolveWatchSessionId(normalizedWindowId, sessionId)
  if (!normalizedWindowId || !resolvedSessionId) {
    return null
  }

  const windowState = getHostWindowState(normalizedWindowId)
  if (!windowState) {
    return null
  }

  if (!windowState.externalWatchMap) {
    windowState.externalWatchMap = new Map()
  }

  let watchState = windowState.externalWatchMap.get(resolvedSessionId)
  if (!watchState) {
    watchState = createExternalWatchState()
    windowState.externalWatchMap.set(resolvedSessionId, watchState)
  }

  return watchState
}

function isAllowImmediateClose(windowId) {
  return getHostWindowState(windowId)?.allowImmediateClose === true
}

function setAllowImmediateClose(windowId, allowImmediateClose) {
  updateHostWindowState(windowId, (windowState) => {
    windowState.allowImmediateClose = allowImmediateClose === true
  })
}

function isForceCloseRequested(windowId) {
  return getHostWindowState(windowId)?.forceClose === true
}

function setForceCloseRequested(windowId, forceClose) {
  updateHostWindowState(windowId, (windowState) => {
    windowState.forceClose = forceClose === true
  })
}

function getClosedManualRequestCompletions(windowId) {
  const completionList = getHostWindowState(windowId)?.lastClosedManualRequestCompletions
  return Array.isArray(completionList) ? [...completionList] : []
}

function setClosedManualRequestCompletions(windowId, completionList) {
  updateHostWindowState(windowId, (windowState) => {
    windowState.lastClosedManualRequestCompletions = Array.isArray(completionList)
      ? [...completionList]
      : []
  })
}

function isWindowAlive(win) {
  return Boolean(win) && (typeof win.isDestroyed !== 'function' || win.isDestroyed() === false)
}

function createExternalWatchState() {
  return fileWatchUtil.createWatchState()
}

function getExternalWatchBridge(windowId, sessionId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  const windowState = getHostWindowState(normalizedWindowId)
  if (!windowState) {
    return null
  }

  const resolvedSessionId = resolveWatchSessionId(normalizedWindowId, sessionId)
  if (!resolvedSessionId) {
    return null
  }

  if (!windowState.externalWatchBridgeMap) {
    windowState.externalWatchBridgeMap = new Map()
  }

  const cachedBridge = windowState.externalWatchBridgeMap.get(resolvedSessionId)
  if (cachedBridge) {
    return cachedBridge
  }

  const externalWatchState = ensureExternalWatchState(normalizedWindowId, resolvedSessionId)
  if (!externalWatchState) {
    return null
  }

  const externalWatchBridge = createExternalWatchBridge({
    watch,
    watchState: externalWatchState,
    dispatchCommand: (command, payload, options = {}) => {
      // 监听事件必须定向回它自己的会话：
      // 后台标签的外部变更不能打到窗口当前活动标签上。
      return dispatchCommand(normalizedWindowId, command, payload, {
        ...options,
        sessionId: options.sessionId || resolvedSessionId,
      })
    },
    getCurrentBindingToken: () => getCurrentWatchBindingToken(normalizedWindowId, resolvedSessionId),
    getCurrentObservedFloor: () => getCurrentWatchObservedFloor(normalizedWindowId, resolvedSessionId),
  })
  windowState.externalWatchBridgeMap.set(resolvedSessionId, externalWatchBridge)
  return externalWatchBridge
}

function peekExternalWatchBridge(windowId, sessionId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const resolvedSessionId = resolveWatchSessionId(normalizedWindowId, sessionId)
  if (!normalizedWindowId || !resolvedSessionId) {
    return null
  }
  return getHostWindowState(normalizedWindowId)?.externalWatchBridgeMap?.get(resolvedSessionId) || null
}

function getSessionByWindowId(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  const { store } = ensureSessionRuntimeInitialized()
  const sessionId = getRegistrySessionId(normalizedWindowId)
  return (sessionId ? store.getSession(sessionId) : null)
    || store.getSessionByWindowId(normalizedWindowId)
}

function publishSnapshotChanged(windowId, snapshot) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }
  const { windowBridge } = ensureSessionRuntimeInitialized()
  return windowBridge.publishSnapshotChanged({
    windowId: normalizedWindowId,
    snapshot,
  })
}

function publishWindowMessage(windowId, data) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId || !data) {
    return null
  }
  const { windowBridge } = ensureSessionRuntimeInitialized()
  return windowBridge.publishMessage({
    windowId: normalizedWindowId,
    data,
  })
}

function publishFullScreenChanged(win, isFullScreen) {
  if (!isWindowAlive(win)) {
    return null
  }

  return sendUtil.send(win, {
    event: 'full-screen-changed',
    data: isFullScreen === true,
  })
}

function publishWindowSizeChanged(win, isMaximize) {
  if (!isWindowAlive(win)) {
    return null
  }

  return sendUtil.send(win, {
    event: 'window-size',
    data: {
      isMaximize: isMaximize === true,
    },
  })
}

function publishAlwaysOnTopChanged(win, isAlwaysOnTop) {
  if (!isWindowAlive(win)) {
    return null
  }

  return sendUtil.send(win, {
    event: 'always-on-top-changed',
    data: isAlwaysOnTop === true,
  })
}

/**
 * renderer 重载后会丢失本地 store，需要由宿主重新回灌当前窗口状态。
 */
function publishHostWindowState(win) {
  if (!isWindowAlive(win)) {
    return null
  }

  publishFullScreenChanged(win, win.isFullScreen?.() === true)
  publishWindowSizeChanged(win, win.isMaximized?.() === true)
  publishAlwaysOnTopChanged(win, win.isAlwaysOnTop?.() === true)
  return true
}

function publishHostWindowStateByWindowId(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  return publishHostWindowState(getWindowById(normalizedWindowId))
}

function getSnapshotSignature(snapshot) {
  return JSON.stringify(snapshot || null)
}

function syncWindowStateFromSession(windowId, session) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId || !session) {
    return
  }

  updateHostWindowState(normalizedWindowId, (windowState) => {
    windowState.forceClose = session.closeRuntime.forceClose === true
  })
}

function createInitialSession({
  sessionId,
  filePath,
  exists,
  content,
  isRecent,
}) {
  if (exists) {
    return createBoundFileSession({
      sessionId,
      path: filePath,
      content,
      stat: null,
    })
  }

  if (filePath && isRecent) {
    return createRecentMissingSession({
      sessionId,
      missingPath: filePath,
    })
  }

  const draftSession = createDraftSession({
    sessionId,
  })

  if (filePath) {
    draftSession.documentSource.missingPath = filePath
    draftSession.documentSource.missingReason = MISSING_PATH_REASON.OPEN_TARGET_MISSING
  }

  return draftSession
}

function registerSessionForWindow(windowId, session) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return
  }
  const { store } = ensureSessionRuntimeInitialized()
  store.createSession(session)
  bindSessionForWindow(normalizedWindowId, session)
}

function bindSessionForWindow(windowId, session) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId || !session?.sessionId) {
    return
  }

  const { store } = ensureSessionRuntimeInitialized()
  store.bindWindowToSession({
    windowId: normalizedWindowId,
    sessionId: session.sessionId,
  })
  getWindowRegistry().bindSession?.({
    windowId: normalizedWindowId,
    sessionId: session.sessionId,
  })
  syncWindowStateFromSession(normalizedWindowId, session)
  publishSnapshotChanged(normalizedWindowId)
}

function getDirectoryWatchService() {
  return ensureSessionRuntimeInitialized().directoryWatchService || null
}

async function stopDirectoryWatch(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return true
  }

  const directoryWatchService = getDirectoryWatchService()
  if (typeof directoryWatchService?.clearWindowDirectory === 'function') {
    return await directoryWatchService.clearWindowDirectory(normalizedWindowId)
  }
  if (typeof directoryWatchService?.stopWindowDirectory === 'function') {
    return await directoryWatchService.stopWindowDirectory(normalizedWindowId)
  }
  return true
}

function normalizeDirectoryWatchRebindResult(result) {
  if (!result) {
    return result
  }

  if (result.ok === true || result.ok === false) {
    return result
  }

  return {
    ok: true,
    directoryState: result,
    directoryPath: result.directoryPath || null,
    activePath: result.activePath || null,
  }
}

function isDirectoryWatchRebindMatched(result) {
  const directoryState = result?.directoryState || null
  if (!directoryState) {
    return true
  }

  return (result?.directoryPath || null) === (directoryState.directoryPath || null)
    && (result?.activePath || null) === (directoryState.activePath || null)
}

function createDirectoryWatchRebindFailureResult({
  directoryState = null,
  bindingResult = null,
  error = null,
} = {}) {
  return {
    ok: false,
    reason: 'directory-watch-rebind-failed',
    directoryState,
    directoryPath: bindingResult?.directoryPath || null,
    activePath: bindingResult?.activePath || null,
    error: bindingResult?.error || error || null,
  }
}

async function rebindDirectoryWatchForSession(windowId, session) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId || !session) {
    return null
  }

  const runtime = ensureSessionRuntimeInitialized()
  const directoryWatchService = runtime.directoryWatchService || null
  if (!directoryWatchService) {
    return null
  }

  let rebindResult = null
  if (typeof directoryWatchService.rebindWindowDirectoryFromSession === 'function') {
    rebindResult = normalizeDirectoryWatchRebindResult(
      await directoryWatchService.rebindWindowDirectoryFromSession(normalizedWindowId, session),
    )
  } else if (typeof runtime.fileManagerService?.resolveDirectoryStateFromSession === 'function') {
    const directoryState = await runtime.fileManagerService.resolveDirectoryStateFromSession(session)
    if (!directoryState?.directoryPath) {
      await stopDirectoryWatch(normalizedWindowId)
      rebindResult = {
        ok: true,
        directoryState,
        directoryPath: null,
        activePath: null,
      }
    } else {
      const bindingResult = await directoryWatchService.rebindWindowDirectory?.(normalizedWindowId, directoryState.directoryPath, {
        activePath: directoryState.activePath,
      })
      rebindResult = (bindingResult?.ok === true && isDirectoryWatchRebindMatched({
        ...bindingResult,
        directoryState,
      }))
        ? {
            ok: true,
            directoryState,
            directoryPath: bindingResult.directoryPath || null,
            activePath: bindingResult.activePath || null,
          }
        : createDirectoryWatchRebindFailureResult({
            directoryState,
            bindingResult,
          })
    }
  }

  if (!rebindResult) {
    return null
  }

  if (rebindResult.ok !== true || !isDirectoryWatchRebindMatched(rebindResult)) {
    return createDirectoryWatchRebindFailureResult({
      directoryState: rebindResult.directoryState || null,
      bindingResult: rebindResult,
      error: rebindResult.error || null,
    })
  }

  if (rebindResult.directoryState) {
    runtime.windowBridge.publishFileManagerDirectoryChanged?.({
      windowId: normalizedWindowId,
      directoryState: rebindResult.directoryState,
    })
  }

  return rebindResult
}

function stopExternalWatch(windowId, sessionId = null) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return true
  }

  if (sessionId) {
    return peekExternalWatchBridge(normalizedWindowId, sessionId)?.stop?.() ?? true
  }

  // 不指定会话时停掉该窗口的全部监听（关窗、回滚等场景）。
  const bridgeMap = getHostWindowState(normalizedWindowId)?.externalWatchBridgeMap
  if (!bridgeMap) {
    return true
  }

  let stopped = true
  for (const bridge of bridgeMap.values()) {
    try {
      stopped = (bridge?.stop?.() ?? true) && stopped
    }
    catch {
      stopped = false
    }
  }
  return stopped
}

function getCurrentWatchBindingToken(windowId, sessionId) {
  const resolvedSessionId = resolveWatchSessionId(windowId, sessionId)
  const session = resolvedSessionId
    ? ensureSessionRuntimeInitialized().store.getSession(resolvedSessionId)
    : null
  return Number.isFinite(session?.watchRuntime?.bindingToken)
    ? session.watchRuntime.bindingToken
    : null
}

function getCurrentWatchObservedFloor(windowId, sessionId) {
  const resolvedSessionId = resolveWatchSessionId(windowId, sessionId)
  const session = resolvedSessionId
    ? ensureSessionRuntimeInitialized().store.getSession(resolvedSessionId)
    : null
  return Number.isFinite(session?.watchRuntime?.eventFloorObservedAt)
    ? session.watchRuntime.eventFloorObservedAt
    : 0
}

/**
 * 启动某个会话的外部文件监听。
 *
 * 第二个参数既可以是会话 id，也可以是 options：
 * 单会话时代的 `startExternalWatch(windowId, options)` 调用点保持原语义，
 * 多标签新增的调用点直接传会话 id。
 */
function startExternalWatch(windowId, sessionIdOrOptions = null, options = {}) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const isSessionIdArgument = typeof sessionIdOrOptions === 'string' && sessionIdOrOptions.trim() !== ''
  const resolvedSessionId = isSessionIdArgument
    ? sessionIdOrOptions.trim()
    : resolveWatchSessionId(normalizedWindowId, null)
  const startOptions = isSessionIdArgument
    ? options
    : (sessionIdOrOptions || {})

  const session = resolvedSessionId
    ? ensureSessionRuntimeInitialized().store.getSession(resolvedSessionId)
    : null
  const requestedPath = typeof startOptions?.watchingPath === 'string' && startOptions.watchingPath.trim() !== ''
    ? startOptions.watchingPath
    : session?.watchRuntime?.watchingPath || session?.documentSource?.path || null
  return getExternalWatchBridge(normalizedWindowId, resolvedSessionId)?.start?.({
    ...startOptions,
    watchingPath: requestedPath,
  }) || {
    ok: false,
    watchingPath: null,
    watchingDirectoryPath: null,
    error: new Error('watch bridge missing'),
  }
}

function finalizeWindowClose(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return
  }

  // 关窗时把该窗口的标签组写盘：
  // 重启恢复的应该是“最后关闭的窗口”，而不是“最后一次操作标签的窗口”。
  // 必须在销毁会话 / 注销窗口之前，否则拿不到完整标签列表；
  // 必须同步写，checkWinList() 可能立刻 app.exit()，异步写盘会被截断。
  persistCurrentTabGroupSync(normalizedWindowId)

  const closingSession = getSessionByWindowId(normalizedWindowId)
  setClosedManualRequestCompletions(
    normalizedWindowId,
    Array.isArray(closingSession?.saveRuntime?.completedManualRequests)
      ? closingSession.saveRuntime.completedManualRequests
      : [],
  )
  void stopDirectoryWatch(normalizedWindowId)
  stopExternalWatch(normalizedWindowId)

  // 关窗要销毁该窗口的**全部**会话，不能只销毁活动会话。
  //
  // 多标签下 `getSessionByWindowId` 只返回活动会话，其余标签会残留在
  // `sessionMap` / `sessionWindowMap` 里。之后打开同一个文件时，
  // `findOpenDocumentTab` 会命中残留会话并把打开请求当成“已打开”，
  // 尝试聚焦一个已经不存在的窗口：用户看到的是“打开文件没任何反应”，
  // 而且假聚焦会顺手把已关闭窗口的标签组写回 tab-group.json。
  //
  // 先拷贝列表再逐个销毁：`destroySession` 会改写窗口的 sessionIds。
  const { store } = ensureSessionRuntimeInitialized()
  const windowSessionIds = [...(store.getSessionIdsByWindowId?.(normalizedWindowId) || [])]
  for (const sessionId of windowSessionIds) {
    store.destroySession(sessionId)
  }

  deleteEditorWin(normalizedWindowId)
  checkWinList()
}

async function refreshRecentOrderBeforeClose(windowId) {
  const documentPath = getSessionByWindowId(windowId)?.documentSource?.path || null
  if (!documentPath) {
    return false
  }

  try {
    await recent.add(documentPath)
    return true
  } catch {
    // recent 只是关闭链路的附属持久化，失败时不能阻塞真实关窗。
    return false
  }
}

async function refreshRecentOrderAfterOpen(documentPath) {
  if (!documentPath) {
    return false
  }

  try {
    await recent.add(documentPath)
    return true
  } catch {
    // recent 只是打开成功后的附属持久化，失败时不能回滚真实开窗。
    return false
  }
}

/**
 * 把窗口当前标签组整理成待持久化结构。
 *
 * 只记有磁盘路径的标签：草稿没有路径，重启后无法恢复成“同一个文档”，
 * 强行记一个空路径只会让恢复逻辑多一个分支。
 */
function buildTabGroupPayload(windowId) {
  const { store } = ensureSessionRuntimeInitialized()
  const sessionIds = store.getSessionIdsByWindowId?.(windowId) || []
  const activeSessionId = store.getActiveSessionIdByWindowId?.(windowId) || null

  const tabPathList = []
  let activeIndex = 0
  for (const sessionId of sessionIds) {
    const session = store.getSession(sessionId)
    const documentPath = session?.documentSource?.path || null
    if (!documentPath) {
      continue
    }
    if (sessionId === activeSessionId) {
      activeIndex = tabPathList.length
    }
    tabPathList.push(documentPath)
  }

  return {
    tabs: tabPathList,
    activeIndex,
  }
}

/**
 * 把窗口当前的标签组写盘。
 */
async function persistCurrentTabGroup(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  return await tabGroup.save(buildTabGroupPayload(normalizedWindowId))
}

/**
 * 关窗链路的同步版本。
 *
 * 最后一个窗口关闭时 `checkWinList()` 会立刻 `app.exit()`，
 * 异步写盘会被进程退出截断，所以关窗必须同步落盘。
 */
function persistCurrentTabGroupSync(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  return tabGroup.saveSync(buildTabGroupPayload(normalizedWindowId))
}

/**
 * 启动时按上次的标签组恢复窗口。
 *
 * 统一排除策略：缺失路径跳过并提示，读取失败路径只记日志、不提示。
 * 第一个路径不再特殊保留成 recent-missing 标签；第一个“真的能打开”的路径负责开窗，
 * 其余按原始顺序挂成标签。
 *
 * 跳过列表必须在**开窗之前**确定：它随窗口创建写进窗口状态，
 * 渲染层挂载后主动消费一次就能拿到，不依赖任何推送。
 * 因此这里先扫描 `pathExists`，再建窗口；读取失败的路径在恢复过程中才暴露，
 * 属于权限/占用类极低概率场景，只记日志、不进跳过提示。
 *
 * 恢复完后按 `activeIndex` 把活动标签落回上次的位置：
 * 它记的是「有路径标签列表」里的下标，而缺失文件会被跳过，
 * 所以必须按「原始下标 → 实际恢复的 sessionId」映射，不能直接当数组下标用。
 *
 * 返回值统一为结构化结果：
 * - 成功：`{ ok: true, windowId, requestedTabCount, restoredTabCount, activeSessionId, skippedPathList }`
 * - 失败：透传 `createNew` 的结构化失败结果，或兜底 `{ ok: false, reason: 'window-create-failed' }`
 *
 * 不返回裸 windowId：`createNew` 自身在失败时返回的是结构化对象，
 * 混合类型会让调用方把失败结果当成窗口 id 继续传下去。
 */
async function restoreTabGroup(pathList, activeIndex = 0) {
  const candidatePathList = Array.isArray(pathList)
    ? pathList.filter(item => typeof item === 'string' && item.trim() !== '')
    : []

  // 第一轮只做存在性扫描：跳过列表必须在建窗口前完整确定。
  // 保留原始下标，activeIndex 映射仍然按上次的标签顺序算。
  const existingEntryList = []
  const skippedPathList = []
  for (let i = 0; i < candidatePathList.length; i++) {
    const targetPath = candidatePathList[i]
    if (await fs.pathExists(targetPath)) {
      existingEntryList.push({ index: i, path: targetPath })
    }
    else {
      skippedPathList.push(targetPath)
    }
  }

  // 第二个循环才建窗口：第一个能读出来的路径负责开窗，
  // 跳过列表随窗口创建一并写入窗口状态。
  let windowId = null
  let openedEntry = null
  let openedPosition = -1
  for (let i = 0; i < existingEntryList.length; i++) {
    const entry = existingEntryList[i]
    // 恢复路径只接受能读出来的文件：isRecent 固定为 false，
    // 缺失路径已在扫描阶段排除，这里不会再产生 recent-missing 会话。
    const createResult = await createNew(entry.path, false, {
      startupSkippedPathList: skippedPathList,
    })
    const createdWindowId = typeof createResult === 'string' && createResult !== '' ? createResult : null
    if (!createdWindowId) {
      // 只有“目标文件读失败”可以降级为跳过；
      // 窗口壳创建失败属于应用级故障，继续试下一个路径没有意义，直接透传。
      if (createResult?.reason === 'open-target-read-failed') {
        console.warn('[startup] 标签文件读取失败，已跳过:', entry.path)
        continue
      }
      return createResult?.ok === false
        ? createResult
        : { ok: false, reason: 'window-create-failed', path: entry.path }
    }

    windowId = createdWindowId
    openedEntry = entry
    openedPosition = i
    break
  }

  // 一个都没能恢复：开空草稿窗口，跳过列表照样带进窗口状态。
  // 这里刻意不写 tab-group.json，让原标签组留到下次启动再试一次，
  // 避免一次误判就把用户的标签组清空。
  if (!windowId) {
    const createResult = await createNew(null, false, {
      startupSkippedPathList: skippedPathList,
    })
    const emptyWindowId = typeof createResult === 'string' && createResult !== '' ? createResult : null
    if (!emptyWindowId) {
      return createResult?.ok === false
        ? createResult
        : { ok: false, reason: 'window-create-failed', path: null }
    }

    return {
      ok: true,
      windowId: emptyWindowId,
      requestedTabCount: candidatePathList.length,
      restoredTabCount: 0,
      activeSessionId: null,
      skippedPathList,
    }
  }

  const restoredIndexList = []
  const restoredSessionIdList = []

  const firstSession = getSessionByWindowId(windowId)
  if (firstSession?.sessionId) {
    restoredIndexList.push(openedEntry.index)
    restoredSessionIdList.push(firstSession.sessionId)
  }

  // openedPosition 之前的路径已经全部扫过，这里从它之后按原始顺序继续挂标签，
  // 标签顺序与上次保持一致。
  for (let i = openedPosition + 1; i < existingEntryList.length; i++) {
    const entry = existingEntryList[i]
    try {
      const content = await fs.readFile(entry.path, 'utf-8')
      const switchResult = await switchSessionInCurrentWindow(windowId, {
        documentPath: entry.path,
        content,
        trigger: 'startup',
      })
      const restoredSessionId = switchResult?.snapshot?.sessionId || null
      if (switchResult?.ok === true && restoredSessionId) {
        restoredIndexList.push(entry.index)
        restoredSessionIdList.push(restoredSessionId)
      }
      else {
        console.warn('[startup] 标签恢复失败，已跳过:', entry.path)
      }
    }
    catch {
      // 单个标签恢复失败不能影响其他标签。
      console.warn('[startup] 标签文件读取失败，已跳过:', entry.path)
    }
  }

  const normalizedActiveIndex = Number.isInteger(activeIndex) && activeIndex >= 0
    ? activeIndex
    : 0
  const targetPosition = restoredIndexList.indexOf(normalizedActiveIndex)
  const targetSessionId = targetPosition >= 0
    ? restoredSessionIdList[targetPosition]
    // 目标标签缺失时回退到最后一个成功恢复的标签（与旧行为一致）
    : restoredSessionIdList[restoredSessionIdList.length - 1]

  const { store } = ensureSessionRuntimeInitialized()
  if (targetSessionId && store.getActiveSessionIdByWindowId?.(windowId) !== targetSessionId) {
    await activateTabInWindow(windowId, targetSessionId)
  }

  return {
    ok: true,
    windowId,
    requestedTabCount: candidatePathList.length,
    restoredTabCount: restoredSessionIdList.length,
    activeSessionId: targetSessionId || null,
    skippedPathList,
  }
}

function createOpenTargetReadFailedResult(documentPath) {
  return {
    ok: false,
    reason: 'open-target-read-failed',
    path: documentPath || null,
  }
}

function createWindowShellLoadFailedResult(documentPath) {
  return {
    ok: false,
    reason: 'window-shell-load-failed',
    path: documentPath || null,
  }
}

function isDevRendererMode() {
  return Boolean(process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev')
}

function getWindowShellLoadFailureContent(documentPath) {
  const language = resolveLanguagePreference(configUtil.getConfig().language, app?.getLocale?.())
  const isDevMode = isDevRendererMode()

  if (language === 'en-US') {
    return {
      title: 'Failed to load editor window',
      body: documentPath
        ? `${isDevMode
          ? 'Unable to load the editor window. Please make sure the local dev server is running.'
          : 'Unable to load the editor window. Please verify the application files are complete.'}\nTarget file: ${documentPath}`
        : (isDevMode
            ? 'Unable to load the editor window. Please make sure the local dev server is running.'
            : 'Unable to load the editor window. Please verify the application files are complete.'),
    }
  }

  return {
    title: '编辑器界面加载失败',
    body: documentPath
      ? `${isDevMode
        ? '无法加载编辑器界面，请检查本地开发服务器是否已启动。'
        : '无法加载编辑器界面，请检查应用安装文件是否完整。'}\n目标文件：${documentPath}`
      : (isDevMode
          ? '无法加载编辑器界面，请检查本地开发服务器是否已启动。'
          : '无法加载编辑器界面，请检查应用安装文件是否完整。'),
  }
}

function showWindowShellLoadFailureDialog(documentPath) {
  const content = getWindowShellLoadFailureContent(documentPath)
  try {
    dialog.showErrorBox(content.title, content.body)
  } catch {
    // 原生错误框失败时不能再继续抛错，避免把真正的加载失败原因掩盖掉。
  }
}

async function loadWindowShellContent(win) {
  // 主进程不再按配置选择启动路由，一律打开编辑页，由渲染层按 startView 决定三态视图
  const hash = 'editor'

  if (isDevRendererMode()) {
    await win.loadURL(`http://localhost:8080/#/${hash}`)
    win.webContents.openDevTools({ mode: 'undocked' })
    return
  }

  await win.loadFile(path.resolve(__dirname, '../../../web-dist/index.html'), { hash })
}

function createObservedAtSequence(windowId) {
  let nextObservedAt = (getCurrentWatchObservedFloor(windowId) || 0) + 1

  return () => {
    const observedAt = nextObservedAt
    nextObservedAt += 1
    return observedAt
  }
}

function isSessionAlreadyMissing(session) {
  if (!session) {
    return false
  }

  return session.documentSource?.exists === false
    && session.diskSnapshot?.exists === false
}

async function reconcileOpenedDocumentAgainstDisk(windowId, documentPath) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId || !documentPath) {
    return false
  }

  const bindingToken = getCurrentWatchBindingToken(normalizedWindowId)
  if (!Number.isFinite(bindingToken)) {
    return false
  }

  const nextObservedAt = createObservedAtSequence(normalizedWindowId)
  const watchingPath = documentPath
  const dispatchWatchCommand = async (command, payload = {}, options = {}) => {
    return await dispatchCommand(normalizedWindowId, command, {
      bindingToken,
      watchingPath,
      ...payload,
    }, {
      publishSnapshotChanged: 'if-changed',
      ...options,
    })
  }

  const dispatchMissingIfNeeded = async (error = null) => {
    const currentSession = getSessionByWindowId(normalizedWindowId)
    if (isSessionAlreadyMissing(currentSession)) {
      return false
    }

    await dispatchWatchCommand('watch.file-missing', {
      observedAt: nextObservedAt(),
      error,
    })
    return true
  }

  try {
    const exists = await fs.pathExists(documentPath)
    if (!exists) {
      return await dispatchMissingIfNeeded()
    }

    const diskContent = await fs.readFile(documentPath, 'utf-8')
    let diskStat = null
    try {
      diskStat = await fs.stat(documentPath)
    } catch {
      // 对账里的 stat 只是附属信息，失败时不能盖过真实读盘结果。
    }

    if (getSessionByWindowId(normalizedWindowId)?.documentSource?.exists === false) {
      await dispatchWatchCommand('watch.file-restored', {
        observedAt: nextObservedAt(),
        diskContent,
        diskStat,
      })
    }

    await dispatchWatchCommand('watch.file-changed', {
      observedAt: nextObservedAt(),
      diskContent,
      diskStat,
    })
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return await dispatchMissingIfNeeded(error)
    }

    await dispatchWatchCommand('watch.error', {
      error,
    }, {
      publishSnapshotChanged: 'always',
    })
    return false
  }
}

function destroyWindowSilently(win) {
  if (!win) {
    return false
  }

  try {
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) {
      return false
    }

    win.destroy?.()
    return true
  } catch {
    return false
  }
}

function rollbackCreatedWindow({
  windowId,
  session,
  win,
  preserveSession = false,
}) {
  void stopDirectoryWatch(windowId)
  stopExternalWatch(windowId)
  // 迁移场景的会话属于用户正在编辑的文档，只能解绑窗口，不能销毁。
  if (session?.sessionId && !preserveSession) {
    const { store } = ensureSessionRuntimeInitialized()
    store.destroySession(session.sessionId)
  }
  deleteEditorWin(windowId)
  destroyWindowSilently(win)
}

async function continueWindowClose(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const win = getWindowById(normalizedWindowId)
  if (!isWindowAlive(win)) {
    return false
  }

  await refreshRecentOrderBeforeClose(normalizedWindowId)
  const liveWin = getWindowById(normalizedWindowId)
  if (!isWindowAlive(liveWin) || findRegisteredWindowIdByWin(liveWin) !== normalizedWindowId) {
    return false
  }

  setAllowImmediateClose(normalizedWindowId, true)
  liveWin.close()
  return true
}

function requestForceClose(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const win = getWindowById(normalizedWindowId)
  if (!normalizedWindowId || !isWindowAlive(win)) {
    return false
  }

  setForceCloseRequested(normalizedWindowId, true)
  return true
}

function createSaveBeforeSwitchFailedResult(documentPath) {
  return {
    ok: false,
    reason: 'save-before-switch-failed',
    path: documentPath || null,
  }
}

function createSaveBeforeSwitchCancelledResult(documentPath) {
  return {
    ok: false,
    reason: 'save-before-switch-cancelled',
    path: documentPath || null,
  }
}

function createOpenCurrentWindowSwitchFailedResult(documentPath) {
  return {
    ok: false,
    reason: 'open-current-window-switch-failed',
    path: documentPath || null,
  }
}

function createSourceSessionChangedResult(documentPath) {
  return {
    ok: false,
    reason: 'source-session-changed',
    path: documentPath || null,
  }
}

async function isReadableRegularFile(documentPath) {
  try {
    const stat = await fs.stat(documentPath)
    if (stat?.isFile?.() !== true) {
      return {
        ok: false,
        reason: 'open-target-not-file',
        path: documentPath || null,
      }
    }
  } catch {
    return {
      ok: false,
      reason: 'open-target-not-file',
      path: documentPath || null,
    }
  }

  try {
    const content = await fs.readFile(documentPath, 'utf-8')
    return {
      ok: true,
      path: documentPath,
      content,
    }
  } catch {
    return createOpenTargetReadFailedResult(documentPath)
  }
}

async function validateSwitchTarget(documentPath) {
  const normalizedDocumentPath = resolveDocumentOpenPath(documentPath)
  if (!normalizedDocumentPath) {
    return {
      ok: false,
      reason: 'open-target-missing',
      path: null,
    }
  }

  if (!await fs.pathExists(normalizedDocumentPath)) {
    return {
      ok: false,
      reason: 'open-target-missing',
      path: normalizedDocumentPath,
    }
  }

  if (!isMarkdownFilePath(normalizedDocumentPath)) {
    return {
      ok: false,
      reason: 'open-target-invalid-extension',
      path: normalizedDocumentPath,
    }
  }

  return await isReadableRegularFile(normalizedDocumentPath)
}

function matchesExpectedSourceSnapshot(windowId, {
  expectedSessionId = null,
  expectedRevision,
} = {}) {
  const snapshot = getSessionSnapshot(windowId)
  if (!snapshot) {
    return false
  }

  if (typeof expectedSessionId === 'string'
    && expectedSessionId
    && snapshot.sessionId !== expectedSessionId) {
    return false
  }

  if (expectedRevision !== undefined
    && expectedRevision !== null
    && snapshot.revision !== expectedRevision) {
    return false
  }

  return true
}

function hasValidOpenCurrentWindowExecutePayload({
  switchPolicy = null,
  expectedSessionId = null,
  expectedRevision,
} = {}) {
  return OPEN_CURRENT_WINDOW_SWITCH_POLICY_SET.has(switchPolicy)
    && typeof expectedSessionId === 'string'
    && expectedSessionId
    && Number.isFinite(expectedRevision)
}

async function prepareOpenPathInCurrentWindow(windowId, targetPath, options = {}) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const targetWin = getWindowById(normalizedWindowId)
  if (!normalizedWindowId || !isWindowAlive(targetWin)) {
    return {
      ok: false,
      reason: 'window-not-found',
      path: targetPath || null,
    }
  }

  const existingTabResult = await resolveOpenExistingTab(targetPath, normalizedWindowId)
  if (existingTabResult) {
    return {
      ...existingTabResult,
      decision: existingTabResult.reason,
      sourceSessionId: options.sourceSessionId || null,
      sourceRevision: options.sourceRevision,
    }
  }

  const snapshot = getSessionSnapshot(normalizedWindowId)
  return {
    ok: true,
    decision: snapshot?.dirty === true ? 'needs-save-choice' : 'ready-to-switch',
    path: targetPath || null,
    sourceSessionId: options.sourceSessionId || null,
    sourceRevision: options.sourceRevision,
  }
}

function assertExternalWatchStarted(watchStartResult) {
  if (watchStartResult === false || watchStartResult?.ok === false) {
    throw watchStartResult?.error || new Error('external watch start failed')
  }
}

async function rollbackCurrentWindowSessionSwitch(windowId, {
  previousSession,
  nextSession,
}) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId || !previousSession?.sessionId) {
    return false
  }

  const runtime = ensureSessionRuntimeInitialized()

  try {
    await stopDirectoryWatch(normalizedWindowId)
  } catch {}
  // 只停新会话的监听：上一个会话的监听必须继续活着，它已经变成后台标签。
  try {
    stopExternalWatch(normalizedWindowId, nextSession?.sessionId)
  } catch {}

  if (nextSession?.sessionId && runtime.store.getSession(nextSession.sessionId)) {
    runtime.store.destroySession(nextSession.sessionId)
  }

  bindSessionForWindow(normalizedWindowId, previousSession)

  try {
    await rebindDirectoryWatchForSession(normalizedWindowId, previousSession)
  } catch {}
  try {
    assertExternalWatchStarted(startExternalWatch(normalizedWindowId, previousSession?.sessionId))
  } catch {}

  return true
}

async function switchSessionInCurrentWindow(windowId, {
  documentPath,
  content,
  trigger = 'user',
}) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return {
      ok: false,
      reason: 'window-not-found',
      path: documentPath || null,
    }
  }

  const previousSession = getSessionByWindowId(normalizedWindowId)

  await stopDirectoryWatch(normalizedWindowId)

  const nextSession = createInitialSession({
    sessionId: commonUtil.createId(),
    filePath: documentPath,
    exists: true,
    content,
    isRecent: false,
  })

  try {
    registerSessionForWindow(normalizedWindowId, nextSession)
    const directoryRebindResult = await rebindDirectoryWatchForSession(normalizedWindowId, nextSession)
    if (directoryRebindResult?.ok === false) {
      throw directoryRebindResult.error || new Error(directoryRebindResult.reason || 'directory watch rebind failed')
    }
    assertExternalWatchStarted(startExternalWatch(normalizedWindowId, nextSession.sessionId))

    const reconcileResult = await reconcileOpenedDocumentAgainstDisk(normalizedWindowId, documentPath)
    if (reconcileResult === false) {
      throw new Error('open current window reconcile failed')
    }
  } catch {
    await rollbackCurrentWindowSessionSwitch(normalizedWindowId, {
      previousSession,
      nextSession,
    })
    return createOpenCurrentWindowSwitchFailedResult(documentPath)
  }

  // 多标签：“在当前窗口打开”不再替换会话，上一个文档留在标签栏里，
  // 它的外部监听也继续活着（后台标签同样要响应外部变更）。
  await refreshRecentOrderAfterOpen(documentPath)
  await persistCurrentTabGroup(normalizedWindowId)

  return {
    ok: true,
    reason: 'opened',
    path: documentPath || null,
    trigger,
    snapshot: getSessionSnapshot(normalizedWindowId),
  }
}

async function openDocumentInCurrentWindow(windowId, targetPath, options = {}) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const targetWin = getWindowById(normalizedWindowId)
  if (!normalizedWindowId || !isWindowAlive(targetWin)) {
    return {
      ok: false,
      reason: 'window-not-found',
      path: targetPath || null,
    }
  }

  // execute 阶段必须只接受完成预判后的完整协议，
  // 缺失 switchPolicy / expected session 信号时一律拒绝，避免静默退回直接切换。
  if (!hasValidOpenCurrentWindowExecutePayload(options)) {
    return createSourceSessionChangedResult(targetPath)
  }

  if (!matchesExpectedSourceSnapshot(normalizedWindowId, {
    expectedSessionId: options.expectedSessionId || null,
    expectedRevision: options.expectedRevision,
  })) {
    return createSourceSessionChangedResult(targetPath)
  }

  const currentSnapshot = getSessionSnapshot(normalizedWindowId)
  const currentDocumentPath = currentSnapshot?.isRecentMissing === true
    ? null
    : currentSnapshot?.resourceContext?.documentPath || null
  if (toComparableDocumentPath(currentDocumentPath) === toComparableDocumentPath(targetPath)) {
    return {
      ok: true,
      reason: 'noop-current-file',
      path: targetPath || null,
    }
  }

  const focusedExistingTabResult = await resolveOpenExistingTab(targetPath, normalizedWindowId)
  if (focusedExistingTabResult) {
    return focusedExistingTabResult
  }

  let validationResult = await validateSwitchTarget(targetPath)
  if (validationResult.ok !== true) {
    return validationResult
  }

  if (options.switchPolicy === 'save-before-switch') {
    const saveResult = await executeDocumentSaveCommandWithDispatcherDetailed(
      normalizedWindowId,
      createRuntimeDispatchAdapter(normalizedWindowId, ensureSessionRuntimeInitialized()),
    )
    if (saveResult.saved !== true) {
      return saveResult.reason === 'cancelled'
        ? createSaveBeforeSwitchCancelledResult(targetPath)
        : createSaveBeforeSwitchFailedResult(targetPath)
    }

    // save-before-switch 可能等待用户较久。
    // 保存完成后需要重新校验目标占用和磁盘状态，避免沿用保存前的旧结论继续切换。
    const refreshedExistingTabResult = await resolveOpenExistingTab(targetPath, normalizedWindowId)
    if (refreshedExistingTabResult) {
      return refreshedExistingTabResult
    }

    validationResult = await validateSwitchTarget(targetPath)
    if (validationResult.ok !== true) {
      return validationResult
    }
  }

  return await switchSessionInCurrentWindow(normalizedWindowId, {
    documentPath: validationResult.path,
    content: validationResult.content,
    trigger: options.trigger || 'user',
  })
}

function dispatchCommandStateOnly(windowId, command, payload, options = {}) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  const { commandService } = ensureSessionRuntimeInitialized()
  const publishSnapshotMode = options.publishSnapshotChanged || 'always'
  const previousSnapshot = publishSnapshotMode === 'if-changed'
    ? getSessionSnapshot(normalizedWindowId)
    : null
  const result = commandService.dispatch({
    windowId: normalizedWindowId,
    // 后台标签的外部变更等事件需要把命令定向到自己的会话。
    sessionId: options.sessionId || null,
    command,
    payload,
  })
  syncWindowStateFromSession(normalizedWindowId, result.session)
  const nextSnapshot = result?.snapshot || getSessionSnapshot(normalizedWindowId)
  if (publishSnapshotMode === 'always'
    || getSnapshotSignature(previousSnapshot) !== getSnapshotSignature(nextSnapshot)) {
    publishSnapshotChanged(normalizedWindowId, nextSnapshot)
  }
  return result
}

function getSaveDialogTarget() {
  const selectedPath = dialog.showSaveDialogSync({
    title: 'Save',
    filters: [
      { name: 'Markdown File', extensions: MARKDOWN_FILE_EXTENSION_LIST },
    ],
  })
  return appendMarkdownExtension(selectedPath)
}

function getCopyDialogTarget() {
  const selectedPath = dialog.showSaveDialogSync({
    title: 'Save As',
    filters: [
      { name: 'Markdown File', extensions: MARKDOWN_FILE_EXTENSION_LIST },
    ],
  })
  return appendMarkdownExtension(selectedPath)
}

async function dispatchCommand(windowId, command, payload, options = {}) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const result = dispatchCommandStateOnly(normalizedWindowId, command, payload, options)
  if (!result) {
    return null
  }
  await applyEffects(normalizedWindowId, result.effects)
  return result
}

function shouldRebindExternalWatchAfterSave(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const win = getWindowById(normalizedWindowId)
  if (!isWindowAlive(win)) {
    return false
  }

  if (findRegisteredWindowIdByWin(win) !== normalizedWindowId) {
    return false
  }

  const session = getSessionByWindowId(normalizedWindowId)
  return Boolean(session?.documentSource?.path)
}

function getExternalWatchContext(windowId) {
  const session = getSessionByWindowId(windowId)
  if (!session) {
    return {
      bindingToken: null,
      watchingPath: null,
    }
  }

  return {
    // execute-save 内嵌的 watcher 重绑必须绑定到 save.succeeded 之后
    // 命令层已经确认过的最新 token/path，不能再让 effect 层自己猜。
    bindingToken: Number.isFinite(session.watchRuntime?.bindingToken)
      ? session.watchRuntime.bindingToken
      : null,
    watchingPath: session.watchRuntime?.watchingPath
      || session.documentSource?.path
      || null,
  }
}

function focusWindow(windowId) {
  const win = getWindowById(windowId)
  if (!isWindowAlive(win)) {
    return false
  }

  if (typeof win.isMinimized === 'function' && win.isMinimized()) {
    win.restore?.()
  }
  win.show?.()
  win.focus?.()
  return true
}

/**
 * 记录最近获得焦点的窗口。
 * 窗口销毁后不主动清理，读取时用 `resolveTargetEditorWindowId` 统一校验存活。
 *
 * @param {string | null | undefined} windowId
 */
function setLastActiveEditorWindowId(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)

  if (normalizedWindowId) {
    lastActiveEditorWindowId = normalizedWindowId
  }
}

/**
 * 解析“新标签应该开在哪个窗口”。
 *
 * 优先最近获得焦点的编辑窗口；它已经不存在（用户关掉了）时退回第一个存活窗口。
 * 一个窗口都没有时返回 null，由调用方决定新建窗口。
 *
 * @returns {string | null} 返回目标窗口 id；没有可用窗口时返回 null。
 */
function resolveTargetEditorWindowId() {
  const aliveWindowIdList = listWindows()
    .map(win => findRegisteredWindowIdByWin(win))
    .filter(windowId => Boolean(windowId))

  if (aliveWindowIdList.length === 0) {
    return null
  }

  if (lastActiveEditorWindowId && aliveWindowIdList.includes(lastActiveEditorWindowId)) {
    return lastActiveEditorWindowId
  }

  return aliveWindowIdList[0]
}

/**
 * 按文档路径查找「已经打开该文档」的标签页。
 *
 * 这是全应用唯一的「同一文档是否已经打开」判定：按路径查全局会话表，
 * 再通过 store 的会话 → 窗口映射拿到所在窗口（包含后台标签），
 * 因此跨窗口去重与窗口内标签去重共用同一套语义，不会出现
 * “某个入口认得出重复、另一个入口又开一份”的分叉。
 *
 * @param {string} targetPath
 * @returns {{ windowId: string, sessionId: string } | null} 未命中时返回 null。
 */
function findOpenDocumentTab(targetPath) {
  const normalizedTargetPath = resolveDocumentOpenPath(targetPath)
  if (!normalizedTargetPath) {
    return null
  }

  const { store } = ensureSessionRuntimeInitialized()
  const existedSession = store.findSessionByComparablePath(normalizedTargetPath)
  if (!existedSession) {
    return null
  }

  // 会话到窗口的映射以 store 为准：它包含窗口内的**后台标签**。
  // 窗口注册表只记活动会话，用它查会把后台标签当成“没打开”。
  const existedWindowId = store.getWindowIdBySessionId?.(existedSession.sessionId)
    || findRegisteredWindowIdBySessionId(existedSession.sessionId)
  if (!existedWindowId) {
    return null
  }

  return {
    windowId: existedWindowId,
    sessionId: existedSession.sessionId,
  }
}

/**
 * 把「已经打开该文档」的窗口拉到前台，并把该窗口的活动标签切到对应标签。
 *
 * 聚焦与激活必须成对发生：只聚焦会让用户停在同窗口的另一个标签上，
 * 只激活标签又看不到别的窗口。所以副作用只保留这一个入口。
 *
 * @param {string} targetPath
 * @returns {Promise<{ windowId: string, sessionId: string } | null>} 未命中时返回 null。
 */
async function focusOpenDocumentTab(targetPath) {
  const hit = findOpenDocumentTab(targetPath)
  if (!hit) {
    return null
  }

  await activateTabInWindow(hit.windowId, hit.sessionId)
  focusWindow(hit.windowId)
  return hit
}

/**
 * 把「已打开文档」的命中结果统一翻译成打开结果。
 *
 * 命中当前窗口 → `activated-existing-tab`：用户本来就在这个窗口，不需要提示；
 * 命中其它窗口 → `focused-existing-window`：渲染层会提示已切到那个窗口。
 */
function createOpenExistingTabResult(targetPath, { windowId, sessionId }, currentWindowId) {
  const sameWindow = normalizeWindowId(windowId) === normalizeWindowId(currentWindowId)
  return {
    ok: true,
    reason: sameWindow ? 'activated-existing-tab' : 'focused-existing-window',
    path: targetPath || null,
    windowId,
    sessionId,
  }
}

/**
 * 目标文档已经打开时，聚焦并激活对应标签，返回统一打开结果；否则返回 null。
 *
 * 所有“打开某个路径”的入口都必须先经过这里，否则去重规则会散落成多份实现。
 *
 * @param {string} targetPath
 * @param {string} currentWindowId 发起打开的窗口，用于区分“本窗口标签”与“其它窗口”。
 */
async function resolveOpenExistingTab(targetPath, currentWindowId) {
  const hit = await focusOpenDocumentTab(targetPath)
  return hit ? createOpenExistingTabResult(targetPath, hit, currentWindowId) : null
}

/**
 * 把一个文档作为**新标签**开进指定窗口。
 *
 * 与 `document.open-path-in-current-window` 的区别：那条命令带 switchPolicy / expected session 协议
 * 并会弹保存确认；新增标签不替换任何已有文档，因此不需要这些协议。
 *
 * 去重规则统一由 `resolveOpenExistingTab()` 裁决：
 * 1. 目标窗口已经开着同一文档 → 激活那个标签
 * 2. 其它窗口已经开着同一文档 → 聚焦那个窗口并切到对应标签，不重复开
 *
 * @param {string} windowId
 * @param {string} targetPath
 * @param {{ trigger?: string }} [options]
 * @returns {Promise<object>} 返回统一打开结果。
 */
async function openDocumentTabInWindow(windowId, targetPath, options = {}) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const targetWin = getWindowById(normalizedWindowId)

  if (!normalizedWindowId || !isWindowAlive(targetWin)) {
    return {
      ok: false,
      reason: 'window-not-found',
      path: targetPath || null,
    }
  }

  const existingTabResult = await resolveOpenExistingTab(targetPath, normalizedWindowId)
  if (existingTabResult) {
    return existingTabResult
  }

  const validationResult = await validateSwitchTarget(targetPath)
  if (validationResult.ok !== true) {
    return validationResult
  }

  focusWindow(normalizedWindowId)

  return await switchSessionInCurrentWindow(normalizedWindowId, {
    documentPath: validationResult.path,
    content: validationResult.content,
    trigger: options.trigger || 'second-instance',
  })
}

function createCloseHostController(windowId) {
  return {
    requestForceClose: () => requestForceClose(windowId),
    continueWindowClose: () => continueWindowClose(windowId),
    finalizeWindowClose: () => finalizeWindowClose(windowId),
    getClosedManualRequestCompletions: () => getClosedManualRequestCompletions(windowId),
  }
}

/**
 * 把窗口的活动会话切到指定标签。
 *
 * 标签切换不只是换 store 指针：窗口注册表、文件管理目录监听、
 * 以及推给渲染层的快照都必须跟着换，否则侧边栏和标题栏会停留在旧文档上。
 */
async function activateTabInWindow(windowId, sessionId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const { store } = ensureSessionRuntimeInitialized()
  const session = sessionId ? store.getSession(sessionId) : null
  if (!normalizedWindowId || !session) {
    return false
  }

  store.activateSession({
    windowId: normalizedWindowId,
    sessionId,
  })
  getWindowRegistry().activateSession?.({
    windowId: normalizedWindowId,
    sessionId,
  })
  syncWindowStateFromSession(normalizedWindowId, session)

  try {
    await rebindDirectoryWatchForSession(normalizedWindowId, session)
  }
  catch {}

  publishSnapshotChanged(normalizedWindowId)
  // 活动标签属于标签组的一部分，切标签也要写盘。
  await persistCurrentTabGroup(normalizedWindowId)
  return true
}

/**
 * 关掉一个标签页。
 *
 * 关标签只销毁这个会话，其他标签原封不动；活动指针交给相邻标签。
 * 如果关掉的是最后一个标签，按“关最后一个标签 = 关窗口”的约定关窗口。
 */
async function closeTabInWindow(windowId, sessionId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const { store } = ensureSessionRuntimeInitialized()
  const session = sessionId ? store.getSession(sessionId) : null
  if (!normalizedWindowId || !session) {
    return false
  }

  stopExternalWatch(normalizedWindowId, sessionId)

  // 关标签也写 recent：刚关掉的文件应该浮到“最近文件”顶部，
  // 因为那一刻正是用户最想从菜单里把它找回来的时候。
  const closingDocumentPath = session.documentSource?.path || null
  if (closingDocumentPath) {
    try {
      await recent.add(closingDocumentPath)
    }
    catch {}
  }

  store.destroySession(sessionId)
  getWindowRegistry().removeSession?.({
    windowId: normalizedWindowId,
    sessionId,
  })

  const nextActiveSession = store.getSessionByWindowId(normalizedWindowId)
  if (!nextActiveSession) {
    return await continueWindowClose(normalizedWindowId)
  }

  getWindowRegistry().activateSession?.({
    windowId: normalizedWindowId,
    sessionId: nextActiveSession.sessionId,
  })
  syncWindowStateFromSession(normalizedWindowId, nextActiveSession)

  try {
    await rebindDirectoryWatchForSession(normalizedWindowId, nextActiveSession)
  }
  catch {}

  publishSnapshotChanged(normalizedWindowId)
  await persistCurrentTabGroup(normalizedWindowId)
  return true
}

/**
 * 批量关掉一组标签页。
 *
 * 用于“关闭其他 / 关闭右侧”：整个操作只广播一次快照，
 * 因此渲染层不会看到“活动标签来回跳”的中间态。
 *
 * 脏标签由命令层提前过滤，这里只负责落地销毁。
 */
async function closeTabsInWindow(windowId, sessionIds) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const { store } = ensureSessionRuntimeInitialized()
  if (!normalizedWindowId) {
    return false
  }

  const windowSessionIds = store.getSessionIdsByWindowId?.(normalizedWindowId) || []
  const targetSessionIds = Array.isArray(sessionIds)
    ? sessionIds.filter(sessionId => typeof sessionId === 'string' && windowSessionIds.includes(sessionId))
    : []
  if (targetSessionIds.length === 0) {
    return false
  }

  // 先算好关闭后应该停在哪个标签，再逐个销毁：
  // 销毁过程会临时改动活动指针，但只要不推快照，渲染层就看不到中间态。
  const previousActiveSessionId = store.getActiveSessionIdByWindowId?.(normalizedWindowId) ?? null
  const remainingSessionIds = windowSessionIds.filter(sessionId => !targetSessionIds.includes(sessionId))
  const nextActiveSessionId = resolveNextActiveSessionId({
    windowSessionIds,
    remainingSessionIds,
    previousActiveSessionId,
  })

  for (const sessionId of targetSessionIds) {
    const session = store.getSession(sessionId)
    if (!session) {
      continue
    }

    stopExternalWatch(normalizedWindowId, sessionId)

    // 与单个关闭保持一致：关掉的标签也要写 recent
    const closingDocumentPath = session.documentSource?.path || null
    if (closingDocumentPath) {
      try {
        await recent.add(closingDocumentPath)
      }
      catch {}
    }

    store.destroySession(sessionId)
    getWindowRegistry().removeSession?.({
      windowId: normalizedWindowId,
      sessionId,
    })
  }

  const nextActiveSession = nextActiveSessionId ? store.getSession(nextActiveSessionId) : null
  if (!nextActiveSession) {
    return await continueWindowClose(normalizedWindowId)
  }

  store.activateSession({
    windowId: normalizedWindowId,
    sessionId: nextActiveSession.sessionId,
  })
  getWindowRegistry().activateSession?.({
    windowId: normalizedWindowId,
    sessionId: nextActiveSession.sessionId,
  })
  syncWindowStateFromSession(normalizedWindowId, nextActiveSession)

  try {
    await rebindDirectoryWatchForSession(normalizedWindowId, nextActiveSession)
  }
  catch {}

  publishSnapshotChanged(normalizedWindowId)
  await persistCurrentTabGroup(normalizedWindowId)
  return true
}

/**
 * 把标签迁移到新窗口。
 *
 * 会话对象本身不销毁：正文、脏状态、保存基线、外部变更待处理态全部随 session 一起过去，
 * 所以脏标签、未命名草稿、recent-missing 标签都能迁移。
 *
 * 唯一带不走的是渲染层的撤销历史（EditorState 在渲染进程里，主进程没有副本），
 * 调用方必须在迁移前把这条限制告知用户。
 *
 * @returns {Promise<string|number|null>} 成功时返回新窗口 id，失败返回 null。
 */
async function moveTabToNewWindow(windowId, sessionId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const { store } = ensureSessionRuntimeInitialized()
  const session = sessionId ? store.getSession(sessionId) : null
  if (!normalizedWindowId || !session) {
    return null
  }

  const sourceSessionIds = store.getSessionIdsByWindowId?.(normalizedWindowId) || []
  if (!sourceSessionIds.includes(sessionId)) {
    return null
  }

  const documentPath = session.documentSource?.path || null
  // 必须在解绑前取活动指针：解绑后这个值就已经变了。
  const previousActiveSessionId = store.getActiveSessionIdByWindowId?.(normalizedWindowId) ?? null

  // 先从源窗口解绑。
  // store 里一个会话只能属于一个窗口，不解绑就直接绑新窗口会被 addSessionToWindow 拦下。
  stopExternalWatch(normalizedWindowId, sessionId)
  store.removeSessionFromWindow({
    windowId: normalizedWindowId,
    sessionId,
  })
  getWindowRegistry().removeSession?.({
    windowId: normalizedWindowId,
    sessionId,
  })

  let createdWindowId = null
  try {
    createdWindowId = await createNew(documentPath, false, {
      migrateSession: session,
    })
  }
  catch (error) {
    // 建窗口抛错时必须把会话还回源窗口，否则用户文档会凭空消失。
    rebindMigratedSessionToSourceWindow(normalizedWindowId, session)
    throw error
  }

  // 建窗口可能返回失败结果对象（窗口壳加载失败 / 读盘失败），
  // 这种情况下会话还没有归属窗口，必须还回去。
  if (!createdWindowId || !getWindowById(createdWindowId)) {
    rebindMigratedSessionToSourceWindow(normalizedWindowId, session)
    return null
  }

  // 源窗口落点：活动标签被移走时按就近规则换一个，
  // 一个标签都不剩就按“关最后一个标签 = 关窗口”关掉源窗口。
  const remainingSessionIds = sourceSessionIds.filter(id => id !== sessionId)
  const nextActiveSessionId = resolveNextActiveSessionId({
    windowSessionIds: sourceSessionIds,
    remainingSessionIds,
    previousActiveSessionId,
  })

  if (!nextActiveSessionId) {
    publishSnapshotChanged(normalizedWindowId)
    await continueWindowClose(normalizedWindowId)
  }
  else {
    const nextActiveSession = store.getSession(nextActiveSessionId)
    store.activateSession({
      windowId: normalizedWindowId,
      sessionId: nextActiveSessionId,
    })
    getWindowRegistry().activateSession?.({
      windowId: normalizedWindowId,
      sessionId: nextActiveSessionId,
    })
    syncWindowStateFromSession(normalizedWindowId, nextActiveSession)

    try {
      await rebindDirectoryWatchForSession(normalizedWindowId, nextActiveSession)
    }
    catch {}

    publishSnapshotChanged(normalizedWindowId)
    await persistCurrentTabGroup(normalizedWindowId)
  }

  // 新窗口侧的目录监听要按新窗口重建；
  // 外部文件监听已经由 createNew 内部的 startExternalWatch 建好了。
  try {
    await rebindDirectoryWatchForSession(createdWindowId, session)
  }
  catch {}
  publishSnapshotChanged(createdWindowId)
  await persistCurrentTabGroup(createdWindowId)

  focusWindow(createdWindowId)
  return createdWindowId
}

/**
 * 建窗口失败时把已迁移的会话还回源窗口。
 *
 * 这里必须同时恢复窗口绑定与外部文件监听，
 * 否则用户会看到标签回来了、但外部修改不再被监听的半死状态。
 */
function rebindMigratedSessionToSourceWindow(sourceWindowId, session) {
  if (!sourceWindowId || !session?.sessionId) {
    return
  }

  bindSessionForWindow(sourceWindowId, session)
  if (session.documentSource?.path) {
    startExternalWatch(sourceWindowId, session.sessionId)
  }
}

function createTabHostController(windowId) {
  return {
    activateTab: sessionId => activateTabInWindow(windowId, sessionId),
    closeTab: sessionId => closeTabInWindow(windowId, sessionId),
    closeTabs: sessionIds => closeTabsInWindow(windowId, sessionIds),
    moveTabToNewWindow: sessionId => moveTabToNewWindow(windowId, sessionId),
    saveAllTabsAndClose: () => saveAllTabsAndClose(windowId),
    isSessionDirty: (sessionId) => {
      const { store } = ensureSessionRuntimeInitialized()
      const session = sessionId ? store.getSession(sessionId) : null
      return session ? deriveDocumentSnapshot(session).dirty : false
    },
  }
}

/**
 * 在当前窗口新建一个草稿标签。
 *
 * “新建”不再开新窗口：新窗口保留给“并排查看”这个独立入口。
 */
async function createDraftTab(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const win = getWindowById(normalizedWindowId)
  if (!normalizedWindowId || !isWindowAlive(win)) {
    return false
  }

  const draftSession = createInitialSession({
    sessionId: commonUtil.createId(),
    filePath: null,
    exists: false,
    content: '',
    isRecent: false,
  })

  registerSessionForWindow(normalizedWindowId, draftSession)
  publishSnapshotChanged(normalizedWindowId)
  await persistCurrentTabGroup(normalizedWindowId)
  return true
}

/**
 * “保存并退出”遇到多个脏标签时，逐个会话保存完再关窗。
 *
 * 保存链路本身是按“当前活动会话”工作的，所以这里先切到目标标签，
 * 再复用同一套保存状态机；任何一个会话保存失败或用户取消，都立即中止关窗。
 */
async function saveAllTabsAndClose(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const { store } = ensureSessionRuntimeInitialized()
  const sessionIds = store.getSessionIdsByWindowId?.(normalizedWindowId) || []

  for (const sessionId of sessionIds) {
    const targetSession = store.getSession(sessionId)
    if (!targetSession || deriveDocumentSnapshot(targetSession).dirty !== true) {
      continue
    }

    await dispatchCommand(normalizedWindowId, 'document.activate-tab', { sessionId })
    const saveResult = await executeDocumentSaveCommandWithDispatcherDetailed(
      normalizedWindowId,
      createRuntimeDispatchAdapter(normalizedWindowId, ensureSessionRuntimeInitialized()),
    )
    if (saveResult.saved !== true) {
      return false
    }
  }

  return await continueWindowClose(normalizedWindowId)
}

function createExternalWatchController(windowId) {
  const resolveActiveSessionId = () => getSessionByWindowId(windowId)?.sessionId || null
  return {
    start: (options = {}) => startExternalWatch(windowId, resolveActiveSessionId(), options),
    stop: () => stopExternalWatch(windowId, resolveActiveSessionId()),
    getContext: () => ({
      ...getExternalWatchContext(windowId),
      shouldRebindAfterSave: shouldRebindExternalWatchAfterSave(windowId),
    }),
    markInternalSave: content => getExternalWatchBridge(windowId, resolveActiveSessionId())?.markInternalSave?.(content),
    settlePendingChange: versionHash => getExternalWatchBridge(windowId, resolveActiveSessionId())?.settlePendingChange?.(versionHash),
    ignorePendingChange: () => getExternalWatchBridge(windowId, resolveActiveSessionId())?.ignorePendingChange?.(),
  }
}

function createWindowMessageController(windowId) {
  return {
    publishWindowMessage: (data) => {
      if (isWindowAlive(getWindowById(windowId))) {
        return publishWindowMessage(windowId, data)
      }
      return null
    },
    publishSnapshotChanged: (snapshot) => {
      if (normalizeWindowId(windowId)) {
        return publishSnapshotChanged(windowId, snapshot)
      }
      return null
    },
  }
}

function buildEffectContextForWindow(windowId, { dispatchCommand }) {
  return {
    dispatchCommand,
    getSaveDialogTarget,
    getCopyDialogTarget,
    closeHostController: createCloseHostController(windowId),
    // 关闭确认态已经通过 snapshot.closePrompt 推送给 renderer，
    // 不再补发无消费者的 legacy `unsaved` 事件。
    showUnsavedPrompt: () => {},
    showSaveFailedMessage: (data) => {
      if (isWindowAlive(getWindowById(windowId))) {
        publishWindowMessage(windowId, data)
      }
    },
    externalWatchController: createExternalWatchController(windowId),
    tabHostController: createTabHostController(windowId),
    windowMessageController: createWindowMessageController(windowId),
    focusWindow: () => focusWindow(windowId),
  }
}

async function applyEffects(windowId, effects = []) {
  const { effectService } = ensureSessionRuntimeInitialized()
  const effectContext = buildEffectContextForWindow(windowId, {
    dispatchCommand: (command, payload) => dispatchCommand(windowId, command, payload),
  })

  for (const effect of effects) {
    await effectService.applyEffect({
      effect,
      ...effectContext,
    })
  }
}

function getPendingPromptVersion(windowId) {
  return getSessionByWindowId(windowId)?.externalRuntime?.pendingExternalChange?.version ?? null
}

async function executeExternalResolutionCommandWithDispatcher(windowId, command, payload = {}, dispatch) {
  const beforePendingVersion = getPendingPromptVersion(windowId)
  const result = await dispatch(command, payload)
  const afterPendingVersion = result?.session?.externalRuntime?.pendingExternalChange?.version ?? null
  const expectedVersion = payload?.version ?? beforePendingVersion
  const resolutionResult = result?.session?.externalRuntime?.lastResolutionResult
  const handledPending = beforePendingVersion != null
    && expectedVersion === beforePendingVersion
    && afterPendingVersion !== beforePendingVersion
  const isApplied = handledPending && resolutionResult === 'applied'
  const isIgnored = handledPending && resolutionResult === 'ignored'

  if (isApplied && getExternalWatchState(windowId)) {
    const settledVersionHash = result?.session?.diskSnapshot?.versionHash
      || getExternalWatchState(windowId)?.pendingChange?.versionHash
      || null
    getExternalWatchBridge(windowId)?.settlePendingChange?.(settledVersionHash)
  } else if (isIgnored && getExternalWatchState(windowId)) {
    getExternalWatchBridge(windowId)?.ignorePendingChange?.()
  }

  return {
    commandResult: result,
    handledPending,
    isApplied,
    isIgnored,
  }
}

async function handleLocalResourceLinkOpen(win, windowId, resourceUrl) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const targetWin = getWindowById(normalizedWindowId)
  const openResult = await getDocumentSessionRuntime().executeUiCommand(
    normalizedWindowId,
    'document.resource.open-in-folder',
    resourceUrl,
  )
  if (openResult.ok !== true) {
    const messageKey = resourceFileUtil.getLocalResourceFailureMessageKey(openResult.reason)
    if (messageKey && targetWin) {
      publishWindowMessage(normalizedWindowId, {
        type: 'warning',
        content: messageKey,
      })
    }
    return openResult
  }

  if (openResult.opened !== true) {
    const messageKey = resourceFileUtil.getLocalResourceFailureMessageKey(openResult.reason)
    if (messageKey && targetWin) {
      publishWindowMessage(normalizedWindowId, {
        type: 'warning',
        content: messageKey,
      })
    }
  }

  return openResult
}

function shouldHoldWindowClose(effectList = []) {
  return effectList.some(effect => effect.type === 'hold-window-close'
    || effect.type === 'open-save-dialog'
    || effect.type === 'execute-save'
    || effect.type === 'show-unsaved-prompt')
}

function getCopySaveFailureMessage({ reason, error }) {
  const errorDetail = typeof error?.message === 'string' && error.message
    ? ` ${error.message}`
    : ''

  if (resolveLanguagePreference(configUtil.getConfig().language, app?.getLocale?.()) === 'en-US') {
    if (reason === 'same-path') {
      return 'Save as failed. The copy path must be different from current document.'
    }
    return `Save as failed.${errorDetail}`
  }

  if (reason === 'same-path') {
    return '另存为失败，副本路径不能与当前文档相同。'
  }
  return `另存为失败。${errorDetail}`
}

async function executeDocumentSaveCommandWithDispatcherDetailed(windowId, dispatch) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const session = getSessionByWindowId(normalizedWindowId)
  const hadDocumentPath = Boolean(session?.documentSource?.path)
  const saveInvokedDuringClose = session?.closeRuntime?.intent === 'close'

  // 手动首存必须先回到标准命令流：
  // document.save -> open-save-dialog -> dialog.save-target-selected。
  const saveCommandResult = await dispatch('document.save')
  const manualRequestId = saveCommandResult?.manualRequestId || null

  let requestCompletion = null
  if (manualRequestId) {
    // Ctrl+S 的返回值必须只绑定这次 manual request 自己，
    // 不能再因为“系统里后来又起了新的 auto-save”而被拖着继续等待。
    requestCompletion = await waitForManualSaveRequestCompletion(normalizedWindowId, manualRequestId)
  }

  let finalSession = requestCompletion?.session || getSessionByWindowId(normalizedWindowId)
  if (!manualRequestId && finalSession?.saveRuntime?.inFlightJobId) {
    // 兜底逻辑只给“旧运行态里还没 manualRequestId”的异常场景使用，
    // 正常路径必须走 request-id 精确等待。
    finalSession = await waitForSaveRuntimeToSettle(normalizedWindowId)
  }

  const completedRequest = requestCompletion?.completion || findCompletedManualRequest(finalSession, manualRequestId)
  const finalSnapshot = finalSession ? deriveDocumentSnapshot(finalSession) : null
  const saved = completedRequest
    ? Boolean(completedRequest.saved && completedRequest.documentPath)
    : manualRequestId
      ? false
      : Boolean(finalSession?.documentSource?.path && finalSnapshot?.saved)
  if (saved) {
    if (!saveInvokedDuringClose) {
      publishWindowMessage(normalizedWindowId, {
        type: 'success',
        content: 'message.saveSuccessfully',
      })
    }
    return {
      saved: true,
      reason: 'saved',
    }
  }

  // 只有“用户主动取消首存选路径”才应该提示取消保存；
  // 如果首存写盘失败，真实错误提示已经在 save.failed 链路里发出，
  // 这里再补 cancelSave 会把磁盘错误误导成用户取消。
  if (!hadDocumentPath && completedRequest?.status === 'cancelled') {
    publishWindowMessage(normalizedWindowId, {
      type: 'warning',
      content: 'message.cancelSave',
    })
    return {
      saved: false,
      reason: 'cancelled',
    }
  }

  return {
    saved: false,
    reason: 'failed',
  }
}

async function executeDocumentSaveCommandWithDispatcher(windowId, dispatch) {
  const result = await executeDocumentSaveCommandWithDispatcherDetailed(windowId, dispatch)
  return result.saved === true
}

async function executeDocumentCopySaveCommandWithDispatcher(windowId, dispatch) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const result = await dispatch('document.save-copy')
  const finalSession = getSessionByWindowId(normalizedWindowId)
  const copySaveCompletion = consumeCopySaveRequestCompletion(finalSession, result?.copySaveRequestId)

  // compat facade 必须按“当前这一次 save-copy request 自己的 completion”来裁决提示。
  // 否则多个 save-copy 请求交错时，旧 job 的结果就会覆盖新请求，造成成功/失败串线。
  if (copySaveCompletion?.status === 'failed') {
    publishWindowMessage(normalizedWindowId, {
      type: copySaveCompletion.failureReason === 'same-path' ? 'warning' : 'error',
      content: getCopySaveFailureMessage({
        reason: copySaveCompletion.failureReason,
        error: copySaveCompletion.error,
      }),
    })
    return result
  }

  if (copySaveCompletion?.status === 'succeeded') {
    publishWindowMessage(normalizedWindowId, {
      type: 'success',
      content: 'message.saveAsSuccessfully',
    })
  } else if (copySaveCompletion?.status === 'cancelled') {
    publishWindowMessage(normalizedWindowId, {
      type: 'warning',
      content: 'message.cancelSaveAs',
    })
  }
  return result
}

function updateTempContentWithDispatcher(windowId, content, dispatch) {
  // 编辑更新直接进入统一命令流，
  // Electron 侧其他模块如需读取最新正文，必须回到 session getter，而不是继续依赖旧镜像字段。
  return dispatch('document.edit', {
    content,
  })
}

function updateTempContent(windowId, content) {
  return updateTempContentWithDispatcher(
    windowId,
    content,
    (command, payload, options = {}) => dispatchCommand(windowId, command, payload, options),
  )
}

function getSessionSnapshot(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }
  const { windowBridge } = ensureSessionRuntimeInitialized()
  return windowBridge.getSessionSnapshot(normalizedWindowId)
}

function createEmptyDocumentContext() {
  return {
    path: null,
    exists: false,
    content: '',
    saved: false,
    fileName: 'Untitled',
  }
}

function getDocumentContext(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId || !getWindowById(normalizedWindowId)) {
    return createEmptyDocumentContext()
  }

  const session = getSessionByWindowId(normalizedWindowId)
  const snapshot = session ? deriveDocumentSnapshot(session) : null

  return {
    // 统一把“当前窗口文档真相”收口成只读上下文，供仍在 Electron 侧运行的外围模块读取。
    // 这里不再保留 winInfo 镜像回退，避免外围模块继续依赖多套状态来源。
    path: session?.documentSource?.path || null,
    exists: snapshot?.exists ?? Boolean(session?.documentSource?.exists),
    content: snapshot?.content ?? session?.editorSnapshot?.content ?? '',
    saved: snapshot?.saved === true,
    fileName: snapshot?.fileName || 'Untitled',
  }
}

function createRuntimeDispatchAdapter(windowId, runtime) {
  return (command, payload, options = {}) => runtime.dispatch(windowId, command, payload, {
    publishSnapshotChanged: options.publishSnapshotChanged || 'always',
  })
}

async function waitForSaveRuntimeToSettle(windowId, {
  timeoutMs = 10000,
  pollIntervalMs = 10,
} = {}) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    const session = getSessionByWindowId(windowId)
    const saveRuntime = session?.saveRuntime || {}
    const saveStillRunning = Boolean(saveRuntime.inFlightJobId)
      || saveRuntime.status === 'queued'
      || saveRuntime.status === 'running'

    if (!saveStillRunning) {
      return session
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }

  return getSessionByWindowId(windowId)
}

function findCompletedManualRequest(session, requestId) {
  if (!requestId) {
    return null
  }

  const completedRequests = session?.saveRuntime?.completedManualRequests
  if (!Array.isArray(completedRequests)) {
    return null
  }

  return completedRequests.find(request => request?.requestId === requestId) || null
}

function consumeCopySaveRequestCompletion(session, requestId) {
  if (!session || !requestId) {
    return null
  }

  const { saveCoordinator } = ensureSessionRuntimeInitialized()
  return saveCoordinator.consumeCopySaveCompletion(session, {
    requestId,
  })
}

async function waitForManualSaveRequestCompletion(windowId, requestId, {
  timeoutMs = null,
  pollIntervalMs = 10,
} = {}) {
  const deadline = Number.isFinite(timeoutMs) ? (Date.now() + timeoutMs) : null

  while (true) {
    if (deadline != null && Date.now() > deadline) {
      break
    }

    const session = getSessionByWindowId(windowId)
    if (!session) {
      const cachedCompletion = findCompletedManualRequest({
        saveRuntime: {
          completedManualRequests: getClosedManualRequestCompletions(windowId),
        },
      }, requestId)
      return {
        session: null,
        completion: cachedCompletion,
      }
    }

    const completion = findCompletedManualRequest(session, requestId)
    if (completion) {
      return {
        session,
        completion,
      }
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }

  return {
    session: getSessionByWindowId(windowId),
    completion: null,
  }
}

async function createNew(filePath, isRecent = false, options = {}) {
  // 未显式初始化 runtime 时必须在这里直接失败，不能在内部自举。
  ensureSessionRuntimeInitialized()
  const windowRegistry = getWindowRegistry()
  // 迁移场景：窗口壳建好后不创建新会话，而是把调用方给的会话绑到新窗口。
  const migrateSession = options.migrateSession || null
  const normalizedFilePath = resolveDocumentOpenPath(filePath)
  const exists = Boolean(normalizedFilePath && await fs.pathExists(normalizedFilePath))
  // 迁移场景必须跳过“已打开文档”检查：
  // 那个检查会把焦点拉回源窗口的标签，形成自指循环。
  if (!migrateSession && exists) {
    // 复用统一的“已打开文档”判定：命中就聚焦窗口 + 激活标签，不再新建窗口。
    const existingTab = await focusOpenDocumentTab(normalizedFilePath)
    if (existingTab) {
      await refreshRecentOrderAfterOpen(normalizedFilePath)
      return existingTab.windowId
    }
  }

  let content = ''
  // 迁移场景不读盘：正文以 session.editorSnapshot 为准，
  // 用磁盘内容覆盖会把用户未保存的修改抹掉。
  if (!migrateSession && exists) {
    try {
      content = await fs.readFile(normalizedFilePath, 'utf-8')
    } catch {
      return createOpenTargetReadFailedResult(normalizedFilePath)
    }
  }

  const id = commonUtil.createId()
  const workAreaSize = screen.getPrimaryDisplay().workAreaSize
  const globalTheme = configUtil.getConfig()?.theme?.global === 'dark' ? 'dark' : 'light'
  const win = new BrowserWindow({
    frame: false,
    icon: WINDOW_ICON_PATH,
    title: 'wj-markdown-editor',
    // 先隐藏窗口，待首帧渲染完成（ready-to-show）后再显示，避免暗色主题下启动时暴露页面加载期间的白色帧
    show: false,
    backgroundColor: globalTheme === 'dark' ? '#282c34' : '#ffffff',
    maximizable: true,
    resizable: true,
    width: workAreaSize.width / 4 * 3,
    height: workAreaSize.height / 4 * 3,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      webSecurity: true,
      preload: path.resolve(__dirname, '../../preload.js'),
      additionalArguments: [`--wj-initial-theme=${globalTheme}`],
    },
  })
  let session = null

  try {
    windowRegistry.registerWindow({
      windowId: id,
      win,
    })

    hostStateStore.registerWindowState({
      windowId: id,
      state: {
        win,
        externalWatchMap: new Map(),
        externalWatchBridgeMap: new Map(),
        allowImmediateClose: false,
        forceClose: false,
        lastClosedManualRequestCompletions: [],
      },
    })

    // 启动恢复的跳过列表在开窗时就写入窗口状态：
    // 渲染层挂载后主动消费一次即可，不需要任何推送。
    setStartupSkippedPathList(id, options.startupSkippedPathList)

    if (migrateSession) {
      // 迁移：会话对象已经存在于 store，只把归属窗口换成新窗口。
      // 不能走 registerSessionForWindow，那会再 createSession 一次并覆盖现有状态。
      session = migrateSession
      bindSessionForWindow(id, session)
    } else {
      session = createInitialSession({
        sessionId: commonUtil.createId(),
        filePath: normalizedFilePath,
        exists,
        content,
        isRecent,
      })
      registerSessionForWindow(id, session)
    }

    win.once('ready-to-show', () => {
      win.show()
      setTimeout(() => {
        updateUtil.checkUpdate(listWindows())
      }, 30000)
    })
    win.on('unmaximize', () => {
      publishWindowSizeChanged(win, false)
    })
    win.on('maximize', () => {
      publishWindowSizeChanged(win, true)
    })
    win.on('enter-full-screen', () => {
      publishFullScreenChanged(win, true)
    })
    win.on('leave-full-screen', () => {
      publishFullScreenChanged(win, false)
    })
    win.on('always-on-top-changed', (event, isAlwaysOnTop) => {
      publishAlwaysOnTopChanged(win, isAlwaysOnTop)
    })
    win.webContents.on('did-finish-load', () => {
      publishHostWindowState(win)
    })
    win.webContents.setWindowOpenHandler((details) => {
      const url = details.url
      if (url.match('^http')) {
        shell.openExternal(url).then(() => {})
      } else if (url.match('^wj://')) {
        handleLocalResourceLinkOpen(win, id, url).then(() => {}).catch(() => {})
      }
      return { action: 'deny' }
    })

    win.on('close', (e) => {
      const currentWindowId = findRegisteredWindowIdByWin(win)
      if (!currentWindowId) {
        return
      }

      if (isAllowImmediateClose(currentWindowId)) {
        setAllowImmediateClose(currentWindowId, false)
        finalizeWindowClose(currentWindowId)
        return
      }

      const command = isForceCloseRequested(currentWindowId)
        ? 'document.confirm-force-close'
        : 'document.request-close'
      const runtime = getDocumentSessionRuntime()
      const handleCloseCommandResult = (result) => {
        const effectList = Array.isArray(result?.effects) ? result.effects : []

        if (isForceCloseRequested(currentWindowId)
          && effectList.length === 1
          && effectList[0]?.type === 'close-window') {
          finalizeWindowClose(currentWindowId)
          return
        }

        if (shouldHoldWindowClose(effectList)) {
          applyEffects(currentWindowId, effectList).then(() => {}).catch(() => {})
          return
        }

        if (effectList.length > 0) {
          applyEffects(currentWindowId, effectList).then(() => {}).catch(() => {})
          return
        }

        continueWindowClose(currentWindowId).then(() => {}).catch(() => {})
      }

      if (!isForceCloseRequested(currentWindowId)) {
        e.preventDefault()
      }

      const closeCommandResult = runtime.executeUiCommand(currentWindowId, command, null)
      if (closeCommandResult && typeof closeCommandResult.then === 'function') {
        closeCommandResult
          .then(handleCloseCommandResult)
          .catch(() => {})
      } else {
        handleCloseCommandResult(closeCommandResult)
      }

      if (isForceCloseRequested(currentWindowId)) {
        return
      }
      return false
    })

    win.on('blur', () => {
      const currentWindowId = findRegisteredWindowIdByWin(win)
      dispatchCommand(currentWindowId, 'window.blur').then(() => {}).catch(() => {})
    })

    // 系统级打开（双击文件 / 第二实例）没有发起窗口，
    // 只能靠“最近获得焦点的窗口”决定新标签开在哪里。
    win.on('focus', () => {
      setLastActiveEditorWindowId(findRegisteredWindowIdByWin(win))
    })

    // 迁移场景的会话可能没有磁盘文件（草稿 / recent-missing），
    // 是否启动监听由会话自己的路径状态决定，而不是源文件是否存在。
    if (exists || migrateSession?.documentSource?.path) {
      startExternalWatch(id, session?.sessionId)
    }

    try {
      await loadWindowShellContent(win)
    } catch {
      const shouldNotifyUser = isWindowAlive(win)
      rollbackCreatedWindow({
        windowId: id,
        session,
        win,
        // 迁移场景绝不能销毁会话：那是用户正在编辑的文档。
        preserveSession: Boolean(migrateSession),
      })
      if (shouldNotifyUser) {
        showWindowShellLoadFailureDialog(normalizedFilePath)
      }
      return createWindowShellLoadFailedResult(normalizedFilePath)
    }

    // 迁移场景不做磁盘对账：会话正文是用户视角的真相，
    // 用磁盘重新校准会把未保存修改丢掉。
    if (!migrateSession && exists) {
      await reconcileOpenedDocumentAgainstDisk(id, normalizedFilePath)
    }

    if (exists) {
      await refreshRecentOrderAfterOpen(normalizedFilePath)
    }

    return id
  } catch (error) {
    rollbackCreatedWindow({
      windowId: id,
      session,
      win,
      // 迁移场景绝不能销毁会话：那是用户正在编辑的文档。
      preserveSession: Boolean(migrateSession),
    })
    throw error
  }
}

Object.assign(windowLifecycleService, {
  deleteEditorWin,
  createNew,
  createDraftTab,
  openDocumentTabInWindow,
  persistCurrentTabGroup,
  restoreTabGroup,
  configure: configureWindowLifecycleService,
  getDocumentSessionRuntimeHostDeps,
  getWindowById,
  getWindowIdByWin,
  getWindowIdByWebContentsId,
  getParentWindowIdByWebContentsId,
  listWindows,
  publishWindowMessage,
  publishHostWindowStateByWindowId,
  getDocumentContext,
  getSessionSnapshot,
  consumeStartupSkippedPathList,
  handleLocalResourceLinkOpen,
  updateTempContent,
  startExternalWatch,
  stopExternalWatch,
  requestForceClose,
})

export default windowLifecycleService
