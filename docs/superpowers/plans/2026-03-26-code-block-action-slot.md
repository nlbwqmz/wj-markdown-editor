# Code Block Action Slot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在普通 fenced code block 中实现“右上角单槽位切换”交互，让语言标记默认显示、hover 或 focus-within 时切换为复制按钮，并让控件颜色随当前代码主题自适应。

**Architecture:** 本次实现分成三条主线：先锁定 DOM 与结构边界测试，再把 `code-block-base.scss` 从“两行 toolbar”改成“容器内部单槽位浮层”，最后通过运行时取色 helper 把控件颜色写入预览根节点变量。普通 fenced code block 继续走现有 markdown-it 渲染链路，Mermaid 分支保持独立不变，导出页不走特殊分支。

**Tech Stack:** Vue 3、SCSS、markdown-it、highlight.js、Node `node:test`、ESLint、Vite 6

---

## File Map

### Create

- `wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js`
  - 运行时读取 `.hljs` 计算样式并派生代码块右上角控件 CSS 变量，只负责结构层取色与变量同步，不参与 Markdown 渲染。
- `wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js`
  - 为取色派生与回退逻辑提供纯函数测试，避免把主题颜色策略绑死在 `MarkdownPreview.vue` 里。

### Modify

- `wj-markdown-editor-web/src/util/markdown-it/markdownItCodeBlock.js`
  - 在 toolbar 中新增单槽位包装节点，保留语言标记和复制按钮语义节点，移除固定正文语义色 utility class。
- `wj-markdown-editor-web/src/util/markdown-it/__tests__/markdownItCodeBlock.test.js`
  - 把当前 DOM 契约断言升级为“单槽位切换”结构断言，继续锁住复制按钮可访问性与 Mermaid 独立分支。
- `wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss`
  - 把代码块结构层从“两行 grid”改成“相对定位容器 + 右上角单槽位浮层”，并写入 hover / focus-within 切换、薄顶部安全带、长标签单行截断等规则。
- `wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
  - 删除旧的“两行 toolbar”硬约束，改成“单槽位结构、absolute toolbar 合法、结构层不碰 code theme/token 颜色、预览主题仍不得回流结构”的新边界断言。
- `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
  - 在预览根节点上同步代码块控件变量；主题加载完成和预览 DOM 刷新完成后都要刷新一次，确保不会采到旧主题颜色。

### Reuse

- `wj-markdown-editor-web/src/util/codeThemeUtil.js`
  - 继续负责代码主题动态加载，不改加载机制；实现阶段只复用其“主题已加载完成”的时序。
- `wj-markdown-editor-web/src/assets/style/code-theme/theme/*.scss`
  - 不修改任何现有代码主题文件，仅作为运行时取色来源。

## Execution Notes

- 所有命令默认在 `wj-markdown-editor-web/` 目录执行，除非步骤中单独标注仓库根目录。
- 本计划只覆盖当前已确认的“单槽位切换 + 运行时取色 + 结构测试翻新”，不要把 preview theme 其他职责重构混进本轮。
- 保持 TDD 顺序：先补失败测试，再做最小实现，再验证通过，再提交。
- 复制按钮默认态允许视觉隐藏，但必须保持可聚焦；实现时不得使用 `display: none`、`visibility: hidden`、`hidden` 或祖先 `aria-hidden="true"`。
- 最终宣称完成前必须执行 `@superpowers:verification-before-completion`。

## Task 1: 锁定单槽位 DOM 契约

**Files:**
- Modify: `wj-markdown-editor-web/src/util/markdown-it/__tests__/markdownItCodeBlock.test.js`
- Modify: `wj-markdown-editor-web/src/util/markdown-it/markdownItCodeBlock.js`

- [ ] **Step 1: 先把代码块 DOM 测试改成单槽位结构断言**

在 `markdownItCodeBlock.test.js` 中保留现有“复制按钮可访问结构”断言，并补上以下单槽位约束：

