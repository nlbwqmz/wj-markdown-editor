/**
 * 创建滚动锚点缓存容器。
 * 该缓存只保存当前 renderer 内存中的纯数据，不承担持久化职责。
 *
 * @returns {Record<string, Record<string, any>>} 返回按文档分组的滚动锚点缓存对象。
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
 * 解析记录应归属的文档键。
 * 优先取 record.documentKey，缺省时回退 record.sessionId，保证旧调用方仍然可用。
 *
 * @param {object | null | undefined} record
 * @returns {string} 返回记录归属的文档键；无法解析时返回空字符串。
 */
function resolveRecordDocumentKey(record) {
  const documentKey = record?.documentKey ?? record?.sessionId

  return typeof documentKey === 'string' ? documentKey : ''
}

/**
 * 解析缓存读取使用的文档键。
 * 与写入侧保持一致：documentKey 缺省时用 sessionId 兜底。
 *
 * @param {object | null | undefined} options
 * @returns {string} 返回读取使用的文档键；无法解析时返回空字符串。
 */
function resolveOptionsDocumentKey(options) {
  const documentKey = options?.documentKey ?? options?.sessionId

  return typeof documentKey === 'string' ? documentKey : ''
}

/**
 * 解析一个 bucket 中最新的 savedAt。
 * 裁剪时需要按新旧程度淘汰 bucket；完全没有有效 savedAt 的 bucket 视为最旧。
 *
 * @param {unknown} bucket
 * @returns {number} 返回 bucket 内最新的 savedAt；没有有效值时返回 Number.NEGATIVE_INFINITY。
 */
function resolveBucketLatestSavedAt(bucket) {
  if (!isReadableObject(bucket)) {
    return Number.NEGATIVE_INFINITY
  }

  let latestSavedAt = Number.NEGATIVE_INFINITY

  for (const record of Object.values(bucket)) {
    const savedAt = record?.savedAt

    if (Number.isFinite(savedAt) && savedAt > latestSavedAt) {
      latestSavedAt = savedAt
    }
  }

  return latestSavedAt
}

/**
 * 按 documentKey 与 scrollAreaKey 保存一条滚动锚点记录。
 * 同一文档下相同滚动区域的记录会被最新值覆盖，不同区域之间互不影响。
 * 未显式传入 documentKey 时回退 sessionId，并把最终文档键写回记录，
 * 保证后续按 documentKey 读取、恢复资格判断都有稳定依据。
 *
 * @param {Record<string, Record<string, any>>} store
 * @param {object} record
 * @returns {object | null} 返回成功写入的记录；缺少必要键时返回 null。
 */
export function saveAnchorRecord(store, record) {
  if (!isNullPrototypeDictionary(store)) {
    return null
  }

  const documentKey = resolveRecordDocumentKey(record)
  const scrollAreaKey = typeof record?.scrollAreaKey === 'string' ? record.scrollAreaKey : ''

  if (documentKey === '' || scrollAreaKey === '') {
    return null
  }

  if (store[documentKey] == null) {
    // 文档 bucket 同样使用无原型字典，保证第二层动态键也不会命中原型属性。
    store[documentKey] = Object.create(null)
  }

  if (!isNullPrototypeDictionary(store[documentKey])) {
    return null
  }

  const nextRecord = cloneAnchorRecord({
    ...record,
    documentKey,
  })

  store[documentKey][scrollAreaKey] = nextRecord

  return cloneAnchorRecord(nextRecord)
}

/**
 * 读取指定文档与滚动区域的锚点记录。
 * 入参同时兼容 `{ documentKey }` 与旧式 `{ sessionId }`，后者仅在 documentKey 缺省时兜底。
 *
 * @param {Record<string, Record<string, any>>} store
 * @param {{ documentKey?: string, sessionId?: string, scrollAreaKey: string }} options
 * @returns {object | null} 返回命中的滚动锚点记录；未命中时返回 null。
 */
