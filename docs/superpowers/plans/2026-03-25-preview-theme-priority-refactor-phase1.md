# Preview Theme Priority Refactor Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改预览主题对外名称和配置值的前提下，修复预览主题基础层的整体优先级，让预览主题结构样式统一高于 reset，并为第二阶段视觉校准建立稳定基础。

**Architecture:** 第一阶段不做主题视觉重设计，只做“稳定根类 + 基础层提权 + 主题根选择器统一”三件事。核心做法是在 `MarkdownPreview` 根容器增加稳定的预览主题类，由合同层、基础层和 8 个主题文件围绕该根类重建作用域，使基础层结构规则不再因 `:where(...)` 根作用域而输给 AntD reset。

**Tech Stack:** Vue 3、SCSS、Vite 6、Node `node:test`、ESLint

---

## File Map

### Create

- `docs/superpowers/specs/2026-03-25-preview-theme-priority-refactor-phase1-spec.md`
  - 记录第一阶段仅处理优先级架构问题的范围与验收标准。
- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemePriorityArchitecture.test.js`
  - 验证稳定根类、基础层根选择器和主题根选择器收口。

### Modify

- `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
  - 为预览主题根容器增加稳定类 `wj-preview-theme`。
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
  - 将变量协议根作用域改为稳定根类。
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
  - 将基础骨架的根作用域改为稳定根类，并保留后代 `:where(...)`。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/github.scss`
  - 将主题变量入口、暗黑模式覆盖和主题特例统一挂到稳定根类。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/juejin.scss`
  - 将主题变量入口、暗黑模式覆盖和主题特例统一挂到稳定根类。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/vuepress.scss`
  - 将主题变量入口、暗黑模式覆盖和主题特例统一挂到稳定根类。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/markdown-here.scss`
  - 将主题变量入口、暗黑模式覆盖和主题特例统一挂到稳定根类。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/smart-blue.scss`
  - 将主题变量入口、暗黑模式覆盖和主题特例统一挂到稳定根类。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/mk-cute.scss`
  - 将主题变量入口、暗黑模式覆盖和主题特例统一挂到稳定根类。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/cyanosis.scss`
  - 将主题变量入口、暗黑模式覆盖和主题特例统一挂到稳定根类。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/scrolls.scss`
  - 将主题变量入口、暗黑模式覆盖和主题特例统一挂到稳定根类。
- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
  - 如有必要，补充入口层级断言，确保 contract/base/theme 三层未被回退。
- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`
  - 如有必要，补充对 8 个主题统一根选择器的覆盖断言。

### Reuse

- `wj-markdown-editor-web/src/assets/style/__tests__/fixtures/preview-theme-regression.md`
  - 复用已有人工回归 Markdown 样例，不在第一阶段新增样例文件。

## Execution Notes

- 本阶段只做“优先级架构修复”，不做逐主题视觉微调。
- 预览主题对外名称、配置项取值、切换逻辑都不能变。
- 所有 `npm`、`npx eslint`、`node --test` 默认在 `wj-markdown-editor-web/` 目录执行。
- 推荐执行方式：`@superpowers:subagent-driven-development`
- 完成前必须执行：`@superpowers:verification-before-completion`

## Task 1: 锁定第一阶段优先级架构边界

**Files:**
- Create: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemePriorityArchitecture.test.js`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemePriorityArchitecture.test.js`

- [ ] **Step 1: 编写失败测试，锁定 `MarkdownPreview` 必须包含稳定根类**

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('MarkdownPreview 根容器必须带 wj-preview-theme 稳定类', () => {
  const source = readSource('../../../components/editor/MarkdownPreview.vue')

  assert.match(source, /wj-preview-theme/)
})
```

- [ ] **Step 2: 扩展失败测试，锁定 contract/base 不得再使用 `:where([class*='preview-theme-'])` 作为根**

