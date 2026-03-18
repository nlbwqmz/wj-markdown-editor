/**
 * 创建滚动锚点会话缓存容器。
 * 该缓存只保存当前 renderer 内存中的纯数据，不承担持久化职责。
 *
 * @returns {Record<string, Record<string, any>>} 返回按会话分组的滚动锚点缓存对象。
 */
export function createViewScrollAnchorSessionStore() {
  // 使用无原型字典承载动态 key，避免 "__proto__" 等特殊键污染原型链。
  return Object.create(null)
}

/**
 * 复制一条滚动锚点记录，避免对外暴露缓存内部引用。
 *
 * @param {object | null | undefined} record
 * @returns {object | null} 返回复制后的记录；缺少记录时返回 null。
 */
function cloneAnchorRecord(record) {
  if (record == null || typeof record !== 'object') {
    return null
  }

  return {
    ...record,
    anchor: record.anchor != null && typeof record.anchor === 'object'
      ? { ...record.anchor }
      : record.anchor ?? null,
  }
}

/**
 * 判断传入值是否为合法的无原型字典。
 * 这里明确收紧契约，只接受无原型字典，
 * 从而避免普通对象在动态 key 场景下重新打开原型污染入口。
 *
 * @param {unknown} value
 * @returns {boolean} 返回该值是否为合法的无原型字典。
 */
function isNullPrototypeDictionary(value) {
  return value != null
    && typeof value === 'object'
    && Object.getPrototypeOf(value) === null
}

/**
 * 判断传入值是否为普通可读对象。
 * 该判断用于 options 这类只读入参，允许普通对象参与解构，
 * 但不会把它们当作缓存容器写回。
 *
 * @param {unknown} value
 * @returns {boolean} 返回该值是否可作为只读对象处理。
 */
function isReadableObject(value) {
  return value != null && typeof value === 'object'
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
  if (!isNullPrototypeDictionary(store)) {
    return null
  }

  const sessionId = typeof record?.sessionId === 'string' ? record.sessionId : ''
  const scrollAreaKey = typeof record?.scrollAreaKey === 'string' ? record.scrollAreaKey : ''

  if (sessionId === '' || scrollAreaKey === '') {
    return null
  }

  if (store[sessionId] == null) {
    // 会话 bucket 同样使用无原型字典，保证第二层动态键也不会命中原型属性。
    store[sessionId] = Object.create(null)
  }

  if (!isNullPrototypeDictionary(store[sessionId])) {
    return null
  }

  const nextRecord = cloneAnchorRecord(record)

  store[sessionId][scrollAreaKey] = nextRecord

  return cloneAnchorRecord(nextRecord)
}

/**
 * 读取指定会话与滚动区域的锚点记录。
 *
 * @param {Record<string, Record<string, any>>} store
 * @param {{ sessionId: string, scrollAreaKey: string }} options
 * @returns {object | null} 返回命中的滚动锚点记录；未命中时返回 null。
 */
export function getAnchorRecord(store, options) {
  if (!isNullPrototypeDictionary(store) || !isReadableObject(options)) {
    return null
  }

  const { sessionId, scrollAreaKey } = options

  if (typeof sessionId !== 'string' || typeof scrollAreaKey !== 'string') {
    return null
  }

  return cloneAnchorRecord(store[sessionId]?.[scrollAreaKey] ?? null)
}

/**
 * 清理某个会话下的全部滚动锚点记录。
 *
 * @param {Record<string, Record<string, any>>} store
 * @param {string} sessionId
 */
export function clearSessionAnchorRecords(store, sessionId) {
  if (!isNullPrototypeDictionary(store)) {
    return
  }

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
  if (!isNullPrototypeDictionary(store)) {
    return
  }

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
export function shouldRestoreAnchorRecord(options) {
  if (!isReadableObject(options)) {
    return false
  }

  const { record, sessionId, revision } = options

  if (record == null) {
    return false
  }

  return record.sessionId === sessionId && record.revision === revision
}
