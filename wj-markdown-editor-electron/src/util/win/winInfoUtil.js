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

function isSaved(winInfo) {
  const session = getSessionByWinInfo(winInfo)
  if (!session) {
    return false
  }
  return deriveDocumentSnapshot(session).saved
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

function canUseMissingPathForDisplay(winInfo) {
  return Boolean(winInfo?.missingPath)
    && winInfo?.missingPathReason === MISSING_PATH_REASON.OPEN_TARGET_MISSING
}

function getDisplayPath(winInfo) {
  if (winInfo?.path) {
    return winInfo.path
  }
  return canUseMissingPathForDisplay(winInfo) ? winInfo.missingPath : null
}

function getDisplayFileName(winInfo) {
  return winInfo?.path ? path.basename(winInfo.path) : 'Unnamed'
}

function getFileInfoPayload(winInfo) {
  const session = getSessionByWinInfo(winInfo)
  const snapshot = session ? deriveDocumentSnapshot(session) : null
  return {
    // 这里明确以 session 快照为真相来源。
    // `winInfo.path/content/tempContent` 只是兼容镜像，不能再参与 saved/dirty 判断，
    // 否则很容易被旧调用方的直接赋值覆盖掉真正的保存态。
    fileName: snapshot?.fileName || getDisplayFileName(winInfo),
    content: snapshot?.content ?? winInfo.tempContent,
    saved: snapshot?.saved ?? isSaved(winInfo),
    path: snapshot?.displayPath ?? getDisplayPath(winInfo),
    exists: snapshot?.exists ?? winInfo.exists,
    isRecent: winInfo.isRecent,
  }
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

function syncSavedState(winInfo) {
  const saved = isSaved(winInfo)
  winInfo.lastNotifiedSavedState = saved

  // `winInfo.lastNotifiedSavedState` 仍然保留，方便旧 facade 在调试或兼容逻辑里拿到最近一次
  // 已投影的保存态镜像；真正发给 renderer 的文档状态只能走 `document.snapshot.changed`。
  // 否则这里一旦再次直接推事件，就会把已经收敛到 bridge 的单一真相重新拆成两套出口。
  return saved
}

function publishSnapshotChanged(winInfo) {
  if (!winInfo?.id) {
    return null
  }
  return windowSessionBridge.publishSnapshotChanged({
    windowId: winInfo.id,
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

  const snapshot = deriveDocumentSnapshot(session)
  winInfo.path = session.documentSource.path
  winInfo.exists = session.documentSource.exists
  winInfo.missingPath = session.documentSource.missingPath
  winInfo.missingPathReason = session.documentSource.missingReason
  winInfo.tempContent = session.editorSnapshot.content
  winInfo.content = session.diskSnapshot.content
  winInfo.forceClose = session.closeRuntime.forceClose
  winInfo.lastSnapshot = snapshot
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

function markLegacyRestoredInSession(winInfo, diskContent = '', meta = {}) {
  const observedAt = Number.isFinite(meta?.observedAt) ? meta.observedAt : Date.now()
  const restoredContent = diskContent ?? ''
  const restoredVersionHash = createContentHash(restoredContent)
  return updateSessionForLegacyExternalEvent(winInfo, (session) => {
    session.documentSource.exists = true
    session.documentSource.lastKnownStat = null

    // 恢复事件自带当前磁盘内容时，这里必须直接把磁盘基线恢复回来。
    // 否则一旦后续 file-changed 因旧去重状态被 fileWatchUtil 吞掉，
    // 会话就会卡在 documentSource.exists=true 但 diskSnapshot.exists=false 的不一致态。
    session.diskSnapshot.content = restoredContent
    session.diskSnapshot.versionHash = restoredVersionHash
    session.diskSnapshot.exists = true
    session.diskSnapshot.stat = null
    session.diskSnapshot.observedAt = observedAt
    session.diskSnapshot.source = 'legacy-watch-restored'

    if (session.externalRuntime) {
      session.externalRuntime.resolutionState = 'restored'
      session.externalRuntime.pendingExternalChange = null
      session.externalRuntime.lastKnownDiskVersionHash = restoredVersionHash
    }

    if (session.watchRuntime) {
      session.watchRuntime.fileExists = true
    }
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

function startExternalWatch(winInfo) {
  if (!winInfo?.path) {
    return false
  }
  if (!winInfo.externalWatch) {
    winInfo.externalWatch = createExternalWatchState()
  }
  if (winInfo.externalWatch.watchingPath === winInfo.path && winInfo.externalWatch.watcher) {
    return true
  }

  stopExternalWatch(winInfo)
  fileWatchUtil.startWatching({
    state: winInfo.externalWatch,
    filePath: winInfo.path,
    watch,
    onExternalChange: (change, meta = {}) => {
      handleExternalChange(winInfo, {
        ...change,
        bindingToken: meta.bindingToken ?? change?.bindingToken,
        watchingPath: meta.watchingPath ?? change?.watchingPath,
        observedAt: meta.observedAt ?? change?.observedAt,
      })
    },
    onMissing: (_error, meta = {}) => {
      handleFileMissing(winInfo, meta)
    },
    onRestored: (diskContent, meta = {}) => {
      markLegacyRestoredInSession(winInfo, diskContent, meta)

      // “文件已恢复”本身就是一个必须立即投影给 renderer 的状态变化。
      // 如果这里只更新 session 而不推 snapshot，后续首次读盘又因为 internal-save / handled 去重被吞掉，
      // 界面就会继续停在旧的 missing 态，看起来像是文件从未恢复。
      syncSavedState(winInfo)
      publishSnapshotChanged(winInfo)
    },
    onError: () => {
      sendUtil.send(winInfo.win, {
        event: 'message',
        data: {
          type: 'warning',
          content: 'message.fileExternalChangeReadFailed',
        },
      })
    },
  })
  return true
}

function finalizeWindowClose(winInfo, id) {
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
  const selectedByCompatLayer = typeof winInfo?.pendingCompatSavePath === 'string' && winInfo.pendingCompatSavePath.trim() !== ''
    ? winInfo.pendingCompatSavePath
    : (typeof winInfo.path === 'string' && winInfo.path.trim() !== ''
      && !getSessionByWinInfo(winInfo)?.documentSource?.path
        ? winInfo.path
        : null)
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

async function dispatchCommand(winInfo, command, payload) {
  if (!winInfo) {
    return null
  }

  syncSessionFromWinInfo(winInfo)
  const result = documentCommandService.dispatch({
    windowId: winInfo.id,
    command,
    payload,
  })
  syncWinInfoFromSession(winInfo, result.session)
  syncSavedState(winInfo)
  publishSnapshotChanged(winInfo)
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
      shouldRebindExternalWatchAfterSave: () => shouldRebindExternalWatchAfterSave(winInfo),
      startExternalWatch: () => startExternalWatch(winInfo),
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

  winInfo.exists = false
  resetLegacyExternalWatchHistory(winInfo.externalWatch)
  applyLegacyMissingToSession(winInfo)
  syncSavedState(winInfo)
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
    syncSavedState(winInfo)
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
    syncSavedState(winInfo)
    publishSnapshotChanged(winInfo)
    return 'applied'
  }

  applyLegacyPendingExternalChangeToSession(winInfo, change)
  syncSavedState(winInfo)
  publishSnapshotChanged(winInfo)
  return 'prompted'
}

function getLegacyPendingPromptVersion(winInfo) {
  return getSessionByWinInfo(winInfo)?.externalRuntime?.pendingExternalChange?.version ?? null
}

async function handleLegacyExternalCommand(winInfo, command, payload = {}) {
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

async function applyExternalPendingChange(winInfo, version) {
  const legacyResult = await handleLegacyExternalCommand(winInfo, 'document.external.apply', {
    version,
  })
  return legacyResult.isApplied
}

async function ignoreExternalPendingChange(winInfo, version) {
  const legacyResult = await handleLegacyExternalCommand(winInfo, 'document.external.ignore', {
    version,
  })
  return legacyResult.isIgnored
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

async function save(winInfo) {
  const session = getSessionByWinInfo(winInfo)
  const hadDocumentPath = Boolean(session?.documentSource?.path)
  if (!session?.documentSource?.path && typeof winInfo?.path === 'string' && winInfo.path.trim() !== '') {
    winInfo.pendingCompatSavePath = winInfo.path
  }

  // 手动首存必须先回到标准命令流：
  // document.save -> open-save-dialog -> dialog.save-target-selected。
  // 兼容旧调用方预先塞到 winInfo.path 的目标路径，不再通过 payload.path 直送命令层，
  // 而是留给 open-save-dialog effect 内部的 compat fallback 一次性消化。
  await dispatchCommand(winInfo, 'document.save')

  // legacy facade 的布尔返回值必须基于 effects 全部执行后的最终会话真相，
  // 否则只要这次保存真的走了 execute-save，前置快照一定还是 dirty。
  const finalSession = getSessionByWinInfo(winInfo)
  const finalSnapshot = finalSession ? deriveDocumentSnapshot(finalSession) : null
  const saved = Boolean(finalSession?.documentSource?.path && finalSnapshot?.saved)

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
  if (!hadDocumentPath && !finalSession?.documentSource?.path && !finalSession?.saveRuntime?.lastError) {
    publishWindowMessage(winInfo, {
      type: 'warning',
      content: 'message.cancelSave',
    })
  }

  return false
}

function updateTempContent(winInfo, content) {
  // 兼容层不再先改本地镜像再回写 session，
  // 而是直接把编辑命令送进命令层，随后统一由 session 快照反投影到 winInfo。
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

async function executeCommand(winInfo, command, payload) {
  switch (command) {
    case 'document.save':
      return await save(winInfo)

    case 'document.save-copy':
    {
      const result = await dispatchCommand(winInfo, 'document.save-copy')
      const finalSession = getSessionByWinInfo(winInfo)
      const copySaveRuntime = finalSession?.copySaveRuntime || {}

      // compat facade 需要把副本保存的终态重新映射成旧 renderer 的提示语义：
      // 成功/取消/失败必须三分，不能再把 same-path 失败误当成功，也不能让写盘失败静默吞掉。
      if (copySaveRuntime.lastResult === 'failed') {
        publishWindowMessage(winInfo, {
          type: copySaveRuntime.lastFailureReason === 'same-path' ? 'warning' : 'error',
          content: getCopySaveFailureMessage({
            reason: copySaveRuntime.lastFailureReason,
            error: copySaveRuntime.lastError,
          }),
        })
        return result
      }

      if (copySaveRuntime.lastResult === 'succeeded') {
        publishWindowMessage(winInfo, {
          type: 'success',
          content: 'message.saveAsSuccessfully',
        })
      } else {
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
      return (await handleLegacyExternalCommand(winInfo, command, payload || {})).commandResult

    case 'document.resource.open-in-folder':
    case 'document.resource.delete-local':
    case 'resource.get-info':
      return await executeResourceCommand(winInfo, command, payload)

    case 'resource.get-comparable-key':
      return executeResourceCommandSync(winInfo, command, payload)

    case 'document.request-open-dialog':
    case 'dialog.open-target-selected':
    case 'dialog.open-target-cancelled':
    case 'document.open-recent':
    case 'recent.get-list':
    case 'recent.remove':
    case 'recent.clear':
      return await documentEffectService.executeCommand({
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
  const exists = Boolean(filePath && await fs.pathExists(filePath))
  if (exists) {
    await recent.add(filePath)
    const existedSession = documentSessionStore.findSessionByComparablePath(filePath)
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

  const content = exists ? await fs.readFile(filePath, 'utf-8') : ''
  const winInfo = {
    id,
    win,
    sessionId: null,
    content,
    tempContent: content,
    path: exists ? filePath : null,
    missingPath: exists ? null : (filePath || null),
    missingPathReason: exists || !filePath ? null : MISSING_PATH_REASON.OPEN_TARGET_MISSING,
    exists,
    isRecent,
    externalWatch: createExternalWatchState(),
    lastNotifiedSavedState: true,
    allowImmediateClose: false,
    forceClose: false,
    lastSnapshot: null,
  }
  winInfoList.push(winInfo)

  const session = createInitialSession({
    sessionId: commonUtil.createId(),
    filePath,
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
    syncSavedState(currentWinInfo)
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
  getSessionSnapshot,
  getFileInfoPayload,
  handleLocalResourceLinkOpen,
  updateTempContent,
  handleExternalChange,
  handleFileMissing,
  startExternalWatch,
  stopExternalWatch,
  applyExternalPendingChange,
  ignoreExternalPendingChange,
  save,
}
