# Scrollbar Hover Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 Web 端 `.wj-scrollbar` 与 CodeMirror 滚动层的滚动条交互，实现默认仅显示细 thumb、进入滚动条命中区后显示轨道并视觉变粗，且 hover 前后不影响布局。

**Architecture:** 以 `wj-markdown-editor-web/src/assets/style/scroll.scss` 作为唯一滚动条视觉入口，集中定义共享 CSS 变量与 `::-webkit-scrollbar` 规则；CodeMirror 仅保留布局必需的 `.cm-scroller` 配置，移除重复内联滚动条样式。通过固定真实命中区宽度、默认透明轨道、thumb 透明边框与 `background-clip: content-box` 制造细态/粗态差异，避免 gutter 宽度变化引发布局抖动。用户已明确要求不使用 worktree，本计划直接在当前分支 `feat/web-scrollbar-hover-style` 上执行。

**Tech Stack:** Vue 3、Vite 6、CodeMirror 6、SCSS、Node `node:test`、ESLint

---

### Task 1: 为共享滚动条样式建立失败保护测试

**Files:**
- Create: `wj-markdown-editor-web/src/assets/style/__tests__/scrollbarStyleStructure.test.js`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/scrollbarStyleStructure.test.js`

- [ ] **Step 1: 写出失败中的结构测试**

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('scroll.scss 必须集中定义共享滚动条变量并覆盖 CodeMirror 滚动层', () => {
  const source = readSource('../scroll.scss')
  const requiredMarkers = [
    '--wj-scrollbar-hit-size: 10px;',
    '--wj-scrollbar-idle-border: 3px;',
    '--wj-scrollbar-active-border: 1px;',
    '--wj-scrollbar-track-color: var(--wj-markdown-scroll-bg);',
    '.cm-editor .cm-scroller',
    'width: var(--wj-scrollbar-hit-size);',
    'height: var(--wj-scrollbar-hit-size);',
    'background-color: transparent;',
    'background-clip: content-box;',
    '&::-webkit-scrollbar:hover',
    '&::-webkit-scrollbar-thumb:hover',
  ]

  requiredMarkers.forEach((marker) => {
    assert.equal(source.includes(marker), true, `缺少共享滚动条标记：${marker}`)
  })
})

test('editorExtensionUtil 只能保留 scroller 布局规则，不能继续内联 webkit 滚动条主题', () => {
  const source = readSource('../../util/editor/editorExtensionUtil.js')

  assert.match(source, /'\\.cm-scroller': \\{\\s*overflowY: 'scroll',/u)

  const forbiddenMarkers = [
    "'*::-webkit-scrollbar'",
    "'*::-webkit-scrollbar-track'",
    "'*::-webkit-scrollbar-corner'",
    "'*::-webkit-scrollbar-thumb'",
    "'*::-webkit-scrollbar-thumb:hover'",
    "'*::-webkit-scrollbar-thumb:active'",
  ]

  forbiddenMarkers.forEach((marker) => {
    assert.equal(source.includes(marker), false, `editorExtensionUtil 不应继续内联 ${marker}`)
  })
})
```

- [ ] **Step 2: 运行 node:test，确认新测试先失败**

Run:

```bash
npm run test:node -- src/assets/style/__tests__/scrollbarStyleStructure.test.js
```

Expected:

- FAIL，原因应为 `scroll.scss` 还没有新的共享变量、CodeMirror 选择器与 hover 规则
- FAIL，原因应为 `editorExtensionUtil.js` 仍包含 `*::-webkit-scrollbar*` 规则

### Task 2: 收敛滚动条样式到 scroll.scss 并移除编辑器重复实现

**Files:**
- Modify: `wj-markdown-editor-web/src/assets/style/scroll.scss`
- Modify: `wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js`
- Test: `wj-markdown-editor-web/src/assets/style/__tests__/scrollbarStyleStructure.test.js`

- [ ] **Step 1: 在 scroll.scss 中实现共享滚动条规则**

将 `wj-markdown-editor-web/src/assets/style/scroll.scss` 改为以下结构：

