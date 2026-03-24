import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function getSelectorBlock(source, selector) {
  const selectorIndex = source.indexOf(selector)
  assert.notEqual(selectorIndex, -1, `未找到选择器：${selector}`)

  const blockStart = source.indexOf('{', selectorIndex)
  assert.notEqual(blockStart, -1, `${selector} 缺少起始大括号`)

  let braceDepth = 0

  for (let i = blockStart; i < source.length; i++) {
    const char = source[i]
    if (char === '{') {
      braceDepth++
      continue
    }
    if (char === '}') {
      braceDepth--
      if (braceDepth === 0) {
        return source.slice(blockStart, i + 1)
      }
    }
  }

  assert.fail(`${selector} 没有正确闭合`)
}

function assertThemeRootVariableEntry(source, selector, requiredVariables) {
  const rootBlock = getSelectorBlock(source, selector)
  const declaredVariableNames = new Set(
    Array.from(rootBlock.matchAll(/(--wj-preview-[a-z0-9-]+)\s*:/gu), match => match[1]),
  )

  assert.notEqual(declaredVariableNames.size, 0, `${selector} 没有声明统一变量入口`)

  requiredVariables.forEach((variableName) => {
    assert.equal(
      declaredVariableNames.has(variableName),
      true,
      `${selector} 缺少变量声明：${variableName}`,
    )
  })
}

function assertThemeRootVariableValue(source, selector, variableName, expectedValue) {
  const rootBlock = getSelectorBlock(source, selector)

  assert.match(
    rootBlock,
    new RegExp(`${variableName}\\s*:\\s*${expectedValue};`, 'u'),
    `${selector} 的 ${variableName} 未保持预期值：${expectedValue}`,
  )
}

function getDeclaredVariableNames(blockSource) {
  return new Set(
    Array.from(blockSource.matchAll(/(--wj-preview-[a-z0-9-]+)\s*:/gu), match => match[1]),
  )
}

function getDarkThemeSelectorBlock(source, selector) {
  const darkThemeBlock = getSelectorBlock(source, ':root[theme=\'dark\']')

  return getSelectorBlock(darkThemeBlock, selector)
}

function assertDarkThemeBranchUsesVariableOverridesOnly(source, selector) {
  const darkThemeSelectorBlock = getDarkThemeSelectorBlock(source, selector)
  const blockBodyLines = darkThemeSelectorBlock
    .slice(1, -1)
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)

  blockBodyLines.forEach((line) => {
    assert.match(
      line,
      /^--wj-preview-[a-z0-9-]+\s*:[^;]+;$/u,
      `${selector} dark 分支存在非变量声明：${line}`,
    )
  })
}

function assertDarkThemeBranchHasRequiredVariables(source, selector, requiredVariables) {
  const darkThemeSelectorBlock = getDarkThemeSelectorBlock(source, selector)
  const declaredVariableNames = getDeclaredVariableNames(darkThemeSelectorBlock)

  requiredVariables.forEach((variableName) => {
    assert.equal(
      declaredVariableNames.has(variableName),
      true,
      `${selector} dark 分支缺少变量声明：${variableName}`,
    )
  })
}

function assertDarkThemeBranchVariableValue(source, selector, variableName, expectedValue) {
  const darkThemeSelectorBlock = getDarkThemeSelectorBlock(source, selector)

  assert.match(
    darkThemeSelectorBlock,
    new RegExp(`${variableName}\\s*:\\s*${expectedValue};`, 'u'),
    `${selector} dark 分支的 ${variableName} 未保持预期值：${expectedValue}`,
  )
}

function assertDarkThemeBranchPreservesInlineCodeSeparation(source, selector) {
  const darkThemeSelectorBlock = getDarkThemeSelectorBlock(source, selector)
  const declaredVariableNames = getDeclaredVariableNames(darkThemeSelectorBlock)

  declaredVariableNames.forEach((variableName) => {
    const isPreVariable = variableName.startsWith('--wj-preview-pre-')
    const isCodeVariable = variableName.includes('code')
    const isInlineCodeVariable = variableName.startsWith('--wj-preview-inline-code-')

    if ((isCodeVariable && !isInlineCodeVariable) || isPreVariable) {
      assert.fail(`${selector} dark 分支不应覆盖非 inline code 语义变量：${variableName}`)
    }
  })
}

