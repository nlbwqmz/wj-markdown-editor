import { watch } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, screen, shell } from 'electron'
import fs from 'fs-extra'
import configUtil from '../../data/configUtil.js'
import recent from '../../data/recent.js'
import sendUtil from '../channel/sendUtil.js'
import commonUtil from '../commonUtil.js'
import fileWatchUtil from '../fileWatchUtil.js'
import resourceFileUtil from '../resourceFileUtil.js'
import updateUtil from '../updateUtil.js'
import { createDocumentCommandService } from './documentCommandService.js'
import { createDocumentEffectService } from './documentEffectService.js'
import { resolveDocumentOpenPath } from './documentOpenTargetUtil.js'
import { createDocumentResourceService } from './documentResourceService.js'
import {
  createBoundFileSession,
  createDraftSession,
  createRecentMissingSession,
} from './documentSessionFactory.js'
import {
  normalizeOpenCommandResult,
  openDocumentWindowWithRuntimePolicy,
} from './documentSessionRuntime.js'
import { createDocumentSessionStore } from './documentSessionStore.js'
import { deriveDocumentSnapshot } from './documentSnapshotUtil.js'
import { createExternalWatchBridge } from './externalWatchBridge.js'
import { createSaveCoordinator } from './saveCoordinator.js'
import { createWindowSessionBridge } from './windowSessionBridge.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MISSING_PATH_REASON = {
  OPEN_TARGET_MISSING: 'open-target-missing',
}

const winInfoList = []
let sessionRuntimeServices = null

function ensureSessionRuntimeInitialized() {
  if (sessionRuntimeServices) {
    return sessionRuntimeServices
  }

  const store = createDocumentSessionStore()
  const saveCoordinator = createSaveCoordinator()
  const commandService = createDocumentCommandService({ store, saveCoordinator, getConfig: () => configUtil.getConfig() })
  const effectService = createDocumentEffectService({ recentStore: recent, getConfig: () => configUtil.getConfig() })
  const windowBridge = createWindowSessionBridge({
    store,
    sendToRenderer: (win, payload) => {
      sendUtil.send(win, payload)
    },
    resolveWindowById: (windowId) => {
      return winInfoList.find(item => item.id === windowId)?.win || null
    },
    getAllWindows: () => winInfoList.map(item => item.win),
  })
  const resourceService = createDocumentResourceService({ store, showItemInFolder: shell.showItemInFolder })

  // Task 3 要求 runtime 相关单例只能在显式初始化或首次真实使用时创建，
  // 不能在模块导入阶段提前组装。
  sessionRuntimeServices = {
    store,
    saveCoordinator,
    commandService,
    effectService,
    windowBridge,
    resourceService,
  }
  return sessionRuntimeServices
}

function deleteEditorWin(id) {
  const index = winInfoList.findIndex(win => win.id === id)
  if (index < 0) {
    return false
  }
  winInfoList.splice(index, 1)
  return true
}

function checkWinList() {
  if (winInfoList.length === 0) {
    app.exit()
  }
}

function findByWin(win) {
  return winInfoList.find(item => item.win === win)
}

function getWinInfo(target) {
  if (typeof target === 'string') {
    return winInfoList.find(item => item.id === target)
  }
  return winInfoList.find(item => item.win === target || item.id === target)
}

function isWindowAlive(win) {
  return Boolean(win) && (typeof win.isDestroyed !== 'function' || win.isDestroyed() === false)
}

function createExternalWatchState() {
  return fileWatchUtil.createWatchState()
}

