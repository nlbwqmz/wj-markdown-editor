# 编辑页与预览页滚动锚点保持设计

## 背景

当前项目在 [`wj-markdown-editor-web/src/components/layout/LayoutContainer.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/layout/LayoutContainer.vue) 中仍保留了 `keep-alive`，因此编辑页和预览页在路由切换时不会直接销毁组件实例。

但实际行为已经和“只靠 `keep-alive` 即可保留滚动位置”的旧假设不一致：

- 编辑页左侧 CodeMirror 编辑区在切走再回来后，滚动条会回到顶部
- 编辑页右侧内嵌预览区在切走再回来后，滚动条会回到顶部
- 纯预览页在切走再回来后，滚动条也会回到顶部

同时，用户明确要求继续保留 `keep-alive`，因为编辑页切换回来后必须保住编辑器实例和撤销/回退栈，不能为了修复滚动位置而放弃现有的实例保活机制。

因此本次设计目标不是“用别的方式替代 `keep-alive`”，而是：

- 保留 `keep-alive`
- 显式保存和恢复滚动锚点
- 让滚动位置恢复不再依赖浏览器或框架的隐式行为

## 目标

- 在编辑页和预览页相互切换时，保持以下三份滚动状态：
- 编辑页左侧编辑区滚动位置
- 编辑页右侧预览区滚动位置
- 纯预览页滚动位置
- 保留现有 `keep-alive`，继续保住 CodeMirror 实例和撤销/回退栈
- 滚动恢复语义使用“回到之前顶部附近看到的那段内容”，而不是像素级绝对还原
- 当切换期间窗口大小发生变化时，仍尽量回到原来看到的内容段落
- 当正文内容变化时，不恢复旧滚动位置
- 不在滚动过程中做增量锚点更新，只在离开视图时记录、在重新进入视图时恢复

## 非目标

- 不移除或替换现有 `keep-alive`
- 不引入滚动过程中的持续采样、节流更新或锚点热更新
- 不把滚动状态持久化到 Electron 主进程或磁盘
- 不改变现有编辑页与预览页的滚动同步算法语义，只在恢复阶段增加抑制保护
- 不在正文变化后尝试做跨版本滚动映射

## 关键约束

### 1. 保留 `keep-alive`

`keep-alive` 的职责仍然是保留视图实例、编辑器实例和撤销栈；滚动恢复是额外补充的显式状态恢复层，两者不是替代关系。

### 2. 正文变化后不恢复旧位置

用户已接受“内容变化就放弃旧滚动位置”的策略，因此本次设计不做跨版本位置映射，不引入全文哈希对比，也不尝试做正文差异迁移。

### 3. 不依赖 `refresh-complete`

滚动恢复的前提不是“内容重新渲染完成”，而是“当前视图重新激活后布局已经稳定”。  
内容没有变化时，通常不会触发新的 Markdown 刷新；内容变化时，本次又不会恢复旧位置，因此 `refresh-complete` 不是正确的恢复依赖条件。

### 4. 视图之间的锚点互不污染

用户在预览页改窗口大小，不应改写之前已经记录的编辑页锚点；反过来也一样。  
因此每个视图只记录自己的滚动锚点，且只在离开该视图时更新一次。

## 核心设计决策

### 1. 使用 `sessionId + revision` 作为恢复资格判断

Electron 主进程内已经存在 `session.editorSnapshot.revision`，其语义就是“编辑器正文版本号”：

- 在 [`documentCommandService.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentCommandService.js) 中，`document.edit` 会推进 `editorSnapshot.content` 并自增 `revision`
- 在 [`watchCoordinator.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js) 中，外部文件变化被应用到编辑器内容时，也会自增 `revision`
- 保存链路消费 `revision` 来判断是否需要继续追赶最新正文，但不会因为单纯保存成功而额外推进 `editorSnapshot.revision`

因此本次不再单独引入 `contentVersion` 或 `contentSignature`，直接复用主进程已有的 `revision`。

恢复资格判断规则：

- `sessionId` 不同：不恢复
- `revision` 不同：不恢复
- `sessionId` 和 `revision` 都相同：允许恢复

### 2. 主进程向 renderer snapshot 透传 `revision`

当前 renderer 消费的 `document session snapshot` 还没有 `revision` 字段，因此需要补充：

- Electron 侧在 [`documentSnapshotUtil.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js) 中把 `editorSnapshot.revision` 投影到 snapshot
- Web 侧在 [`documentSessionSnapshotUtil.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js) 中把 `revision` 归一化到 `documentSessionSnapshot`

终态 snapshot 结构中新增：

```js
{
  sessionId: 'session-1',
  revision: 12,
  content: '# demo',
  ...
}
```

### 3. 滚动状态只保存在 renderer 内存中

滚动锚点属于“当前 renderer 视图状态”，不属于 Electron 文档会话真相，也不需要跨重启持久化。  
因此滚动状态只保存在 web 端内存里，不进主进程、不进磁盘、不需要 IPC 往返。

### 4. 只在切走时记录，只在切回时恢复

为了满足用户对性能的要求，本次不在滚动过程中持续更新锚点，而是：

- `onBeforeRouteLeave` 时记录当前视图滚动锚点
- `onActivated` 后等待布局稳定，再按当前 snapshot 判断是否恢复

## 滚动区域划分

本次设计固定维护三份滚动状态，每一份都通过 `scrollAreaKey` 独立区分：

- `editor-code`：编辑页左侧 CodeMirror 编辑区
- `editor-preview`：编辑页右侧内嵌预览区
- `preview-page`：纯预览页滚动区

这里的 `scrollAreaKey` 是内部状态键，不是 Vue 组件 `key`，也不是路由名。  
它只用于把不同滚动区域的记录彻底隔离开，避免互相覆盖。

## 新增模块设计

### 1. `viewScrollAnchorSessionUtil.js`

路径：

- [`wj-markdown-editor-web/src/util/editor/viewScrollAnchorSessionUtil.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/editor/viewScrollAnchorSessionUtil.js)

