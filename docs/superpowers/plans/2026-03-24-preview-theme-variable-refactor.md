# Preview Theme Variable Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持预览主题对外名称和配置值不变的前提下，把 Web 端预览主题重构为“基础骨架样式 + CSS 变量 + 少量主题特例覆盖”的结构，并删除当前渲染链路下可明确证明不会命中的冗余样式。

**Architecture:** 本次实现只处理预览主题，不进入代码主题实现。整体做法是先引入统一的变量协议和预览基础骨架，再以 `github` 为样板完成变量化迁移和冗余清理，随后按主题分批迁移剩余 7 个主题；每个主题优先只负责变量赋值，只有确实无法变量化的差异才保留局部覆盖。开发在分支 `feat/preview-theme-variable-refactor` 上进行，可按文件边界使用 subagent 并行执行。

**Tech Stack:** Vue 3、Vite 6、SCSS、Node `node:test`、ESLint

---

## File Map

### Create

- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
  - 统一定义预览主题变量协议和默认值。
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
  - 定义 Markdown 结构骨架样式，只消费变量。
- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
  - 验证预览主题入口、变量协议和默认值收口。
- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeGithubCleanup.test.js`
  - 验证 `github` 主题中需要删除的已确认冗余选择器已清理。
- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`
  - 验证 8 个主题文件都已进入变量化结构。
- `wj-markdown-editor-web/src/assets/style/__tests__/fixtures/preview-theme-regression.md`
  - 提供统一的人工回归 Markdown 样本文档。

### Modify

- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme.scss`
  - 改为纯聚合入口，按顺序引入 contract、base 和各主题文件。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/github.css`
  - 样板迁移为 `github.scss`，并清理可证明无效的历史选择器。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/juejin.scss`
  - 迁移为变量为主、少量特例覆盖的结构。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/vuepress.scss`
  - 迁移为变量为主、少量特例覆盖的结构。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/markdown-here.scss`
  - 迁移为变量为主、少量特例覆盖的结构。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/smart-blue.scss`
  - 迁移为变量为主、保留背景纹理等特例覆盖。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/mk-cute.scss`
  - 迁移为变量为主、保留局部风格化覆盖。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/cyanosis.scss`
  - 迁移为变量为主、保留局部风格化覆盖。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/scrolls.scss`
  - 迁移为变量为主、保留局部风格化覆盖。
- `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
  - 修正默认 `previewTheme` 为 `github`，清理 `github-light` 残留。
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
  - 修正默认 `previewTheme` 为 `github`，与运行时配置保持一致。

### Delete / Move

- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/github.css`
  - 迁移完成后改为 `github.scss`，避免继续保留历史 CSS 大包结构。

## Execution Notes

- 当前已在分支 `feat/preview-theme-variable-refactor` 上编写 spec，后续实现继续在此分支进行。
- 除非步骤中另有说明，所有 `npm`、`npx eslint`、`rg` 命令默认在 `wj-markdown-editor-web/` 目录执行。
- 推荐执行方式：`@superpowers:subagent-driven-development`
- 最终验证前必须执行：`@superpowers:verification-before-completion`
- 预览主题迁移任务可按文件写集拆分 subagent，但同一批主题文件不能交叉编辑。

## Task 1: 建立预览主题入口约束与回归样本

**Files:**
- Create: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Create: `wj-markdown-editor-web/src/assets/style/__tests__/fixtures/preview-theme-regression.md`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`

- [ ] **Step 1: 编写失败测试，先锁定默认值与新入口约束**

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('预览组件默认主题值必须统一为 github', () => {
  const previewSource = readSource('../../../components/editor/MarkdownPreview.vue')
  const editSource = readSource('../../../components/editor/MarkdownEdit.vue')

  assert.match(previewSource, /default:\s*\(\)\s*=>\s*'github'/)
  assert.match(editSource, /default:\s*\(\)\s*=>\s*'github'/)
  assert.equal(previewSource.includes('github-light'), false)
  assert.equal(editSource.includes('github-light'), false)
})
```

- [ ] **Step 2: 运行测试，确认红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeStructure.test.js
```

