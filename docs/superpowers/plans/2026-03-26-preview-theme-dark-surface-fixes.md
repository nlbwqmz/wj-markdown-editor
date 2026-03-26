# Preview Theme Dark Surface Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仅通过 Web 端预览主题样式修复 `juejin` / `scrolls` 的表格与引用块问题，并统一非 `github` 主题在暗黑模式下的音频控件观感。

**Architecture:** 本次实现分成三条主线：先把静态测试升级到能够锁住 `juejin` / `scrolls` 的新视觉约束与暗黑音频命中范围，再在预览主题变量协议和基础骨架中补齐最小媒体语义，最后只在 `juejin.scss` 与 `scrolls.scss` 中做定点变量和局部表格修正。渲染逻辑、配置项和主题切换流程保持不变，所有修复都收口在稳定根类下的 SCSS。

**Tech Stack:** Vue 3、SCSS、Node `node:test`、ESLint、Vite 6

---

## File Map

### Modify

- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
  - 为 `audio` 提供最小共享变量默认值，并在暗黑模式下仅对非 `github` 主题下发统一媒体变量覆盖。
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
  - 在基础骨架中承接 `audio` 语义，让原生媒体控件统一消费变量，不把样式散落到各主题文件。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/juejin.scss`
  - 修复明亮 / 暗黑模式表格变量，提升暗黑模式引用块边条对比度，并保留掘金主题的克制气质。
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/scrolls.scss`
  - 修复暗黑模式表格变量与局部结构细节，保留卷轴主题的暖色与底纹。
- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
  - 为基础骨架新增 `audio` 语义与暗黑共享命中范围约束，防止音频规则误伤 `github` 或亮色模式。
- `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`
  - 调整 `juejin` / `scrolls` 的 dark 分支变量断言，锁住本轮表格与引用块修复目标。

### Reuse

- `wj-markdown-editor-web/src/assets/style/__tests__/fixtures/preview-theme-regression.md`
  - 继续作为预览主题回归样本，尤其复用其中的 `!audio(...)` 与表格 Markdown 场景做手工验收。

## Execution Notes

- 所有命令默认在 `wj-markdown-editor-web/` 目录执行，除非步骤中单独标注仓库根目录。
- 本计划只覆盖已确认的 `juejin` / `scrolls` / 非 `github` 暗黑音频控件问题，不要顺手扩展到其他视觉整改。
- 严格按 TDD 顺序推进：先补失败测试，再做最小实现，再验证通过。
- 所有选择器必须继续挂在稳定根类下，不要引入裸 `.preview-theme-*` 根块。
- 最终宣称完成前必须执行 `@superpowers:verification-before-completion`。

## Task 1: 锁定暗黑音频与目标主题变量约束

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/juejin.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/scrolls.scss`

- [ ] **Step 1: 先在结构测试里补 `audio` 语义与共享暗黑命中范围断言**

在 `previewThemeStructure.test.js` 中新增两个方向的断言：

1. 变量协议与基础骨架必须覆盖最小 `audio` 语义：

```js
test('预览主题变量协议与基础骨架必须覆盖 audio 语义变量', () => {
  const contractSource = readSource('../preview-theme/preview-theme-contract.scss')
  const baseSource = readSource('../preview-theme/preview-theme-base.scss')

  assertPreviewThemeContractAndBaseCoverRequiredVariables(
    contractSource,
    baseSource,
    [
      '--wj-preview-audio-color-scheme',
      '--wj-preview-audio-background-color',
      '--wj-preview-audio-border-radius',
    ],
  )
})
```

2. 暗黑共享规则只能命中“非 `github` 主题 + `audio`”：

```js
test('暗黑音频共享规则只能在 dark 根块中命中非 github 主题', () => {
  const contractSource = readSource('../preview-theme/preview-theme-contract.scss')
  const defaultRootBlock = getSelectorBlock(contractSource, '.wj-preview-theme')
  const darkRootBlock = getSelectorBlock(contractSource, ':root[theme=\'dark\']')

  assert.match(defaultRootBlock, /--wj-preview-audio-color-scheme:\s*normal/u)
  assert.match(
    defaultRootBlock,
    /--wj-preview-audio-background-color:\s*var\(--wj-preview-background-color-transparent\)/u,
  )
  assert.match(darkRootBlock, /\.wj-preview-theme:not\(\.preview-theme-github\)/u)
  assert.match(darkRootBlock, /--wj-preview-audio-color-scheme:\s*dark/u)
  assert.match(
    darkRootBlock,
    /--wj-preview-audio-background-color:\s*var\(--wj-markdown-bg-secondary\)/u,
  )
  assert.doesNotMatch(
    darkRootBlock,
    /\.wj-preview-theme\.preview-theme-github[\s\S]*--wj-preview-audio-color-scheme/u,
  )
})

