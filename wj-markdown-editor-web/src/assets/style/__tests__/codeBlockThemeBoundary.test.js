import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function escapeRegExp(sourceText) {
  return sourceText.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

test('main.js 必须在 preview theme 之后导入 code block base', () => {
  const mainSource = readSource('../../../main.js')
  const previewThemeImport = 'import \'@/assets/style/preview-theme/preview-theme.scss\''
  const codeBlockBaseImport = 'import \'@/assets/style/code-block/code-block-base.scss\''

  const previewThemeImportIndex = mainSource.indexOf(previewThemeImport)
  const codeBlockBaseImportIndex = mainSource.indexOf(codeBlockBaseImport)

  assert.notEqual(previewThemeImportIndex, -1, 'main.js 缺少 preview-theme.scss 导入')
  assert.notEqual(codeBlockBaseImportIndex, -1, 'main.js 缺少 code-block-base.scss 导入')
  assert.ok(
    codeBlockBaseImportIndex > previewThemeImportIndex,
    'code-block-base.scss 必须排在 preview-theme.scss 之后导入',
  )
})

test('code-block-base.scss 只承接 code block 结构层选择器', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')
  const requiredSelectors = [
    '.pre-container',
    '.pre-container-toolbar',
    '.pre-container-copy',
    '.pre-container-lang',
    'pre.mermaid',
  ]

  for (const selector of requiredSelectors) {
    assert.match(
      codeBlockBaseSource,
      new RegExp(escapeRegExp(selector), 'u'),
      `code-block-base.scss 缺少结构层选择器：${selector}`,
    )
  }
})

test('code-block-base.scss 不得承接 code theme 分支和 token 颜色规则', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')

  assert.doesNotMatch(
    codeBlockBaseSource,
    /\.code-theme-[\w-]+/u,
    'code-block-base.scss 不得包含 .code-theme-* 分支',
  )
  assert.doesNotMatch(
    codeBlockBaseSource,
    /\.hljs-(keyword|string|comment)\b/u,
    'code-block-base.scss 不得包含 hljs token 颜色规则',
  )
})
