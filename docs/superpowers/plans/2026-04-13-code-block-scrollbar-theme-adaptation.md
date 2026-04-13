# 代码块滚动条按代码主题背景自适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让预览区 fenced code block 的滚动条滑块根据当前代码主题背景色自动适配，同时保持轨道透明且不影响全局滚动条与编辑器滚动条。

**Architecture:** 继续复用 `MarkdownPreview.vue -> syncCodeBlockActionVariables() -> codeBlockActionStyleUtil.js` 的运行时采样链路，在同一次 `.hljs` 计算样式读取中新增代码块滚动条变量派生；结构层样式只在 `code-block-base.scss` 的 `.wj-preview-theme :where(.pre-container pre)` 作用域内局部消费这些变量。测试分为 util 行为测试和 SCSS 结构边界测试两层，先写失败用例，再做最小实现。

**Tech Stack:** Vue 3、SCSS、Node `node:test`、项目现有代码块主题变量派生工具

---

### Task 1: 为代码块滚动条变量补 util 失败测试

**Files:**
- Modify: `wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js`

- [ ] **Step 1: 写出失败测试，要求 util 派生滚动条变量**

```js
test('能从合法的 hljs 前景和背景派生代码块滚动条变量', () => {
  const { deriveCodeBlockActionVariables } = requireCodeBlockActionStyleUtil()
  const vars = deriveCodeBlockActionVariables({
    color: 'rgb(36, 41, 46)',
    backgroundColor: 'rgb(255, 255, 255)',
    backgroundImage: 'none',
  })

  assert.equal(typeof vars['--wj-code-block-scrollbar-thumb-bg'], 'string')
  assert.equal(typeof vars['--wj-code-block-scrollbar-thumb-bg-hover'], 'string')
  assert.equal(typeof vars['--wj-code-block-scrollbar-thumb-bg-active'], 'string')
})
```

- [ ] **Step 2: 运行测试并确认它先失败**

Run: `npm run test:run -- src/util/__tests__/codeBlockActionStyleUtil.test.js`
Expected: FAIL，提示缺少 `--wj-code-block-scrollbar-thumb-*` 变量断言。

- [ ] **Step 3: 再写失败测试，约束透明背景必须回退默认滚动条变量**

```js
test('背景透明或采样失败时代码块滚动条变量必须回退到安全值', () => {
  const { deriveCodeBlockActionVariables } = requireCodeBlockActionStyleUtil()
  const vars = deriveCodeBlockActionVariables({
    color: '',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
  })

  assert.equal(vars['--wj-code-block-scrollbar-thumb-bg'], 'rgba(255, 255, 255, 0.32)')
  assert.equal(vars['--wj-code-block-scrollbar-thumb-bg-hover'], 'rgba(255, 255, 255, 0.44)')
  assert.equal(vars['--wj-code-block-scrollbar-thumb-bg-active'], 'rgba(255, 255, 255, 0.56)')
})
```

- [ ] **Step 4: 再运行一次测试并确认仍然按预期失败**

Run: `npm run test:run -- src/util/__tests__/codeBlockActionStyleUtil.test.js`
Expected: FAIL，仍由新增滚动条变量断言触发，而不是语法错误或导入错误。

- [ ] **Step 5: 提交测试基线**

```bash
git add wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js
git commit -m "test(web): add failing code block scrollbar variable tests"
```

