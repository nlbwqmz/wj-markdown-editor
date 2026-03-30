import { watch } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, screen, shell, webContents } from 'electron'
import fs from 'fs-extra'
import configUtil from '../../data/configUtil.js'
import recent from '../../data/recent.js'
import sendUtil from '../channel/sendUtil.js'
import commonUtil from '../commonUtil.js'
import fileWatchUtil from '../fileWatchUtil.js'
import resourceFileUtil from '../resourceFileUtil.js'
import updateUtil from '../updateUtil.js'
import { resolveDocumentOpenPath } from './documentOpenTargetUtil.js'
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
import { createWindowHostStateStore } from './windowHostStateStore.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MISSING_PATH_REASON = {
  OPEN_TARGET_MISSING: 'open-target-missing',
}

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

        default:
          return dispatch(command, payload)
      }
    },
    openDocumentWindow: async (targetPath, options = {}) => {
      return await createNew(targetPath, options.isRecent === true)
    },
    openDocumentInCurrentWindow: async (windowId, targetPath, options = {}) => {
      return await openDocumentInCurrentWindow(windowId, targetPath, options)
    },
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
  return true
}

function checkWinList() {
  if ((getOptionalWindowRegistry()?.getAllWindows?.() || []).length === 0) {
    app.exit()
  }
}

function getExternalWatchState(windowId) {
  return getHostWindowState(windowId)?.externalWatch || null
}

function ensureExternalWatchState(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  const windowState = getHostWindowState(normalizedWindowId)
  if (!windowState) {
    return null
  }

  if (!windowState.externalWatch) {
    windowState.externalWatch = createExternalWatchState()
  }

  return windowState.externalWatch
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

function getExternalWatchBridge(windowId) {
  const normalizedWindowId = normalizeWindowId(windowId)
  if (!normalizedWindowId) {
    return null
  }

  const windowState = getHostWindowState(normalizedWindowId)
  if (!windowState) {
    return null
  }

  if (windowState.externalWatchBridge) {
    return windowState.externalWatchBridge
  }

  const externalWatchState = ensureExternalWatchState(normalizedWindowId)
  if (!externalWatchState) {
    return null
  }

  const externalWatchBridge = createExternalWatchBridge({
    watch,
    watchState: externalWatchState,
    dispatchCommand: (command, payload, options = {}) => {
      return dispatchCommand(normalizedWindowId, command, payload, options)
    },
    getCurrentBindingToken: () => getCurrentWatchBindingToken(normalizedWindowId),
    getCurrentObservedFloor: () => getCurrentWatchObservedFloor(normalizedWindowId),
  })
  windowState.externalWatchBridge = externalWatchBridge
  return externalWatchBridge
}

function appendMarkdownExtension(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    return null
  }
  const extname = path.extname(targetPath)
  if (!extname || extname.toLowerCase() !== '.md') {
    return `${targetPath}.md`
  }
  return targetPath
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

  let directoryState = null
  if (typeof directoryWatchService.rebindWindowDirectoryFromSession === 'function') {
    directoryState = await directoryWatchService.rebindWindowDirectoryFromSession(normalizedWindowId, session)
  } else if (typeof runtime.fileManagerService?.resolveDirectoryStateFromSession === 'function') {
    directoryState = await runtime.fileManagerService.resolveDirectoryStateFromSession(session)
    if (!directoryState?.directoryPath) {
      await stopDirectoryWatch(normalizedWindowId)
    } else {
      await directoryWatchService.rebindWindowDirectory?.(normalizedWindowId, directoryState.directoryPath, {
        activePath: directoryState.activePath,
      })
    }
  }

  if (directoryState) {
    runtime.windowBridge.publishFileManagerDirectoryChanged?.({
      windowId: normalizedWindowId,
      directoryState,
    })
  }

  return directoryState
}

function stopExternalWatch(windowId) {
  if (!normalizeWindowId(windowId)) {
    return true
  }
  return getExternalWatchBridge(windowId)?.stop?.() ?? true
}

function getCurrentWatchBindingToken(windowId) {
  const session = getSessionByWindowId(windowId)
  return Number.isFinite(session?.watchRuntime?.bindingToken)
    ? session.watchRuntime.bindingToken
    : null
}

function getCurrentWatchObservedFloor(windowId) {
  const session = getSessionByWindowId(windowId)
  return Number.isFinite(session?.watchRuntime?.eventFloorObservedAt)
    ? session.watchRuntime.eventFloorObservedAt
    : 0
}

