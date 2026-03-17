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
    // 当前会话的唯一标识。
    // 主进程、渲染层和各类协调器都会依赖它来确认正在操作的是哪一个文档会话。
    sessionId,
    documentSource: {
      // 当前会话绑定的真实文档路径。
      // 对未命名草稿或 recent-missing 场景，这里会是 null，表示尚未建立可写磁盘身份。
      path: documentPath || null,
      // 主进程当前认知中的“文档路径对应文件是否存在”。
      // 它描述的是当前文档来源状态，而不是编辑器内容是否为空。
      exists: Boolean(exists),
      // 当文档无法按预期找到时，记录原本尝试打开的缺失路径。
      // 主要用于 recent 缺失提示、恢复提示等 UI 场景。
      missingPath: missingPath || null,
      // 记录文档缺失的原因类型，例如 recent-missing。
      // 命令层和渲染层会据此决定提示文案和后续恢复策略。
      missingReason: missingReason || null,
      // 当前文档内容在主进程侧采用的编码。
      // 目前固定为 utf-8，后续如果引入编码探测或切换，这里就是统一来源。
      encoding: 'utf-8',
      // 主进程最近一次确认到的文件 stat 信息。
      // watcher、外部修改判断和保存后的磁盘基线更新都可能依赖它辅助比对。
      lastKnownStat: stat || null,
    },
    editorSnapshot: {
      // 当前编辑器视角下的最新正文内容。
      // 这是“用户正在编辑什么”的事实来源，可能领先于磁盘内容。
      content: normalizedContent,
      // 编辑器内容修订号。
      // 每次被认定为一轮新的编辑器内容版本时递增，用于保存协调和竞态判断。
      revision: 0,
      // editorSnapshot 最近一次被写入的时间戳。
      // 方便后续状态推导、调试日志和时序判断。
      updatedAt: observedAt,
    },
    diskSnapshot: {
      // 主进程当前认知中的磁盘正文基线。
      // 它代表“磁盘真相”，可能来自首次读取、watcher 刷新或保存成功后的重新确认。
      content: normalizedContent,
      // 基于 diskSnapshot.content 计算出的稳定哈希。
      // 用于快速判断磁盘版本是否变化，避免大量直接字符串比较。
      versionHash,
      // 当前磁盘基线是否对应一个真实存在的文件。
      // 对草稿或 recent-missing 会话，这里通常为 false。
      exists: Boolean(exists),
      // 与当前磁盘基线对应的 stat 信息。
      // 主要用于辅助识别外部修改、文件替换或 watcher 事件后的真实落盘状态。
      stat: stat || null,
      // 这份磁盘基线被主进程观测到的时间。
      // 用来给后续状态机提供时序依据，避免不同时刻的数据混淆。
      observedAt,
      // 这份磁盘基线来自哪条链路。
      // 例如 draft-init、bound-file、recent-missing 等，便于调试初始化来源。
      source: diskSource,
    },
    // 当前会话“最近一次确认写盘成功”的持久化快照。
    // 它和 diskSnapshot 分离，专门用于回答“本会话自己成功保存到了哪一版”。
    persistedSnapshot: createPersistedSnapshot({
      content: normalizedContent,
      path: documentPath || null,
      revision: 0,
    }),
    saveRuntime: {
      // 保存状态机当前所处阶段。
      // idle 表示空闲，其他状态通常表示存在等待中或进行中的保存流程。
      status: 'idle',
      // 当前正在执行的保存任务 id。
      // 为空时表示没有 in-flight 保存任务。
      inFlightJobId: null,
      // 当前正在保存的是 editorSnapshot 的哪一个 revision。
      // 用于保存完成回写时确认结果对应的是哪次编辑内容。
      inFlightRevision: null,
      // 本次保存启动时所基于的磁盘版本哈希。
      // 用于检测“保存期间磁盘基线是否已被外部变化改写”。
      inFlightBaseDiskVersionHash: null,
      // 当前会话已请求保存到的最高 revision。
      // 当用户连续触发保存时，它帮助协调器判断是否还需要继续追赶最新内容。
      requestedRevision: 0,
      // 触发本轮保存的来源，例如手动保存、关闭前保存等。
      // 方便在状态机里区分不同保存意图。
      trigger: null,
      // 最近一次保存流程产生的错误信息。
      // 保存失败提示和调试日志都会依赖这里。
      lastError: null,
      // 手动保存请求的自增序号。
      // 用于给每次用户显式点击保存分配稳定 request id。
      manualRequestSequence: 0,
      // 当前仍处于活跃状态的手动保存请求 id 列表。
      // 某些 UI 需要知道哪些手动请求还没完成。
      activeManualRequestIds: [],
      // 手动保存请求 id 到目标 revision 的映射。
      // 用于在保存完成后精确结算对应请求，而不是笼统地全部清空。
      manualRequestTargets: {},
      // 已完成的手动保存请求结果队列。
      // 渲染层可据此消费“哪次手动保存成功/失败”的反馈。
      completedManualRequests: [],
    },
    externalRuntime: {
      // 当前尚未处理完的外部变更描述。
      // 当 watcher 发现磁盘被外部修改时，相关信息会先挂在这里，等待用户或状态机处理。
      pendingExternalChange: null,
      // 当前会话已经分配过的外部冲突版本号上界。
      // 新 prompt 必须在本会话内单调递增，避免旧弹窗携带的 version 误打到新冲突。
      pendingChangeSequence: 0,
      // 外部变更收敛流程当前状态。
      // 用于描述当前是否正在等待处理、应用结果还是已经回到空闲。
      resolutionState: 'idle',
      // 最近一次外部变更处理的结果。
      // 默认 none，后续可用于 UI 提示或调试回放。
      lastResolutionResult: 'none',
      // 最近一次已经处理过的外部磁盘版本哈希。
      // 用于避免同一份外部变化被重复消费。
      lastHandledVersionHash: null,
      // 当前已知的最新磁盘版本哈希。
      // watcher 或保存成功后都会推进它，作为外部修改判断的对照基线。
      lastKnownDiskVersionHash: versionHash,
    },
    // 文件监听运行时状态。
    // 具体默认值由 createWatchRuntime 统一生成，避免工厂和 watcher 协调器散落两套初始化逻辑。
    watchRuntime: createWatchRuntime({ exists }),
    closeRuntime: {
      // 当前关闭流程的意图来源。
      // 例如用户主动关闭窗口、退出应用或切换文档时，都会通过这里区分语义。
      intent: null,
      // 关闭前弹窗当前对应的原因。
      // 用于渲染层展示是“有未保存内容”还是其他阻塞原因。
      promptReason: null,
      // 如果关闭流程正在等待某次保存先完成，这里记录对应的保存任务 id。
      // 这样保存完成后，关闭协调器才能继续后续动作。
      waitingSaveJobId: null,
      // 关闭流程是否正在等待用户选择路径。
      // 常见于未命名草稿在关闭前触发“另存为”分支。
      awaitingPathSelection: false,
      // 是否绕过常规拦截直接执行关闭。
      // 仅在关闭流程已经确认可继续推进时置为 true。
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
