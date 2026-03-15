import crypto from 'node:crypto'
import path from 'node:path'

function createContentHash(content = '') {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
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

  // `pendingSelection` 与 `pendingSaveContext` 是 Task 2 内部专用状态：
  // 1. `pendingSelection` 只表示“正在等用户选路径”
  // 2. `pendingSaveContext` 记录这次保存请求原本来自哪里，避免对话框返回后丢失 trigger
  if (!('pendingSelection' in session.saveRuntime)) {
    session.saveRuntime.pendingSelection = null
  }
  if (!('pendingSaveContext' in session.saveRuntime)) {
    session.saveRuntime.pendingSaveContext = null
  }
  if (!('inFlightBaseDiskVersionHash' in session.saveRuntime)) {
    // 这条字段只记录“当前 in-flight save 启动时，看到的磁盘版本基线”。
    // save.succeeded 只能拿它来判断 watcher 是否在保存期间已经推进到了更新版本，
    // 绝不能再拿“当前 diskSnapshot 和 lastKnownDiskVersionHash 恰好相等”这种易受竞态污染的条件兜底。
    session.saveRuntime.inFlightBaseDiskVersionHash = null
  }
}

function ensureCopySaveRuntime(session) {
  if (!session.copySaveRuntime) {
    // `copySaveRuntime` 是保存副本的独立运行态。
    // 它只负责追踪“当前是否在选副本路径 / 是否已有副本写盘任务”，
    // 明确禁止与 document 本体的 `saveRuntime` 共用字段，
    // 否则副本流程会把当前文档保存态误改成 idle / awaiting-path-selection。
    session.copySaveRuntime = {
      status: 'idle',
      activeJobId: null,
      pendingSelection: false,
      targetPath: null,
      lastError: null,
      lastResult: 'idle',
      lastFailureReason: null,
    }
  }
}

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

function resetCloseRuntime(session) {
  ensureCloseRuntime(session)
  session.closeRuntime.intent = null
  session.closeRuntime.promptReason = null
  session.closeRuntime.waitingSaveJobId = null
  session.closeRuntime.awaitingPathSelection = false
  session.closeRuntime.forceClose = false
}

function isActiveCloseWaitingJob(session, jobId) {
  ensureCloseRuntime(session)
  return session.closeRuntime.intent === 'close'
    && session.closeRuntime.waitingSaveJobId === jobId
}

function serializeError(error) {
  if (!error) {
    return null
  }

  return {
    name: typeof error.name === 'string' ? error.name : 'Error',
    message: typeof error.message === 'string' ? error.message : String(error),
  }
}

function normalizeComparablePath(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    return null
  }

  const trimmedPath = targetPath.trim()
  if (/^[a-z]:[\\/]/i.test(trimmedPath) || trimmedPath.startsWith('\\\\')) {
    return path.win32.resolve(trimmedPath.replaceAll('/', '\\')).toLowerCase()
  }

  return path.posix.resolve(trimmedPath.replaceAll('\\', '/'))
}

function createSaveJob({ session, path: targetPath, trigger, createJobId }) {
  return {
    jobId: createJobId(),
    sessionId: session.sessionId,
    revision: session.editorSnapshot.revision,
    content: session.editorSnapshot.content,
    path: targetPath,
    trigger,
  }
}

function getLatestKnownDiskVersionHash(session) {
  if (typeof session.externalRuntime?.lastKnownDiskVersionHash === 'string'
    && session.externalRuntime.lastKnownDiskVersionHash) {
    return session.externalRuntime.lastKnownDiskVersionHash
  }

  if (typeof session.diskSnapshot?.versionHash === 'string' && session.diskSnapshot.versionHash) {
    return session.diskSnapshot.versionHash
  }

  return null
}

function clearInFlightSaveRuntime(session) {
  session.saveRuntime.inFlightJobId = null
  session.saveRuntime.inFlightRevision = null
  session.saveRuntime.inFlightBaseDiskVersionHash = null
}

function isSessionSaved(session) {
  return session.editorSnapshot.content === session.diskSnapshot.content
    && Boolean(session.documentSource?.exists) === Boolean(session.diskSnapshot?.exists)
}