function startExternalWatch(windowId, options = {}) {
  const normalizedWindowId = normalizeWindowId(windowId)
  const session = getSessionByWindowId(normalizedWindowId)
  const requestedPath = typeof options?.watchingPath === 'string' && options.watchingPath.trim() !== ''
    ? options.watchingPath
    : session?.watchRuntime?.watchingPath || session?.documentSource?.path || null
  return getExternalWatchBridge(normalizedWindowId)?.start?.({
    ...options,
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
  const closingSession = getSessionByWindowId(normalizedWindowId)
  setClosedManualRequestCompletions(
    normalizedWindowId,
    Array.isArray(closingSession?.saveRuntime?.completedManualRequests)
      ? closingSession.saveRuntime.completedManualRequests
      : [],
  )
  void stopDirectoryWatch(normalizedWindowId)
  stopExternalWatch(normalizedWindowId)
  if (closingSession?.sessionId) {
    const { store } = ensureSessionRuntimeInitialized()
    store.destroySession(closingSession.sessionId)
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
  const language = configUtil.getConfig().language || 'zh-CN'
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

async function loadWindowShellContent(win, { hasContent }) {
  const hash = hasContent ? configUtil.getConfig().startPage : 'editor'

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
}) {
  void stopDirectoryWatch(windowId)
  stopExternalWatch(windowId)
  if (session?.sessionId) {
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

function getExistingWindowIdByDocumentPath(targetPath, { excludeWindowId = null } = {}) {
  const normalizedTargetPath = resolveDocumentOpenPath(targetPath)
  if (!normalizedTargetPath) {
    return null
  }

  const existedSession = ensureSessionRuntimeInitialized().store.findSessionByComparablePath(normalizedTargetPath)
  if (!existedSession) {
    return null
  }

  const existedWindowId = findRegisteredWindowIdBySessionId(existedSession.sessionId)
  if (!existedWindowId) {
    return null
  }
  if (normalizeWindowId(existedWindowId) === normalizeWindowId(excludeWindowId)) {
    return null
  }
  return existedWindowId
}

function createSaveBeforeSwitchFailedResult(documentPath) {
  return {
    ok: false,
    reason: 'save-before-switch-failed',
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
  try {
    stopExternalWatch(normalizedWindowId)
  } catch {}

  bindSessionForWindow(normalizedWindowId, previousSession)

  if (nextSession?.sessionId && runtime.store.getSession(nextSession.sessionId)) {
    runtime.store.destroySession(nextSession.sessionId)
  }

  try {
    await rebindDirectoryWatchForSession(normalizedWindowId, previousSession)
  } catch {}
  try {
    assertExternalWatchStarted(startExternalWatch(normalizedWindowId))
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

  const runtime = ensureSessionRuntimeInitialized()
  const previousSession = getSessionByWindowId(normalizedWindowId)

  await stopDirectoryWatch(normalizedWindowId)
  stopExternalWatch(normalizedWindowId)

  const nextSession = createInitialSession({
    sessionId: commonUtil.createId(),
    filePath: documentPath,
    exists: true,
    content,
    isRecent: false,
  })

  try {
    registerSessionForWindow(normalizedWindowId, nextSession)
    await rebindDirectoryWatchForSession(normalizedWindowId, nextSession)
    assertExternalWatchStarted(startExternalWatch(normalizedWindowId))

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

  if (previousSession?.sessionId) {
    runtime.store.destroySession(previousSession.sessionId)
  }

  await refreshRecentOrderAfterOpen(documentPath)

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

  const existedWindowId = getExistingWindowIdByDocumentPath(targetPath, {
    excludeWindowId: normalizedWindowId,
  })
  if (existedWindowId) {
    focusWindow(existedWindowId)
    await refreshRecentOrderAfterOpen(targetPath)
    return {
      ok: true,
      reason: 'focused-existing-window',
      windowId: existedWindowId,
    }
  }

  if (options.saveBeforeSwitch === true) {
    const saved = await executeDocumentSaveCommandWithDispatcher(
      normalizedWindowId,
      createRuntimeDispatchAdapter(normalizedWindowId, ensureSessionRuntimeInitialized()),
    )
    if (!saved) {
      return createSaveBeforeSwitchFailedResult(targetPath)
    }
  }

  let content = ''
  try {
    content = await fs.readFile(targetPath, 'utf-8')
  } catch {
    return createOpenTargetReadFailedResult(targetPath)
  }

  return await switchSessionInCurrentWindow(normalizedWindowId, {
    documentPath: targetPath,
    content,
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
      { name: 'Markdown File', extensions: ['md'] },
    ],
  })
  return appendMarkdownExtension(selectedPath)
}

function getCopyDialogTarget() {
  const selectedPath = dialog.showSaveDialogSync({
    title: 'Save As',
    filters: [
      { name: 'Markdown File', extensions: ['md'] },
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

function createCloseHostController(windowId) {
  return {
    requestForceClose: () => requestForceClose(windowId),
    continueWindowClose: () => continueWindowClose(windowId),
    finalizeWindowClose: () => finalizeWindowClose(windowId),
    getClosedManualRequestCompletions: () => getClosedManualRequestCompletions(windowId),
  }
}

function createExternalWatchController(windowId) {
  return {
    start: (options = {}) => startExternalWatch(windowId, options),
    stop: () => stopExternalWatch(windowId),
    getContext: () => ({
      ...getExternalWatchContext(windowId),
      shouldRebindAfterSave: shouldRebindExternalWatchAfterSave(windowId),
    }),
    markInternalSave: content => getExternalWatchBridge(windowId)?.markInternalSave?.(content),
    settlePendingChange: versionHash => getExternalWatchBridge(windowId)?.settlePendingChange?.(versionHash),
    ignorePendingChange: () => getExternalWatchBridge(windowId)?.ignorePendingChange?.(),
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

  if (configUtil.getConfig().language === 'en-US') {
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

async function executeDocumentSaveCommandWithDispatcher(windowId, dispatch) {
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
    return true
  }

  // 只有“用户主动取消首存选路径”才应该提示取消保存；
  // 如果首存写盘失败，真实错误提示已经在 save.failed 链路里发出，
  // 这里再补 cancelSave 会把磁盘错误误导成用户取消。
  if (!hadDocumentPath && completedRequest?.status === 'cancelled') {
    publishWindowMessage(normalizedWindowId, {
      type: 'warning',
      content: 'message.cancelSave',
    })
  }

  return false
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
    fileName: 'Unnamed',
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
    fileName: snapshot?.fileName || 'Unnamed',
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

async function createNew(filePath, isRecent = false) {
  const windowRegistry = getWindowRegistry()
  const { store } = ensureSessionRuntimeInitialized()
  const normalizedFilePath = resolveDocumentOpenPath(filePath)
  const exists = Boolean(normalizedFilePath && await fs.pathExists(normalizedFilePath))
  if (exists) {
    const existedSession = store.findSessionByComparablePath(normalizedFilePath)
    if (existedSession) {
      const existedWindowId = findRegisteredWindowIdBySessionId(existedSession.sessionId)
      const existedWin = existedWindowId ? getWindowById(existedWindowId) : null
      if (existedWin) {
        existedWin.show()
        await refreshRecentOrderAfterOpen(normalizedFilePath)
        return existedWindowId
      }
    }
  }

  let content = ''
  if (exists) {
    try {
      content = await fs.readFile(normalizedFilePath, 'utf-8')
    } catch {
      return createOpenTargetReadFailedResult(normalizedFilePath)
    }
  }

  const id = commonUtil.createId()
  const workAreaSize = screen.getPrimaryDisplay().workAreaSize
  const win = new BrowserWindow({
    frame: false,
    icon: path.resolve(__dirname, '../../../icon/favicon.ico'),
    title: 'wj-markdown-editor',
    maximizable: true,
    resizable: true,
    width: workAreaSize.width / 4 * 3,
    height: workAreaSize.height / 4 * 3,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      webSecurity: true,
      preload: path.resolve(__dirname, '../../preload.js'),
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
        externalWatch: createExternalWatchState(),
        externalWatchBridge: null,
        allowImmediateClose: false,
        forceClose: false,
        lastClosedManualRequestCompletions: [],
      },
    })

    session = createInitialSession({
      sessionId: commonUtil.createId(),
      filePath: normalizedFilePath,
      exists,
      content,
      isRecent,
    })
    registerSessionForWindow(id, session)

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

    if (exists) {
      startExternalWatch(id)
    }

    try {
      await loadWindowShellContent(win, {
        hasContent: Boolean(content),
      })
    } catch {
      const shouldNotifyUser = isWindowAlive(win)
      rollbackCreatedWindow({
        windowId: id,
        session,
        win,
      })
      if (shouldNotifyUser) {
        showWindowShellLoadFailureDialog(normalizedFilePath)
      }
      return createWindowShellLoadFailedResult(normalizedFilePath)
    }

    if (exists) {
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
    })
    throw error
  }
}

Object.assign(windowLifecycleService, {
  deleteEditorWin,
  createNew,
  configure: configureWindowLifecycleService,
  getDocumentSessionRuntimeHostDeps,
  getWindowById,
  getWindowIdByWin,
  getWindowIdByWebContentsId,
  getParentWindowIdByWebContentsId,
  listWindows,
  publishWindowMessage,
  getDocumentContext,
  getSessionSnapshot,
  handleLocalResourceLinkOpen,
  updateTempContent,
  startExternalWatch,
  stopExternalWatch,
  requestForceClose,
})

export default windowLifecycleService
