import crypto from 'node:crypto'
import { watch } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, screen, shell } from 'electron'
import fs from 'fs-extra'
import configUtil from '../../data/configUtil.js'
import recent from '../../data/recent.js'
import sendUtil from '../channel/sendUtil.js'
import commonUtil from '../commonUtil.js'
import { createDocumentCommandService } from '../document-session/documentCommandService.js'
import { createDocumentEffectService } from '../document-session/documentEffectService.js'
import { resolveDocumentOpenPath } from '../document-session/documentOpenTargetUtil.js'
import { createDocumentResourceService } from '../document-session/documentResourceService.js'
import {
  createBoundFileSession,
  createDraftSession,
  createRecentMissingSession,
} from '../document-session/documentSessionFactory.js'
import { createDocumentSessionStore } from '../document-session/documentSessionStore.js'
import { deriveDocumentSnapshot } from '../document-session/documentSnapshotUtil.js'
import { createSaveCoordinator } from '../document-session/saveCoordinator.js'
import { createWindowSessionBridge } from '../document-session/windowSessionBridge.js'
import fileWatchUtil from '../fileWatchUtil.js'
import resourceFileUtil from '../resourceFileUtil.js'
import updateUtil from '../updateUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MISSING_PATH_REASON = {
  OPEN_TARGET_MISSING: 'open-target-missing',
}

const winInfoList = []
const documentSessionStore = createDocumentSessionStore()
const saveCoordinator = createSaveCoordinator({
  createJobId: () => commonUtil.createId(),
  now: () => Date.now(),
})
const documentCommandService = createDocumentCommandService({
  store: documentSessionStore,
  saveCoordinator,
  getConfig: () => configUtil.getConfig(),
  now: () => Date.now(),
})
const documentEffectService = createDocumentEffectService({
  recentStore: recent,
  getConfig: () => configUtil.getConfig(),
})
const windowSessionBridge = createWindowSessionBridge({
  store: documentSessionStore,
  sendToRenderer: (win, payload) => {
    sendUtil.send(win, payload)
  },
  resolveWindowById: (windowId) => {
    return winInfoList.find(item => item.id === windowId)?.win || null
  },
  getAllWindows: () => winInfoList.map(item => item.win),
})
const documentResourceService = createDocumentResourceService({
  store: documentSessionStore,
  resourceUtil: resourceFileUtil,
  showItemInFolder: shell.showItemInFolder,
})

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

function isWindowAlive(win) {
  return Boolean(win) && (typeof win.isDestroyed !== 'function' || win.isDestroyed() === false)
}

function createContentHash(content = '') {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

function normalizeComparablePath(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    return null
  }

  const normalizedPath = targetPath.trim()
  if (/^[a-z]:[\\/]/i.test(normalizedPath) || normalizedPath.startsWith('\\\\')) {
    return path.win32.resolve(normalizedPath.replaceAll('/', '\\')).toLowerCase()
  }

  return path.posix.resolve(normalizedPath.replaceAll('\\', '/'))
}

function createExternalWatchState() {
  return fileWatchUtil.createWatchState()
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
  return documentSessionStore.getSession(winInfo.sessionId)
    || documentSessionStore.getSessionByWindowId(winInfo.id)
}

function publishSnapshotChanged(winInfo, snapshot) {
  if (!winInfo?.id) {
    return null
  }
  return windowSessionBridge.publishSnapshotChanged({
    windowId: winInfo.id,
    snapshot,
  })
}

function publishWindowMessage(winInfo, data) {
  if (!winInfo?.id || !data) {
    return null
  }
  return windowSessionBridge.publishMessage({
    windowId: winInfo.id,
    data,
  })
}

function getSnapshotSignature(snapshot) {
  return JSON.stringify(snapshot || null)
}

function syncSessionFromWinInfo(winInfo) {
  const session = getSessionByWinInfo(winInfo)
  if (!session || !winInfo) {
    return session
  }

  // Task 2 起，winInfo 不再反向覆盖 documentSource / diskSnapshot / saved 真相。
  // 这里只保留“把 session 当前真相同步回兼容镜像”的职责。
  return session
}

