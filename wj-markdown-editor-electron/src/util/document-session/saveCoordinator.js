import crypto from 'node:crypto'
import path from 'node:path'
import { deriveDocumentSnapshot } from './documentSnapshotUtil.js'

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
      manualRequestSequence: 0,
      activeManualRequestIds: [],
      manualRequestTargets: {},
      completedManualRequests: [],
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
  if (!Number.isFinite(session.saveRuntime.manualRequestSequence)
    || session.saveRuntime.manualRequestSequence < 0) {
    session.saveRuntime.manualRequestSequence = 0
  }
  if (!Array.isArray(session.saveRuntime.activeManualRequestIds)) {
    session.saveRuntime.activeManualRequestIds = []
  }
  if (!session.saveRuntime.manualRequestTargets || typeof session.saveRuntime.manualRequestTargets !== 'object') {
    session.saveRuntime.manualRequestTargets = {}
  }
  if (!Array.isArray(session.saveRuntime.completedManualRequests)) {
    session.saveRuntime.completedManualRequests = []
  }
}

function createManualSaveRequest(session) {
  ensureSaveRuntime(session)
  session.saveRuntime.manualRequestSequence = (session.saveRuntime.manualRequestSequence || 0) + 1
  const requestId = `manual-save-request-${session.saveRuntime.manualRequestSequence}`
  session.saveRuntime.completedManualRequests = session.saveRuntime.completedManualRequests
    .filter(request => request?.requestId !== requestId)
  session.saveRuntime.activeManualRequestIds.push(requestId)
  // 每个 manual request 都要锁定“用户发起时想保存到哪一个 revision”，
  // 后续 save.succeeded 只能结算已经覆盖到该 revision 的请求。
  session.saveRuntime.manualRequestTargets[requestId] = session.editorSnapshot?.revision || 0
  return requestId
}

function isManualRequestUserVisibleSaved(session, {
  status,
  saved,
  documentPath,
}) {
  if (status !== 'succeeded') {
    return false
  }

  // 只要外部冲突仍未被命令层收敛，这次 manual request 就不能对 compat facade 宣称“保存成功”，
  // 否则 renderer 还挂着 externalPrompt，主进程却返回 true，会把用户带回旧的竞态语义。
  if (session.externalRuntime?.pendingExternalChange) {
    return false
  }

  const targetPath = documentPath === undefined
    ? session.documentSource?.path
    : documentPath
  const currentSaved = Boolean(session.documentSource?.path) && deriveDocumentSnapshot(session).saved

  return Boolean(targetPath) && (typeof saved === 'boolean' ? saved : currentSaved)
}

function buildManualRequestCompletion(session, {
  requestId,
  status,
  error = null,
  saved,
  documentPath,
}) {
  const needsPostReconcileRefresh = status === 'succeeded'
    && Boolean(session.externalRuntime?.pendingExternalChange)

  return {
    requestId,
    status,
    error: serializeError(error),
    // 兼容层返回值必须绑定“这次 manual request 在完成当下的真相”，
    // 不能再回头读取未来某个时间点的 session，否则会被后续新编辑/新自动保存抢走结果。
    saved: isManualRequestUserVisibleSaved(session, {
      status,
      saved,
      documentPath,
    }),
    needsPostReconcileRefresh,
    documentPath: documentPath === undefined
      ? (session.documentSource?.path || null)
      : (documentPath || null),
  }
}

function completeManualSaveRequests(session, {
  status,
  error = null,
  requestIds = null,
  saved,
  documentPath,
}) {
  ensureSaveRuntime(session)
  const targetRequestIds = Array.isArray(requestIds)
    ? requestIds.filter(Boolean)
    : [...session.saveRuntime.activeManualRequestIds]

  if (targetRequestIds.length === 0) {
    return
  }

  const requestIdSet = new Set(targetRequestIds)
  session.saveRuntime.activeManualRequestIds = session.saveRuntime.activeManualRequestIds
    .filter(requestId => !requestIdSet.has(requestId))
  session.saveRuntime.completedManualRequests = session.saveRuntime.completedManualRequests
    .filter(request => !requestIdSet.has(request?.requestId))

  for (const requestId of targetRequestIds) {
    delete session.saveRuntime.manualRequestTargets[requestId]
    session.saveRuntime.completedManualRequests.push(buildManualRequestCompletion(session, {
      requestId,
      status,
      error,
      saved,
      documentPath,
    }))
  }
}