function buildUnsavedPromptResult(session) {
  ensureCloseRuntime(session)

  // 关闭链路等待的 save job 返回“成功”并不等于当前文档已经可安全关闭。
  // 只要保存完成后派生态仍然是 dirty，例如 watcher 已先推进到外部版本，
  // 就必须回到未保存确认态，而不是直接关窗。
  session.closeRuntime.intent = 'close'
  session.closeRuntime.promptReason = 'unsaved-changes'
  session.closeRuntime.waitingSaveJobId = null
  session.closeRuntime.awaitingPathSelection = false

  return {
    session,
    effects: [
      {
        type: 'show-unsaved-prompt',
      },
    ],
  }
}

function shouldStartSave(session, targetPath) {
  const requestedPath = targetPath || session.documentSource?.path || null
  if (!requestedPath) {
    return false
  }

  // “内容相同”不代表一定不需要写盘：
  // 1. 草稿首次保存需要真正创建文件
  // 2. 文件缺失后内容恰好为空，也仍然要恢复文件身份
  if (session.editorSnapshot.content !== session.diskSnapshot.content) {
    return true
  }

  if (session.documentSource?.exists !== true || session.diskSnapshot?.exists !== true) {
    return true
  }

  return false
}

function beginSave(session, { trigger, path: targetPath, createJobId }) {
  ensureSaveRuntime(session)

  session.saveRuntime.requestedRevision = Math.max(
    session.saveRuntime.requestedRevision || 0,
    session.editorSnapshot.revision || 0,
  )

  if (session.saveRuntime.inFlightJobId) {
    return {
      session,
      effects: [],
    }
  }

  if (!shouldStartSave(session, targetPath)) {
    session.saveRuntime.status = 'idle'
    session.saveRuntime.trigger = trigger
    session.saveRuntime.lastError = null
    session.saveRuntime.inFlightBaseDiskVersionHash = null
    return {
      session,
      effects: [],
    }
  }

  const saveJob = createSaveJob({
    session,
    path: targetPath || session.documentSource.path,
    trigger,
    createJobId,
  })

  session.saveRuntime.status = 'queued'
  session.saveRuntime.inFlightJobId = saveJob.jobId
  session.saveRuntime.inFlightRevision = saveJob.revision
  session.saveRuntime.inFlightBaseDiskVersionHash = getLatestKnownDiskVersionHash(session)
  session.saveRuntime.trigger = trigger
  session.saveRuntime.lastError = null

  return {
    session,
    effects: [
      {
        type: 'execute-save',
        job: saveJob,
      },
    ],
  }
}

function continueQueuedSaveIfNeeded(session, {
  createJobId,
  preferredTrigger,
}) {
  ensureSaveRuntime(session)
  if ((session.editorSnapshot.revision || 0) <= (session.persistedSnapshot.revision || 0)) {
    session.saveRuntime.status = 'idle'
    clearInFlightSaveRuntime(session)
    session.saveRuntime.trigger = null
    return {
      session,
      effects: [],
    }
  }

  const nextTrigger = preferredTrigger || session.saveRuntime.trigger || 'manual-save'
  return beginSave(session, {
    trigger: nextTrigger,
    path: session.documentSource.path,
    createJobId,
  })
}

