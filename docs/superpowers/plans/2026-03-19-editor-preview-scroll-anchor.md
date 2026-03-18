# Editor Preview Scroll Anchor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前分支上实现编辑页与预览页切换时的滚动锚点保持，同时继续保留 `keep-alive` 带来的编辑器实例与撤销栈。

**Architecture:** 先把 Electron 端 `editorSnapshot.revision` 透传到 renderer snapshot，作为“正文是否变化”的唯一版本门槛；然后在 web 端新增滚动锚点会话缓存、可恢复调度器和可 flush 的编辑内容上浮调度；最后把编辑页与预览页接入切页前记录、激活后恢复，以及恢复期同步滚动抑制。

**Tech Stack:** Electron 39 document-session、Vue 3、Vue Router 4、Pinia、CodeMirror 6、node:test、Vitest、ESLint

**Execution Constraints:** 所有实现、测试和提交都必须留在当前分支 `feature/document-session-save-refactor`；禁止新建 worktree，禁止切换到其他分支执行本计划。

---

## File Structure

### 需要修改的现有文件

- `wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSnapshotUtil.test.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js`
- `wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js`
- `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js`
- `wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js`
- `wj-markdown-editor-web/src/components/editor/composables/__tests__/usePreviewSync.test.js`
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- `wj-markdown-editor-web/src/views/EditorView.vue`
- `wj-markdown-editor-web/src/views/PreviewView.vue`

### 需要新增的文件

- `wj-markdown-editor-web/src/util/editor/viewScrollAnchorSessionUtil.js`
- `wj-markdown-editor-web/src/util/editor/__tests__/viewScrollAnchorSessionUtil.test.js`
- `wj-markdown-editor-web/src/util/editor/flushableDebounceUtil.js`
- `wj-markdown-editor-web/src/util/editor/__tests__/flushableDebounceUtil.test.js`
- `wj-markdown-editor-web/src/util/editor/viewScrollAnchorMathUtil.js`
- `wj-markdown-editor-web/src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js`
- `wj-markdown-editor-web/src/components/editor/composables/useViewScrollAnchor.js`
- `wj-markdown-editor-web/src/components/editor/composables/__tests__/useViewScrollAnchor.test.js`

### 文件职责约束

- `documentSnapshotUtil.js` 只负责把主进程 session 真相投影成 renderer 可消费快照，本次只新增 `revision` 字段，不引入滚动状态。
- `documentSessionSnapshotUtil.js` 只负责 renderer 快照归一化，本次只新增 `revision` 默认值与归一逻辑。
- `viewScrollAnchorSessionUtil.js` 只负责在 renderer 内存里保存和读取 `sessionId + scrollAreaKey` 对应的滚动锚点记录，不接触 DOM。
- `flushableDebounceUtil.js` 只负责“可手动 flush 的防抖调度”，用于编辑页切走前把最后一次正文上浮立即冲刷出来。
- `viewScrollAnchorMathUtil.js` 只负责滚动锚点采集与恢复的纯计算，不接触 Vue 生命周期。
- `useViewScrollAnchor.js` 只负责恢复调度、取消过期恢复请求、布局稳定等待和兜底重试。
- `usePreviewSync.js` 只在现有双向同步逻辑上增加“恢复期抑制”判断，不改变正常滚动映射算法。
- `MarkdownEdit.vue` 只负责把编辑器 DOM、右侧预览 DOM 与上述工具接起来，并通过 `defineExpose` 向 `EditorView.vue` 暴露 flush/record/restore 能力。
- `EditorView.vue` 和 `PreviewView.vue` 只负责路由生命周期接线：切走前记录，切回后恢复。

## Chunk 1: Snapshot Revision Contract