test('juejin 主题应在主题根块声明统一变量入口', () => {
  const source = readSource('../preview-theme/theme/juejin.scss')

  assertThemeRootVariableEntry(source, '.preview-theme-juejin', [
    '--wj-preview-text-color',
    '--wj-preview-font-weight',
    '--wj-preview-font-size',
    '--wj-preview-line-height',
    '--wj-preview-word-break',
    '--wj-preview-paragraph-margin',
    '--wj-preview-link-color',
    '--wj-preview-link-hover-color',
    '--wj-preview-inline-code-background-color',
    '--wj-preview-code-block-background-color',
    '--wj-preview-table-cell-padding',
    '--wj-preview-blockquote-padding',
    '--wj-preview-blockquote-first-child-margin-top',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '--wj-preview-task-list-style',
  ])
})

test('vuepress 主题应在主题根块声明统一变量入口', () => {
  const source = readSource('../preview-theme/theme/vuepress.scss')

  assertThemeRootVariableEntry(source, '.preview-theme-vuepress', [
    '--wj-preview-text-color',
    '--wj-preview-font-weight',
    '--wj-preview-font-size',
    '--wj-preview-line-height',
    '--wj-preview-heading-font-weight',
    '--wj-preview-link-color',
    '--wj-preview-link-hover-color',
    '--wj-preview-inline-code-background-color',
    '--wj-preview-code-block-background-color',
    '--wj-preview-table-header-background-color',
    '--wj-preview-table-cell-border',
    '--wj-preview-blockquote-border-color',
    '--wj-preview-blockquote-first-child-margin-top',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '--wj-preview-task-list-style',
  ])
})

test('markdown-here 主题应在主题根块声明统一变量入口', () => {
  const source = readSource('../preview-theme/theme/markdown-here.scss')

  assertThemeRootVariableEntry(source, '.preview-theme-markdown-here', [
    '--wj-preview-font-size',
    '--wj-preview-line-height',
    '--wj-preview-heading-color',
    '--wj-preview-heading-font-weight',
    '--wj-preview-paragraph-margin',
    '--wj-preview-inline-code-background-color',
    '--wj-preview-inline-code-text-color',
    '--wj-preview-code-block-padding',
    '--wj-preview-blockquote-paragraph-margin',
    '--wj-preview-blockquote-first-child-margin-top',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '--wj-preview-strong-color',
    '--wj-preview-emphasis-color',
  ])
})

test('juejin 主题应通过首末段变量恢复单段引用块节奏', () => {
  const source = readSource('../preview-theme/theme/juejin.scss')

  assertThemeRootVariableValue(
    source,
    '.preview-theme-juejin',
    '--wj-preview-blockquote-paragraph-margin',
    '10px 0',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-juejin',
    '--wj-preview-blockquote-first-child-margin-top',
    '10px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-juejin',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '10px',
  )
})

test('vuepress 主题应通过首末段变量恢复单段引用块节奏', () => {
  const source = readSource('../preview-theme/theme/vuepress.scss')

  assertThemeRootVariableValue(
    source,
    '.preview-theme-vuepress',
    '--wj-preview-blockquote-paragraph-margin',
    '16px 0',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-vuepress',
    '--wj-preview-blockquote-first-child-margin-top',
    '16px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-vuepress',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '16px',
  )
})

test('markdown-here 主题应保留引用块段落间距变量的原始文风', () => {
  const source = readSource('../preview-theme/theme/markdown-here.scss')

  assertThemeRootVariableValue(
    source,
    '.preview-theme-markdown-here',
    '--wj-preview-blockquote-paragraph-margin',
    '1\\.5em 5px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-markdown-here',
    '--wj-preview-blockquote-first-child-margin-top',
    '1\\.5em',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-markdown-here',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '1\\.5em',
  )
})

