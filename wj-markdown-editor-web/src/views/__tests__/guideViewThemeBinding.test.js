import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('示例页预览应绑定当前配置的代码主题和预览主题', () => {
  const source = readSource('../GuideView.vue')

  assert.match(
    source,
    /:code-theme="commonStore\.config\.theme\.code"/u,
    '示例页必须把代码主题绑定到当前配置，避免写死示例主题',
  )
  assert.match(
    source,
    /:preview-theme="commonStore\.config\.theme\.preview"/u,
    '示例页必须把预览主题绑定到当前配置，避免写死示例主题',
  )
  assert.equal(source.includes('code-theme="atom-one-dark"'), false)
  assert.equal(source.includes('preview-theme="github"'), false)
})