function refreshCompletedManualSaveRequests(session, {
  requestIds = null,
} = {}) {
  ensureSaveRuntime(session)

  const requestIdSet = Array.isArray(requestIds)
    ? new Set(requestIds.filter(Boolean))
    : null

  session.saveRuntime.completedManualRequests = session.saveRuntime.completedManualRequests.map((request) => {
    if (!request || request.status !== 'succeeded') {
      return request
    }

    if (requestIdSet && !requestIdSet.has(request.requestId)) {
      return request
    }

    if (request.needsPostReconcileRefresh !== true) {
      return request
    }

    return {
      ...request,
      // `save.succeeded` 之后 watchCoordinator 还可能在同一轮命令分发里把
      // pending external change 收敛成 noop。这里必须在收敛完成后再基于
      // 当前 session 真相重算一次 compat `saved`，否则 Ctrl+S 会被较早的
      // provisional completion 卡成 false。
      saved: isManualRequestUserVisibleSaved(session, {
        status: request.status,
        documentPath: request.documentPath,
      }),
      needsPostReconcileRefresh: false,
    }
  })
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
      activeJobs: {},
      pendingSelection: false,
      pendingSelectionRequestId: null,
      targetPath: null,
      lastError: null,
      lastResult: 'idle',
      lastFailureReason: null,
      requestSequence: 0,
      completedRequests: [],
    }
  }

  if (!session.copySaveRuntime.activeJobs || typeof session.copySaveRuntime.activeJobs !== 'object') {
    session.copySaveRuntime.activeJobs = {}
  }
  if (!('pendingSelectionRequestId' in session.copySaveRuntime)) {
    session.copySaveRuntime.pendingSelectionRequestId = null
  }
  if (!Number.isFinite(session.copySaveRuntime.requestSequence)
    || session.copySaveRuntime.requestSequence < 0) {
    session.copySaveRuntime.requestSequence = 0
  }
  if (!Array.isArray(session.copySaveRuntime.completedRequests)) {
    session.copySaveRuntime.completedRequests = []
  }
}

function getCopySaveActiveJobIdList(session) {
  ensureCopySaveRuntime(session)
  return Object.keys(session.copySaveRuntime.activeJobs)
}

function syncCopySaveRuntimeStatus(session) {
  ensureCopySaveRuntime(session)
  const activeJobIdList = getCopySaveActiveJobIdList(session)
  session.copySaveRuntime.activeJobId = activeJobIdList.length > 0
    ? activeJobIdList[activeJobIdList.length - 1]
    : null

  if (session.copySaveRuntime.pendingSelection === true) {
    // 只要更新请求仍在等待用户选路径，旧 job 的结果就不能覆盖掉当前“仍在进行中”的 UI 真相。
    session.copySaveRuntime.status = 'awaiting-path-selection'
    session.copySaveRuntime.lastResult = 'pending'
    session.copySaveRuntime.lastError = null
    session.copySaveRuntime.lastFailureReason = null
    return session.copySaveRuntime
  }

  if (activeJobIdList.length > 0) {
    // 只要还有任何副本写盘在跑，外部兼容层看到的都必须是“仍在进行中”，
    // 不能被更早完成的旧请求提前改成 succeeded / failed。
    session.copySaveRuntime.status = 'running'
    session.copySaveRuntime.lastResult = 'pending'
    session.copySaveRuntime.lastError = null
    session.copySaveRuntime.lastFailureReason = null
    return session.copySaveRuntime
  }

  session.copySaveRuntime.status = 'idle'
  const latestCompletion = session.copySaveRuntime.completedRequests.length > 0
    ? session.copySaveRuntime.completedRequests[session.copySaveRuntime.completedRequests.length - 1]
    : null

  if (!latestCompletion) {
    session.copySaveRuntime.lastResult = 'idle'
    session.copySaveRuntime.lastError = null
    session.copySaveRuntime.lastFailureReason = null
    return session.copySaveRuntime
  }

  session.copySaveRuntime.lastResult = latestCompletion.status
  session.copySaveRuntime.lastError = latestCompletion.error
  session.copySaveRuntime.lastFailureReason = latestCompletion.failureReason
  return session.copySaveRuntime
}

function createCopySaveRequest(session) {
  ensureCopySaveRuntime(session)
  session.copySaveRuntime.requestSequence = (session.copySaveRuntime.requestSequence || 0) + 1
  const requestId = `copy-save-request-${session.copySaveRuntime.requestSequence}`
  session.copySaveRuntime.completedRequests = session.copySaveRuntime.completedRequests
    .filter(request => request?.requestId !== requestId)
  return requestId
}

