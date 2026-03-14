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
import {
  createBoundFileSession,
  createDraftSession,
  createRecentMissingSession,
} from '../document-session/documentSessionFactory.js'
import { createDocumentSessionStore } from '../document-session/documentSessionStore.js'
import { deriveDocumentSnapshot } from '../document-session/documentSnapshotUtil.js'
import { createSaveCoordinator } from '../document-session/saveCoordinator.js'
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
  const changed = winInfo.lastNotifiedSavedState !== saved
  winInfo.lastNotifiedSavedState = saved
  if (!winInfo?.win || !changed) {
    return saved
  }
  sendUtil.send(winInfo.win, { event: 'file-is-saved', data: saved })
  return saved
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
  const now = Date.now()
  const nextContent = change?.content ?? ''
  const nextVersionHash = change?.versionHash || createContentHash(nextContent)
  return updateSessionForLegacyExternalEvent(winInfo, (session) => {
    session.documentSource.exists = true
    session.documentSource.lastKnownStat = change?.stat || null

    session.diskSnapshot.content = nextContent
    session.diskSnapshot.versionHash = nextVersionHash
    session.diskSnapshot.exists = true
    session.diskSnapshot.stat = change?.stat || null
    session.diskSnapshot.observedAt = now
    session.diskSnapshot.source = 'legacy-watch-change'

    if (applyToEditor) {
      session.editorSnapshot.content = nextContent
      session.editorSnapshot.revision = (session.editorSnapshot.revision || 0) + 1
      session.editorSnapshot.updatedAt = now
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

function markLegacyRestoredInSession(winInfo, diskContent = '') {
  const now = Date.now()
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
    session.diskSnapshot.observedAt = now
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
    onExternalChange: (change) => {
      handleExternalChange(winInfo, change)
    },
    onMissing: () => {
      handleFileMissing(winInfo)
    },
    onRestored: (diskContent) => {
      markLegacyRestoredInSession(winInfo, diskContent)
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

function getFailedSaveMessage(trigger, error) {
  const errorDetail = typeof error?.message === 'string' && error.message
    ? ` ${error.message}`
    : ''
  const isAutoSave = trigger === 'blur-auto-save' || trigger === 'close-auto-save'
  if (configUtil.getConfig().language === 'en-US') {
    return isAutoSave ? `Auto save failed.${errorDetail}` : `Save failed.${errorDetail}`
  }
  return isAutoSave ? `自动保存失败。${errorDetail}` : `保存失败。${errorDetail}`
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

async function executeSaveJob(winInfo, saveJob) {
  await dispatchCommand(winInfo, 'save.started', {
    jobId: saveJob.jobId,
  })

  try {
    await fs.writeFile(saveJob.path, saveJob.content)
    await recent.add(saveJob.path)
    await dispatchCommand(winInfo, 'save.succeeded', {
      ...saveJob,
      savedAt: Date.now(),
      stat: null,
    })
    if (!shouldRebindExternalWatchAfterSave(winInfo)) {
      return
    }
    startExternalWatch(winInfo)
    if (winInfo.externalWatch?.watcher) {
      fileWatchUtil.markInternalSave(winInfo.externalWatch, saveJob.content)
    }
  } catch (error) {
    await dispatchCommand(winInfo, 'save.failed', {
      ...saveJob,
      error,
    })
  }
}

async function executeCopySaveJob(winInfo, saveJob) {
  try {
    await fs.writeFile(saveJob.path, saveJob.content)
    await dispatchCommand(winInfo, 'copy-save.succeeded', {
      path: saveJob.path,
    })
  } catch (error) {
    await dispatchCommand(winInfo, 'copy-save.failed', {
      reason: 'write-failed',
      path: saveJob.path,
      error,
    })
  }
}

async function applyEffects(winInfo, effects = []) {
  for (const effect of effects) {
    if (!effect) {
      continue
    }

    switch (effect.type) {
      case 'execute-save':
        await executeSaveJob(winInfo, effect.job)
        break

      case 'execute-copy-save':
        await executeCopySaveJob(winInfo, effect.job)
        break

      case 'open-save-dialog': {
        const selectedPath = getSaveDialogTarget(winInfo)
        if (selectedPath) {
          await dispatchCommand(winInfo, 'dialog.save-target-selected', {
            path: selectedPath,
          })
        } else {
          await dispatchCommand(winInfo, 'dialog.save-target-cancelled')
        }
        break
      }

      case 'open-copy-dialog': {
        const selectedPath = getCopyDialogTarget()
        if (selectedPath) {
          await dispatchCommand(winInfo, 'dialog.copy-target-selected', {
            path: selectedPath,
          })
        } else {
          await dispatchCommand(winInfo, 'dialog.copy-target-cancelled')
        }
        break
      }

      case 'dispatch-command':
        await dispatchCommand(winInfo, effect.command?.type, effect.command?.payload)
        break

      case 'hold-window-close':
        break

      case 'show-unsaved-prompt':
        if (isWindowAlive(winInfo?.win)) {
          sendUtil.send(winInfo.win, { event: 'unsaved' })
        }
        break

      case 'close-window':
        continueWindowClose(winInfo)
        break

      case 'notify-save-failed':
        if (isWindowAlive(winInfo?.win)) {
          sendUtil.send(winInfo.win, {
            event: 'message',
            data: {
              type: 'error',
              content: getFailedSaveMessage(effect.trigger, effect.error),
            },
          })
        }
        break

      default:
        break
    }
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
  sendUtil.send(winInfo.win, {
    event: 'file-missing',
    data: getFileInfoPayload(winInfo),
  })
  return 'missing'
}

function handleExternalChange(winInfo, change, options = {}) {
  if (!winInfo || !change) {
    return 'ignored'
  }

  const diskUpdatedSession = applyLegacyExternalDiskToSession(winInfo, change)
  if (diskUpdatedSession && deriveDocumentSnapshot(diskUpdatedSession).saved) {
    syncSavedState(winInfo)
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
    sendUtil.send(winInfo.win, {
      event: 'file-content-reloaded',
      data: getFileInfoPayload(winInfo),
    })
    return 'applied'
  }

  syncSavedState(winInfo)
  sendUtil.send(winInfo.win, {
    event: 'file-external-changed',
    data: {
      fileName: getFileInfoPayload(winInfo).fileName,
      version: change.version,
      localContent: winInfo.tempContent,
      externalContent: change.content,
    },
  })
  return 'prompted'
}

function applyExternalPendingChange(winInfo, version) {
  const pendingChange = winInfo?.externalWatch?.pendingChange
  if (!pendingChange || pendingChange.version !== version) {
    return false
  }
  applyLegacyExternalDiskToSession(winInfo, pendingChange, {
    applyToEditor: true,
  })
  if (winInfo.externalWatch) {
    fileWatchUtil.settlePendingChange(winInfo.externalWatch, pendingChange.versionHash)
  }
  syncSavedState(winInfo)
  sendUtil.send(winInfo.win, {
    event: 'file-content-reloaded',
    data: getFileInfoPayload(winInfo),
  })
  return true
}

function ignoreExternalPendingChange(winInfo, version) {
  const pendingChange = winInfo?.externalWatch?.pendingChange
  if (!pendingChange || pendingChange.version !== version) {
    return false
  }
  fileWatchUtil.ignorePendingChange(winInfo.externalWatch)
  return true
}

async function handleLocalResourceLinkOpen(win, winInfo, resourceUrl) {
  const openResult = await resourceFileUtil.openLocalResourceInFolder(winInfo, resourceUrl, shell.showItemInFolder)
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

async function save(winInfo) {
  const session = getSessionByWinInfo(winInfo)
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
  return Boolean(finalSession?.documentSource?.path && finalSnapshot?.saved)
}

function updateTempContent(winInfo, content) {
  // 兼容层不再先改本地镜像再回写 session，
  // 而是直接把编辑命令送进命令层，随后统一由 session 快照反投影到 winInfo。
  dispatchCommand(winInfo, 'document.edit', {
    content,
  }).then(() => {})
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
        return
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
}

export default {
  deleteEditorWin,
  createNew,
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
