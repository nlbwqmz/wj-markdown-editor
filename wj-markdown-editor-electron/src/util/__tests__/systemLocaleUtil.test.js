import { describe, expect, it } from 'vitest'
import { resolveLanguagePreference } from '../systemLocaleUtil.js'

describe('resolveLanguagePreference', () => {
  it('显式语言偏好必须原样返回，不受系统 locale 影响', () => {
    expect(resolveLanguagePreference('zh-CN', 'en-US')).toBe('zh-CN')
    expect(resolveLanguagePreference('en-US', 'zh-CN')).toBe('en-US')
    expect(resolveLanguagePreference('zh-CN', undefined)).toBe('zh-CN')
    expect(resolveLanguagePreference('en-US', null)).toBe('en-US')
  })

  it('auto 在中文系系统 locale 下必须解析为中文', () => {
    expect(resolveLanguagePreference('auto', 'zh')).toBe('zh-CN')
    expect(resolveLanguagePreference('auto', 'zh-CN')).toBe('zh-CN')
    expect(resolveLanguagePreference('auto', 'zh-Hans')).toBe('zh-CN')
    expect(resolveLanguagePreference('auto', 'zh-TW')).toBe('zh-CN')
    expect(resolveLanguagePreference('auto', 'ZH_cn')).toBe('zh-CN')
  })

  it('auto 在非中文或无法识别的系统 locale 下必须回退英文', () => {
    expect(resolveLanguagePreference('auto', 'en-US')).toBe('en-US')
    expect(resolveLanguagePreference('auto', 'de-DE')).toBe('en-US')
    expect(resolveLanguagePreference('auto', 'C')).toBe('en-US')
    expect(resolveLanguagePreference('auto', 'C.UTF-8')).toBe('en-US')
    expect(resolveLanguagePreference('auto', '')).toBe('en-US')
    expect(resolveLanguagePreference('auto', undefined)).toBe('en-US')
    expect(resolveLanguagePreference('auto', null)).toBe('en-US')
  })

  it('未知偏好值必须按 auto 语义解析', () => {
    expect(resolveLanguagePreference('jp-JP', 'zh-CN')).toBe('zh-CN')
    expect(resolveLanguagePreference('jp-JP', 'en-US')).toBe('en-US')
    expect(resolveLanguagePreference(undefined, 'zh-CN')).toBe('zh-CN')
    expect(resolveLanguagePreference(null, 'C')).toBe('en-US')
  })
})