```js
test('contract 与 base 的根作用域不得继续使用 :where([class*=preview-theme-])', () => {
  const contractSource = readSource('../preview-theme/preview-theme-contract.scss')
  const baseSource = readSource('../preview-theme/preview-theme-base.scss')

  assert.equal(contractSource.includes(":where([class*='preview-theme-'])"), false)
  assert.equal(baseSource.includes(":where([class*='preview-theme-'])"), false)
})
```

- [ ] **Step 3: 扩展失败测试，正向锁定基础层关键结构选择器必须具备类级 specificity**

```js
test('基础层关键结构选择器必须显式挂到 wj-preview-theme 根类上', () => {
  const baseSource = readSource('../preview-theme/preview-theme-base.scss')

  assert.match(baseSource, /\.wj-preview-theme\s*:where\(h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\)/)
  assert.match(baseSource, /\.wj-preview-theme\s*:where\(p\)/)
  assert.match(baseSource, /\.wj-preview-theme\s*:where\(ul,\s*ol\)/)
  assert.match(baseSource, /\.wj-preview-theme\s*:where\(blockquote\)/)
  assert.match(baseSource, /\.wj-preview-theme\s*:where\(table\)/)
  assert.match(baseSource, /\.wj-preview-theme\s*:where\(pre\)/)
  assert.match(baseSource, /\.wj-preview-theme\s*:where\(:not\(pre\)\s*>\s*code,\s*:not\(pre\)\s*>\s*tt,\s*:not\(pre\)\s*>\s*samp\)/)
})
```

- [ ] **Step 4: 扩展失败测试，锁定 8 个主题文件必须使用稳定根类组合，且不得残留裸主题根块**

