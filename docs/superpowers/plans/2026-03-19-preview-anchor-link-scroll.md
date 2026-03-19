# Preview Anchor Link Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Markdown 预览区点击普通 `#` 链接时，只滚动预览容器到目标锚点顶部，使用 JavaScript 平滑滚动且不改 URL，同时保持脚注、本地资源链接和 `http/https` 链接现有行为不变。

**Architecture:** 先把普通 hash 锚点识别、目标查找、滚动容器解析和 `top` 计算抽成一个可用 `node:test` 单测的纯工具；再在 `MarkdownPreview.vue` 中按现有点击分流顺序接入该工具，并通过可选 prop 从 `MarkdownEdit.vue`、`GuideView.vue` 和 `PreviewView.vue` 显式传入外层滚动容器；最后用定点测试、定点 ESLint 和 Electron 手工冒烟确认不回归。

**Tech Stack:** Vue 3 `<script setup>`、Markdown 预览 DOM、node:test、ESLint

**Execution Constraints:** 只修改 `wj-markdown-editor-web` 包；所有格式化都必须在 `wj-markdown-editor-web/` 目录内对具体文件执行 `npx eslint --fix`；文档、注释和提交说明保持中文语义。

---

## File Structure

### 需要新增的文件

- `wj-markdown-editor-web/src/util/editor/previewAnchorLinkScrollUtil.js`
- `wj-markdown-editor-web/src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js`

### 需要修改的现有文件

- `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- `wj-markdown-editor-web/src/views/GuideView.vue`
- `wj-markdown-editor-web/src/views/PreviewView.vue`

### 文件职责约束

- `previewAnchorLinkScrollUtil.js` 只负责普通 hash 锚点的识别、目标元素查找、滚动容器解析和目标 `top` 计算；不依赖 Vue 生命周期，不处理图片、本地资源或脚注滚动。
- `previewAnchorLinkScrollUtil.test.js` 只用 `node:test + DOM 桩对象` 验证普通 hash 锚点的行为，不引入 `.vue` 挂载框架。
- `MarkdownPreview.vue` 继续作为点击事件委托入口，但只做顺序分流与工具调用，不把 hash 处理逻辑散落回组件内部。
- `MarkdownEdit.vue`、`GuideView.vue` 和 `PreviewView.vue` 只负责把正确的外层预览滚动容器传给 `MarkdownPreview.vue`；不改各自现有滚动同步、目录、搜索或图片逻辑。

## Chunk 1: Hash Anchor Scroll Core

### Task 1: 新增普通 hash 锚点滚动工具并用测试固定行为

**Files:**
- Create: `wj-markdown-editor-web/src/util/editor/previewAnchorLinkScrollUtil.js`
- Create: `wj-markdown-editor-web/src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js`

- [ ] **Step 1: 先写失败测试，固定普通锚点的受控滚动语义**

在 `previewAnchorLinkScrollUtil.test.js` 中至少覆盖以下场景：

```js
const handled = handlePreviewHashAnchorClick({
  event,
  previewRoot,
})

assert.equal(handled, true)
assert.equal(prevented, true)
assert.deepEqual(previewRoot.scrollToCalls, [{
  top: 140,
  behavior: 'smooth',
}])
```

以及：

- `href="https://example.com"` 时返回 `false`，且不调用 `preventDefault()`
- `href="#"` 时返回 `false`
- 找不到目标元素时返回 `false`
- `previewScrollContainer` 未传或返回空值时，回退到 `previewRoot`

测试桩约束：

- 事件对象至少模拟 `target` 与 `preventDefault()`
- 链接元素至少模拟 `closest()` 与 `getAttribute('href')`
- 容器元素至少模拟 `scrollTop`、`clientTop`、`scrollTo()`、`getBoundingClientRect()`
- 目标元素至少模拟 `getBoundingClientRect()`

- [ ] **Step 2: 运行聚焦测试，确认它按预期失败**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js
```

Expected: FAIL，提示模块不存在或行为断言不成立。

- [ ] **Step 3: 用最小实现补齐普通 hash 锚点工具**

在 `previewAnchorLinkScrollUtil.js` 中实现最小导出，建议至少包含：

```js
export function resolvePreviewScrollContainer({
  previewRoot,
  previewScrollContainer,
})

export function findPreviewAnchorTarget({
  previewRoot,
  href,
})

export function handlePreviewHashAnchorClick({
  event,
  previewRoot,
  previewScrollContainer,
})
```

实现要求：

- 只处理 `href.startsWith('#') === true` 且不等于 `#`
- 查找范围限定在 `previewRoot` 内部
- 目标 `top` 使用：

```js
targetRect.top - containerRect.top - container.clientTop + container.scrollTop
```

- 实际滚动调用固定为：

```js
container.scrollTo({
  top: targetTop,
  behavior: 'smooth',
})
```

- [ ] **Step 4: 重新运行聚焦测试，确认工具行为全部转绿**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js
```

Expected: PASS

- [ ] **Step 5: 按包执行定点 ESLint 格式化**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npx eslint --fix src/util/editor/previewAnchorLinkScrollUtil.js src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js
```

Expected: 退出码 `0`

- [ ] **Step 6: 提交当前任务**

```bash
git add wj-markdown-editor-web/src/util/editor/previewAnchorLinkScrollUtil.js wj-markdown-editor-web/src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js
git commit -m "feat(preview): add anchor link scroll utility"
```

## Chunk 2: Component Wiring

### Task 2: 将工具接入 `MarkdownPreview.vue`，并由调用方显式提供滚动容器