function syncWinInfoFromSession(winInfo, session) {
  if (!winInfo || !session) {
    return
  }

  winInfo.forceClose = session.closeRuntime.forceClose
}

function defineCompatPathAccessor(winInfo, initialPath = null) {
  let compatPathOverride = typeof initialPath === 'string' && initialPath.trim() !== ''
    ? initialPath
    : null

  Object.defineProperty(winInfo, 'path', {
    enumerable: true,
    configurable: true,
    get() {
      const session = getSessionByWinInfo(winInfo)
      return session?.documentSource?.path || compatPathOverride
    },
    set(value) {
      compatPathOverride = typeof value === 'string' && value.trim() !== ''
        ? value
        : null
    },
  })
}

function updateSessionForLegacyExternalEvent(winInfo, updater) {
  const session = getSessionByWinInfo(winInfo)
  if (!session || typeof updater !== 'function') {
    return null
  }

  updater(session)
  documentSessionStore.replaceSession(session)
  syncWinInfoFromSession(winInfo, session)
  return session
}

function ensureLegacyExternalWatchPending(winInfo, {
  version,
  versionHash,
  content,
}) {
  if (!winInfo?.externalWatch) {
    return null
  }

  const normalizedVersion = Number.isFinite(version)
    ? version
    : ((winInfo.externalWatch.currentVersion || 0) + 1)
  winInfo.externalWatch.currentVersion = Math.max(
    winInfo.externalWatch.currentVersion || 0,
    normalizedVersion,
  )
  winInfo.externalWatch.pendingChange = {
    version: normalizedVersion,
    versionHash,
    content,
  }
  return winInfo.externalWatch.pendingChange
}

function getLegacyPendingVersion(winInfo, previousPendingChange, nextVersionHash) {
  const legacyPendingChange = winInfo?.externalWatch?.pendingChange
  if (Number.isFinite(legacyPendingChange?.version)
    && legacyPendingChange?.versionHash === nextVersionHash) {
    return legacyPendingChange.version
  }

  if (Number.isFinite(previousPendingChange?.version)) {
    return previousPendingChange.version + 1
  }

  if (Number.isFinite(winInfo?.externalWatch?.currentVersion)) {
    return (winInfo.externalWatch.currentVersion || 0) + 1
  }

  return 1
}

function resetLegacyExternalWatchHistory(externalWatch) {
  if (!externalWatch) {
    return
  }

  externalWatch.currentVersion = 0
  externalWatch.lastInternalSaveAt = 0
  externalWatch.lastInternalSavedVersion = null
  externalWatch.recentInternalSaves = []
  externalWatch.lastHandledVersionHash = null
  externalWatch.pendingChange = null
  externalWatch.fileExists = false
}

function applyLegacyMissingToSession(winInfo) {
  const now = Date.now()
  return updateSessionForLegacyExternalEvent(winInfo, (session) => {
    session.documentSource.exists = false
    session.documentSource.lastKnownStat = null

    // 缺失事件要把磁盘基线重置为空文件，
    // 但不能覆盖用户当前编辑内容。
    session.diskSnapshot.content = ''
    session.diskSnapshot.versionHash = createContentHash('')
    session.diskSnapshot.exists = false
    session.diskSnapshot.stat = null
    session.diskSnapshot.observedAt = now
    session.diskSnapshot.source = 'legacy-watch-missing'

    if (session.externalRuntime) {
      session.externalRuntime.pendingExternalChange = null
      session.externalRuntime.resolutionState = 'missing'
      session.externalRuntime.lastResolutionResult = 'missing'
      session.externalRuntime.lastKnownDiskVersionHash = session.diskSnapshot.versionHash
    }

    if (session.watchRuntime) {
      session.watchRuntime.fileExists = false
    }
  })
}