### Task 2: 为代码块滚动条作用域补 SCSS 结构失败测试

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js`

- [ ] **Step 1: 写出失败测试，要求 code-block-base.scss 在代码块 pre 作用域内声明局部滚动条规则**

```js
test('code-block-base.scss 必须仅在代码块 pre 作用域内声明局部滚动条规则', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')
  const previewThemeScopeBlock = getSelectorBlockRange(codeBlockBaseSource, '.wj-preview-theme').blockSource
  const preBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container pre)').blockSource

  assert.match(preBlock, /&::-webkit-scrollbar\s*\{/u)
  assert.match(preBlock, /&::-webkit-scrollbar-track\s*\{/u)
  assert.match(preBlock, /&::-webkit-scrollbar-corner\s*\{/u)
  assert.match(preBlock, /&::-webkit-scrollbar-thumb\s*\{/u)
})
```

- [ ] **Step 2: 写出失败测试，要求代码块滚动条只消费局部变量且轨道透明**

```js
test('code-block-base.scss 的代码块滚动条必须保持透明轨道并消费局部变量', () => {
  const codeBlockBaseSource = readSource('../code-block/code-block-base.scss')
  const previewThemeScopeBlock = getSelectorBlockRange(codeBlockBaseSource, '.wj-preview-theme').blockSource
  const preBlock = getSelectorBlockRange(previewThemeScopeBlock, ':where(.pre-container pre)').blockSource
  const trackBlock = getSelectorBlockRange(preBlock, '&::-webkit-scrollbar-track').blockSource
  const cornerBlock = getSelectorBlockRange(preBlock, '&::-webkit-scrollbar-corner').blockSource
  const thumbBlock = getSelectorBlockRange(preBlock, '&::-webkit-scrollbar-thumb').blockSource

  assert.match(trackBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(cornerBlock, /background-color\s*:\s*transparent\s*;/u)
  assert.match(thumbBlock, /var\(--wj-code-block-scrollbar-thumb-bg\)/u)
  assert.doesNotMatch(preBlock, /&::-webkit-scrollbar:hover/u)
})
```

- [ ] **Step 3: 运行测试并确认它先失败**

Run: `npm run test:run -- src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
Expected: FAIL，提示 `:where(.pre-container pre)` 代码块中缺少局部滚动条规则或缺少局部变量消费。

- [ ] **Step 4: 提交测试基线**

```bash
git add wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js
git commit -m "test(web): add failing code block scrollbar style boundary tests"
```

### Task 3: 最小扩展 util 的默认值与颜色派生逻辑

**Files:**
- Modify: `wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js`
- Test: `wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js`

- [ ] **Step 1: 先扩展默认变量，加入代码块滚动条安全回退值**

```js
const ACTION_VARIABLE_DEFAULTS = Object.freeze({
  '--wj-code-block-action-fg': 'rgba(255, 255, 255, 0.92)',
  '--wj-code-block-action-fg-muted': 'rgba(255, 255, 255, 0.72)',
  '--wj-code-block-action-bg': 'rgba(0, 0, 0, 0.16)',
  '--wj-code-block-action-border': 'rgba(255, 255, 255, 0.16)',
  '--wj-code-block-action-shadow': '0 1px 2px rgba(0, 0, 0, 0.18)',
  '--wj-code-block-scrollbar-thumb-bg': 'rgba(255, 255, 255, 0.32)',
  '--wj-code-block-scrollbar-thumb-bg-hover': 'rgba(255, 255, 255, 0.44)',
  '--wj-code-block-scrollbar-thumb-bg-active': 'rgba(255, 255, 255, 0.56)',
})
```

- [ ] **Step 2: 在颜色派生结果中加入滚动条变量**

```js
  const scrollbarWeight = isDarkBackground ? 0.36 : 0.7
  const scrollbarHoverWeight = isDarkBackground ? 0.48 : 0.78
  const scrollbarActiveWeight = isDarkBackground ? 0.6 : 0.86

  return {
    '--wj-code-block-action-fg': toRgbaText(textColor, 0.92),
    '--wj-code-block-action-fg-muted': toRgbaText(textColor, 0.72),
    '--wj-code-block-action-bg': toRgbaText(mixColor(backgroundColor, overlayBaseColor, backgroundWeight, 0.94)),
    '--wj-code-block-action-border': toRgbaText(mixColor(backgroundColor, overlayBaseColor, borderWeight, 0.92)),
    '--wj-code-block-action-shadow': shadow,
    '--wj-code-block-scrollbar-thumb-bg': toRgbaText(mixColor(backgroundColor, overlayBaseColor, scrollbarWeight, isDarkBackground ? 0.42 : 0.34)),
    '--wj-code-block-scrollbar-thumb-bg-hover': toRgbaText(mixColor(backgroundColor, overlayBaseColor, scrollbarHoverWeight, isDarkBackground ? 0.56 : 0.48)),
    '--wj-code-block-scrollbar-thumb-bg-active': toRgbaText(mixColor(backgroundColor, overlayBaseColor, scrollbarActiveWeight, isDarkBackground ? 0.68 : 0.58)),
  }
```

- [ ] **Step 3: 运行 util 测试并确认通过**

Run: `npm run test:run -- src/util/__tests__/codeBlockActionStyleUtil.test.js`
Expected: PASS，新增滚动条变量断言全部通过。

- [ ] **Step 4: 如有必要，再补一个重复同步覆盖断言**

```js
assert.notEqual(
  previewRoot.style.getPropertyValue('--wj-code-block-scrollbar-thumb-bg'),
  firstScrollbarValue,
)
```

- [ ] **Step 5: 再运行 util 测试确认保持全绿**

Run: `npm run test:run -- src/util/__tests__/codeBlockActionStyleUtil.test.js`
Expected: PASS，无新增失败。

- [ ] **Step 6: 提交 util 实现**

```bash
git add wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js
git commit -m "feat(web): derive code block scrollbar variables from theme background"
```

### Task 4: 在代码块结构层局部应用滚动条变量

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js`

- [ ] **Step 1: 在 `.pre-container pre` 中新增局部滚动条规则**

```scss
  :where(.pre-container pre) {
    margin: 0;
    min-width: 0;
    overflow: auto;
    border-radius: inherit;

    &::-webkit-scrollbar {
      width: 8px;
      height: 8px;
      background-color: transparent;
    }

    &::-webkit-scrollbar-track {
      background-color: transparent;
    }

    &::-webkit-scrollbar-corner {
      background-color: transparent;
    }

    &::-webkit-scrollbar-thumb {
      border: 2px solid transparent;
      border-radius: 999px;
      background-color: var(--wj-code-block-scrollbar-thumb-bg);
      background-clip: content-box;
    }

    &::-webkit-scrollbar-thumb:hover {
      background-color: var(--wj-code-block-scrollbar-thumb-bg-hover);
    }

    &::-webkit-scrollbar-thumb:active {
      background-color: var(--wj-code-block-scrollbar-thumb-bg-active);
    }
  }
```

- [ ] **Step 2: 运行样式结构测试并确认通过**

Run: `npm run test:run -- src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
Expected: PASS，新增代码块滚动条局部规则断言全部通过。

- [ ] **Step 3: 运行 util 测试，确认结构样式修改没有影响既有变量测试**

Run: `npm run test:run -- src/util/__tests__/codeBlockActionStyleUtil.test.js`
Expected: PASS，滚动条变量与 action 变量断言保持通过。

- [ ] **Step 4: 提交结构层实现**

```bash
git add wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js
git commit -m "feat(web): scope code block scrollbar styling to preview pre"
```

### Task 5: 格式化并做最终验证

**Files:**
- Modify: `wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js`
- Modify: `wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js`

- [ ] **Step 1: 对本次修改文件执行包内 ESLint 格式化**

Run: `npx eslint --fix src/util/codeBlockActionStyleUtil.js src/util/__tests__/codeBlockActionStyleUtil.test.js src/assets/style/code-block/code-block-base.scss src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
Expected: exit 0，文件被格式化且无报错。

- [ ] **Step 2: 运行本次相关测试集合**

Run: `npm run test:run -- src/util/__tests__/codeBlockActionStyleUtil.test.js src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
Expected: PASS，相关测试全绿。

- [ ] **Step 3: 如需补充一次更接近实际加载路径的验证，运行 MarkdownPreview 相关 Vitest**

Run: `npm run test:run -- src/components/editor/__tests__/markdownPreviewContextMenuRuntime.vitest.test.js`
Expected: PASS，确认 `syncCodeBlockActionVariables` 现有调用入口未被破坏。

- [ ] **Step 4: 查看最终差异并确认只涉及本次范围**

Run: `git diff -- docs/superpowers/specs/2026-04-13-code-block-scrollbar-theme-adaptation-design.md docs/superpowers/plans/2026-04-13-code-block-scrollbar-theme-adaptation.md wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js`
Expected: diff 只包含设计、计划、滚动条变量、结构层样式与对应测试。

- [ ] **Step 5: 最终提交**

```bash
git add docs/superpowers/specs/2026-04-13-code-block-scrollbar-theme-adaptation-design.md docs/superpowers/plans/2026-04-13-code-block-scrollbar-theme-adaptation.md wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js
git commit -m "feat(web): adapt code block scrollbar colors to code theme backgrounds"
```