```js
test('显式语言代码块必须输出单槽位 toolbar 结构', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const html = md.render('```javascript\nconsole.log(1)\n```')

  assert.match(html, /pre-container-toolbar/u)
  assert.match(html, /pre-container-action-slot/u)
  assert.match(html, /pre-container-lang/u)
  assert.match(html, /pre-container-copy/u)
  assert.match(
    html,
    /pre-container-action-slot[\s\S]*pre-container-lang[\s\S]*pre-container-copy/u,
  )
})

test('显式语言代码块仍必须把原始语言文案渲染到标签节点', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const html = md.render('```TypeScript\nconst value = 1\n```')

  assert.match(html, />TypeScript<\/div>/u)
})

test('普通 fenced code block 不得再写死正文语义色 utility class', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const html = md.render('```js\nconsole.log(1)\n```')

  assert.equal(html.includes('var(--wj-markdown-text-secondary)'), false)
})
```

- [ ] **Step 2: 运行目标测试，确认当前实现先红灯**

Run:

```bash
npm run test:run -- src/util/markdown-it/__tests__/markdownItCodeBlock.test.js
```

Expected:

```text
FAIL，原因包括缺少 `pre-container-action-slot`，且当前 DOM 仍写死正文语义色 utility class
```

- [ ] **Step 3: 在 `markdownItCodeBlock.js` 中补最小结构改动**

实现时只做结构层所需的最小调整：

```js
function renderStandardCodeBlockHtml(token, encodedCode, languageMeta, md) {
  const preAttrs = parseAttrs(token.attrs)
  const escapedToolbarLabel = md.utils.escapeHtml(languageMeta.toolbarLangLabel)

  return html`
    <div class="pre-container">
      <div class="pre-container-toolbar">
        <div class="pre-container-action-slot">
          <div class="pre-container-lang ${languageMeta.toolbarLangHidden ? 'hidden' : ''}">
            ${escapedToolbarLabel}
          </div>
          <div
            class="pre-container-copy"
            role="button"
            tabindex="0"
            title="${COPY_CODE_LABEL}"
            aria-label="${COPY_CODE_LABEL}"
            onclick="copyCode('${encodedCode}')"
            onkeydown="${createCopyCodeKeydownHandler(encodedCode)}"
          ></div>
        </div>
      </div>
      <pre${preAttrs ? ` ${preAttrs}` : ''}>
        <code class="${languageMeta.codeClassName}">${languageMeta.highlightedValue}</code>
      </pre>
    </div>
  `
}
```

关键约束：

- 不改动 Mermaid 分支输出。
- 不改动复制按钮 `role/tabindex/title/aria-label/onclick/onkeydown` 契约。
- 只删除会把颜色写死到 DOM 的 utility class，颜色全部交给结构层变量。

- [ ] **Step 4: 重新运行目标测试，确认 DOM 契约转绿**

Run:

```bash
npm run test:run -- src/util/markdown-it/__tests__/markdownItCodeBlock.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 5: 对本任务相关文件执行 ESLint 并提交**

```bash
npx eslint --fix src/util/markdown-it/markdownItCodeBlock.js src/util/markdown-it/__tests__/markdownItCodeBlock.test.js
git add src/util/markdown-it/markdownItCodeBlock.js src/util/markdown-it/__tests__/markdownItCodeBlock.test.js
git commit -m "refactor(web): add code block action slot markup"
```

## Task 2: 翻新结构边界测试并落地单槽位浮层样式

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss`

- [ ] **Step 1: 先把结构边界测试从“两行 toolbar”改成“单槽位浮层”**

在 `codeBlockThemeBoundary.test.js` 中删除以下旧假设：

- `.pre-container` 必须 `display: grid`
- `grid-template-rows` 必须存在
- `.pre-container-toolbar` 不得 `position: absolute`
- `pre` 必须固定 `grid-row: 2`

改成以下新断言：

```js
test('code-block-base.scss 必须声明单槽位结构选择器', () => {
  const source = readSource('../code-block/code-block-base.scss')

  assert.match(source, /\.pre-container-toolbar/u)
  assert.match(source, /\.pre-container-action-slot/u)
  assert.match(source, /\.pre-container-lang/u)
  assert.match(source, /\.pre-container-copy/u)
})

test('code-block-base.scss 的工具栏允许绝对定位，但不得退回独立 toolbar 行', () => {
  const source = readSource('../code-block/code-block-base.scss')
  const toolbarBlock = getSelectorBlockRange(getSelectorBlockRange(source, '.wj-preview-theme').blockSource, ':where(.pre-container-toolbar)').blockSource

  assert.match(toolbarBlock, /position\s*:\s*absolute/u)
  assert.doesNotMatch(toolbarBlock, /grid-row\s*:/u)
})

test('code-block-base.scss 必须通过 hover 与 focus-within 切换语言标记和复制按钮', () => {
  const source = readSource('../code-block/code-block-base.scss')

  assert.match(source, /:hover/u)
  assert.match(source, /:focus-within/u)
  assert.doesNotMatch(source, /visibility\s*:\s*hidden/u)
})
```

