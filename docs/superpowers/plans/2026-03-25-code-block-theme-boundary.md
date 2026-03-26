# Code Block Theme Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改现有 72 个代码主题文件的前提下，完成代码块 DOM 契约对齐、独立 `code block base` 层落地，并让 preview theme 退出 fenced code block 的直接视觉控制。

**Architecture:** 本次实现分成“先锁 DOM 契约、再新增结构层、再清理 preview theme 职责、最后做主题边界回归”四条主线。普通 fenced code block 改为标准 highlight.js DOM，`code block base` 承接结构与几何，preview theme 只保留正文排版与 inline code，现有代码主题继续只管 `.hljs` 与 token 皮肤。

**Tech Stack:** Vue 3、SCSS、markdown-it、highlight.js、Node `node:test`、ESLint、Vite 6

---

## File Map

### Create

- `wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss`
  - 新增独立代码块结构层，集中承接 `.pre-container`、工具栏、`pre > code.hljs` 结构、Mermaid 外壳与中立几何。
- `wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
  - 新增静态边界测试，专门锁定 `code block base`、preview theme 与 code theme 的职责边界。

### Modify

- `wj-markdown-editor-web/src/util/markdown-it/markdownItCodeBlock.js`
  - 调整 fenced code block DOM，使 `.hljs` 落到 `code` 元素，并固定 `language-*` class / 工具栏语言标签规则。
- `wj-markdown-editor-web/src/util/markdown-it/__tests__/markdownItCodeBlock.test.js`
  - 把现有复制按钮测试扩展为完整 DOM 契约测试，覆盖四种语言场景。
- `wj-markdown-editor-web/src/main.js`
  - 接入 `code-block-base.scss`，并明确静态导入顺序。
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
  - 移除 fenced code block 与 Mermaid 外壳相关协议变量，只保留正文与 inline code 语义。
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
  - 删除 fenced code block / `.pre-container` / Mermaid 外壳样式，只保留正文与 inline code。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/github.scss`
  - 删除 `.highlight`、`pre:not(.hljs)`、`pre > code` 等旧代码块回退皮肤。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/juejin.scss`
  - 删除代码块与 Mermaid 外壳变量，保留正文与 inline code 变量。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/vuepress.scss`
  - 删除代码块变量，保留正文与 inline code 变量。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/markdown-here.scss`
  - 删除 `pre code` 等代码块特例，保留正文与 inline code 变量。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/smart-blue.scss`
  - 删除代码块与 Mermaid 变量，保留正文与背景纹理人格。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/mk-cute.scss`
  - 删除代码块与 Mermaid 变量，保留正文与背景纹理人格。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/cyanosis.scss`
  - 删除 `pre > code` 与 fenced code block 相关选区规则，保留正文特例。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/scrolls.scss`
  - 删除 `pre`、`pre.mermaid` 等代码块特例，保留正文特例。
- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemePriorityArchitecture.test.js`
  - 去掉把 `pre` 当作 preview theme 基础职责的旧断言，补充 preview theme 禁止命中代码块结构的边界断言。
- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
  - 删除把 `.highlight`/`pre:not(.hljs)` 回退样式写死的旧断言，增加静态样式结构断言。
- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`
  - 删除 fenced code block / Mermaid 外壳变量覆盖要求，仅保留正文与 inline code 变量覆盖断言。

### Reuse

- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeGithubCleanup.test.js`
  - 继续承担 GitHub 主题历史清理断言，不新增本轮职责。
- `wj-markdown-editor-web/src/assets/style/__tests__/fixtures/preview-theme-regression.md`
  - 复用现有预览样本做人工验证，不额外扩展本轮样本范围。

## Execution Notes

- 仓库规则默认直接在当前分支开发；本计划假设后续执行仍在当前分支 `feat/preview-theme-variable-refactor` 上进行，除非用户额外要求切到新分支或 worktree。
- 所有命令默认在 `wj-markdown-editor-web/` 目录执行，除非步骤里单独标注仓库根目录。
- 本计划按 TDD 顺序编排：先补失败测试，再做最小实现，再验证通过，再小步提交。
- 样式职责重构会同时改动 CSS 与静态测试；不要先“删掉旧断言求绿灯”，必须先补新的边界断言再移动职责。
- 最终宣称完成前必须执行 `@superpowers:verification-before-completion`。

