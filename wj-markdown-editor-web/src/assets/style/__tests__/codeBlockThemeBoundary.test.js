import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function stripScssComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '')
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

function readPreviewThemeSource(fileName) {
  return stripScssComments(readSource(`../preview-theme/theme/${fileName}`))
}

const previewThemeFiles = [
  'github.scss',
  'juejin.scss',
  'vuepress.scss',
  'markdown-here.scss',
  'smart-blue.scss',
  'mk-cute.scss',
  'cyanosis.scss',
  'scrolls.scss',
]

const previewThemeForbiddenStructurePatterns = [
  ['.highlight', /(?:^|[^\w-])\.highlight(?=$|[^\w-])/u],
  ['.hljs*', /(?:^|[^\w-])\.hljs(?:-[\w-]+)?(?=$|[^\w-])/u],
  ['.pre-container*', /(?:^|[^\w-])\.pre-container(?:-[\w-]+)?(?=$|[^\w-])/u],
  ['pre > code', /(?:^|[^\w-])pre\s*>\s*code(?=$|[^\w-])/u],
  ['pre code', /(?:^|[^\w-])pre\s+code(?=$|[^\w-])/u],
  ['pre.mermaid*', /(?:^|[^\w-])pre\.(?:mermaid|mermaid-cache)(?=$|[^\w-])/u],
]

const previewThemeForbiddenSelectionPatterns = [
  ['.hljs*::selection', /(?:^|[^\w-])\.hljs(?:-[\w-]+)?\b[^,{]*::selection(?=$|[^\w-])/u],
  ['pre code*::selection', /(?:^|[^\w-])pre(?:\s*>\s*|\s+)code\b[^,{]*::selection(?=$|[^\w-])/u],
]

const previewThemeForbiddenVariablePrefixes = [
  '--wj-preview-code-block-',
  '--wj-preview-code-toolbar-',
  '--wj-preview-mermaid-',
]

test('结构选择器模式必须把 .hljs 本体和 .hljs-* token 选择器都视为禁区', () => {
  const structurePatterns = previewThemeForbiddenStructurePatterns.map(([, pattern]) => pattern)

  assert.equal(
    structurePatterns.some(pattern => pattern.test('.wj-preview-theme .hljs { color: inherit; }')),
    true,
    '结构禁区必须继续命中 .hljs 本体',
  )
  assert.equal(
    structurePatterns.some(pattern => pattern.test('.wj-preview-theme .hljs-keyword { color: inherit; }')),
    true,
    '结构禁区必须命中 .hljs-* token 选择器',
  )
})

test('代码块 selection 模式必须允许 inline code 选择器并继续拦截 fenced code block 上下文', () => {
  const selectionPatterns = previewThemeForbiddenSelectionPatterns.map(([, pattern]) => pattern)

  assert.equal(
    selectionPatterns.some(pattern => pattern.test('.wj-preview-theme pre > code::selection { background: red; }')),
    true,
    'selection 禁区必须命中 pre > code::selection',
  )
  assert.equal(
    selectionPatterns.some(pattern => pattern.test('.wj-preview-theme .hljs-keyword::selection { background: red; }')),
    true,
    'selection 禁区必须命中 .hljs-*::selection',
  )
  assert.equal(
    selectionPatterns.some(pattern => pattern.test('.wj-preview-theme :not(pre) > code::selection { background: red; }')),
    false,
    'selection 禁区不得误伤 inline code 选择器',
  )
})

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
  const previewThemeScopeBlock = getSelectorBlockRange(codeBlockBaseSource, '.wj-preview-theme').blockSource
  const preContainerBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container)').blockSource
  const preBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container pre)').blockSource

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
  assert.doesNotMatch(
    preContainerBlock,
    /\bbackground(?:-color)?\s*:/u,
    'code-block-base.scss 不得通过 .pre-container 承接独立的代码表面背景色',
  )
  assert.match(
    preContainerBlock,
    /display\s*:\s*grid/u,
    'code-block-base.scss 必须让 .pre-container 成为结构容器',
  )
  assert.match(
    preContainerBlock,
    /grid-template-rows\s*:[^;]+/u,
    'code-block-base.scss 必须显式定义 toolbar 和正文的两段式行布局',
  )
  assert.match(
    preBlock,
    /grid-row\s*:\s*2/u,
    'code-block-base.scss 必须让正文区域落在 toolbar 结构之后',
  )
})

test('code-block-base.scss 的工具栏布局必须让复制按钮稳定右锚定', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')
  const previewThemeScopeBlock = getSelectorBlockRange(codeBlockBaseSource, '.wj-preview-theme').blockSource
  const toolbarBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container-toolbar)').blockSource
  const copyButtonBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container-copy)').blockSource

  assert.doesNotMatch(
    toolbarBlock,
    /justify-content\s*:\s*space-between/u,
    'code-block-base.scss 的工具栏布局不得依赖 space-between',
  )
  assert.doesNotMatch(
    toolbarBlock,
    /position\s*:\s*absolute/u,
    'code-block-base.scss 的工具栏不得再用绝对定位压住正文',
  )
  assert.match(
    toolbarBlock,
    /grid-row\s*:\s*1/u,
    'code-block-base.scss 必须让工具栏占据独立的结构行',
  )
  assert.match(
    copyButtonBlock,
    /margin-left\s*:\s*auto/u,
    'code-block-base.scss 必须显式让复制按钮稳定右锚定',
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

test('preview theme 文件不得继续声明 fenced code block / mermaid 变量族', () => {
  previewThemeFiles.forEach((fileName) => {
    const source = readPreviewThemeSource(fileName)

    previewThemeForbiddenVariablePrefixes.forEach((variablePrefix) => {
      assert.doesNotMatch(
        source,
        new RegExp(`^\\s*${escapeRegExp(variablePrefix)}[a-z0-9-]*\\s*:`, 'mu'),
        `${fileName} 不得继续声明变量族：${variablePrefix}*`,
      )
    })
  })
})

test('preview theme 文件不得继续命中 fenced code block / mermaid 结构选择器', () => {
  previewThemeFiles.forEach((fileName) => {
    const source = readPreviewThemeSource(fileName)

    previewThemeForbiddenStructurePatterns.forEach(([selectorLabel, pattern]) => {
      assert.doesNotMatch(
        source,
        pattern,
        `${fileName} 不得继续命中结构选择器：${selectorLabel}`,
      )
    })
  })
})

test('preview theme 文件不得继续命中代码块相关 ::selection 选择器', () => {
  previewThemeFiles.forEach((fileName) => {
    const source = readPreviewThemeSource(fileName)

    previewThemeForbiddenSelectionPatterns.forEach(([selectorLabel, pattern]) => {
      assert.doesNotMatch(
        source,
        pattern,
        `${fileName} 不得继续命中代码块相关选择器：${selectorLabel}`,
      )
    })
  })
})
