# Preview Layout Index Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有预览渲染语义的前提下，引入第一阶段预览结构索引，消除同步滚动与联动高亮热路径中的重复 DOM 扫描。

**Architecture:** 方案只优化消费层，不改 `MarkdownPreview.vue` 的整文渲染链路。新增独立的 `previewLayoutIndex` 工具，在预览刷新完成后统一扫描结构节点并建立“行号到最佳节点”的映射；`usePreviewSync` 与 `useAssociationHighlight` 优先读取索引，未命中时自动回退旧逻辑，几何信息仍然通过当前真实 DOM 读取。

**Tech Stack:** Vue 3、CodeMirror 6、Node 内置 `node:test`、ES Modules、ESLint

---

## 执行约束

- 直接在当前分支开发，不新建 worktree
- 允许使用 subagent 协助实现或评审，但子任务必须边界清晰
- 第一阶段不修改 `MarkdownPreview.vue` 的整文渲染语义
- 第一阶段不修改资源删除、预览搜索、大纲生成的业务语义
- 第一阶段不改造 `PreviewView.vue`
- 第一阶段不得把 `MarkdownEdit.vue` 内预览滚动锚点 `capture/restore` 改为复用 `previewLayoutIndex`、`findPreviewElementByLine()`、`findPreviewElementAtScrollTop()`，必须继续保持 legacy `findPreviewElementByAnchor()` 链路
- 第一阶段不得改变预览区 click 委托链路，不得影响资源链接打开、脚注或页内 hash 跳转、图片预览等既有行为
- 所有新增注释与文档使用中文
- 必须确保资源删除时“查找相同引用数 / 删除当前引用 / 删除全部引用”等既有行为不受影响

## 命令执行目录

- 除非步骤里单独说明，所有 `node --test`、`npx eslint --fix`、`git add`、`git commit` 命令均在 `wj-markdown-editor-web/` 目录执行
- 只有文档修正相关的 `git add docs/...`、`git commit` 命令在仓库根目录执行

## 文件结构

### 新增文件

- `wj-markdown-editor-web/src/util/editor/previewLayoutIndexUtil.js`
  - 负责扫描预览结构节点、执行条目校验，并提供统一查找 helper
- `wj-markdown-editor-web/src/util/editor/__tests__/previewLayoutIndexUtil.test.js`
  - 负责验证索引构建、按行查找、按滚动位置查找、回退条件
- `wj-markdown-editor-web/src/components/editor/composables/__tests__/useAssociationHighlight.test.js`
  - 负责验证联动高亮接入索引后的行为
- `wj-markdown-editor-web/src/components/editor/previewRefreshCoordinator.js`
  - 只负责收口“预览刷新完成后先重建索引，再恢复高亮，再关闭搜索”的顺序
- `wj-markdown-editor-web/src/components/editor/__tests__/previewRefreshCoordinator.test.js`
  - 负责验证刷新完成后的挂接顺序
- `wj-markdown-editor-web/src/components/editor/markdownEditPreviewLayoutIndexWiring.js`
  - 只负责收口 `MarkdownEdit.vue` 中索引实例创建、composable 注入、以及 `rebuildPreviewLayoutIndex()` 接线
- `wj-markdown-editor-web/src/components/editor/__tests__/markdownEditPreviewLayoutIndexWiring.test.js`
  - 负责验证 `MarkdownEdit.vue` 的真实接线不会遗漏

### 修改文件

- `wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js`
  - 优先通过索引查找预览节点，保留旧逻辑回退
- `wj-markdown-editor-web/src/components/editor/composables/useAssociationHighlight.js`
  - 改为复用统一 helper 查找预览节点
- `wj-markdown-editor-web/src/components/editor/composables/__tests__/usePreviewSync.test.js`
  - 补齐索引优先与回退测试
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
  - 在编辑页持有索引实例，并接入预览刷新协调 helper

