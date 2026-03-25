import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function tryGetBlockByMatchIndex(source, matchIndex) {
  const blockStart = source.indexOf('{', matchIndex)
  if (blockStart === -1) {
    return null
  }

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

  return null
}
function getPatternBlocks(source, pattern) {
  const normalizedFlags = pattern.flags.includes('g')
    ? pattern.flags
    : `${pattern.flags}g`
  const globalPattern = new RegExp(pattern.source, normalizedFlags)

  return Array.from(source.matchAll(globalPattern))
    .map(match => tryGetBlockByMatchIndex(source, match.index))
    .filter(Boolean)
}

function escapeRegExp(sourceText) {
  return sourceText.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function buildWhitespaceTolerantPattern(sourceText) {
  return sourceText
    .replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    .replace(/\s+/gu, '\\s*')
}

function stripStyleComments(source) {
  let result = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false
  let inBlockComment = false
  let inLineComment = false

  function shouldStartLineComment(index) {
    let previousIndex = index - 1

    while (previousIndex >= 0 && /\s/u.test(source[previousIndex])) {
      previousIndex--
    }

    if (previousIndex < 0) {
      return true
    }

    return ![':', '('].includes(source[previousIndex])
  }

  for (let i = 0; i < source.length; i++) {
    const currentChar = source[i]
    const nextChar = source[i + 1]

    if (inBlockComment) {
      if (currentChar === '*' && nextChar === '/') {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inLineComment) {
      if (currentChar === '\n' || currentChar === '\r') {
        inLineComment = false
        result += currentChar
      }
      continue
    }

    if (escaped) {
      result += currentChar
      escaped = false
      continue
    }

    if (currentChar === '\\') {
      result += currentChar
      escaped = true
      continue
    }

    if (inSingleQuote) {
      result += currentChar
      if (currentChar === '\'') {
        inSingleQuote = false
      }
      continue
    }

    if (inDoubleQuote) {
      result += currentChar
      if (currentChar === '"') {
        inDoubleQuote = false
      }
      continue
    }

    if (currentChar === '/' && nextChar === '*') {
      inBlockComment = true
      i++
      continue
    }

    if (currentChar === '/' && nextChar === '/' && shouldStartLineComment(i)) {
      inLineComment = true
      i++
      continue
    }

    if (currentChar === '\'') {
      inSingleQuote = true
      result += currentChar
      continue
    }

    if (currentChar === '"') {
      inDoubleQuote = true
      result += currentChar
      continue
    }

    result += currentChar
  }

  return result
}

function stripHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/gu, '')
}