```scss
@mixin wj-scrollbar-shared() {
  --wj-scrollbar-hit-size: 10px;
  --wj-scrollbar-idle-border: 3px;
  --wj-scrollbar-active-border: 1px;
  --wj-scrollbar-track-color: var(--wj-markdown-scroll-bg);
  --wj-scrollbar-thumb-color: #0000004d;
  --wj-scrollbar-thumb-hover-color: #00000059;
  --wj-scrollbar-thumb-active-color: #00000061;

  &::-webkit-scrollbar {
    display: revert;
    width: var(--wj-scrollbar-hit-size);
    height: var(--wj-scrollbar-hit-size);
    background-color: transparent;
  }

  &::-webkit-scrollbar-track,
  &::-webkit-scrollbar-corner {
    background-color: transparent;
  }

  &::-webkit-scrollbar-thumb {
    border: var(--wj-scrollbar-idle-border) solid transparent;
    border-radius: 999px;
    background-clip: content-box;
    background-color: var(--wj-scrollbar-thumb-color);
  }

  &::-webkit-scrollbar:hover {
    background-color: var(--wj-scrollbar-track-color);
  }

  &::-webkit-scrollbar-thumb:hover {
    border-width: var(--wj-scrollbar-active-border);
    background-color: var(--wj-scrollbar-thumb-hover-color);
  }

  &::-webkit-scrollbar-thumb:active {
    border-width: var(--wj-scrollbar-active-border);
    background-color: var(--wj-scrollbar-thumb-active-color);
  }
}

.wj-scrollbar,
.wj-scrollbar *,
.cm-editor .cm-scroller,
.cm-editor .cm-scroller * {
  @include wj-scrollbar-shared();
}

.wj-scrollbar-hide::-webkit-scrollbar {
  display: revert;
  width: 0;
  height: 0;
}
```

- [ ] **Step 2: 删除 editorExtensionUtil 中重复的 webkit 滚动条规则，只保留 `.cm-scroller` 布局声明**

将 `wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js` 中 `EditorView.theme` 片段调整为：

```js
  EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '1rem',
    },
    '.cm-line': {
      fontFamily: 'var(--edit-area-font)',
    },
    '.cm-completionLabel': {
      fontFamily: 'var(--edit-area-font)',
    },
    '.cm-content': {
      lineHeight: '1.5',
      paddingBottom: 'var(--wj-editor-bottom-gap, 40vh)',
    },
    '.cm-gutterElement': {
      userSelect: 'none',
      padding: '0 !important',
      textAlign: 'center !important',
    },
    '.cm-scroller': {
      overflowY: 'scroll',
    },
    '.cm-panels:has(.cm-search.cm-panel)': {
      height: 0,
      overflow: 'hidden',
    },
  }),
```

- [ ] **Step 3: 重新运行结构测试，确认最小实现已通过**

Run:

```bash
npm run test:node -- src/assets/style/__tests__/scrollbarStyleStructure.test.js
```

Expected:

- PASS，新增结构测试全部通过

- [ ] **Step 4: 对本轮修改文件执行 ESLint 修复**

Run:

```bash
npx eslint --fix src/assets/style/scroll.scss src/assets/style/__tests__/scrollbarStyleStructure.test.js src/util/editor/editorExtensionUtil.js
```

Expected:

- Exit code 0
- 仅格式化当前修改文件，不触发无关文件改动

### Task 3: 进行包级回归验证并提交实现

**Files:**
- Verify: `wj-markdown-editor-web/src/assets/style/scroll.scss`
- Verify: `wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js`
- Verify: `wj-markdown-editor-web/src/assets/style/__tests__/scrollbarStyleStructure.test.js`

- [ ] **Step 1: 运行 Web 包完整测试**

Run:

```bash
npm run test:run
```

Expected:

- Node `node:test` 与 Vitest 全部通过
- Exit code 0

- [ ] **Step 2: 运行 Web 构建，确认 SCSS 与 CodeMirror 配置可正常编译**

Run:

```bash
npm run build
```

Expected:

- 构建成功
- `../wj-markdown-editor-electron/web-dist` 正常产出最新文件

- [ ] **Step 3: 检查最终改动范围**

Run:

```bash
git status --short
```

Expected:

- 只包含以下文件的改动：
  - `wj-markdown-editor-web/src/assets/style/scroll.scss`
  - `wj-markdown-editor-web/src/assets/style/__tests__/scrollbarStyleStructure.test.js`
  - `wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js`
  - `docs/superpowers/plans/2026-04-08-scrollbar-hover-style.md`

- [ ] **Step 4: 提交实现**

Run:

```bash
git add wj-markdown-editor-web/src/assets/style/scroll.scss wj-markdown-editor-web/src/assets/style/__tests__/scrollbarStyleStructure.test.js wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js docs/superpowers/plans/2026-04-08-scrollbar-hover-style.md
git commit -m "feat(web): refine scrollbar hover style"
```

Expected:

- 生成一笔只包含本轮滚动条改造的提交
