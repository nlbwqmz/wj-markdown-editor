import crypto from 'node:crypto'
import path from 'node:path'
import commonUtil from '../commonUtil.js'
import { deriveDocumentSnapshot } from './documentSnapshotUtil.js'

// 基于正文内容生成稳定哈希。
// 保存成功、外部变更收敛和磁盘基线比较都依赖这个哈希做版本判等。
function createContentHash(content = '') {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

// 为旧会话结构补齐 saveRuntime。
// 保存协调器会直接读写这些运行态字段，因此进入任何保存分支前都必须先保证结构完整。
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

// 创建一条手动保存请求记录。
// 手动保存与自动保存最大的区别在于：需要向兼容层和渲染层返回“这次用户点击保存”的最终结果。
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

// 判断一条手动保存请求在“用户可见语义”上是否算已保存。
// 这里不能只看 save.succeeded 事件，还要结合外部冲突是否已收敛，以及当前文档身份是否有效。
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

// 生成一条手动保存完成记录。
// 这份记录会被冻结进 completedManualRequests，供兼容层按 requestId 查询，不再依赖未来时刻的 session 状态。
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

// 批量结算手动保存请求。
// 调用方可以显式指定 requestIds，也可以默认一次性结算当前全部 active manual request。
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

// 在外部变更收敛完成后，刷新已经 provisional 完成的手动保存结果。
// 这个函数只重算 succeeded 且标记了 needsPostReconcileRefresh 的记录。
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

// 为 copy-save 链路补齐独立运行态。
// “保存副本”与“保存当前文档本体”是两套状态机，绝不能共享同一份 saveRuntime。
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

// 获取当前仍在执行中的副本保存 job id 列表。
// 统一通过 activeJobs 推导，避免 activeJobId 变成需要手动同步的第二事实来源。
function getCopySaveActiveJobIdList(session) {
  ensureCopySaveRuntime(session)
  return Object.keys(session.copySaveRuntime.activeJobs)
}

// 根据 pendingSelection、activeJobs 和 completedRequests 重算 copySaveRuntime 的外显状态。
// 这是副本保存链路的单一状态归并入口，避免不同分支各自手写 status / lastResult。
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

// 创建一条新的“保存副本”请求记录。
// requestId 用来把“选路径 -> 执行写盘 -> 完成回流”串成同一条副本请求链。
function createCopySaveRequest(session) {
  ensureCopySaveRuntime(session)
  session.copySaveRuntime.requestSequence = (session.copySaveRuntime.requestSequence || 0) + 1
  const requestId = `copy-save-request-${session.copySaveRuntime.requestSequence}`
  session.copySaveRuntime.completedRequests = session.copySaveRuntime.completedRequests
    .filter(request => request?.requestId !== requestId)
  return requestId
}

// 写入一条副本保存完成记录。
// 不论成功、失败还是取消，都会以 requestId 为键覆盖旧结果。
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

// 消费一条副本保存完成记录。
// 这个方法主要给兼容层使用，读取后会把结果从 completedRequests 中移除。
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

// 解析本次副本保存应当使用的 requestId。
// 如果调用方没有显式传入，就回退到当前正在等待选路径的那条请求。
function getCopySaveRequestId(session, requestId) {
  ensureCopySaveRuntime(session)
  if (requestId) {
    return requestId
  }

  return session.copySaveRuntime.pendingSelectionRequestId || null
}

// 从 activeJobs 中删除一条副本保存中的 job，并返回它的请求上下文。
// 仅删除明确匹配的 job，避免误伤其他并行的副本保存请求。
function deleteCopySaveActiveJob(session, jobId) {
  ensureCopySaveRuntime(session)
  if (!jobId || !session.copySaveRuntime.activeJobs[jobId]) {
    return null
  }

  const activeJob = session.copySaveRuntime.activeJobs[jobId]
  delete session.copySaveRuntime.activeJobs[jobId]
  return activeJob
}

// 通过 requestId 反查当前仍在执行中的副本保存 job id。
// 主要用于完成回流没有显式 jobId 时的兜底匹配。
function findCopySaveActiveJobIdByRequestId(session, requestId) {
  ensureCopySaveRuntime(session)
  if (!requestId) {
    return null
  }

  const matchedEntry = Object.entries(session.copySaveRuntime.activeJobs)
    .find(([, activeJob]) => activeJob?.requestId === requestId)
  return matchedEntry?.[0] || null
}

// 根据副本保存完成 payload 消费对应 active job。
// 这一步必须非常保守，优先按 jobId 精确命中，避免 request 级失败误删别的正在执行中的 job。
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

// 为旧会话结构补齐 closeRuntime。
// 保存链路需要与关闭链路协同，因此这里也在协调器内做一次兜底补齐。
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

// 重置关闭链路运行态。
// 关闭等待保存成功后放行、用户取消关闭，或回退到继续编辑时都会走这里。
function resetCloseRuntime(session) {
  ensureCloseRuntime(session)
  session.closeRuntime.intent = null
  session.closeRuntime.promptReason = null
  session.closeRuntime.waitingSaveJobId = null
  session.closeRuntime.awaitingPathSelection = false
  session.closeRuntime.forceClose = false
}

// 判断当前某个 save job 是否正是关闭链路正在等待的那一个。
// 只有命中这条条件，save.succeeded / save.failed 才需要额外推进关闭流程。
function isActiveCloseWaitingJob(session, jobId) {
  ensureCloseRuntime(session)
  return session.closeRuntime.intent === 'close'
    && session.closeRuntime.waitingSaveJobId === jobId
}

// 把任意错误对象压平成可序列化结构。
// 协调器返回的 effect 和完成记录都不能携带原始 Error 实例。
function serializeError(error) {
  if (!error) {
    return null
  }

  return {
    name: typeof error.name === 'string' ? error.name : 'Error',
    message: typeof error.message === 'string' ? error.message : String(error),
  }
}

// 把任意路径归一化为可比较值。
// Windows 路径按大小写不敏感处理，副本保存时会用它识别“目标路径其实就是当前文件”。
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

// 为不同保存触发源定义优先级。
// 当多个请求在同一轮 in-flight/awaiting-path-selection 阶段合并时，需要保留语义更强的触发源。
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

// 合并两个保存触发源，返回语义优先级更高的那个。
// 例如 blur-auto-save 进行中收到 manual-save，最终应升级成 manual-save。
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

// 基于当前 editorSnapshot 冻结一份真正要落盘的 save job。
// job 一旦创建，后续写盘必须只使用这份快照，不能再动态读取 session 当前值。
function createSaveJob({ session, path: targetPath, trigger }) {
  return {
    jobId: commonUtil.createId(),
    sessionId: session.sessionId,
    revision: session.editorSnapshot.revision,
    content: session.editorSnapshot.content,
    path: targetPath,
    trigger,
  }
}

// 获取当前已知的最新磁盘版本哈希。
// 优先读取 externalRuntime.lastKnownDiskVersionHash，因为它代表 watcher 语义上的最新磁盘真相。
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

// 清空 in-flight save 相关字段。
// 只清理“当前写盘任务”的运行态，不负责重置 status、trigger 或错误信息。
function clearInFlightSaveRuntime(session) {
  session.saveRuntime.inFlightJobId = null
  session.saveRuntime.inFlightRevision = null
  session.saveRuntime.inFlightBaseDiskVersionHash = null
}

// 判断当前会话是否已经与磁盘基线一致。
// 这是保存成功后决定能否直接关闭窗口的最终判据之一。
function isSessionSaved(session) {
  return session.editorSnapshot.content === session.diskSnapshot.content
    && Boolean(session.documentSource?.exists) === Boolean(session.diskSnapshot?.exists)
}

// 构造“未保存确认”结果。
// 当关闭等待的 save job 完成后，发现当前文档仍不安全可关时，就必须回退到这个分支。
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

// 判断本轮请求是否真的需要启动写盘。
// 这里不能只靠“内容是否变化”判断，还必须考虑文件身份是否存在。
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

// 真正进入 save job 创建与排队的统一入口。
// 所有 requestSave / 补写续跑最终都会落到这里，以共享同一套冻结逻辑。
function beginSave(session, { trigger, path: targetPath }) {
  ensureSaveRuntime(session)

  // 无论这次是否真的会起写盘 job，都先把“期望至少保存到哪个 revision”推进到最新。
  // 这样即便当前 save 之后还要补写，也不会遗漏这次请求对应的编辑版本。
  session.saveRuntime.requestedRevision = Math.max(
    session.saveRuntime.requestedRevision || 0,
    session.editorSnapshot.revision || 0,
  )

  // 单会话同时只允许一个 document 本体 save job 在飞。
  // 如果这里已经存在 in-flight job，本次请求只需依赖外层已更新过的 requestedRevision/trigger 语义，不能再并发起写盘。
  if (session.saveRuntime.inFlightJobId) {
    return {
      session,
      effects: [],
    }
  }

  // 当前若判断“不需要真正写盘”，就直接把 saveRuntime 收敛回空闲态。
  // 这既覆盖“内容与磁盘一致”的场景，也覆盖“这次请求最终没有必要创建/恢复文件”的场景。
  if (!shouldStartSave(session, targetPath)) {
    session.saveRuntime.status = 'idle'
    // 即使没有实际写盘，也保留本次保存尝试的触发源，便于外层理解这轮收敛来自哪类请求。
    session.saveRuntime.trigger = trigger
    session.saveRuntime.lastError = null
    // 既然没有真正启动 in-flight save，就不应残留“保存启动时的磁盘基线哈希”。
    session.saveRuntime.inFlightBaseDiskVersionHash = null
    if (trigger === 'manual-save') {
      // 对手动保存来说，“无需写盘”也必须立刻结算成功，否则兼容层会一直等待这次 Ctrl+S 的结果。
      completeManualSaveRequests(session, {
        status: 'succeeded',
      })
    }
    return {
      session,
      effects: [],
    }
  }

  // 需要写盘时，先冻结当前 editorSnapshot 生成 save job。
  // 后续真正执行写盘时必须只依赖这份冻结快照，避免写入过程中又读到更新后的 session。
  const saveJob = createSaveJob({
    session,
    path: targetPath || session.documentSource.path,
    trigger,
  })

  // save job 一旦创建，运行态立即进入 queued，等待副作用层真正开始执行写盘。
  session.saveRuntime.status = 'queued'
  // 记录当前保存任务的唯一 id，供 save.started/save.succeeded/save.failed 回流精确匹配。
  session.saveRuntime.inFlightJobId = saveJob.jobId
  // 记录这次写盘冻结的是哪个 editor revision，后续用于判断是否还要补发下一轮保存。
  session.saveRuntime.inFlightRevision = saveJob.revision
  // 冻结 save 启动瞬间已知的磁盘版本哈希。
  // save.succeeded 之后只能用它判断保存期间 watcher 是否已经把磁盘推进到了别的版本。
  session.saveRuntime.inFlightBaseDiskVersionHash = getLatestKnownDiskVersionHash(session)
  // 当前保存流程的触发源语义，失败提示、关闭链路等待和补写决策都可能继续依赖它。
  session.saveRuntime.trigger = trigger
  // 新一轮保存开始排队后，旧错误信息不再代表当前保存流程。
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

// 当前一轮 save 完成后，如 editor revision 又继续向前推进，则决定是否立刻补发下一轮 save。
// 这是“单 session 单写盘，但允许排队追赶最新内容”的核心续跑逻辑。
function continueQueuedSaveIfNeeded(session, {
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
  })
}

/**
 * 创建保存协调器。
 *
 * 这个协调器只负责维护“文档本体保存”和“保存副本”的状态机真相，
 * 不直接操作文件系统。真正的写盘、副本保存、对话框展示都通过 effects 交给外层执行。
 */
export function createSaveCoordinator() {
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
      // 只有手动保存才需要生成对用户可见的 requestId。
      // 自动保存虽然也走同一状态机，但不需要向 UI 报告单次请求结果。
      const manualRequestId = trigger === 'manual-save'
        ? createManualSaveRequest(session)
        : null

      // 当前如果已经处于“等待用户选择保存路径”的阶段，就不能重复打开保存对话框。
      // 这类后续请求本质上是在复用同一轮首存流程，因此这里只做两件事：
      // 1. 合并 trigger，保留语义更强的触发源
      // 2. 复用当前 pendingSelection，直接返回空 effects，等待现有对话框回流
      if (session.saveRuntime.status === 'awaiting-path-selection'
        && session.saveRuntime.pendingSelection?.type === 'save') {
        // 外层 saveRuntime.trigger 代表“当前这轮待完成保存流程”的总体触发语义。
        // 例如先 blur-auto-save，后 manual-save，这里要升级成 manual-save。
        session.saveRuntime.trigger = mergeSaveTrigger(session.saveRuntime.trigger, trigger)
        if (session.saveRuntime.pendingSaveContext) {
          // pendingSaveContext.trigger 是给选路径回流后继续 beginSave 使用的冻结上下文。
          // 这里同步升级，避免用户选完路径后仍按旧 trigger 启动保存。
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

      // 已有保存任务 in-flight 时，不再并发创建新写盘 job。
      // 但更高优先级的触发源语义仍要被保留下来，供失败提示或补写使用。
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

      // 当前文档还没有正式路径时，本体保存必须先走标准选路径流程。
      // 协调器只产出 open-save-dialog effect，等待外层以 dialog.save-target-selected 回流。
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
      })
      return {
        ...saveStarted,
        manualRequestId,
      }
    },

    /**
     * 发起“保存副本”请求。
     *
     * 副本保存与文档本体保存完全隔离：
     * 1. 不修改当前文档身份
     * 2. 允许自己的请求和结果独立管理
     * 3. 仍然通过 effect 让外层执行打开对话框与写盘
     */
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

    // 处理“用户已选择本体保存目标路径”的回流。
    // 这里会结束 awaiting-path-selection，并把之前缓存的 trigger 继续带回 beginSave。
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
      })
    },

    // 处理“用户取消本体保存目标路径选择”的回流。
    // 对手动保存而言，这意味着请求结束；对关闭链路而言，外层命令服务会决定是否顺带取消关闭。
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

    // 处理“用户已选择副本保存目标路径”的回流。
    // 这里既负责 same-path 校验，也负责真正创建 execute-copy-save job。
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
        jobId: commonUtil.createId(),
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

    // 处理“用户取消副本保存路径选择”的回流。
    // 取消只影响对应 request，不会污染本体保存状态机。
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

    // 副作用层通知“本体保存已经开始执行写盘”。
    // 这里只把状态从 queued 推进到 running，不做额外业务判定。
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

    // 副作用层通知“本体保存写盘成功”。
    // 这是最复杂的收敛入口：既要推进 persisted/disk/documentSource，也要处理 close waiting、queued save 和 manual request 结算。
    handleSaveSucceeded(session, payload) {
      ensureSaveRuntime(session)
      ensureCloseRuntime(session)

      if (payload?.jobId !== session.saveRuntime.inFlightJobId) {
        return {
          session,
          effects: [],
        }
      }

      const savedAt = Number.isFinite(payload.savedAt) ? payload.savedAt : Date.now()
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

    // 副作用层通知“本体保存失败”。
    // 这里负责回收 in-flight 状态、结算手动保存结果，并在必要时把关闭链路退回未保存确认。
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

    // 副作用层通知“副本保存成功”。
    // 成功后只更新 copy-save 自己的完成记录与外显状态，不碰当前文档本体状态。
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

    // 副作用层通知“副本保存失败”。
    // 失败可来自真实写盘失败，也可来自 same-path 这类请求级失败。
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

    // 读取并消费一条副本保存完成记录。
    // 返回后该完成记录会从 completedRequests 中删除，避免重复消费。
    consumeCopySaveCompletion(session, options) {
      return consumeCopySaveCompletion(session, options)
    },

    // 在 watchCoordinator 等后续步骤收敛完成后，刷新已完成的手动保存请求结果。
    // 主要用于把 provisional completion 重新绑定到当前 session 真相。
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
