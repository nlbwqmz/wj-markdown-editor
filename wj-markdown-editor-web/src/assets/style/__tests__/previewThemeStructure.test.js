import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function resolveFixturePath(relativePath) {
  return new URL(relativePath, import.meta.url)
}

function getObjectPropertyBlock(source, propertyName) {
  const propertyIndex = source.indexOf(`${propertyName}:`)
  assert.notEqual(propertyIndex, -1, `未找到 ${propertyName} 属性`)

  const blockStart = source.indexOf('{', propertyIndex)
  assert.notEqual(blockStart, -1, `${propertyName} 属性块缺少起始大括号`)

  let braceDepth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplate = false
  let escaped = false

  for (let i = blockStart; i < source.length; i++) {
    const char = source[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (!inDoubleQuote && !inTemplate && char === '\'') {
      inSingleQuote = !inSingleQuote
      continue
    }
    if (!inSingleQuote && !inTemplate && char === '"') {
      inDoubleQuote = !inDoubleQuote
      continue
    }
    if (!inSingleQuote && !inDoubleQuote && char === '`') {
      inTemplate = !inTemplate
      continue
    }

    if (inSingleQuote || inDoubleQuote || inTemplate) {
      continue
    }

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

  assert.fail(`${propertyName} 属性块没有正确闭合`)
}

function getSelectorBlocks(source, selector) {
  const selectorBlocks = []
  let searchIndex = 0

  while (searchIndex < source.length) {
    const selectorIndex = source.indexOf(selector, searchIndex)
    if (selectorIndex === -1) {
      break
    }

    const blockStart = source.indexOf('{', selectorIndex)
    assert.notEqual(blockStart, -1, `${selector} 缺少起始大括号`)

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
      assert.fail(`${selector} 没有正确闭合`)
    }
  }

  return selectorBlocks
}

function getSelectorBlock(source, selector) {
  const selectorBlocks = getSelectorBlocks(source, selector)

  assert.notEqual(selectorBlocks.length, 0, `未找到选择器：${selector}`)

  return selectorBlocks[0]
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

function getTopLevelDeclarationEntries(blockSource) {
  const blockBody = blockSource.slice(1, -1)
  const declarationEntries = []
  let braceDepth = 0
  let bracketDepth = 0
  let parenDepth = 0
  let tokenStart = 0
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
      braceDepth++
      continue
    }

    if (currentChar === '}') {
      braceDepth--
      if (braceDepth === 0) {
        tokenStart = i + 1
      }
      continue
    }

    if (braceDepth === 0 && currentChar === ';') {
      const declaration = blockBody.slice(tokenStart, i + 1).trim()

      if (declaration) {
        declarationEntries.push(declaration)
      }

      tokenStart = i + 1
    }
  }

  return declarationEntries
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

function selectorEntryTargetsSemanticTag(selectorEntry, tagName) {
  const normalizedEntry = stripLeadingRelativeSelectorPrefix(selectorEntry)

  if (new RegExp(`^${tagName}(?=$|[:.[#])`, 'u').test(normalizedEntry)) {
    return true
  }

  const functionalArguments = getLeadingFunctionalSelectorArguments(normalizedEntry)

  if (!functionalArguments) {
    return false
  }

  return splitTopLevelSelectorEntries(functionalArguments)
    .some(entry => selectorEntryTargetsSemanticTag(entry, tagName))
}

function assertPreviewThemeDefaultIsGithub(source) {
  const previewThemeBlock = getObjectPropertyBlock(source, 'previewTheme')
  assert.match(previewThemeBlock, /default:\s*\(\)\s*=>\s*'github'/)
}

function assertGithubThemeFallbackCodeBlockStyle(source) {
  const githubThemeRootBlocks = getSelectorBlocks(source, '.wj-preview-theme.preview-theme-github')
  const githubThemeFallbackBlock = githubThemeRootBlocks.find(
    block => /\.highlight\s*\{/u.test(block),
  )

  assert.ok(githubThemeFallbackBlock, 'github 主题必须保留包含 .highlight 的稳定根块')

  assert.match(
    githubThemeFallbackBlock,
    /\.highlight pre,\s*pre:not\(\.hljs\)\s*\{[\s\S]*?color:\s*var\(--fgColor-default\);[\s\S]*?background-color:\s*var\(--bgColor-muted\);[\s\S]*?\}/,
  )
}

function assertPreviewThemeEntryImportOrder(source) {
  const useStatements = Array.from(source.matchAll(/^@use\s+['"][^'"]+['"];/gm), match => match[0])
  const expectedUseStatements = [
    '@use \'./preview-theme-contract\';',
    '@use \'./preview-theme-base\';',
    '@use \'./theme/github\';',
    '@use \'./theme/juejin.scss\';',
    '@use \'./theme/smart-blue\';',
    '@use \'./theme/vuepress\';',
    '@use \'./theme/mk-cute\';',
    '@use \'./theme/cyanosis\';',
    '@use \'./theme/scrolls\';',
    '@use \'./theme/markdown-here\';',
  ]

  assert.deepEqual(useStatements, expectedUseStatements)
}

function assertPreviewThemeEntryContainsOnlyUseStatements(source) {
  const nonEmptyLines = source
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)

  nonEmptyLines.forEach((line) => {
    assert.match(line, /^@use\s+['"][^'"]+['"];/, `入口文件存在非 @use 语句：${line}`)
  })
}

function assertPreviewThemeBaseConsumesVariablesOnly(source) {
  const declarationLines = source
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => /^[a-z-]+:[^;]+;$/u.test(line))

  declarationLines.forEach((line) => {
    const separatorIndex = line.indexOf(':')
    const propertyName = separatorIndex === -1 ? '' : line.slice(0, separatorIndex)
    const propertyValue = separatorIndex === -1
      ? ''
      : line.slice(separatorIndex + 1, -1).trim()
    assert.ok(propertyName, `无法解析样式声明：${line}`)
    assert.match(propertyValue, /^var\(--wj-preview-[a-z0-9-]+\)$/u, `基础层存在未通过变量协议消费的声明：${line}`)
  })
}

