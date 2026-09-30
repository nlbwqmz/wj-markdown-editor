/**
 * 创建跨视图滚动位置交接容器。
 * 该容器只保存一条待消费的“阅读行号”记录：
 * 1. 源视图离开路由时发布当前阅读位置；
 * 2. 目标视图恢复前消费，并换算成本区域锚点。
 * 记录必须携带 sessionId 与 revision，消费时严格校验，
 * 避免文档已变化后仍按过期行号定位。
 *
 * @returns {{
 *   publish: (record: { sessionId?: string, revision?: number, lineNumber?: number, sourceAreaKey?: string }) => object | null,
 *   consume: (options: { sessionId?: string, revision?: number }) => object | null,
 *   clear: () => void,
 * }} 返回交接容器实例。
 */
export function createViewScrollHandoffStore() {
  let pendingRecord = null

  /**
   * 发布一条待消费的阅读位置。
   * 参数不合法时直接忽略，不覆盖已有记录。
   *
   * @param {{ sessionId?: string, revision?: number, lineNumber?: number, lineOffsetRatio?: number, sourceAreaKey?: string }} record
   * @returns {object | null} 返回写入后的记录副本；参数不合法时返回 null。
   */
  function publish(record) {
    const sessionId = typeof record?.sessionId === 'string' ? record.sessionId : ''
    const revision = record?.revision
    const lineNumber = record?.lineNumber
    const lineOffsetRatio = record?.lineOffsetRatio

    if (sessionId === '' || Number.isInteger(revision) === false || Number.isInteger(lineNumber) === false || lineNumber <= 0) {
      return null
    }

    pendingRecord = {
      sessionId,
      revision,
      lineNumber,
      // 行内像素比例参与跨视图换算；缺失或非法时退回 0（行首），保持旧行为。
      lineOffsetRatio: typeof lineOffsetRatio === 'number' && Number.isFinite(lineOffsetRatio)
        ? Math.min(Math.max(lineOffsetRatio, 0), 1)
        : 0,
      sourceAreaKey: typeof record?.sourceAreaKey === 'string' ? record.sourceAreaKey : '',
    }

    return { ...pendingRecord }
  }

  /**
   * 消费当前待处理的阅读位置。
   * 无论是否命中都会清空记录：过期位置没有保留价值。
   *
   * @param {{ sessionId?: string, revision?: number }} options
   * @returns {object | null} 返回身份匹配的记录副本；未命中或不匹配时返回 null。
   */
  function consume(options) {
    const record = pendingRecord
    pendingRecord = null

    if (record == null) {
      return null
    }

    const sessionId = typeof options?.sessionId === 'string' ? options.sessionId : ''
    const revision = options?.revision

    if (record.sessionId !== sessionId || record.revision !== revision) {
      return null
    }

    return { ...record }
  }

  /**
   * 显式清空待处理记录。
   */
  function clear() {
    pendingRecord = null
  }

  return {
    publish,
    consume,
    clear,
  }
}

// 全窗口共享同一条待消费交接记录：一次视图切换只会产生一条有效位置。
export const viewScrollHandoff = createViewScrollHandoffStore()

export default {
  createViewScrollHandoffStore,
  viewScrollHandoff,
}
