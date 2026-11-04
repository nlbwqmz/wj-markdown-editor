/**
 * 把主进程下发的一次性提示组装成可显示文本。
 *
 * 协议约定：主进程只给 **i18n key + 计数/明细**，不拼任何自然语言。
 * 一旦主进程下发成品句子，renderer 的 `t()` 会把它当成 key 去查，
 * 每次都刷 `[intlify] Not found` 警告，切语言也不会跟着变。
 *
 * 明细列表（`detailList`）用于“N 个草稿 / N 个存在外部变更”这类拼接：
 * 分隔符同样走 i18n，避免中英文各自硬编码。
 *
 * @param {object} data 主进程下发的消息结构
 * @param {(key: string, params?: object) => string} translate i18n 翻译函数
 * @returns {string} 可直接展示的文本；无事可报时返回空串
 */
export function resolveWindowMessageContent(data, translate) {
  const t = typeof translate === 'function' ? translate : key => key

  const detailList = Array.isArray(data?.detailList) ? data.detailList : null
  if (detailList) {
    const separator = t('message.listSeparator')
    const detail = detailList
      .filter(item => item && Number.isFinite(item.count) && item.count > 0)
      .map(item => t(item.key, { count: item.count }))
      .join(separator)

    if (detail === '') {
      return ''
    }

    return t(data.content, {
      ...(data.params || {}),
      detail,
    })
  }

  if (typeof data?.content !== 'string' || data.content === '') {
    return ''
  }

  return t(data.content, data.params || {})
}

export default {
  resolveWindowMessageContent,
}
