/**
 * 当前渲染层消费的文档快照默认值。
 *
 * 主进程已经把 session 真相投影成稳定快照，
 * renderer 侧仍然需要再做一次保守归一化：
 * 1. 防止窗口刚启动时 IPC 尚未返回导致的空值分支四处散落
 * 2. 防止后续兼容链路偶发漏字段时把页面状态打崩
 */
export function createDefaultDocumentSessionSnapshot() {
  return {
    revision: 0,
    sessionId: null,
    kind: 'markdown',
    content: '',
    fileName: 'Untitled',
    displayPath: null,
    recentMissingPath: null,
    windowTitle: 'wj-markdown-editor',
    saved: true,
    dirty: false,
    exists: false,
    isRecentMissing: false,
    // 当前窗口的标签页列表，顺序就是标签栏里的顺序。
    tabs: [],
    // 当前活动标签页对应的会话 id。
    activeSessionId: null,
    closePrompt: null,
    externalPrompt: null,
    resourceContext: {
      documentPath: null,
      saved: true,
      exists: false,
    },
  }
}

/**
 * 外部修改弹窗的 renderer 兼容状态默认值。
 *
 * 这里继续保留旧组件当前使用的字段外形，
 * 这样可以在迁移到 snapshot 真相的同时，尽量减少消费面改动。
 */
export function createDefaultExternalFileChangeState() {
  return {
    visible: false,
    loading: false,
    fileName: '',
    version: 0,
    localContent: '',
    externalContent: '',
  }
}

function normalizeRevision(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0
}

/**
 * 提取文档快照身份信息。
 * 视图层只允许用 `sessionId + revision` 作为滚动恢复资格判断依据，
 * 因此这里统一收敛读取口径，避免各处自行兜底导致判断不一致。
 *
 * @param {object | null | undefined} snapshot
 * @returns {{ sessionId: string | null, revision: number }} 返回归一化后的快照身份。
 */
export function getDocumentSessionSnapshotIdentity(snapshot) {
  return {
    sessionId: typeof snapshot?.sessionId === 'string' ? snapshot.sessionId : null,
    revision: normalizeRevision(snapshot?.revision),
  }
}

function normalizeClosePrompt(closePrompt) {
  if (!closePrompt || closePrompt.visible !== true) {
    return null
  }

  return {
    visible: true,
    reason: closePrompt.reason || null,
    allowForceClose: closePrompt.allowForceClose === true,
    // 关闭作用域：tab 表示只关当前标签页，window 表示关整个窗口。
    scope: closePrompt.scope === 'tab' ? 'tab' : 'window',
    // 未保存标签页数量，供弹窗做“笼统提示”。
    unsavedTabCount: Number.isInteger(closePrompt.unsavedTabCount) && closePrompt.unsavedTabCount >= 0
      ? closePrompt.unsavedTabCount
      : 0,
  }
}

/**
 * 归一化标签栏数据。
 *
 * 标签页只承载展示信息，正文永远只从活动会话的完整快照里取，
 * 因此这里严格丢弃任何多余字段，避免渲染层误把标签项当成第二份文档真相。
 */
function normalizeTabList(tabs) {
  if (!Array.isArray(tabs)) {
    return []
  }

  return tabs
    .map((tab) => {
      if (!tab || typeof tab !== 'object' || typeof tab.sessionId !== 'string' || !tab.sessionId) {
        return null
      }

      return {
        sessionId: tab.sessionId,
        kind: typeof tab.kind === 'string' && tab.kind ? tab.kind : 'markdown',
        fileName: typeof tab.fileName === 'string' && tab.fileName ? tab.fileName : 'Untitled',
        displayPath: tab.displayPath ?? null,
        dirty: tab.dirty === true,
        // 文件是否仍存在于磁盘：false 时渲染层给标签加“已被外部删除/移动”的删除线。
        // 字段缺失时按 true 处理：老主进程不下发这个字段，
        // 缺失不能解释成“文件已被删除”，否则升级过渡期里所有标签都会被误打成删除线。
        exists: tab.exists == null ? true : tab.exists === true,
        isRecentMissing: tab.isRecentMissing === true,
      }
    })
    .filter(Boolean)
}

function normalizeExternalPrompt(externalPrompt, fallbackFileName) {
  if (!externalPrompt || externalPrompt.visible !== true) {
    return null
  }

  return {
    visible: true,
    version: Number.isInteger(externalPrompt.version) ? externalPrompt.version : 0,
    localContent: typeof externalPrompt.localContent === 'string' ? externalPrompt.localContent : '',
    externalContent: typeof externalPrompt.externalContent === 'string' ? externalPrompt.externalContent : '',
    fileName: externalPrompt.fileName || fallbackFileName || 'Untitled',
  }
}

/**
 * 把主进程快照归一化成 renderer 可直接消费的稳定结构。
 *
 * 注意 recent-missing 的展示语义：
 * - 文档身份仍然是 Untitled
 * - 展示路径需要回退到缺失的 recent 路径
 */