/**
 * 校验基础层消费到的预览变量都在变量协议中声明，避免变量名拼写错误被静默放过。
 * @param {string} baseSource
 * @param {string} contractSource
 */
function assertPreviewThemeBaseVariablesDeclaredInContract(baseSource, contractSource) {
  const consumedVariableNames = new Set(
    Array.from(baseSource.matchAll(/var\((--wj-preview-[a-z0-9-]+)\)/gu), match => match[1]),
  )
  const declaredVariableNames = new Set(
    Array.from(contractSource.matchAll(/^\s*(--wj-preview-[a-z0-9-]+):/gmu), match => match[1]),
  )

  consumedVariableNames.forEach((variableName) => {
    assert.equal(
      declaredVariableNames.has(variableName),
      true,
      `基础层消费的变量未在变量协议中声明：${variableName}`,
    )
  })
}

/**
 * 校验任务 3 新增的基础表面变量已经同时进入协议层与基础骨架，避免遗漏停留在主题特例里。
 * @param {string} contractSource
 * @param {string} baseSource
 * @param {string[]} requiredVariables
 */
function assertPreviewThemeContractAndBaseCoverRequiredVariables(contractSource, baseSource, requiredVariables) {
  const declaredVariableNames = new Set(
    Array.from(contractSource.matchAll(/^\s*(--wj-preview-[a-z0-9-]+):/gmu), match => match[1]),
  )
  const consumedVariableNames = new Set(
    Array.from(baseSource.matchAll(/var\((--wj-preview-[a-z0-9-]+)\)/gu), match => match[1]),
  )

  requiredVariables.forEach((variableName) => {
    assert.equal(
      declaredVariableNames.has(variableName),
      true,
      `变量协议缺少声明：${variableName}`,
    )
    assert.equal(
      consumedVariableNames.has(variableName),
      true,
      `基础骨架缺少消费：${variableName}`,
    )
  })
}

/**
 * fenced code block 与 mermaid 外壳职责已经迁出基础骨架，这里只允许保留正文与 inline code 等非块级语义。
 * @param {string} source
 */
