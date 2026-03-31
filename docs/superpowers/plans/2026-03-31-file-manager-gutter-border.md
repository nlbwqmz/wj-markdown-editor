# 文件管理栏 Gutter 边界实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让主窗口文件管理栏右侧边界完全由 `gutter` 本身承担，移除面板容器自带右边框，并把 `gutter` 的视觉宽度和真实轨道宽度一起收成 `1px` 且保持可见。

**Architecture:** 这次只动主窗口文件管理栏宿主层，不扩散到编辑器内部或其他页面。先用 `homeViewFilePanelLayoutUtil` 的测试锁定 `1px` 轨道列定义，再用 `HomeView` 宿主测试锁定“右边框迁移到 gutter、gutter 可见且不能透明”的行为，最后做定向格式化和聚焦回归。

**Tech Stack:** Vue 3 + split-grid + Vitest + ESLint

---

## 文件结构与职责

- Modify: `wj-markdown-editor-web/src/components/layout/homeViewFilePanelLayoutUtil.js`
  - 把文件管理栏展开态的 grid 列定义从 `2px` gutter 改为 `1px` gutter。
- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
  - 移除文件管理栏面板容器的右边框。
  - 让 `gutter` 直接显示为可见的 `1px` 分隔线，并继续承担拖拽轨道。
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js`
  - 覆盖 `1px` gutter 轨道列定义与拖拽读取列宽。
- Modify: `wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js`
  - 覆盖“面板不再自带右边框”和“gutter 不得透明”的宿主层断言。

## 实现约束

- 只修改主窗口文件管理栏区域，不修改 `PreviewView.vue`、`GuideView.vue`、`MarkdownEdit.vue` 的其他 gutter。
- 关闭文件管理栏后的宿主退化行为保持不变，仍然是 `grid-template-columns: 1fr`。
- `gutter` 必须可见，不能继续使用以下任一隐藏或透明表达：
  - `op-0`
  - `opacity: 0`
  - `hidden`
  - `invisible`
- 不新增透明热区、伪元素或额外拖拽节点；真实轨道宽度就是 `1px`。
- 所有新增注释使用中文。

### Task 1: 收口布局 util 的 gutter 轨道宽度

**Files:**
- Modify: `wj-markdown-editor-web/src/components/layout/homeViewFilePanelLayoutUtil.js`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js`

- [ ] **Step 1: 先写失败测试，锁定 `1px` gutter 轨道**

```js
import {
  FILE_MANAGER_PANEL_DEFAULT_WIDTH,
  resolveHomeViewFilePanelGridTemplateColumns,
} from '../homeViewFilePanelLayoutUtil.js'

it('文件管理栏展开态的 grid 列定义应使用 1px gutter 轨道', () => {
  expect(resolveHomeViewFilePanelGridTemplateColumns(FILE_MANAGER_PANEL_DEFAULT_WIDTH)).toBe('260px 1px 1fr')
})

it('拖拽回调会按当前 1px 轨道宽度钳制 panel 宽度', async () => {
  const controller = createHomeViewFilePanelLayoutController({
    hostRef: ref(createHostElement()),
    gutterRef: ref(createGutterElement()),
    panelWidthRef,
    nextTick,
    readComputedStyle: () => ({
      gridTemplateColumns: '520px 1px 1fr',
    }),
  })
  await controller.rebuildSplitLayout(true)
  homeViewFilePanelLayoutState.splitCalls[0].onDrag()
  expect(panelWidthRef.value).toBe(FILE_MANAGER_PANEL_MAX_WIDTH)
})
```

- [ ] **Step 2: 运行 util 测试，确认当前失败**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js`

Expected: FAIL，旧实现仍然返回 `260px 2px 1fr` 或仍使用 `520px 2px 1fr` 作为拖拽读取示例。

- [ ] **Step 3: 写最小实现，把列定义改成 `1px`**

```js
export function resolveHomeViewFilePanelGridTemplateColumns(width) {
  return `${clampFileManagerPanelWidth(width)}px 1px 1fr`
}
```

- [ ] **Step 4: 重跑 util 测试，确认通过**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js`

Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add wj-markdown-editor-web/src/components/layout/homeViewFilePanelLayoutUtil.js \
  wj-markdown-editor-web/src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js
git commit -m "test(layout): cover 1px file manager gutter track"
```

### Task 2: 调整 HomeView 宿主，让 gutter 承担可见边界

**Files:**
- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
- Modify: `wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

- [ ] **Step 1: 先写失败测试，锁定“边界归属”和“gutter 可见”**

