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

function assertPreviewThemeCodeToolbarHoverRulesHaveSpecificity(source) {
  assert.match(source, /\.pre-container:hover\s+\.pre-container-copy\s*\{/u)
  assert.match(source, /\.pre-container:hover\s+\.pre-container-lang\s*\{/u)
  assert.equal(source.includes(':where(.pre-container:hover .pre-container-copy)'), false)
  assert.equal(source.includes(':where(.pre-container:hover .pre-container-lang)'), false)
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
  ]

  requiredMarkers.forEach((marker) => {
    assert.equal(source.includes(marker), true, `回归样本缺少关键标记：${marker}`)
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

test('预览主题基础骨架的代码块工具栏 hover 规则必须保留足够 specificity', () => {
  const previewThemeBaseSource = readSource('../preview-theme/preview-theme-base.scss')

  assertPreviewThemeCodeToolbarHoverRulesHaveSpecificity(previewThemeBaseSource)
})

test('预览主题回归样本必须覆盖关键 Markdown 标记', () => {
  const regressionFixtureSource = readSource('./fixtures/preview-theme-regression.md')

  assertPreviewThemeRegressionFixtureCoverage(regressionFixtureSource)
})

test('预览主题回归样本引用的本地资源必须存在', () => {
  const regressionFixtureSource = readSource('./fixtures/preview-theme-regression.md')

  assertRegressionFixtureAssetsExist(regressionFixtureSource)
})