### Task 1: 让 renderer snapshot 稳定携带 `revision`

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSnapshotUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js`

- [ ] **Step 1: 写出失败测试，固定 `revision` 契约**

在 Electron 侧测试中补断言，确认 `deriveDocumentSnapshot(session)` 会返回：

```js
assert.equal(snapshot.revision, 1)
```

在 Web 侧测试中补断言，确认：

```js
const snapshot = normalizeDocumentSessionSnapshot(null)
assert.equal(snapshot.revision, 0)
```

以及：

```js
assert.equal(storeState.documentSessionSnapshot.revision, 7)
```

- [ ] **Step 2: 运行聚焦测试，确认按预期失败**

Run:

```bash
cd wj-markdown-editor-electron
npm run test:run -- src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/windowSessionBridge.test.js
```

Run:

```bash
cd ../wj-markdown-editor-web
npm run test:run -- src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js
```

Expected: 断言因 `revision` 尚未投影/归一化而失败。

- [ ] **Step 3: 最小实现 `revision` 透传与归一化**

在 Electron 侧快照里新增：

```js
revision: Number.isInteger(editorSnapshot.revision) ? editorSnapshot.revision : 0
```

在 Web 侧默认快照与归一化结果里新增：

```js
revision: Number.isInteger(snapshot.revision) ? snapshot.revision : 0
```

- [ ] **Step 4: 重新运行测试并确认通过**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/windowSessionBridge.test.js
```

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js
```

Expected: PASS

- [ ] **Step 5: 提交当前任务**

```bash
git add wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentSnapshotUtil.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js
git commit -m "feat(scroll): expose snapshot revision to renderer"
```

## Chunk 2: Renderer Scroll Anchor Foundations

### Task 2: 新增滚动锚点会话缓存工具

**Files:**
- Create: `wj-markdown-editor-web/src/util/editor/viewScrollAnchorSessionUtil.js`
- Create: `wj-markdown-editor-web/src/util/editor/__tests__/viewScrollAnchorSessionUtil.test.js`

- [ ] **Step 1: 先写失败测试，覆盖缓存隔离与恢复资格判断**

至少覆盖以下场景：

```js
saveAnchorRecord(store, {
  sessionId: 'session-1',
  scrollAreaKey: 'editor-code',
  revision: 3,
  anchor: { type: 'editor-line', lineNumber: 12, lineOffsetRatio: 0.5 },
  fallbackScrollTop: 120,
  savedAt: 1,
})

assert.equal(getAnchorRecord(store, {
  sessionId: 'session-1',
  scrollAreaKey: 'editor-code',
}).revision, 3)

assert.equal(shouldRestoreAnchorRecord({
  record,
  sessionId: 'session-1',
  revision: 4,
}), false)
```

以及：

- 不同 `scrollAreaKey` 互不覆盖
- `pruneAnchorRecords()` 只保留活动 `sessionId`

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/viewScrollAnchorSessionUtil.test.js
```

Expected: FAIL，提示缺少模块或导出函数。

- [ ] **Step 3: 实现最小缓存工具**

实现以下导出：

```js
createViewScrollAnchorSessionStore()
saveAnchorRecord(store, record)
getAnchorRecord(store, { sessionId, scrollAreaKey })
clearSessionAnchorRecords(store, sessionId)
pruneAnchorRecords(store, activeSessionId)
shouldRestoreAnchorRecord({ record, sessionId, revision })
```

缓存结构固定为：

```js
{
  [sessionId]: {
    [scrollAreaKey]: record,
  },
}
```

- [ ] **Step 4: 重新运行测试并确认通过**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/viewScrollAnchorSessionUtil.test.js
```

Expected: PASS

- [ ] **Step 5: 提交当前任务**

```bash
git add wj-markdown-editor-web/src/util/editor/viewScrollAnchorSessionUtil.js wj-markdown-editor-web/src/util/editor/__tests__/viewScrollAnchorSessionUtil.test.js
git commit -m "feat(scroll): add scroll anchor session store"
```

### Task 3: 新增可 flush 的防抖调度工具

**Files:**
- Create: `wj-markdown-editor-web/src/util/editor/flushableDebounceUtil.js`
- Create: `wj-markdown-editor-web/src/util/editor/__tests__/flushableDebounceUtil.test.js`

- [ ] **Step 1: 先写失败测试，覆盖延迟执行、flush 和 cancel**

至少覆盖：

```js
const runner = createFlushableDebounce((value) => calls.push(value), 160)
runner.schedule('a')
runner.schedule('b')
runner.flush()
assert.deepEqual(calls, ['b'])
```

以及：

- 未 flush 时按最后一次参数延迟执行
- `cancel()` 后不再执行回调
- `hasPending()` 能反映当前是否仍有待执行任务

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/flushableDebounceUtil.test.js
```

