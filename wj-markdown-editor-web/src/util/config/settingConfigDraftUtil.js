import { getConfigUpdateFailureMessageKey } from './configUpdateResultUtil.js'

/**
 * 深拷贝设置页本地配置草稿，避免把 store 配置对象直接作为可编辑草稿复用。
 *
 * @param {any} config
 * @returns {any} 返回可安全用于本地编辑的配置草稿副本。
 */
export function cloneConfigDraft(config) {
  if (config == null) {
    return config
  }

  return JSON.parse(JSON.stringify(config))
}

/**
 * 仅当目录选择结果仍是字符串时，才允许覆写本地草稿字段。
 * 目录选择取消会返回 undefined，此时必须保持原值不变。
 *
 * @param {Record<string, any> | null | undefined} draftConfig
 * @param {string} fieldName
 * @param {unknown} nextValue
 * @returns {boolean} 返回本次是否真正更新了本地草稿字段。
 */
export function applySelectableStringField(draftConfig, fieldName, nextValue) {
  if (!draftConfig || typeof fieldName !== 'string' || typeof nextValue !== 'string') {
    return false
  }

  draftConfig[fieldName] = nextValue
  return true
}

/**
 * 把 recentMax 输入值规范成设置页允许的整数区间，避免把空值或非法值写入配置草稿。
 *
 * 规则：
 * - 空值、非数字统一回填为 0
 * - 小于 0 的值回填为 0
 * - 大于 50 的值回填为 50
 * - 小数统一截断为整数
 *
 * @param {unknown} value
 * @returns {number} 返回 0 到 50 的整数。
 */
export function normalizeRecentMaxInputValue(value) {
  const normalizedNumber = Number(value)
  if (Number.isNaN(normalizedNumber)) {
    return 0
  }

  const normalizedInteger = Math.trunc(normalizedNumber)
  if (normalizedInteger < 0) {
    return 0
  }

  if (normalizedInteger > 50) {
    return 50
  }

  return normalizedInteger
}

/**
 * 配置保存返回结构化失败结果时，回滚本地草稿并忽略下一次同步提交。
 *
 * @param {{
 *   result: any,
 *   storeConfig: any,
 *   submissionGuard?: { markNextSyncIgnored?: () => void },
 * }} params
 * @returns {{ messageKey: string, nextConfig: any } | null} 返回失败回滚结果；成功时返回 null。
 */
export function resolveConfigUpdateFailureRecovery(params) {
  const {
    result,
    storeConfig,
    submissionGuard,
  } = params
  const messageKey = getConfigUpdateFailureMessageKey(result)
  if (!messageKey) {
    return null
  }

  submissionGuard?.markNextSyncIgnored?.()
  return {
    messageKey,
    nextConfig: cloneConfigDraft(storeConfig),
  }
}

/**
 * 配置提交通道抛出异常时，统一回滚本地草稿并返回默认失败文案 key。
 *
 * @param {{
 *   storeConfig: any,
 *   submissionGuard?: { markNextSyncIgnored?: () => void },
 * }} params
 * @returns {{ messageKey: string, nextConfig: any }} 返回传输层失败时的统一回滚结果。
 */
export function createTransportConfigUpdateFailureRecovery(params) {
  const {
    storeConfig,
    submissionGuard,
  } = params

  submissionGuard?.markNextSyncIgnored?.()
  return {
    messageKey: 'message.configWriteFailed',
    nextConfig: cloneConfigDraft(storeConfig),
  }
}
