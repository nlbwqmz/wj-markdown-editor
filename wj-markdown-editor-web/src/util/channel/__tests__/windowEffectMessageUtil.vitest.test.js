import { describe, expect, it } from 'vitest'
import { resolveWindowMessageContent } from '../windowEffectMessageUtil.js'

/**
 * 主进程下发的一次性提示必须只带 i18n key 与计数。
 *
 * 回归点：主进程曾经直接下发拼好的中文句子，
 * renderer 用 `t()` 查不到 key，每次都会刷 `[intlify] Not found` 警告，
 * 且切换到英文时文案不会跟着变。
 */
const messages = {
  'message.listSeparator': '、',
  'message.closeSkippedSummary': params => `其余标签已关闭。未关闭：${params.detail}。`,
  'message.closeSkippedDraft': params => `${params.count} 个未命名草稿`,
  'message.closeSkippedExternal': params => `${params.count} 个存在外部变更`,
  'message.saveSuccessfully': '保存成功',
}

function t(key, params = {}) {
  const entry = messages[key]
  if (entry == null) {
    return key
  }
  return typeof entry === 'function' ? entry(params) : entry
}

describe('resolveWindowMessageContent', () => {
  it('普通 key 直接翻译', () => {
    expect(resolveWindowMessageContent({ content: 'message.saveSuccessfully' }, t)).toBe('保存成功')
  })

  it('明细列表按分隔符拼接，并丢弃计数为 0 的条目', () => {
    const content = resolveWindowMessageContent({
      content: 'message.closeSkippedSummary',
      detailList: [
        { key: 'message.closeSkippedDraft', count: 1 },
        { key: 'message.closeSkippedExternal', count: 0 },
      ],
    }, t)

    expect(content).toBe('其余标签已关闭。未关闭：1 个未命名草稿。')
  })

  it('明细列表全为 0 时不产生任何提示', () => {
    const content = resolveWindowMessageContent({
      content: 'message.closeSkippedSummary',
      detailList: [{ key: 'message.closeSkippedDraft', count: 0 }],
    }, t)

    expect(content).toBe('')
  })

  it('缺少 content 时不产生提示', () => {
    expect(resolveWindowMessageContent({ type: 'warning' }, t)).toBe('')
  })
})
