import path from 'node:path'
import fileWatchUtil from '../fileWatchUtil.js'

function serializeError(error) {
  if (!error) {
    return null
  }

  return {
    name: typeof error.name === 'string' ? error.name : 'Error',
    message: typeof error.message === 'string' ? error.message : String(error),
    code: typeof error.code === 'string' ? error.code : null,
  }
}

function ensureWatchRuntime(session) {
  if (!session.watchRuntime) {
    session.watchRuntime = {
      bindingToken: 0,
      watchingPath: session.documentSource?.path || null,
      watchingDirectoryPath: null,
      status: 'idle',
      fileExists: Boolean(session.documentSource?.exists),
      eventFloorObservedAt: 0,
      recentInternalWrites: [],
      lastError: null,
    }
  }
}

function ensureExternalRuntime(session) {
  if (!session.externalRuntime) {
    session.externalRuntime = {
      pendingExternalChange: null,
      resolutionState: 'idle',
      lastResolutionResult: 'none',
      lastHandledVersionHash: null,
      lastKnownDiskVersionHash: fileWatchUtil.createContentVersion(session.diskSnapshot?.content || ''),
    }
  }
}

function ensureRuntime(session) {
  ensureWatchRuntime(session)
  ensureExternalRuntime(session)
}

function normalizeObservedAt(observedAt, now) {
  return Number.isFinite(observedAt) ? observedAt : now()
}

function isCurrentBindingToken(session, bindingToken) {
  return Number.isFinite(bindingToken)
    && bindingToken === (session.watchRuntime?.bindingToken || 0)
}

function isLateObservedEvent(session, observedAt) {
  if (!Number.isFinite(observedAt)) {
    return false
  }

  return observedAt <= (session.watchRuntime?.eventFloorObservedAt || 0)
}

function updateObservedFloor(session, observedAt) {
  if (!Number.isFinite(observedAt)) {
    return
  }

  session.watchRuntime.eventFloorObservedAt = Math.max(
    session.watchRuntime.eventFloorObservedAt || 0,
    observedAt,
  )
}

