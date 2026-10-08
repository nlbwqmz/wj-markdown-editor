import { createSetConfigPathRequest, sendConfigMutationRequest } from '@/util/config/configMutationCommandUtil.js'
import { getConfigUpdateFailureMessageKey } from '@/util/config/configUpdateResultUtil.js'

export const MENU_WIDTH_MIN = 200
export const MENU_WIDTH_MAX = 2000
export const MENU_WIDTH_DEFAULT = 200

/**
 * 将大纲栏宽度限制在允许范围内，避免拖拽结果超出设计边界。
 *
 * @param {number} width
 * @returns {number} 返回经过最小值与最大值钳制后的宽度。
 */
export function clampMenuWidth(width) {
  const normalizedWidth = Number(width)
  const nextWidth = Number.isFinite(normalizedWidth) ? normalizedWidth : MENU_WIDTH_DEFAULT

  return Math.min(MENU_WIDTH_MAX, Math.max(MENU_WIDTH_MIN, nextWidth))
}

// 应用持久化宽度时需要为大纲列之外的内容预留的最小空间。
// 编辑页还有编辑区、预览区两列（各需 MENU_WIDTH_MIN），预览页只有正文一列；
// 这里统一按最保守的两列计算，保证同一配置值在两个页面得到相同的大纲宽度。
export const MENU_LAYOUT_RESERVED_WIDTH = 2 + MENU_WIDTH_MIN * 2

/**
 * 计算大纲列在当前容器宽度下允许使用的上限。
 * 容器宽度不可用时退回设计上限，避免把布局钳制到最小值。
 *
 * @param {unknown} containerWidth
 * @returns {number} 返回大纲列宽度上限。
 */
export function resolveMenuWidthUpperBound(containerWidth) {
  const normalizedContainerWidth = Number(containerWidth)

  // 容器宽度为 0 说明元素尚未布局或已脱离文档（keep-alive 失活），
  // 此时不能按 0 计算上限，否则会把宽度错误钳制到最小值；
  // 这种情况退回设计上限，等元素重新参与布局后再由激活逻辑校正。
  return Number.isFinite(normalizedContainerWidth) && normalizedContainerWidth > 0
    ? Math.max(MENU_WIDTH_MIN, normalizedContainerWidth - MENU_LAYOUT_RESERVED_WIDTH)
    : MENU_WIDTH_MAX
}

/**
 * 统一维护大纲栏宽度的持久化：拖动结束后把最终宽度写回配置，成功后再同步 store。
 * 写盘前会与当前已持久化宽度比较，值未变化时直接短路，避免点击分隔条等无位移操作触发无谓写盘。
 */
export function createMenuWidthPersistenceController({
  sendConfigMutationRequest: sendMutationRequest = sendConfigMutationRequest,
  getConfigUpdateFailureMessageKey: resolveConfigUpdateFailureMessageKey = getConfigUpdateFailureMessageKey,
  getPersistedWidth = () => undefined,
  showWarningMessage = () => {},
  applyPersistedWidth = () => {},
} = {}) {
  /**
   * 解析可用于去重比较的宽度。
   * clampMenuWidth 会把 undefined 兜底成默认值 200，
   * 若直接参与比较，会把“无法判断”误判成“已持久化默认宽度”从而错误跳过写盘；
   * 因此这里只接受有限数字，其余一律返回 null 表示不具备比较条件。
   *
   * @param {unknown} value
   * @returns {number | null} 返回取整并钳制后的宽度；无法解析时返回 null。
   */
  function resolveComparableWidth(value) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.round(clampMenuWidth(value))
      : null
  }

  async function persistMenuWidth(width) {
    const normalizedWidth = Math.round(clampMenuWidth(width))
    const persistedWidth = resolveComparableWidth(getPersistedWidth())

    if (persistedWidth !== null && persistedWidth === normalizedWidth) {
      // 值未变化时直接短路，避免点击分隔条或拖动回原位触发无谓写盘。
      return {
        ok: true,
        skipped: true,
        reason: 'unchanged',
      }
    }

    try {
      const result = await sendMutationRequest(createSetConfigPathRequest(['menuWidth'], normalizedWidth))
      const failureMessageKey = resolveConfigUpdateFailureMessageKey(result)
      if (failureMessageKey) {
        showWarningMessage(failureMessageKey)
        return result
      }

      applyPersistedWidth(normalizedWidth)
      return result
    } catch {
      showWarningMessage('message.configWriteFailed')
      return {
        ok: false,
        messageKey: 'message.configWriteFailed',
        reason: 'config-update-transport-failed',
      }
    }
  }

  return {
    persistMenuWidth,
  }
}

export default {
  createMenuWidthPersistenceController,
}