## Task 1: 锁定 fenced code block DOM 契约

**Files:**
- Modify: `wj-markdown-editor-web/src/util/markdown-it/__tests__/markdownItCodeBlock.test.js`
- Modify: `wj-markdown-editor-web/src/util/markdown-it/markdownItCodeBlock.js`

- [ ] **Step 1: 先把现有代码块测试扩展成四场景 DOM 契约测试**

在 `markdownItCodeBlock.test.js` 中保留现有“复制按钮可访问结构”断言，并新增以下场景：

```js
test('显式语言且可识别时，必须输出 code.hljs 和双 language class', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const html = md.render('```js\nconsole.log(1)\n```')

  assert.match(html, /<pre[^>]*><code class="[^"]*hljs[^"]*language-js[^"]*language-javascript/u)
  assert.equal(/<pre class="hljs"/u.test(html), false)
  assert.match(html, /pre-container-lang[^>]*>js</u)
  assert.equal(/class="[^"]*(?:relative|absolute|top-0|right-0)[^"]*"/u.test(html), false)
})

test('显式语言但未识别时，不得输出伪造的 language class，但仍显示原始标签', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const html = md.render('```custom-lang\nbody\n```')

  assert.match(html, /<code class="hljs"/u)
  assert.equal(/language-custom-lang/u.test(html), false)
  assert.match(html, /pre-container-lang[^>]*>custom-lang</u)
})

test('未显式语言但自动识别成功时，只输出检测出的 language class 且隐藏标签', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const html = md.render('```\nconst value = 1\n```')

  assert.match(html, /<code class="[^"]*hljs[^"]*language-/u)
  assert.equal(/pre-container-lang[^>]*>[^<]+</u.test(html), false)
})

test('未显式语言且自动识别失败时，只保留 hljs class 且隐藏标签', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const html = md.render('```\n@@@@\n```')

  assert.match(html, /<code class="hljs"/u)
  assert.equal(/language-/u.test(html), false)
  assert.equal(/pre-container-lang/u.test(html), false)
})
```

- [ ] **Step 2: 运行目标测试，确认当前实现先红灯**

Run:

```bash
npm run test:run -- src/util/markdown-it/__tests__/markdownItCodeBlock.test.js
```

Expected:

```text
FAIL，原因包括 `.hljs` 仍挂在 `<pre>`、缺少 `language-*` class、工具栏语言标签行为与新规则不一致
```

- [ ] **Step 3: 在 `markdownItCodeBlock.js` 中补最小语言元数据解析**

实现时先提炼一个单一职责 helper，例如：

```js
function resolveFenceLanguageMeta(rawInfo) {
  const rawLabel = rawInfo.trim()
  const normalizedInput = rawLabel.toLowerCase()

  if (!normalizedInput) {
    return {
      rawLabel: '',
      classNames: [],
      highlightLanguage: null,
      toolbarLabel: '',
    }
  }

  const registeredLanguage = hljs.getLanguage(normalizedInput)
  if (!registeredLanguage) {
    return {
      rawLabel,
      classNames: [],
      highlightLanguage: null,
      toolbarLabel: rawLabel,
    }
  }

  const canonicalKey = hljs.listLanguages()
    .find(key => hljs.getLanguage(key) === registeredLanguage)

  const classNames = new Set([`language-${normalizedInput}`])
  if (canonicalKey && canonicalKey !== normalizedInput) {
    classNames.add(`language-${canonicalKey}`)
  }

  return {
    rawLabel,
    classNames: [...classNames],
    highlightLanguage: normalizedInput,
    toolbarLabel: rawLabel,
  }
}
```

- [ ] **Step 4: 把普通 fenced code block DOM 改成标准 `pre > code.hljs` 结构**

实现方向：

```js
const detectedLanguage = highlightedResult.language
const codeClassName = ['hljs', ...languageClassNames].join(' ')

return html`
  <div class="pre-container">
    <div class="pre-container-toolbar">
      ${toolbarLabel ? `<div class="pre-container-lang">${toolbarLabel}</div>` : ''}
      <div class="i-tabler:copy pre-container-copy" role="button" tabindex="0" title="${COPY_CODE_LABEL}" aria-label="${COPY_CODE_LABEL}" onclick="copyCode('${encodedCode}')" onkeydown="${createCopyCodeKeydownHandler(encodedCode)}"></div>
    </div>
    <pre ${parseAttrs(token.attrs)}>
      <code class="${codeClassName}">${highlightedHtml}</code>
    </pre>
  </div>