test('juejin 主题 dark 分支应只覆盖 inline code 相关语义并保留 code block 分离', () => {
  const source = readSource('../preview-theme/theme/juejin.scss')

  assertDarkThemeBranchUsesVariableOverridesOnly(source, '.preview-theme-juejin')
  assertDarkThemeBranchHasRequiredVariables(source, '.preview-theme-juejin', [
    '--wj-preview-text-color',
    '--wj-preview-inline-code-background-color',
  ])
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-juejin',
    '--wj-preview-text-color',
    'var\\(--wj-markdown-text-primary\\)',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-juejin',
    '--wj-preview-inline-code-background-color',
    'rgba\\(171, 178, 191, 0\\.2\\)',
  )
  assertDarkThemeBranchPreservesInlineCodeSeparation(source, '.preview-theme-juejin')
})

test('vuepress 主题 dark 分支应只覆盖 inline code 相关语义并保留 code block 分离', () => {
  const source = readSource('../preview-theme/theme/vuepress.scss')

  assertDarkThemeBranchUsesVariableOverridesOnly(source, '.preview-theme-vuepress')
  assertDarkThemeBranchHasRequiredVariables(source, '.preview-theme-vuepress', [
    '--wj-preview-text-color',
    '--wj-preview-inline-code-text-color',
    '--wj-preview-inline-code-background-color',
  ])
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-vuepress',
    '--wj-preview-text-color',
    'var\\(--wj-markdown-text-primary\\)',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-vuepress',
    '--wj-preview-inline-code-text-color',
    'var\\(--wj-markdown-text-primary\\)',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-vuepress',
    '--wj-preview-inline-code-background-color',
    'rgba\\(171, 178, 191, 0\\.2\\)',
  )
  assertDarkThemeBranchPreservesInlineCodeSeparation(source, '.preview-theme-vuepress')
})

test('markdown-here 主题 dark 分支应只覆盖 inline code 相关语义并保留 code block 分离', () => {
  const source = readSource('../preview-theme/theme/markdown-here.scss')

  assertDarkThemeBranchUsesVariableOverridesOnly(source, '.preview-theme-markdown-here')
  assertDarkThemeBranchHasRequiredVariables(source, '.preview-theme-markdown-here', [
    '--wj-preview-inline-code-text-color',
    '--wj-preview-inline-code-background-color',
  ])
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-markdown-here',
    '--wj-preview-inline-code-text-color',
    'var\\(--wj-markdown-text-primary\\)',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-markdown-here',
    '--wj-preview-inline-code-background-color',
    'var\\(--wj-markdown-bg-hover\\)',
  )
  assertDarkThemeBranchPreservesInlineCodeSeparation(source, '.preview-theme-markdown-here')
})

test('dark 分支语义断言必须识别 code block 变量污染', () => {
  const source = readSource('../preview-theme/theme/vuepress.scss')
  const mutatedSource = source.replace(
    '--wj-preview-inline-code-background-color: rgba(171, 178, 191, 0.2);',
    `--wj-preview-inline-code-background-color: rgba(171, 178, 191, 0.2);
    --wj-preview-code-block-text-color: var(--wj-markdown-text-primary);`,
  )

  assert.throws(
    () => assertDarkThemeBranchPreservesInlineCodeSeparation(mutatedSource, '.preview-theme-vuepress'),
    /dark 分支不应覆盖非 inline code 语义变量/u,
  )
})

test('dark 分支语义断言必须识别嵌套的 pre 或 code 选择器覆盖', () => {
  const source = readSource('../preview-theme/theme/markdown-here.scss')
  const mutatedSource = source.replace(
    '--wj-preview-inline-code-background-color: var(--wj-markdown-bg-hover);',
    `--wj-preview-inline-code-background-color: var(--wj-markdown-bg-hover);
    pre {
      color: inherit;
    }`,
  )

  assert.throws(
    () => assertDarkThemeBranchUsesVariableOverridesOnly(mutatedSource, '.preview-theme-markdown-here'),
    /dark 分支存在非变量声明/u,
  )
})
