import assert from 'node:assert/strict'
import fs from 'node:fs'
import { compileString } from 'sass'

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

function getDeclarationValue(blockSource, propertyName) {
  const declarationPattern = new RegExp(`\\b${escapeRegExp(propertyName)}\\s*:\\s*([^;]+)\\s*;`, 'u')
  const declarationMatch = blockSource.match(declarationPattern)

  assert.ok(declarationMatch, `未找到属性声明：${propertyName}`)
  return declarationMatch[1].trim()
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

function extractCompiledSelector(cssSource, selectorPattern, errorMessage) {
  const normalizedCssSource = cssSource.replace(/\s+/gu, ' ').trim()
  const selectorMatch = normalizedCssSource.match(selectorPattern)

  assert.ok(selectorMatch, errorMessage)
  return selectorMatch[1].trim()
}

function getSelectorSpecificity(selector) {
  const selectorWithoutWhere = selector
    .replace(/:where\([^)]*\)/gu, '')
    .replace(/::[\w-]+/gu, '')

  const idCount = (selectorWithoutWhere.match(/#[\w-]+/gu) || []).length
  const classLikeCount = (selectorWithoutWhere.match(/\.[\w-]+/gu) || []).length
    + (selectorWithoutWhere.match(/\[[^\]]+\]/gu) || []).length
    + (selectorWithoutWhere.match(/:[\w-]+(?:\([^)]*\))?/gu) || []).length
  const selectorWithoutClassLike = selectorWithoutWhere
    .replace(/#[\w-]+/gu, ' ')
    .replace(/\.[\w-]+/gu, ' ')
    .replace(/\[[^\]]+\]/gu, ' ')
    .replace(/:[\w-]+(?:\([^)]*\))?/gu, ' ')
  const typeCount = (selectorWithoutClassLike.match(/\b[a-z][\w-]*\b/giu) || [])
    .filter(token => token !== 'where')
    .length

  return [idCount, classLikeCount, typeCount]
}

function compareSpecificity(leftSelector, rightSelector) {
  const leftSpecificity = getSelectorSpecificity(leftSelector)
  const rightSpecificity = getSelectorSpecificity(rightSelector)

  for (let i = 0; i < leftSpecificity.length; i++) {
    if (leftSpecificity[i] !== rightSpecificity[i]) {
      return leftSpecificity[i] - rightSpecificity[i]
    }
  }

  return 0
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
  ['.highlight', /(?:^|[^\w-])(?:[a-z][\w-]*|\*)?\.highlight(?=$|[^\w-])/u],
  ['.hljs*', /(?:^|[^\w-])(?:[a-z][\w-]*|\*)?\.hljs(?:-[\w-]+)?(?=$|[^\w-])/u],
  ['.pre-container*', /(?:^|[^\w-])(?:[a-z][\w-]*|\*)?\.pre-container(?:-[\w-]+)?(?=$|[^\w-])/u],
  ['pre > code', /(?:^|[^\w-])pre\s*>\s*code(?=$|[^\w-])/u],
  ['pre code', /(?:^|[^\w-])pre\s+code(?=$|[^\w-])/u],
  ['pre.mermaid*', /(?:^|[^\w-])pre\.(?:mermaid|mermaid-cache)(?=$|[^\w-])/u],
]