function applyLegacyExternalDiskToSession(winInfo, change, { applyToEditor = false } = {}) {
  const observedAt = Number.isFinite(change?.observedAt) ? change.observedAt : Date.now()
  const nextContent = change?.content ?? ''
  const nextVersionHash = change?.versionHash || createContentHash(nextContent)
  return updateSessionForLegacyExternalEvent(winInfo, (session) => {
    session.documentSource.exists = true
    session.documentSource.lastKnownStat = change?.stat || null

    session.diskSnapshot.content = nextContent
    session.diskSnapshot.versionHash = nextVersionHash
    session.diskSnapshot.exists = true
    session.diskSnapshot.stat = change?.stat || null
    session.diskSnapshot.observedAt = observedAt
    session.diskSnapshot.source = 'legacy-watch-change'

    if (applyToEditor) {
      session.editorSnapshot.content = nextContent
      session.editorSnapshot.revision = (session.editorSnapshot.revision || 0) + 1
      session.editorSnapshot.updatedAt = observedAt
    }

    if (session.externalRuntime) {
      session.externalRuntime.lastKnownDiskVersionHash = nextVersionHash
      if (applyToEditor) {
        session.externalRuntime.pendingExternalChange = null
        session.externalRuntime.resolutionState = 'resolved'
        session.externalRuntime.lastResolutionResult = 'applied'
      }
    }

    if (session.watchRuntime) {
      session.watchRuntime.fileExists = true
    }
  })
}

function applyLegacyPendingExternalChangeToSession(winInfo, change) {
  const observedAt = Number.isFinite(change?.observedAt) ? change.observedAt : Date.now()
  const nextContent = change?.content ?? ''
  const nextVersionHash = change?.versionHash || createContentHash(nextContent)
  const watchingPath = change?.watchingPath || winInfo?.path || null

  return updateSessionForLegacyExternalEvent(winInfo, (session) => {
    const previousPendingChange = session.externalRuntime?.pendingExternalChange || null
    const pendingVersion = getLegacyPendingVersion(winInfo, previousPendingChange, nextVersionHash)

    // legacy watcher 提醒链路虽然还没有完全切到 watchCoordinator，
    // 但 renderer 已经改成只看 session snapshot。
    // 因此这里必须先把“待处理外部版本”写进 session 真相，不能再依赖额外的 legacy 事件补洞。
    session.externalRuntime.pendingExternalChange = {
      version: pendingVersion,
      versionHash: nextVersionHash,
      diskContent: nextContent,
      diskStat: change?.stat || null,
      detectedAt: observedAt,
      watchBindingToken: Number.isFinite(change?.bindingToken) ? change.bindingToken : null,
      watchingPath,
      comparablePath: normalizeComparablePath(watchingPath),
    }
    session.externalRuntime.resolutionState = 'pending-user'

    if (previousPendingChange && previousPendingChange.versionHash !== nextVersionHash) {
      session.externalRuntime.lastResolutionResult = 'superseded'
    }

    ensureLegacyExternalWatchPending(winInfo, {
      version: pendingVersion,
      versionHash: nextVersionHash,
      content: nextContent,
    })
  })
}

function resolveLegacyPendingExternalChange(winInfo, {
  versionHash,
  resolutionResult = 'noop',
}) {
  return updateSessionForLegacyExternalEvent(winInfo, (session) => {
    if (!session.externalRuntime?.pendingExternalChange) {
      return
    }

    // legacy 路径也必须遵守和 watchCoordinator 一致的收敛语义：
    // 一旦当前编辑内容已经和磁盘真相重新一致，就不能再保留旧 pending，
    // 否则 renderer 会在 saved=true 时仍看到过期 externalPrompt。
    session.externalRuntime.pendingExternalChange = null
    session.externalRuntime.resolutionState = 'resolved'
    session.externalRuntime.lastResolutionResult = resolutionResult
    session.externalRuntime.lastHandledVersionHash = versionHash || null
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
      now: Date.now(),
    })
  }

  if (filePath && isRecent) {
    return createRecentMissingSession({
      sessionId,
      missingPath: filePath,
      now: Date.now(),
    })
  }

  const draftSession = createDraftSession({
    sessionId,
    now: Date.now(),
  })

  if (filePath) {
    draftSession.documentSource.missingPath = filePath
    draftSession.documentSource.missingReason = MISSING_PATH_REASON.OPEN_TARGET_MISSING
  }

  return draftSession
}