职责：

- 维护 renderer 本地的滚动锚点缓存
- 负责按 `sessionId + scrollAreaKey` 存取记录
- 只处理纯数据，不接触 DOM，不接触 Vue 生命周期

建议导出：

```js
export function createViewScrollAnchorSessionStore()
export function saveAnchorRecord(store, record)
export function getAnchorRecord(store, { sessionId, scrollAreaKey })
export function clearSessionAnchorRecords(store, sessionId)
export function pruneAnchorRecords(store, activeSessionId)
export function shouldRestoreAnchorRecord({ record, sessionId, revision })
```

缓存结构：

```js
{
  [sessionId]: {
    [scrollAreaKey]: {
      sessionId,
      scrollAreaKey,
      revision,
      anchor,
      fallbackScrollTop,
      savedAt,
    },
  },
}
```

### 2. `useViewScrollAnchor.js`

路径：

- [`wj-markdown-editor-web/src/components/editor/composables/useViewScrollAnchor.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/composables/useViewScrollAnchor.js)

职责：

- 统一处理“等待布局稳定后恢复”
- 统一处理“记录当前锚点”
- 统一处理“恢复前资格判断”
- 统一处理“恢复请求过期取消”
- 统一处理“轻量兜底重试”

建议接口：

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

建议返回：

```js
{
  captureCurrentAnchor,
  scheduleRestoreForCurrentSnapshot,
  cancelPendingRestore,
  hasRestorableAnchor,
}
```

内部要求：

- 每次恢复请求都带一个递增 `restoreToken`
- 执行恢复前再次校验当前 token，旧请求自动失效
- 页面 `deactivated` 或 `beforeUnmount` 时，取消待执行恢复
- 默认 `waitLayoutStable()` 使用 `nextTick + 2 * requestAnimationFrame`
- 如果执行时布局仍不可用，只补一次 `requestAnimationFrame` 兜底重试，随后直接放弃

## 锚点模型

### 1. 编辑区锚点

编辑区使用“行锚点”：

```js
{
  type: 'editor-line',
  lineNumber: 120,
  lineOffsetRatio: 0.35,
}
```

含义：

- `lineNumber` 表示当前顶部附近所在的正文行号
- `lineOffsetRatio` 表示当前滚动位置在该行块中的相对偏移

同时附带：

```js
fallbackScrollTop: 1840
```

用于极端情况下按像素值兜底。

### 2. 预览区锚点

编辑页右侧预览区和纯预览页都使用“预览块锚点”：

```js
{
  type: 'preview-line',
  lineStart: 118,
  lineEnd: 123,
  elementOffsetRatio: 0.2,
}
```

含义：

- `lineStart` / `lineEnd` 用于重新找到对应的预览块
- `elementOffsetRatio` 表示当前滚动位置在该块内部的相对偏移

同样附带：

```js
fallbackScrollTop: 1560
```

## 锚点采集规则

### 1. 编辑页左侧编辑区

在 [`MarkdownEdit.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue) 内，从 CodeMirror 实例采集：