```js
it('文件管理栏宿主应把右边界交给 gutter，而不是 panel slot', async () => {
  const wrapper = await mountHomeView()
  const fileManagerPanelSlot = wrapper.get('[data-testid="home-file-manager-panel-slot"]')
  expect(fileManagerPanelSlot.classes()).not.toContain('b-r-1')
  expect(fileManagerPanelSlot.classes()).not.toContain('b-r-border-primary')
  expect(fileManagerPanelSlot.classes()).not.toContain('b-r-solid')
  expect(fileManagerPanelSlot.classes()).toContain('b-t-1')
})

it('文件管理栏 gutter 必须保持可见，不能继续透明', async () => {
  const wrapper = await mountHomeView()
  const fileManagerGutter = wrapper.get('[data-testid="home-file-manager-gutter"]')
  expect(fileManagerGutter.classes()).toContain('b-t-1')
  expect(fileManagerGutter.classes()).not.toContain('op-0')
  expect(fileManagerGutter.classes()).not.toContain('hidden')
  expect(fileManagerGutter.classes()).not.toContain('invisible')
})
```

- [ ] **Step 2: 运行宿主测试，确认当前失败**

Run in `wj-markdown-editor-web/`: `npx vitest run src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

Expected: FAIL，当前 `home-file-manager-panel-slot` 仍带 `b-r-*`，且 `home-file-manager-gutter` 仍带 `op-0`。

- [ ] **Step 3: 写最小实现，移除 panel 右边框并让 gutter 常驻可见**

```vue
<div
  v-if="store.fileManagerPanelVisible"
  data-testid="home-file-manager-panel-slot"
  class="h-full min-w-0 overflow-hidden b-t-1 b-t-border-primary b-t-solid"
>
  <FileManagerPanel />
</div>
<div
  v-if="store.fileManagerPanelVisible"
  ref="fileManagerGutterRef"
  data-testid="home-file-manager-gutter"
  class="home-view__file-manager-gutter h-full cursor-col-resize b-t-1 b-t-border-primary b-t-solid"
/>
```

- [ ] **Step 4: 用明确样式保证 gutter 可见且只有 `1px` 线体语义**

```vue
<style scoped lang="scss">
.home-view__file-manager-gutter {
  background-color: var(--wj-markdown-border-primary);
}
</style>
```

- [ ] **Step 5: 重跑宿主测试，确认通过**

Run in `wj-markdown-editor-web/`: `npx vitest run src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

Expected: PASS

- [ ] **Step 6: 提交本任务**

```bash
git add wj-markdown-editor-web/src/views/HomeView.vue \
  wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js
git commit -m "feat(layout): move file manager border to gutter"
```

### Task 3: 定向格式化与最终验证

**Files:**
- Modify: `wj-markdown-editor-web/src/components/layout/homeViewFilePanelLayoutUtil.js`
- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

- [ ] **Step 1: 对本轮实际改动文件执行 ESLint 修复**

Run in `wj-markdown-editor-web/`: `npx eslint --fix src/components/layout/homeViewFilePanelLayoutUtil.js src/views/HomeView.vue src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

Expected: exit code `0`

- [ ] **Step 2: 运行聚焦回归**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

Expected: PASS

- [ ] **Step 3: 执行 web 包全量回归**

Run in `wj-markdown-editor-web/`: `npm run test:run`

Expected: PASS

- [ ] **Step 4: 使用 `@superpowers:verification-before-completion` 复核验证输出**

验证要点：
- `homeViewFilePanelLayoutUtil.vitest.test.js` 通过，证明 gutter 轨道已从 `2px` 收口为 `1px`。
- `homeViewFileManagerHost.vitest.test.js` 通过，证明 panel 右边框已移除，gutter 不再透明。
- `homeViewFileManagerHost.vitest.test.js` 中原有“关闭态退化为 1fr”和“关闭后再打开会重建 split-grid”相关断言继续通过，证明这轮改动没有破坏保留语义。
- `npm run test:run` 通过，证明本轮主窗口宿主调整未破坏 web 侧其他测试。

- [ ] **Step 5: 提交最终结果**

```bash
git add wj-markdown-editor-web/src/components/layout/homeViewFilePanelLayoutUtil.js \
  wj-markdown-editor-web/src/views/HomeView.vue \
  wj-markdown-editor-web/src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js \
  wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js \
  docs/superpowers/plans/2026-03-31-file-manager-gutter-border.md
git commit -m "fix(layout): align file manager gutter border"
```