export function createSaveCoordinator({
  createJobId = () => `save-job-${Date.now()}`,
  now = () => Date.now(),
} = {}) {
  return {
    /**
     * 统一发起“当前文档本体保存”。
     *
     * 这里不关心调用入口来自手动保存、blur 自动保存还是 close 自动保存；
     * 只要最后落到这里，就全部共享同一套冻结快照与并发裁决。
     */
    requestSave(session, {
      trigger,
      path: targetPath = null,
    }) {
      ensureSaveRuntime(session)

      // 单 session 单写盘的约束必须先于“草稿首次保存要选路径”生效。
      // 否则未命名草稿在第一次 save 已经拿到目标路径并进入 in-flight 写盘后，
      // 因为 documentSource.path 还没等到 save.succeeded 回填，就会被误判成“又要首次保存”，
      // 继而再次弹出保存对话框，破坏当前进行中的保存态。
      if (session.saveRuntime.inFlightJobId) {
        return {
          session,
          effects: [],
        }
      }

      // 未命名草稿的首次保存必须先进入标准“选路径”命令流。
      // 即使兼容层已经暂存了目标路径，也只能通过 open-save-dialog effect
      // 在外层消化，再以 dialog.save-target-selected 回流；不能在这里直接起写盘 job。
      if (!session.documentSource?.path) {
        session.saveRuntime.status = 'awaiting-path-selection'
        session.saveRuntime.trigger = trigger
        session.saveRuntime.pendingSelection = {
          type: 'save',
        }
        session.saveRuntime.pendingSaveContext = {
          trigger,
        }
        return {
          session,
          effects: [
            {
              type: 'open-save-dialog',
              trigger,
            },
          ],
        }
      }

      return beginSave(session, {
        trigger,
        path: targetPath,
        createJobId,
      })
    },

    requestCopySave(session) {
      ensureCopySaveRuntime(session)
      session.copySaveRuntime.status = 'awaiting-path-selection'
      session.copySaveRuntime.pendingSelection = true
      session.copySaveRuntime.targetPath = null
      session.copySaveRuntime.lastError = null
      session.copySaveRuntime.lastResult = 'pending'
      session.copySaveRuntime.lastFailureReason = null

      return {
        session,
        effects: [
          {
            type: 'open-copy-dialog',
          },
        ],
      }
    },

    resolveSaveTarget(session, { path: targetPath }) {
      ensureSaveRuntime(session)

      // 迟到的对话框回流不能覆盖当前 in-flight save 的运行态。
      // 如果这里先把 status 改成 idle，再因为 beginSave() 发现已有 in-flight job 而不启动新写盘，
      // 就会把正在执行的保存错误伪装成“空闲态”。
      if (session.saveRuntime.inFlightJobId) {
        return {
          session,
          effects: [],
        }
      }

      const pendingSaveContext = session.saveRuntime.pendingSaveContext || {}

      session.saveRuntime.pendingSelection = null
      session.saveRuntime.pendingSaveContext = null
      session.saveRuntime.status = 'idle'

      return beginSave(session, {
        trigger: pendingSaveContext.trigger || 'manual-save',
        path: targetPath,
        createJobId,
      })
    },

    cancelPendingSaveTarget(session) {
      ensureSaveRuntime(session)

      // 迟到的“取消选路径”回流不能打坏已经启动的首存 job。
      // 一旦 save job 已经进入 in-flight，当前 saveRuntime 就应继续以该 job 为准，
      // 不能再被旧对话框事件回写成 idle/trigger=null。
      if (session.saveRuntime.inFlightJobId) {
        return {
          session,
          effects: [],
        }
      }

      session.saveRuntime.pendingSelection = null
      session.saveRuntime.pendingSaveContext = null
      session.saveRuntime.status = 'idle'
      session.saveRuntime.trigger = null

      return {
        session,
        effects: [],
      }
    },

    resolveCopyTarget(session, { path: targetPath }) {
      ensureCopySaveRuntime(session)
      session.copySaveRuntime.pendingSelection = false
      session.copySaveRuntime.status = 'idle'
      session.copySaveRuntime.targetPath = targetPath
      session.copySaveRuntime.lastError = null
      session.copySaveRuntime.lastResult = 'pending'
      session.copySaveRuntime.lastFailureReason = null

      if (normalizeComparablePath(targetPath) && normalizeComparablePath(targetPath) === normalizeComparablePath(session.documentSource?.path)) {
        return {
          session,
          effects: [
            {
              type: 'dispatch-command',
              command: {
                type: 'copy-save.failed',
                payload: {
                  reason: 'same-path',
                  path: targetPath,
                },
              },
            },
          ],
        }
      }

      const copySaveJob = {
        jobId: createJobId(),
        sessionId: session.sessionId,
        revision: session.editorSnapshot.revision,
        content: session.editorSnapshot.content,
        path: targetPath,
        trigger: 'copy-save',
      }
      session.copySaveRuntime.activeJobId = copySaveJob.jobId

      return {
        session,
        effects: [
          {
            type: 'execute-copy-save',
            job: copySaveJob,
          },
        ],
      }
    },

    cancelCopyTarget(session) {
      ensureCopySaveRuntime(session)
      session.copySaveRuntime.pendingSelection = false
      session.copySaveRuntime.status = 'idle'
      session.copySaveRuntime.targetPath = null
      session.copySaveRuntime.lastError = null
      session.copySaveRuntime.lastResult = 'cancelled'
      session.copySaveRuntime.lastFailureReason = null

      return {
        session,
        effects: [],
      }
    },

    handleSaveStarted(session, payload) {
      ensureSaveRuntime(session)
      if (payload?.jobId !== session.saveRuntime.inFlightJobId) {
        return {
          session,
          effects: [],
        }
      }

      session.saveRuntime.status = 'running'
      return {
        session,
        effects: [],
      }
    },

    handleSaveSucceeded(session, payload) {
      ensureSaveRuntime(session)
      ensureCloseRuntime(session)

      if (payload?.jobId !== session.saveRuntime.inFlightJobId) {
        return {
          session,
          effects: [],
        }
      }

      const savedAt = Number.isFinite(payload.savedAt) ? payload.savedAt : now()
      const previousPath = session.documentSource.path
      const previousExists = session.documentSource.exists
      const savedHash = createContentHash(payload.content)
      const closeWaitingCurrentJob = isActiveCloseWaitingJob(session, payload.jobId)
      const inFlightBaseDiskVersionHash = session.saveRuntime.inFlightBaseDiskVersionHash
      const latestKnownDiskVersionHash = getLatestKnownDiskVersionHash(session)

      session.persistedSnapshot.content = payload.content
      session.persistedSnapshot.revision = payload.revision
      session.persistedSnapshot.savedAt = savedAt
      session.persistedSnapshot.path = payload.path
      session.persistedSnapshot.jobId = payload.jobId

      // 保存成功后，当前文档身份必须立即恢复成“存在且已绑定路径”的状态。
      session.documentSource.path = payload.path
      session.documentSource.exists = true
      session.documentSource.missingPath = null
      session.documentSource.missingReason = null
      session.documentSource.lastKnownStat = payload.stat || null

      // `save.succeeded` 只能在两种场景下回写 diskSnapshot：
      // 1. watcher 自保存启动后从未把磁盘版本推进到新的 hash，仍停留在本次 save 开始时冻结的基线
      // 2. watcher 已经明确观测到的最新磁盘版本就是本次保存写出的版本
      //
      // 一旦保存期间已经出现“不同于启动基线、也不同于 savedHash”的 watcher 版本，
      // 就说明磁盘真相已经被外部版本覆盖；此时只能更新 persistedSnapshot，
      // 绝不能再把 diskSnapshot / lastKnownDiskVersionHash 回写成本次保存版本。
      if (!latestKnownDiskVersionHash
        || latestKnownDiskVersionHash === inFlightBaseDiskVersionHash
        || latestKnownDiskVersionHash === savedHash) {
        session.diskSnapshot.content = payload.content
        session.diskSnapshot.versionHash = savedHash
        session.diskSnapshot.exists = true
        session.diskSnapshot.stat = payload.stat || null
        session.diskSnapshot.observedAt = savedAt
        session.diskSnapshot.source = 'save'
        if (session.externalRuntime) {
          session.externalRuntime.lastKnownDiskVersionHash = savedHash
        }
      }

      session.watchRuntime.eventFloorObservedAt = Math.max(
        session.watchRuntime.eventFloorObservedAt || 0,
        savedAt,
      )

      if (previousPath !== payload.path || previousExists !== true) {
        session.watchRuntime.bindingToken = (session.watchRuntime.bindingToken || 0) + 1
        session.watchRuntime.watchingPath = payload.path
        session.watchRuntime.status = 'active'
      }
      session.watchRuntime.fileExists = true

      clearInFlightSaveRuntime(session)
      session.saveRuntime.lastError = null

      if (session.editorSnapshot.revision > payload.revision) {
        const nextResult = continueQueuedSaveIfNeeded(session, {
          createJobId,
          preferredTrigger: closeWaitingCurrentJob
            ? 'close-auto-save'
            : payload.trigger,
        })

        if (closeWaitingCurrentJob && nextResult.session.saveRuntime.inFlightJobId) {
          session.closeRuntime.waitingSaveJobId = nextResult.session.saveRuntime.inFlightJobId
        }

        // 这里专门处理 reviewer 指出的竞态：
        // revision 虽然递增过，但如果当前 editor 内容已经被刚完成的 save 覆盖，
        // `continueQueuedSaveIfNeeded()` 会判定“不需要补写”并返回空 effects。
        // 对关闭链路来说，这一分支不能直接返回空结果，否则窗口会永远卡在 waitingSaveJobId。
        if (closeWaitingCurrentJob && !nextResult.session.saveRuntime.inFlightJobId) {
          if (!isSessionSaved(session)) {
            return buildUnsavedPromptResult(session)
          }

          resetCloseRuntime(session)
          return {
            session,
            effects: [
              {
                type: 'close-window',
              },
            ],
          }
        }

        return nextResult
      }

      session.saveRuntime.status = 'idle'
      session.saveRuntime.trigger = null

      if (closeWaitingCurrentJob) {
        if (!isSessionSaved(session)) {
          return buildUnsavedPromptResult(session)
        }

        resetCloseRuntime(session)
        return {
          session,
          effects: [
            {
              type: 'close-window',
            },
          ],
        }
      }

      return {
        session,
        effects: [],
      }
    },

    handleSaveFailed(session, payload) {
      ensureSaveRuntime(session)
      ensureCloseRuntime(session)

      if (payload?.jobId !== session.saveRuntime.inFlightJobId) {
        return {
          session,
          effects: [],
        }
      }

      const closeWaitingCurrentJob = isActiveCloseWaitingJob(session, payload.jobId)

      session.saveRuntime.status = 'idle'
      clearInFlightSaveRuntime(session)
      session.saveRuntime.lastError = serializeError(payload.error)
      session.saveRuntime.trigger = null

      const effects = [
        {
          type: 'notify-save-failed',
          trigger: payload.trigger,
          error: serializeError(payload.error),
        },
      ]

      // 失败后是否回到“未保存确认”只能由当前 closeRuntime 决定。
      // 一旦用户已经执行过 cancel-close，迟到的 close-auto-save 结果就只是一条普通失败通知，
      // 不允许再因为 payload.trigger 把会话重新拖回关闭链路。
      if (closeWaitingCurrentJob) {
        session.closeRuntime.intent = 'close'
        session.closeRuntime.promptReason = 'unsaved-changes'
        session.closeRuntime.waitingSaveJobId = null
        session.closeRuntime.awaitingPathSelection = false
        effects.push({
          type: 'show-unsaved-prompt',
        })
      }

      return {
        session,
        effects,
      }
    },

    handleCopySaveSucceeded(session) {
      ensureCopySaveRuntime(session)
      session.copySaveRuntime.status = 'idle'
      session.copySaveRuntime.activeJobId = null
      session.copySaveRuntime.lastError = null
      session.copySaveRuntime.lastResult = 'succeeded'
      session.copySaveRuntime.lastFailureReason = null
      return {
        session,
        effects: [],
      }
    },

    handleCopySaveFailed(session, payload) {
      ensureCopySaveRuntime(session)
      session.copySaveRuntime.status = 'idle'
      session.copySaveRuntime.activeJobId = null
      session.copySaveRuntime.lastError = serializeError(payload?.error)
      session.copySaveRuntime.lastResult = 'failed'
      session.copySaveRuntime.lastFailureReason = payload?.reason || null
      return {
        session,
        effects: [],
      }
    },
  }
}

export default {
  createSaveCoordinator,
}