Expected: FAIL，提示缺少模块或行为不匹配。

- [ ] **Step 3: 实现最小可 flush 防抖工具**

导出建议：

```js
createFlushableDebounce(callback, wait)
```

返回值至少包含：

```js
schedule(...args)
flush()
cancel()
hasPending()
```

- [ ] **Step 4: 重新运行测试并确认通过**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/flushableDebounceUtil.test.js
```

Expected: PASS

- [ ] **Step 5: 提交当前任务**

```bash
git add wj-markdown-editor-web/src/util/editor/flushableDebounceUtil.js wj-markdown-editor-web/src/util/editor/__tests__/flushableDebounceUtil.test.js
git commit -m "feat(scroll): add flushable debounce utility"
```

### Task 4: 新增滚动锚点采集与恢复的纯计算工具

**Files:**
- Create: `wj-markdown-editor-web/src/util/editor/viewScrollAnchorMathUtil.js`
- Create: `wj-markdown-editor-web/src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js`

- [ ] **Step 1: 先写失败测试，覆盖编辑区和预览区两套锚点计算**

至少覆盖：

- 编辑区 `captureEditorLineAnchor()` 能从 `lineBlockAtHeight(scrollTop)` 计算出 `lineNumber + lineOffsetRatio`
- 编辑区 `resolveEditorLineAnchorScrollTop()` 能按 `lineNumber + lineOffsetRatio` 还原 `scrollTop`
- 预览区 `capturePreviewLineAnchor()` 能记录 `lineStart + lineEnd + elementOffsetRatio`
- 预览区 `resolvePreviewLineAnchorScrollTop()` 找不到块时会回退 `fallbackScrollTop`

示例断言：

```js
assert.deepEqual(anchor, {
  type: 'editor-line',
  lineNumber: 3,
  lineOffsetRatio: 0.5,
})
```

```js
assert.equal(targetScrollTop, 151.2)
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js
```

Expected: FAIL，提示缺少模块或计算结果不匹配。

- [ ] **Step 3: 实现最小纯计算工具**

建议导出：

```js
captureEditorLineAnchor({ view, scrollTop })
resolveEditorLineAnchorScrollTop({ view, anchor, fallbackScrollTop })
capturePreviewLineAnchor({ container, element, scrollTop })
resolvePreviewLineAnchorScrollTop({ container, element, anchor, fallbackScrollTop })
```

所有函数都必须保持纯计算语义，不直接操作滚动。

- [ ] **Step 4: 重新运行测试并确认通过**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js
```

Expected: PASS

- [ ] **Step 5: 提交当前任务**

```bash
git add wj-markdown-editor-web/src/util/editor/viewScrollAnchorMathUtil.js wj-markdown-editor-web/src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js
git commit -m "feat(scroll): add scroll anchor math helpers"
```

### Task 5: 新增滚动恢复调度 composable

**Files:**
- Create: `wj-markdown-editor-web/src/components/editor/composables/useViewScrollAnchor.js`
- Create: `wj-markdown-editor-web/src/components/editor/composables/__tests__/useViewScrollAnchor.test.js`

- [ ] **Step 1: 先写失败测试，覆盖恢复资格、过期取消和布局等待**

至少覆盖：

- `scheduleRestoreForCurrentSnapshot()` 会先执行 `waitLayoutStable`
- 恢复请求 token 过期后，不会再执行旧恢复
- `shouldRestoreAnchorRecord()` 为 `false` 时不会调用 `restoreAnchor`
- 首轮布局不可用时只额外重试一次

示例断言：

```js
assert.equal(restoreCalls.length, 1)
assert.equal(restoreCalls[0].revision, 7)
```

```js
assert.equal(waitCalls, 2)
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/components/editor/composables/__tests__/useViewScrollAnchor.test.js
```

Expected: FAIL，提示缺少模块或未执行等待/取消逻辑。

- [ ] **Step 3: 实现最小 composable**

接口固定为：

