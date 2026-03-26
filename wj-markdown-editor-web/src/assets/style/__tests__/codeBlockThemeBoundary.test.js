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

test('code-block-base.scss 的工具栏布局必须切换为单槽位浮层', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')
  const previewThemeScopeBlock = getSelectorBlockRange(codeBlockBaseSource, '.wj-preview-theme').blockSource
  const toolbarBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container-toolbar)').blockSource
  const actionSlotBlock = getSelectorBlockRange(previewThemeScopeBlock, '.pre-container-action-slot').blockSource
  const actionSlotChildBlock = getSelectorBlockRange(previewThemeScopeBlock, '.pre-container-action-slot > .pre-container-lang,\n  .pre-container-action-slot > .pre-container-copy').blockSource
  const sharedActionContentBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container-lang, .pre-container-copy)').blockSource
  const langBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container-lang)').blockSource
  const copyButtonBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container-copy)').blockSource

  assert.match(
    toolbarBlock,
    /position\s*:\s*absolute/u,
    'code-block-base.scss 必须把工具栏改成代码块内部右上角浮层',
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
    /display\s*:\s*grid/u,
    'code-block-base.scss 必须在 action-slot 布局块中承接 display: grid',
  )
  assert.match(
    codeBlockBaseSource,
    /\n\s*\.pre-container-action-slot > \.pre-container-lang,[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*\.pre-container-action-slot > \.pre-container-copy\s*\{/u,
    'code-block-base.scss 必须用显式子节点选择器硬保护单槽位重叠契约',
  )
  assert.doesNotMatch(
    codeBlockBaseSource,
    /:where\(\.pre-container-action-slot > \.pre-container-lang, \.pre-container-action-slot > \.pre-container-copy\)\s*\{/u,
    'code-block-base.scss 不得继续用 :where(...) 声明单槽位重叠的子节点规则',
  )
  assert.match(
    actionSlotChildBlock,
    /grid-area\s*:\s*1\s*\/\s*1/u,
    'code-block-base.scss 必须锁住 action-slot 子节点共享同一槽位的 grid-area: 1 / 1',
  )
  assert.match(
    actionSlotBlock,
    /padding-inline\s*:[^;]+/u,
    'code-block-base.scss 必须让 action-slot 自己承接共享浮层的 padding-inline',
  )
  assert.match(
    actionSlotBlock,
    /max-width\s*:[^;]+/u,
    'code-block-base.scss 必须限制 action slot 的最大宽度，避免顶满整行',
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
  assert.match(
    actionSlotBlock,
    /border-radius\s*:[^;]+/u,
    'code-block-base.scss 必须让 action-slot 自己承接共享浮层的圆角',
  )
  assert.match(
    actionSlotBlock,
    /(?:^|[;{\s])color\s*:[^;]+/u,
    'code-block-base.scss 必须让 action-slot 自己承接共享浮层的文字颜色',
  )
  assert.match(
    actionSlotBlock,
    /background\s*:[^;]+/u,
    'code-block-base.scss 必须让 action-slot 自己承接共享浮层的背景',
  )
  assert.match(
    actionSlotBlock,
    /(?:^|[;{\s])border\s*:[^;]+/u,
    'code-block-base.scss 必须让 action-slot 自己承接共享浮层的边框',
  )
  assert.match(
    actionSlotBlock,
    /box-shadow\s*:[^;]+/u,
    'code-block-base.scss 必须让 action-slot 自己承接共享浮层的阴影',
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
  assert.doesNotMatch(
    sharedActionContentBlock,
    /background\s*:[^;]+/u,
    'code-block-base.scss 不得再让 lang/copy 内容层各自承接共享浮层的背景',
  )
  assert.doesNotMatch(
    sharedActionContentBlock,
    /(?:^|[;{\s])border\s*:[^;]+/u,
    'code-block-base.scss 不得再让 lang/copy 内容层各自承接共享浮层的边框',
  )
  assert.doesNotMatch(
    sharedActionContentBlock,
    /box-shadow\s*:[^;]+/u,
    'code-block-base.scss 不得再让 lang/copy 内容层各自承接共享浮层的阴影',
  )
  assert.match(
    langBlock,
    /white-space\s*:\s*nowrap/u,
    'code-block-base.scss 必须让语言标签保持单行，避免撑高浮层',
  )
  assert.match(
    copyButtonBlock,
    /opacity\s*:\s*0/u,
    'code-block-base.scss 必须让复制按钮默认保持隐藏态透明度',
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
  assert.doesNotMatch(
    previewThemeScopeBlock,
    /\bdisplay\s*:\s*none/u,
    'code-block-base.scss 不得通过 display: none 切断键盘路径',
  )
  assert.match(
    previewThemeScopeBlock,
    /:hover[\s\S]{0,400}\.pre-container-lang[\s\S]{0,200}opacity\s*:\s*0/u,
    'code-block-base.scss 必须在 hover 态隐藏语言标记',
  )
  assert.match(
    previewThemeScopeBlock,
    /:focus-within[\s\S]{0,400}\.pre-container-lang[\s\S]{0,200}opacity\s*:\s*0/u,
    'code-block-base.scss 必须在 focus-within 态隐藏语言标记',
  )
  assert.match(
    previewThemeScopeBlock,
    /:hover[\s\S]{0,400}\.pre-container-copy[\s\S]{0,200}opacity\s*:\s*1/u,
    'code-block-base.scss 必须在 hover 态显示复制按钮',
  )
  assert.match(
    previewThemeScopeBlock,
    /:focus-within[\s\S]{0,400}\.pre-container-copy[\s\S]{0,200}opacity\s*:\s*1/u,
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