- 读取 `editorView.value.scrollDOM.scrollTop`
- 通过 `view.lineBlockAtHeight(scrollTop)` 找当前顶部 block
- 通过 `view.state.doc.lineAt(block.from).number` 获取 `lineNumber`
- 计算 `lineOffsetRatio = (scrollTop - block.top) / block.height`
- 记录 `fallbackScrollTop = scrollTop`

### 2. 编辑页右侧预览区

在 [`MarkdownEdit.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue) 内，从 `previewRef.value` 采集：

- 根据当前 `scrollTop` 找出所处的 `[data-line-start]` 元素
- 记录 `lineStart`
- 记录 `lineEnd`
- 记录 `elementOffsetRatio = (scrollTop - elementTop) / elementHeight`
- 记录 `fallbackScrollTop = scrollTop`

### 3. 纯预览页

在 [`PreviewView.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/PreviewView.vue) 内，从 `previewContainerRef.value` 采集，规则与编辑页右侧预览区一致。

## 锚点恢复规则

### 1. 编辑区恢复

恢复步骤：

- 校验 `sessionId + revision`
- 按 `lineNumber` 找对应正文行
- 计算目标 `scrollTop = block.top + block.height * lineOffsetRatio`
- 调用 `view.scrollDOM.scrollTo({ top, behavior: 'auto' })`

如果找不到目标行，则退回 `fallbackScrollTop`。

### 2. 预览区恢复

恢复步骤：

- 校验 `sessionId + revision`
- 按 `lineStart / lineEnd` 找对应 `[data-line-start]` 预览块
- 计算目标 `scrollTop = elementTop + elementHeight * elementOffsetRatio`
- 调用滚动容器 `scrollTo({ top, behavior: 'auto' })`

如果找不到对应块，则退回 `fallbackScrollTop`。

### 3. 不使用平滑滚动

恢复使用立即滚动，不使用 `smooth`。  
原因是恢复属于程序性状态回放，不应该产生“页面自己滑动”的感知，也不应该延长恢复期同步抑制窗口。

## 恢复时机

### 1. 不等待重渲染，只等待布局稳定

本次恢复流程不绑定 `refresh-complete`。  
即使正文没有变化，以下信息在视图重新激活后的前一两帧内也可能不是最终值：

- 滚动容器 `clientHeight`
- 滚动容器 `scrollHeight`
- Grid / Split 布局下的列宽和高度
- 预览块的 `getBoundingClientRect()`
- CodeMirror 当前布局块的位置

因此恢复时机统一定义为：

```js
await nextTick()
await waitOneRaf()
await waitOneRaf()
```

如果此时滚动容器仍不可用，再补一次：

```js
await waitOneRaf()
```

还不满足则直接放弃本次恢复。

### 2. 内容变化时直接跳过

如果 `revision` 不同，说明正文已经变化，本次恢复直接跳过，不进入任何布局等待或元素查找逻辑。

## 编辑页额外竞态：切页前必须冲刷最新正文

[`MarkdownEdit.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue) 当前把正文上浮到父层时使用了 `160ms` 防抖。如果用户刚输入完内容就立刻切到预览页，会产生以下竞态：

- 编辑器实例中的正文已经是最新
- `EditorView.content` 可能仍是旧值
- 主进程里的 `revision` 也可能还是旧值
- 这会导致预览页在切入时误判“内容没变”

因此编辑页切走时，必须先冲刷这轮防抖中的最新正文，再记录锚点。

### 处理策略

在 [`EditorView.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/EditorView.vue) 中新增 `onBeforeRouteLeave(async () => {})`，执行以下步骤：

1. 调用 `markdownEditRef.flushPendingModelSync()`，把子组件里防抖中的最新正文立即同步到 `EditorView.content`
2. 若 `content.value !== store.documentSessionSnapshot.content`，则执行 `await requestDocumentEdit(content.value)`
3. 随后执行 `await requestDocumentSessionSnapshot()`，拿到主进程已经推进后的最新 snapshot
4. 用这份最新 snapshot 更新当前页面状态
5. 使用这份最新 snapshot 的 `sessionId + revision` 记录编辑页两个滚动锚点
6. 允许路由继续切换

### 对 `MarkdownEdit.vue` 的要求