- [ ] **Step 2: 运行目标测试，确认当前样式先红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/codeBlockThemeBoundary.test.js
```

Expected:

```text
FAIL，原因包括旧测试假设和当前 `code-block-base.scss` 仍然是两行 grid
```

- [ ] **Step 3: 在 `code-block-base.scss` 中把结构层改成单容器浮层**

按下面方向做最小实现：

```scss
.wj-preview-theme {
  --wj-code-block-base-block-margin: 1em 0;
  --wj-code-block-base-border-radius: 8px;
  --wj-code-block-action-slot-inset-block: 6px;
  --wj-code-block-action-slot-inset-inline: 8px;
  --wj-code-block-action-slot-height: 20px;
  --wj-code-block-action-slot-inline-padding: 8px;

  :where(.pre-container) {
    position: relative;
    overflow: hidden;
    margin: var(--wj-code-block-base-block-margin);
    border-radius: var(--wj-code-block-base-border-radius);
  }

  :where(.pre-container-toolbar) {
    position: absolute;
    top: var(--wj-code-block-action-slot-inset-block);
    right: var(--wj-code-block-action-slot-inset-inline);
    z-index: 1;
    pointer-events: none;
  }

  :where(.pre-container-action-slot) {
    display: grid;
    align-items: center;
    min-height: var(--wj-code-block-action-slot-height);
    max-width: calc(100% - 16px);
    padding-inline: var(--wj-code-block-action-slot-inline-padding);
    border-radius: 999px;
    color: var(--wj-code-block-action-fg-muted);
    background: var(--wj-code-block-action-bg);
    border: 1px solid var(--wj-code-block-action-border);
    box-shadow: var(--wj-code-block-action-shadow);
  }

  :where(.pre-container-lang, .pre-container-copy) {
    grid-area: 1 / 1;
    white-space: nowrap;
    transition: opacity 0.16s ease, transform 0.16s ease;
  }

  :where(.pre-container-copy) {
    opacity: 0;
    pointer-events: none;
  }

  :where(.pre-container:is(:hover, :focus-within) .pre-container-lang) {
    opacity: 0;
    pointer-events: none;
  }

  :where(.pre-container:is(:hover, :focus-within) .pre-container-copy) {
    opacity: 1;
    pointer-events: auto;
    color: var(--wj-code-block-action-fg);
  }

  :where(.pre-container-copy:focus-visible) {
    outline: 1px solid var(--wj-code-block-action-fg);
    outline-offset: 2px;
  }
}
```

关键约束：

- 不再保留独立 toolbar 行高度。
- 语言标签必须单行，不允许换行增高。
- 不写 `.code-theme-*` 分支，不写 `.hljs-*` token 颜色。
- 不使用 `display: none`、`visibility: hidden` 破坏键盘路径。
- 必须在结构层中实际消费 `--wj-code-block-action-*` 变量，不能只在运行时写变量而不接入样式。
- 必须提供键盘 focus-visible 反馈，且颜色同样来自 `--wj-code-block-action-*` 变量。

- [ ] **Step 4: 调整长代码与安全带细节，确保不互相遮挡**

在结构层中补充以下细节：

- `pre` 继续是主滚动层，不能因为 action slot 改成新的滚动容器。
- action slot 的 `max-width` 需要避免顶满整行。
- 如果第一轮样式在长代码场景仍会压到首行，只允许做很小的顶部补偿，不得退回整行 toolbar。

建议实现片段：

```scss
:where(.pre-container pre) {
  margin: 0;
  min-width: 0;
  overflow: auto;
  border-radius: inherit;
}

