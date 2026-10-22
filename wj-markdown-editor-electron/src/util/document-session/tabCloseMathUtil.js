/**
 * 批量关闭标签的落点计算。
 *
 * 抽成纯函数有两个原因：
 * 1. 这套规则必须与“一次只关一个”的结果一致，值得单独覆盖；
 * 2. windowLifecycleService 依赖 electron 运行时，纯计算不该被它拖进测试环境。
 */

/**
 * 批量关闭后决定活动标签。
 *
 * 语义与“一次只关一个”保持一致，但只算一次：
 * - 活动标签不在关闭列表里：保持不动，用户视角零切换；
 * - 活动标签被关掉：按它原来的索引就近取第一个保留的标签。
 *
 * @param {object} params
 * @param {string[]} params.windowSessionIds 关闭前的完整标签顺序
 * @param {string[]} params.remainingSessionIds 关闭后仍然保留的标签顺序
 * @param {string | null} params.previousActiveSessionId 关闭前的活动标签
 * @returns {string | null} 关闭后的活动会话；全部关光时返回 null
 */
export function resolveNextActiveSessionId({
  windowSessionIds,
  remainingSessionIds,
  previousActiveSessionId,
}) {
  if (remainingSessionIds.length === 0) {
    return null
  }

  if (previousActiveSessionId && remainingSessionIds.includes(previousActiveSessionId)) {
    return previousActiveSessionId
  }

  const previousIndex = previousActiveSessionId
    ? windowSessionIds.indexOf(previousActiveSessionId)
    : -1
  if (previousIndex < 0) {
    return remainingSessionIds[0]
  }

  // 原活动标签之前还剩多少个标签，就是它在剩余列表里的落点
  const preservedBefore = windowSessionIds
    .slice(0, previousIndex)
    .filter(sessionId => remainingSessionIds.includes(sessionId))
    .length

  return remainingSessionIds[Math.min(preservedBefore, remainingSessionIds.length - 1)]
}
