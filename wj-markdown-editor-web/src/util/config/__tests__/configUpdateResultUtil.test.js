import assert from 'node:assert/strict'

const { test } = await import('node:test')

let configUpdateResultUtilModule = null

try {
  configUpdateResultUtilModule = await import('../configUpdateResultUtil.js')
}
catch {
  configUpdateResultUtilModule = null
}

test('配置更新失败结果必须映射出可直接用于 i18n 的 messageKey', () => {
  assert.ok(configUpdateResultUtilModule, '缺少配置更新结果映射工具')

  const { getConfigUpdateFailureMessageKey } = configUpdateResultUtilModule

  assert.equal(
    getConfigUpdateFailureMessageKey({
      ok: false,
      reason: 'config-write-failed',
      messageKey: 'message.configWriteFailed',
    }),
    'message.configWriteFailed',
  )
})

test('配置更新失败结果缺少 messageKey 时必须回退到默认失败文案 key', () => {
  assert.ok(configUpdateResultUtilModule, '缺少配置更新结果映射工具')

  const { getConfigUpdateFailureMessageKey } = configUpdateResultUtilModule

  assert.equal(
    getConfigUpdateFailureMessageKey({
      ok: false,
      reason: 'config-write-failed',
    }),
    'message.configWriteFailed',
  )
})

test('配置更新成功结果不应返回失败文案 key', () => {
  assert.ok(configUpdateResultUtilModule, '缺少配置更新结果映射工具')

  const { getConfigUpdateFailureMessageKey } = configUpdateResultUtilModule

  assert.equal(
    getConfigUpdateFailureMessageKey({
      ok: true,
    }),
    null,
  )
  assert.equal(getConfigUpdateFailureMessageKey(null), null)
})