const previewThemeForbiddenSelectionPatterns = [
  ['.hljs*::selection', /(?:^|[^\w-])(?:[a-z][\w-]*|\*)?\.hljs(?:-[\w-]+)?\b[^,{]*::selection(?=$|[^\w-])/u],
  ['pre code*::selection', /(?:^|[^\w-])pre(?:\s*>\s*|\s+)code\b[^,{]*::selection(?=$|[^\w-])/u],
]

const previewThemeForbiddenVariablePrefixes = [
  '--wj-preview-pre-',
  '--wj-preview-code-block-',
  '--wj-preview-code-toolbar-',
  '--wj-preview-mermaid-',
]
const forbiddenHljsTokenPattern = /\.hljs-[\w-]+\b/u
const forbiddenIndependentSurfaceStylePatterns = [
  ['background', /\bbackground\s*:[^;]+/u],
  ['background-color', /\bbackground-color\s*:[^;]+/u],
  ['border', /(?:^|[;{\s])border\s*:[^;]+/u],
  ['border-width', /\bborder-width\s*:[^;]+/u],
  ['border-style', /\bborder-style\s*:[^;]+/u],
  ['border-color', /\bborder-color\s*:[^;]+/u],
  ['outline', /\boutline\s*:[^;]+/u],
  ['outline-width', /\boutline-width\s*:[^;]+/u],
  ['outline-style', /\boutline-style\s*:[^;]+/u],
  ['outline-color', /\boutline-color\s*:[^;]+/u],
  ['box-shadow', /\bbox-shadow\s*:[^;]+/u],
]

function assertBlockDoesNotContainIndependentSurfaceStyles(blockSource, blockLabel) {
  forbiddenIndependentSurfaceStylePatterns.forEach(([styleLabel, stylePattern]) => {
    assert.doesNotMatch(
      blockSource,
      stylePattern,
      `${blockLabel} 不得再声明独立表面样式：${styleLabel}`,
    )
  })
}

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
  assert.equal(
    structurePatterns.some(pattern => pattern.test('.wj-preview-theme div.highlight { color: inherit; }')),
    true,
    '结构禁区必须命中带标签前缀的 .highlight',
  )
  assert.equal(
    structurePatterns.some(pattern => pattern.test('.wj-preview-theme div.pre-container { color: inherit; }')),
    true,
    '结构禁区必须命中带标签前缀的 .pre-container',
  )
  assert.equal(
    structurePatterns.some(pattern => pattern.test('.wj-preview-theme code.hljs { color: inherit; }')),
    true,
    '结构禁区必须命中带标签前缀的 .hljs',
  )
})

test('hljs token 禁区模式必须覆盖任意 .hljs-* token 类', () => {
  assert.equal(
    forbiddenHljsTokenPattern.test('.hljs-meta-string { color: inherit; }'),
    true,
    'hljs token 禁区必须命中带中划线的 token 类',
  )
  assert.equal(
    forbiddenHljsTokenPattern.test('.hljs-built_in { color: inherit; }'),
    true,
    'hljs token 禁区必须命中带下划线的 token 类',
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
    selectionPatterns.some(pattern => pattern.test('.wj-preview-theme code.hljs::selection { background: red; }')),
    true,
    'selection 禁区必须命中带标签前缀的 .hljs::selection',
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

test('代码块滚动条 hover 覆盖必须通过更高特异性压过全局 scroll.scss，而不是依赖导入顺序', () => {
  const compiledScrollCss = compileString(readSource('../scroll.scss')).css
  const compiledCodeBlockCss = compileString(readSource('../code-block/code-block-base.scss')).css

  const globalScrollbarHoverSelector = extractCompiledSelector(
    compiledScrollCss,
    /(:where\([^)]*\)::-webkit-scrollbar:hover)\s*\{/u,
    'scroll.scss 必须继续产出共享 ::-webkit-scrollbar:hover 选择器',
  )
  const localScrollbarHoverSelector = extractCompiledSelector(
    compiledCodeBlockCss,
    /(\.wj-preview-theme\s+:where\(\.pre-container pre\)::-webkit-scrollbar:hover)\s*\{/u,
    'code-block-base.scss 必须产出代码块局部 ::-webkit-scrollbar:hover 选择器',
  )
  const globalTrackHoverSelector = extractCompiledSelector(
    compiledScrollCss,
    /(:where\([^)]*\)::-webkit-scrollbar-track:hover)\s*\{/u,
    'scroll.scss 必须继续产出共享 ::-webkit-scrollbar-track:hover 选择器',
  )
  const localTrackHoverSelector = extractCompiledSelector(
    compiledCodeBlockCss,
    /(\.wj-preview-theme\s+:where\(\.pre-container pre\)::-webkit-scrollbar-track:hover)\s*\{/u,
    'code-block-base.scss 必须产出代码块局部 ::-webkit-scrollbar-track:hover 选择器',
  )
  const globalThumbHoverSelector = extractCompiledSelector(
    compiledScrollCss,
    /(:where\([^)]*\)::-webkit-scrollbar-thumb:hover)\s*\{/u,
    'scroll.scss 必须继续产出共享 ::-webkit-scrollbar-thumb:hover 选择器',
  )
  const localThumbHoverSelector = extractCompiledSelector(
    compiledCodeBlockCss,
    /(\.wj-preview-theme\s+:where\(\.pre-container pre\)::-webkit-scrollbar-thumb:hover)\s*\{/u,
    'code-block-base.scss 必须产出代码块局部 ::-webkit-scrollbar-thumb:hover 选择器',
  )
  const globalThumbActiveSelector = extractCompiledSelector(
    compiledScrollCss,
    /(:where\([^)]*\)::-webkit-scrollbar-thumb:active)\s*\{/u,
    'scroll.scss 必须继续产出共享 ::-webkit-scrollbar-thumb:active 选择器',
  )
  const localThumbActiveSelector = extractCompiledSelector(
    compiledCodeBlockCss,
    /(\.wj-preview-theme\s+:where\(\.pre-container pre\)::-webkit-scrollbar-thumb:active)\s*\{/u,
    'code-block-base.scss 必须产出代码块局部 ::-webkit-scrollbar-thumb:active 选择器',
  )
  const localCodeScrollbarHoverSelector = extractCompiledSelector(
    compiledCodeBlockCss,
    /(\.wj-preview-theme\s+:where\(\.pre-container pre code\.hljs\)::-webkit-scrollbar:hover)\s*\{/u,
    'code-block-base.scss 必须产出 code.hljs 局部 ::-webkit-scrollbar:hover 选择器',
  )
  const localCodeTrackHoverSelector = extractCompiledSelector(
    compiledCodeBlockCss,
    /(\.wj-preview-theme\s+:where\(\.pre-container pre code\.hljs\)::-webkit-scrollbar-track:hover)\s*\{/u,
    'code-block-base.scss 必须产出 code.hljs 局部 ::-webkit-scrollbar-track:hover 选择器',
  )
  const localCodeThumbHoverSelector = extractCompiledSelector(
    compiledCodeBlockCss,
    /(\.wj-preview-theme\s+:where\(\.pre-container pre code\.hljs\)::-webkit-scrollbar-thumb:hover)\s*\{/u,
    'code-block-base.scss 必须产出 code.hljs 局部 ::-webkit-scrollbar-thumb:hover 选择器',
  )
  const localCodeThumbActiveSelector = extractCompiledSelector(
    compiledCodeBlockCss,
    /(\.wj-preview-theme\s+:where\(\.pre-container pre code\.hljs\)::-webkit-scrollbar-thumb:active)\s*\{/u,
    'code-block-base.scss 必须产出 code.hljs 局部 ::-webkit-scrollbar-thumb:active 选择器',
  )

  assert.ok(
    compareSpecificity(localScrollbarHoverSelector, globalScrollbarHoverSelector) > 0,
    '代码块局部 ::-webkit-scrollbar:hover 选择器必须比全局共享规则拥有更高特异性',
  )
  assert.ok(
    compareSpecificity(localTrackHoverSelector, globalTrackHoverSelector) > 0,
    '代码块局部 ::-webkit-scrollbar-track:hover 选择器必须比全局共享规则拥有更高特异性',
  )
  assert.ok(
    compareSpecificity(localThumbHoverSelector, globalThumbHoverSelector) > 0,
    '代码块局部 ::-webkit-scrollbar-thumb:hover 选择器必须比全局共享规则拥有更高特异性',
  )
  assert.ok(
    compareSpecificity(localThumbActiveSelector, globalThumbActiveSelector) > 0,
    '代码块局部 ::-webkit-scrollbar-thumb:active 选择器必须比全局共享规则拥有更高特异性',
  )
  assert.ok(
    compareSpecificity(localCodeScrollbarHoverSelector, globalScrollbarHoverSelector) > 0,
    'code.hljs 局部 ::-webkit-scrollbar:hover 选择器必须比全局共享规则拥有更高特异性',
  )
  assert.ok(
    compareSpecificity(localCodeTrackHoverSelector, globalTrackHoverSelector) > 0,
    'code.hljs 局部 ::-webkit-scrollbar-track:hover 选择器必须比全局共享规则拥有更高特异性',
  )
  assert.ok(
    compareSpecificity(localCodeThumbHoverSelector, globalThumbHoverSelector) > 0,
    'code.hljs 局部 ::-webkit-scrollbar-thumb:hover 选择器必须比全局共享规则拥有更高特异性',
  )
  assert.ok(
    compareSpecificity(localCodeThumbActiveSelector, globalThumbActiveSelector) > 0,
    'code.hljs 局部 ::-webkit-scrollbar-thumb:active 选择器必须比全局共享规则拥有更高特异性',
  )
})

test('code-block-base.scss 只承接 code block 结构层选择器', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')
  const previewThemeScopeRange = getSelectorBlockRange(codeBlockBaseSource, '.wj-preview-theme')
  const previewThemeScopeBlock = previewThemeScopeRange.blockSource
  const requiredSelectors = [
    '.pre-container',
    '.pre-container-toolbar',
    '.pre-container-action-slot',
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

test('code-block-base.scss 的结构层必须限定在 .wj-preview-theme 作用域下并收口为单容器浮层', () => {
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
    /position\s*:\s*relative/u,
    'code-block-base.scss 必须让 .pre-container 成为定位容器',
  )
  assert.doesNotMatch(
    preContainerBlock,
    /overflow\s*:\s*hidden/u,
    'code-block-base.scss 不得再通过 .pre-container 的 overflow: hidden 裁切关联高亮边框',
  )
  assert.doesNotMatch(
    preContainerBlock,
    /display\s*:\s*grid/u,
    'code-block-base.scss 不得再把 .pre-container 写成两行 grid 容器',
  )
  assert.doesNotMatch(
    previewThemeScopeBlock,
    /grid-template-rows\s*:/u,
    'code-block-base.scss 不得再声明 toolbar 独立行的 grid-template-rows',
  )
  assert.doesNotMatch(
    preBlock,
    /grid-row\s*:/u,
    'code-block-base.scss 不得再通过 grid-row 固定正文所在行',
  )
  assert.match(
    preBlock,
    /overflow\s*:\s*auto/u,
    'code-block-base.scss 必须继续让 pre 承担主滚动层',
  )
})

test('code-block-base.scss 的工具栏布局必须保持单槽位浮层且不再绘制独立动作表面', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')
  const previewThemeScopeBlock = getSelectorBlockRange(codeBlockBaseSource, '.wj-preview-theme').blockSource
  const toolbarBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container-toolbar)').blockSource
  const actionSlotBlock = getSelectorBlockRange(previewThemeScopeBlock, '.pre-container-action-slot').blockSource
  const sharedActionContentBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container-lang, .pre-container-copy)').blockSource
  const langBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container-lang)').blockSource
  const copyButtonBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container-copy)').blockSource

  assert.match(
    previewThemeScopeBlock,
    /--wj-code-block-base-toolbar-inset-block\s*:\s*2px\s*;/u,
    'code-block-base.scss 必须把 toolbar block inset 默认值收紧到 2px',
  )
  assert.match(
    previewThemeScopeBlock,
    /--wj-code-block-base-toolbar-inset-inline\s*:\s*4px\s*;/u,
    'code-block-base.scss 必须把 toolbar inline inset 默认值更新为 4px',
  )
  assert.match(
    toolbarBlock,
    /position\s*:\s*absolute/u,
    'code-block-base.scss 必须把工具栏改成代码块内部右上角浮层',
  )
  assert.match(
    toolbarBlock,
    /top\s*:\s*var\(--wj-code-block-base-toolbar-inset-block\)/u,
    'code-block-base.scss 必须继续通过 toolbar inset block 变量定位顶部偏移',
  )
  assert.match(
    toolbarBlock,
    /right\s*:\s*var\(--wj-code-block-base-toolbar-inset-inline\)/u,
    'code-block-base.scss 必须继续通过 toolbar inset inline 变量定位右侧偏移',
  )
  assert.equal(
    getDeclarationValue(toolbarBlock, 'top'),
    'var(--wj-code-block-base-toolbar-inset-block)',
    'code-block-base.scss 不得把 toolbar 顶部偏移改写成脱离变量体系的其他值',
  )
  assert.equal(
    getDeclarationValue(toolbarBlock, 'right'),
    'var(--wj-code-block-base-toolbar-inset-inline)',
    'code-block-base.scss 不得把 toolbar 右侧偏移改写成脱离变量体系的其他值',
  )
  assert.doesNotMatch(
    toolbarBlock,
    /max-width\s*:[^;]+/u,
    'code-block-base.scss 当前实现不得再给 toolbar 增加额外的 max-width 收口',
  )
  assert.doesNotMatch(
    toolbarBlock,
    /translate[XY]?\s*\(/u,
    'code-block-base.scss 不得改成依赖 transform 的额外偏移修正',
  )
  assert.doesNotMatch(
    toolbarBlock,
    /\binset\s*:/u,
    'code-block-base.scss 不得改成写死整组 inset 简写，避免模糊变量职责',
  )
  assert.match(
    toolbarBlock,
    /pointer-events\s*:\s*none/u,
    'code-block-base.scss 必须保持 toolbar 容器的 pointer-events 收口逻辑',
  )
  assert.doesNotMatch(
    toolbarBlock,
    /grid-row\s*:/u,
    'code-block-base.scss 的工具栏不得再占据独立结构行',
  )
  assert.match(
    codeBlockBaseSource,
    /\n\s*\.pre-container-action-slot\s*\{/u,
    'code-block-base.scss 必须用具备正常特异性的 action-slot 选择器承接关键布局',
  )
  assert.doesNotMatch(
    codeBlockBaseSource,
    /:where\(\.pre-container-action-slot\)\s*\{/u,
    'code-block-base.scss 不得继续保留 :where(.pre-container-action-slot) 这种零特异性布局块',
  )
  assert.match(
    actionSlotBlock,
    /display\s*:\s*flex/u,
    'code-block-base.scss 必须在 action-slot 布局块中承接 display: flex',
  )
  assert.match(
    actionSlotBlock,
    /align-items\s*:\s*center/u,
    'code-block-base.scss 必须让 action-slot 在纵向上对齐动作内容',
  )
  assert.doesNotMatch(
    codeBlockBaseSource,
    /\n\s*\.pre-container-action-slot > \.pre-container-lang,[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*\.pre-container-action-slot > \.pre-container-copy\s*\{/u,
    'code-block-base.scss 当前实现不应再依赖显式子节点重叠规则',
  )
  assert.match(
    actionSlotBlock,
    /pointer-events\s*:\s*none/u,
    'code-block-base.scss 必须让 action-slot 显式禁用 pointer-events，避免透明命中层抢占交互',
  )
  assert.doesNotMatch(
    actionSlotBlock,
    /max-width\s*:[^;]+/u,
    'code-block-base.scss 不得再给 action-slot 增加 max-width 之类的人工宽度限制',
  )
  assert.doesNotMatch(
    actionSlotBlock,
    /padding-inline\s*:[^;]+/u,
    'code-block-base.scss 当前实现不得再由 action-slot 承接额外的 padding-inline',
  )
  assert.match(
    actionSlotBlock,
    /overflow\s*:\s*hidden/u,
    'code-block-base.scss 必须让 action slot 裁剪超长内容',
  )
  assert.match(
    actionSlotBlock,
    /text-overflow\s*:\s*ellipsis/u,
    'code-block-base.scss 必须让 action slot 超长内容显示省略号',
  )
  assert.doesNotMatch(
    actionSlotBlock,
    /border-radius\s*:[^;]+/u,
    'code-block-base.scss 当前实现不得再让 action-slot 承接独立圆角',
  )
  assert.match(
    actionSlotBlock,
    /(?:^|[;{\s])color\s*:[^;]+/u,
    'code-block-base.scss 必须让 action-slot 自己承接共享浮层的文字颜色',
  )
  assertBlockDoesNotContainIndependentSurfaceStyles(
    actionSlotBlock,
    'code-block-base.scss 的 action-slot 布局块',
  )
  assert.match(
    sharedActionContentBlock,
    /line-height\s*:\s*var\(--wj-code-block-base-action-line-height\)/u,
    'code-block-base.scss 必须让 lang/copy 内容层复用统一的行高变量',
  )
  assert.match(
    sharedActionContentBlock,
    /height\s*:\s*var\(--wj-code-block-base-action-height\)/u,
    'code-block-base.scss 必须让 lang/copy 内容层复用统一的紧凑高度变量',
  )
  assert.match(
    sharedActionContentBlock,
    /font-size\s*:\s*var\(--wj-code-block-base-action-font-size\)/u,
    'code-block-base.scss 必须让 lang/copy 内容层复用统一字号变量',
  )
  assert.match(
    sharedActionContentBlock,
    /overflow\s*:\s*hidden/u,
    'code-block-base.scss 必须让 lang/copy 内容层裁剪超长文本',
  )
  assert.match(
    sharedActionContentBlock,
    /text-overflow\s*:\s*ellipsis/u,
    'code-block-base.scss 必须让 lang/copy 内容层对超长文本显示省略号',
  )
  assert.match(
    sharedActionContentBlock,
    /white-space\s*:\s*nowrap/u,
    'code-block-base.scss 必须让 lang/copy 内容层保持单行',
  )
  assert.doesNotMatch(
    sharedActionContentBlock,
    /padding-inline\s*:[^;]+/u,
    'code-block-base.scss 不得再让 lang/copy 内容层各自承接共享浮层的 padding-inline',
  )
  assert.doesNotMatch(
    sharedActionContentBlock,
    /border-radius\s*:[^;]+/u,
    'code-block-base.scss 不得再让 lang/copy 内容层各自承接共享浮层的圆角',
  )
  assert.doesNotMatch(
    sharedActionContentBlock,
    /(?:^|[;{\s])color\s*:[^;]+/u,
    'code-block-base.scss 不得再让 lang/copy 内容层各自承接共享浮层的文字颜色',
  )
  assertBlockDoesNotContainIndependentSurfaceStyles(
    sharedActionContentBlock,
    'code-block-base.scss 的 lang/copy 共享内容层',
  )
  assert.match(
    langBlock,
    /white-space\s*:\s*nowrap/u,
    'code-block-base.scss 必须让语言标签保持单行，避免撑高浮层',
  )
  assert.match(
    langBlock,
    /pointer-events\s*:\s*none/u,
    'code-block-base.scss 必须让语言标签默认不抢占交互',
  )
  assert.match(
    copyButtonBlock,
    /display\s*:\s*none/u,
    'code-block-base.scss 必须让复制按钮默认通过 display: none 进入隐藏态',
  )
  assert.match(
    copyButtonBlock,
    /pointer-events\s*:\s*none/u,
    'code-block-base.scss 必须让复制按钮默认不抢占交互',
  )
  assert.doesNotMatch(
    previewThemeScopeBlock,
    /\bvisibility\s*:\s*hidden/u,
    'code-block-base.scss 不得通过 visibility: hidden 切断结构层显隐',
  )
  assert.match(
    previewThemeScopeBlock,
    /:hover[\s\S]{0,400}\.pre-container-lang[\s\S]{0,200}display\s*:\s*none/u,
    'code-block-base.scss 必须在 hover 态隐藏语言标记',
  )
  assert.match(
    previewThemeScopeBlock,
    /:focus-within[\s\S]{0,400}\.pre-container-lang[\s\S]{0,200}display\s*:\s*none/u,
    'code-block-base.scss 必须在 focus-within 态隐藏语言标记',
  )
  assert.match(
    previewThemeScopeBlock,
    /:hover[\s\S]{0,400}\.pre-container-copy[\s\S]{0,200}display\s*:\s*block/u,
    'code-block-base.scss 必须在 hover 态显示复制按钮',
  )
  assert.match(
    previewThemeScopeBlock,
    /:focus-within[\s\S]{0,400}\.pre-container-copy[\s\S]{0,200}display\s*:\s*block/u,
    'code-block-base.scss 必须在 focus-within 态显示复制按钮',
  )
  assert.match(
    previewThemeScopeBlock,
    /:hover[\s\S]{0,400}\.pre-container-copy[\s\S]{0,200}pointer-events\s*:\s*auto/u,
    'code-block-base.scss 必须在 hover 态恢复复制按钮交互',
  )
  assert.match(
    previewThemeScopeBlock,
    /:focus-within[\s\S]{0,400}\.pre-container-copy[\s\S]{0,200}pointer-events\s*:\s*auto/u,
    'code-block-base.scss 必须在 focus-within 态恢复复制按钮交互',
  )
  assert.match(
    copyButtonBlock,
    /var\(--wj-code-block-action-[a-z0-9-]+(?:\s*,[^)]*)?\)/u,
    'code-block-base.scss 必须在复制按钮样式中消费 --wj-code-block-action-* 变量',
  )
  assert.match(
    copyButtonBlock,
    /:focus-visible[\s\S]{0,200}var\(--wj-code-block-action-[a-z0-9-]+(?:\s*,[^)]*)?\)/u,
    'code-block-base.scss 必须为复制按钮提供基于 action 变量的 focus-visible 反馈',
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
    forbiddenHljsTokenPattern,
    'code-block-base.scss 不得包含任意 hljs token 颜色规则',
  )
})

test('code-block-base.scss 必须同时覆盖 pre 与 code.hljs 两层代码块滚动容器', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')
  const previewThemeScopeBlock = getSelectorBlockRange(codeBlockBaseSource, '.wj-preview-theme').blockSource
  const preBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container pre)').blockSource
  const codeBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container pre code.hljs)').blockSource

  assert.match(preBlock, /&::-webkit-scrollbar\s*\{/u)
  assert.match(preBlock, /&::-webkit-scrollbar-track\s*\{/u)
  assert.match(preBlock, /&::-webkit-scrollbar-corner\s*\{/u)
  assert.match(preBlock, /&::-webkit-scrollbar-thumb\s*\{/u)
  assert.match(codeBlock, /&::-webkit-scrollbar\s*\{/u)
  assert.match(codeBlock, /&::-webkit-scrollbar-track\s*\{/u)
  assert.match(codeBlock, /&::-webkit-scrollbar-corner\s*\{/u)
  assert.match(codeBlock, /&::-webkit-scrollbar-thumb\s*\{/u)
  assert.doesNotMatch(
    codeBlockBaseSource,
    /\.wj-scrollbar\b/u,
    'code-block-base.scss 不得引入全局 .wj-scrollbar 选择器',
  )
})

test('code-block-base.scss 的代码块滚动条必须在 pre 与 code.hljs 两层都保持透明轨道并消费局部变量', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')
  const previewThemeScopeBlock = getSelectorBlockRange(codeBlockBaseSource, '.wj-preview-theme').blockSource
  const preBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container pre)').blockSource
  const codeBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container pre code.hljs)').blockSource
  const scrollbarBlock = getSelectorBlockRange(preBlock, '&::-webkit-scrollbar').blockSource
  const trackBlock = getSelectorBlockRange(preBlock, '&::-webkit-scrollbar-track').blockSource
  const cornerBlock = getSelectorBlockRange(preBlock, '&::-webkit-scrollbar-corner').blockSource
  const scrollbarHoverBlock = getSelectorBlockRange(preBlock, '&::-webkit-scrollbar:hover').blockSource
  const trackHoverBlock = getSelectorBlockRange(preBlock, '&::-webkit-scrollbar-track:hover').blockSource
  const thumbBlock = getSelectorBlockRange(preBlock, '&::-webkit-scrollbar-thumb').blockSource
  const thumbHoverBlock = getSelectorBlockRange(preBlock, '&::-webkit-scrollbar-thumb:hover').blockSource
  const thumbActiveBlock = getSelectorBlockRange(preBlock, '&::-webkit-scrollbar-thumb:active').blockSource
  const codeScrollbarBlock = getSelectorBlockRange(codeBlock, '&::-webkit-scrollbar').blockSource
  const codeTrackBlock = getSelectorBlockRange(codeBlock, '&::-webkit-scrollbar-track').blockSource
  const codeCornerBlock = getSelectorBlockRange(codeBlock, '&::-webkit-scrollbar-corner').blockSource
  const codeScrollbarHoverBlock = getSelectorBlockRange(codeBlock, '&::-webkit-scrollbar:hover').blockSource
  const codeTrackHoverBlock = getSelectorBlockRange(codeBlock, '&::-webkit-scrollbar-track:hover').blockSource
  const codeThumbBlock = getSelectorBlockRange(codeBlock, '&::-webkit-scrollbar-thumb').blockSource
  const codeThumbHoverBlock = getSelectorBlockRange(codeBlock, '&::-webkit-scrollbar-thumb:hover').blockSource
  const codeThumbActiveBlock = getSelectorBlockRange(codeBlock, '&::-webkit-scrollbar-thumb:active').blockSource

  assert.match(scrollbarBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(trackBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(cornerBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(scrollbarHoverBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(trackHoverBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(thumbBlock, /var\(--wj-code-block-scrollbar-thumb-bg\)/u)
  assert.match(thumbHoverBlock, /var\(--wj-code-block-scrollbar-thumb-bg-hover\)/u)
  assert.match(thumbActiveBlock, /var\(--wj-code-block-scrollbar-thumb-bg-active\)/u)
  assert.match(thumbHoverBlock, /border\s*:\s*2px\s+solid\s+transparent\s*;/u)
  assert.match(thumbActiveBlock, /border\s*:\s*2px\s+solid\s+transparent\s*;/u)
  assert.match(codeScrollbarBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(codeTrackBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(codeCornerBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(codeScrollbarHoverBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(codeTrackHoverBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(codeThumbBlock, /var\(--wj-code-block-scrollbar-thumb-bg\)/u)
  assert.match(codeThumbHoverBlock, /var\(--wj-code-block-scrollbar-thumb-bg-hover\)/u)
  assert.match(codeThumbActiveBlock, /var\(--wj-code-block-scrollbar-thumb-bg-active\)/u)
  assert.match(codeThumbHoverBlock, /border\s*:\s*2px\s+solid\s+transparent\s*;/u)
  assert.match(codeThumbActiveBlock, /border\s*:\s*2px\s+solid\s+transparent\s*;/u)
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

test('preview theme 文件不得继续声明 pre 外壳变量族', () => {
  previewThemeFiles.forEach((fileName) => {
    const source = readPreviewThemeSource(fileName)

    assert.doesNotMatch(
      source,
      /^\s*--wj-preview-pre-[a-z0-9-]+\s*:/mu,
      `${fileName} 不得继续声明变量族：--wj-preview-pre-*`,
    )
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

test('code-block-base.scss 不得继续消费 preview theme 的 pre 外壳变量', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')

  assert.doesNotMatch(
    codeBlockBaseSource,
    /var\(--wj-preview-pre-[a-z0-9-]+/u,
    'code-block-base.scss 不得继续消费 --wj-preview-pre-* 变量',
  )
})