```js
useViewScrollAnchor({
  store,
  sessionIdGetter,
  revisionGetter,
  scrollAreaKey,
  getScrollElement,
  captureAnchor,
  restoreAnchor,
  waitLayoutStable,
  onRestoreStart,
  onRestoreFinish,
})
```

返回：

```js
{
  captureCurrentAnchor,
  scheduleRestoreForCurrentSnapshot,
  cancelPendingRestore,
  hasRestorableAnchor,
}
```

- [ ] **Step 4: 重新运行测试并确认通过**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/components/editor/composables/__tests__/useViewScrollAnchor.test.js
```

Expected: PASS

- [ ] **Step 5: 提交当前任务**

```bash
git add wj-markdown-editor-web/src/components/editor/composables/useViewScrollAnchor.js wj-markdown-editor-web/src/components/editor/composables/__tests__/useViewScrollAnchor.test.js
git commit -m "feat(scroll): add view scroll anchor composable"
```

## Chunk 3: Scroll Sync Guard Integration

### Task 6: 为 `usePreviewSync` 增加恢复期抑制

**Files:**
- Modify: `wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js`
- Modify: `wj-markdown-editor-web/src/components/editor/composables/__tests__/usePreviewSync.test.js`

- [ ] **Step 1: 先补失败测试，固定“恢复期不得触发双向同步”**

在现有测试文件中新增两组断言：

- `restoreStateRef.value.active === true` 时，`syncEditorToPreview()` 不得调用 `previewRef.scrollTo()`
- `restoreStateRef.value.active === true` 时，`syncPreviewToEditor()` 不得调用 `editorView.scrollDOM.scrollTo()`

示例断言：

```js
assert.equal(previewElement.scrollToCalls.length, 0)
assert.equal(editorView.scrollDOM.scrollTop, 0)
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/components/editor/composables/__tests__/usePreviewSync.test.js
```

Expected: FAIL，因为当前实现不会检查恢复期状态。

- [ ] **Step 3: 在 `usePreviewSync` 中接入 `restoreStateRef`**

调整签名：

```js
usePreviewSync({
  editorViewRef,
  previewRef,
  scrolling,
  editorScrollTop,
  restoreStateRef,
})
```

并在：

- `syncEditorToPreview()`
- `syncPreviewToEditor()`

入口处增加：

```js
if (restoreStateRef?.value?.active === true) {
  return
}
```

- [ ] **Step 4: 重新运行测试并确认通过**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/components/editor/composables/__tests__/usePreviewSync.test.js
```

Expected: PASS

- [ ] **Step 5: 提交当前任务**

```bash
git add wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js wj-markdown-editor-web/src/components/editor/composables/__tests__/usePreviewSync.test.js
git commit -m "feat(scroll): suppress preview sync during restore"
```

## Chunk 4: View Wiring on the Current Branch

### Task 7: 将 `MarkdownEdit.vue` 接入 flush、锚点记录和恢复暴露

**Files:**
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- Modify: `wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js`
- Modify: `wj-markdown-editor-web/src/util/editor/flushableDebounceUtil.js`
- Modify: `wj-markdown-editor-web/src/components/editor/composables/useViewScrollAnchor.js`
- Modify: `wj-markdown-editor-web/src/util/editor/viewScrollAnchorMathUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js`

- [ ] **Step 1: 用 `flushableDebounceUtil` 替换当前不可 flush 的正文上浮防抖**

目标是让 `MarkdownEdit.vue` 内部的正文上浮调度具备：

```js
flushPendingModelSync()
hasPendingModelSync()
```

并保持现有 `160ms` 延迟语义不变。

- [ ] **Step 2: 在组件内部创建 `editor-code` 与 `editor-preview` 两份滚动锚点控制器**

接线要求：

- 编辑区使用 CodeMirror `scrollDOM`
- 右侧预览区使用 `previewRef.value`
- 记录时使用 `viewScrollAnchorMathUtil.js`
- 恢复时使用 `useViewScrollAnchor.js`
- 右侧预览隐藏时，不得覆盖已有 `editor-preview` 记录
- 右侧预览隐藏时，恢复流程必须跳过 `editor-preview`，不能因为当前不可见而清空旧记录