Expected:

```text
FAIL，原因是组件默认值仍含 github-light
```

- [ ] **Step 3: 新建统一人工回归样本 Markdown**

Create:

```text
src/assets/style/__tests__/fixtures/preview-theme-regression.md
```

Content must cover:

- 标题、段落、粗体、斜体、链接、引用、分割线
- 有序列表、无序列表、任务列表
- 表格、图片、音频、视频
- 行内代码、代码块
- 脚注
- GitHub Alert
- `details` 容器

- [ ] **Step 4: 修正预览组件默认值**

Implementation notes:

- `MarkdownPreview.vue` 与 `MarkdownEdit.vue` 中 `previewTheme` 默认值统一改为 `github`
- 不改 `codeTheme` 相关默认值

- [ ] **Step 5: 重新运行测试，确认绿灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeStructure.test.js
```

Expected:

```text
PASS，默认值测试通过
```

- [ ] **Step 6: 按修改文件执行 ESLint 修复**

Run:

```bash
npx eslint --fix src/components/editor/MarkdownPreview.vue src/components/editor/MarkdownEdit.vue src/assets/style/__tests__/previewThemeStructure.test.js
```

- [ ] **Step 7: 提交一次独立 commit**

```bash
git add src/components/editor/MarkdownPreview.vue src/components/editor/MarkdownEdit.vue src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/fixtures/preview-theme-regression.md
git commit -m "test(web): lock preview theme defaults and regression fixture"
```

## Task 2: 建立变量协议与预览基础骨架

**Files:**
- Create: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- Create: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme.scss`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`

- [ ] **Step 1: 扩展失败测试，要求入口顺序固定为 contract -> base -> themes**

```js
test('预览主题入口必须先引入 contract 和 base，再引入具体主题', () => {
  const source = readSource('../preview-theme/preview-theme.scss')

  const contractIndex = source.indexOf("@use './preview-theme-contract'")
  const baseIndex = source.indexOf("@use './preview-theme-base'")
  const githubIndex = source.indexOf("@use './theme/github'")

  assert.notEqual(contractIndex, -1)
  assert.notEqual(baseIndex, -1)
  assert.notEqual(githubIndex, -1)
  assert.equal(contractIndex < baseIndex, true)
  assert.equal(baseIndex < githubIndex, true)
})
```

- [ ] **Step 2: 运行测试，确认红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeStructure.test.js
```

Expected:

```text
FAIL，入口顺序断言不满足
```

- [ ] **Step 3: 新建 `preview-theme-contract.scss`**

Implementation notes:

- 统一声明 `--wj-preview-*` 变量及默认值
- 只写变量协议，不写具体结构选择器
- 保留与现有全局变量兼容的引用，例如字体、阴影可回退到现有 `--wj-markdown-*` 或 `--img-box-shadow`

- [ ] **Step 4: 新建 `preview-theme-base.scss`**

Implementation notes:

- 统一接管标题、段落、列表、引用、表格、图片、行内代码、`pre:not(.hljs)`、脚注、任务列表、`details/summary`
- `.hljs` token 色彩不进入基础层
- `.pre-container`、复制按钮和语言标签一并纳入基础层

- [ ] **Step 5: 重写 `preview-theme.scss` 为纯聚合入口**

Implementation notes:

- 文件只保留 `@use` 语句
- 顺序固定为：contract -> base -> 各主题文件
- 删除旧文件里直接承载的 `pre` / `code` / `.pre-container` 公共样式

