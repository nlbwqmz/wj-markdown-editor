import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function getBraceBlockByStartIndex(source, blockStart) {
  assert.notEqual(blockStart, -1, '缺少起始大括号')

  let braceDepth = 0

  for (let i = blockStart; i < source.length; i++) {
    const currentChar = source[i]
    if (currentChar === '{') {
      braceDepth++
      continue
    }
    if (currentChar === '}') {
      braceDepth--
      if (braceDepth === 0) {
        return source.slice(blockStart, i + 1)
      }
    }
  }

  assert.fail('样式块没有正确闭合')
}

function getSelectorBlock(source, selector) {
  const selectorIndex = source.indexOf(selector)
  assert.notEqual(selectorIndex, -1, `未找到选择器：${selector}`)

  const blockStart = source.indexOf('{', selectorIndex)
  return getBraceBlockByStartIndex(source, blockStart)
}

test('antd.scss 必须为 allow-clear 场景的 ant-input-affix-wrapper 提供暗黑主题背景与边框规则', () => {
  const source = readSource('../antd.scss')
  const affixWrapperBlock = getSelectorBlock(source, '.ant-input-affix-wrapper')

  assert.match(
    affixWrapperBlock,
    /background-color:\s*var\(--wj-markdown-bg-secondary\)\s*;/u,
    '.ant-input-affix-wrapper 在暗黑主题下必须继承输入框背景色',
  )
  assert.match(
    affixWrapperBlock,
    /color:\s*var\(--wj-markdown-text-primary\)\s*;/u,
    '.ant-input-affix-wrapper 在暗黑主题下必须继承输入框文字色',
  )
  assert.match(
    affixWrapperBlock,
    /&:not\(\.ant-input-affix-wrapper-focused\):not\(:hover\)\s*\{[\s\S]*?border-color:\s*var\(--wj-markdown-bg-secondary\)\s*;/u,
    '.ant-input-affix-wrapper 在非聚焦且非 hover 时必须隐藏默认浅色边框',
  )
  assert.match(
    affixWrapperBlock,
    /\.ant-input-suffix\s*\{[\s\S]*?\.anticon\s*\{[\s\S]*?color:\s*var\(--wj-markdown-text-tertiary\)\s*;/u,
    '.ant-input-affix-wrapper 必须继续为 suffix 图标提供暗黑主题图标色',
  )
})