function completeCopySaveRequest(session, {
  requestId,
  status,
  error = null,
  failureReason = null,
  path = null,
}) {
  ensureCopySaveRuntime(session)
  if (!requestId) {
    return null
  }

  const completion = {
    requestId,
    status,
    error: serializeError(error),
    failureReason,
    path: path || null,
  }

  session.copySaveRuntime.completedRequests = session.copySaveRuntime.completedRequests
    .filter(request => request?.requestId !== requestId)
  session.copySaveRuntime.completedRequests.push(completion)
  return completion
}

function consumeCopySaveCompletion(session, {
  requestId,
} = {}) {
  ensureCopySaveRuntime(session)
  if (!requestId) {
    return null
  }

  const completionIndex = session.copySaveRuntime.completedRequests
    .findIndex(request => request?.requestId === requestId)
  if (completionIndex < 0) {
    return null
  }

  const [completion] = session.copySaveRuntime.completedRequests.splice(completionIndex, 1)
  syncCopySaveRuntimeStatus(session)
  return completion || null
}

function getCopySaveRequestId(session, requestId) {
  ensureCopySaveRuntime(session)
  if (requestId) {
    return requestId
  }

  return session.copySaveRuntime.pendingSelectionRequestId || null
}

function deleteCopySaveActiveJob(session, jobId) {
  ensureCopySaveRuntime(session)
  if (!jobId || !session.copySaveRuntime.activeJobs[jobId]) {
    return null
  }

  const activeJob = session.copySaveRuntime.activeJobs[jobId]
  delete session.copySaveRuntime.activeJobs[jobId]
  return activeJob
}

function findCopySaveActiveJobIdByRequestId(session, requestId) {
  ensureCopySaveRuntime(session)
  if (!requestId) {
    return null
  }

  const matchedEntry = Object.entries(session.copySaveRuntime.activeJobs)
    .find(([, activeJob]) => activeJob?.requestId === requestId)
  return matchedEntry?.[0] || null
}

