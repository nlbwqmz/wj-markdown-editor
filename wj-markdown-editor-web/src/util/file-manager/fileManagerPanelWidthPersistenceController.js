import { clampFileManagerPanelWidth } from '@/components/layout/homeViewFilePanelLayoutUtil.js'
import { createSetConfigPathRequest, sendConfigMutationRequest } from '@/util/config/configMutationCommandUtil.js'
import { getConfigUpdateFailureMessageKey } from '@/util/config/configUpdateResultUtil.js'

/**
 * 统一维护文件管理栏宽度的持久化：拖动结束后把最终宽度写回配置，成功后再同步 store。
 * 写盘前会与当前已持久化宽度比较，值未变化时直接短路，避免点击分隔条等无位移操作触发无谓写盘。
 */
export function createFileManagerPanelWidthPersistenceController({
  sendConfigMutationRequest: sendMutationRequest = sendConfigMutationRequest,
  getConfigUpdateFailureMessageKey: resolveConfigUpdateFailureMessageKey = getConfigUpdateFailureMessageKey,
  getPersistedWidth = () => undefined,
  showWarningMessage = () => {},
  applyPersistedWidth = () => {},
} = {}) {
  /**
   * 解析可用于去重比较的宽度。
   * clampFileManagerPanelWidth 会把 undefined 兜底成默认值 280，
   * 若直接参与比较，会把“无法判断”误判成“已持久化默认宽度”从而错误跳过写盘；
   * 因此这里只接受有限数字，其余一律返回 null 表示不具备比较条件。
   *
   * @param {unknown} value
   * @returns {number | null} 返回取整并钳制后的宽度；无法解析时返回 null。
   */
  function resolveComparableWidth(value) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.round(clampFileManagerPanelWidth(value))
      : null
  }

  async function persistFileManagerPanelWidth(width) {
    const normalizedWidth = Math.round(clampFileManagerPanelWidth(width))
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
      const result = await sendMutationRequest(createSetConfigPathRequest(['fileManagerWidth'], normalizedWidth))
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
    persistFileManagerPanelWidth,
  }
}

export default {
  createFileManagerPanelWidthPersistenceController,
}