function registerSessionForWindow(winInfo, session) {
  documentSessionStore.createSession(session)
  documentSessionStore.bindWindowToSession({
    windowId: winInfo.id,
    sessionId: session.sessionId,
  })
  winInfo.sessionId = session.sessionId
  syncWinInfoFromSession(winInfo, session)
  publishSnapshotChanged(winInfo)
}

function stopExternalWatch(winInfo) {
  if (!winInfo?.externalWatch) {
    return true
  }
  fileWatchUtil.stopWatching(winInfo.externalWatch)
  return winInfo.externalWatch.watcher === null && winInfo.externalWatch.subscription === null
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

function wasWatchEventAccepted(previousObservedFloor, dispatchResult, observedAt) {
  const nextObservedFloor = Number.isFinite(dispatchResult?.session?.watchRuntime?.eventFloorObservedAt)
    ? dispatchResult.session.watchRuntime.eventFloorObservedAt
    : 0

  if (Number.isFinite(observedAt)) {
    return nextObservedFloor === observedAt && nextObservedFloor > previousObservedFloor
  }

  return nextObservedFloor > previousObservedFloor
}

function settleExternalWatchPendingChangeIfNeeded(winInfo, {
  versionHash,
  previousObservedFloor,
  observedAt,
  dispatchResult,
}) {
  if (!winInfo?.externalWatch || !versionHash) {
    return
  }

  if (!wasWatchEventAccepted(previousObservedFloor, dispatchResult, observedAt)) {
    return
  }

  const pendingVersionHash = dispatchResult?.session?.externalRuntime?.pendingExternalChange?.versionHash || null
  if (pendingVersionHash === versionHash) {
    return
  }

  if (dispatchResult?.session?.externalRuntime?.lastHandledVersionHash === versionHash) {
    fileWatchUtil.settlePendingChange(winInfo.externalWatch, versionHash)
  }
}

function resetExternalWatchHistoryIfMissingAccepted(winInfo, {
  previousObservedFloor,
  observedAt,
  dispatchResult,
}) {
  if (!winInfo?.externalWatch) {
    return
  }

  if (!wasWatchEventAccepted(previousObservedFloor, dispatchResult, observedAt)) {
    return
  }

  if (dispatchResult?.session?.documentSource?.exists === false) {
    resetLegacyExternalWatchHistory(winInfo.externalWatch)
  }
}

function startExternalWatch(winInfo, options = {}) {
  const requestedPath = typeof options?.watchingPath === 'string' && options.watchingPath.trim() !== ''
    ? options.watchingPath
    : winInfo?.path
  if (!requestedPath) {
    return {
      ok: false,
      watchingPath: null,
      watchingDirectoryPath: null,
      error: new Error('watch path missing'),
    }
  }
  if (!winInfo.externalWatch) {
    winInfo.externalWatch = createExternalWatchState()
  }
  const bindingToken = Number.isFinite(options?.bindingToken)
    ? options.bindingToken
    : getCurrentWatchBindingToken(winInfo)
  const currentSubscriptionBindingToken = Number.isFinite(winInfo.externalWatch?.subscription?.bindingToken)
    ? winInfo.externalWatch.subscription.bindingToken
    : null
  if (winInfo.externalWatch.watchingPath === requestedPath
    && winInfo.externalWatch.watcher
    && currentSubscriptionBindingToken === bindingToken) {
    return {
      ok: true,
      watchingPath: requestedPath,
      watchingDirectoryPath: winInfo.externalWatch.watchingDirectoryPath || path.dirname(requestedPath),
    }
  }

  stopExternalWatch(winInfo)
  fileWatchUtil.startWatching({
    state: winInfo.externalWatch,
    filePath: requestedPath,
    bindingToken,
    watch,
    onExternalChange: async (change, meta = {}) => {
      const observedAt = meta.observedAt ?? change?.observedAt
      const previousObservedFloor = getCurrentWatchObservedFloor(winInfo)
      const diskContent = change?.content ?? change?.diskContent ?? ''
      const versionHash = change?.versionHash || createContentHash(diskContent)
      const dispatchResult = await dispatchCommand(winInfo, 'watch.file-changed', {
        bindingToken: meta.bindingToken ?? change?.bindingToken ?? bindingToken,
        watchingPath: meta.watchingPath ?? change?.watchingPath ?? requestedPath,
        observedAt,
        diskContent,
        diskStat: meta.diskStat ?? change?.diskStat ?? change?.stat ?? null,
      }, {
        publishSnapshotChanged: 'if-changed',
      })

      // live watcher 仍然依赖 fileWatchUtil 的去重状态来压制重复回调，
      // 因此当统一命令流已经把本次版本收敛成 noop / applied 时，
      // 这里必须同步把底层 pending 标记为 settled，不能留下悬挂的假 pending。
      settleExternalWatchPendingChangeIfNeeded(winInfo, {
        versionHash,
        previousObservedFloor,
        observedAt,
        dispatchResult,
      })
    },
    onMissing: async (error, meta = {}) => {
      const observedAt = meta.observedAt
      const previousObservedFloor = getCurrentWatchObservedFloor(winInfo)
      const dispatchResult = await dispatchCommand(winInfo, 'watch.file-missing', {
        bindingToken: meta.bindingToken ?? bindingToken,
        watchingPath: meta.watchingPath ?? requestedPath,
        observedAt,
        error,
      }, {
        publishSnapshotChanged: 'if-changed',
      })

      // 文件进入 missing 后，底层 watcher 的内部去重历史必须同时清空，
      // 否则恢复首轮如果撞上旧的 handled / internal-save hash，就会把真实恢复内容吞掉。
      resetExternalWatchHistoryIfMissingAccepted(winInfo, {
        previousObservedFloor,
        observedAt,
        dispatchResult,
      })
    },
    onRestored: async (diskContent, meta = {}) => {
      await dispatchCommand(winInfo, 'watch.file-restored', {
        bindingToken: meta.bindingToken ?? bindingToken,
        watchingPath: meta.watchingPath ?? requestedPath,
        observedAt: meta.observedAt,
        diskContent,
        diskStat: meta.diskStat ?? null,
      }, {
        publishSnapshotChanged: 'if-changed',
      })
    },
    onError: (error, meta = {}) => {
      // watcher 读盘失败必须进入统一命令流，才能触发 warning + 新 token + 自动重绑。
      // 这里只负责把底层 watcher 回调标准化后回流到 commandService，
      // 不能再直接旁路发 legacy message，否则重绑 effect 永远不会被执行。
      void dispatchCommand(winInfo, 'watch.error', {
        bindingToken: meta.bindingToken ?? bindingToken,
        watchingPath: meta.watchingPath ?? requestedPath,
        error,
      })
    },
  })
  return {
    ok: true,
    watchingPath: requestedPath,
    watchingDirectoryPath: winInfo.externalWatch.watchingDirectoryPath || path.dirname(requestedPath),
  }
}

function finalizeWindowClose(winInfo, id) {
  const closingSession = getSessionByWinInfo(winInfo)
  winInfo.lastClosedManualRequestCompletions = Array.isArray(closingSession?.saveRuntime?.completedManualRequests)
    ? [...closingSession.saveRuntime.completedManualRequests]
    : []
  stopExternalWatch(winInfo)
  if (winInfo?.sessionId) {
    documentSessionStore.destroySession(winInfo.sessionId)
  }
  deleteEditorWin(id)
  checkWinList()
}

function continueWindowClose(winInfo) {
  if (!isWindowAlive(winInfo?.win)) {
    return false
  }
  winInfo.allowImmediateClose = true
  winInfo.win.close()
  return true
}

function getSaveDialogTarget(winInfo) {
  // `pendingCompatSavePath` 是当前手动保存链路里唯一仍保留的 compat 路径：
  // 历史调用方若先把草稿目标路径塞进 `winInfo.path`，会在 `document.save`
  // 入口处先复制到这里，再由 `open-save-dialog` effect 一次性消化。
  // effect 层不再直接偷读 `winInfo.path`，避免“预选路径”旁路重新扩散回保存边界。
  const selectedByCompatLayer = typeof winInfo?.pendingCompatSavePath === 'string' && winInfo.pendingCompatSavePath.trim() !== ''
    ? winInfo.pendingCompatSavePath
    : null
  const selectedPath = selectedByCompatLayer || dialog.showSaveDialogSync({
    title: 'Save',
    filters: [
      { name: 'Markdown File', extensions: ['md'] },
    ],
  })
  winInfo.pendingCompatSavePath = null
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

  const publishSnapshotMode = options.publishSnapshotChanged || 'always'
  syncSessionFromWinInfo(winInfo)
  const previousSnapshot = publishSnapshotMode === 'if-changed'
    ? getSessionSnapshot(winInfo)
    : null
  const result = documentCommandService.dispatch({
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

async function applyEffects(winInfo, effects = []) {
  for (const effect of effects) {
    await documentEffectService.applyEffect({
      effect,
      winInfo,
      dispatchCommand: (command, payload) => dispatchCommand(winInfo, command, payload),
      getSaveDialogTarget: () => getSaveDialogTarget(winInfo),
      getCopyDialogTarget,
      continueWindowClose: () => continueWindowClose(winInfo),
      showUnsavedPrompt: () => {
        if (isWindowAlive(winInfo?.win)) {
          sendUtil.send(winInfo.win, { event: 'unsaved' })
        }
      },
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
      startExternalWatch: options => startExternalWatch(winInfo, options),
      markInternalSave: (content) => {
        if (winInfo.externalWatch?.watcher) {
          fileWatchUtil.markInternalSave(winInfo.externalWatch, content)
        }
      },
    })
  }
}

function handleFileMissing(winInfo) {
  if (!winInfo) {
    return 'ignored'
  }

  resetLegacyExternalWatchHistory(winInfo.externalWatch)
  applyLegacyMissingToSession(winInfo)
  publishSnapshotChanged(winInfo)
  return 'missing'
}

function handleExternalChange(winInfo, change, options = {}) {
  if (!winInfo || !change) {
    return 'ignored'
  }

  const diskUpdatedSession = applyLegacyExternalDiskToSession(winInfo, change)
  if (diskUpdatedSession && deriveDocumentSnapshot(diskUpdatedSession).saved) {
    resolveLegacyPendingExternalChange(winInfo, {
      versionHash: change?.versionHash || createContentHash(change?.content ?? ''),
      resolutionResult: 'noop',
    })
    publishSnapshotChanged(winInfo)
    if (winInfo.externalWatch) {
      fileWatchUtil.settlePendingChange(winInfo.externalWatch, change.versionHash)
    }
    return 'resolved'
  }

  const strategy = options.strategy || configUtil.getConfig().externalFileChangeStrategy || 'prompt'
  if (strategy === 'apply') {
    applyLegacyExternalDiskToSession(winInfo, change, {
      applyToEditor: true,
    })
    if (winInfo.externalWatch) {
      fileWatchUtil.settlePendingChange(winInfo.externalWatch, change.versionHash)
    }
    publishSnapshotChanged(winInfo)
    return 'applied'
  }

  applyLegacyPendingExternalChangeToSession(winInfo, change)
  publishSnapshotChanged(winInfo)
  return 'prompted'
}

function getLegacyPendingPromptVersion(winInfo) {
  return getSessionByWinInfo(winInfo)?.externalRuntime?.pendingExternalChange?.version ?? null
}

async function executeExternalResolutionCommand(winInfo, command, payload = {}) {
  const beforePendingVersion = getLegacyPendingPromptVersion(winInfo)
  const result = await dispatchCommand(winInfo, command, payload)
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
    fileWatchUtil.settlePendingChange(winInfo.externalWatch, settledVersionHash)
  } else if (isIgnored && winInfo?.externalWatch) {
    fileWatchUtil.ignorePendingChange(winInfo.externalWatch)
  }

  return {
    commandResult: result,
    handledPending,
    isApplied,
    isIgnored,
  }
}

async function handleLocalResourceLinkOpen(win, winInfo, resourceUrl) {
  const openResult = await executeResourceCommand(winInfo, 'document.resource.open-in-folder', resourceUrl)
  if (openResult.ok !== true) {
    const messageKey = resourceFileUtil.getLocalResourceFailureMessageKey(openResult.reason)
    if (messageKey) {
      sendUtil.send(win, {
        event: 'message',
        data: {
          type: 'warning',
          content: messageKey,
        },
      })
    }
    return openResult
  }

  if (openResult.opened !== true) {
    const messageKey = resourceFileUtil.getLocalResourceFailureMessageKey(openResult.reason)
    if (messageKey) {
      sendUtil.send(win, {
        event: 'message',
        data: {
          type: 'warning',
          content: messageKey,
        },
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

async function executeDocumentSaveCommand(winInfo) {
  const session = getSessionByWinInfo(winInfo)
  const hadDocumentPath = Boolean(session?.documentSource?.path)
  if (!session?.documentSource?.path && typeof winInfo?.path === 'string' && winInfo.path.trim() !== '') {
    winInfo.pendingCompatSavePath = winInfo.path
  }

  // 手动首存必须先回到标准命令流：
  // document.save -> open-save-dialog -> dialog.save-target-selected。
  // 兼容旧调用方预先塞到 winInfo.path 的目标路径，不再通过 payload.path 直送命令层，
  // 而是留给 open-save-dialog effect 内部的 compat fallback 一次性消化。
  const saveCommandResult = await dispatchCommand(winInfo, 'document.save')
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
    publishWindowMessage(winInfo, {
      type: 'success',
      content: 'message.saveSuccessfully',
    })
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

function updateTempContent(winInfo, content) {
  // 编辑更新直接进入统一命令流，
  // Electron 侧其他模块如需读取最新正文，必须回到 session getter，而不是继续依赖旧镜像字段。
  dispatchCommand(winInfo, 'document.edit', {
    content,
  }).then(() => {})
}

function isPristineDraftWindow(winInfo) {
  const session = getSessionByWinInfo(winInfo)
  const snapshot = session ? deriveDocumentSnapshot(session) : null
  return Boolean(winInfo?.win)
    && session?.documentSource?.path === null
    && snapshot?.saved === true
}

function getSessionSnapshot(winInfo) {
  if (!winInfo?.id) {
    return null
  }
  return windowSessionBridge.getSessionSnapshot(winInfo.id)
}

function getDocumentContext(winInfo) {
  const session = getSessionByWinInfo(winInfo)
  const snapshot = session ? deriveDocumentSnapshot(session) : null
  const fallbackPath = typeof winInfo?.path === 'string' && winInfo.path.trim() !== ''
    ? winInfo.path
    : null
  const fallbackExists = winInfo?.exists === true
  const fallbackContent = typeof winInfo?.tempContent === 'string'
    ? winInfo.tempContent
    : ''

  return {
    // 统一把“当前窗口文档真相”收口成只读上下文，供仍在 Electron 侧运行的外围模块读取。
    // 优先级固定为 session/snapshot，其次才是少量兼容回退，避免外围模块继续各自偷读镜像字段。
    path: session?.documentSource?.path || fallbackPath,
    exists: snapshot?.exists ?? fallbackExists,
    content: snapshot?.content ?? session?.editorSnapshot?.content ?? fallbackContent,
    saved: snapshot?.saved === true,
    fileName: snapshot?.fileName || 'Unnamed',
  }
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

  // 资源命令单独分流到 documentResourceService，
  // 是为了把“当前 active session 上下文裁决”和“底层文件系统操作”固定收口到一条边界。
  // 这样旧 IPC 名称、新 IPC 名称、窗口内链接点击三条入口就不会再各自偷读 winInfo 状态。
  switch (command) {
    case 'document.resource.open-in-folder':
      return await documentResourceService.openInFolder({
        windowId: winInfo.id,
        payload,
      })

    case 'document.resource.delete-local':
      return await documentResourceService.deleteLocal({
        windowId: winInfo.id,
        payload,
      })

    case 'resource.get-info':
      return await documentResourceService.getInfo({
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

  if (command === 'resource.get-comparable-key') {
    // 比较 key 仍然保留同步语义，
    // 因为编辑区统计引用数和批量删除裁决都在同一次交互里立即完成，
    // 如果这里改成异步，旧逻辑会在“统计前先删文案/打开弹窗”之间产生新的竞态窗口。
    return documentResourceService.getComparableKey({
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
  const openedWinInfo = await createNew(targetPath, isRecent)
  if (sourceWinInfo && openedWinInfo && openedWinInfo !== sourceWinInfo && isPristineDraftWindow(sourceWinInfo)) {
    sourceWinInfo.win.close()
  }
  return {
    ok: true,
    reason: isRecent && sourceWinInfo === null && !openedWinInfo?.path ? 'recent-missing' : 'opened',
    path: targetPath,
    trigger,
    snapshot: openedWinInfo ? getSessionSnapshot(openedWinInfo) : null,
  }
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
    {
      const result = await dispatchCommand(winInfo, 'document.save-copy')
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
      const result = await documentEffectService.executeCommand({
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
      return result
    }

    default:
      return await dispatchCommand(winInfo, command, payload)
  }
}

function initializeSessionRuntime() {
  // 当前 runtime 仍以 winInfoUtil 内部单例存在。
  // main.js 显式调用这个入口的目的，是把“谁负责初始化这些单例”收敛到应用启动阶段，
  // 避免后续继续让 IPC 首次命中时隐式构建服务。
  return {
    store: documentSessionStore,
    commandService: documentCommandService,
    effectService: documentEffectService,
    windowBridge: windowSessionBridge,
    resourceService: documentResourceService,
  }
}

function notifyRecentListChanged(recentList) {
  return windowSessionBridge.publishRecentListChanged(recentList)
}

async function createNew(filePath, isRecent = false) {
  const normalizedFilePath = resolveDocumentOpenPath(filePath)
  const exists = Boolean(normalizedFilePath && await fs.pathExists(normalizedFilePath))
  if (exists) {
    await recent.add(normalizedFilePath)
    const existedSession = documentSessionStore.findSessionByComparablePath(normalizedFilePath)
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
  // `path` 仍对外保留，但已经降级为 compat 访问器：
  // 读时优先返回 session 真相，写时只记录旧调用方临时塞入的首存目标路径。
  defineCompatPathAccessor(winInfo, exists ? normalizedFilePath : null)
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
    const result = documentCommandService.dispatch({
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

    if (result.effects.some(effect => effect.type === 'close-window')) {
      finalizeWindowClose(currentWinInfo, id)
      return
    }

    finalizeWindowClose(currentWinInfo, id)
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
  getWinInfo: (win) => {
    if (typeof win === 'string') {
      return winInfoList.find(item => item.id === win)
    }
    return winInfoList.find(item => item.win === win)
  },
  getAll: () => {
    return winInfoList
  },
  getByWebContentsId: (webContentsId) => {
    return winInfoList.find(item => item.win.webContents.id === webContentsId)
  },
  getDocumentContext,
  getSessionSnapshot,
  handleLocalResourceLinkOpen,
  updateTempContent,
  handleExternalChange,
  handleFileMissing,
  startExternalWatch,
  stopExternalWatch,
}