### 禁止修改文件

以下文件不属于第一阶段改造范围，实施过程中禁止修改：

- `wj-markdown-editor-web/src/util/editor/previewAssetRemovalUtil.js`
- `wj-markdown-editor-web/src/util/editor/previewAssetSessionController.js`
- `wj-markdown-editor-web/src/util/editor/previewAssetDeleteDecisionUtil.js`
- `wj-markdown-editor-web/src/util/searchBarController.js`
- `wj-markdown-editor-web/src/util/searchTargetBridgeUtil.js`
- `wj-markdown-editor-web/src/components/SearchBar.vue`
- `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- `wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue`
- `wj-markdown-editor-web/src/components/editor/PreviewAssetContextMenu.vue`
- `wj-markdown-editor-web/src/views/EditorView.vue`

## Task 1: 新建预览布局索引工具

**Files:**
- Create: `wj-markdown-editor-web/src/util/editor/previewLayoutIndexUtil.js`
- Test: `wj-markdown-editor-web/src/util/editor/__tests__/previewLayoutIndexUtil.test.js`

- [ ] **Step 1: 编写失败测试，覆盖索引核心语义**

```js
test('同一行有多个候选节点时，优先返回跨度更小且层级更深的节点', () => {
  const index = createPreviewLayoutIndex()
  const root = createPreviewRoot([
    createPreviewNode({ lineStart: 3, lineEnd: 8, depth: 1 }),
    createPreviewNode({ lineStart: 3, lineEnd: 5, depth: 2 }),
  ])

  index.rebuild(root)

  const result = index.findByLine(4, 10)
  assert.equal(result?.entry?.lineStart, 3)
  assert.equal(result?.entry?.lineEnd, 5)
  assert.equal(result?.matchedLineNumber, 4)
})

test('当前行没有映射节点时，会向后寻找最近可映射行', () => {
  const result = index.findByLine(7, 20)
  assert.equal(result?.found, false)
  assert.equal(result?.matchedLineNumber > 7, true)
})

test('空索引与非法输入会安全返回空结果', () => {
  const emptyIndex = createPreviewLayoutIndex()
  assert.equal(emptyIndex.findByLine(null, 10).entry, null)
  assert.equal(emptyIndex.findAtScrollTop(Number.NaN, {}).entry, null)
})

test('条目元素已失效时，共享 helper 应回退旧 DOM 查找逻辑', () => {
  const index = createPreviewLayoutIndex()
  const root = createPreviewRoot([
    createPreviewNode({ lineStart: 2, lineEnd: 2, disconnected: true }),
  ])

  index.rebuild(root)

  const result = findPreviewElementByLine({
    previewLayoutIndex: index,
    rootElement: root,
    lineNumber: 2,
    maxLineNumber: 10,
  })

  assert.equal(result.source, 'legacy-dom')
})

test('当根节点已不再包含条目元素时，共享 helper 会回退旧 DOM 查找逻辑', () => {
  // 验证 root.contains(element) 失败时不会继续使用陈旧条目
})

test('当元素当前 data-line-start/data-line-end 与条目记录不一致时，共享 helper 会回退旧 DOM 查找逻辑', () => {
  // 验证 dataset 不一致时不会继续使用陈旧条目
})

test('按滚动位置查找返回 entry/index/source 结构，不暴露 found 语义', () => {
  const result = findPreviewElementAtScrollTop({
    previewLayoutIndex: index,
    rootElement: root,
    scrollTop: 120,
  })

  assert.equal(typeof result.index, 'number')
  assert.equal('source' in result, true)
  assert.equal('found' in result, false)
})

test('旧 DOM 回退命中后，entry 仍返回归一化结构', () => {
  const result = findPreviewElementByLine({
    previewLayoutIndex: index,
    rootElement: root,
    lineNumber: 5,
    maxLineNumber: 20,
  })

  assert.equal(result.entry?.lineStart, 5)
  assert.equal(result.entry?.lineEnd, 6)
  assert.equal(typeof result.entry?.order, 'number')
  assert.equal(result.matchedLineNumber, 5)
})

