import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function escapeRegExp(sourceText) {
  return sourceText.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function getSelectorBlockRange(source, selector) {
  const selectorIndex = source.indexOf(selector)
  assert.notEqual(selectorIndex, -1, `未找到选择器：${selector}`)

  const blockStart = source.indexOf('{', selectorIndex)
  assert.notEqual(blockStart, -1, `${selector} 缺少起始大括号`)

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
        return {
          blockSource: source.slice(blockStart, i + 1),
          selectorIndex,
          blockEnd: i + 1,
        }
      }
    }
  }

  assert.fail(`${selector} 没有正确闭合`)
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
  const previewThemeScopeRange = getSelectorBlockRange(codeBlockBaseSource, '.wj-preview-theme')
  const previewThemeScopeBlock = previewThemeScopeRange.blockSource
  const requiredSelectors = [
    '.pre-container',
    '.pre-container-toolbar',
    '.pre-container-copy',
    '.pre-container-lang',
    'pre.mermaid',
    'pre.mermaid-cache',
  ]

  for (const selector of requiredSelectors) {
    assert.match(
      previewThemeScopeBlock,
      new RegExp(escapeRegExp(selector), 'u'),
      `.wj-preview-theme 作用域内缺少结构层选择器：${selector}`,
    )
  }

  const previewThemeScopedSource = codeBlockBaseSource.slice(
    previewThemeScopeRange.selectorIndex,
    previewThemeScopeRange.blockEnd,
  )
  const sourceOutsidePreviewTheme = codeBlockBaseSource.replace(previewThemeScopedSource, '')

  for (const selector of requiredSelectors) {
    assert.doesNotMatch(
      sourceOutsidePreviewTheme,
      new RegExp(escapeRegExp(selector), 'u'),
      `结构层选择器 ${selector} 不得漂移到 .wj-preview-theme 作用域之外`,
    )
  }
})

test('code-block-base.scss 的结构层必须限定在 .wj-preview-theme 作用域下', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')

  assert.match(
    codeBlockBaseSource,
    /\.wj-preview-theme\s*\{/u,
    'code-block-base.scss 必须提供 .wj-preview-theme 根作用域',
  )
  assert.doesNotMatch(
    codeBlockBaseSource,
    /\.pre-container\s+code\.hljs[\s\S]*?padding-top\s*:/u,
    'code-block-base.scss 不得通过 code.hljs 的 padding-top 为工具栏让位',
  )
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