`
```

注意事项：

- 显式语言场景保留用户原始 label 展示，只裁剪首尾空白，不改大小写。
- 自动识别场景只补 `language-${detectedKey}` class，不展示工具栏语言标签。
- 未识别显式语言场景不要伪造 `language-*` class。
- 不要继续在代码块外层和工具栏上保留 `relative`、`absolute`、`top-0`、`right-0` 这类结构性 UnoCSS utility class；结构定位统一交给 `code-block-base.scss`。

- [ ] **Step 5: 重新运行目标测试，确认 DOM 契约转绿**

Run:

```bash
npm run test:run -- src/util/markdown-it/__tests__/markdownItCodeBlock.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 6: 对本任务相关 JS 文件执行 ESLint 并提交**

```bash
npx eslint --fix src/util/markdown-it/markdownItCodeBlock.js src/util/markdown-it/__tests__/markdownItCodeBlock.test.js
git add src/util/markdown-it/markdownItCodeBlock.js src/util/markdown-it/__tests__/markdownItCodeBlock.test.js
git commit -m "refactor(web): normalize code block highlight dom"
```

## Task 2: 新增独立 `code block base` 层并接入入口

**Files:**
- Create: `wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss`
- Create: `wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
- Modify: `wj-markdown-editor-web/src/main.js`

- [ ] **Step 1: 先新增失败测试，锁定 `code block base` 的职责和导入顺序**

创建 `codeBlockThemeBoundary.test.js`，至少覆盖：

```js
test('main.js 必须在 preview-theme 之后接入 code-block-base', () => {
  const source = readSource('../../../main.js')

  assert.match(
    source,
    /import ['"]@\/assets\/style\/preview-theme\/preview-theme\.scss['"][\s\S]*import ['"]@\/assets\/style\/code-block\/code-block-base\.scss['"]/u,
  )
})

test('code-block-base 只允许承接结构和几何，不得定义 token 颜色或 code-theme 特化', () => {
  const source = readSource('../code-block/code-block-base.scss')

  assert.match(source, /\.pre-container/u)
  assert.match(source, /\.pre-container-toolbar/u)
  assert.match(source, /\.pre-container-copy/u)
  assert.match(source, /\.pre-container-lang/u)
  assert.match(source, /pre\.mermaid/u)
  assert.equal(/\.code-theme-/u.test(source), false)
  assert.equal(/\.hljs-keyword|\.hljs-string|\.hljs-comment/u.test(source), false)
})
```

- [ ] **Step 2: 运行新测试，确认先红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/codeBlockThemeBoundary.test.js
```

Expected:

```text
FAIL，原因包括 `code-block-base.scss` 尚不存在，且 `main.js` 还没接入独立结构层
```

- [ ] **Step 3: 创建 `code-block-base.scss`，只实现结构与中立几何**

实现方向：

```scss
.wj-preview-theme {
  --wj-code-block-radius: 8px;
  --wj-code-block-toolbar-gap: 4px;
  --wj-code-block-toolbar-offset: 8px;

  & :where(.pre-container) {
    position: relative;
    margin: 1em 0;
  }

  & :where(.pre-container-toolbar) {
    position: absolute;
    top: var(--wj-code-block-toolbar-offset);
    right: var(--wj-code-block-toolbar-offset);
    display: flex;
    gap: var(--wj-code-block-toolbar-gap);
    z-index: 1;
  }

  & :where(.pre-container pre) {
    margin: 0;
    overflow-x: auto;
    background: transparent;
  }

  & :where(.pre-container code.hljs) {
    display: block;
    border-radius: var(--wj-code-block-radius);
  }

  & :where(pre.mermaid, pre.mermaid-cache) {
    margin: 1em 0;
    padding: 1rem;
    text-align: center;
    border-radius: var(--wj-code-block-radius);
  }
}
```

关键约束：

- 可以定义结构、定位、圆角、外层间距。
- 不要定义 `.hljs` token 颜色。
- 不要写 `.code-theme-*` 分支。

- [ ] **Step 4: 在 `main.js` 中接入独立结构层**

在 `wj-markdown-editor-web/src/main.js` 中把导入顺序改成：

```js
import '@/assets/style/preview-theme/preview-theme.scss'
import '@/assets/style/code-block/code-block-base.scss'
```

动态代码主题仍由 `codeThemeUtil.js` 运行时注入，不要改其机制。

- [ ] **Step 5: 重新运行新测试，确认结构层转绿**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/codeBlockThemeBoundary.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 6: 对本任务相关 JS 测试和入口文件执行 ESLint 并提交**

```bash
npx eslint --fix src/main.js src/assets/style/__tests__/codeBlockThemeBoundary.test.js
git add src/main.js src/assets/style/code-block/code-block-base.scss src/assets/style/__tests__/codeBlockThemeBoundary.test.js
git commit -m "feat(web): add code block base layer"
```

## Task 3: 从 preview theme 协议和基础层移出 fenced code block 职责

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemePriorityArchitecture.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`

