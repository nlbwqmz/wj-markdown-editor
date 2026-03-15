import { deriveDocumentSnapshot } from './documentSnapshotUtil.js'
import { createWatchCoordinator } from './watchCoordinator.js'

function ensureCloseRuntime(session) {
  if (!session.closeRuntime) {
    session.closeRuntime = {
      intent: null,
      promptReason: null,
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    }
  }
}

function ensureSaveRuntime(session) {
  if (!session.saveRuntime) {
    session.saveRuntime = {
      status: 'idle',
      inFlightJobId: null,
      inFlightRevision: null,
      inFlightBaseDiskVersionHash: null,
      requestedRevision: 0,
      trigger: null,
      lastError: null,
    }
  }
  if (!('pendingSelection' in session.saveRuntime)) {
    session.saveRuntime.pendingSelection = null
  }
  if (!('pendingSaveContext' in session.saveRuntime)) {
    session.saveRuntime.pendingSaveContext = null
  }
  if (!('inFlightBaseDiskVersionHash' in session.saveRuntime)) {
    // 命令层也要补齐这条字段，原因是 store 里可能还存在旧会话结构。
    // 这里不参与保存裁决，只负责保证任何命令进入前运行态字段完整，
    // 避免旧 session 在新保存逻辑里出现 undefined 分支。
    session.saveRuntime.inFlightBaseDiskVersionHash = null
  }
}

function resetCloseRuntime(session) {
  ensureCloseRuntime(session)
  session.closeRuntime.intent = null
  session.closeRuntime.promptReason = null
  session.closeRuntime.waitingSaveJobId = null
  session.closeRuntime.awaitingPathSelection = false
  session.closeRuntime.forceClose = false
}

function canAutoSave(config, trigger) {
  const autoSaveList = Array.isArray(config?.autoSave) ? config.autoSave : []
  return autoSaveList.includes(trigger)
}

function isDirty(session) {
  return deriveDocumentSnapshot(session).dirty
}

function getSessionByWindowIdOrThrow(store, windowId) {
  const session = store.getSessionByWindowId(windowId)
  if (!session) {
    throw new Error(`windowId 对应的 active session 不存在: ${windowId}`)
  }
  return session
}

