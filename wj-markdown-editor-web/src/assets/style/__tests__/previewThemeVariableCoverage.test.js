import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function getStableThemeRootSelector(themeName) {
  return `.wj-preview-theme.preview-theme-${themeName}`
}

function normalizeStableThemeRootSelector(selector) {
  const legacyThemeRootMatch = selector.match(/^\.preview-theme-([a-z0-9-]+)$/u)

  if (legacyThemeRootMatch) {
    return getStableThemeRootSelector(legacyThemeRootMatch[1])
  }

  return selector
}

function getSelectorBlock(source, selector) {
  const selectorBlocks = getSelectorBlocks(source, selector)
  assert.notEqual(selectorBlocks.length, 0, `未找到选择器：${normalizeStableThemeRootSelector(selector)}`)

  return selectorBlocks[0]
}

function getSelectorBlocks(source, selector) {
  const normalizedSelector = normalizeStableThemeRootSelector(selector)
  const selectorBlocks = []
  let searchIndex = 0

  while (searchIndex < source.length) {
    const selectorIndex = source.indexOf(normalizedSelector, searchIndex)
    if (selectorIndex === -1) {
      break
    }

    const blockStart = source.indexOf('{', selectorIndex)
    assert.notEqual(blockStart, -1, `${normalizedSelector} 缺少起始大括号`)

    let braceDepth = 0
    let blockEnd = -1

    for (let i = blockStart; i < source.length; i++) {
      const char = source[i]
      if (char === '{') {
        braceDepth++
        continue
      }
      if (char === '}') {
        braceDepth--
        if (braceDepth === 0) {
          blockEnd = i + 1
          selectorBlocks.push(source.slice(blockStart, blockEnd))
          searchIndex = blockEnd
          break
        }
      }
    }

    if (blockEnd === -1) {
      assert.fail(`${normalizedSelector} 没有正确闭合`)
    }
  }

  return selectorBlocks
}

