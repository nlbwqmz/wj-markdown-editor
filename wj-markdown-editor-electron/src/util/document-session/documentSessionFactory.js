import crypto from 'node:crypto'

function createContentVersion(content = '') {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

function normalizeNow(now) {
  return Number.isFinite(now) ? now : Date.now()
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} 必须是非空字符串`)
  }
}

/**
 * 生成 persistedSnapshot 的默认值。
 *
 * 这里故意把“当前主进程观测到的磁盘基线”和“当前会话亲自成功写盘过的基线”分开：
 * 1. `diskSnapshot` 代表磁盘真相，可以来自首次打开、watcher、恢复等多种来源
 * 2. `persistedSnapshot` 只记录“本会话最近一次确认写盘成功的是哪一版”
 *
 * 对新建草稿、recent-missing、首次打开文件来说，都还没有“本会话成功写盘”的事实，
 * 所以 `savedAt` / `jobId` 必须从 null 起步，避免后续保存协调器把初始化误当成一次已完成写盘。
 */
function createPersistedSnapshot({ content, path, revision = 0 }) {
  return {
    content,
    revision,
    savedAt: null,
    path: path || null,
    jobId: null,
  }
}

/**
 * 生成 watchRuntime 的默认值。
 *
 * 这里不能在工厂阶段假装已经“开始监听”：
 * 1. 纯状态工厂不允许触碰 Electron / fs / watcher API
 * 2. watcher 是否真正绑定成功，要等后续协调器和副作用层给出结果
 *
 * 因此默认值统一表示“尚未绑定，但已经为未来的绑定和迟到事件过滤预留好了槽位”。
 */
function createWatchRuntime({ exists }) {
  return {
    bindingToken: 0,
    watchingPath: null,
    watchingDirectoryPath: null,
    status: 'idle',
    fileExists: Boolean(exists),
    eventFloorObservedAt: 0,
    recentInternalWrites: [],
    lastError: null,
  }
}

function createBaseSession({
  sessionId,
  documentPath,
  content,
  exists,
  missingPath,
  missingReason,
  stat,
  now,
  diskSource,
}) {
  const observedAt = normalizeNow(now)
  const normalizedContent = content ?? ''
  const versionHash = createContentVersion(normalizedContent)
  const baseSession = {
    sessionId,
    documentSource: {
      path: documentPath || null,
      exists: Boolean(exists),
      missingPath: missingPath || null,
      missingReason: missingReason || null,
      encoding: 'utf-8',
      lastKnownStat: stat || null,
    },
    editorSnapshot: {
      content: normalizedContent,
      revision: 0,
      updatedAt: observedAt,
    },
    diskSnapshot: {
      content: normalizedContent,
      versionHash,
      exists: Boolean(exists),
      stat: stat || null,
      observedAt,
      source: diskSource,
    },
    persistedSnapshot: createPersistedSnapshot({
      content: normalizedContent,
      path: documentPath || null,
      revision: 0,
    }),
    saveRuntime: {
      status: 'idle',
      inFlightJobId: null,
      inFlightRevision: null,
      inFlightBaseDiskVersionHash: null,
      requestedRevision: 0,
      trigger: null,
      lastError: null,
    },
    externalRuntime: {
      pendingExternalChange: null,
      resolutionState: 'idle',
      lastResolutionResult: 'none',
      lastHandledVersionHash: null,
      lastKnownDiskVersionHash: versionHash,
    },
    watchRuntime: createWatchRuntime({ exists }),
    closeRuntime: {
      intent: null,
      promptReason: null,
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    },
  }

  // 工厂阶段只返回“可变业务真相”本身，
  // 不再把 saved / dirty / title 这类派生快照铺回 session 顶层。
  // 这样后续命令层只更新基础状态时，就不会留下陈旧的派生副本。
  return baseSession
}

/**
 * 创建未命名草稿会话。
 *
 * 这里把 `diskSnapshot.content` 初始化为空字符串、`exists` 初始化为 false，
 * 是为了明确表达“当前草稿没有任何已存在的磁盘身份，但它的空内容基线是已知的”。
 * 后续通过 `deriveDocumentSnapshot(session)` 推导时，
 * 空白草稿会得到 `saved = true`，与现有产品的“新建后未编辑不算脏”保持一致。
 */
export function createDraftSession({ sessionId, now }) {
  assertNonEmptyString(sessionId, 'sessionId')

  return createBaseSession({
    sessionId,
    documentPath: null,
    content: '',
    exists: false,
    missingPath: null,
    missingReason: null,
    stat: null,
    now,
    diskSource: 'draft-init',
  })
}

/**
 * 创建已绑定到本地文件的会话。
 *
 * 这里的初始化只负责把“当前磁盘上已经存在的文件内容”装入状态模型，
 * 不负责 watcher 绑定、recent 写入或任何 Electron 副作用。
 */
export function createBoundFileSession({
  sessionId,
  path,
  content,
  stat,
  now,
}) {
  assertNonEmptyString(sessionId, 'sessionId')
  assertNonEmptyString(path, 'path')

  return createBaseSession({
    sessionId,
    documentPath: path,
    content: content ?? '',
    exists: true,
    missingPath: null,
    missingReason: null,
    stat: stat || null,
    now,
    diskSource: 'bound-file',
  })
}

/**
 * 创建 recent-missing 会话。
 *
 * 这里故意只构造“启动阶段允许展示缺失 recent 的那种草稿态数据”，
 * 不承担 trigger 判断职责。命令层先决定“是否允许进入 recent-missing 分支”，
 * 工厂只负责把这个分支的默认值稳定地写死。
 *
 * 之所以保留 `missingPath`，是为了让渲染层能提示用户移除哪一条 recent；
 * 之所以后续仍会把 `fileName` 推导成 `Unnamed`，是为了避免把一个并未成功绑定的路径伪装成当前文档身份。
 */
export function createRecentMissingSession({ sessionId, missingPath, now }) {
  assertNonEmptyString(sessionId, 'sessionId')
  assertNonEmptyString(missingPath, 'missingPath')

  return createBaseSession({
    sessionId,
    documentPath: null,
    content: '',
    exists: false,
    missingPath,
    missingReason: 'recent-missing',
    stat: null,
    now,
    diskSource: 'recent-missing',
  })
}

export default {
  createDraftSession,
  createBoundFileSession,
  createRecentMissingSession,
}