- [ ] **Step 1: 先修改测试，撤掉旧职责并补上新边界**

更新测试时，至少完成以下变化：

```js
// previewThemePriorityArchitecture.test.js
const requiredBaseSelectors = [
  '.wj-preview-theme :where(h1, h2, h3, h4, h5, h6)',
  '.wj-preview-theme :where(p)',
  '.wj-preview-theme :where(ul, ol)',
  '.wj-preview-theme :where(blockquote)',
  '.wj-preview-theme :where(table)',
  '.wj-preview-theme :where(:not(pre) > code, :not(pre) > tt, :not(pre) > samp)',
]
```

```js
// previewThemeStructure.test.js
test('preview-theme 基础层不得继续承接 fenced code block 或 mermaid 外壳', () => {
  const baseSource = readSource('../preview-theme/preview-theme-base.scss')

  assert.equal(/:where\(pre\)/u.test(baseSource), false)
  assert.equal(/\.pre-container/u.test(baseSource), false)
  assert.equal(/pre\.mermaid/u.test(baseSource), false)
})
```

```js
// previewThemeVariableCoverage.test.js
test('preview-theme contract 不得继续声明 code block 与 mermaid 外壳变量', () => {
  const source = readSource('../preview-theme/preview-theme-contract.scss')

  for (const variableName of [
    '--wj-preview-code-block-background-color',
    '--wj-preview-code-block-text-color',
    '--wj-preview-code-toolbar-background-color',
    '--wj-preview-mermaid-background-color',
  ]) {
    assert.equal(source.includes(`${variableName}:`), false)
  }
})
```

- [ ] **Step 2: 运行样式测试，确认当前实现先红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemePriorityArchitecture.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
FAIL，原因包括 contract/base 仍声明旧代码块变量和选择器，且旧测试语义尚未全部迁移
```

- [ ] **Step 3: 在 `preview-theme-contract.scss` 中删除 fenced code block / Mermaid 外壳协议**

移除以下变量族：

```scss
--wj-preview-pre-*
--wj-preview-code-block-*
--wj-preview-code-toolbar-*
--wj-preview-mermaid-*
```

保留：

- inline code 变量
- `kbd`
- 标题、列表、链接、引用、表格、脚注、`details`

注意不要顺手改正文变量命名；本任务只做职责切割，不做新的人格化重构。

- [ ] **Step 4: 在 `preview-theme-base.scss` 中只保留正文与 inline code**

删除或迁出以下块：

```scss
& :where(pre) { ... }
& :where(pre:not(.hljs)) { ... }
& :where(pre > code) { ... }
& :where(.pre-container) { ... }
& :where(.pre-container-copy, .pre-container-lang) { ... }
& :where(pre.mermaid, pre.mermaid-cache) { ... }
```

保留并继续由 preview theme 承担：

```scss
& :where(:not(pre) > code, :not(pre) > tt, :not(pre) > samp) { ... }
```

- [ ] **Step 5: 重新运行样式测试，确认 preview theme 边界转绿**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemePriorityArchitecture.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
PASS 或仅剩具体 theme 文件越界相关失败
```

- [ ] **Step 6: 对相关测试文件执行 ESLint 并提交**

```bash
npx eslint --fix src/assets/style/__tests__/previewThemePriorityArchitecture.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git add src/assets/style/preview-theme/preview-theme-contract.scss src/assets/style/preview-theme/preview-theme-base.scss src/assets/style/__tests__/previewThemePriorityArchitecture.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git commit -m "refactor(web): remove code block ownership from preview theme base"
```

