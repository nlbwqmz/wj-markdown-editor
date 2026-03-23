import assert from 'node:assert/strict'

import enUS from '../enUS.js'
import zhCN from '../zhCN.js'

const { test } = await import('node:test')

test('中英文文案都应提供缺失锚点提示', () => {
  assert.equal(
    zhCN.message.anchorTargetDoesNotExist,
    '锚点目标位置不存在',
  )
  assert.equal(
    enUS.message.anchorTargetDoesNotExist,
    'The anchor target does not exist.',
  )
})

test('中英文文案都应提供配置更新失败提示', () => {
  assert.equal(
    zhCN.message.configWriteFailed,
    '配置保存失败，请稍后重试。',
  )
  assert.equal(
    zhCN.message.configReadFailed,
    '读取配置失败，已回退到默认配置。',
  )
  assert.equal(
    zhCN.message.configDirectoryUnavailable,
    '配置目录不可用，请检查权限。',
  )
  assert.equal(
    zhCN.message.configInvalid,
    '配置内容无效，请检查当前修改。',
  )

  assert.equal(
    enUS.message.configWriteFailed,
    'Failed to save configuration. Please try again later.',
  )
  assert.equal(
    enUS.message.configReadFailed,
    'Failed to read configuration. The default configuration has been restored.',
  )
  assert.equal(
    enUS.message.configDirectoryUnavailable,
    'The configuration directory is unavailable. Please check permissions.',
  )
  assert.equal(
    enUS.message.configInvalid,
    'The configuration is invalid. Please review your changes.',
  )
})
