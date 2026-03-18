/**
 * 创建滚动锚点会话缓存容器。
 * 该缓存只保存当前 renderer 内存中的纯数据，不承担持久化职责。
 *
 * @returns {Record<string, Record<string, any>>} 返回按会话分组的滚动锚点缓存对象。
 */
export function createViewScrollAnchorSessionStore() {
  return {}
}

/**
 * 按 sessionId 与 scrollAreaKey 保存一条滚动锚点记录。
 * 同一会话下相同滚动区域的记录会被最新值覆盖，不同区域之间互不影响。
 *
 * @param {Record<string, Record<string, any>>} store
 * @param {object} record
 * @returns {object | null} 返回成功写入的记录；缺少必要键时返回 null。
 */
export function saveAnchorRecord(store, record) {
  const sessionId = typeof record?.sessionId === 'string' ? record.sessionId : ''
  const scrollAreaKey = typeof record?.scrollAreaKey === 'string' ? record.scrollAreaKey : ''

  if (sessionId === '' || scrollAreaKey === '') {
    return null
  }

  if (store[sessionId] == null) {
    store[sessionId] = {}
  }

  store[sessionId][scrollAreaKey] = record

  return record
}

/**
 * 读取指定会话与滚动区域的锚点记录。
 *
 * @param {Record<string, Record<string, any>>} store
 * @param {{ sessionId: string, scrollAreaKey: string }} options
 * @returns {object | null} 返回命中的滚动锚点记录；未命中时返回 null。
 */
export function getAnchorRecord(store, { sessionId, scrollAreaKey }) {
  if (typeof sessionId !== 'string' || typeof scrollAreaKey !== 'string') {
    return null
  }

  return store[sessionId]?.[scrollAreaKey] ?? null
}

/**
 * 清理某个会话下的全部滚动锚点记录。
 *
 * @param {Record<string, Record<string, any>>} store
 * @param {string} sessionId
 */
export function clearSessionAnchorRecords(store, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') {
    return
  }

  delete store[sessionId]
}

/**
 * 仅保留当前活动会话的记录，避免缓存无限增长。
 *
 * @param {Record<string, Record<string, any>>} store
 * @param {string | null} activeSessionId
 */
export function pruneAnchorRecords(store, activeSessionId) {
  for (const sessionId of Object.keys(store)) {
    if (sessionId !== activeSessionId) {
      delete store[sessionId]
    }
  }
}

/**
 * 根据会话与正文版本判断滚动锚点记录是否仍具备恢复资格。
 * 只要 sessionId 或 revision 任一不匹配，就必须拒绝恢复旧记录。
 *
 * @param {{ record: any, sessionId: string, revision: number }} options
 * @returns {boolean} 返回该记录是否允许按当前会话与版本恢复。
 */
export function shouldRestoreAnchorRecord({ record, sessionId, revision }) {
  if (record == null) {
    return false
  }

  return record.sessionId === sessionId && record.revision === revision
}