## Task 4: 清理 8 个 preview theme 文件中的代码块直接控制

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/github.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/juejin.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/vuepress.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/markdown-here.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/smart-blue.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/mk-cute.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/cyanosis.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/scrolls.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`

- [ ] **Step 1: 先补 theme 级失败断言，锁定禁止范围**

在 `codeBlockThemeBoundary.test.js` 或现有样式测试中新增断言，至少覆盖：

```js
test('preview theme 文件不得继续命中 fenced code block 结构选择器', () => {
  for (const file of [
    'github',
    'juejin',
    'vuepress',
    'markdown-here',
    'smart-blue',
    'mk-cute',
    'cyanosis',
    'scrolls',
  ]) {
    const source = readSource(`../preview-theme/theme/${file}.scss`)

    assert.equal(/\.hljs/u.test(source), false)
    assert.equal(/\.pre-container/u.test(source), false)
    assert.equal(/pre\s*(?:>|\s)\s*code/u.test(source), false)
    assert.equal(/pre\.mermaid/u.test(source), false)
    assert.equal(/pre\s*(?:>|\s)\s*code[^,{]*::selection/u.test(source), false)
    assert.equal(/\.hljs[^,{]*::selection/u.test(source), false)
  }
})
```

并补一个变量约束：

```js
test('preview theme 文件不得继续声明 code block / mermaid 外壳变量', () => {
  const forbiddenVariablePatterns = [
    /--wj-preview-code-block-[a-z0-9-]+:/u,
    /--wj-preview-code-toolbar-[a-z0-9-]+:/u,
    /--wj-preview-mermaid-[a-z0-9-]+:/u,
  ]

  for (const file of [
    'github',
    'juejin',
    'vuepress',
    'markdown-here',
    'smart-blue',
    'mk-cute',
    'cyanosis',
    'scrolls',
  ]) {
    const source = readSource(`../preview-theme/theme/${file}.scss`)

    for (const variablePattern of forbiddenVariablePatterns) {
      assert.equal(variablePattern.test(source), false)
    }
  }
})
```

- [ ] **Step 2: 运行目标测试，确认 8 个主题先红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/codeBlockThemeBoundary.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
FAIL，原因包括 github / cyanosis / markdown-here / scrolls 仍保留直接代码块选择器，其余主题仍声明 code block / mermaid 外壳变量
```

- [ ] **Step 3: 删除 4 个重度越界主题的直接代码块选择器**

具体清理重点：

- `github.scss`
  - 删除 `.highlight`、`.highlight pre`、`pre:not(.hljs)`、`pre > code`、`code br`、`del code` 等代码块回退样式
- `cyanosis.scss`
  - 删除 `pre > code` 滚动条，以及 `pre > code::selection`、`.hljs::selection` 这类 fenced code block 相关选区规则
- `markdown-here.scss`
  - 删除 `pre code { white-space: pre; }`
- `scrolls.scss`
  - 删除 `pre` 与 `pre.mermaid/pre.mermaid-cache` 的代码块表面特例

不要在这一步补新的 preview theme 代码块样式；删除后由 `code-block-base.scss + code theme` 接管。

- [ ] **Step 4: 删除其余 8 个主题中的 code block / Mermaid 外壳变量**

从所有主题文件中移除：

```scss
--wj-preview-code-block-*
--wj-preview-code-toolbar-*
--wj-preview-mermaid-*
```

保留：

- inline code 变量
- 主题根背景纹理
- 正文结构变量

- [ ] **Step 5: 重新运行样式边界测试，确认 theme 文件转绿**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/codeBlockThemeBoundary.test.js src/assets/style/__tests__/previewThemePriorityArchitecture.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 6: 对相关测试文件执行 ESLint 并提交**

```bash
npx eslint --fix src/assets/style/__tests__/codeBlockThemeBoundary.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git add src/assets/style/preview-theme/theme/github.scss src/assets/style/preview-theme/theme/juejin.scss src/assets/style/preview-theme/theme/vuepress.scss src/assets/style/preview-theme/theme/markdown-here.scss src/assets/style/preview-theme/theme/smart-blue.scss src/assets/style/preview-theme/theme/mk-cute.scss src/assets/style/preview-theme/theme/cyanosis.scss src/assets/style/preview-theme/theme/scrolls.scss src/assets/style/__tests__/codeBlockThemeBoundary.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git commit -m "refactor(web): isolate code block styling from preview themes"
```

## Task 5: 做全链路验证并收尾

**Files:**
- Modify if needed: `wj-markdown-editor-web/src/util/markdown-it/markdownItCodeBlock.js`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemePriorityArchitecture.test.js`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`

- [ ] **Step 1: 跑完所有相关自动化测试**

Run:

```bash
npm run test:run -- src/util/markdown-it/__tests__/markdownItCodeBlock.test.js src/assets/style/__tests__/codeBlockThemeBoundary.test.js src/assets/style/__tests__/previewThemePriorityArchitecture.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js src/assets/style/__tests__/previewThemeGithubCleanup.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 2: 运行 Web 构建，确保静态导入顺序和 SCSS 改动不破坏打包**

Run:

```bash
npm run build
```

Expected:

```text
PASS，构建产物输出到 ../wj-markdown-editor-electron/web-dist
```

- [ ] **Step 3: 做人工回归，确认 preview theme 与 code theme 的职责切分成立**

Run:

```bash
npm run dev
```

如需覆盖 Electron 导出页，再在另一个终端进入 `wj-markdown-editor-electron/` 执行：

```bash
npm run start
```

Manual checklist:

- 切换 8 个 preview theme，观察 fenced code block 外观不再随 preview theme 改变。
- 切换多个 code theme，确认 fenced code block 背景、前景色、token 颜色随 code theme 改变。
- 切换 preview theme 时，inline code 仍随 preview theme 改变。
- 复制按钮和语言标签在编辑页、独立预览页、导出页都稳定可见，且复制仍可用。
- Mermaid 外壳不再带 preview theme 人格化差异，只保留统一结构层表现。
- `github` 主题不再依赖 `.highlight` / `pre:not(.hljs)` 回退皮肤。

- [ ] **Step 4: 如验证中出现小修，先补失败测试再收尾；否则跳过改码**

若发现问题，先写对应 failing test，再做最小修复。不要直接在视觉层补丁式回滚 preview theme 的代码块职责。

- [ ] **Step 5: 对最终改动执行 ESLint，并提交收尾 commit（仅当有后续修复时）**

```bash
npx eslint --fix src/util/markdown-it/markdownItCodeBlock.js src/util/markdown-it/__tests__/markdownItCodeBlock.test.js src/main.js src/assets/style/__tests__/codeBlockThemeBoundary.test.js src/assets/style/__tests__/previewThemePriorityArchitecture.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git add src/util/markdown-it/markdownItCodeBlock.js src/util/markdown-it/__tests__/markdownItCodeBlock.test.js src/main.js src/assets/style/code-block/code-block-base.scss src/assets/style/preview-theme src/assets/style/__tests__
git commit -m "test(web): verify code block theme boundaries"
```

若 Step 4 无任何修复，则不要创建空提交，直接进入最终交付说明。

## Review Gate

在开始实现前，派出一个只读 plan reviewer subagent 审阅：

- Plan: `docs/superpowers/plans/2026-03-25-code-block-theme-boundary.md`
- Spec: `docs/superpowers/specs/2026-03-25-code-block-theme-boundary-design.md`

审查重点：

- 计划是否完整覆盖 spec 中的三层职责、DOM 契约、样式组织、测试边界和验证要求。
- 任务拆分是否能让实现者在不修改 72 个代码主题源码的前提下推进。
- 是否避免把 Mermaid 外壳或 fenced code block 皮肤重新塞回 preview theme。
- 语言 class / 工具栏标签四场景规则是否在计划中有明确的可执行步骤。

## Done Criteria

- 普通 fenced code block 输出为标准 `pre > code.hljs` 结构。
- 显式语言、未知显式语言、自动识别成功、自动识别失败四种场景的 `language-*` class 与工具栏标签规则全部可测试。
- `code-block-base.scss` 成为 `.pre-container`、工具栏、Mermaid 外壳和统一几何的唯一静态承接层。
- preview theme contract / base / 8 个 theme 文件不再直接控制 fenced code block 皮肤。
- 现有代码主题在不修改源码的前提下重新稳定接管 `.hljs` 与 token 颜色。
- inline code 仍由 preview theme 控制。
- 相关自动化测试和 `npm run build` 全部通过。