- [ ] **Step 6: 重新运行测试，确认绿灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeStructure.test.js
```

Expected:

```text
PASS，说明新入口结构已建立
```

- [ ] **Step 7: 按修改文件执行 ESLint 修复**

Run:

```bash
npx eslint --fix src/assets/style/__tests__/previewThemeStructure.test.js
```

Expected:

```text
无报错；SCSS 文件保持 UTF-8 无 BOM，不需要单独跑 ESLint
```

- [ ] **Step 8: 提交一次独立 commit**

```bash
git add src/assets/style/preview-theme/preview-theme-contract.scss src/assets/style/preview-theme/preview-theme-base.scss src/assets/style/preview-theme/preview-theme.scss src/assets/style/__tests__/previewThemeStructure.test.js
git commit -m "feat(web): add preview theme contract and base"
```

## Task 3: 迁移 github 主题并清理已确认无效规则

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
- Create: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeGithubCleanup.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme.scss`
- Create: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/github.scss`
- Delete: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/github.css`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeGithubCleanup.test.js`

- [ ] **Step 1: 写失败测试，锁定 github 主题必须删除的已确认无效选择器**

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readTheme(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('github 主题不应保留历史 github-light 选择器和已确认无效规则', () => {
  const source = readTheme('../preview-theme/theme/github.scss')

  assert.equal(source.includes('preview-theme-github-light'), false)
  assert.equal(source.includes('.octicon'), false)
  assert.equal(source.includes('.pl-c'), false)
  assert.equal(source.includes('details-dialog'), false)
  assert.equal(source.includes('body:has(:modal)'), false)
})
```

- [ ] **Step 2: 运行测试，确认红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeGithubCleanup.test.js
```

Expected:

```text
FAIL，原因包括 github.scss 尚未建立
```

- [ ] **Step 3: 将 `github.css` 迁移为 `github.scss`**

Implementation notes:

- 主题文件改为“变量赋值 + 少量特例覆盖”
- 保留当前 `:root[theme='light']` / `:root[theme='dark']` 下真正有效的变量差异
- 统一把公用结构转移到基础层，不要在 `github.scss` 中重复整套 Markdown 骨架

- [ ] **Step 4: 删除已确认无效的规则**

必须删除：

- `.preview-theme-github-light ...`
- `.octicon` 与 `.anchor .octicon-link`
- `.pl-*`
- `.preview-theme-github body:has(:modal)`
- `details-dialog`

Implementation notes:

- 只删 spec 中已经给出证据链的无效选择器
- `.markdown-alert`、`.task-list-item`、`.footnotes`、`details/summary` 必须保留

- [ ] **Step 5: 更新 `preview-theme.scss` 的 github 入口**

Implementation notes:

- 改为引用 `theme/github`
- 确保路径解析到新 `github.scss`

- [ ] **Step 6: 如果 github 样板迁移暴露变量协议缺口，先回写 contract/base**

Implementation notes:

- 当 `github` 迁移过程中发现某类结构差异应进入公共层，而不是继续留在主题文件里时：
- 先修改 `preview-theme-contract.scss`，补齐必要变量
- 再修改 `preview-theme-base.scss`，把共性结构上提到基础层
- 必要时同步更新 `previewThemeStructure.test.js` 里的入口或结构约束
- 只有 contract/base 补齐并通过测试后，才能继续进入剩余主题迁移

- [ ] **Step 7: 运行结构测试与 github 清理测试，确认绿灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeGithubCleanup.test.js
```

Expected:

```text
PASS，说明 contract/base 仍与 github 样板迁移兼容，且已确认无效的 github 历史规则已清理
```

- [ ] **Step 8: 提交一次独立 commit**

```bash
git add src/assets/style/preview-theme/preview-theme-contract.scss src/assets/style/preview-theme/preview-theme-base.scss src/assets/style/preview-theme/preview-theme.scss src/assets/style/preview-theme/theme/github.scss src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeGithubCleanup.test.js
git rm src/assets/style/preview-theme/theme/github.css
git commit -m "refactor(web): migrate github preview theme to variables"
```