function assertPreviewThemeBaseDoesNotOwnLegacyCodeBlockSurface(source) {
  const forbiddenSelectorPatterns = [
    [/:where\(\s*pre\s*\)/u, ':where(pre)'],
    [/:where\(\s*pre\s*:not\(\.hljs\)\s*\)/u, ':where(pre:not(.hljs))'],
    [/:where\(\s*pre\s*>\s*code\s*\)/u, ':where(pre > code)'],
    [/:where\(\s*\.pre-container\s*\)/u, ':where(.pre-container)'],
    [/:where\(\s*\.pre-container-copy\s*,\s*\.pre-container-lang\s*\)/u, ':where(.pre-container-copy, .pre-container-lang)'],
    [/\.pre-container:hover\s+\.pre-container-copy\s*\{/u, '.pre-container:hover .pre-container-copy'],
    [/\.pre-container:hover\s+\.pre-container-lang\s*\{/u, '.pre-container:hover .pre-container-lang'],
    [/:where\(\s*pre\.mermaid\s*,\s*pre\.mermaid-cache\s*\)/u, ':where(pre.mermaid, pre.mermaid-cache)'],
  ]

  forbiddenSelectorPatterns.forEach(([pattern, selectorLabel]) => {
    assert.equal(
      pattern.test(source),
      false,
      `基础骨架不得继续承接 fenced code block / mermaid 外壳职责：${selectorLabel}`,
    )
  })
}

/**
 * details 容器表面职责已经收口到预览主题基础骨架，容器样式文件不应继续保留 details 变体。
 * @param {string} source
 */
function assertMarkdownItContainerDoesNotOwnDetailsSurface(source) {
  assert.equal(
    source.includes('.wj-markdown-it-container.wj-markdown-it-container-details'),
    false,
    'details 容器职责应由预览主题基础骨架接管，wj-markdown-it-container 不应继续定义 details 变体',
  )
}

function assertPreviewThemeRegressionFixtureCoverage(source) {
  const requiredMarkers = [
    '![示例图片](',
    '!audio(',
    '!video(',
    '[^preview-theme]',
    '> [!TIP]',
    '::: details',
    '`const theme = \'github\'`',
    '```js',
    '<kbd>Ctrl</kbd> + <kbd>K</kbd>',
    '```mermaid',
    '  - 二级无序项 A.1',
    '    - 三级无序项 A.1.a',
  ]

  requiredMarkers.forEach((marker) => {
    assert.equal(source.includes(marker), true, `回归样本缺少关键标记：${marker}`)
  })
}

/**
 * 校验回归样本补齐了本轮预览主题治理涉及的新 Markdown 场景。
 * @param {string} source
 */
function assertPreviewThemeRegressionFixtureExtendedCoverage(source) {
  assert.match(source, /<kbd>Ctrl<\/kbd>\s*\+\s*<kbd>K<\/kbd>/u)
  assert.match(source, /```mermaid[\s\S]*?graph TD[\s\S]*?```/u)
  assert.match(source, /- 无序项 A[\s\S]*? {2}- 二级无序项 A\.1[\s\S]*? {4}- 三级无序项 A\.1\.a/u)
}

/**
 * 校验基础层已经显式承接本轮新增的非 fenced code block 语义变量，而不是继续散落到主题特例中。
 * @param {string} source
 */
function assertPreviewThemeBaseConsumesExtendedSurfaceVariables(source) {
  const stableRootBlock = getSelectorBlock(source, '.wj-preview-theme')
  const stableRootRuleEntries = getTopLevelNestedRuleEntries(stableRootBlock)
  const stableRootDeclarationEntries = getTopLevelDeclarationEntries(stableRootBlock)

  const semanticSurfaceAssertions = [
    [
      'kbd',
      selectorHeader => splitTopLevelSelectorEntries(selectorHeader)
        .some(entry => selectorEntryTargetsSemanticTag(entry, 'kbd')),
      /var\(--wj-preview-kbd-[a-z0-9-]+\)/u,
    ],
    [
      'details',
      selectorHeader => splitTopLevelSelectorEntries(selectorHeader)
        .some(entry => selectorEntryTargetsSemanticTag(entry, 'details') || selectorEntryTargetsSemanticTag(entry, 'summary')),
      /var\(--wj-preview-(?:details|summary)-[a-z0-9-]+\)/u,
    ],
  ]

  semanticSurfaceAssertions.forEach(([surfaceName, selectorMatcher, variablePattern]) => {
    const matchedRuleEntry = stableRootRuleEntries.find(({ selectorHeader, blockSource }) => {
      return selectorMatcher(selectorHeader) && variablePattern.test(blockSource)
    })

    assert.ok(matchedRuleEntry, `基础骨架未在稳定根块中承接 ${surfaceName} 语义变量`)
  })

  const rootBackgroundVariables = [
    '--wj-preview-theme-background-image',
    '--wj-preview-theme-background-size',
    '--wj-preview-theme-background-position',
  ]

  rootBackgroundVariables.forEach((variableName) => {
    const hasConsumedVariable = stableRootDeclarationEntries.some(declaration => declaration.includes(`var(${variableName})`))

    assert.equal(hasConsumedVariable, true, `基础骨架未在稳定根块中承接背景变量：${variableName}`)
  })
}

function assertRegressionFixtureAssetsExist(source) {
  const referencedAssets = Array.from(source.matchAll(/\.\/assets\/[^\s)]+/g), match => match[0])
  const uniqueAssets = Array.from(new Set(referencedAssets))

  assert.notEqual(uniqueAssets.length, 0, '回归样本没有引用本地资源文件')

  uniqueAssets.forEach((assetPath) => {
    const absoluteAssetPath = resolveFixturePath(`./fixtures/${assetPath}`)
    assert.equal(
      fs.existsSync(absoluteAssetPath),
      true,
      `回归样本引用的资源不存在：${assetPath}`,
    )
  })
}

test('预览组件默认主题值必须统一为 github', () => {
  const previewSource = readSource('../../../components/editor/MarkdownPreview.vue')
  const editSource = readSource('../../../components/editor/MarkdownEdit.vue')

  assertPreviewThemeDefaultIsGithub(previewSource)
  assertPreviewThemeDefaultIsGithub(editSource)
  assert.equal(previewSource.includes('github-light'), false)
  assert.equal(editSource.includes('github-light'), false)
})

test('断言必须限定在 previewTheme 属性块内', () => {
  const previewSource = readSource('../../../components/editor/MarkdownPreview.vue')
  const mutatedPreviewSource = previewSource
    .replace(/previewTheme:\s*\{[\s\S]*?default:\s*\(\)\s*=>\s*'github'[\s\S]*?\}/, `previewTheme: {
    type: String,
    default: () => 'broken-theme',
  }`)
    .replace(/default:\s*\(\)\s*=>\s*'atom-one-dark'/, `default: () => 'github'`)

  assert.throws(() => assertPreviewThemeDefaultIsGithub(mutatedPreviewSource))
})

test('github 预览主题需要覆盖未高亮代码块的回退样式', () => {
  const githubThemeSource = readSource('../preview-theme/theme/github.scss')

  assertGithubThemeFallbackCodeBlockStyle(githubThemeSource)
})

test('预览主题入口必须先聚合变量协议和基础骨架，再引入各主题文件', () => {
  const previewThemeEntrySource = readSource('../preview-theme/preview-theme.scss')

  assertPreviewThemeEntryImportOrder(previewThemeEntrySource)
})

test('预览主题入口文件只能保留 @use 语句', () => {
  const previewThemeEntrySource = readSource('../preview-theme/preview-theme.scss')

  assertPreviewThemeEntryContainsOnlyUseStatements(previewThemeEntrySource)
})

test('预览主题基础骨架的声明值必须通过变量协议消费', () => {
  const previewThemeBaseSource = readSource('../preview-theme/preview-theme-base.scss')

  assertPreviewThemeBaseConsumesVariablesOnly(previewThemeBaseSource)
})

test('预览主题基础骨架消费到的变量必须都在变量协议中声明', () => {
  const previewThemeBaseSource = readSource('../preview-theme/preview-theme-base.scss')
  const previewThemeContractSource = readSource('../preview-theme/preview-theme-contract.scss')

  assertPreviewThemeBaseVariablesDeclaredInContract(previewThemeBaseSource, previewThemeContractSource)
})

test('预览主题变量协议与基础骨架必须覆盖非 fenced code block 的基础表面变量', () => {
  const previewThemeContractSource = readSource('../preview-theme/preview-theme-contract.scss')
  const previewThemeBaseSource = readSource('../preview-theme/preview-theme-base.scss')

  assertPreviewThemeContractAndBaseCoverRequiredVariables(
    previewThemeContractSource,
    previewThemeBaseSource,
    [
      '--wj-preview-kbd-text-color',
      '--wj-preview-kbd-font-size',
      '--wj-preview-kbd-border-radius',
      '--wj-preview-kbd-box-shadow',
      '--wj-preview-theme-background-image',
      '--wj-preview-theme-background-size',
      '--wj-preview-theme-background-position',
      '--wj-preview-details-padding',
      '--wj-preview-details-background-color',
      '--wj-preview-details-border',
      '--wj-preview-details-border-radius',
      '--wj-preview-details-open-summary-margin-bottom',
      '--wj-preview-summary-text-color',
      '--wj-preview-summary-font-weight',
    ],
  )
})

test('预览主题变量声明断言必须能识别基础骨架中的变量拼写错误', () => {
  const previewThemeBaseSource = readSource('../preview-theme/preview-theme-base.scss')
  const previewThemeContractSource = readSource('../preview-theme/preview-theme-contract.scss')
  const mutatedPreviewThemeBaseSource = previewThemeBaseSource.replace(
    'var(--wj-preview-summary-text-color)',
    'var(--wj-preview-summary-text-color-typo)',
  )

  assert.throws(
    () => assertPreviewThemeBaseVariablesDeclaredInContract(mutatedPreviewThemeBaseSource, previewThemeContractSource),
    /基础层消费的变量未在变量协议中声明：--wj-preview-summary-text-color-typo/u,
  )
})

test('预览主题基础骨架不得继续承担 fenced code block 与 mermaid 外壳职责', () => {
  const previewThemeBaseSource = readSource('../preview-theme/preview-theme-base.scss')

  assertPreviewThemeBaseDoesNotOwnLegacyCodeBlockSurface(previewThemeBaseSource)
})

test('基础骨架旧职责断言必须识别 pre、toolbar 与 mermaid 外壳选择器残留', () => {
  const compliantBaseSource = `.wj-preview-theme {
  & :where(:not(pre) > code, :not(pre) > tt, :not(pre) > samp) {
    color: var(--wj-preview-inline-code-text-color);
  }
}`
  const preMutatedBaseSource = `${compliantBaseSource}
  & :where(pre) {
    margin: var(--wj-preview-paragraph-margin);
  }`
  const mermaidMutatedBaseSource = `${compliantBaseSource}
  & :where(pre.mermaid, pre.mermaid-cache) {
    text-align: center;
  }`

  assert.doesNotThrow(() => assertPreviewThemeBaseDoesNotOwnLegacyCodeBlockSurface(compliantBaseSource))
  assert.throws(() => assertPreviewThemeBaseDoesNotOwnLegacyCodeBlockSurface(preMutatedBaseSource), /:where\(pre\)/u)
  assert.throws(() => assertPreviewThemeBaseDoesNotOwnLegacyCodeBlockSurface(mermaidMutatedBaseSource), /pre\.mermaid/u)
})

test('预览主题回归样本必须覆盖关键 Markdown 标记', () => {
  const regressionFixtureSource = readSource('./fixtures/preview-theme-regression.md')

  assertPreviewThemeRegressionFixtureCoverage(regressionFixtureSource)
})

test('预览主题回归样本必须覆盖 kbd、mermaid 和多级无序列表', () => {
  const regressionFixtureSource = readSource('./fixtures/preview-theme-regression.md')

  assertPreviewThemeRegressionFixtureExtendedCoverage(regressionFixtureSource)
})

test('预览主题基础骨架必须消费 kbd、details 与主题根背景变量', () => {
  const previewThemeBaseSource = readSource('../preview-theme/preview-theme-base.scss')

  assertPreviewThemeBaseConsumesExtendedSurfaceVariables(previewThemeBaseSource)
})

test('基础骨架扩展语义断言不应绑定主题根背景属性写法与 details 选择器顺序', () => {
  const equivalentBaseSource = `.wj-preview-theme {
  background:
    var(--wj-preview-theme-background-image)
    center / var(--wj-preview-theme-background-size)
    no-repeat;
  background-position: var(--wj-preview-theme-background-position);

  & :where(kbd) {
    color: var(--wj-preview-kbd-text-color);
  }

  & :where(summary, details) {
    border-color: var(--wj-preview-details-border);
    color: var(--wj-preview-summary-text-color);
  }
}`

  assert.doesNotThrow(() => assertPreviewThemeBaseConsumesExtendedSurfaceVariables(equivalentBaseSource))
})

test('基础骨架扩展语义断言不应把同名类选择器误判为真实语义目标', () => {
  const misleadingBaseSource = `.wj-preview-theme {
  background-image: var(--wj-preview-theme-background-image);
  background-size: var(--wj-preview-theme-background-size);
  background-position: var(--wj-preview-theme-background-position);

  .kbd-hint {
    color: var(--wj-preview-kbd-text-color);
  }

  .details-panel {
    border: var(--wj-preview-details-border);
    color: var(--wj-preview-summary-text-color);
  }
}`

  assert.throws(
    () => assertPreviewThemeBaseConsumesExtendedSurfaceVariables(misleadingBaseSource),
    /基础骨架未在稳定根块中承接 kbd 语义变量/u,
  )
})

test('markdown-it-container 不得继续承担 details 容器职责', () => {
  const markdownItContainerSource = readSource('../wj-markdown-it-container.scss')

  assertMarkdownItContainerDoesNotOwnDetailsSurface(markdownItContainerSource)
})

test('预览主题回归样本引用的本地资源必须存在', () => {
  const regressionFixtureSource = readSource('./fixtures/preview-theme-regression.md')

  assertRegressionFixtureAssetsExist(regressionFixtureSource)
})
