/**
 * 每个标签页各自的视图模式记录。
 *
 * 视图模式（source / split / preview）属于「标签页这个视图外壳」，
 * 不属于文档会话数据，所以它只活在渲染层内存里：
 * 1. 不写 `tab-group.json`，重启后所有标签都回到配置的 startView
 * 2. 不进 document session 快照，切换标签不需要任何 IPC
 *
 * 这里只提供纯函数，响应式容器由 store 持有，便于单独测试。
 */

/** 合法的视图模式取值。 */
export const VIEW_MODE_LIST = ['source', 'split', 'preview']

/**
 * 创建视图模式记录的容器。
 * 使用无原型字典承载动态 sessionId，避免特殊 key 污染原型链。
 *
 * @returns {Record<string, string>} 返回空的无原型字典。
 */
export function createViewModeBySessionStore() {
  return Object.create(null)
}

/**
 * 判断取值是否是合法视图模式。
 *
 * @param {unknown} mode
 * @returns {boolean} 返回是否合法。
 */
export function isValidViewMode(mode) {
  return VIEW_MODE_LIST.includes(mode)
}

/**
 * 归一化视图模式。
 * 非法取值回退到 fallback；fallback 本身非法时再回退到 split。
 *
 * @param {unknown} mode
 * @param {string} [fallback]
 * @returns {string} 返回合法的视图模式。
 */
export function normalizeViewMode(mode, fallback = 'split') {
  if (isValidViewMode(mode)) {
    return mode
  }

  return isValidViewMode(fallback) ? fallback : 'split'
}

/**
 * 读取某个会话自己的视图模式。
 * 没有记录时返回 fallback，因此「新标签一律用 startView」由调用方传 fallback 实现。
 *
 * @param {Record<string, string> | null | undefined} viewModeBySessionId
 * @param {string | null | undefined} sessionId
 * @param {string} fallback
 * @returns {string} 返回该会话应当使用的视图模式。
 */
export function resolveViewModeForSession(viewModeBySessionId, sessionId, fallback) {
  const normalizedFallback = normalizeViewMode(fallback)

  if (viewModeBySessionId == null || typeof viewModeBySessionId !== 'object') {
    return normalizedFallback
  }

  if (typeof sessionId !== 'string' || sessionId === '') {
    return normalizedFallback
  }

  const record = viewModeBySessionId[sessionId]

  return isValidViewMode(record) ? record : normalizedFallback
}

/**
 * 写入某个会话的视图模式，返回新字典。
 * 每次都返回新对象，保证 Vue 侧能观察到变化。
 *
 * @param {Record<string, string> | null | undefined} viewModeBySessionId
 * @param {string | null | undefined} sessionId
 * @param {string} mode
 * @returns {Record<string, string>} 返回写入后的新字典；参数非法时原样返回归一化副本。
 */
export function setViewModeForSession(viewModeBySessionId, sessionId, mode) {
  const nextStore = Object.assign(createViewModeBySessionStore(), viewModeBySessionId ?? {})

  if (typeof sessionId !== 'string' || sessionId === '' || !isValidViewMode(mode)) {
    return nextStore
  }

  nextStore[sessionId] = mode

  return nextStore
}

/**
 * 给标签写入初始视图模式（仅在它还没有有效记录时生效）。
 *
 * 这一步是「startView 与当前标签解耦」的关键：
 * 标签第一次出现时，把**当时的** startView 固化到它自己名下，
 * 之后设置页再改 startView，只会影响后来新出现的标签，已有标签一律不动。
 *
 * 已有有效记录时直接返回原引用，不产生任何无意义的响应式更新。
 *
 * @param {Record<string, string> | null | undefined} viewModeBySessionId
 * @param {string | null | undefined} sessionId
 * @param {string} mode 标签首次出现时的 startView。
 * @returns {Record<string, string>} 返回写入后的字典（未变化时为原引用）。
 */
export function seedViewModeForSession(viewModeBySessionId, sessionId, mode) {
  const source = viewModeBySessionId ?? createViewModeBySessionStore()

  if (typeof sessionId !== 'string' || sessionId === '' || !isValidViewMode(mode)) {
    return source
  }

  if (isValidViewMode(source[sessionId])) {
    return source
  }

  return setViewModeForSession(source, sessionId, mode)
}

/**
 * 批量给标签列表写入初始视图模式。
 * 快照里出现的每个标签都会在首次出现时被固化一次，
 * 所以“改 startView 只影响之后打开的标签”对后台标签同样成立。
 *
 * @param {Record<string, string> | null | undefined} viewModeBySessionId
 * @param {Array<{ sessionId?: string }> | null | undefined} tabList
 * @param {string} mode 标签首次出现时的 startView。
 * @returns {Record<string, string>} 返回写入后的字典（未变化时为原引用）。
 */
export function seedViewModesForTabList(viewModeBySessionId, tabList, mode) {
  let nextStore = viewModeBySessionId ?? createViewModeBySessionStore()

  if (!Array.isArray(tabList)) {
    return nextStore
  }

  for (const tab of tabList) {
    nextStore = seedViewModeForSession(nextStore, tab?.sessionId, mode)
  }

  return nextStore
}

/**
 * 清理已关闭标签的视图模式记录。 * 缓存生命周期跟随标签：标签还在就保留，关掉即释放。
 *
 * activeSessionId 始终保留，避免快照的 tabs 列表尚未包含当前会话时把它误删。
 *
 * @param {Record<string, string> | null | undefined} viewModeBySessionId
 * @param {string[]} openSessionIdList 当前仍然打开的会话 id 列表。
 * @param {string | null | undefined} activeSessionId 当前活动会话 id。
 * @returns {Record<string, string>} 返回清理后的新字典。
 */
export function pruneViewModeBySession(viewModeBySessionId, openSessionIdList, activeSessionId) {
  const source = viewModeBySessionId ?? {}
  const keepSessionIdSet = new Set(
    Array.isArray(openSessionIdList)
      ? openSessionIdList.filter(sessionId => typeof sessionId === 'string' && sessionId !== '')
      : [],
  )

  if (typeof activeSessionId === 'string' && activeSessionId !== '') {
    keepSessionIdSet.add(activeSessionId)
  }

  const nextStore = createViewModeBySessionStore()
  let removed = false

  for (const sessionId of Object.keys(source)) {
    if (keepSessionIdSet.has(sessionId)) {
      nextStore[sessionId] = source[sessionId]
    } else {
      removed = true
    }
  }

  // 没有任何删除时返回原引用，避免 store 无意义地触发一次响应式更新。
  return removed ? nextStore : source
}

export default {
  VIEW_MODE_LIST,
  createViewModeBySessionStore,
  isValidViewMode,
  normalizeViewMode,
  resolveViewModeForSession,
  setViewModeForSession,
  seedViewModeForSession,
  seedViewModesForTabList,
  pruneViewModeBySession,
}