## Task 4: 迁移排版型主题并建立变量覆盖约束

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
- Create: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/juejin.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/vuepress.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/markdown-here.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`

- [ ] **Step 1: 写失败测试，要求排版型主题必须包含统一变量赋值入口**

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readTheme(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

for (const [themeName, relativePath] of [
  ['juejin', '../preview-theme/theme/juejin.scss'],
  ['vuepress', '../preview-theme/theme/vuepress.scss'],
  ['markdown-here', '../preview-theme/theme/markdown-here.scss'],
]) {
  test(`${themeName} 主题应声明统一变量入口`, () => {
    const source = readTheme(relativePath)

    assert.match(source, new RegExp(`\\.preview-theme-${themeName}[\\s\\S]*--wj-preview-`))
  })
}
```

- [ ] **Step 2: 运行测试，确认红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
FAIL，至少有一个主题文件尚未声明统一变量入口
```

- [ ] **Step 3: 迁移 `juejin.scss`**

Implementation notes:

- 保留必要的暗色模式变量覆盖
- 把段落、标题、列表、表格等共性规则尽量移交基础层

- [ ] **Step 4: 迁移 `vuepress.scss`**

Implementation notes:

- 优先收敛标题、列表、代码块外壳、表格等共性结构
- 只保留确实无法变量表达的局部差异

- [ ] **Step 5: 迁移 `markdown-here.scss`**

Implementation notes:

- 保留其必要的暗色模式差异
- 删除迁移后重复的结构样式

- [ ] **Step 6: 如果排版型主题迁移继续暴露共性结构，继续补齐 contract/base**

Implementation notes:

- 当 `juejin`、`vuepress` 或 `markdown-here` 迁移时再次发现某类规则应进入公共层：
- 允许并要求同步修改 `preview-theme-contract.scss` 和 `preview-theme-base.scss`
- 必要时同步更新 `previewThemeStructure.test.js` 的结构约束
- 不能把本应进入基础层的共性规则继续滞留在主题文件里

- [ ] **Step 7: 重新运行结构测试与变量覆盖测试，确认绿灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
PASS，说明基础层未回退，且排版型主题均已声明变量入口
```

- [ ] **Step 8: 提交一次独立 commit**

```bash
git add src/assets/style/preview-theme/preview-theme-contract.scss src/assets/style/preview-theme/preview-theme-base.scss src/assets/style/preview-theme/theme/juejin.scss src/assets/style/preview-theme/theme/vuepress.scss src/assets/style/preview-theme/theme/markdown-here.scss src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git commit -m "refactor(web): migrate editorial preview themes"
```

## Task 5: 迁移强风格化主题

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/smart-blue.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/mk-cute.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/cyanosis.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/scrolls.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`

- [ ] **Step 1: 扩展失败测试，要求强风格化主题也必须声明统一变量入口**

```js
for (const [themeName, relativePath] of [
  ['smart-blue', '../preview-theme/theme/smart-blue.scss'],
  ['mk-cute', '../preview-theme/theme/mk-cute.scss'],
  ['cyanosis', '../preview-theme/theme/cyanosis.scss'],
  ['scrolls', '../preview-theme/theme/scrolls.scss'],
]) {
  test(`${themeName} 主题应声明统一变量入口`, () => {
    const source = readTheme(relativePath)

    assert.match(source, new RegExp(`\\.preview-theme-${themeName}[\\s\\S]*--wj-preview-`))
  })
}
```

- [ ] **Step 2: 运行测试，确认红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
FAIL，强风格化主题尚未完成变量迁移
```

- [ ] **Step 3: 迁移 `smart-blue.scss`**

Implementation notes:

- 将颜色、引用、表格、代码块样式改为变量驱动
- 保留背景纹理、特殊标题装饰等必要覆盖

- [ ] **Step 4: 迁移 `mk-cute.scss`**

Implementation notes:

- 将圆角、颜色、表格、引用等共性部分迁移到变量
- 保留其局部装饰性覆盖

