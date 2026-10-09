/**
 * 滚动锚点缓存使用的文档身份工具。
 *
 * 滚动锚点缓存不能再以临时 sessionId 作为唯一 bucket 键：
 * 同一窗口切换文档时每次都会新建 sessionId，
 * 因此这里统一把快照投影成稳定的 documentKey，
 * 让滚动位置可以按文档身份跨会话复用。
 */

/**
 * 从候选值中取第一个非空字符串。
 *
 * @param {...unknown} values
 * @returns {string} 返回第一个非空字符串；没有命中时返回空字符串。
 */
function resolveFirstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value !== '') {
      return value
    }
  }

  return ''
}

/**
 * 归一化快照 revision。
 * 只有非负整数才允许进入恢复资格判断，其余一律回退到 0。
 *
 * @param {unknown} value
 * @returns {number} 返回归一化后的 revision。
 */
function normalizeRevision(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0
}

/**
 * 提取滚动锚点缓存所需的文档身份。
 *
 * documentKey 优先沿用入参中已有的 `documentKey`（仅接受非空字符串），
 * 其次是真实文档路径，再次是缺失最近文件路径，然后是展示路径；
 * 全部都不是非空字符串时回退到 `session:<sessionId>`，sessionId 也为空时返回空字符串。
 *
 * 该函数对已解析过的 identity 幂等：把上一次的返回值再次传入时，
 * documentKey 会原样沿用，不会因为 identity 缺少 resourceContext / displayPath
 * 而退化成 `session:<sessionId>`，从而保证采集侧与恢复侧始终使用同一个 bucket 键。
 *
 * @param {object | null | undefined} snapshot 完整 snapshot，或已解析过的文档身份。
 * @returns {{ documentKey: string, sessionId: string, revision: number }} 返回归一化后的文档身份。
 */
export function resolveDocumentScrollAnchorIdentity(snapshot) {
  const sessionId = typeof snapshot?.sessionId === 'string' ? snapshot.sessionId : ''
  const documentPath = resolveFirstNonEmptyString(
    snapshot?.documentKey,
    snapshot?.resourceContext?.documentPath,
    snapshot?.recentMissingPath,
    snapshot?.displayPath,
  )
  const documentKey = documentPath !== ''
    ? documentPath
    : sessionId !== ''
      ? `session:${sessionId}`
      : ''

  return {
    documentKey,
    sessionId,
    revision: normalizeRevision(snapshot?.revision),
  }
}

export default {
  resolveDocumentScrollAnchorIdentity,
}
