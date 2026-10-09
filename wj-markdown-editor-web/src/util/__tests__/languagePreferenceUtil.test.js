import assert from 'node:assert/strict'

const { test } = await import('node:test')

const { resolveLanguagePreference } = await import('../languagePreferenceUtil.js')

test('显式语言偏好必须原样返回，不受系统 locale 影响', () => {
  assert.equal(resolveLanguagePreference('zh-CN', 'en-US'), 'zh-CN')
  assert.equal(resolveLanguagePreference('en-US', 'zh-CN'), 'en-US')
  assert.equal(resolveLanguagePreference('zh-CN', undefined), 'zh-CN')
  assert.equal(resolveLanguagePreference('en-US', null), 'en-US')
})

test('auto 在中文系系统 locale 下必须解析为中文', () => {
  assert.equal(resolveLanguagePreference('auto', 'zh'), 'zh-CN')
  assert.equal(resolveLanguagePreference('auto', 'zh-CN'), 'zh-CN')
  assert.equal(resolveLanguagePreference('auto', 'zh-Hans'), 'zh-CN')
  assert.equal(resolveLanguagePreference('auto', 'zh-TW'), 'zh-CN')
  assert.equal(resolveLanguagePreference('auto', 'ZH_cn'), 'zh-CN')
})

test('auto 在非中文或无法识别的系统 locale 下必须回退英文', () => {
  assert.equal(resolveLanguagePreference('auto', 'en-US'), 'en-US')
  assert.equal(resolveLanguagePreference('auto', 'de-DE'), 'en-US')
  assert.equal(resolveLanguagePreference('auto', 'C'), 'en-US')
  assert.equal(resolveLanguagePreference('auto', 'C.UTF-8'), 'en-US')
  assert.equal(resolveLanguagePreference('auto', ''), 'en-US')
  assert.equal(resolveLanguagePreference('auto', undefined), 'en-US')
  assert.equal(resolveLanguagePreference('auto', null), 'en-US')
})

test('未知偏好值必须按 auto 语义解析', () => {
  assert.equal(resolveLanguagePreference('jp-JP', 'zh-CN'), 'zh-CN')
  assert.equal(resolveLanguagePreference('jp-JP', 'en-US'), 'en-US')
  assert.equal(resolveLanguagePreference(undefined, 'zh-CN'), 'zh-CN')
  assert.equal(resolveLanguagePreference(null, 'C'), 'en-US')
})