:where(.pre-container-action-slot) {
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 5: 重新运行边界测试，确认结构层转绿**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/codeBlockThemeBoundary.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 6: 对本任务相关文件执行 ESLint 并提交**

```bash
npx eslint --fix src/assets/style/__tests__/codeBlockThemeBoundary.test.js
git add src/assets/style/code-block/code-block-base.scss src/assets/style/__tests__/codeBlockThemeBoundary.test.js
git commit -m "feat(web): switch code block toolbar to action slot overlay"
```

## Task 3: 用独立 helper 实现代码主题自适应取色

**Files:**
- Create: `wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js`
- Create: `wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`

- [ ] **Step 1: 先为取色 helper 写纯函数测试**

创建 `codeBlockActionStyleUtil.test.js`，先锁住派生结果和回退行为：

```js
import assert from 'node:assert/strict'

import {
  deriveCodeBlockActionVariables,
  syncCodeBlockActionVariables,
} from '../codeBlockActionStyleUtil.js'

test('能从合法的 hljs 前景和背景派生结构层变量', () => {
  const vars = deriveCodeBlockActionVariables({
    color: 'rgb(36, 41, 46)',
    backgroundColor: 'rgb(255, 255, 255)',
    backgroundImage: 'none',
  })

  assert.equal(typeof vars['--wj-code-block-action-fg'], 'string')
  assert.equal(typeof vars['--wj-code-block-action-bg'], 'string')
  assert.equal(typeof vars['--wj-code-block-action-border'], 'string')
})

test('背景透明或采样失败时必须回退到安全值', () => {
  const vars = deriveCodeBlockActionVariables({
    color: '',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
  })

  assert.equal(vars['--wj-code-block-action-fg'].length > 0, true)
  assert.equal(vars['--wj-code-block-action-bg'].length > 0, true)
})

test('同步函数在重复调用时必须用最新 hljs 样式覆盖旧变量', () => {
  const styleStore = new Map()
  const previewRoot = {
    querySelector(selector) {
      return selector === '.hljs' ? {} : null
    },
    style: {
      setProperty(key, value) {
        styleStore.set(key, value)
      },
      getPropertyValue(key) {
        return styleStore.get(key) ?? ''
      },
    },
  }

  syncCodeBlockActionVariables(previewRoot, {
    getComputedStyle: () => ({
      color: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(28, 27, 27)',
      backgroundImage: 'none',
    }),
  })

  const firstValue = previewRoot.style.getPropertyValue('--wj-code-block-action-fg')

  syncCodeBlockActionVariables(previewRoot, {
    getComputedStyle: () => ({
      color: 'rgb(36, 41, 46)',
      backgroundColor: 'rgb(255, 255, 255)',
      backgroundImage: 'none',
    }),
  })

  assert.notEqual(
    previewRoot.style.getPropertyValue('--wj-code-block-action-fg'),
    firstValue,
  )
})
```

- [ ] **Step 2: 运行 helper 测试，确认先红灯**

Run:

```bash
npm run test:run -- src/util/__tests__/codeBlockActionStyleUtil.test.js
```

Expected:

```text
FAIL，原因包括 helper 文件尚不存在
```

- [ ] **Step 3: 实现纯函数 helper，并把变量键名固定下来**

在 `codeBlockActionStyleUtil.js` 中先实现纯函数，再实现 DOM 同步函数：

```js
const ACTION_VARIABLE_DEFAULTS = {
  '--wj-code-block-action-fg': 'rgba(255, 255, 255, 0.92)',
  '--wj-code-block-action-fg-muted': 'rgba(255, 255, 255, 0.72)',
  '--wj-code-block-action-bg': 'rgba(0, 0, 0, 0.16)',
  '--wj-code-block-action-border': 'rgba(255, 255, 255, 0.16)',
  '--wj-code-block-action-shadow': '0 1px 2px rgba(0, 0, 0, 0.18)',
}

export function deriveCodeBlockActionVariables(snapshot) {
  // 只在这里处理明暗、透明背景、轻实体底色和边框回退
}

export function syncCodeBlockActionVariables(previewRoot, options = {}) {
  const getComputedStyleImpl = options.getComputedStyle ?? window.getComputedStyle.bind(window)
  const hljsElement = previewRoot?.querySelector('.hljs')
  const styleSnapshot = hljsElement ? getComputedStyleImpl(hljsElement) : null
  const variables = deriveCodeBlockActionVariables({
    color: styleSnapshot?.color ?? '',
    backgroundColor: styleSnapshot?.backgroundColor ?? '',
    backgroundImage: styleSnapshot?.backgroundImage ?? 'none',
  })

  Object.entries(variables).forEach(([key, value]) => {
    previewRoot.style.setProperty(key, value)
  })
}
```

关键约束：

- helper 自己决定回退色，不把回退逻辑散落到 Vue 组件中。
- 只派生结构层颜色变量，不去操作 `.hljs` 或 token 样式。
- `syncCodeBlockActionVariables()` 必须是幂等的，重复调用时用最新主题样式覆盖旧变量。
- helper 的测试样例必须保持纯 Node 可运行，不依赖 `document`、`jsdom` 或额外 DOM 测试环境。

- [ ] **Step 4: 把 helper 接入 `MarkdownPreview.vue` 的主题与刷新时序**

在 `MarkdownPreview.vue` 中做以下改动：

1. 给当前预览根节点加一个专用 ref，例如 `previewShellRef`。
2. 在 `loadCodeTheme(newTheme)` 完成后触发一次变量同步。
3. 在 `refreshPreview()` 完成 DOM 更新、Mermaid settle 之后，再触发一次变量同步。

建议实现方向：

```vue
<script setup>
import { syncCodeBlockActionVariables } from '@/util/codeBlockActionStyleUtil.js'

const previewShellRef = ref()

function refreshCodeBlockActionVariables() {
  syncCodeBlockActionVariables(previewShellRef.value)
}

watch(() => props.codeTheme, async (newTheme) => {
  if (newTheme) {
    await loadCodeTheme(newTheme)
    refreshCodeBlockActionVariables()
  }
}, { immediate: true })

async function refreshPreview(doc, forceRefreshMermaid = false) {
  // ...现有逻辑
  updateDOM(previewRef.value, tempElement)
  await settleMermaidRender(...)
  refreshCodeBlockActionVariables()
  emits('refreshComplete')
}
</script>

<template>
  <div
    ref="previewShellRef"
    class="wj-preview-theme ..."
    :class="`code-theme-${codeTheme} preview-theme-${previewTheme}`"
  >
```

关键约束：

- 变量必须写到 `MarkdownPreview.vue` 当前预览根节点，不写全局 `document.body`。
- 不改动 `codeThemeUtil.js` 的加载机制。
- 不让 helper 直接依赖组件状态。
- 主题切换和内容刷新两条链路都必须调用变量同步，不能只覆盖其中一条。

- [ ] **Step 5: 重新运行 helper 测试并补跑关键 DOM 测试**

Run:

```bash
npm run test:run -- src/util/__tests__/codeBlockActionStyleUtil.test.js src/util/markdown-it/__tests__/markdownItCodeBlock.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 6: 对本任务相关文件执行 ESLint 并提交**

```bash
npx eslint --fix src/util/codeBlockActionStyleUtil.js src/util/__tests__/codeBlockActionStyleUtil.test.js src/components/editor/MarkdownPreview.vue
git add src/util/codeBlockActionStyleUtil.js src/util/__tests__/codeBlockActionStyleUtil.test.js src/components/editor/MarkdownPreview.vue
git commit -m "feat(web): sync code block action colors from hljs theme"
```

## Task 4: 做全链路验证并收尾

**Files:**
- Modify if needed: `wj-markdown-editor-web/src/util/markdown-it/markdownItCodeBlock.js`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss`
- Modify if needed: `wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js`
- Modify if needed: `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- Modify if needed: `wj-markdown-editor-web/src/util/markdown-it/__tests__/markdownItCodeBlock.test.js`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
- Modify if needed: `wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js`

- [ ] **Step 1: 跑完所有相关自动化测试**

Run:

```bash
npm run test:run -- src/util/markdown-it/__tests__/markdownItCodeBlock.test.js src/assets/style/__tests__/codeBlockThemeBoundary.test.js src/util/__tests__/codeBlockActionStyleUtil.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 2: 运行 Web 构建，确认 SCSS 与 Vue 改动不破坏打包**

Run:

```bash
npm run build
```

Expected:

```text
PASS，构建产物输出到 ../wj-markdown-editor-electron/web-dist
```

- [ ] **Step 3: 做人工回归，确认交互、颜色和导出页行为都符合 spec**

Run:

```bash
npm run dev
```

如需覆盖 Electron 导出页，再在另一个终端进入 `wj-markdown-editor-electron/` 执行：

```bash
npm run start
```

Manual checklist:

- 显式语言代码块默认只显示右上角语言标记。
- 鼠标 hover 代码块时，语言标记隐藏，复制按钮在同一位置显示。
- 用 Tab 聚焦复制按钮时，即使没有 hover，也会切到复制按钮可见态。
- 检查复制按钮及其祖先链路，确认没有引入 `aria-hidden="true"`。
- 深色和浅色 code theme 下，语言标记与复制图标都不会和背景撞色。
- 至少选一个复杂背景主题（如 `brown-paper` 或 `pojoaque`）确认实体槽位仍可辨认。
- 长代码、长语言标记时，右上角槽位不会把正文首行压乱，也不会撑出一整行 toolbar。
- 导出页不做任何特判时，默认只显示语言标记。
- Mermaid 代码块仍然不输出 toolbar / copy 结构。

- [ ] **Step 4: 如人工回归发现问题，先补失败测试再做最小修复；否则跳过改码**

只允许围绕本轮 spec 修正：

- 单槽位切换
- 结构层 hover / focus-within
- 运行时取色回退
- 长代码和长标签避让

不要把问题回滚成旧的“两行 toolbar”模型。

- [ ] **Step 5: 对最终改动执行 ESLint，并在有后续修复时补最后一个提交**

```bash
npx eslint --fix src/util/markdown-it/markdownItCodeBlock.js src/util/markdown-it/__tests__/markdownItCodeBlock.test.js src/assets/style/__tests__/codeBlockThemeBoundary.test.js src/assets/style/code-block/code-block-base.scss src/util/codeBlockActionStyleUtil.js src/util/__tests__/codeBlockActionStyleUtil.test.js src/components/editor/MarkdownPreview.vue
git add src/util/markdown-it/markdownItCodeBlock.js src/util/markdown-it/__tests__/markdownItCodeBlock.test.js src/assets/style/__tests__/codeBlockThemeBoundary.test.js src/assets/style/code-block/code-block-base.scss src/util/codeBlockActionStyleUtil.js src/util/__tests__/codeBlockActionStyleUtil.test.js src/components/editor/MarkdownPreview.vue
git commit -m "test(web): verify code block action slot behavior"
```

若 Step 4 没有新增修复，则不要创建空提交，直接进入完成说明。

## Review Gate

在开始实现前，派出一个只读 plan reviewer subagent 审阅：

- Plan: `docs/superpowers/plans/2026-03-26-code-block-action-slot.md`
- Spec: `docs/superpowers/specs/2026-03-26-code-block-action-slot-design.md`

审查重点：

- 计划是否完整覆盖 spec 中的单槽位结构、运行时取色、可访问性限制、长代码避让与导出页无特判。
- 任务是否足够细，执行者能否按 TDD 顺序直接推进。
- 是否错误地把颜色策略写回 72 个 code theme 文件，或把逻辑散回 preview theme。
- 是否明确禁止 `display: none` / `visibility: hidden` / `aria-hidden` 这类会破坏键盘路径的实现。

## Done Criteria

- `markdownItCodeBlock.js` 输出包含 `pre-container-action-slot` 的单槽位 DOM。
- `code-block-base.scss` 已从独立 toolbar 行切换为容器内部右上角浮层。
- 语言标记默认显示，hover / focus-within 时同位置切换为复制按钮。
- 结构层颜色来自运行时 `.hljs` 取色并写入预览根节点变量。
- 复制按钮默认视觉隐藏但仍保持可聚焦，未使用破坏可访问性的隐藏手段。
- 长代码与长语言标签场景下，右上角槽位不会与正文互相遮挡，也不会抬出一整行 toolbar。
- 导出页不做特殊分支即可自然只显示语言标记。
- 相关自动化测试、`npm run build` 和人工回归全部通过。