- [ ] **Step 3: 先补一个失败测试，固定“右侧预览隐藏时保留旧记录”的行为**

在 `viewScrollAnchorMathUtil.test.js` 或相邻聚焦测试中新增至少一组断言，覆盖：

- 当前右侧预览不可见时，`captureViewScrollAnchors()` 只更新 `editor-code`
- 已存在的 `editor-preview` 记录不会被覆盖成空值

示例断言：

```js
assert.deepEqual(savedPreviewRecord.anchor, previousPreviewRecord.anchor)
```

```js
assert.equal(restoredPreviewCalls.length, 0)
```

- [ ] **Step 4: 通过 `defineExpose` 暴露页面级能力**

确保外层可调用：

```js
flushPendingModelSync()
hasPendingModelSync()
captureViewScrollAnchors({ sessionId, revision })
scheduleRestoreForCurrentSnapshot({ sessionId, revision })
cancelPendingViewScrollRestore()
```

- [ ] **Step 5: 把 `restoreStateRef` 传给 `usePreviewSync`**

恢复顺序固定为：

1. 打开 `restoreState.active`
2. 恢复左侧编辑区
3. 恢复右侧预览区
4. 关闭 `restoreState.active`

- [ ] **Step 6: 运行聚焦 web 测试，确认基础工具接线未回归**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/editor/__tests__/flushableDebounceUtil.test.js src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js src/components/editor/composables/__tests__/useViewScrollAnchor.test.js src/components/editor/composables/__tests__/usePreviewSync.test.js
```

Expected: PASS

- [ ] **Step 7: 按包执行定点 ESLint 格式化**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npx eslint --fix src/components/editor/MarkdownEdit.vue src/components/editor/composables/usePreviewSync.js src/components/editor/composables/useViewScrollAnchor.js src/util/editor/flushableDebounceUtil.js src/util/editor/viewScrollAnchorMathUtil.js src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js
```

Expected: 退出码 0

- [ ] **Step 8: 提交当前任务**

```bash
git add wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js wj-markdown-editor-web/src/components/editor/composables/useViewScrollAnchor.js wj-markdown-editor-web/src/util/editor/flushableDebounceUtil.js wj-markdown-editor-web/src/util/editor/viewScrollAnchorMathUtil.js wj-markdown-editor-web/src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js
git commit -m "feat(scroll): wire markdown edit scroll anchors"
```

### Task 8: 将 `EditorView.vue` 与 `PreviewView.vue` 接入切页记录与激活恢复