```js
for (const themeName of ['github', 'juejin', 'vuepress', 'markdown-here', 'smart-blue', 'mk-cute', 'cyanosis', 'scrolls']) {
  test(`${themeName} 主题必须挂到稳定根类上，且不再残留裸主题根块`, () => {
    const source = readSource(`../preview-theme/theme/${themeName}.scss`)

    assert.match(source, new RegExp(`\\.wj-preview-theme\\.preview-theme-${themeName.replace('-', '\\\\-')}`))
    assert.doesNotMatch(source, new RegExp(`(^|\\n)\\s*\\.preview-theme-${themeName.replace('-', '\\\\-')}\\s*\\{`, 'm'))

    if (source.includes(":root[theme='dark']")) {
      assert.match(source, new RegExp(`:root\\[theme='dark'\\][\\s\\S]*\\.wj-preview-theme\\.preview-theme-${themeName.replace('-', '\\\\-')}`))
    }
  })
}
```

- [ ] **Step 5: 运行测试，确认红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemePriorityArchitecture.test.js
```

Expected:

```text
FAIL，原因包括 MarkdownPreview 仍未带稳定根类，contract/base 仍使用 :where 根作用域或缺少类级 specificity，主题文件仍未统一到稳定根类组合并残留裸主题根块
```

- [ ] **Step 6: 提交测试脚手架 commit**

```bash
git add src/assets/style/__tests__/previewThemePriorityArchitecture.test.js
git commit -m "test(web): lock preview theme priority architecture"
```

## Task 2: 在预览组件上引入稳定根类

**Files:**
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemePriorityArchitecture.test.js`

- [ ] **Step 1: 修改 `MarkdownPreview.vue`，为主题根容器增加 `wj-preview-theme` 类**

Implementation notes:

- 保留当前 `code-theme-${codeTheme}` 与 `preview-theme-${previewTheme}`。
- 新增的稳定类必须与动态主题类处于同一层根容器。
- 不改变 DOM 层级，不改变 props，不改变主题配置流。

- [ ] **Step 2: 运行优先级架构测试，确认第一条断言转绿，其余仍可保持红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemePriorityArchitecture.test.js
```

Expected:

```text
仍有 FAIL，但 MarkdownPreview 稳定根类断言已通过
```

- [ ] **Step 3: 按文件执行 ESLint 修复**

Run:

```bash
npx eslint --fix src/components/editor/MarkdownPreview.vue src/assets/style/__tests__/previewThemePriorityArchitecture.test.js
```

- [ ] **Step 4: 提交一次独立 commit**

```bash
git add src/components/editor/MarkdownPreview.vue src/assets/style/__tests__/previewThemePriorityArchitecture.test.js
git commit -m "refactor(web): add stable preview theme root class"
```

## Task 3: 重建合同层与基础层的根作用域

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemePriorityArchitecture.test.js`

- [ ] **Step 1: 改写 `preview-theme-contract.scss` 根作用域**

Implementation notes:

- 把根选择器从 `:where([class*='preview-theme-'])` 改为稳定根类。
- 第一阶段不要改变量命名，不要改默认值语义。
- 变量默认值只做作用域迁移，不做视觉重设计。

- [ ] **Step 2: 改写 `preview-theme-base.scss` 根作用域**

Implementation notes:

- 根选择器必须使用稳定根类。
- 后代结构选择器可继续使用 `:where(p)`、`:where(blockquote)`、`:where(table)` 这类写法。
- 目标是让 `.wj-preview-theme :where(p)` 这类规则整体具备类级 specificity。
- 必须显式覆盖标题、段落、列表、引用、表格、行内代码、代码块这些关键结构选择器，不能只删旧根选择器而不补正向约束。
- 第一阶段不要顺手改变量值。

- [ ] **Step 3: 如现有结构测试对旧根选择器有硬编码依赖，更新测试**

Implementation notes:

- `previewThemeStructure.test.js` 若检查旧的 `:where([class*='preview-theme-'])`，必须同步改为检查稳定根类模式。
- `previewThemeVariableCoverage.test.js` 若依赖旧根选择器模式，也同步更新断言。

- [ ] **Step 4: 运行三组测试，确认基础层已整体提权**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemePriorityArchitecture.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
PASS 或仅剩主题文件根选择器相关失败，contract/base 相关断言与关键基础结构类级 specificity 断言全部转绿
```

- [ ] **Step 5: 提交一次独立 commit**

```bash
git add src/assets/style/preview-theme/preview-theme-contract.scss src/assets/style/preview-theme/preview-theme-base.scss src/assets/style/__tests__/previewThemePriorityArchitecture.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git commit -m "refactor(web): raise preview theme base specificity"
```

## Task 4: 统一 8 个主题文件的根选择器

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/github.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/juejin.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/vuepress.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/markdown-here.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/smart-blue.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/mk-cute.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/cyanosis.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/scrolls.scss`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemePriorityArchitecture.test.js`

- [ ] **Step 1: 统一变量入口根选择器**

Implementation notes:

- 将每个主题的主变量入口统一为 `.wj-preview-theme.preview-theme-xxx`。
- 不改变任何主题对外名称。
- 只迁移根作用域，不在此步骤做局部视觉微调。

- [ ] **Step 2: 统一暗黑模式根选择器**

Implementation notes:

- 所有 `:root[theme='dark'] { .preview-theme-xxx { ... } }` 形式统一改为 `:root[theme='dark'] { .wj-preview-theme.preview-theme-xxx { ... } }`。
- 不调整暗黑模式变量值。

- [ ] **Step 3: 统一主题特例根选择器**

Implementation notes:

- 所有主题特例块统一改为 `.wj-preview-theme.preview-theme-xxx { ... }`。
- 包含 `@media` 内部的主题根选择器。
- 处理完成后，主题文件中不得再残留任何裸 `.preview-theme-xxx { ... }` 根块。
- 仅做根作用域统一，不对主题内部特例进行增删。

- [ ] **Step 4: 运行优先级架构测试，确认 8 个主题全部转绿**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemePriorityArchitecture.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 5: 提交一次独立 commit**

```bash
git add src/assets/style/preview-theme/theme/github.scss src/assets/style/preview-theme/theme/juejin.scss src/assets/style/preview-theme/theme/vuepress.scss src/assets/style/preview-theme/theme/markdown-here.scss src/assets/style/preview-theme/theme/smart-blue.scss src/assets/style/preview-theme/theme/mk-cute.scss src/assets/style/preview-theme/theme/cyanosis.scss src/assets/style/preview-theme/theme/scrolls.scss src/assets/style/__tests__/previewThemePriorityArchitecture.test.js
git commit -m "refactor(web): unify preview theme root selectors"
```

## Task 5: 做第一阶段的结构回归验证

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemePriorityArchitecture.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`

- [ ] **Step 1: 运行全部样式结构测试**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemePriorityArchitecture.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 2: 按修改文件执行 ESLint 修复**

Run:

```bash
npx eslint --fix src/components/editor/MarkdownPreview.vue src/assets/style/__tests__/previewThemePriorityArchitecture.test.js src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

- [ ] **Step 3: 本地启动 Web 端进行人工回归**

Run:

```bash
npm run dev
```

Manual checklist:

- 在编辑页、预览页、导出页、引导页中分别确认预览主题能正常加载。
- 至少抽查 `juejin`、`vuepress`、`smart-blue`、`scrolls` 四个高风险主题。
- 重点检查标题顶部节奏、普通段落、引用块、嵌套列表、表格、行内代码、代码块。
- 在浏览器开发者工具中确认关键节点不再落回 AntD reset 默认值：
  - `h1` 的 `margin-top` 不能仍为 `0`
  - `p` 的 `margin-top` 不能仍为 `0`
  - `blockquote` 的 `margin-top` 不能仍为 `0`
  - `blockquote > p` 的 `margin-top` 不能仍为 `0`
- 第一阶段验收标准是“结构样式重新受主题控制”，不是逐像素恢复最终设计。

- [ ] **Step 4: 记录第一阶段未解决项，明确转入第二阶段**

记录项至少包括：

- 哪些主题仍存在视觉细调差异。
- 是否仍有某些局部结构需要继续上提到基础层。
- `juejin`、`vuepress` 等主题是否还需要视觉校准。

- [ ] **Step 5: 提交最终收尾 commit**

```bash
git add src/components/editor/MarkdownPreview.vue src/assets/style/preview-theme src/assets/style/__tests__
git commit -m "chore(web): finalize preview theme priority refactor phase 1"
```

## Review Gate

在开始实现前，使用一个只读审查 subagent 评审以下文档：

- Plan: `docs/superpowers/plans/2026-03-25-preview-theme-priority-refactor-phase1.md`
- Spec: `docs/superpowers/specs/2026-03-25-preview-theme-priority-refactor-phase1-spec.md`

审查重点：

- 第一阶段是否严格限定在“优先级架构修复”，没有混入第二阶段视觉微调。
- 任务拆分是否足够清晰，便于后续按 commit 边界实施。
- 是否明确覆盖了 `MarkdownPreview`、contract、base、8 个主题文件和测试。
- 验收标准是否能证明“预览主题整体高于 reset”。

## Done Criteria

- `MarkdownPreview` 根容器带有稳定类 `wj-preview-theme`。
- contract/base 不再使用 `:where([class*='preview-theme-'])` 作为根作用域。
- base 中标题、段落、列表、引用、表格、行内代码、代码块这些关键结构选择器已显式具备类级 specificity。
- 8 个预览主题文件的变量入口、暗黑模式覆盖和主题特例统一挂到稳定根类。
- 8 个预览主题文件中不再残留裸 `.preview-theme-xxx` 根块。
- 基础层关键结构样式在真实页面里不再被 AntD reset 抢走控制权。
- 第一阶段遗留问题被明确记录，并作为第二阶段视觉校准输入。
