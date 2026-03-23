/**
 * 统一把配置更新失败结果映射为可直接用于前端国际化的 messageKey。
 */
export function getConfigUpdateFailureMessageKey(result) {
  return result?.ok === false ? result.messageKey || 'message.configWriteFailed' : null
}

export function createConfigUpdateSubmissionGuard() {
  let shouldIgnoreNextSync = true

  return {
    markNextSyncIgnored() {
      shouldIgnoreNextSync = true
    },
    shouldSubmitConfigUpdate() {
      if (shouldIgnoreNextSync) {
        shouldIgnoreNextSync = false
        return false
      }

      return true
    },
  }
}
