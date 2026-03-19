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