function getTopLevelNestedRuleEntries(blockSource) {
  const blockBody = blockSource.slice(1, -1)
  const ruleEntries = []
  let braceDepth = 0
  let bracketDepth = 0
  let parenDepth = 0
  let tokenStart = 0
  let currentHeader = ''
  let currentBlockStart = -1
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (let i = 0; i < blockBody.length; i++) {
    const currentChar = blockBody[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (currentChar === '\\') {
      escaped = true
      continue
    }

    if (!inDoubleQuote && currentChar === '\'') {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (!inSingleQuote && currentChar === '"') {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (inSingleQuote || inDoubleQuote) {
      continue
    }

    if (currentChar === '[') {
      bracketDepth++
      continue
    }

    if (currentChar === ']') {
      bracketDepth--
      continue
    }

    if (currentChar === '(') {
      parenDepth++
      continue
    }

    if (currentChar === ')') {
      parenDepth--
      continue
    }

    if (bracketDepth > 0 || parenDepth > 0) {
      continue
    }

    if (currentChar === '{') {
      if (braceDepth === 0) {
        currentHeader = blockBody.slice(tokenStart, i).trim()
        currentBlockStart = i
      }
      braceDepth++
      continue
    }

    if (currentChar === '}') {
      braceDepth--
      if (braceDepth === 0) {
        if (currentHeader) {
          ruleEntries.push({
            selectorHeader: currentHeader,
            blockSource: blockBody.slice(currentBlockStart, i + 1),
          })
        }
        tokenStart = i + 1
        currentHeader = ''
        currentBlockStart = -1
      }
      continue
    }

    if (braceDepth === 0 && currentChar === ';') {
      tokenStart = i + 1
    }
  }

  return ruleEntries
}

function splitTopLevelSelectorEntries(selectorHeader) {
  const selectorEntries = []
  let tokenStart = 0
  let bracketDepth = 0
  let parenDepth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (let i = 0; i < selectorHeader.length; i++) {
    const currentChar = selectorHeader[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (currentChar === '\\') {
      escaped = true
      continue
    }

    if (!inDoubleQuote && currentChar === '\'') {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (!inSingleQuote && currentChar === '"') {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (inSingleQuote || inDoubleQuote) {
      continue
    }

    if (currentChar === '[') {
      bracketDepth++
      continue
    }

    if (currentChar === ']') {
      bracketDepth--
      continue
    }

    if (currentChar === '(') {
      parenDepth++
      continue
    }

    if (currentChar === ')') {
      parenDepth--
      continue
    }

    if (currentChar === ',' && bracketDepth === 0 && parenDepth === 0) {
      const selectorEntry = selectorHeader.slice(tokenStart, i).trim()

      if (selectorEntry) {
        selectorEntries.push(selectorEntry)
      }

      tokenStart = i + 1
    }
  }

  const lastSelectorEntry = selectorHeader.slice(tokenStart).trim()

  if (lastSelectorEntry) {
    selectorEntries.push(lastSelectorEntry)
  }

  return selectorEntries
}

function stripLeadingRelativeSelectorPrefix(selectorEntry) {
  let normalizedEntry = selectorEntry.trim()

  while (normalizedEntry.startsWith('&')) {
    normalizedEntry = normalizedEntry.slice(1).trimStart()
  }

  while (/^[>+~]/u.test(normalizedEntry)) {
    normalizedEntry = normalizedEntry.slice(1).trimStart()
  }

  return normalizedEntry
}

function getLeadingFunctionalSelectorArguments(selectorEntry) {
  const normalizedEntry = stripLeadingRelativeSelectorPrefix(selectorEntry)
  const supportedFunctionalPseudoClasses = [':where(', ':is(']

  for (const functionPrefix of supportedFunctionalPseudoClasses) {
    if (!normalizedEntry.startsWith(functionPrefix)) {
      continue
    }

    const argumentStart = functionPrefix.length
    let parenDepth = 1
    let inSingleQuote = false
    let inDoubleQuote = false
    let escaped = false

    for (let i = argumentStart; i < normalizedEntry.length; i++) {
      const currentChar = normalizedEntry[i]

      if (escaped) {
        escaped = false
        continue
      }

      if (currentChar === '\\') {
        escaped = true
        continue
      }

      if (!inDoubleQuote && currentChar === '\'') {
        inSingleQuote = !inSingleQuote
        continue
      }

      if (!inSingleQuote && currentChar === '"') {
        inDoubleQuote = !inDoubleQuote
        continue
      }

      if (inSingleQuote || inDoubleQuote) {
        continue
      }

      if (currentChar === '(') {
        parenDepth++
        continue
      }

      if (currentChar === ')') {
        parenDepth--
        if (parenDepth === 0) {
          return normalizedEntry.slice(argumentStart, i)
        }
      }
    }
  }

  return null
}

function selectorEntryUsesDirectKbdSurface(selectorEntry) {
  const normalizedEntry = stripLeadingRelativeSelectorPrefix(selectorEntry)

  if (/^kbd(?=$|[:.[#])/u.test(normalizedEntry)) {
    return true
  }

  const functionalArguments = getLeadingFunctionalSelectorArguments(normalizedEntry)

  if (!functionalArguments) {
    return false
  }

  return splitTopLevelSelectorEntries(functionalArguments)
    .some(entry => selectorEntryUsesDirectKbdSurface(entry))
}

function selectorEntryTargetsPrimaryUnorderedList(selectorEntry) {
  const normalizedEntry = stripLeadingRelativeSelectorPrefix(selectorEntry)

  if (normalizedEntry === 'ul') {
    return true
  }

  const functionalArguments = getLeadingFunctionalSelectorArguments(normalizedEntry)

  if (!functionalArguments) {
    return false
  }

  return splitTopLevelSelectorEntries(functionalArguments)
    .some(entry => selectorEntryTargetsPrimaryUnorderedList(entry))
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
  const normalizedBlockBody = darkThemeSelectorBlock
    .slice(1, -1)
    .replace(/\s+/gu, ' ')
    .trim()

  assert.equal(
    /[{}]/u.test(normalizedBlockBody),
    false,
    `${selector} dark 分支存在非变量声明：嵌套规则`,
  )

  const remainingContent = normalizedBlockBody
    .replace(/--wj-preview-[a-z0-9-]+\s*:[^;]+;\s*/gu, '')
    .trim()

  assert.equal(
    remainingContent,
    '',
    `${selector} dark 分支存在非变量声明：${remainingContent}`,
  )
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

/**
 * 从主题根块中提取标题字号，避免仅靠字符串匹配判断层级是否递减。
 * @param {string} source
 * @param {string} selector
 * @param {number} level
 */
function getThemeHeadingFontSizePx(source, selector, level) {
  const rootBlock = getSelectorBlock(source, selector)
  const match = rootBlock.match(new RegExp(`--wj-preview-h${level}-font-size:\\s*([0-9.]+)px;`, 'u'))

  assert.ok(match, `${selector} 缺少 h${level} 标题字号变量`)

  return Number(match[1])
}

/**
 * 校验受影响主题已经停止用 kbd 选择器承担主外观，后续应统一走变量协议。
 * @param {string} source
 * @param {string} selector
 */
function assertThemeDoesNotUseKbdSelectorForPrimarySurface(source, selector) {
  const stableThemeBlocks = getSelectorBlocks(source, selector)

  stableThemeBlocks.forEach((stableThemeBlock) => {
    const stableThemeRuleEntries = getTopLevelNestedRuleEntries(stableThemeBlock)
    const primaryKbdRuleEntry = stableThemeRuleEntries.find(({ selectorHeader }) => {
      return splitTopLevelSelectorEntries(selectorHeader)
        .some(entry => selectorEntryUsesDirectKbdSurface(entry))
    })

    assert.equal(
      Boolean(primaryKbdRuleEntry),
      false,
      `${selector} 不得继续通过稳定根块内的直接 kbd 选择器承担主外观`,
    )
  })
}

/**
 * 校验主题根变量块不再直接书写背景纹理属性，而是交给统一变量协议承接。
 * @param {string} source
 * @param {string} selector
 */
function assertThemeRootDoesNotUseDirectBackgroundTextureProperties(source, selector) {
  const rootBlock = getSelectorBlock(source, selector)
  const blockBodyLines = rootBlock
    .slice(1, -1)
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)

  blockBodyLines.forEach((line) => {
    assert.equal(
      /^(?:background-image|background-size|background-position)\s*:/u.test(line),
      false,
      `${selector} 主题根块不得继续直接声明背景纹理属性：${line}`,
    )
  })
}

/**
 * 校验主题不再通过特例移除主层级 ul 的默认项目符号。
 * @param {string} source
 * @param {string} selector
 */
function assertThemeDoesNotRemovePrimaryUnorderedListMarker(source, selector) {
  const stableThemeBlocks = getSelectorBlocks(source, selector)

  stableThemeBlocks.forEach((stableThemeBlock) => {
    const stableThemeRuleEntries = getTopLevelNestedRuleEntries(stableThemeBlock)
    const primaryUnorderedListRuleEntry = stableThemeRuleEntries.find(({ selectorHeader }) => {
      return splitTopLevelSelectorEntries(selectorHeader)
        .some(entry => selectorEntryTargetsPrimaryUnorderedList(entry))
    })

    if (!primaryUnorderedListRuleEntry) {
      return
    }

    assert.doesNotMatch(
      primaryUnorderedListRuleEntry.blockSource,
      /list-style(?:-type)?\s*:\s*none\s*;/u,
      `${selector} 不得再移除无序列表标记`,
    )
  })
}

/**
 * 校验 smart-blue 仍可保留标题人格相关特例，但不再把其他结构样式塞回稳定根块。
 * @param {string} source
 */
function assertSmartBlueThemePreservesHeadingPersonaSelectors(source) {
  const stableSmartBlueSelector = getStableThemeRootSelector('smart-blue')
  const smartBlueStableBlocks = getSelectorBlocks(source, stableSmartBlueSelector)
  const smartBlueSpecialBlock = smartBlueStableBlocks.find((smartBlueBlock) => {
    const smartBlueRuleEntries = getTopLevelNestedRuleEntries(smartBlueBlock)
    const smartBlueTopLevelSelectorHeaders = smartBlueRuleEntries
      .map(({ selectorHeader }) => selectorHeader)

    return smartBlueTopLevelSelectorHeaders.includes('h1')
      && smartBlueTopLevelSelectorHeaders.includes('h2')
  })

  assert.ok(smartBlueSpecialBlock, 'smart-blue 主题必须保留包含 h1/h2 的稳定根标题人格块')

  smartBlueStableBlocks.forEach((smartBlueBlock) => {
    const smartBlueRuleEntries = getTopLevelNestedRuleEntries(smartBlueBlock)
    const smartBlueTopLevelSelectorHeaders = smartBlueRuleEntries
      .map(({ selectorHeader }) => selectorHeader)
    const smartBlueTableRuleEntry = smartBlueRuleEntries
      .find(({ selectorHeader }) => selectorHeader === 'table')
    const smartBlueTableNestedSelectorHeaders = smartBlueTableRuleEntry
      ? getTopLevelNestedRuleEntries(smartBlueTableRuleEntry.blockSource)
          .map(({ selectorHeader }) => selectorHeader)
      : []

    assert.equal(smartBlueTopLevelSelectorHeaders.includes('p + p'), false)
    assert.equal(smartBlueTopLevelSelectorHeaders.includes('h3'), false)
    assert.equal(smartBlueTopLevelSelectorHeaders.includes('ol'), false)
    assert.equal(smartBlueTopLevelSelectorHeaders.includes('ul'), false)
    assert.equal(smartBlueTopLevelSelectorHeaders.includes('li'), false)
    assert.equal(smartBlueTableNestedSelectorHeaders.includes('tr'), false)
  })

  assert.match(smartBlueSpecialBlock, /(?:^|\n)\s*h1\s*\{/u)
  assert.match(smartBlueSpecialBlock, /(?:^|\n)\s*h2\s*\{/u)
}

test('基础层相邻段落节奏应通过 margin-top 变量表达，避免污染 blockquote 多段间距', () => {
  const contractSource = readSource('../preview-theme/preview-theme-contract.scss')
  const baseSource = readSource('../preview-theme/preview-theme-base.scss')

  assert.match(
    contractSource,
    /--wj-preview-adjacent-paragraph-margin-top:\s*var\(--wj-preview-space-none\);/u,
  )
  assert.equal(contractSource.includes('--wj-preview-adjacent-paragraph-padding-top'), false)
  assert.match(
    baseSource,
    /:where\(p \+ p\)\s*\{[\s\S]*?margin-top:\s*var\(--wj-preview-adjacent-paragraph-margin-top\);[\s\S]*?\}/u,
  )
  assert.equal(baseSource.includes('padding-top: var(--wj-preview-adjacent-paragraph-margin-top);'), false)
})

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

test('juejin 主题标题层级必须满足 h3 > h4 > h5 > h6', () => {
  const source = readSource('../preview-theme/theme/juejin.scss')
  const selector = '.preview-theme-juejin'
  const h3FontSize = getThemeHeadingFontSizePx(source, selector, 3)
  const h4FontSize = getThemeHeadingFontSizePx(source, selector, 4)
  const h5FontSize = getThemeHeadingFontSizePx(source, selector, 5)
  const h6FontSize = getThemeHeadingFontSizePx(source, selector, 6)

  assert.ok(
    h3FontSize > h4FontSize && h4FontSize > h5FontSize && h5FontSize > h6FontSize,
    `${selector} 标题层级异常：h3=${h3FontSize}px, h4=${h4FontSize}px, h5=${h5FontSize}px, h6=${h6FontSize}px`,
  )
})

test('juejin 明亮模式必须保留表格斑马纹变量', () => {
  const source = readSource('../preview-theme/theme/juejin.scss')

  assertThemeRootVariableValue(
    source,
    '.preview-theme-juejin',
    '--wj-preview-table-row-even-background-color',
    '#fcfcfc',
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

test('smart-blue 主题应在主题根块声明统一变量入口', () => {
  const source = readSource('../preview-theme/theme/smart-blue.scss')

  assertThemeRootVariableEntry(source, '.preview-theme-smart-blue', [
    '--wj-preview-text-color',
    '--wj-preview-font-size',
    '--wj-preview-line-height',
    '--wj-preview-adjacent-paragraph-margin-top',
    '--wj-preview-paragraph-margin',
    '--wj-preview-heading-color',
    '--wj-preview-h3-font-size',
    '--wj-preview-list-margin',
    '--wj-preview-list-padding-inline-start',
    '--wj-preview-list-text-color',
    '--wj-preview-list-item-margin-bottom',
    '--wj-preview-unordered-list-style',
    '--wj-preview-link-color',
    '--wj-preview-link-border-bottom',
    '--wj-preview-strong-color',
    '--wj-preview-blockquote-background-color',
    '--wj-preview-blockquote-border-color',
    '--wj-preview-blockquote-text-color',
    '--wj-preview-blockquote-paragraph-margin',
    '--wj-preview-blockquote-first-child-margin-top',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '--wj-preview-inline-code-background-color',
    '--wj-preview-inline-code-text-color',
    '--wj-preview-code-block-background-color',
    '--wj-preview-code-block-text-color',
    '--wj-preview-table-cell-border',
    '--wj-preview-table-row-border-top',
    '--wj-preview-table-row-even-background-color',
  ])
})

test('smart-blue 标题人格断言必须允许移除 kbd 特例', () => {
  const source = readSource('../preview-theme/theme/smart-blue.scss')
  const mutatedSource = source.replace(
    /\n\s*kbd\s*\{[^\n{}]*\n\s*(?:[^\s{}][^\n{}]*\n\s*)*\}\n/u,
    '\n',
  )

  assert.doesNotThrow(() => assertSmartBlueThemePreservesHeadingPersonaSelectors(mutatedSource))
})

test('smart-blue 主题只保留标题人格相关特例选择器', () => {
  const source = readSource('../preview-theme/theme/smart-blue.scss')

  assertSmartBlueThemePreservesHeadingPersonaSelectors(source)
})

test('受影响主题不得继续用 kbd 选择器承担主外观', () => {
  const themeSelectors = [
    ['juejin', '.preview-theme-juejin'],
    ['smart-blue', '.preview-theme-smart-blue'],
    ['vuepress', '.preview-theme-vuepress'],
    ['mk-cute', '.preview-theme-mk-cute'],
    ['scrolls', '.preview-theme-scrolls'],
    ['markdown-here', '.preview-theme-markdown-here'],
  ]

  themeSelectors.forEach(([themeName, selector]) => {
    const source = readSource(`../preview-theme/theme/${themeName}.scss`)

    assertThemeDoesNotUseKbdSelectorForPrimarySurface(source, selector)
  })
})

test('kbd 主外观断言不应把稳定根块外或更具体局部特例误判为主路径', () => {
  const source = `kbd {
  color: red;
}

.wj-preview-theme.preview-theme-smart-blue {
  --wj-preview-kbd-text-color: #135ce0;

  .shortcut-hint kbd {
    color: inherit;
  }
}`

  assert.doesNotThrow(
    () => assertThemeDoesNotUseKbdSelectorForPrimarySurface(source, '.preview-theme-smart-blue'),
  )
})

test('kbd 主外观断言必须识别 :where(.shortcut, kbd) 这类函数选择器中的直接 kbd', () => {
  const source = `.wj-preview-theme.preview-theme-smart-blue {
  :where(.shortcut, kbd) {
    color: #135ce0;
  }
}`

  assert.throws(
    () => assertThemeDoesNotUseKbdSelectorForPrimarySurface(source, '.preview-theme-smart-blue'),
    /直接 kbd 选择器承担主外观/u,
  )
})

test('受影响主题必须补齐 7.5.7 要求的 kbd 变量覆盖', () => {
  const themeSelectors = [
    ['juejin', '.preview-theme-juejin'],
    ['smart-blue', '.preview-theme-smart-blue'],
    ['vuepress', '.preview-theme-vuepress'],
    ['mk-cute', '.preview-theme-mk-cute'],
    ['scrolls', '.preview-theme-scrolls'],
    ['markdown-here', '.preview-theme-markdown-here'],
  ]

  themeSelectors.forEach(([themeName, selector]) => {
    const source = readSource(`../preview-theme/theme/${themeName}.scss`)

    assertThemeRootVariableEntry(source, selector, [
      '--wj-preview-kbd-text-color',
      '--wj-preview-kbd-background-color',
      '--wj-preview-kbd-border',
    ])
  })
})

test('smart-blue 和 mk-cute 根块必须通过变量承接背景纹理', () => {
  const themeSelectors = [
    ['smart-blue', '.preview-theme-smart-blue'],
    ['mk-cute', '.preview-theme-mk-cute'],
  ]

  themeSelectors.forEach(([themeName, selector]) => {
    const source = readSource(`../preview-theme/theme/${themeName}.scss`)

    assertThemeRootVariableEntry(source, selector, [
      '--wj-preview-theme-background-image',
      '--wj-preview-theme-background-size',
      '--wj-preview-theme-background-position',
    ])
    assertThemeRootDoesNotUseDirectBackgroundTextureProperties(source, selector)
  })
})

test('markdown-here 主题不得再移除无序列表标记', () => {
  const source = readSource('../preview-theme/theme/markdown-here.scss')

  assertThemeRootVariableValue(
    source,
    '.preview-theme-markdown-here',
    '--wj-preview-unordered-list-style',
    'disc outside',
  )
  assertThemeDoesNotRemovePrimaryUnorderedListMarker(source, '.preview-theme-markdown-here')
})

test('mk-cute 主题应在主题根块声明统一变量入口', () => {
  const source = readSource('../preview-theme/theme/mk-cute.scss')

  assertThemeRootVariableEntry(source, '.preview-theme-mk-cute', [
    '--wj-preview-text-color',
    '--wj-preview-font-size',
    '--wj-preview-line-height',
    '--wj-preview-paragraph-margin',
    '--wj-preview-heading-color',
    '--wj-preview-link-color',
    '--wj-preview-link-hover-color',
    '--wj-preview-link-border-bottom',
    '--wj-preview-inline-code-background-color',
    '--wj-preview-inline-code-text-color',
    '--wj-preview-code-block-background-color',
    '--wj-preview-list-padding-inline-start',
    '--wj-preview-list-item-margin-bottom',
    '--wj-preview-list-nested-margin-top',
    '--wj-preview-ordered-list-item-padding-inline-start',
    '--wj-preview-blockquote-background-color',
    '--wj-preview-blockquote-border-color',
    '--wj-preview-blockquote-text-color',
    '--wj-preview-blockquote-paragraph-margin',
    '--wj-preview-blockquote-first-child-margin-top',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '--wj-preview-table-border-color',
    '--wj-preview-table-header-background-color',
    '--wj-preview-table-row-even-background-color',
    '--wj-preview-task-list-style',
  ])
})

test('cyanosis 主题应在主题根块声明统一变量入口', () => {
  const source = readSource('../preview-theme/theme/cyanosis.scss')

  assertThemeRootVariableEntry(source, '.preview-theme-cyanosis', [
    '--wj-preview-text-color',
    '--wj-preview-font-size',
    '--wj-preview-line-height',
    '--wj-preview-heading-color',
    '--wj-preview-strong-color',
    '--wj-preview-emphasis-color',
    '--wj-preview-link-color',
    '--wj-preview-link-hover-color',
    '--wj-preview-inline-code-background-color',
    '--wj-preview-inline-code-text-color',
    '--wj-preview-code-block-background-color',
    '--wj-preview-blockquote-background-color',
    '--wj-preview-blockquote-border-color',
    '--wj-preview-blockquote-text-color',
    '--wj-preview-blockquote-paragraph-margin',
    '--wj-preview-blockquote-first-child-margin-top',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '--wj-preview-ordered-list-item-padding-inline-start',
    '--wj-preview-table-border-color',
    '--wj-preview-table-header-background-color',
    '--wj-preview-table-header-text-color',
    '--wj-preview-table-row-even-background-color',
    '--wj-preview-task-list-style',
  ])
})

test('scrolls 主题应在主题根块声明统一变量入口', () => {
  const source = readSource('../preview-theme/theme/scrolls.scss')

  assertThemeRootVariableEntry(source, '.preview-theme-scrolls', [
    '--wj-preview-text-color',
    '--wj-preview-font-size',
    '--wj-preview-line-height',
    '--wj-preview-heading-color',
    '--wj-preview-emphasis-color',
    '--wj-preview-link-color',
    '--wj-preview-link-hover-color',
    '--wj-preview-inline-code-background-color',
    '--wj-preview-inline-code-text-color',
    '--wj-preview-code-block-background-color',
    '--wj-preview-list-padding-inline-start',
    '--wj-preview-list-item-margin-bottom',
    '--wj-preview-ordered-list-item-padding-inline-start',
    '--wj-preview-blockquote-background-color',
    '--wj-preview-blockquote-border-color',
    '--wj-preview-blockquote-text-color',
    '--wj-preview-blockquote-paragraph-margin',
    '--wj-preview-blockquote-first-child-margin-top',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '--wj-preview-table-border-color',
    '--wj-preview-table-header-background-color',
    '--wj-preview-task-list-style',
  ])
})

test('smart-blue 主题应通过首末段变量恢复单段引用块节奏', () => {
  const source = readSource('../preview-theme/theme/smart-blue.scss')

  assertThemeRootVariableValue(
    source,
    '.preview-theme-smart-blue',
    '--wj-preview-blockquote-paragraph-margin',
    '10px 0',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-smart-blue',
    '--wj-preview-blockquote-first-child-margin-top',
    '10px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-smart-blue',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '10px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-smart-blue',
    '--wj-preview-adjacent-paragraph-margin-top',
    '16px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-smart-blue',
    '--wj-preview-list-item-margin-bottom',
    '0',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-smart-blue',
    '--wj-preview-list-padding-inline-start',
    '40px',
  )
})

test('mk-cute 主题应通过首末段变量恢复单段引用块节奏', () => {
  const source = readSource('../preview-theme/theme/mk-cute.scss')

  assertThemeRootVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-blockquote-paragraph-margin',
    '22px 0',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-blockquote-first-child-margin-top',
    '22px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '22px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-list-padding-inline-start',
    '28px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-list-item-margin-bottom',
    '0',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-list-nested-margin-top',
    '3px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-ordered-list-item-padding-inline-start',
    '6px',
  )
})

test('mk-cute 主题表格外边框必须消费表格边框色变量', () => {
  const source = readSource('../preview-theme/theme/mk-cute.scss')

  assertThemeRootVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-table-border',
    '1px solid var\\(--wj-preview-table-border-color\\)',
  )
})

test('cyanosis 主题应通过首末段变量恢复单段引用块节奏', () => {
  const source = readSource('../preview-theme/theme/cyanosis.scss')

  assertThemeRootVariableValue(
    source,
    '.preview-theme-cyanosis',
    '--wj-preview-blockquote-paragraph-margin',
    '10px 0',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-cyanosis',
    '--wj-preview-blockquote-first-child-margin-top',
    '10px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-cyanosis',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '10px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-cyanosis',
    '--wj-preview-ordered-list-item-padding-inline-start',
    '6px',
  )
})

test('scrolls 主题应通过首末段变量恢复单段引用块节奏', () => {
  const source = readSource('../preview-theme/theme/scrolls.scss')

  assertThemeRootVariableValue(
    source,
    '.preview-theme-scrolls',
    '--wj-preview-blockquote-paragraph-margin',
    '10px 0',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-scrolls',
    '--wj-preview-blockquote-first-child-margin-top',
    '10px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-scrolls',
    '--wj-preview-blockquote-last-child-margin-bottom',
    '10px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-scrolls',
    '--wj-preview-list-padding-inline-start',
    '28px',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-scrolls',
    '--wj-preview-list-item-margin-bottom',
    '0',
  )
  assertThemeRootVariableValue(
    source,
    '.preview-theme-scrolls',
    '--wj-preview-ordered-list-item-padding-inline-start',
    '6px',
  )
})

test('smart-blue 主题 dark 分支应只通过变量覆盖运行时 token', () => {
  const source = readSource('../preview-theme/theme/smart-blue.scss')

  assertDarkThemeBranchUsesVariableOverridesOnly(source, '.preview-theme-smart-blue')
  assertDarkThemeBranchHasRequiredVariables(source, '.preview-theme-smart-blue', [
    '--wj-preview-text-color',
  ])
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-smart-blue',
    '--wj-preview-text-color',
    'var\\(--wj-markdown-text-primary\\)',
  )
})

test('smart-blue dark 分支必须覆盖引用、表格、mermaid 和背景纹理变量', () => {
  const source = readSource('../preview-theme/theme/smart-blue.scss')

  assertDarkThemeBranchHasRequiredVariables(source, '.preview-theme-smart-blue', [
    '--wj-preview-blockquote-text-color',
    '--wj-preview-blockquote-background-color',
    '--wj-preview-blockquote-border-color',
    '--wj-preview-table-border-color',
    '--wj-preview-table-header-background-color',
    '--wj-preview-table-row-even-background-color',
    '--wj-preview-mermaid-background-color',
    '--wj-preview-theme-background-image',
    '--wj-preview-theme-background-size',
    '--wj-preview-theme-background-position',
  ])
})

test('mk-cute 主题 dark 分支应只通过变量覆盖运行时 token', () => {
  const source = readSource('../preview-theme/theme/mk-cute.scss')

  assertDarkThemeBranchUsesVariableOverridesOnly(source, '.preview-theme-mk-cute')
  assertDarkThemeBranchHasRequiredVariables(source, '.preview-theme-mk-cute', [
    '--wj-preview-text-color',
    '--wj-preview-table-header-text-color',
    '--wj-preview-inline-code-background-color',
    '--wj-preview-code-block-background-color',
  ])
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-text-color',
    '#36ace1',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-table-header-text-color',
    'var\\(--wj-markdown-text-primary\\)',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-inline-code-background-color',
    'rgb\\(30, 34, 42\\)',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-mk-cute',
    '--wj-preview-code-block-background-color',
    'rgb\\(30, 34, 42\\)',
  )
})

test('cyanosis 主题 dark 分支应只通过变量覆盖运行时 token', () => {
  const source = readSource('../preview-theme/theme/cyanosis.scss')

  assertDarkThemeBranchUsesVariableOverridesOnly(source, '.preview-theme-cyanosis')
  assertDarkThemeBranchHasRequiredVariables(source, '.preview-theme-cyanosis', [
    '--wj-preview-text-color',
    '--wj-preview-heading-color',
    '--wj-preview-strong-color',
    '--wj-preview-link-color',
    '--wj-preview-inline-code-background-color',
    '--wj-preview-code-block-background-color',
  ])
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-cyanosis',
    '--wj-preview-text-color',
    '#cacaca',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-cyanosis',
    '--wj-preview-heading-color',
    '#ddd',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-cyanosis',
    '--wj-preview-strong-color',
    '#fe9900',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-cyanosis',
    '--wj-preview-link-color',
    '#ffb648',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-cyanosis',
    '--wj-preview-inline-code-background-color',
    '#ffcb7b',
  )
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-cyanosis',
    '--wj-preview-code-block-background-color',
    'rgba\\(255, 227, 185, 0\\.5\\)',
  )
})

test('scrolls 主题 dark 分支应只通过变量覆盖运行时 token', () => {
  const source = readSource('../preview-theme/theme/scrolls.scss')

  assertDarkThemeBranchUsesVariableOverridesOnly(source, '.preview-theme-scrolls')
  assertDarkThemeBranchHasRequiredVariables(source, '.preview-theme-scrolls', [
    '--wj-preview-text-color',
  ])
  assertDarkThemeBranchVariableValue(
    source,
    '.preview-theme-scrolls',
    '--wj-preview-text-color',
    'var\\(--wj-markdown-text-primary\\)',
  )
})

test('7.5.7 矩阵要求的 dark 分支 token 必须全部覆盖', () => {
  const themeDarkVariableMatrix = [
    {
      themeName: 'juejin',
      selector: '.preview-theme-juejin',
      requiredVariables: [
        '--wj-preview-blockquote-text-color',
        '--wj-preview-blockquote-background-color',
        '--wj-preview-blockquote-border-color',
        '--wj-preview-table-header-background-color',
        '--wj-preview-table-header-text-color',
        '--wj-preview-table-row-even-background-color',
        '--wj-preview-mermaid-background-color',
      ],
    },
    {
      themeName: 'smart-blue',
      selector: '.preview-theme-smart-blue',
      requiredVariables: [
        '--wj-preview-blockquote-text-color',
        '--wj-preview-blockquote-background-color',
        '--wj-preview-blockquote-border-color',
        '--wj-preview-table-border-color',
        '--wj-preview-table-header-background-color',
        '--wj-preview-table-row-even-background-color',
        '--wj-preview-mermaid-background-color',
        '--wj-preview-theme-background-image',
        '--wj-preview-theme-background-size',
        '--wj-preview-theme-background-position',
      ],
    },
    {
      themeName: 'vuepress',
      selector: '.preview-theme-vuepress',
      requiredVariables: [
        '--wj-preview-blockquote-text-color',
        '--wj-preview-blockquote-background-color',
        '--wj-preview-blockquote-border-color',
      ],
    },
    {
      themeName: 'mk-cute',
      selector: '.preview-theme-mk-cute',
      requiredVariables: [
        '--wj-preview-table-border-color',
        '--wj-preview-table-header-background-color',
        '--wj-preview-table-header-text-color',
        '--wj-preview-table-row-even-background-color',
        '--wj-preview-mermaid-background-color',
        '--wj-preview-theme-background-image',
        '--wj-preview-theme-background-size',
        '--wj-preview-theme-background-position',
      ],
    },
    {
      themeName: 'scrolls',
      selector: '.preview-theme-scrolls',
      requiredVariables: [
        '--wj-preview-table-border-color',
        '--wj-preview-table-header-background-color',
        '--wj-preview-table-row-even-background-color',
        '--wj-preview-mermaid-background-color',
      ],
    },
    {
      themeName: 'markdown-here',
      selector: '.preview-theme-markdown-here',
      requiredVariables: [
        '--wj-preview-blockquote-text-color',
        '--wj-preview-blockquote-background-color',
        '--wj-preview-blockquote-border-color',
        '--wj-preview-table-border-color',
        '--wj-preview-table-header-background-color',
        '--wj-preview-table-row-even-background-color',
        '--wj-preview-mermaid-background-color',
      ],
    },
  ]

  themeDarkVariableMatrix.forEach(({ themeName, selector, requiredVariables }) => {
    const source = readSource(`../preview-theme/theme/${themeName}.scss`)

    assertDarkThemeBranchHasRequiredVariables(source, selector, requiredVariables)
  })
})

test('mk-cute 主题应保留旋转标题图标特例', () => {
  const source = readSource('../preview-theme/theme/mk-cute.scss')

  assert.match(source, /@keyframes\s+mk-cute-spin/u)
  assert.match(source, /animation:\s*mk-cute-spin/u)
})

test('scrolls 主题应保留 mermaid 代码块居中覆盖', () => {
  const source = readSource('../preview-theme/theme/scrolls.scss')

  assert.match(
    source,
    /pre\.mermaid,\s*pre\.mermaid-cache\s*\{[\s\S]*?text-align:\s*center;/u,
  )
})