export function normalizeDocumentSessionSnapshot(snapshot) {
  const defaultSnapshot = createDefaultDocumentSessionSnapshot()
  if (!snapshot || typeof snapshot !== 'object') {
    return defaultSnapshot
  }

  const isRecentMissing = snapshot.isRecentMissing === true
  const fileName = snapshot.fileName || (isRecentMissing ? 'Untitled' : defaultSnapshot.fileName)
  const recentMissingPath = snapshot.recentMissingPath ?? null
  const displayPath = snapshot.displayPath ?? (isRecentMissing ? recentMissingPath : null)
  const saved = snapshot.saved == null ? defaultSnapshot.saved : snapshot.saved === true
  const exists = snapshot.exists == null ? defaultSnapshot.exists : snapshot.exists === true
  const dirty = snapshot.dirty == null ? !saved : snapshot.dirty === true
  const revision = normalizeRevision(snapshot.revision)
  const normalizedSnapshot = {
    sessionId: snapshot.sessionId ?? null,
    kind: typeof snapshot.kind === 'string' && snapshot.kind ? snapshot.kind : 'markdown',
    content: typeof snapshot.content === 'string' ? snapshot.content : '',
    revision,
    fileName,
    displayPath,
    recentMissingPath,
    windowTitle: snapshot.windowTitle || (fileName === 'Untitled' ? 'wj-markdown-editor' : fileName),
    saved,
    dirty,
    exists,
    isRecentMissing,
    tabs: normalizeTabList(snapshot.tabs),
    activeSessionId: typeof snapshot.activeSessionId === 'string' && snapshot.activeSessionId
      ? snapshot.activeSessionId
      : (snapshot.sessionId ?? null),
    closePrompt: normalizeClosePrompt(snapshot.closePrompt),
    externalPrompt: normalizeExternalPrompt(snapshot.externalPrompt, fileName),
    resourceContext: {
      documentPath: snapshot.resourceContext?.documentPath ?? null,
      saved: snapshot.resourceContext?.saved == null ? saved : snapshot.resourceContext.saved === true,
      exists: snapshot.resourceContext?.exists == null ? exists : snapshot.resourceContext.exists === true,
    },
  }

  return normalizedSnapshot
}

/**
 * 将 recent 列表归一化为稳定数组。
 *
 * renderer 只需要消费 path/name 两个字段，
 * 无效项直接过滤，避免菜单层继续堆 if 判断。
 */
export function normalizeRecentList(recentList) {
  if (!Array.isArray(recentList)) {
    return []
  }

  return recentList
    .map((item) => {
      if (!item || typeof item !== 'object' || typeof item.path !== 'string') {
        return null
      }

      return {
        path: item.path,
        name: typeof item.name === 'string' && item.name
          ? item.name
          : item.path.split(/[\\/]/).pop() || item.path,
      }
    })
    .filter(Boolean)
}

/**
 * 从 snapshot.externalPrompt 推导旧弹窗仍在消费的外部修改状态。
 *
 * 同版本的 prompt 需要保留 loading：
 * - 用户点击“应用/忽略”后，按钮会进入 loading
 * - 真正关闭弹窗必须等待下一次 snapshot 收敛
 * - 如果这期间主进程只是再次投影同一版本，不能把 loading 提前抹掉
 */
export function deriveExternalFileChangeState(snapshot, currentExternalFileChange = createDefaultExternalFileChangeState()) {
  const normalizedSnapshot = normalizeDocumentSessionSnapshot(snapshot)
  const externalPrompt = normalizedSnapshot.externalPrompt
  if (!externalPrompt?.visible) {
    return createDefaultExternalFileChangeState()
  }

  const shouldPreserveLoading = currentExternalFileChange?.visible === true
    && currentExternalFileChange.version === externalPrompt.version

  return {
    ...createDefaultExternalFileChangeState(),
    visible: true,
    loading: shouldPreserveLoading ? currentExternalFileChange.loading === true : false,
    fileName: externalPrompt.fileName,
    version: externalPrompt.version,
    localContent: externalPrompt.localContent,
    externalContent: externalPrompt.externalContent,
  }
}

/**
 * 将 snapshot 投影成当前 Pinia store 需要维护的兼容字段。
 *
 * store 虽然会新增完整快照真相，
 * 但现有组件仍直接依赖 `fileName`、`saved`、`externalFileChange` 这些旧字段。
 * 其余展示细节已经统一回收到 `documentSessionSnapshot`，避免 store 再长出
 * `displayPath` / `closePromptVisible` 这类没人消费的镜像噪音。
 * 这里统一产出派生结果，避免状态在多个文件里各算一遍。
 */
export function deriveDocumentSessionStoreState(snapshot, currentExternalFileChange = createDefaultExternalFileChangeState()) {
  const documentSessionSnapshot = normalizeDocumentSessionSnapshot(snapshot)
  const externalFileChange = deriveExternalFileChangeState(documentSessionSnapshot, currentExternalFileChange)

  return {
    documentSessionSnapshot,
    fileName: documentSessionSnapshot.fileName,
    saved: documentSessionSnapshot.saved,
    externalFileChange,
  }
}

export default {
  createDefaultDocumentSessionSnapshot,
  createDefaultExternalFileChangeState,
  getDocumentSessionSnapshotIdentity,
  normalizeDocumentSessionSnapshot,
  normalizeRecentList,
  deriveExternalFileChangeState,
  deriveDocumentSessionStoreState,
}