**Files:**
- Modify: `wj-markdown-editor-web/src/util/editor/previewAnchorLinkScrollUtil.js`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- Modify: `wj-markdown-editor-web/src/views/GuideView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js`

- [ ] **Step 1: 先补一个失败测试，固定“外层容器优先、脚注不被通用 hash 分支误拦截”**

在 `previewAnchorLinkScrollUtil.test.js` 中继续补至少两组用例：

```js
const handled = handlePreviewHashAnchorClick({
  event: createFootnoteEvent('#fn1'),
  previewRoot,
  previewScrollContainer: () => outerContainer,
})

assert.equal(handled, false)
assert.equal(outerContainer.scrollToCalls.length, 0)
```

```js
const handled = handlePreviewHashAnchorClick({
  event: createAnchorEvent('#section-2'),
  previewRoot,
  previewScrollContainer: () => outerContainer,
})

assert.equal(handled, true)
assert.equal(previewRoot.scrollToCalls.length, 0)
assert.equal(outerContainer.scrollToCalls.length, 1)
```

- [ ] **Step 2: 运行聚焦测试，确认新增断言先失败**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js
```

Expected: FAIL，说明当前工具或接线尚未覆盖“外层容器优先”和“脚注/外链保护”。

- [ ] **Step 3: 在 `MarkdownPreview.vue` 里接入普通 hash 锚点工具**

具体改动要求：

- 新增可选 prop：

```js
previewScrollContainer: {
  type: Function,
  default: () => null,
}
```

- 在 `handlePreviewClick()` 中保持既有顺序：
  1. 图片
  2. 本地资源链接
  3. 脚注
  4. 普通 hash 锚点
- 普通 hash 锚点分支调用 `handlePreviewHashAnchorClick(...)`
- 命中后立即 `return`
- 不修改现有脚注 `scrollIntoView()` 行为
- 不改动 `assetOpen`、图片预览和右键菜单逻辑

- [ ] **Step 4: 在 `MarkdownEdit.vue`、`GuideView.vue` 和 `PreviewView.vue` 中显式传入外层滚动容器**

接线要求：

- `MarkdownEdit.vue` 传入编辑页右侧实际带滚动条的 `previewRef`
- `GuideView.vue` 传入其 `previewContainerRef`
- `PreviewView.vue` 传入其真实滚动容器 `previewContainerRef`
- `ExportView.vue` 不改，保持组件自身降级逻辑，避免无关面扩大

示例接线：

```vue
<MarkdownPreview
  :content="props.modelValue"
  :preview-scroll-container="() => previewRef"
/>
```

以及：

```vue
<MarkdownPreview
  :content="content"
  :preview-scroll-container="() => previewContainerRef"
/>
```

- [ ] **Step 5: 重新运行聚焦测试并确认通过**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js
```

Expected: PASS

- [ ] **Step 6: 按包执行定点 ESLint 格式化**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npx eslint --fix src/util/editor/previewAnchorLinkScrollUtil.js src/components/editor/MarkdownPreview.vue src/components/editor/MarkdownEdit.vue src/views/GuideView.vue src/views/PreviewView.vue src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js
```

Expected: 退出码 `0`

- [ ] **Step 7: 提交当前任务**

```bash
git add wj-markdown-editor-web/src/util/editor/previewAnchorLinkScrollUtil.js wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue wj-markdown-editor-web/src/views/GuideView.vue wj-markdown-editor-web/src/views/PreviewView.vue wj-markdown-editor-web/src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js
git commit -m "feat(preview): support smooth hash anchor scrolling"
```

## Chunk 3: Final Verification

### Task 3: 做最终验证并确认不回归现有链接行为

**Files:**
- Modify: `wj-markdown-editor-web/src/util/editor/previewAnchorLinkScrollUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- Modify: `wj-markdown-editor-web/src/views/GuideView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`

- [ ] **Step 1: 运行最终相关测试**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js src/components/editor/composables/__tests__/usePreviewSync.test.js
```

Expected: PASS

- [ ] **Step 2: 重新对全部改动文件执行定点 ESLint**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npx eslint --fix src/util/editor/previewAnchorLinkScrollUtil.js src/util/editor/__tests__/previewAnchorLinkScrollUtil.test.js src/components/editor/MarkdownPreview.vue src/components/editor/MarkdownEdit.vue src/views/GuideView.vue src/views/PreviewView.vue
```

Expected: 退出码 `0`

- [ ] **Step 3: 构建 web 并启动 Electron 做手工冒烟**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npm run build
```

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run start
```

手工验证以下场景：

- 编辑页预览区点击普通 `#` 链接时，右侧预览区平滑滚动到目标标题顶部
- Guide 页面点击普通 `#` 链接时，Guide 预览区域平滑滚动到目标标题顶部
- 纯预览页点击普通 `#` 链接时，预览滚动区域平滑滚动到目标标题顶部
- 点击脚注引用和脚注返回链接，行为与改动前一致
- 点击 `http/https` 链接，仍按当前方式打开
- 点击本地资源链接，仍触发现有资源打开逻辑
- 点击图片，仍打开图片预览
- 点击普通 `#` 链接后，浏览器地址栏和应用 URL 不出现新的 hash

- [ ] **Step 4: 检查工作区状态**

Run:

```bash
git status --short
```

Expected: 只包含本计划内文件；没有额外包的改动。

Plan complete and saved to `docs/superpowers/plans/2026-03-19-preview-anchor-link-scroll.md`. Two execution options:

1. Subagent-Driven (recommended) - 我逐任务派发子代理执行并在任务之间做审核

2. Inline Execution - 我在当前会话里按计划顺序直接执行

Which approach?