- [ ] **Step 5: 迁移 `cyanosis.scss` 与 `scrolls.scss`**

Implementation notes:

- 统一把 Markdown 骨架归入基础层
- 只保留必要的主题人格化覆盖

- [ ] **Step 6: 如果强风格化主题迁移继续暴露共性结构，继续补齐 contract/base**

Implementation notes:

- 当 `smart-blue`、`mk-cute`、`cyanosis`、`scrolls` 迁移时发现某类共性规则仍应上提到公共层：
- 允许并要求同步修改 `preview-theme-contract.scss` 和 `preview-theme-base.scss`
- 必要时同步更新 `previewThemeStructure.test.js`
- 保持“基础层承载共性，主题层保留人格化覆盖”的边界不回退

- [ ] **Step 7: 重新运行结构测试与变量覆盖测试，确认绿灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
PASS，说明基础层未回退，且全部 8 个主题均已声明变量入口
```

- [ ] **Step 8: 提交一次独立 commit**

```bash
git add src/assets/style/preview-theme/preview-theme-contract.scss src/assets/style/preview-theme/preview-theme-base.scss src/assets/style/preview-theme/theme/smart-blue.scss src/assets/style/preview-theme/theme/mk-cute.scss src/assets/style/preview-theme/theme/cyanosis.scss src/assets/style/preview-theme/theme/scrolls.scss src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git commit -m "refactor(web): migrate decorative preview themes"
```

## Task 6: 完成验证、清理残留并收尾

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeGithubCleanup.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`

- [ ] **Step 1: 运行所有新增测试**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeGithubCleanup.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 2: 按修改文件执行 ESLint 修复**

Run:

```bash
npx eslint --fix src/components/editor/MarkdownPreview.vue src/components/editor/MarkdownEdit.vue src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeGithubCleanup.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
无报错
```

- [ ] **Step 3: 本地启动 Web 端进行人工回归**

Run:

```bash
npm run dev
```

Manual checklist:

- 在编辑页加载 `src/assets/style/__tests__/fixtures/preview-theme-regression.md` 等价内容
- 在设置页切换 8 个预览主题，确认都能生效
- 检查标题、段落、列表、表格、脚注、Alert、`details`、图片、行内代码、代码块
- 确认 `github` 主题删除冗余规则后无明显结构缺失
- 确认 `GuideView`、`PreviewView`、`ExportView` 使用预览主题时不回退

- [ ] **Step 4: 用文本搜索确认 Web 端不再残留 github-light 默认值**

Run:

```bash
rg -n "github-light" src/components src/assets/style src/views
```

Expected:

```text
仅允许 Electron 配置修复与对应测试文件中保留历史兼容语义；Web 端预览主题运行代码中不应再出现 github-light 默认值
```

- [ ] **Step 5: 提交最终收尾 commit**

```bash
git add src/components/editor/MarkdownPreview.vue src/components/editor/MarkdownEdit.vue src/assets/style/preview-theme src/assets/style/__tests__
git commit -m "chore(web): finalize preview theme variable refactor"
```

## Review Gate

在开始实现前，先用以下上下文请求一名计划审查 subagent：

- Plan: `docs/superpowers/plans/2026-03-24-preview-theme-variable-refactor.md`
- Spec: `docs/superpowers/specs/2026-03-24-preview-theme-variable-refactor-design.md`

审查重点：

- 计划是否完整覆盖 spec 中的变量协议、基础层范围、冗余删除边界和完成标准
- 任务拆分是否足够独立，便于使用 subagent
- 是否存在会让实现者卡住的空白步骤

## Done Criteria

- 预览主题入口已拆成 contract/base/theme 三层聚合
- 8 个预览主题都迁移为变量为主、特例覆盖为辅的结构
- `github` 主题的已确认无效规则已被删除
- Web 端运行代码中不再残留 `github-light` 作为预览主题默认值
- 新增测试通过，人工回归通过
