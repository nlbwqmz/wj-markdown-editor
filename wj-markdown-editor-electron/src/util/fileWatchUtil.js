import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

function createContentVersion(content = '') {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

// 目录级共享 watcher 注册表。
// key: 父目录绝对路径
// value: {
//   watcher,
//   files: Map<目标文件绝对路径, FileEntry>
// }
//
// 这里的共享层只负责“一个目录只 watch 一次”与“把事件路由到目标文件”，
// 真正的内部保存抑制、版本去重、pending 管理仍然保留在窗口级 state 中。
const directoryWatchRegistry = new Map()

/**
 * 文件监听状态。
 *
 * 这份状态仍然是一窗口一份，只负责单个文件的业务语义：
 * 1. 区分内部保存与外部修改
 * 2. 抑制重复版本与重复弹窗
 * 3. 在窗口切换监听目标时隔离旧状态
 * 4. 记录当前订阅关系，便于从共享目录 watcher 中注销
 */
function createWatchState() {
  return {
    watcher: null,
    watchingPath: null,
    watchingDirectoryPath: null,
    subscription: null,
    subscriptionToken: 0,
    currentVersion: 0,
    internalSaveWindowMs: 2000,
    lastInternalSaveAt: 0,
    lastInternalSavedVersion: null,
    recentInternalSaves: [],
    lastHandledVersionHash: null,
    pendingChange: null,
    fileExists: null,
    stopped: false,
  }
}

// 切换监听目标或停止监听时，要把与“当前文件业务语义”绑定的痕迹全部清理掉。
// 否则旧文件的 ignore/internal-save/pending 状态会污染到新文件。
function resetTrackedState(state) {
  state.currentVersion = 0
  state.lastInternalSaveAt = 0
  state.lastInternalSavedVersion = null
  state.recentInternalSaves = []
  state.lastHandledVersionHash = null
  state.pendingChange = null
  state.fileExists = null
}

/**
 * 清理 internal-save 抑制窗口之外的历史记录。
 *
 * 连续补写时，同一个文件可能在极短时间内产生多轮内部写盘。
 * watcher 事件并不保证严格按“写盘完成顺序”被我们读到，
 * 所以不能只保留最后一轮 hash，而要在抑制窗口内保留最近几轮。
 */
function pruneExpiredInternalSaves(state, now = Date.now()) {
  if (!Array.isArray(state?.recentInternalSaves) || state.recentInternalSaves.length === 0) {
    state.recentInternalSaves = []
    state.lastInternalSaveAt = 0
    state.lastInternalSavedVersion = null
    return state.recentInternalSaves
  }

  state.recentInternalSaves = state.recentInternalSaves
    .filter(item => now - item.savedAt <= state.internalSaveWindowMs)

  const latestInternalSave = state.recentInternalSaves.at(-1) || null
  state.lastInternalSaveAt = latestInternalSave?.savedAt || 0
  state.lastInternalSavedVersion = latestInternalSave?.versionHash || null
  return state.recentInternalSaves
}

function isSubscriptionCurrent(subscription) {
  if (!subscription?.state) {
    return false
  }

  return subscription.state.stopped !== true
    && subscription.state.subscription === subscription
    && subscription.state.subscriptionToken === subscription.token
    && subscription.state.watchingPath === subscription.filePath
}

function getDirectoryEntry(directoryPath) {
  return directoryWatchRegistry.get(directoryPath) || null
}

function createDirectoryEntry(directoryPath, watch) {
  const watcher = watch(directoryPath, (_eventType, filename) => {
    routeDirectoryEvent(directoryPath, filename).catch(() => {})
  })

  const entry = {
    directoryPath,
    watcher,
    files: new Map(),
  }

  directoryWatchRegistry.set(directoryPath, entry)
  return entry
}

function getOrCreateDirectoryEntry(directoryPath, watch) {
  const currentEntry = getDirectoryEntry(directoryPath)
  if (currentEntry) {
    return currentEntry
  }
  return createDirectoryEntry(directoryPath, watch)
}

function createFileEntry(filePath) {
  return {
    filePath,
    baseName: path.basename(filePath),
    subscriptions: new Set(),
    debounceTimer: null,
    latestRunToken: 0,
  }
}

function getOrCreateFileEntry(directoryEntry, filePath) {
  const currentEntry = directoryEntry.files.get(filePath)
  if (currentEntry) {
    return currentEntry
  }

  const nextEntry = createFileEntry(filePath)
  directoryEntry.files.set(filePath, nextEntry)
  return nextEntry
}

function removeFileEntryIfEmpty(directoryEntry, fileEntry) {
  if (!directoryEntry || !fileEntry || fileEntry.subscriptions.size > 0) {
    return
  }

  if (fileEntry.debounceTimer) {
    clearTimeout(fileEntry.debounceTimer)
    fileEntry.debounceTimer = null
  }

  directoryEntry.files.delete(fileEntry.filePath)
}

function removeDirectoryEntryIfEmpty(directoryEntry) {
  if (!directoryEntry || directoryEntry.files.size > 0) {
    return
  }

  if (directoryEntry.watcher && typeof directoryEntry.watcher.close === 'function') {
    directoryEntry.watcher.close()
  }

  directoryWatchRegistry.delete(directoryEntry.directoryPath)
}

function pruneInactiveSubscriptions(fileEntry) {
  for (const subscription of fileEntry.subscriptions) {
    if (!isSubscriptionCurrent(subscription)) {
      fileEntry.subscriptions.delete(subscription)
    }
  }
}

function getActiveSubscriptions(fileEntry) {
  if (!fileEntry) {
    return []
  }

  pruneInactiveSubscriptions(fileEntry)
  return [...fileEntry.subscriptions]
}

function resolveDebounceMs(subscriptions) {
  const debounceList = subscriptions
    .map(subscription => subscription.debounceMs)
    .filter(value => Number.isFinite(value) && value >= 0)

  if (debounceList.length === 0) {
    return 120
  }

  return Math.min(...debounceList)
}

function getReadFile(subscription) {
  return subscription?.readFile || (targetPath => fs.readFile(targetPath, 'utf-8'))
}

function isMissingError(error) {
  return error?.code === 'ENOENT'
}

/**
 * 标记一次“软件内部保存”。
 *
 * 保存前后都可能收到目录事件，因此这里只记录“刚刚写盘过的内容 hash”，
 * 后续即便目录 watcher 收到了 rename/change，也会先经过 hash 判定，
 * 同内容事件会直接被识别为 internal-save 并跳过。
 */
function markInternalSave(state, content) {
  const savedAt = Date.now()
  const versionHash = createContentVersion(content)
  const recentInternalSaves = pruneExpiredInternalSaves(state, savedAt)

  // 相同内容可能被重复写盘，这里只保留最新一次时间戳，
  // 避免历史数组因为重复 hash 无意义增长。
  state.recentInternalSaves = recentInternalSaves
    .filter(item => item.versionHash !== versionHash)
    .concat({ versionHash, savedAt })
  state.lastInternalSaveAt = savedAt
  state.lastInternalSavedVersion = versionHash
  state.pendingChange = null
  state.fileExists = true
}

/**
 * 将当前待处理的外部变更标记为“已处理完成”。
 *
 * 这里的“已处理”包含三种情况：
 * 1. 用户手动应用
 * 2. 用户手动忽略
 * 3. Electron 自动应用，或者发现真实值更新后已经与编辑值相同
 */
function settlePendingChange(state, versionHash = state?.pendingChange?.versionHash || null) {
  state.lastHandledVersionHash = versionHash
  state.pendingChange = null
  return state.lastHandledVersionHash
}

/**
 * 判断一次读盘结果是否应该进入“外部修改”流程。
 *
 * 这里不关心事件类型是 change 还是 rename，也不关心事件来自哪个平台。
 * 目录 watcher 只负责告诉我们“目标路径可能变化了”，
 * 真正是否属于新的外部内容变化，只能靠读盘后的内容 hash 来决定。
 */
function resolveExternalChange(state, diskContent) {
  if (!state || state.stopped === true) {
    return {
      changed: false,
      reason: 'stopped',
    }
  }

  const versionHash = createContentVersion(diskContent)
  const recentInternalSaves = pruneExpiredInternalSaves(state)

  if (recentInternalSaves.some(item => item.versionHash === versionHash)) {
    return {
      changed: false,
      reason: 'internal-save',
      versionHash,
    }
  }

  if (versionHash === state.lastHandledVersionHash) {
    return {
      changed: false,
      reason: 'handled',
      versionHash,
    }
  }

  if (state.pendingChange?.versionHash === versionHash) {
    return {
      changed: false,
      reason: 'duplicate-pending',
      versionHash,
      change: state.pendingChange,
    }
  }

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

function ignorePendingChange(state) {
  if (!state.pendingChange) {
    return null
  }

  return settlePendingChange(state, state.pendingChange.versionHash)
}

async function notifyMissing(subscriptions, error) {
  for (const subscription of subscriptions) {
    if (!isSubscriptionCurrent(subscription)) {
      continue
    }

    const wasMissing = subscription.state.fileExists === false
    subscription.state.fileExists = false

    if (wasMissing || !subscription.onMissing) {
      continue
    }

    try {
      await subscription.onMissing(error, { stage: 'missing' })
    } catch (callbackError) {
      subscription.onError && subscription.onError(callbackError, { stage: 'missing-callback' })
    }
  }
}

async function notifyRestored(subscriptions, diskContent) {
  for (const subscription of subscriptions) {
    if (!isSubscriptionCurrent(subscription)) {
      continue
    }

    const wasMissing = subscription.state.fileExists === false
    subscription.state.fileExists = true

    if (!wasMissing || !subscription.onRestored) {
      continue
    }

    try {
      await subscription.onRestored(diskContent, { stage: 'restored' })
    } catch (callbackError) {
      subscription.onError && subscription.onError(callbackError, { stage: 'restored-callback' })
    }
  }
}

async function notifyReadError(subscriptions, error) {
  for (const subscription of subscriptions) {
    if (!isSubscriptionCurrent(subscription) || !subscription.onError) {
      continue
    }
    subscription.onError(error, { stage: 'read' })
  }
}

async function runResolveChange(fileEntry, runToken) {
  const subscriptionsBeforeRead = getActiveSubscriptions(fileEntry)
  if (subscriptionsBeforeRead.length === 0 || fileEntry.latestRunToken !== runToken) {
    return null
  }

  const reader = getReadFile(subscriptionsBeforeRead[0])
  let diskContent

  try {
    diskContent = await reader(fileEntry.filePath)
  } catch (error) {
    if (fileEntry.latestRunToken !== runToken) {
      return {
        changed: false,
        reason: 'stale',
      }
    }

    const currentSubscriptions = getActiveSubscriptions(fileEntry)
    if (currentSubscriptions.length === 0) {
      return {
        changed: false,
        reason: 'stale',
      }
    }

    if (isMissingError(error)) {
      await notifyMissing(currentSubscriptions, error)
      return {
        changed: false,
        reason: 'missing',
        error,
      }
    }

    await notifyReadError(currentSubscriptions, error)
    return {
      changed: false,
      reason: 'read-error',
      error,
    }
  }

  if (fileEntry.latestRunToken !== runToken) {
    return {
      changed: false,
      reason: 'stale',
    }
  }

  const subscriptionsAfterRead = getActiveSubscriptions(fileEntry)
  if (subscriptionsAfterRead.length === 0) {
    return {
      changed: false,
      reason: 'stale',
    }
  }

  await notifyRestored(subscriptionsAfterRead, diskContent)

  const resultList = []

  for (const subscription of subscriptionsAfterRead) {
    if (!isSubscriptionCurrent(subscription)) {
      continue
    }

    const result = resolveExternalChange(subscription.state, diskContent)
    resultList.push(result)

    if (result.changed !== true || !subscription.onExternalChange || !isSubscriptionCurrent(subscription)) {
      continue
    }

    try {
      await subscription.onExternalChange(result.change, result)
    } catch (error) {
      subscription.onError && subscription.onError(error, { stage: 'callback' })
    }
  }

  return resultList
}

function scheduleResolve(fileEntry) {
  const activeSubscriptions = getActiveSubscriptions(fileEntry)
  if (activeSubscriptions.length === 0) {
    return
  }

  if (fileEntry.debounceTimer) {
    clearTimeout(fileEntry.debounceTimer)
  }

  const runToken = fileEntry.latestRunToken + 1
  fileEntry.latestRunToken = runToken
  const debounceMs = resolveDebounceMs(activeSubscriptions)

  fileEntry.debounceTimer = setTimeout(() => {
    fileEntry.debounceTimer = null
    if (fileEntry.latestRunToken !== runToken) {
      return
    }
    runResolveChange(fileEntry, runToken).catch(() => {})
  }, debounceMs)
}

function routeDirectoryEvent(directoryPath, filename) {
  const directoryEntry = getDirectoryEntry(directoryPath)
  if (!directoryEntry) {
    return Promise.resolve()
  }

  if (filename === null || filename === undefined) {
    for (const fileEntry of directoryEntry.files.values()) {
      scheduleResolve(fileEntry)
    }
    return Promise.resolve()
  }

  const fileNameText = Buffer.isBuffer(filename) ? filename.toString('utf8') : String(filename)
  const targetFilePath = path.resolve(directoryPath, fileNameText)
  const targetFileEntry = directoryEntry.files.get(targetFilePath)

  if (!targetFileEntry) {
    return Promise.resolve()
  }

  scheduleResolve(targetFileEntry)
  return Promise.resolve()
}

function detachSubscription(subscription) {
  if (!subscription) {
    return
  }

  const directoryEntry = getDirectoryEntry(subscription.directoryPath)
  if (!directoryEntry) {
    return
  }

  const fileEntry = directoryEntry.files.get(subscription.filePath)
  if (!fileEntry) {
    return
  }

  fileEntry.subscriptions.delete(subscription)
  removeFileEntryIfEmpty(directoryEntry, fileEntry)
  removeDirectoryEntryIfEmpty(directoryEntry)
}

/**
 * 注册单个文件到“父目录共享 watcher”。
 *
 * 这里会把窗口级 state 挂到某个文件订阅项下，而不是直接创建文件 watcher。
 * 同一父目录下的多个文件、多窗口会自动复用同一个目录 watcher。
 */
function startWatching({
  state,
  filePath,
  debounceMs = 120,
  readFile = targetPath => fs.readFile(targetPath, 'utf-8'),
  onExternalChange,
  onMissing,
  onRestored,
  onError,
  watch,
}) {
  if (typeof watch !== 'function') {
    throw new TypeError('watch 必须是函数')
  }

  stopWatching(state)

  const directoryPath = path.dirname(filePath)
  const directoryEntry = getOrCreateDirectoryEntry(directoryPath, watch)
  const fileEntry = getOrCreateFileEntry(directoryEntry, filePath)

  state.stopped = false
  state.subscriptionToken += 1
  state.watchingPath = filePath
  state.watchingDirectoryPath = directoryPath
  state.watcher = directoryEntry.watcher
  state.fileExists = true

  const subscription = {
    token: state.subscriptionToken,
    state,
    filePath,
    directoryPath,
    debounceMs,
    readFile,
    onExternalChange,
    onMissing,
    onRestored,
    onError,
  }

  state.subscription = subscription
  fileEntry.subscriptions.add(subscription)
  return directoryEntry.watcher
}

function stopWatching(state) {
  if (!state) {
    return
  }

  state.stopped = true
  state.subscriptionToken += 1

  if (state.subscription) {
    detachSubscription(state.subscription)
  }

  state.subscription = null
  state.watcher = null
  state.watchingPath = null
  state.watchingDirectoryPath = null
  resetTrackedState(state)
}

function resetRegistryForTest() {
  for (const directoryEntry of directoryWatchRegistry.values()) {
    for (const fileEntry of directoryEntry.files.values()) {
      if (fileEntry.debounceTimer) {
        clearTimeout(fileEntry.debounceTimer)
        fileEntry.debounceTimer = null
      }
      fileEntry.subscriptions.clear()
    }

    if (directoryEntry.watcher && typeof directoryEntry.watcher.close === 'function') {
      directoryEntry.watcher.close()
    }
  }

  directoryWatchRegistry.clear()
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
  resetRegistryForTest,
}
