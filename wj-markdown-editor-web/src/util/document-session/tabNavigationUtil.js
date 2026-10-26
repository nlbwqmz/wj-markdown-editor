/**
 * 标签页导航的纯计算工具。
 *
 * 这一层刻意不依赖 store、不依赖 IPC：
 * 1. 让“连按 N 次到底该落在哪个标签”变成可单测的纯函数
 * 2. 让键盘链路把“位移”而不是“目标标签”作为意图累积单位，
 *    这样连按多次可以合并成一条命令，既不丢按键也不会延迟累积
 */

/**
 * 把下标规整到 [0, length) 区间。
 *
 * JS 的取模对负数返回负值（-1 % 3 === -1），环绕切换必须显式修正，
 * 否则“第一个标签按上一个”会算出不存在的下标。
 */
export function normalizeIndex(index, length) {
  if (!Number.isInteger(length) || length <= 0) {
    return -1
  }
  if (!Number.isInteger(index)) {
    return -1
  }
  return ((index % length) + length) % length
}

/**
 * 从窗口快照里抽出标签导航需要的最小基线。
 *
 * 只保留 sessionId 顺序与活动 sessionId：
 * 键盘链路需要的是“顺序 + 当前位置”，不是整份文档快照。
 * 缺少 tabs 或标签列表为空时返回 null，调用方据此直接 no-op。
 *
 * @param {{ tabs?: Array<{ sessionId?: string }>, activeSessionId?: string|null, sessionId?: string|null } | null | undefined} snapshot
 * @returns {{ sessionIdList: string[], activeSessionId: string|null } | null} 标签顺序与活动 sessionId，无法解析时为 null
 */
export function pickTabBaseline(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.tabs)) {
    return null
  }

  const sessionIdList = snapshot.tabs
    .map(tab => tab?.sessionId)
    .filter(sessionId => typeof sessionId === 'string' && sessionId !== '')

  if (sessionIdList.length === 0) {
    return null
  }

  // activeSessionId 是窗口快照的正式字段；
  // sessionId 只作为单标签旧结构的兜底，避免基线在边界版本上直接失效。
  const activeSessionId = (typeof snapshot.activeSessionId === 'string' && snapshot.activeSessionId !== '')
    ? snapshot.activeSessionId
    : ((typeof snapshot.sessionId === 'string' && snapshot.sessionId !== '') ? snapshot.sessionId : null)

  return {
    sessionIdList,
    activeSessionId,
  }
}

/**
 * 按位移解析目标标签。
 *
 * steps 是相对位移（正数向后、负数向前），越过两端回绕。
 * 以下情况一律返回 null，由调用方当作 no-op：
 * 1. 标签数不足 2（切了也还是同一个）
 * 2. 位移为 0
 * 3. 活动标签不在列表里（快照与标签列表暂时不一致）
 *
 * @param {{ sessionIdList?: string[], activeSessionId?: string|null, steps?: number }} options
 * @returns {string|null} 目标 sessionId，无法定位时为 null
 */
export function resolveTargetTabBySteps({ sessionIdList, activeSessionId, steps } = {}) {
  const sourceList = Array.isArray(sessionIdList) ? sessionIdList : []
  if (sourceList.length < 2 || !Number.isInteger(steps) || steps === 0) {
    return null
  }

  const currentIndex = typeof activeSessionId === 'string' ? sourceList.indexOf(activeSessionId) : -1
  if (currentIndex < 0) {
    return null
  }

  return sourceList[normalizeIndex(currentIndex + steps, sourceList.length)]
}

export default {
  normalizeIndex,
  pickTabBaseline,
  resolveTargetTabBySteps,
}