function getContentVersion(content = '') {
  return fileWatchUtil.createContentVersion(content)
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

function updateDiskBaseline(session, {
  content,
  exists,
  stat,
  observedAt,
  source,
}) {
  const normalizedContent = content ?? ''
  const versionHash = getContentVersion(normalizedContent)

  session.documentSource.exists = Boolean(exists)
  session.documentSource.lastKnownStat = stat || null

  session.diskSnapshot.content = normalizedContent
  session.diskSnapshot.versionHash = versionHash
  session.diskSnapshot.exists = Boolean(exists)
  session.diskSnapshot.stat = stat || null
  session.diskSnapshot.observedAt = observedAt
  session.diskSnapshot.source = source

  session.externalRuntime.lastKnownDiskVersionHash = versionHash
  session.watchRuntime.fileExists = Boolean(exists)
  updateObservedFloor(session, observedAt)

  return versionHash
}

function markResolved(session, { result, versionHash }) {
  session.externalRuntime.pendingExternalChange = null
  session.externalRuntime.resolutionState = 'resolved'
  session.externalRuntime.lastResolutionResult = result

  if (['applied', 'ignored', 'noop'].includes(result)) {
    session.externalRuntime.lastHandledVersionHash = versionHash
  }
}

function createPendingExternalChange(session, {
  versionHash,
  diskContent,
  diskStat,
  detectedAt,
  watchBindingToken,
  watchingPath,
}) {
  const previousPending = session.externalRuntime.pendingExternalChange
  const nextVersion = previousPending ? previousPending.version + 1 : 1
  const comparablePath = normalizeComparablePath(watchingPath)

  session.externalRuntime.pendingExternalChange = {
    version: nextVersion,
    versionHash,
    diskContent,
    diskStat: diskStat || null,
    detectedAt,
    watchBindingToken,
    watchingPath: watchingPath || null,
    comparablePath,
  }
  session.externalRuntime.resolutionState = 'pending-user'

  if (previousPending && previousPending.versionHash !== versionHash) {
    session.externalRuntime.lastResolutionResult = 'superseded'
  }
}

function applyDiskContentToEditor(session, diskContent, now) {
  session.editorSnapshot.content = diskContent
  session.editorSnapshot.revision = (session.editorSnapshot.revision || 0) + 1
  session.editorSnapshot.updatedAt = now()
}

function handleFileChanged(session, payload, { now, externalChangeStrategy }) {
  const observedAt = normalizeObservedAt(payload?.observedAt, now)
  if (!isCurrentBindingToken(session, payload?.bindingToken) || isLateObservedEvent(session, observedAt)) {
    return { session, effects: [] }
  }

  const diskContent = payload?.diskContent ?? ''
  const versionHash = updateDiskBaseline(session, {
    content: diskContent,
    exists: true,
    stat: payload?.diskStat || null,
    observedAt,
    source: 'watch-change',
  })
  const currentPending = session.externalRuntime.pendingExternalChange

  if (currentPending?.versionHash === versionHash) {
    if (session.editorSnapshot.content === diskContent) {
      markResolved(session, {
        result: 'noop',
        versionHash,
      })
    }
    return { session, effects: [] }
  }

  if (session.externalRuntime.lastHandledVersionHash === versionHash) {
    return { session, effects: [] }
  }

  if (session.editorSnapshot.content === diskContent) {
    markResolved(session, {
      result: 'noop',
      versionHash,
    })
    return { session, effects: [] }
  }

  if (externalChangeStrategy === 'apply') {
    applyDiskContentToEditor(session, diskContent, now)
    markResolved(session, {
      result: 'applied',
      versionHash,
    })
    return { session, effects: [] }
  }

  createPendingExternalChange(session, {
    versionHash,
    diskContent,
    diskStat: payload?.diskStat || null,
    detectedAt: observedAt,
    watchBindingToken: payload?.bindingToken || 0,
    watchingPath: session.watchRuntime?.watchingPath || session.documentSource?.path || null,
  })

  return { session, effects: [] }
}

function handleFileMissing(session, payload, { now }) {
  const observedAt = normalizeObservedAt(payload?.observedAt, now)
  if (!isCurrentBindingToken(session, payload?.bindingToken) || isLateObservedEvent(session, observedAt)) {
    return { session, effects: [] }
  }

  updateDiskBaseline(session, {
    content: '',
    exists: false,
    stat: null,
    observedAt,
    source: 'watch-missing',
  })
  session.externalRuntime.pendingExternalChange = null
  session.externalRuntime.resolutionState = 'missing'
  session.externalRuntime.lastResolutionResult = 'missing'

  return { session, effects: [] }
}

function handleFileRestored(session, payload, { now }) {
  const observedAt = normalizeObservedAt(payload?.observedAt, now)
  if (!isCurrentBindingToken(session, payload?.bindingToken) || isLateObservedEvent(session, observedAt)) {
    return { session, effects: [] }
  }

  // 恢复事件本身只表示“路径重新出现”，
  // 不能假装我们已经拿到了恢复后的磁盘真相。
  // 真正的内容收敛必须等到恢复后的首次有效读盘（即后续 watch.file-changed）再决定。
  session.documentSource.exists = true
  session.documentSource.lastKnownStat = null
  session.watchRuntime.fileExists = true
  updateObservedFloor(session, observedAt)
  session.externalRuntime.pendingExternalChange = null
  session.externalRuntime.resolutionState = 'restored'

  return { session, effects: [] }
}

function handleWatchError(session, payload) {
  if (!isCurrentBindingToken(session, payload?.bindingToken) || session.watchRuntime.status === 'rebinding') {
    return { session, effects: [] }
  }

  const currentPath = payload?.watchingPath || session.watchRuntime.watchingPath || session.documentSource.path || null
  const nextBindingToken = (session.watchRuntime.bindingToken || 0) + 1

  session.watchRuntime.status = 'rebinding'
  session.watchRuntime.lastError = serializeError(payload?.error)
  session.watchRuntime.bindingToken = nextBindingToken
  session.watchRuntime.watchingPath = currentPath
  session.watchRuntime.eventFloorObservedAt = 0

  return {
    session,
    effects: [
      {
        type: 'notify-watch-warning',
        level: 'warning',
        reason: 'watch-error',
        error: session.watchRuntime.lastError,
      },
      {
        type: 'rebind-watch',
        bindingToken: nextBindingToken,
        watchingPath: currentPath,
      },
    ],
  }
}

function handleWatchBound(session, payload) {
  if (!isCurrentBindingToken(session, payload?.bindingToken)) {
    return { session, effects: [] }
  }

  session.watchRuntime.status = 'active'
  session.watchRuntime.watchingPath = payload?.watchingPath || session.watchRuntime.watchingPath || session.documentSource.path || null
  session.watchRuntime.watchingDirectoryPath = payload?.watchingDirectoryPath || session.watchRuntime.watchingDirectoryPath || null
  session.watchRuntime.lastError = null
  return { session, effects: [] }
}

function handleWatchUnbound(session, payload) {
  // `watch.unbound` 也必须和其他 watcher 事件一样走 token 闭环。
  // 如果缺少 token，就无法证明这是当前这轮绑定的解绑结果；
  // 如果 token 已经过期，则说明它属于旧 watcher 的尾事件。
  // 这两种情况都只能丢弃，避免把仍然有效的 watcher 状态错误打回 idle。
  if (payload?.bindingToken === undefined || !isCurrentBindingToken(session, payload.bindingToken)) {
    return { session, effects: [] }
  }

  session.watchRuntime.status = 'idle'
  session.watchRuntime.watchingDirectoryPath = null
  return { session, effects: [] }
}

function matchesPendingVersion(pendingExternalChange, payload) {
  // renderer 可能回传旧弹窗的 apply / ignore 操作。
  // 只有当 payload.version 缺失，或者仍然等于当前 pending 的 version 时，
  // 才允许消费这条用户决策；否则必须 no-op，保留当前最新 pending 不动。
  if (payload?.version == null) {
    return true
  }

  return payload.version === pendingExternalChange.version
}

function handleRebindFailed(session, payload) {
  if (!isCurrentBindingToken(session, payload?.bindingToken)) {
    return { session, effects: [] }
  }

  const serializedError = serializeError(payload?.error)
  session.watchRuntime.status = 'degraded'
  session.watchRuntime.lastError = serializedError

  return {
    session,
    effects: [
      {
        type: 'notify-watch-warning',
        level: 'warning',
        reason: 'watch-rebind-failed',
        error: serializedError,
      },
    ],
  }
}

function handleExternalApply(session, payload, { now }) {
  const pendingExternalChange = session.externalRuntime.pendingExternalChange
  if (!pendingExternalChange || !matchesPendingVersion(pendingExternalChange, payload)) {
    return { session, effects: [] }
  }

  applyDiskContentToEditor(session, pendingExternalChange.diskContent ?? '', now)
  markResolved(session, {
    result: 'applied',
    versionHash: pendingExternalChange.versionHash,
  })
  return { session, effects: [] }
}

function handleExternalIgnore(session, payload) {
  const pendingExternalChange = session.externalRuntime.pendingExternalChange
  if (!pendingExternalChange || !matchesPendingVersion(pendingExternalChange, payload)) {
    return { session, effects: [] }
  }

  markResolved(session, {
    result: 'ignored',
    versionHash: pendingExternalChange.versionHash,
  })
  return { session, effects: [] }
}

function dropStalePendingExternalChange(session) {
  const pendingExternalChange = session.externalRuntime.pendingExternalChange
  if (!pendingExternalChange) {
    return false
  }

  // 外部冲突是和某一轮 watcher 绑定强绑定的。
  // 一旦保存成功导致文档身份切换并生成了新的 bindingToken，
  // 旧 token 上残留的 pending 就已经不再属于当前文档身份，
  // 只能丢弃，不能再拿它参与 noop 去重或 lastHandledVersionHash 写入。
  if (Number.isFinite(pendingExternalChange.watchBindingToken)
    && pendingExternalChange.watchBindingToken !== (session.watchRuntime?.bindingToken || 0)) {
    const pendingComparablePath = pendingExternalChange.comparablePath
      || normalizeComparablePath(pendingExternalChange.watchingPath)
    const currentComparablePath = normalizeComparablePath(
      session.watchRuntime?.watchingPath || session.documentSource?.path || null,
    )

    // token 递增并不一定代表文档身份切换。
    // 如果只是同一路径上的 watcher 重绑，旧 pending 依然属于当前文档，
    // 这里必须继续保留，不能因为 token 变了就静默吞掉外部冲突提示。
    if (pendingComparablePath && currentComparablePath && pendingComparablePath === currentComparablePath) {
      return false
    }

    // 只有在“旧 token + 路径身份也已经变化”时，才能认定这个 pending
    // 真正属于旧文档身份并安全丢弃。若旧数据没有记录路径身份，也按保守策略丢弃，
    // 避免把无法归属的 stale pending 泄漏到新文档路径上。
    session.externalRuntime.pendingExternalChange = null
    if (session.externalRuntime.resolutionState === 'pending-user') {
      session.externalRuntime.resolutionState = 'idle'
    }
    return true
  }

  return false
}

export function createWatchCoordinator({
  now = () => Date.now(),
} = {}) {
  function prepareSession(session) {
    ensureRuntime(session)

    // `resolved` 是非粘性终态，会在下一轮空转前回落为 idle；
    // `restored` 则必须保留到“恢复后的首次有效读盘”完成，不能过早丢掉阶段信息。
    if (session.externalRuntime.resolutionState === 'resolved') {
      session.externalRuntime.resolutionState = 'idle'
    }

    return session
  }

  function reconcileAfterSave(session) {
    ensureRuntime(session)
    if (dropStalePendingExternalChange(session)) {
      return {
        session,
        effects: [],
      }
    }

    const pendingExternalChange = session.externalRuntime.pendingExternalChange

    if (!pendingExternalChange) {
      return {
        session,
        effects: [],
      }
    }

    if (session.editorSnapshot.content !== session.diskSnapshot.content) {
      return {
        session,
        effects: [],
      }
    }

    if (Boolean(session.documentSource.exists) !== Boolean(session.diskSnapshot.exists)) {
      return {
        session,
        effects: [],
      }
    }

    // `save.succeeded` 之后 editor 和 disk 重新一致，并不等于“外部 pending 已经被消解”。
    // 只有当保存后的磁盘基线版本，确实等于当前 pending 指向的外部版本时，
    // 才能把这次保存视为“用户已经把外部版本收敛进来了”并写成 noop。
    // 如果保存落下去的是本地版本，那么保存期间出现的新外部版本仍然存在，
    // pending 必须继续保留，不能被误清空。
    if (pendingExternalChange.versionHash !== session.diskSnapshot.versionHash) {
      return {
        session,
        effects: [],
      }
    }

    markResolved(session, {
      result: 'noop',
      versionHash: pendingExternalChange.versionHash,
    })

    return {
      session,
      effects: [],
    }
  }

  function dispatch(session, {
    command,
    payload,
    externalChangeStrategy = 'prompt',
  }) {
    ensureRuntime(session)

    switch (command) {
      case 'watch.file-changed':
        return handleFileChanged(session, payload, {
          now,
          externalChangeStrategy,
        })
      case 'watch.file-missing':
        return handleFileMissing(session, payload, { now })
      case 'watch.file-restored':
        return handleFileRestored(session, payload, { now })
      case 'watch.error':
        return handleWatchError(session, payload)
      case 'watch.bound':
        return handleWatchBound(session, payload)
      case 'watch.unbound':
        return handleWatchUnbound(session, payload)
      case 'watch.rebind-failed':
        return handleRebindFailed(session, payload)
      case 'document.external.apply':
        return handleExternalApply(session, payload, { now })
      case 'document.external.ignore':
        return handleExternalIgnore(session, payload)
      default:
        return {
          session,
          effects: [],
        }
    }
  }

  return {
    prepareSession,
    reconcileAfterSave,
    dispatch,
  }
}

export default {
  createWatchCoordinator,
}