test('亮色分支和默认根块不得覆盖暗黑音频变量', () => {
  const contractSource = readSource('../preview-theme/preview-theme-contract.scss')
  const defaultRootBlock = getSelectorBlock(contractSource, '.wj-preview-theme')
  const lightRootBlocks = getSelectorBlocks(contractSource, ':root[theme=\'light\']')

  assert.doesNotMatch(defaultRootBlock, /--wj-preview-audio-color-scheme:\s*dark/u)
  assert.doesNotMatch(
    defaultRootBlock,
    /--wj-preview-audio-background-color:\s*var\(--wj-markdown-bg-secondary\)/u,
  )

  lightRootBlocks.forEach((lightRootBlock) => {
    assert.doesNotMatch(lightRootBlock, /--wj-preview-audio-color-scheme:\s*dark/u)
    assert.doesNotMatch(
      lightRootBlock,
      /--wj-preview-audio-background-color:\s*var\(--wj-markdown-bg-secondary\)/u,
    )
  })
})
```

- [ ] **Step 2: 在变量覆盖测试里先升级 `juejin` / `scrolls` 的断言**

在 `previewThemeVariableCoverage.test.js` 中先把本轮目标写成失败测试：

```js
test('juejin 主题 dark 分支必须覆盖引用块与表格修复所需变量', () => {
  const source = readSource('../preview-theme/theme/juejin.scss')

  assertDarkThemeBranchHasRequiredVariables(source, '.preview-theme-juejin', [
    '--wj-preview-blockquote-text-color',
    '--wj-preview-blockquote-background-color',
    '--wj-preview-blockquote-border-color',
    '--wj-preview-table-border-color',
    '--wj-preview-table-header-background-color',
    '--wj-preview-table-header-text-color',
    '--wj-preview-table-row-even-background-color',
  ])
})

test('scrolls 主题 dark 分支必须覆盖暗黑表格修复所需变量', () => {
  const source = readSource('../preview-theme/theme/scrolls.scss')

  assertDarkThemeBranchHasRequiredVariables(source, '.preview-theme-scrolls', [
    '--wj-preview-table-border',
    '--wj-preview-table-border-color',
    '--wj-preview-table-header-background-color',
    '--wj-preview-table-header-text-color',
    '--wj-preview-table-row-even-background-color',
    '--wj-preview-table-cell-border',
  ])
})
```

同时把 `juejin` 明亮模式表格断言升级为更现代的目标值，至少锁住：

- `--wj-preview-table-font-size`
- `--wj-preview-table-cell-border`
- `--wj-preview-table-row-even-background-color`

- [ ] **Step 3: 运行目标测试，确认当前实现先红灯**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
FAIL，原因包括缺少 audio 语义变量、juejin / scrolls dark 分支变量不完整，以及现有表格变量值仍停留在旧样式
```

- [ ] **Step 4: 对测试文件执行 ESLint，保持失败测试可读**

```bash
npx eslint --fix src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

## Task 2: 在协议与基础骨架中落地共享暗黑音频语义

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`

- [ ] **Step 1: 先在变量协议里补默认 `audio` 变量，并添加非 github 暗黑共享覆盖**

在 `preview-theme-contract.scss` 的稳定根变量块中新增最小变量：

```scss
--wj-preview-audio-color-scheme: normal;
--wj-preview-audio-background-color: var(--wj-preview-background-color-transparent);
--wj-preview-audio-border-radius: 8px;
```

然后新增暗黑共享块：

```scss
:root[theme='dark'] {
  .wj-preview-theme:not(.preview-theme-github) {
    --wj-preview-audio-color-scheme: dark;
    --wj-preview-audio-background-color: var(--wj-markdown-bg-secondary);
    --wj-preview-audio-border-radius: 10px;
  }
}
```

关键约束：