function getClassLikeAttributeValues(tagSource) {
  return Array.from(
    tagSource.matchAll(/\b(?:class|:class|v-bind:class)\s*=\s*(["'])([\s\S]*?)\1/gu),
    match => match[2],
  )
}

function buildExactTokenPattern(token) {
  return new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(token)}(?=$|[^A-Za-z0-9_-])`, 'u')
}

function buildExactClassSelectorTokenPattern(className) {
  return new RegExp(`(^|[^A-Za-z0-9_-])\\.${escapeRegExp(className)}(?=$|[^A-Za-z0-9_-])`, 'u')
}

function containsExactToken(source, token) {
  return buildExactTokenPattern(token).test(source)
}

function containsExactClassSelectorToken(source, className) {
  return buildExactClassSelectorTokenPattern(className).test(source)
}

function getTopLevelNestedRuleEntries(blockSource) {
  const blockBody = blockSource.slice(1, -1)
  const ruleEntries = []
  let braceDepth = 0
  let parenDepth = 0
  let bracketDepth = 0
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

    if (currentChar === '(') {
      parenDepth++
      continue
    }

    if (currentChar === ')') {
      parenDepth--
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

    if (parenDepth > 0 || bracketDepth > 0) {
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

function getTopLevelNestedSelectorHeaders(blockSource) {
  return getTopLevelNestedRuleEntries(blockSource)
    .map(({ selectorHeader }) => selectorHeader)
}

function getTopLevelRuleEntries(source) {
  return getTopLevelNestedRuleEntries(`{${source}}`)
}

function splitTopLevelSelectors(selectorHeader) {
  const selectorItems = []
  let tokenStart = 0
  let parenDepth = 0
  let bracketDepth = 0
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

    if (currentChar === '(') {
      parenDepth++
      continue
    }

    if (currentChar === ')') {
      parenDepth--
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

    if (parenDepth === 0 && bracketDepth === 0 && currentChar === ',') {
      const selectorItem = selectorHeader.slice(tokenStart, i).trim()
      if (selectorItem) {
        selectorItems.push(selectorItem)
      }
      tokenStart = i + 1
    }
  }

  const lastSelectorItem = selectorHeader.slice(tokenStart).trim()
  if (lastSelectorItem) {
    selectorItems.push(lastSelectorItem)
  }

  return selectorItems
}

function splitSelectorCompounds(selectorItem) {
  const compoundSegments = []
  let tokenStart = 0
  let parenDepth = 0
  let bracketDepth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  function pushCompoundSegment(tokenEnd) {
    const compoundSegment = selectorItem.slice(tokenStart, tokenEnd).trim()
    if (compoundSegment) {
      compoundSegments.push(compoundSegment)
    }
  }

  for (let i = 0; i < selectorItem.length; i++) {
    const currentChar = selectorItem[i]

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

    if (parenDepth > 0 || bracketDepth > 0) {
      continue
    }

    if (/\s/u.test(currentChar) || ['>', '+', '~'].includes(currentChar)) {
      pushCompoundSegment(i)

      tokenStart = i + 1
      continue
    }
  }

  pushCompoundSegment(selectorItem.length)

  return compoundSegments
}

function containsDynamicPreviewThemeClassExpression(source) {
  return /preview-theme-\$\{[\s\S]+?\}/u.test(source)
    || /(["'])preview-theme-\1\s*\+\s*(?!["'])[\s\S]+/u.test(source)
}

function buildThemeModeRootPattern(themeMode) {
  return new RegExp(`:root\\s*\\[\\s*theme\\s*=\\s*(['"])${escapeRegExp(themeMode)}\\1\\s*\\]`, 'u')
}

function isAllowedStableThemeCompoundSelector(compoundSelector, themeName) {
  const themeClass = escapeRegExp(`preview-theme-${themeName}`)

  return new RegExp(
    `^(?:\\.wj-preview-theme\\.${themeClass}|\\.${themeClass}\\.wj-preview-theme)$`,
    'u',
  ).test(compoundSelector.trim())
}

function isAllowedNestedStableThemeCompoundSelector(compoundSelector, themeName) {
  const themeClass = escapeRegExp(`preview-theme-${themeName}`)

  return new RegExp(`^&\\s*\\.${themeClass}$`, 'u')
    .test(compoundSelector.trim())
}

function isStablePreviewThemeRootSelectorItem(selectorItem) {
  return selectorItem.trim() === '.wj-preview-theme'
}

function isStablePreviewThemeRootSelectorHeader(selectorHeader) {
  const selectorItems = splitTopLevelSelectors(selectorHeader)

  return selectorItems.length > 0
    && selectorItems.every(isStablePreviewThemeRootSelectorItem)
}

function isAtRuleSelectorHeader(selectorHeader) {
  return selectorHeader.trim().startsWith('@')
}

function resolveNestedStablePreviewThemeRootContext(parentContext, selectorHeader) {
  if (isStablePreviewThemeRootSelectorHeader(selectorHeader)) {
    return true
  }

  if (parentContext && isAtRuleSelectorHeader(selectorHeader)) {
    return true
  }

  return false
}

function collectLegacyBareThemeSelectorItems(
  ruleEntries,
  themeName,
  selectorItemFilter = () => true,
  stablePreviewThemeRootContext = false,
) {
  const themeClass = `preview-theme-${themeName}`

  return ruleEntries.flatMap(({ selectorHeader }) => {
    return splitTopLevelSelectors(selectorHeader)
      .filter(selectorItem => selectorItemFilter(selectorItem))
      .filter((selectorItem) => {
        if (!containsExactClassSelectorToken(selectorItem, themeClass)) {
          return false
        }

        return splitSelectorCompounds(selectorItem)
          .some((compoundSelector) => {
            if (!containsExactClassSelectorToken(compoundSelector, themeClass)) {
              return false
            }

            if (isAllowedStableThemeCompoundSelector(compoundSelector, themeName)) {
              return false
            }

            if (stablePreviewThemeRootContext
              && isAllowedNestedStableThemeCompoundSelector(compoundSelector, themeName)) {
              return false
            }

            return !containsExactClassSelectorToken(compoundSelector, 'wj-preview-theme')
          })
      })
  })
}

function collectLegacyBareThemeSelectorItemsRecursively(
  ruleEntries,
  themeName,
  selectorItemFilter = () => true,
  stablePreviewThemeRootContext = false,
) {
  const currentLevelSelectorItems = collectLegacyBareThemeSelectorItems(
    ruleEntries,
    themeName,
    selectorItemFilter,
    stablePreviewThemeRootContext,
  )
  const nestedSelectorItems = ruleEntries.flatMap(({ selectorHeader, blockSource }) => {
    const nestedRuleEntries = getTopLevelNestedRuleEntries(blockSource)
    if (nestedRuleEntries.length === 0) {
      return []
    }

    return collectLegacyBareThemeSelectorItemsRecursively(
      nestedRuleEntries,
      themeName,
      selectorItemFilter,
      resolveNestedStablePreviewThemeRootContext(stablePreviewThemeRootContext, selectorHeader),
    )
  })

  return [
    ...currentLevelSelectorItems,
    ...nestedSelectorItems,
  ]
}

function hasTopLevelNestedSelector(blockSource, selectorPattern) {
  return getTopLevelNestedSelectorHeaders(blockSource)
    .some(selectorHeader => selectorPattern.test(selectorHeader))
}

function containsLegacyPreviewThemeWhereScope(source) {
  const sanitizedSource = stripStyleComments(source)
  return /:where\s*\(\s*\[\s*class\s*\*\s*=\s*(['"])preview-theme-\1\s*\]\s*\)/u.test(sanitizedSource)
}

function containsStablePreviewThemeRoot(source) {
  const sanitizedSource = stripStyleComments(source)
  return /^\s*\.wj-preview-theme\s*\{/mu.test(sanitizedSource)
}

function assertSelectorAttachedToStableRoot(source, selectorSuffix, message) {
  const sanitizedSource = stripStyleComments(source)
  const selectorPattern = buildWhitespaceTolerantPattern(selectorSuffix)
  const flatSelectorPattern = new RegExp(`\\.wj-preview-theme\\s+${selectorPattern}\\s*\\{`, 'u')
  if (flatSelectorPattern.test(sanitizedSource)) {
    return
  }

  const directNestedSelectorPattern = new RegExp(`^(?:&\\s+)?${selectorPattern}$`, 'u')
  const stableRootBlocks = getPatternBlocks(sanitizedSource, /^\s*\.wj-preview-theme\s*\{/mu)

  if (stableRootBlocks.some(blockSource => hasTopLevelNestedSelector(blockSource, directNestedSelectorPattern))) {
    return
  }

  assert.fail(message)
}

function assertThemeStableRootSelector(source, themeName, message) {
  const sanitizedSource = stripStyleComments(source)
  const escapedThemeName = escapeRegExp(`preview-theme-${themeName}`)
  const flatSelectorPattern = new RegExp(`(?:\\.wj-preview-theme\\.${escapedThemeName}|\\.${escapedThemeName}\\.wj-preview-theme)\\s*\\{`, 'u')
  if (flatSelectorPattern.test(sanitizedSource)) {
    return
  }

  const stableRootBlocks = getPatternBlocks(sanitizedSource, /^\s*\.wj-preview-theme\s*\{/mu)
  if (stableRootBlocks.some(blockSource => hasTopLevelNestedSelector(blockSource, new RegExp(`^&\\s*\\.${escapedThemeName}$`, 'u')))) {
    return
  }

  assert.fail(message)
}

function getMarkdownPreviewRootContainerTag(source) {
  const templateMatch = source.match(/<template\b[^>]*>[\s\S]*<\/template>/u)
  assert.ok(templateMatch?.index !== undefined, 'MarkdownPreview 必须保留 template 结构')

  const templateSource = stripHtmlComments(templateMatch[0])
  const tagPattern = /<\/?([a-z][\w-]*)\b[^>]*>/giu
  const openTagStack = []

  for (const match of templateSource.matchAll(tagPattern)) {
    const tagSource = match[0]
    const tagName = match[1].toLowerCase()
    const trimmedTagSource = tagSource.trim()
    const isClosingTag = /^<\//u.test(trimmedTagSource)

    if (isClosingTag) {
      for (let i = openTagStack.length - 1; i >= 0; i--) {
        if (openTagStack[i].tagName === tagName) {
          openTagStack.splice(i, 1)
          break
        }
      }
      continue
    }

    const isSelfClosingTag = /\/>\s*$/u.test(trimmedTagSource)
    const hasPreviewRef = /ref\s*=\s*(['"])previewRef\1/u.test(trimmedTagSource)

    if (hasPreviewRef) {
      const directParentTag = openTagStack[openTagStack.length - 1]
      assert.ok(directParentTag, 'MarkdownPreview 必须保留直接包裹 <div ref="previewRef" /> 的预览根容器')
      assert.equal(directParentTag.tagName, 'div', 'MarkdownPreview 预览根容器必须直接使用 div 包裹 <div ref="previewRef" />')
      return directParentTag.tagSource
    }

    if (!isSelfClosingTag) {
      openTagStack.push({
        tagName,
        tagSource,
      })
    }
  }

  assert.fail('MarkdownPreview 必须保留 <div ref="previewRef" /> 以及其直接父级根容器')
}

function assertMarkdownPreviewUsesStableThemeRootClass(source) {
  const rootContainerTag = getMarkdownPreviewRootContainerTag(source)
  const classLikeAttributeValues = getClassLikeAttributeValues(rootContainerTag)

  assert.ok(
    classLikeAttributeValues.some(attributeValue => containsExactToken(attributeValue, 'wj-preview-theme')),
    'MarkdownPreview 预览根容器必须包含 wj-preview-theme',
  )
}

function assertMarkdownPreviewKeepsPreviewThemeClassSemanticOnRoot(source) {
  const rootContainerTag = getMarkdownPreviewRootContainerTag(source)
  const classLikeAttributeValues = getClassLikeAttributeValues(rootContainerTag)

  assert.ok(
    classLikeAttributeValues.some(attributeValue => containsDynamicPreviewThemeClassExpression(attributeValue)),
    'MarkdownPreview 预览根容器必须在同一个开标签上保留 preview-theme 与 previewTheme 的同源主题类语义',
  )
}

function assertPreviewThemeRootScopeMigrated(source, fileLabel) {
  assert.equal(
    containsLegacyPreviewThemeWhereScope(source),
    false,
    `${fileLabel} 不得继续使用 :where([class*='preview-theme-']) 作为根作用域`,
  )
  assert.equal(
    containsStablePreviewThemeRoot(source),
    true,
    `${fileLabel} 必须以 .wj-preview-theme 作为稳定根作用域`,
  )
}

function assertBaseSelectorPinnedToStableRoot(source, selector) {
  const selectorSuffix = selector.replace(/^\.wj-preview-theme\s+/u, '')

  assertSelectorAttachedToStableRoot(
    source,
    selectorSuffix,
    `基础骨架关键结构选择器必须显式挂到 .wj-preview-theme：${selector}`,
  )
}

function assertThemeUsesStableRootSelector(source, themeName) {
  assertThemeStableRootSelector(
    source,
    themeName,
    `${themeName} 主题必须使用 .wj-preview-theme.preview-theme-${themeName} 作为稳定根块`,
  )
}

function assertThemeDoesNotKeepBareRootSelector(source, themeName) {
  const sanitizedSource = stripStyleComments(source)
  const legacyBareSelectorItems = collectLegacyBareThemeSelectorItemsRecursively(
    getTopLevelRuleEntries(sanitizedSource),
    themeName,
  )

  assert.equal(
    legacyBareSelectorItems.length,
    0,
    `${themeName} 主题不得残留裸 .preview-theme-${themeName} 根块`,
  )
}

function assertThemeModeBranchDoesNotKeepLegacyBareSelector(source, themeName, themeMode) {
  const sanitizedSource = stripStyleComments(source)
  const themeModeRootPattern = buildThemeModeRootPattern(themeMode)
  const branchLabel = `${themeName} 主题的 ${themeMode} 分支不得残留裸 .preview-theme-${themeName}`

  const prefixedLegacySelectorItems = collectLegacyBareThemeSelectorItemsRecursively(
    getTopLevelRuleEntries(sanitizedSource),
    themeName,
    selectorItem => themeModeRootPattern.test(selectorItem),
  )

  const modeBranches = getPatternBlocks(
    sanitizedSource,
    new RegExp(`${themeModeRootPattern.source}\\s*\\{`, 'u'),
  )

  const nestedLegacySelectorItems = modeBranches.flatMap(modeBranch => collectLegacyBareThemeSelectorItemsRecursively(
    getTopLevelNestedRuleEntries(modeBranch),
    themeName,
  ))

  assert.equal(
    prefixedLegacySelectorItems.length + nestedLegacySelectorItems.length,
    0,
    branchLabel,
  )
}

function assertDarkBranchUsesStableRootSelector(source, themeName) {
  const sanitizedSource = stripStyleComments(source)
  const darkThemeRootPattern = /:root\s*\[\s*theme\s*=\s*(['"])dark\1\s*\]/u
  const darkThemeRootBlockPattern = /:root\s*\[\s*theme\s*=\s*(['"])dark\1\s*\]\s*\{/u

  if (!darkThemeRootPattern.test(sanitizedSource)) {
    return
  }

  const prefixedFlatSelectorPattern = new RegExp(
    `:root\\s*\\[\\s*theme\\s*=\\s*(['"])dark\\1\\s*\\]\\s+(?:\\.wj-preview-theme\\.${escapeRegExp(`preview-theme-${themeName}`)}|\\.${escapeRegExp(`preview-theme-${themeName}`)}\\.wj-preview-theme)\\s*\\{`,
    'u',
  )
  if (prefixedFlatSelectorPattern.test(sanitizedSource)) {
    return
  }

  const darkBranchMessage = `${themeName} 主题的 dark 分支也必须挂到 .wj-preview-theme.preview-theme-${themeName}`
  const darkBranches = getPatternBlocks(sanitizedSource, darkThemeRootBlockPattern)

  assert.ok(darkBranches.length > 0, darkBranchMessage)

  darkBranches.forEach((darkBranch) => {
    assertThemeStableRootSelector(
      darkBranch,
      themeName,
      darkBranchMessage,
    )
  })
}

const requiredBaseSelectors = [
  '.wj-preview-theme :where(h1, h2, h3, h4, h5, h6)',
  '.wj-preview-theme :where(p)',
  '.wj-preview-theme :where(ul, ol)',
  '.wj-preview-theme :where(blockquote)',
  '.wj-preview-theme :where(table)',
  '.wj-preview-theme :where(pre)',
  '.wj-preview-theme :where(:not(pre) > code, :not(pre) > tt, :not(pre) > samp)',
]

const previewThemeFiles = [
  { name: 'github', path: '../preview-theme/theme/github.scss' },
  { name: 'juejin', path: '../preview-theme/theme/juejin.scss' },
  { name: 'vuepress', path: '../preview-theme/theme/vuepress.scss' },
  { name: 'markdown-here', path: '../preview-theme/theme/markdown-here.scss' },
  { name: 'smart-blue', path: '../preview-theme/theme/smart-blue.scss' },
  { name: 'mk-cute', path: '../preview-theme/theme/mk-cute.scss' },
  { name: 'cyanosis', path: '../preview-theme/theme/cyanosis.scss' },
  { name: 'scrolls', path: '../preview-theme/theme/scrolls.scss' },
]

test('裸根块断言必须识别媒体查询中的旧裸主题根块', () => {
  const source = `
    @media (max-width: 720px) {
      .preview-theme-juejin {
        color: inherit;
      }
    }
  `

  assert.throws(
    () => assertThemeDoesNotKeepBareRootSelector(source, 'juejin'),
    /juejin 主题不得残留裸 \.preview-theme-juejin 根块/u,
  )
})

test('裸根块断言不应误伤稳定根类中的嵌套主题块与媒体查询覆盖', () => {
  const source = `
    .wj-preview-theme {
      &.preview-theme-juejin {
        color: inherit;
      }

      @media (max-width: 720px) {
        &.preview-theme-juejin {
          font-size: 16px;
        }
      }
    }
  `

  assert.doesNotThrow(() => assertThemeDoesNotKeepBareRootSelector(source, 'juejin'))
})

test('dark 分支裸根块断言不应误伤稳定根类中的嵌套主题块与媒体查询覆盖', () => {
  const source = `
    :root[theme='dark'] {
      .wj-preview-theme {
        &.preview-theme-juejin {
          --wj-preview-text-color: var(--wj-markdown-text-primary);
        }

        @media (max-width: 720px) {
          &.preview-theme-juejin {
            --wj-preview-font-size: 16px;
          }
        }
      }
    }
  `

  assert.doesNotThrow(() => assertThemeModeBranchDoesNotKeepLegacyBareSelector(source, 'juejin', 'dark'))
})

test('MarkdownPreview 根容器必须引入稳定的 wj-preview-theme 根类', () => {
  const previewSource = readSource('../../../components/editor/MarkdownPreview.vue')

  assertMarkdownPreviewUsesStableThemeRootClass(previewSource)
})

test('MarkdownPreview 预览根容器必须在同一个开标签上继续承载 preview theme 类语义', () => {
  const previewSource = readSource('../../../components/editor/MarkdownPreview.vue')

  assertMarkdownPreviewKeepsPreviewThemeClassSemanticOnRoot(previewSource)
})

test('preview-theme-contract 必须收口到稳定根作用域', () => {
  const contractSource = readSource('../preview-theme/preview-theme-contract.scss')

  assertPreviewThemeRootScopeMigrated(contractSource, 'preview-theme-contract.scss')
})

test('preview-theme-base 必须收口到稳定根作用域', () => {
  const baseSource = readSource('../preview-theme/preview-theme-base.scss')

  assertPreviewThemeRootScopeMigrated(baseSource, 'preview-theme-base.scss')
})

requiredBaseSelectors.forEach((selector) => {
  test(`preview-theme-base 关键结构选择器必须挂到稳定根类：${selector}`, () => {
    const baseSource = readSource('../preview-theme/preview-theme-base.scss')

    assertBaseSelectorPinnedToStableRoot(baseSource, selector)
  })
})

previewThemeFiles.forEach(({ name, path }) => {
  test(`预览主题 ${name} 必须使用稳定根块`, () => {
    const source = readSource(path)

    assertThemeUsesStableRootSelector(source, name)
  })

  test(`预览主题 ${name} 不得残留裸根块`, () => {
    const source = readSource(path)

    assertThemeDoesNotKeepBareRootSelector(source, name)
  })

  test(`预览主题 ${name} 的 dark 分支不得残留旧裸根块`, () => {
    const source = readSource(path)

    assertThemeModeBranchDoesNotKeepLegacyBareSelector(source, name, 'dark')
  })

  test(`预览主题 ${name} 的 light 分支不得残留旧裸根块`, () => {
    const source = readSource(path)

    assertThemeModeBranchDoesNotKeepLegacyBareSelector(source, name, 'light')
  })

  test(`预览主题 ${name} 的 dark 分支必须挂到稳定根类`, () => {
    const source = readSource(path)

    assertDarkBranchUsesStableRootSelector(source, name)
  })
})