[`MarkdownEdit.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue) 不能继续只依赖不可冲刷的 `commonUtil.debounce()`。  
它需要把“正文上浮调度”收敛成可主动 `flush` 的本地调度器，并通过 `defineExpose` 暴露：

```js
flushPendingModelSync()
hasPendingModelSync()
captureViewScrollAnchors({ sessionId, revision })
scheduleRestoreForCurrentSnapshot({ sessionId, revision })
cancelPendingViewScrollRestore()
```

## `MarkdownEdit.vue` 的接线方案

### 1. 管理两份滚动锚点

在 [`MarkdownEdit.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue) 内部创建两份 `useViewScrollAnchor()`：

- 一份负责 `editor-code`
- 一份负责 `editor-preview`

### 2. 管理恢复期同步抑制状态

新增本地状态：

```js
const restoreState = ref({
  active: false,
  editorCode: false,
  editorPreview: false,
})
```

只要任一滚动恢复正在执行，就把 `restoreState.active` 设为 `true`。

### 3. 暴露页面级方法

通过 `defineExpose` 提供：

```js
flushPendingModelSync()
hasPendingModelSync()
captureViewScrollAnchors({ sessionId, revision })
scheduleRestoreForCurrentSnapshot({ sessionId, revision })
cancelPendingViewScrollRestore()
```

### 4. 恢复顺序

恢复顺序固定为：

1. 打开 `restoreState.active`
2. 恢复左侧编辑区
3. 恢复右侧预览区
4. 关闭 `restoreState.active`

不并发恢复，避免同步滚动和布局调整互相干扰。

### 5. 右侧预览隐藏时的处理

如果右侧预览当前不可见：

- 记录时不覆盖旧的 `editor-preview` 记录
- 恢复时跳过 `editor-preview`

这样不会因为用户当前把右侧预览折叠了，就把已有记录错误清空。

## `usePreviewSync.js` 的改动

[`usePreviewSync.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js) 需要新增一个输入：

```js
restoreStateRef
```

并在以下入口加短路：

- `syncEditorToPreview()`
- `syncPreviewToEditor()`

短路条件：

```js
if (restoreStateRef?.value?.active === true) {
  return
}
```

目的：

- 防止恢复编辑区时立即触发“同步到右侧预览”
- 防止恢复右侧预览时立即触发“同步回编辑区”

此抑制只在切页恢复期间生效，不影响正常手动滚动。

## `EditorView.vue` 的接线方案

### 1. 新增引用

在 [`EditorView.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/EditorView.vue) 中新增：

- `markdownEditRef`
- `pendingRestoreOnActivation`

### 2. 激活流程

`onActivated` 只负责设置恢复意图，不直接恢复：

1. 设置 `pendingRestoreOnActivation = true`
2. 按现有逻辑决定 `replay-store` 或 `request-bootstrap`
3. 最终进入 `applyDocumentSessionSnapshot(snapshot)`

在 `applyDocumentSessionSnapshot(snapshot)` 尾部：

- 若 `pendingRestoreOnActivation !== true`，不做恢复
- 若当前 snapshot 没有 `sessionId` 或 `revision`，不做恢复
- 否则调用 `markdownEditRef.scheduleRestoreForCurrentSnapshot({ sessionId, revision })`
- 调用后把 `pendingRestoreOnActivation = false`

这样可以保证：

- 恢复永远基于“已经真正应用到页面的 snapshot”
- 普通 push snapshot 不会误触发恢复
- 不依赖 `refresh-complete`

### 3. 离开流程

在 `onBeforeRouteLeave(async () => {})` 里：

1. 冲刷最新编辑内容
2. 必要时把最新内容回写主进程
3. 拉最新 snapshot
4. 用最新 snapshot 记录 `editor-code` 和 `editor-preview`
5. 再放行路由跳转

## `PreviewView.vue` 的接线方案