export function createDocumentCommandService({
  store,
  saveCoordinator,
  getConfig = () => ({}),
  now = () => Date.now(),
}) {
  const watchCoordinator = createWatchCoordinator({ now })

  function dispatch({ windowId, command, payload }) {
    const session = getSessionByWindowIdOrThrow(store, windowId)
    ensureSaveRuntime(session)
    ensureCloseRuntime(session)
    watchCoordinator.prepareSession(session)
    const effects = []
    const config = getConfig()

    switch (command) {
      case 'document.edit':
        // 编辑命令只负责推进编辑快照与 revision，
        // 不允许直接把磁盘基线或 persistedSnapshot 一起改掉。
        session.editorSnapshot.content = payload?.content ?? ''
        session.editorSnapshot.revision = (session.editorSnapshot.revision || 0) + 1
        session.editorSnapshot.updatedAt = now()
        session.saveRuntime.requestedRevision = Math.max(
          session.saveRuntime.requestedRevision || 0,
          session.editorSnapshot.revision,
        )
        break

      case 'document.save':
        effects.push(...saveCoordinator.requestSave(session, {
          trigger: 'manual-save',
        }).effects)
        break

      case 'document.save-copy':
        effects.push(...saveCoordinator.requestCopySave(session).effects)
        break

      case 'window.blur':
        if (session.documentSource.path && isDirty(session) && canAutoSave(config, 'blur')) {
          effects.push(...saveCoordinator.requestSave(session, {
            trigger: 'blur-auto-save',
          }).effects)
        }
        break

      case 'document.request-close':
        if (session.closeRuntime.forceClose === true) {
          effects.push({
            type: 'close-window',
          })
          break
        }

        if (session.saveRuntime.inFlightJobId) {
          // 只要当前已经存在 document 本体保存任务，关闭链路就必须先走等待矩阵。
          // 这里故意放在 dirty 判断之前，避免 reviewer 指出的“当前看起来已保存就直接关闭，
          // 实际却绕过了 in-flight save 的等待/补写逻辑”。
          session.closeRuntime.intent = 'close'
          session.closeRuntime.promptReason = null
          session.closeRuntime.waitingSaveJobId = session.saveRuntime.inFlightJobId
          effects.push({
            type: 'hold-window-close',
          })
          break
        }

        if (!isDirty(session)) {
          resetCloseRuntime(session)
          effects.push({
            type: 'close-window',
          })
          break
        }

        session.closeRuntime.intent = 'close'
        session.closeRuntime.promptReason = null
        if (canAutoSave(config, 'close')) {
          if (!session.documentSource.path) {
            session.closeRuntime.awaitingPathSelection = true
          }

          const saveRequested = saveCoordinator.requestSave(session, {
            trigger: 'close-auto-save',
          })
          if (session.saveRuntime.inFlightJobId) {
            session.closeRuntime.waitingSaveJobId = session.saveRuntime.inFlightJobId
          }
          effects.push(
            {
              type: 'hold-window-close',
            },
            ...saveRequested.effects,
          )
          break
        }

        session.closeRuntime.promptReason = 'unsaved-changes'
        effects.push(
          {
            type: 'hold-window-close',
          },
          {
            type: 'show-unsaved-prompt',
          },
        )
        break

      case 'document.cancel-close':
        resetCloseRuntime(session)
        break

      case 'document.confirm-force-close':
        session.closeRuntime.intent = 'close'
        session.closeRuntime.forceClose = true
        effects.push({
          type: 'close-window',
        })
        break

      case 'dialog.save-target-selected': {
        session.closeRuntime.awaitingPathSelection = false
        const saveRequested = saveCoordinator.resolveSaveTarget(session, {
          path: payload?.path,
        })
        if (session.closeRuntime.intent === 'close' && session.saveRuntime.inFlightJobId) {
          session.closeRuntime.waitingSaveJobId = session.saveRuntime.inFlightJobId
        }
        effects.push(...saveRequested.effects)
        break
      }

      case 'dialog.save-target-cancelled':
        {
          const wasCloseFirstSave = session.closeRuntime.intent === 'close'
            && session.closeRuntime.awaitingPathSelection === true
          effects.push(...saveCoordinator.cancelPendingSaveTarget(session).effects)
          if (wasCloseFirstSave) {
            session.closeRuntime.intent = 'close'
            session.closeRuntime.promptReason = 'unsaved-changes'
            session.closeRuntime.waitingSaveJobId = null
            session.closeRuntime.awaitingPathSelection = false
            effects.push({
              type: 'show-unsaved-prompt',
            })
          }
        }
        break

      case 'dialog.copy-target-selected':
        effects.push(...saveCoordinator.resolveCopyTarget(session, {
          path: payload?.path,
        }).effects)
        break

      case 'dialog.copy-target-cancelled':
        effects.push(...saveCoordinator.cancelCopyTarget(session).effects)
        break

      case 'save.started':
        effects.push(...saveCoordinator.handleSaveStarted(session, payload).effects)
        break

      case 'save.succeeded':
        effects.push(...saveCoordinator.handleSaveSucceeded(session, payload).effects)
        effects.push(...watchCoordinator.reconcileAfterSave(session).effects)
        break

      case 'save.failed':
        effects.push(...saveCoordinator.handleSaveFailed(session, payload).effects)
        break

      case 'copy-save.succeeded':
        effects.push(...saveCoordinator.handleCopySaveSucceeded(session, payload).effects)
        break

      case 'copy-save.failed':
        effects.push(...saveCoordinator.handleCopySaveFailed(session, payload).effects)
        break

      case 'watch.file-changed':
      case 'watch.file-missing':
      case 'watch.file-restored':
      case 'watch.error':
      case 'watch.bound':
      case 'watch.unbound':
      case 'watch.rebind-failed':
      case 'document.external.apply':
      case 'document.external.ignore':
        effects.push(...watchCoordinator.dispatch(session, {
          command,
          payload,
          externalChangeStrategy: config.externalFileChangeStrategy || 'prompt',
        }).effects)
        break

      default:
        throw new Error(`未知命令: ${command}`)
    }

    store.replaceSession(session)

    return {
      session,
      snapshot: deriveDocumentSnapshot(session),
      effects,
    }
  }

  return {
    dispatch,
  }
}

export default {
  createDocumentCommandService,
}