export function getAnchorRecord(store, options) {
  if (!isNullPrototypeDictionary(store) || !isReadableObject(options)) {
    return null
  }

  const documentKey = resolveOptionsDocumentKey(options)
  const { scrollAreaKey } = options

  if (documentKey === '' || typeof scrollAreaKey !== 'string') {
    return null
  }

  return cloneAnchorRecord(store[documentKey]?.[scrollAreaKey] ?? null)
}

/**
 * 清理某个文档下的全部滚动锚点记录。
 * 函数名保留旧称，语义已改为按 documentKey 删除。
 *
 * @param {Record<string, Record<string, any>>} store
 * @param {string} documentKey
 */
export function clearSessionAnchorRecords(store, documentKey) {
  if (!isNullPrototypeDictionary(store)) {
    return
  }

  if (typeof documentKey !== 'string' || documentKey === '') {
    return
  }

  delete store[documentKey]
}

/**
 * 裁剪滚动锚点缓存，避免文档切换场景下记录无限增长。
 * 规则：优先保留 activeDocumentKey，其余 bucket 按最新 savedAt 从新到旧保留，
 * 直到总条目数不超过 maxEntries；没有有效 savedAt 的 bucket 按最旧处理。
 *
 * @param {Record<string, Record<string, any>>} store
 * @param {string | null} activeDocumentKey
 * @param {number} [maxEntries]
 */
export function pruneAnchorRecords(store, activeDocumentKey, maxEntries = 20) {
  if (!isNullPrototypeDictionary(store)) {
    return
  }

  const limit = Number.isInteger(maxEntries) && maxEntries >= 0 ? maxEntries : 20
  const activeKey = typeof activeDocumentKey === 'string' ? activeDocumentKey : ''
  const bucketKeys = Object.keys(store)

  if (bucketKeys.length <= limit) {
    return
  }

  const removableKeys = bucketKeys
    .filter(bucketKey => bucketKey !== activeKey)
    .sort((leftKey, rightKey) => resolveBucketLatestSavedAt(store[leftKey]) - resolveBucketLatestSavedAt(store[rightKey]))

  let removeCount = bucketKeys.length - limit
  let removableIndex = 0

  while (removeCount > 0 && removableIndex < removableKeys.length) {
    delete store[removableKeys[removableIndex]]
    removableIndex++
    removeCount--
  }

  if (removeCount > 0 && activeKey !== '' && Object.hasOwn(store, activeKey)) {
    // maxEntries 小于 1 时连活动文档也不得不裁掉，保证总条目数不超过上限。
    delete store[activeKey]
  }
}

/**
 * 根据文档身份与正文版本判断滚动锚点记录是否仍具备恢复资格。
 *
 * `same-session` 模式保持原有严格语义：documentKey、sessionId、revision 必须同时匹配；
 * `document` 模式用于同一窗口切换文档的场景，只校验文档身份，
 * 允许跨 sessionId / revision 复用滚动位置。
 *
 * @param {{
 *   record: any,
 *   documentKey?: string,
 *   sessionId?: string,
 *   revision?: number,
 *   mode?: 'same-session' | 'document',
 * }} options
 * @returns {boolean} 返回该记录是否允许按当前身份恢复。
 */
export function shouldRestoreAnchorRecord(options) {
  if (!isReadableObject(options)) {
    return false
  }

  const { record, documentKey, sessionId, revision, mode = 'same-session' } = options

  if (record == null) {
    return false
  }

  const recordDocumentKey = record.documentKey ?? record.sessionId
  // 兼容尚未迁移的调用方：只传 sessionId 时，用 sessionId 作为文档身份兜底。
  const expectedDocumentKey = documentKey ?? sessionId

  if (recordDocumentKey !== expectedDocumentKey) {
    return false
  }

  if (mode === 'document') {
    return true
  }

  return record.sessionId === sessionId && record.revision === revision
}