function getExternalWatchBridge(winInfo) {
  if (!winInfo) {
    return null
  }

  if (winInfo.externalWatchBridge) {
    return winInfo.externalWatchBridge
  }

  if (!winInfo.externalWatch) {
    winInfo.externalWatch = createExternalWatchState()
  }

  winInfo.externalWatchBridge = createExternalWatchBridge({
    watch,
    watchState: winInfo.externalWatch,
    dispatchCommand: (command, payload, options = {}) => {
      return dispatchCommand(winInfo, command, payload, options)
    },
    getCurrentBindingToken: () => getCurrentWatchBindingToken(winInfo),
    getCurrentObservedFloor: () => getCurrentWatchObservedFloor(winInfo),
  })
  return winInfo.externalWatchBridge
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

function getSessionByWinInfo(winInfo) {
  if (!winInfo) {
    return null
  }
  const { store } = ensureSessionRuntimeInitialized()
  return store.getSession(winInfo.sessionId)
    || store.getSessionByWindowId(winInfo.id)
}

function publishSnapshotChanged(winInfo, snapshot) {
  if (!winInfo?.id) {
    return null
  }
  const { windowBridge } = ensureSessionRuntimeInitialized()
  return windowBridge.publishSnapshotChanged({
    windowId: winInfo.id,
    snapshot,
  })
}

function publishWindowMessage(winInfo, data) {
  if (!winInfo?.id || !data) {
    return null
  }
  const { windowBridge } = ensureSessionRuntimeInitialized()
  return windowBridge.publishMessage({
    windowId: winInfo.id,
    data,
  })
}

function getSnapshotSignature(snapshot) {
  return JSON.stringify(snapshot || null)
}

function syncWinInfoFromSession(winInfo, session) {
  if (!winInfo || !session) {
    return
  }

  winInfo.forceClose = session.closeRuntime.forceClose
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

function registerSessionForWindow(winInfo, session) {
  const { store } = ensureSessionRuntimeInitialized()
  store.createSession(session)
  store.bindWindowToSession({
    windowId: winInfo.id,
    sessionId: session.sessionId,
  })
  winInfo.sessionId = session.sessionId
  syncWinInfoFromSession(winInfo, session)
  publishSnapshotChanged(winInfo)
}

function stopExternalWatch(winInfo) {
  if (!winInfo) {
    return true
  }
  return getExternalWatchBridge(winInfo)?.stop?.() ?? true
}

function getCurrentWatchBindingToken(winInfo) {
  const session = getSessionByWinInfo(winInfo)
  return Number.isFinite(session?.watchRuntime?.bindingToken)
    ? session.watchRuntime.bindingToken
    : null
}

function getCurrentWatchObservedFloor(winInfo) {
  const session = getSessionByWinInfo(winInfo)
  return Number.isFinite(session?.watchRuntime?.eventFloorObservedAt)
    ? session.watchRuntime.eventFloorObservedAt
    : 0
}

function startExternalWatch(winInfo, options = {}) {
  const session = getSessionByWinInfo(winInfo)
  const requestedPath = typeof options?.watchingPath === 'string' && options.watchingPath.trim() !== ''
    ? options.watchingPath
    : session?.watchRuntime?.watchingPath || session?.documentSource?.path || null
  return getExternalWatchBridge(winInfo)?.start?.({
    ...options,
    watchingPath: requestedPath,
  }) || {
    ok: false,
    watchingPath: null,
    watchingDirectoryPath: null,
    error: new Error('watch bridge missing'),
  }
}

function finalizeWindowClose(winInfo, id) {
  const closingSession = getSessionByWinInfo(winInfo)
  winInfo.lastClosedManualRequestCompletions = Array.isArray(closingSession?.saveRuntime?.completedManualRequests)
    ? [...closingSession.saveRuntime.completedManualRequests]
    : []
  stopExternalWatch(winInfo)
  if (winInfo?.sessionId) {
    const { store } = ensureSessionRuntimeInitialized()
    store.destroySession(winInfo.sessionId)
  }
  deleteEditorWin(id)
  checkWinList()
}

async function refreshRecentOrderBeforeClose(winInfo) {
  const documentPath = getSessionByWinInfo(winInfo)?.documentSource?.path || null
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

async function continueWindowClose(winInfo) {
  if (!isWindowAlive(winInfo?.win)) {
    return false
  }

  await refreshRecentOrderBeforeClose(winInfo)
  if (!isWindowAlive(winInfo?.win) || findByWin(winInfo.win) !== winInfo) {
    return false
  }

  winInfo.allowImmediateClose = true
  winInfo.win.close()
  return true
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

async function dispatchCommand(winInfo, command, payload, options = {}) {
  if (!winInfo) {
    return null
  }

  const { commandService } = ensureSessionRuntimeInitialized()
  const publishSnapshotMode = options.publishSnapshotChanged || 'always'
  const previousSnapshot = publishSnapshotMode === 'if-changed'
    ? getSessionSnapshot(winInfo)
    : null
  const result = commandService.dispatch({
    windowId: winInfo.id,
    command,
    payload,
  })
  syncWinInfoFromSession(winInfo, result.session)
  const nextSnapshot = result?.snapshot || getSessionSnapshot(winInfo)
  if (publishSnapshotMode === 'always'
    || getSnapshotSignature(previousSnapshot) !== getSnapshotSignature(nextSnapshot)) {
    publishSnapshotChanged(winInfo, nextSnapshot)
  }
  await applyEffects(winInfo, result.effects)
  return result
}

function shouldRebindExternalWatchAfterSave(winInfo) {
  if (!winInfo?.win || !isWindowAlive(winInfo.win)) {
    return false
  }

  if (findByWin(winInfo.win) !== winInfo) {
    return false
  }

  const session = getSessionByWinInfo(winInfo)
  return Boolean(session?.documentSource?.path)
}

function getExternalWatchContext(winInfo) {
  const session = getSessionByWinInfo(winInfo)
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

function buildEffectContextForWindow(winInfo, { dispatchCommand }) {
  return {
    winInfo,
    dispatchCommand,
    getSaveDialogTarget,
    getCopyDialogTarget,
    continueWindowClose: () => continueWindowClose(winInfo),
    // 关闭确认态已经通过 snapshot.closePrompt 推送给 renderer，
    // 不再补发无消费者的 legacy `unsaved` 事件。
    showUnsavedPrompt: () => {},
    showSaveFailedMessage: (data) => {
      if (isWindowAlive(winInfo?.win)) {
        publishWindowMessage(winInfo, data)
      }
    },
    showWindowMessage: (data) => {
      if (isWindowAlive(winInfo?.win)) {
        publishWindowMessage(winInfo, data)
      }
    },
    shouldRebindExternalWatchAfterSave: () => shouldRebindExternalWatchAfterSave(winInfo),
    getExternalWatchContext: () => getExternalWatchContext(winInfo),
    externalWatchBridge: getExternalWatchBridge(winInfo),
  }
}

async function applyEffects(winInfo, effects = []) {
  const { effectService } = ensureSessionRuntimeInitialized()
  const effectContext = buildEffectContextForWindow(winInfo, {
    dispatchCommand: (command, payload) => dispatchCommand(winInfo, command, payload),
  })

  for (const effect of effects) {
    await effectService.applyEffect({
      effect,
      ...effectContext,
    })
  }
}

function getPendingPromptVersion(winInfo) {
  return getSessionByWinInfo(winInfo)?.externalRuntime?.pendingExternalChange?.version ?? null
}

async function executeExternalResolutionCommandWithDispatcher(winInfo, command, payload = {}, dispatch) {
  const beforePendingVersion = getPendingPromptVersion(winInfo)
  const result = await dispatch(command, payload)
  const afterPendingVersion = result?.session?.externalRuntime?.pendingExternalChange?.version ?? null
  const expectedVersion = payload?.version ?? beforePendingVersion
  const resolutionResult = result?.session?.externalRuntime?.lastResolutionResult
  const handledPending = beforePendingVersion != null
    && expectedVersion === beforePendingVersion
    && afterPendingVersion !== beforePendingVersion
  const isApplied = handledPending && resolutionResult === 'applied'
  const isIgnored = handledPending && resolutionResult === 'ignored'

  if (isApplied && winInfo?.externalWatch) {
    const settledVersionHash = result?.session?.diskSnapshot?.versionHash
      || winInfo.externalWatch.pendingChange?.versionHash
      || null
    getExternalWatchBridge(winInfo)?.settlePendingChange?.(settledVersionHash)
  } else if (isIgnored && winInfo?.externalWatch) {
    getExternalWatchBridge(winInfo)?.ignorePendingChange?.()
  }

  return {
    commandResult: result,
    handledPending,
    isApplied,
    isIgnored,
  }
}

async function executeExternalResolutionCommand(winInfo, command, payload = {}) {
  return await executeExternalResolutionCommandWithDispatcher(
    winInfo,
    command,
    payload,
    (nextCommand, nextPayload) => dispatchCommand(winInfo, nextCommand, nextPayload),
  )
}

async function handleLocalResourceLinkOpen(win, winInfo, resourceUrl) {
  const openResult = await executeResourceCommand(winInfo, 'document.resource.open-in-folder', resourceUrl)
  if (openResult.ok !== true) {
    const messageKey = resourceFileUtil.getLocalResourceFailureMessageKey(openResult.reason)
    if (messageKey && winInfo?.win) {
      publishWindowMessage(winInfo, {
        type: 'warning',
        content: messageKey,
      })
    }
    return openResult
  }

  if (openResult.opened !== true) {
    const messageKey = resourceFileUtil.getLocalResourceFailureMessageKey(openResult.reason)
    if (messageKey && winInfo?.win) {
      publishWindowMessage(winInfo, {
        type: 'warning',
        content: messageKey,
      })
    }
  }

  return openResult
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

async function executeDocumentSaveCommandWithDispatcher(winInfo, dispatch) {
  const session = getSessionByWinInfo(winInfo)
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
    requestCompletion = await waitForManualSaveRequestCompletion(winInfo, manualRequestId)
  }

  let finalSession = requestCompletion?.session || getSessionByWinInfo(winInfo)
  if (!manualRequestId && finalSession?.saveRuntime?.inFlightJobId) {
    // 兜底逻辑只给“旧运行态里还没 manualRequestId”的异常场景使用，
    // 正常路径必须走 request-id 精确等待。
    finalSession = await waitForSaveRuntimeToSettle(winInfo)
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
      publishWindowMessage(winInfo, {
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
    publishWindowMessage(winInfo, {
      type: 'warning',
      content: 'message.cancelSave',
    })
  }

  return false
}

async function executeDocumentSaveCommand(winInfo) {
  return await executeDocumentSaveCommandWithDispatcher(
    winInfo,
    (command, payload, options = {}) => dispatchCommand(winInfo, command, payload, options),
  )
}

async function executeDocumentCopySaveCommandWithDispatcher(winInfo, dispatch) {
  const result = await dispatch('document.save-copy')
  const finalSession = getSessionByWinInfo(winInfo)
  const copySaveCompletion = consumeCopySaveRequestCompletion(finalSession, result?.copySaveRequestId)

  // compat facade 必须按“当前这一次 save-copy request 自己的 completion”来裁决提示。
  // 否则多个 save-copy 请求交错时，旧 job 的结果就会覆盖新请求，造成成功/失败串线。
  if (copySaveCompletion?.status === 'failed') {
    publishWindowMessage(winInfo, {
      type: copySaveCompletion.failureReason === 'same-path' ? 'warning' : 'error',
      content: getCopySaveFailureMessage({
        reason: copySaveCompletion.failureReason,
        error: copySaveCompletion.error,
      }),
    })
    return result
  }

  if (copySaveCompletion?.status === 'succeeded') {
    publishWindowMessage(winInfo, {
      type: 'success',
      content: 'message.saveAsSuccessfully',
    })
  } else if (copySaveCompletion?.status === 'cancelled') {
    publishWindowMessage(winInfo, {
      type: 'warning',
      content: 'message.cancelSaveAs',
    })
  }
  return result
}

function updateTempContentWithDispatcher(winInfo, content, dispatch) {
  // 编辑更新直接进入统一命令流，
  // Electron 侧其他模块如需读取最新正文，必须回到 session getter，而不是继续依赖旧镜像字段。
  dispatch('document.edit', {
    content,
  }).then(() => {})
}

function updateTempContent(winInfo, content) {
  updateTempContentWithDispatcher(
    winInfo,
    content,
    (command, payload, options = {}) => dispatchCommand(winInfo, command, payload, options),
  )
}

function getSessionSnapshot(winInfo) {
  if (!winInfo?.id) {
    return null
  }
  const { windowBridge } = ensureSessionRuntimeInitialized()
  return windowBridge.getSessionSnapshot(winInfo.id)
}

function getDocumentContext(winInfo) {
  const session = getSessionByWinInfo(winInfo)
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

async function waitForSaveRuntimeToSettle(winInfo, {
  timeoutMs = 10000,
  pollIntervalMs = 10,
} = {}) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    const session = getSessionByWinInfo(winInfo)
    const saveRuntime = session?.saveRuntime || {}
    const saveStillRunning = Boolean(saveRuntime.inFlightJobId)
      || saveRuntime.status === 'queued'
      || saveRuntime.status === 'running'

    if (!saveStillRunning) {
      return session
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }

  return getSessionByWinInfo(winInfo)
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

async function waitForManualSaveRequestCompletion(winInfo, requestId, {
  timeoutMs = null,
  pollIntervalMs = 10,
} = {}) {
  const deadline = Number.isFinite(timeoutMs) ? (Date.now() + timeoutMs) : null

  while (true) {
    if (deadline != null && Date.now() > deadline) {
      break
    }

    const session = getSessionByWinInfo(winInfo)
    if (!session) {
      const cachedCompletion = findCompletedManualRequest({
        saveRuntime: {
          completedManualRequests: winInfo?.lastClosedManualRequestCompletions || [],
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
    session: getSessionByWinInfo(winInfo),
    completion: null,
  }
}

async function executeResourceCommand(winInfo, command, payload) {
  if (!winInfo?.id) {
    return null
  }

  const { resourceService } = ensureSessionRuntimeInitialized()
  // 资源命令单独分流到 documentResourceService，
  // 是为了把“当前 active session 上下文裁决”和“底层文件系统操作”固定收口到一条边界。
  // 这样旧 IPC 名称、新 IPC 名称、窗口内链接点击三条入口就不会再各自偷读 winInfo 状态。
  switch (command) {
    case 'document.resource.open-in-folder':
      return await resourceService.openInFolder({
        windowId: winInfo.id,
        payload,
      })

    case 'document.resource.delete-local':
      return await resourceService.deleteLocal({
        windowId: winInfo.id,
        payload,
      })

    case 'resource.get-info':
      return await resourceService.getInfo({
        windowId: winInfo.id,
        payload,
      })

    default:
      throw new Error(`未知资源命令: ${command}`)
  }
}

function executeResourceCommandSync(winInfo, command, payload) {
  if (!winInfo?.id) {
    return null
  }

  const { resourceService } = ensureSessionRuntimeInitialized()
  if (command === 'resource.get-comparable-key') {
    // 比较 key 仍然保留同步语义，
    // 因为编辑区统计引用数和批量删除裁决都在同一次交互里立即完成，
    // 如果这里改成异步，旧逻辑会在“统计前先删文案/打开弹窗”之间产生新的竞态窗口。
    return resourceService.getComparableKey({
      windowId: winInfo.id,
      payload,
    })
  }

  throw new Error(`未知同步资源命令: ${command}`)
}

async function openDocumentWindow(targetPath, {
  isRecent = false,
  trigger = 'user',
  sourceWinInfo = null,
} = {}) {
  return await openDocumentWindowWithRuntimePolicy({
    targetPath,
    trigger,
    isRecent,
    sourceWindowId: sourceWinInfo?.id || null,
    openWindow: async (nextTargetPath, options = {}) => {
      return await createNew(nextTargetPath, options.isRecent === true)
    },
    getWindowContext: windowId => getWinInfo(windowId),
    getDocumentContext: windowId => getDocumentContext(getWinInfo(windowId)),
    getSessionSnapshot: windowId => getSessionSnapshot(getWinInfo(windowId)),
  })
}

async function openDocumentPath(targetPath, {
  trigger = 'user',
  baseDir = null,
} = {}) {
  // 启动参数 / second-instance 这类“显式路径打开”入口也必须走统一 opening policy，
  // 不能再直接 createNew() 绕过 `存在 + .md + regular file` 校验。
  return await executeCommand(null, 'document.open-path', {
    path: targetPath,
    trigger,
    baseDir,
  })
}

async function executeCommand(winInfo, command, payload) {
  switch (command) {
    case 'document.save':
      return await executeDocumentSaveCommand(winInfo)

    case 'document.save-copy':
      return await executeDocumentCopySaveCommandWithDispatcher(
        winInfo,
        (command, payload, options = {}) => dispatchCommand(winInfo, command, payload, options),
      )

    case 'document.get-session-snapshot':
      return getSessionSnapshot(winInfo)

    case 'document.external.apply':
    case 'document.external.ignore':
      // 外部修改处理已经完全收口到统一命令入口，
      // 这里只保留一个私有 helper，把命令层结果与 fileWatchUtil 的 pending 结算同步在一起。
      return (await executeExternalResolutionCommand(winInfo, command, payload || {})).commandResult

    case 'document.resource.open-in-folder':
    case 'document.resource.delete-local':
    case 'resource.get-info':
      return await executeResourceCommand(winInfo, command, payload)

    case 'resource.get-comparable-key':
      return executeResourceCommandSync(winInfo, command, payload)

    case 'document.request-open-dialog':
    case 'document.open-path':
    case 'dialog.open-target-selected':
    case 'dialog.open-target-cancelled':
    case 'document.open-recent':
    case 'recent.get-list':
    case 'recent.remove':
    case 'recent.clear':
    {
      const { effectService } = ensureSessionRuntimeInitialized()
      const result = await effectService.executeCommand({
        command,
        payload,
        winInfo,
        dispatchCommand: (nextCommand, nextPayload) => executeCommand(winInfo, nextCommand, nextPayload),
        openDocumentWindow: (targetPath, options = {}) => {
          return openDocumentWindow(targetPath, {
            ...options,
            sourceWinInfo: winInfo,
          })
        },
        getSessionSnapshot: () => getSessionSnapshot(winInfo),
      })
      if (result?.ok === false
        && (result?.reason === 'open-target-invalid-extension' || result?.reason === 'open-target-not-file')) {
        publishWindowMessage(winInfo, {
          type: 'warning',
          content: 'message.onlyMarkdownFilesCanBeOpened',
        })
      }
      return normalizeOpenCommandResult({
        command,
        result,
        targetPath: typeof payload?.path === 'string' ? payload.path : null,
      })
    }

    default:
      return await dispatchCommand(winInfo, command, payload)
  }
}

function initializeSessionRuntime() {
  const {
    store,
    saveCoordinator,
    commandService,
    effectService,
    windowBridge,
    resourceService,
  } = ensureSessionRuntimeInitialized()

  // main.js 现在通过这个入口触发真正初始化，
  // 从而把导入期副作用改成应用启动阶段的显式动作。
  return {
    store,
    saveCoordinator,
    commandService,
    effectService,
    windowBridge,
    resourceService,
    getWindowContext: windowId => getWinInfo(windowId),
    getDocumentContext: windowId => getDocumentContext(getWinInfo(windowId)),
    buildRunnerEffectContext: ({ windowId, dispatchCommand }) => {
      const winInfo = getWinInfo(windowId)
      if (!winInfo) {
        return {}
      }
      return buildEffectContextForWindow(winInfo, {
        dispatchCommand,
      })
    },
    executeDocumentCommand: async ({
      windowId,
      command,
      payload,
      runtime,
    }) => {
      const winInfo = getWinInfo(windowId)
      if (!winInfo) {
        return null
      }

      const dispatch = createRuntimeDispatchAdapter(windowId, runtime)

      switch (command) {
        case 'document.save':
          return await executeDocumentSaveCommandWithDispatcher(winInfo, dispatch)

        case 'document.save-copy':
          return await executeDocumentCopySaveCommandWithDispatcher(winInfo, dispatch)

        case 'document.external.apply':
        case 'document.external.ignore':
          return (await executeExternalResolutionCommandWithDispatcher(
            winInfo,
            command,
            payload || {},
            dispatch,
          )).commandResult

        case 'document.edit':
          updateTempContentWithDispatcher(winInfo, payload?.content, dispatch)
          return null

        case 'document.cancel-close':
        case 'document.confirm-force-close':
          return await dispatch(command, payload)

        default:
          return await dispatch(command, payload)
      }
    },
  }
}

function notifyRecentListChanged(recentList) {
  const { windowBridge } = ensureSessionRuntimeInitialized()
  return windowBridge.publishRecentListChanged(recentList)
}

async function createNew(filePath, isRecent = false) {
  const { store } = ensureSessionRuntimeInitialized()
  const normalizedFilePath = resolveDocumentOpenPath(filePath)
  const exists = Boolean(normalizedFilePath && await fs.pathExists(normalizedFilePath))
  if (exists) {
    await recent.add(normalizedFilePath)
    const existedSession = store.findSessionByComparablePath(normalizedFilePath)
    if (existedSession) {
      const existedWinInfo = winInfoList.find(item => item.sessionId === existedSession.sessionId)
      if (existedWinInfo?.win) {
        existedWinInfo.win.show()
        return existedWinInfo
      }
    }
  }

  const id = commonUtil.createId()
  const workAreaSize = screen.getPrimaryDisplay().workAreaSize
  const win = new BrowserWindow({
    frame: false,
    icon: path.resolve(__dirname, '../../../icon/favicon.ico'),
    title: 'wj-markdown-editor',
    show: false,
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

  const content = exists ? await fs.readFile(normalizedFilePath, 'utf-8') : ''
  const winInfo = {
    id,
    win,
    sessionId: null,
    externalWatch: createExternalWatchState(),
    allowImmediateClose: false,
    forceClose: false,
    lastClosedManualRequestCompletions: [],
  }
  winInfoList.push(winInfo)

  const session = createInitialSession({
    sessionId: commonUtil.createId(),
    filePath: normalizedFilePath,
    exists,
    content,
    isRecent,
  })
  registerSessionForWindow(winInfo, session)

  if (exists) {
    startExternalWatch(winInfo)
  }

  win.once('ready-to-show', () => {
    win.show()
    setTimeout(() => {
      updateUtil.checkUpdate(winInfoList)
    }, 30000)
  })
  win.on('unmaximize', () => {
    sendUtil.send(win, { event: 'window-size', data: { isMaximize: false } })
  })
  win.on('maximize', () => {
    sendUtil.send(win, { event: 'window-size', data: { isMaximize: true } })
  })
  win.on('always-on-top-changed', (event, isAlwaysOnTop) => {
    sendUtil.send(win, { event: 'always-on-top-changed', data: isAlwaysOnTop })
  })
  win.webContents.setWindowOpenHandler((details) => {
    const url = details.url
    if (url.match('^http')) {
      shell.openExternal(url).then(() => {})
    } else if (url.match('^wj://')) {
      const currentWinInfo = winInfoList.find(item => item.id === id)
      handleLocalResourceLinkOpen(win, currentWinInfo, url).then(() => {}).catch(() => {})
    }
    return { action: 'deny' }
  })

  win.on('close', (e) => {
    const currentWinInfo = findByWin(win)
    if (!currentWinInfo) {
      return
    }

    if (currentWinInfo.allowImmediateClose === true) {
      currentWinInfo.allowImmediateClose = false
      finalizeWindowClose(currentWinInfo, id)
      return
    }

    const command = currentWinInfo.forceClose === true
      ? 'document.confirm-force-close'
      : 'document.request-close'
    const { commandService } = ensureSessionRuntimeInitialized()
    const result = commandService.dispatch({
      windowId: currentWinInfo.id,
      command,
    })
    syncWinInfoFromSession(currentWinInfo, result.session)
    publishSnapshotChanged(currentWinInfo)

    const shouldHoldClose = result.effects.some(effect => effect.type === 'hold-window-close'
      || effect.type === 'open-save-dialog'
      || effect.type === 'execute-save'
      || effect.type === 'show-unsaved-prompt')

    if (shouldHoldClose) {
      e.preventDefault()
      applyEffects(currentWinInfo, result.effects).then(() => {}).catch(() => {})
      return false
    }

    if (currentWinInfo.forceClose === true
      && result.effects.length === 1
      && result.effects[0]?.type === 'close-window') {
      finalizeWindowClose(currentWinInfo, id)
      return
    }

    if (result.effects.length > 0) {
      e.preventDefault()
      applyEffects(currentWinInfo, result.effects).then(() => {}).catch(() => {})
      return false
    }

    e.preventDefault()
    continueWindowClose(currentWinInfo).then(() => {}).catch(() => {})
    return false
  })

  win.on('blur', () => {
    const currentWinInfo = findByWin(win)
    dispatchCommand(currentWinInfo, 'window.blur').then(() => {}).catch(() => {})
  })

  if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
    win.loadURL(content ? `http://localhost:8080/#/${configUtil.getConfig().startPage}` : 'http://localhost:8080/#/editor').then(() => {
      win.webContents.openDevTools({ mode: 'undocked' })
    })
  } else {
    win.loadFile(path.resolve(__dirname, '../../../web-dist/index.html'), { hash: content ? configUtil.getConfig().startPage : 'editor' }).then(() => {})
  }

  return winInfo
}

export default {
  deleteEditorWin,
  createNew,
  openDocumentPath,
  initializeSessionRuntime,
  notifyRecentListChanged,
  executeCommand,
  executeResourceCommand,
  executeResourceCommandSync,
  getWinInfo,
  getAll: () => {
    return winInfoList
  },
  getByWebContentsId: (webContentsId) => {
    return winInfoList.find(item => item.win.webContents.id === webContentsId)
  },
  publishWindowMessage,
  getDocumentContext,
  getSessionSnapshot,
  handleLocalResourceLinkOpen,
  updateTempContent,
  startExternalWatch,
  stopExternalWatch,
}