- 只覆盖非 `github` 主题。
- 只通过变量覆盖，不直接写 `audio` 元素样式。
- 不影响亮色模式默认值。

- [ ] **Step 2: 在基础骨架里消费 `audio` 语义，不新增主题特例**

在 `preview-theme-base.scss` 中新增：

```scss
& :where(audio) {
  width: min(100%, 100%);
  max-width: 100%;
  color-scheme: var(--wj-preview-audio-color-scheme);
  background-color: var(--wj-preview-audio-background-color);
  border-radius: var(--wj-preview-audio-border-radius);
}
```

关键约束：

- 基础层只消费变量，不直接写死暗黑颜色。
- 不引入 `.preview-theme-*` 选择器特例。
- 不改动 `video` 或其他媒体语义。

- [ ] **Step 3: 重新运行结构测试，确认 `audio` 语义转绿**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeStructure.test.js
```

Expected:

```text
PASS 或仅剩 juejin / scrolls 变量断言失败
```

- [ ] **Step 4: 对协议与基础骨架执行 ESLint 并提交**

```bash
npx eslint --fix src/assets/style/preview-theme/preview-theme-contract.scss src/assets/style/preview-theme/preview-theme-base.scss
git add src/assets/style/preview-theme/preview-theme-contract.scss src/assets/style/preview-theme/preview-theme-base.scss src/assets/style/__tests__/previewThemeStructure.test.js
git commit -m "feat(web): add shared dark audio preview surface"
```

## Task 3: 定点修复 `juejin` 与 `scrolls` 主题样式

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/juejin.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/scrolls.scss`
- Modify: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`

- [ ] **Step 1: 先修 `juejin` 明亮 / 暗黑模式变量，满足失败测试**

在 `juejin.scss` 中按最小范围调整：

```scss
.wj-preview-theme.preview-theme-juejin {
  --wj-preview-table-font-size: 14px;
  --wj-preview-table-display: block;
  --wj-preview-table-width: max-content;
  --wj-preview-table-border: 1px solid #ececec;
  --wj-preview-table-border-color: #ececec;
  --wj-preview-table-header-background-color: #f7f8fa;
  --wj-preview-table-header-text-color: #1f2329;
  --wj-preview-table-row-even-background-color: #f9fafb;
  --wj-preview-table-cell-padding: 10px 14px;
  --wj-preview-table-cell-border: 1px solid var(--wj-preview-table-border-color);
}

:root[theme='dark'] {
  .wj-preview-theme.preview-theme-juejin {
    --wj-preview-blockquote-text-color: var(--wj-markdown-text-primary);
    --wj-preview-blockquote-background-color: rgba(171, 178, 191, 0.08);
    --wj-preview-blockquote-border-color: rgba(94, 129, 255, 0.62);
    --wj-preview-table-border-color: var(--wj-markdown-border-primary);
    --wj-preview-table-header-background-color: rgba(171, 178, 191, 0.14);
    --wj-preview-table-header-text-color: var(--wj-markdown-text-primary);
    --wj-preview-table-row-even-background-color: rgba(171, 178, 191, 0.08);
  }
}
```

如果只靠变量仍不能让表格容器观感收紧，允许保留极少量局部 `table` 规则，但必须继续挂在 `.wj-preview-theme.preview-theme-juejin` 稳定根下。

- [ ] **Step 2: 再修 `scrolls` 暗黑表格变量与局部层次**

在 `scrolls.scss` 中只围绕暗黑模式表格调整：

```scss
:root[theme='dark'] {
  .wj-preview-theme.preview-theme-scrolls {
    --wj-preview-table-font-size: 13px;
    --wj-preview-table-border: 1px solid rgba(204, 161, 82, 0.34);
    --wj-preview-table-border-color: rgba(204, 161, 82, 0.34);
    --wj-preview-table-header-background-color: rgba(204, 161, 82, 0.2);
    --wj-preview-table-header-text-color: #f4dfb6;
    --wj-preview-table-row-even-background-color: rgba(204, 161, 82, 0.1);
    --wj-preview-table-cell-border: 1px solid rgba(204, 161, 82, 0.18);
  }
}
```

如需保留 `tbody` 底纹，可以只做轻度透明度调整，不要改掉卷轴表格的人格。

- [ ] **Step 3: 运行变量覆盖测试，确认两个主题转绿**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 4: 对主题文件和测试文件执行 ESLint 并提交**

```bash
npx eslint --fix src/assets/style/preview-theme/theme/juejin.scss src/assets/style/preview-theme/theme/scrolls.scss src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git add src/assets/style/preview-theme/theme/juejin.scss src/assets/style/preview-theme/theme/scrolls.scss src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git commit -m "fix(web): polish preview theme dark table surfaces"
```

## Task 4: 做全链路验证并收尾

**Files:**
- Modify if needed: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/juejin.scss`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/preview-theme/theme/scrolls.scss`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeStructure.test.js`
- Modify if needed: `wj-markdown-editor-web/src/assets/style/__tests__/previewThemeVariableCoverage.test.js`