test('按滚动位置查找时，同 top 嵌套节点取 DOM 顺序中最后一个有效节点', () => {
  const result = findPreviewElementAtScrollTop({
    previewLayoutIndex: index,
    rootElement: root,
    scrollTop: 240,
  })

  assert.equal(result.entry?.element, nestedElement)
})

test('按滚动位置查找会先使用 hint，必要时再回退完整扫描', () => {
  const result = findPreviewElementAtScrollTop({
    previewLayoutIndex: index,
    rootElement: root,
    scrollTop: 360,
  })

  assert.equal(result.entry !== null, true)
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run:

```bash
node --test src/util/editor/__tests__/previewLayoutIndexUtil.test.js
```

Expected: FAIL，提示 `createPreviewLayoutIndex` 不存在或行为不匹配。

- [ ] **Step 3: 以最小实现创建索引工具**

```js
export function createPreviewLayoutIndex() {
  let entries = []
  let mappedLines = []
  let lineToBestEntry = new Map()
  let version = 0
  let lastScrollHitIndex = -1

  return {
    rebuild(rootElement) {
      // 扫描结构节点并重建映射
    },
    clear() {
      entries = []
      mappedLines = []
      lineToBestEntry = new Map()
      lastScrollHitIndex = -1
    },
    hasEntries() {
      return entries.length > 0
    },
    findByLine(lineNumber, maxLineNumber) {
      // 按现有语义返回结果
    },
    findAtScrollTop(scrollTop, options = {}) {
      // 先用 hint，再必要时回退完整扫描
    },
  }
}

export function findPreviewElementByLine(options) {
  // 统一处理索引优先、条目校验失败回退旧 DOM 查找
  // 无论 source 是 index 还是 legacy-dom，entry 都返回统一 shape
  // 返回 entry/found/matchedLineNumber/source
}

export function findPreviewElementAtScrollTop(options) {
  // 统一处理滚动位置命中与回退逻辑，返回 entry/index/source
  // 选取规则保持为“最后一个 top <= scrollTop 的有效节点”
}
```

- [ ] **Step 4: 运行索引测试，确认通过**

Run:

```bash
node --test src/util/editor/__tests__/previewLayoutIndexUtil.test.js
```

Expected: PASS，索引语义测试全部通过。

- [ ] **Step 5: 按文件执行 ESLint 格式化**

Run:

```bash
npx eslint --fix src/util/editor/previewLayoutIndexUtil.js src/util/editor/__tests__/previewLayoutIndexUtil.test.js
```

Expected: 无报错退出。

- [ ] **Step 6: 提交当前任务**

```bash
git add src/util/editor/previewLayoutIndexUtil.js src/util/editor/__tests__/previewLayoutIndexUtil.test.js
git commit -m "feat: add preview layout index utility"
```

## Task 2: 让同步滚动优先读取索引

**Files:**
- Modify: `wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js`
- Modify: `wj-markdown-editor-web/src/components/editor/composables/__tests__/usePreviewSync.test.js`

- [ ] **Step 1: 为同步滚动补失败测试，覆盖索引优先路径与旧逻辑回退**

```js
test('索引可用时，同步滚动优先通过索引命中预览节点', () => {
  const previewLayoutIndex = {
    findByLine() {
      return { entry: targetEntry, found: true }
    },
    findAtScrollTop() {
      return { entry: targetEntry }
    },
  }

  const { syncEditorToPreview } = usePreviewSync({
    editorViewRef,
    previewRef,
    scrolling,
    editorScrollTop,
    previewLayoutIndex,
  })

  syncEditorToPreview()
  assert.equal(previewRef.value.scrollToCalls.length, 1)
  assert.equal(previewLayoutIndex.findByLineCalls[0].lineNumber > 0, true)
})

test('索引命中失效元素时，同步滚动会自动回退旧 DOM 查找', () => {
  // 构造 isConnected=false 的条目，验证仍能滚动到旧逻辑命中的节点
})

test('预览区滚动回写编辑区时，优先通过 findPreviewElementAtScrollTop 命中节点', () => {
  // 验证 syncPreviewToEditor() 已接入滚动位置 helper
  // 且预览区到编辑区方向不再直接走旧 querySelectorAll 热路径
})

test('预览区滚动回写编辑区时，滚动位置 helper 失效会回退旧 DOM 路径', () => {
  // 验证 syncPreviewToEditor() 保留回退逻辑
})
```

- [ ] **Step 2: 运行同步滚动测试，确认当前失败**

Run:

```bash
node --test src/components/editor/composables/__tests__/usePreviewSync.test.js
```

Expected: FAIL，提示 `usePreviewSync` 尚未接收或使用索引。

- [ ] **Step 3: 最小改造 `usePreviewSync`，优先走索引并保留旧逻辑**

```js
const previewElement = findPreviewElementByLine({
  previewLayoutIndex,
  rootElement: previewRef.value,
  lineNumber,
  maxLineNumber: view.state.doc.lines,
})
```

滚动位置查找使用：

```js
const currentElement = findPreviewElementAtScrollTop({
  previewLayoutIndex,
  rootElement: previewRef.value,
  scrollTop: previewRef.value.scrollTop,
})
```

- [ ] **Step 4: 运行同步滚动测试，确认通过**

Run:

```bash
node --test src/components/editor/composables/__tests__/usePreviewSync.test.js
```

Expected: PASS，现有恢复保护与新索引路径测试同时通过。

- [ ] **Step 5: 按文件执行 ESLint 格式化**

Run:

```bash
npx eslint --fix src/components/editor/composables/usePreviewSync.js src/components/editor/composables/__tests__/usePreviewSync.test.js
```

Expected: 无报错退出。

- [ ] **Step 6: 提交当前任务**

```bash
git add src/components/editor/composables/usePreviewSync.js src/components/editor/composables/__tests__/usePreviewSync.test.js
git commit -m "refactor: use preview layout index in preview sync"
```

## Task 3: 让联动高亮优先读取索引

**Files:**
- Modify: `wj-markdown-editor-web/src/components/editor/composables/useAssociationHighlight.js`
- Test: `wj-markdown-editor-web/src/components/editor/composables/__tests__/useAssociationHighlight.test.js`

- [ ] **Step 1: 编写失败测试，覆盖光标高亮与回退路径**

```js
test('光标高亮时，优先使用索引命中的预览节点', () => {
  const previewLayoutIndex = {
    findByLine() {
      return { entry: targetEntry, found: true }
    },
  }

  const { highlightByEditorCursor } = useAssociationHighlight({
    editorViewRef,
    previewRef,
    previewController,
    associationHighlight,
    themeRef,
    previewLayoutIndex,
  })

  highlightByEditorCursor(editorState)
  assert.equal(targetEntry.element.classList.contains('wj-preview-link-highlight'), true)
})

test('索引缺失或失效时，联动高亮会回退旧查找逻辑', () => {
  // 验证回退后仍能命中预览节点
})

test('点击预览区后，双侧高亮语义保持不变', () => {
  // 验证 onPreviewAreaClick() 仍按 data-line-start / data-line-end 工作
  // 且不会因为索引接入改变点击路径行为
})

test('点击预览区资源链接或脚注锚点时，不会阻断既有 click 委托链路', () => {
  // 验证 onPreviewAreaClick() 不调用 preventDefault / stopPropagation
  // 资源打开、脚注跳转、页内 hash 跳转仍由 MarkdownPreview 原有 click 处理链路负责
})
```

- [ ] **Step 2: 运行联动高亮测试，确认当前失败**

Run:

```bash
node --test src/components/editor/composables/__tests__/useAssociationHighlight.test.js
```

Expected: FAIL，提示索引能力尚未接入。

- [ ] **Step 3: 最小改造 `useAssociationHighlight`，按索引命中预览节点**

```js
const previewElement = findPreviewElementByLine({
  previewLayoutIndex,
  rootElement: previewRef.value,
  lineNumber: normalizedLineNumber,
  maxLineNumber: view.state.doc.lines,
})
```

- [ ] **Step 4: 运行联动高亮测试，确认通过**

Run:

```bash
node --test src/components/editor/composables/__tests__/useAssociationHighlight.test.js
```

Expected: PASS，索引路径与点击路径都通过。

- [ ] **Step 5: 按文件执行 ESLint 格式化**

Run:

```bash
npx eslint --fix src/components/editor/composables/useAssociationHighlight.js src/components/editor/composables/__tests__/useAssociationHighlight.test.js
```

Expected: 无报错退出。

- [ ] **Step 6: 提交当前任务**

```bash
git add src/components/editor/composables/useAssociationHighlight.js src/components/editor/composables/__tests__/useAssociationHighlight.test.js
git commit -m "refactor: use preview layout index in association highlight"
```

## Task 4: 在编辑页持有并重建索引

**Files:**
- Create: `wj-markdown-editor-web/src/components/editor/previewRefreshCoordinator.js`
- Test: `wj-markdown-editor-web/src/components/editor/__tests__/previewRefreshCoordinator.test.js`
- Create: `wj-markdown-editor-web/src/components/editor/markdownEditPreviewLayoutIndexWiring.js`
- Test: `wj-markdown-editor-web/src/components/editor/__tests__/markdownEditPreviewLayoutIndexWiring.test.js`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`

- [ ] **Step 1: 先写失败测试，锁定预览刷新完成后的执行顺序**

```js
test('预览刷新完成后，先重建索引，再恢复高亮，最后关闭预览搜索', () => {
  const callOrder = []
  const coordinator = createPreviewRefreshCoordinator({
    rebuildIndex: () => callOrder.push('rebuild-index'),
    restoreHighlight: () => callOrder.push('restore-highlight'),
    closePreviewSearchBar: () => callOrder.push('close-search'),
  })

  coordinator.onRefreshComplete()

  assert.deepEqual(callOrder, [
    'rebuild-index',
    'restore-highlight',
    'close-search',
  ])
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run:

```bash
node --test src/components/editor/__tests__/previewRefreshCoordinator.test.js
```

Expected: FAIL，提示 `createPreviewRefreshCoordinator` 不存在或顺序不匹配。

- [ ] **Step 3: 再写失败测试，锁定 `MarkdownEdit.vue` 的真实接线**

```js
test('会创建同一个 previewLayoutIndex 实例并注入 usePreviewSync 与 useAssociationHighlight', () => {
  const previewLayoutIndex = {}
  const usePreviewSyncSpy = mock.fn()
  const useAssociationHighlightSpy = mock.fn()

  setupMarkdownEditPreviewLayoutIndexWiring({
    createPreviewLayoutIndex: () => previewLayoutIndex,
    usePreviewSync: usePreviewSyncSpy,
    useAssociationHighlight: useAssociationHighlightSpy,
  })

  assert.equal(usePreviewSyncSpy.mock.calls[0].arguments[0].previewLayoutIndex, previewLayoutIndex)
  assert.equal(useAssociationHighlightSpy.mock.calls[0].arguments[0].previewLayoutIndex, previewLayoutIndex)
})

test('refreshComplete 时会对当前 previewRef 执行 rebuild', () => {
  // 验证 wiring helper 暴露的 rebuildPreviewLayoutIndex() 会读取 previewRef.value
})

test('第一阶段保持预览滚动锚点 capture/restore 走 legacy 实现，不在 wiring helper 中接入索引', () => {
  // 验证 wiring helper 不负责 findByAnchor / restoreAnchor 相关接线
  // 且不会把 previewLayoutIndex、findPreviewElementByLine()、findPreviewElementAtScrollTop() 注入 anchor 链路
})
```

- [ ] **Step 4: 运行接线测试，确认当前失败**

Run:

```bash
node --test src/components/editor/__tests__/markdownEditPreviewLayoutIndexWiring.test.js
```

Expected: FAIL，提示 wiring helper 不存在或未按预期接线。

- [ ] **Step 5: 实现刷新协调 helper与接线 helper，并在 `MarkdownEdit.vue` 中接入**

```js
const previewLayoutIndexWiring = setupMarkdownEditPreviewLayoutIndexWiring({
  createPreviewLayoutIndex,
  usePreviewSync,
  useAssociationHighlight,
  previewRef,
})

const previewRefreshCoordinator = createPreviewRefreshCoordinator({
  rebuildIndex: () => previewLayoutIndexWiring.rebuildPreviewLayoutIndex(),
  restoreHighlight: previewLayoutIndexWiring.associationHighlight.restorePreviewLinkedHighlight,
  closePreviewSearchBar,
})
```

约束：

- `markdownEditPreviewLayoutIndexWiring.js` 只负责创建 `previewLayoutIndex`、把同一实例注入两个 composable，并暴露 `rebuildPreviewLayoutIndex()`
- `previewRefreshCoordinator.js` 不负责创建索引实例，也不直接依赖 composable
- `MarkdownEdit.vue` 内现有预览滚动锚点 capture / restore 第一阶段继续保持 legacy，不在本任务接入索引
- `MarkdownEdit.vue` 内现有预览滚动锚点 capture / restore 不得改为复用 `previewLayoutIndex`、`findPreviewElementByLine()`、`findPreviewElementAtScrollTop()`，继续使用现有 `findPreviewElementByAnchor()` 语义

- [ ] **Step 6: 运行挂接测试与相关单测，确认通过**

```js
node --test src/components/editor/__tests__/previewRefreshCoordinator.test.js
node --test src/components/editor/__tests__/markdownEditPreviewLayoutIndexWiring.test.js
node --test src/components/editor/composables/__tests__/usePreviewSync.test.js
node --test src/components/editor/composables/__tests__/useAssociationHighlight.test.js
node --test src/components/editor/composables/__tests__/markdownEditScrollAnchorCaptureUtil.test.js
```

Expected: PASS，且编辑页现有逻辑未被破坏。

- [ ] **Step 7: 按文件执行 ESLint 格式化**

Run:

```bash
npx eslint --fix src/components/editor/previewRefreshCoordinator.js src/components/editor/__tests__/previewRefreshCoordinator.test.js src/components/editor/markdownEditPreviewLayoutIndexWiring.js src/components/editor/__tests__/markdownEditPreviewLayoutIndexWiring.test.js src/components/editor/MarkdownEdit.vue
```

Expected: 无报错退出。

- [ ] **Step 8: 提交当前任务**

```bash
git add src/components/editor/previewRefreshCoordinator.js src/components/editor/__tests__/previewRefreshCoordinator.test.js src/components/editor/markdownEditPreviewLayoutIndexWiring.js src/components/editor/__tests__/markdownEditPreviewLayoutIndexWiring.test.js src/components/editor/MarkdownEdit.vue
git commit -m "refactor: wire preview layout index in markdown edit"
```

## Task 5: 全量验证与收尾

**Files:**
- Modify: `docs/superpowers/specs/2026-03-21-preview-layout-index-phase1-design.md`
- Modify: `docs/superpowers/plans/2026-03-21-preview-layout-index-phase1.md`

- [ ] **Step 1: 运行第一阶段全部测试**

Run:

```bash
node --test src/util/editor/__tests__/previewLayoutIndexUtil.test.js
node --test src/components/editor/composables/__tests__/usePreviewSync.test.js
node --test src/components/editor/composables/__tests__/useAssociationHighlight.test.js
node --test src/components/editor/__tests__/previewRefreshCoordinator.test.js
node --test src/components/editor/__tests__/markdownEditPreviewLayoutIndexWiring.test.js
node --test src/components/editor/composables/__tests__/markdownEditScrollAnchorCaptureUtil.test.js
node --test src/components/editor/composables/__tests__/useViewScrollAnchor.test.js
node --test src/util/__tests__/searchTargetBridgeWiring.test.js
```

Expected: 全部 PASS。

- [ ] **Step 2: 运行本阶段涉及文件的 ESLint**

Run:

```bash
npx eslint --fix src/util/editor/previewLayoutIndexUtil.js src/util/editor/__tests__/previewLayoutIndexUtil.test.js src/components/editor/composables/usePreviewSync.js src/components/editor/composables/useAssociationHighlight.js src/components/editor/composables/__tests__/usePreviewSync.test.js src/components/editor/composables/__tests__/useAssociationHighlight.test.js src/components/editor/previewRefreshCoordinator.js src/components/editor/__tests__/previewRefreshCoordinator.test.js src/components/editor/markdownEditPreviewLayoutIndexWiring.js src/components/editor/__tests__/markdownEditPreviewLayoutIndexWiring.test.js src/components/editor/MarkdownEdit.vue
```

Expected: 无报错退出。

- [ ] **Step 3: 手工验证编辑页关键路径**

检查点：

- 打开含多级标题、代码块、图片的文档
- 在编辑区连续滚动，确认预览区跟随正常
- 在预览区连续滚动，确认编辑区跟随正常
- 快速移动光标，确认联动高亮仍稳定
- 关闭并重新打开预览面板，确认行为无异常
- 切页或激活恢复后，确认预览滚动锚点仍能正确 capture / restore，且行为保持 legacy 语义

- [ ] **Step 4: 手工执行非回归验证，确认未影响其他功能**

检查点：

- 预览区资源右键菜单仍可正常打开
- 点击“在资源所在目录中打开”后仍触发正确行为
- 打开一个同一资源被多次引用的 Markdown，确认预览区资源菜单显示后，引用统计仍正确
- 执行“删除当前引用”，确认只删除当前引用，不影响其余同资源引用
- 执行“删除全部引用”，确认当前文档内同资源引用全部被移除
- 打开预览搜索，搜索命中后确认仍可高亮、跳转、关闭并清理标记
- 点击预览区资源链接，确认仍触发正确打开行为
- 点击脚注引用、脚注返回链接或页内 hash 锚点，确认仍能正确跳转；目标不存在时仍保持原有提示语义
- 点击预览区图片，确认打开的是正确图片
- 打开目录，确认标题列表仍正确，点击后能跳到对应标题

- [ ] **Step 5: 更新文档中的实际执行结果**

说明：

- 这是条件步骤：只有在发现文档存在客观错误时才执行
- 若没有发现文档错误，明确记录“无文档修正，跳过该步”
- 只允许修正文档中客观错误的文件路径、命令或接口名
- 不允许通过修改设计或计划文档来追认实现偏差
- 若实现需要偏离当前设计范围，必须先停下来重新确认，而不是直接改文档

- [ ] **Step 6: 条件提交文档修正**

```bash
git add docs/superpowers/specs/2026-03-21-preview-layout-index-phase1-design.md docs/superpowers/plans/2026-03-21-preview-layout-index-phase1.md
git commit -m "docs: finalize preview layout index phase1 design and plan"
```

说明：

- 只有 Step 5 产生了实际文档修正时才执行本步
- 若 Step 5 跳过，则本步同步跳过，不创建空提交
