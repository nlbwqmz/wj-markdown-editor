import crypto from 'node:crypto'
import fs from 'node:fs/promises'

function createContentVersion(content = '') {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * 文件监听状态。
 *
 * 这份状态会一直挂在每个窗口自己的 `winInfo.externalWatch` 上，
 * 用来解决下面几类问题：
 * 1. 软件自己保存文件时，不要把这次写盘误判成“外部修改”
 * 2. 同一个外部版本在短时间内被底层 watcher 连续触发时，不要重复弹窗
 * 3. 用户已经“忽略 / 应用”过某次外部修改后，不要立刻再次处理同一版本
 * 4. 重新监听新文件时，旧文件异步回调返回的数据不能污染新状态
 */
function createWatchState() {
  return {
    watcher: null,
    watchingPath: null,
    debounceTimer: null,
    generation: 0,
    latestRunToken: 0,
    currentVersion: 0,
    internalSaveWindowMs: 1500,
    lastInternalSaveAt: 0,
    lastInternalSavedVersion: null,
    handledChangeWindowMs: 1500,
    lastHandledAt: 0,
    lastHandledVersionHash: null,
    ignoredVersionHash: null,
    pendingChange: null,
    stopped: false,
  }
}

// 切换监听目标或停止监听时，必须把旧文件的跟踪痕迹一起清掉。
// 否则旧文件的忽略状态、内部保存状态会污染新文件的监听结果。
function resetTrackedState(state) {
  state.currentVersion = 0
  state.lastInternalSaveAt = 0
  state.lastInternalSavedVersion = null
  state.lastHandledAt = 0
  state.lastHandledVersionHash = null
  state.ignoredVersionHash = null
  state.pendingChange = null
  state.latestRunToken = 0
}

function isCurrentRun(state, generation, runToken) {
  return state.stopped !== true
    && state.generation === generation
    && state.latestRunToken === runToken
}

/**
 * 标记一次“软件内部保存”。
 *
 * 保存时我们会提前记录下本次写盘内容的哈希值，
 * 这样 watcher 很快收到同样内容的磁盘变化时，
 * 就能在 `resolveExternalChange` 里识别成 `internal-save` 并直接跳过。
 */
function markInternalSave(state, content) {
  state.lastInternalSaveAt = Date.now()
  state.lastInternalSavedVersion = createContentVersion(content)
  state.pendingChange = null
}

/**
 * 将当前待处理的外部变更标记为“已处理完成”。
 *
 * 这里的“已处理”包含三种情况：
 * 1. 用户手动应用
 * 2. 用户手动忽略
 * 3. Electron 自动应用，或者发现真实值更新后已经与编辑值相同
 *
 * 处理完成后要做两件事：
 * - 清掉 `pendingChange`，避免影响下一次外部事件
 * - 记录最近一次已处理版本，短时间内再次收到同版本事件时直接忽略
 */
function settlePendingChange(state, versionHash = state?.pendingChange?.versionHash || null) {
  state.lastHandledAt = Date.now()
  state.lastHandledVersionHash = versionHash
  state.ignoredVersionHash = null
  state.pendingChange = null
  return state.lastHandledVersionHash
}

/**
 * 判断一次磁盘读盘结果是否应该进入“外部修改”流程。
 *
 * 返回 `changed: true` 才表示这次内容真的需要上报给 Electron 主逻辑处理；
 * 否则只是内部保存、重复版本、已处理版本等噪音事件。
 */
function resolveExternalChange(state, diskContent) {
  if (!state || state.stopped === true) {
    return {
      changed: false,
      reason: 'stopped',
    }
  }

  const versionHash = createContentVersion(diskContent)

  if (
    versionHash === state.lastInternalSavedVersion
    && Date.now() - state.lastInternalSaveAt <= state.internalSaveWindowMs
  ) {
    // 这是软件自己刚刚保存产生的磁盘变化，不应进入外部修改链路。
    return {
      changed: false,
      reason: 'internal-save',
      versionHash,
    }
  }

  if (
    versionHash === state.lastHandledVersionHash
    && Date.now() - state.lastHandledAt <= state.handledChangeWindowMs
  ) {
    // 同一版本刚刚已经被“应用 / 忽略 / 自动收敛”处理过，短时间内直接去重。
    return {
      changed: false,
      reason: 'handled',
      versionHash,
    }
  }

  if (versionHash === state.ignoredVersionHash) {
    // 兼容旧状态字段。当前逻辑里最终也按“已处理”看待，不再单独保留忽略态。
    return {
      changed: false,
      reason: 'handled',
      versionHash,
    }
  }

  if (state.pendingChange?.versionHash === versionHash) {
    // 同一外部版本已经在等待用户决策，不需要重复创建待处理项。
    return {
      changed: false,
      reason: 'duplicate-pending',
      versionHash,
      change: state.pendingChange,
    }
  }

  // 走到这里说明：
  // - 不是内部保存
  // - 不是刚处理过的版本
  // - 不是当前已经待决的版本
  // 因此可以确认为新的外部修改。
  state.currentVersion += 1
  state.pendingChange = {
    version: state.currentVersion,
    versionHash,
    content: diskContent,
  }

  return {
    changed: true,
    reason: 'external-change',
    versionHash,
    change: state.pendingChange,
  }
}

// “忽略”不再单独保留一份长期忽略状态，
// 而是直接收敛到“本次版本已处理完成”，防止脏状态影响下一轮监听。
function ignorePendingChange(state) {
  if (!state.pendingChange) {
    return null
  }

  return settlePendingChange(state, state.pendingChange.versionHash)
}

async function runResolveChange({
  state,
  filePath,
  readFile,
  onExternalChange,
  onError,
  generation,
  runToken,
}) {
  if (!isCurrentRun(state, generation, runToken)) {
    return null
  }

  let diskContent

  try {
    diskContent = await readFile(filePath)
  } catch (error) {
    if (isCurrentRun(state, generation, runToken)) {
      onError && onError(error, { stage: 'read' })
    }
    return {
      changed: false,
      reason: 'read-error',
      error,
    }
  }

  if (!isCurrentRun(state, generation, runToken)) {
    return {
      changed: false,
      reason: 'stale',
    }
  }

  const result = resolveExternalChange(state, diskContent)

  if (result.changed !== true || !onExternalChange || !isCurrentRun(state, generation, runToken)) {
    return result
  }

  try {
    // 这里只负责把“新的外部变更”交给上层，
    // 真正如何更新 content/tempContent、如何通知渲染端，统一由 winInfoUtil 决定。
    await onExternalChange(result.change, result)
  } catch (error) {
    if (isCurrentRun(state, generation, runToken)) {
      onError && onError(error, { stage: 'callback' })
    }
    return {
      ...result,
      changed: false,
      reason: 'callback-error',
      error,
    }
  }

  return result
}

function startWatching({
  state,
  filePath,
  debounceMs = 120,
  readFile = targetPath => fs.readFile(targetPath, 'utf-8'),
  onExternalChange,
  onError,
  watch,
}) {
  const createWatcher = watch
  if (typeof createWatcher !== 'function') {
    throw new TypeError('watch 必须是函数')
  }

  stopWatching(state)

  state.stopped = false
  state.generation += 1
  state.watchingPath = filePath
  const generation = state.generation

  const scheduleResolve = async () => {
    if (state.stopped === true || state.generation !== generation) {
      return null
    }

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
    }

    const runToken = state.latestRunToken + 1
    state.latestRunToken = runToken

    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null
      if (!isCurrentRun(state, generation, runToken)) {
        return
      }

      runResolveChange({
        state,
        filePath,
        readFile,
        onExternalChange,
        onError,
        generation,
        runToken,
      }).catch(() => {})
    }, debounceMs)

    return null
  }

  // 底层 watcher 只负责“有变化了”，真正的读盘、去重、防抖都在这里统一完成。
  state.watcher = createWatcher(filePath, scheduleResolve)
  return state.watcher
}

function stopWatching(state) {
  if (!state) {
    return
  }

  state.stopped = true
  state.generation += 1

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer)
    state.debounceTimer = null
  }

  if (state.watcher && typeof state.watcher.close === 'function') {
    state.watcher.close()
  }

  state.watcher = null
  state.watchingPath = null
  resetTrackedState(state)
}

export default {
  createContentVersion,
  createWatchState,
  markInternalSave,
  settlePendingChange,
  resolveExternalChange,
  ignorePendingChange,
  startWatching,
  stopWatching,
}
