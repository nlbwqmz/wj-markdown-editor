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

test('codemirror.scss 必须在暗黑主题下为行号 gutter 显式补回右边框', () => {
  const source = readSource('../codemirror.scss')
  const darkThemeBlock = getSelectorBlock(source, ':root[theme=\'dark\']')
  const gutterBlock = getSelectorBlock(darkThemeBlock, '.cm-gutters')

  assert.match(
    gutterBlock,
    /border-right\s*:\s*1px\s+solid\s+var\(--wj-markdown-border-primary\)\s*;/u,
    '暗黑主题下的 .cm-gutters 必须显式补回右边框颜色',
  )
  assert.doesNotMatch(
    gutterBlock,
    /border\s*:\s*none\s*;/u,
    '项目侧的暗黑 gutter 覆盖不应再次把边框整体清空',
  )
})
