/**
 * 统一把配置更新失败结果映射为可直接用于前端国际化的 messageKey。
 */
export function getConfigUpdateFailureMessageKey(result) {
  return result?.ok === false ? result.messageKey || 'message.configWriteFailed' : null
}