- [ ] **Step 1: 跑完所有相关自动化测试**

Run:

```bash
npm run test:run -- src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 2: 运行 Web 构建，确认 SCSS 改动不破坏打包**

Run:

```bash
npm run build
```

Expected:

```text
PASS，构建产物输出到 ../wj-markdown-editor-electron/web-dist
```

- [ ] **Step 3: 做手工验收，确认视觉结果与 spec 一致**

Run:

```bash
npm run dev
```

Manual checklist:

- `juejin` 明亮模式表格比当前版本更规整，表头、单元格和斑马纹层次明确。
- `juejin` 暗黑模式下引用块左侧竖条清晰，但没有变成强提示框。
- `juejin` 暗黑模式表格比当前版本更容易阅读，且仍保留掘金主题气质。
- `scrolls` 暗黑模式表格结构更清楚，但卷轴暖色和底纹没有丢失。
- 任意非 `github` 主题在暗黑模式下的 `audio` 控件观感已接近 `github` 暗黑模式对照样本。
- `github` 主题暗黑模式的音频控件没有被共享规则误伤。
- 亮色模式下的音频控件外观未被本轮暗黑修复带偏。

- [ ] **Step 4: 如手工验收发现问题，先补失败测试再做最小修复；否则跳过改码**

只允许围绕以下范围补修：

- `juejin` 表格与引用块变量
- `scrolls` 暗黑表格变量
- 非 `github` 暗黑音频共享变量与基础 `audio` 规则

不要把修复扩大到其他主题或渲染逻辑。

- [ ] **Step 5: 对最终改动执行 ESLint，并在有后续修复时补最后一个提交**

```bash
npx eslint --fix src/assets/style/preview-theme/preview-theme-contract.scss src/assets/style/preview-theme/preview-theme-base.scss src/assets/style/preview-theme/theme/juejin.scss src/assets/style/preview-theme/theme/scrolls.scss src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git add src/assets/style/preview-theme/preview-theme-contract.scss src/assets/style/preview-theme/preview-theme-base.scss src/assets/style/preview-theme/theme/juejin.scss src/assets/style/preview-theme/theme/scrolls.scss src/assets/style/__tests__/previewThemeStructure.test.js src/assets/style/__tests__/previewThemeVariableCoverage.test.js
git commit -m "test(web): verify preview theme dark surface fixes"
```

若 Step 4 没有新增修复，则不要创建空提交，直接进入交付说明。

## Review Gate

在开始实现前，派出一个只读 plan reviewer subagent 审阅：

- Plan: `docs/superpowers/plans/2026-03-26-preview-theme-dark-surface-fixes.md`
- Spec: `docs/superpowers/specs/2026-03-26-preview-theme-dark-surface-fixes-design.md`

审查重点：

- 计划是否完整覆盖 `juejin`、`scrolls` 与非 `github` 暗黑音频共享规则三条主线。
- 测试是否足够先行，且没有跳过失败测试验证。
- 是否保持了“只改样式层、不动逻辑层”的边界。
- 是否错误地把共享暗黑音频规则写成会误伤 `github` 或亮色模式的广泛选择器。

## Done Criteria

- `preview-theme-contract.scss` 与 `preview-theme-base.scss` 已能统一承接 `audio` 语义。
- 暗黑共享音频规则只命中非 `github` 主题。
- `juejin` 明亮 / 暗黑表格与暗黑引用块都完成修复。
- `scrolls` 暗黑表格完成修复且保留卷轴风格。
- 相关静态测试与 `npm run build` 全部通过。
- 手工验收确认本轮修复没有误伤 `github` 主题和亮色模式媒体控件。