**Files:**
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`
- Modify: `wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js`

- [ ] **Step 1: 在 `EditorView.vue` 中接入切页前 flush 与最新 snapshot 记录**

要求：

- 使用 `markdownEditRef`
- 在 `onBeforeRouteLeave(async () => {})` 中先 `flushPendingModelSync()`
- 若 `content.value !== store.documentSessionSnapshot.content`，执行 `await requestDocumentEdit(content.value)`
- 紧接着 `await requestDocumentSessionSnapshot()`
- 用最新 `sessionId + revision` 记录 `editor-code` 与 `editor-preview`

- [ ] **Step 2: 在 `EditorView.vue` 中接入激活后恢复**

要求：

- `onActivated` 只设置 `pendingRestoreOnActivation = true`
- 最终在 `applyDocumentSessionSnapshot(snapshot)` 尾部调用 `markdownEditRef.scheduleRestoreForCurrentSnapshot({ sessionId, revision })`
- 恢复必须依赖 `onActivated + nextTick + 2*rAF`，不得依赖 `refresh-complete`

- [ ] **Step 3: 在 `PreviewView.vue` 中接入 `preview-page` 记录与恢复**

要求：

- `onBeforeRouteLeave(() => {})` 记录 `preview-page`
- `onActivated` 设置恢复意图
- 在 `applyDocumentSessionSnapshot(snapshot)` 尾部触发恢复
- 继续复用当前页面的 snapshot 激活逻辑，不新增第二套数据源

- [ ] **Step 4: 运行聚焦测试并格式化视图文件**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/editor/__tests__/viewScrollAnchorSessionUtil.test.js src/util/editor/__tests__/flushableDebounceUtil.test.js src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js src/components/editor/composables/__tests__/useViewScrollAnchor.test.js src/components/editor/composables/__tests__/usePreviewSync.test.js
```

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npx eslint --fix src/views/EditorView.vue src/views/PreviewView.vue src/util/document-session/documentSessionSnapshotUtil.js
```

Expected: 测试 PASS，格式化退出码 0

- [ ] **Step 5: 在 Electron 应用中做手工冒烟验证**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run build
```

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-electron
npm run start
```

手工验证以下场景：

- 编辑页左侧滚到中间，切到预览页，再切回，左侧位置保持
- 编辑页右侧预览滚到中间，切到预览页，再切回，右侧位置保持
- 纯预览页滚到中间，切到编辑页，再切回，纯预览页位置保持
- 从编辑页切到预览页，在预览页调整窗口大小，再切回编辑页，编辑页两块区域仍回到原来看到的内容
- 从预览页切到编辑页，在编辑页调整窗口大小，再切回预览页，纯预览页仍回到原来看到的内容
- 编辑页输入后立刻切到预览页，预览页不能错误使用旧 `revision`
- 编辑页来回切换后，撤销/回退栈仍可使用

- [ ] **Step 6: 提交当前任务**

```bash
git add wj-markdown-editor-web/src/views/EditorView.vue wj-markdown-editor-web/src/views/PreviewView.vue wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js
git commit -m "feat(scroll): restore editor and preview scroll anchors"
```

## Chunk 5: Final Verification on the Current Branch

### Task 9: 做最终格式化、测试与分支确认

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSnapshotUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js`
- Modify: `wj-markdown-editor-web/src/util/editor/viewScrollAnchorSessionUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/viewScrollAnchorSessionUtil.test.js`
- Modify: `wj-markdown-editor-web/src/util/editor/flushableDebounceUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/flushableDebounceUtil.test.js`
- Modify: `wj-markdown-editor-web/src/util/editor/viewScrollAnchorMathUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js`
- Modify: `wj-markdown-editor-web/src/components/editor/composables/useViewScrollAnchor.js`
- Modify: `wj-markdown-editor-web/src/components/editor/composables/__tests__/useViewScrollAnchor.test.js`
- Modify: `wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js`
- Modify: `wj-markdown-editor-web/src/components/editor/composables/__tests__/usePreviewSync.test.js`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`

- [ ] **Step 1: 确认仍在当前分支**

Run:

```bash
git branch --show-current
```

Expected: 输出 `feature/document-session-save-refactor`

- [ ] **Step 2: 运行 Electron 与 Web 的最终相关测试集**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/windowSessionBridge.test.js
```

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npm run test:run -- src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/editor/__tests__/viewScrollAnchorSessionUtil.test.js src/util/editor/__tests__/flushableDebounceUtil.test.js src/util/editor/__tests__/viewScrollAnchorMathUtil.test.js src/components/editor/composables/__tests__/useViewScrollAnchor.test.js src/components/editor/composables/__tests__/usePreviewSync.test.js
```

Expected: PASS

- [ ] **Step 3: 对所有改动文件执行定点 ESLint**

Run:

```bash
cd C:\wj\code\wj-markdown-editor\wj-markdown-editor-web
npx eslint --fix src/util/document-session/documentSessionSnapshotUtil.js src/util/editor/viewScrollAnchorSessionUtil.js src/util/editor/flushableDebounceUtil.js src/util/editor/viewScrollAnchorMathUtil.js src/components/editor/composables/useViewScrollAnchor.js src/components/editor/composables/usePreviewSync.js src/components/editor/MarkdownEdit.vue src/views/EditorView.vue src/views/PreviewView.vue
```

Expected: 退出码 0

- [ ] **Step 4: 检查工作区并准备执行交接**

Run:

```bash
git status --short
```

Expected: 只包含本计划内文件改动；没有切到其他分支；没有新建 worktree。

Plan complete and saved to `docs/superpowers/plans/2026-03-19-editor-preview-scroll-anchor.md`. Two execution options:

1. Subagent-Driven (recommended) - 我按任务逐个派发子代理执行，并在任务之间做审核

2. Inline Execution - 我在当前会话里按计划顺序直接执行

Which approach?