[`PreviewView.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/PreviewView.vue) 只需要管理 `preview-page` 一份滚动状态。

### 1. 激活流程

与编辑页一致：

1. `onActivated` 设置 `pendingRestoreOnActivation = true`
2. 按现有逻辑完成 snapshot 激活
3. 在 `applyDocumentSessionSnapshot(snapshot)` 尾部判断是否需要恢复
4. 若需要，调用 `previewPageScrollAnchor.scheduleRestoreForCurrentSnapshot({ sessionId, revision })`
5. 调用后清掉 `pendingRestoreOnActivation`

### 2. 离开流程

在 `onBeforeRouteLeave(() => {})` 中：

- 读取当前 `store.documentSessionSnapshot.sessionId`
- 读取当前 `store.documentSessionSnapshot.revision`
- 记录 `preview-page` 锚点

预览页没有编辑防抖问题，因此不需要额外的异步 flush 过程。

## 窗口大小变化场景的语义

本次设计对窗口变化的语义定义为：

- 只在离开某个视图时记录该视图自己的锚点
- 在另一个视图里发生的窗口大小变化，不会改写这份已记录锚点
- 重新回到原视图时，按原视图自己的锚点恢复

这意味着：

- 从编辑页切到预览页后，在预览页改窗口大小，再切回编辑页，编辑页仍按之前记录的 `editor-code` 和 `editor-preview` 恢复
- 从预览页切到编辑页后，在编辑页改窗口大小，再切回预览页，预览页仍按之前记录的 `preview-page` 恢复

恢复语义是“回到当时顶部附近看到的那段内容”，不是像素级绝对还原，因此在窗口尺寸变化后仍能保持较高稳定性。

## 失败兜底

允许恢复失败，但必须可控。

以下情况直接不恢复：

- `sessionId` 不同
- `revision` 不同
- 滚动容器不存在
- 布局稳定等待结束后，滚动容器仍不可用

以下情况走兜底：

- 编辑区找不到目标行：回退到 `fallbackScrollTop`
- 预览区找不到目标块：回退到 `fallbackScrollTop`

如果连 `fallbackScrollTop` 也不可用，则维持当前默认位置，不弹提示、不报错。

## 影响范围

需要修改的现有文件：

- [`wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js)
- [`wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js)
- [`wj-markdown-editor-web/src/views/EditorView.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/EditorView.vue)
- [`wj-markdown-editor-web/src/views/PreviewView.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/PreviewView.vue)
- [`wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue)
- [`wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js)

需要新增的文件：

- [`wj-markdown-editor-web/src/util/editor/viewScrollAnchorSessionUtil.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/editor/viewScrollAnchorSessionUtil.js)
- [`wj-markdown-editor-web/src/components/editor/composables/useViewScrollAnchor.js`](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/composables/useViewScrollAnchor.js)

## 验证策略

### 1. 单元测试

建议新增或补充以下测试：

- renderer snapshot 归一化后能稳定保留 `revision`
- `viewScrollAnchorSessionUtil` 能按 `sessionId + scrollAreaKey` 正确隔离记录
- `shouldRestoreAnchorRecord()` 在 `revision` 变化时返回 `false`
- 编辑区锚点恢复目标 `scrollTop` 计算正确
- 预览区找不到块时会回退 `fallbackScrollTop`
- 恢复期间 `usePreviewSync` 会被正确抑制

### 2. 手工验证

重点覆盖以下场景：

- 编辑页左侧滚到中间，切到预览页，再切回，左侧编辑区回到原位置
- 编辑页右侧预览滚到中间，切到预览页，再切回，右侧预览区回到原位置
- 纯预览页滚到中间，切到编辑页，再切回，纯预览页回到原位置
- 从编辑页切到预览页，在预览页调整窗口大小，再切回编辑页，编辑页两块区域仍回到原来看到的内容
- 从预览页切到编辑页，在编辑页调整窗口大小，再切回预览页，预览页仍回到原来看到的内容
- 编辑页输入后立刻切到预览页，预览页不能误判为旧 `revision`
- 编辑页来回切换后，撤销/回退栈仍然可用

## 实施顺序

1. Electron snapshot 透传 `revision`
2. Web snapshot 归一化 `revision`
3. 新增 `viewScrollAnchorSessionUtil.js`
4. 新增 `useViewScrollAnchor.js`
5. 改造 `MarkdownEdit.vue`，支持：
- 可 flush 的正文上浮调度
- 两份滚动锚点记录与恢复
- 恢复期同步抑制状态
6. 改造 `usePreviewSync.js`，接入恢复期抑制
7. 改造 `EditorView.vue`，补上切页前 flush 和记录逻辑
8. 改造 `PreviewView.vue`，接入纯预览页记录与恢复
9. 补测试和手工验证

## 最终结论

本次方案的本质是：

- 用 `keep-alive` 保实例和撤销栈
- 用 `sessionId + revision` 判断“旧滚动位置是否还有效”
- 用显式滚动锚点记录和恢复，替代对浏览器隐式滚动保持的依赖
- 用“切页前 flush 最新编辑内容”修正现有防抖带来的版本竞态
- 用“恢复期抑制同步滚动”避免编辑区与预览区互相覆盖

在这个设计下，编辑页与预览页来回切换时的滚动位置将具备稳定、可解释、可验证的恢复语义，同时不影响现有 `keep-alive` 和撤销栈行为。