function consumeCopySaveActiveJobByCompletionPayload(session, payload) {
  ensureCopySaveRuntime(session)

  // copy-save 的完成回流现在既可能来自真实写盘 job，
  // 也可能来自 same-path 这类“请求级失败、根本没有落到 execute-copy-save”的分支。
  // 因此这里必须优先按显式 jobId 结算；只有 jobId 缺失时，才允许按 requestId
  // 查找同 request 的活动 job。若当前 payload 只是 request 级失败且根本没有匹配 job，
  // 就必须返回 null，绝不能再误删别的 request 仍在进行中的 active job。
  if (payload?.jobId) {
    return deleteCopySaveActiveJob(session, payload.jobId)
  }

  if (payload?.requestId) {
    const matchedJobId = findCopySaveActiveJobIdByRequestId(session, payload.requestId)
    if (!matchedJobId) {
      return null
    }
    return deleteCopySaveActiveJob(session, matchedJobId)
  }

  return deleteCopySaveActiveJob(session, session.copySaveRuntime.activeJobId)
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

function getTriggerPriority(trigger) {
  switch (trigger) {
    case 'close-auto-save':
      return 3
    case 'manual-save':
      return 2
    case 'blur-auto-save':
      return 1
    default:
      return 0
  }
}

function mergeSaveTrigger(currentTrigger, incomingTrigger) {
  if (!incomingTrigger) {
    return currentTrigger || null
  }
  if (!currentTrigger) {
    return incomingTrigger
  }

  return getTriggerPriority(incomingTrigger) >= getTriggerPriority(currentTrigger)
    ? incomingTrigger
    : currentTrigger
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
    if (trigger === 'manual-save') {
      completeManualSaveRequests(session, {
        status: 'succeeded',
      })
    }
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
      const manualRequestId = trigger === 'manual-save'
        ? createManualSaveRequest(session)
        : null

      if (session.saveRuntime.status === 'awaiting-path-selection'
        && session.saveRuntime.pendingSelection?.type === 'save') {
        session.saveRuntime.trigger = mergeSaveTrigger(session.saveRuntime.trigger, trigger)
        if (session.saveRuntime.pendingSaveContext) {
          session.saveRuntime.pendingSaveContext.trigger = mergeSaveTrigger(
            session.saveRuntime.pendingSaveContext.trigger,
            trigger,
          )
        }
        return {
          session,
          effects: [],
          manualRequestId,
        }
      }

      // 单 session 单写盘的约束必须先于“草稿首次保存要选路径”生效。
      // 否则未命名草稿在第一次 save 已经拿到目标路径并进入 in-flight 写盘后，
      // 因为 documentSource.path 还没等到 save.succeeded 回填，就会被误判成“又要首次保存”，
      // 继而再次弹出保存对话框，破坏当前进行中的保存态。
      if (session.saveRuntime.inFlightJobId) {
        // 新请求不能并发写盘，但必须保留更强的触发源语义。
        // 比如 blur-auto-save 进行中按下 Ctrl+S，后续失败提示和补写都要升级成 manual-save。
        session.saveRuntime.trigger = mergeSaveTrigger(session.saveRuntime.trigger, trigger)
        return {
          session,
          effects: [],
          manualRequestId,
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
          manualRequestId,
        }
      }

      const saveStarted = beginSave(session, {
        trigger,
        path: targetPath,
        createJobId,
      })
      return {
        ...saveStarted,
        manualRequestId,
      }
    },

    requestCopySave(session) {
      ensureCopySaveRuntime(session)
      if (session.copySaveRuntime.pendingSelection === true
        && session.copySaveRuntime.pendingSelectionRequestId) {
        return {
          session,
          effects: [],
          copySaveRequestId: session.copySaveRuntime.pendingSelectionRequestId,
        }
      }

      const requestId = createCopySaveRequest(session)
      session.copySaveRuntime.status = 'awaiting-path-selection'
      session.copySaveRuntime.pendingSelection = true
      session.copySaveRuntime.pendingSelectionRequestId = requestId
      session.copySaveRuntime.targetPath = null
      session.copySaveRuntime.lastError = null
      session.copySaveRuntime.lastResult = 'pending'
      session.copySaveRuntime.lastFailureReason = null

      return {
        session,
        effects: [
          {
            type: 'open-copy-dialog',
            requestId,
          },
        ],
        copySaveRequestId: requestId,
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
      completeManualSaveRequests(session, {
        status: 'cancelled',
      })

      return {
        session,
        effects: [],
      }
    },

    resolveCopyTarget(session, { path: targetPath, requestId }) {
      ensureCopySaveRuntime(session)
      const currentRequestId = getCopySaveRequestId(session, requestId)
      if (session.copySaveRuntime.pendingSelection !== true
        || !currentRequestId
        || currentRequestId !== session.copySaveRuntime.pendingSelectionRequestId) {
        return {
          session,
          effects: [],
        }
      }

      session.copySaveRuntime.pendingSelection = false
      session.copySaveRuntime.pendingSelectionRequestId = null
      session.copySaveRuntime.targetPath = targetPath

      if (normalizeComparablePath(targetPath) && normalizeComparablePath(targetPath) === normalizeComparablePath(session.documentSource?.path)) {
        syncCopySaveRuntimeStatus(session)
        return {
          session,
          effects: [
            {
              type: 'dispatch-command',
              command: {
                type: 'copy-save.failed',
                payload: {
                  requestId: currentRequestId,
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
        requestId: currentRequestId,
        sessionId: session.sessionId,
        revision: session.editorSnapshot.revision,
        content: session.editorSnapshot.content,
        path: targetPath,
        trigger: 'copy-save',
      }
      session.copySaveRuntime.activeJobs[copySaveJob.jobId] = {
        requestId: currentRequestId,
        path: targetPath,
      }
      syncCopySaveRuntimeStatus(session)

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

    cancelCopyTarget(session, { requestId } = {}) {
      ensureCopySaveRuntime(session)
      const currentRequestId = getCopySaveRequestId(session, requestId)
      if (session.copySaveRuntime.pendingSelection !== true
        || !currentRequestId
        || currentRequestId !== session.copySaveRuntime.pendingSelectionRequestId) {
        return {
          session,
          effects: [],
        }
      }

      session.copySaveRuntime.pendingSelection = false
      session.copySaveRuntime.pendingSelectionRequestId = null
      session.copySaveRuntime.targetPath = null
      completeCopySaveRequest(session, {
        requestId: currentRequestId,
        status: 'cancelled',
      })
      syncCopySaveRuntimeStatus(session)

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
      const savedVersionStillCurrent = !latestKnownDiskVersionHash
        || latestKnownDiskVersionHash === inFlightBaseDiskVersionHash
        || latestKnownDiskVersionHash === savedHash
      const completedManualRequestIds = session.saveRuntime.activeManualRequestIds.filter((requestId) => {
        const targetRevision = Number.isFinite(session.saveRuntime.manualRequestTargets?.[requestId])
          ? session.saveRuntime.manualRequestTargets[requestId]
          : 0
        return targetRevision <= payload.revision
      })
      const settledManualRequestIds = []

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
      if (savedVersionStillCurrent) {
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
      completeManualSaveRequests(session, {
        status: 'succeeded',
        requestIds: completedManualRequestIds,
        saved: Boolean(payload.path) && savedVersionStillCurrent,
        documentPath: payload.path,
      })
      settledManualRequestIds.push(...completedManualRequestIds)

      if (session.editorSnapshot.revision > payload.revision) {
        const nextResult = continueQueuedSaveIfNeeded(session, {
          createJobId,
          preferredTrigger: closeWaitingCurrentJob
            ? 'close-auto-save'
            : mergeSaveTrigger(session.saveRuntime.trigger, payload.trigger),
        })

        if (closeWaitingCurrentJob && nextResult.session.saveRuntime.inFlightJobId) {
          session.closeRuntime.waitingSaveJobId = nextResult.session.saveRuntime.inFlightJobId
        }

        // 这里补齐“revision 虽然变过，但最终内容已经回到当前磁盘真相”的分支：
        // 如果没有继续起新的 save job，就说明剩余 manual request 不再需要等待后续写盘，
        // 必须立刻基于当前会话真相结算，避免 compat facade 永远挂起。
        if (!nextResult.session.saveRuntime.inFlightJobId
          && nextResult.session.saveRuntime.activeManualRequestIds.length > 0) {
          const remainingManualRequestIds = [...nextResult.session.saveRuntime.activeManualRequestIds]
          completeManualSaveRequests(session, {
            status: 'succeeded',
          })
          settledManualRequestIds.push(...remainingManualRequestIds)
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
            completedManualRequestIds: settledManualRequestIds,
          }
        }

        return {
          ...nextResult,
          completedManualRequestIds: settledManualRequestIds,
        }
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
          completedManualRequestIds: settledManualRequestIds,
        }
      }

      return {
        session,
        effects: [],
        completedManualRequestIds: settledManualRequestIds,
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
      const effectiveTrigger = mergeSaveTrigger(session.saveRuntime.trigger, payload.trigger)

      session.saveRuntime.status = 'idle'
      clearInFlightSaveRuntime(session)
      session.saveRuntime.lastError = serializeError(payload.error)
      session.saveRuntime.trigger = null
      completeManualSaveRequests(session, {
        status: 'failed',
        error: payload.error,
      })

      const effects = [
        {
          type: 'notify-save-failed',
          trigger: effectiveTrigger,
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

    handleCopySaveSucceeded(session, payload) {
      ensureCopySaveRuntime(session)
      const activeJob = consumeCopySaveActiveJobByCompletionPayload(session, payload)
      if (!activeJob) {
        return {
          session,
          effects: [],
        }
      }

      session.copySaveRuntime.targetPath = payload?.path || activeJob.path || null
      completeCopySaveRequest(session, {
        requestId: activeJob.requestId,
        status: 'succeeded',
        path: payload?.path || activeJob.path || null,
      })
      syncCopySaveRuntimeStatus(session)
      return {
        session,
        effects: [],
      }
    },

    handleCopySaveFailed(session, payload) {
      ensureCopySaveRuntime(session)
      const activeJob = consumeCopySaveActiveJobByCompletionPayload(session, payload)
      const currentRequestId = activeJob?.requestId || payload?.requestId || null
      if (!currentRequestId) {
        return {
          session,
          effects: [],
        }
      }

      session.copySaveRuntime.targetPath = payload?.path || activeJob?.path || null
      completeCopySaveRequest(session, {
        requestId: currentRequestId,
        status: 'failed',
        error: payload?.error,
        failureReason: payload?.reason || null,
        path: payload?.path || activeJob?.path || null,
      })
      syncCopySaveRuntimeStatus(session)
      return {
        session,
        effects: [],
      }
    },

    consumeCopySaveCompletion(session, options) {
      return consumeCopySaveCompletion(session, options)
    },

    refreshCompletedManualSaveRequests(session, options) {
      refreshCompletedManualSaveRequests(session, options)
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
