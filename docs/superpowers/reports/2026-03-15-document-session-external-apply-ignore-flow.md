# 文档会话化重构后的外部修改应用/忽略链路说明

> 日期：2026-03-15
> 适用代码：`feature/document-session-save-refactor` 当前分支
> 关注范围：检测到外部文件修改后，用户在弹窗里点击“应用”或“忽略”的链路

## 1. 先记住一句话

这次重构前，外部修改链路的核心模型是：

- watcher 直接推动 `winInfo.content`、`winInfo.tempContent`、`pendingChange`
- Electron 把 diff 数据或重载事件直接发给 renderer
- renderer 再根据不同事件决定关弹窗、刷新内容、改保存态

这次重构后，外部修改链路的核心模型是：

- watcher 只上报变化
- `watchCoordinator` 决定这是不是当前会话要处理的外部版本
- “应用/忽略”也只是标准命令：`document.external.apply` / `document.external.ignore`
- 最终 UI 不再相信零散事件，而是相信 `DocumentSessionSnapshot`

如果只看一句对比，就是：

```text
以前：watcher 直接改 winInfo -> 直接发 diff/重载事件 -> renderer 自己收敛
现在：watcher 回流命令 -> session 进入 pendingExternalChange -> 用户决策再回流命令 -> snapshot 统一收敛
```

## 2. 这条链路到底在解决什么问题

这里说的不是“自动应用外部修改”那条路，而是“提示策略（prompt）下，用户看到 diff 弹窗后，手动点击应用或忽略”的流程。

也就是：

1. watcher 发现文件在磁盘上变了
2. 当前编辑器内容和磁盘内容不同
3. 当前策略不是自动应用，而是提示用户处理
4. renderer 弹出外部修改对比弹窗
5. 用户点击“应用”或“忽略”
6. 主进程收敛 session 状态
7. renderer 跟着最新 snapshot 收敛 UI

这条链路之所以在这次重构里很关键，是因为它本质上是“外部真相”和“当前编辑态”之间的冲突处理。

如果状态边界不清楚，很容易出现这些问题：

- 弹窗关了，但实际 pending 还没清掉
- 主进程已经应用了磁盘内容，但 renderer 还保留旧 diff
- 用户点击的是旧版本弹窗，却把新版本 pending 给清掉了
- 忽略后 UI 看起来消失了，但 watcher 底层状态没 settle，后面又莫名重复弹出

这次重构就是在系统性地堵这些问题。

## 3. 重构前的外部修改应用/忽略流程是什么

重构前的关键实现，主要在旧版 [winInfoUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.js) 和旧版 [ExternalFileChangeModal.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/ExternalFileChangeModal.vue)。

旧流程大致是这样：

```text
fileWatchUtil.startWatching()
-> onExternalChange(change)
-> winInfoUtil.handleExternalChange(winInfo, change)

如果策略是 prompt:
-> sendExternalChange(winInfo, change)
-> renderer 收到 file-external-changed
-> store.showExternalFileChange(data)
-> 弹出 diff 弹窗

点击“应用”:
-> file-external-change-apply
-> winInfoUtil.applyExternalPendingChange(winInfo, version)
-> 直接修改 winInfo.content / winInfo.tempContent
-> 发送 file-content-reloaded
-> renderer 收到后关闭弹窗、刷新内容

点击“忽略”:
-> file-external-change-ignore
-> winInfoUtil.ignoreExternalPendingChange(winInfo, version)
-> 只清 watcher pendingChange
-> renderer 本地 resetExternalFileChange()
```

旧模型有几个特点：

- 真相主体是 `winInfo`
- pending 外部修改主要挂在 `winInfo.externalWatch.pendingChange`
- renderer 直接监听 `file-external-changed` 和 `file-content-reloaded`
- “应用成功了没”“忽略是否生效”基本靠布尔返回值加局部事件判断

这个方案能跑，但有几个明显问题：

1. renderer 和主进程都在处理弹窗收敛，边界不够清楚。
2. “当前弹窗是不是对应当前 pending 版本”这件事，约束不够强。
3. `content`、`tempContent`、`pendingChange`、保存态和 UI 关闭时机都纠缠在 `winInfo` 里。

## 4. 重构后的总流程

当前分支里，这条链路已经改成了“watcher -> session pending -> 用户命令 -> session 收敛 -> snapshot 投影”。

总图如下：

```text
watch.file-changed
-> documentCommandService.dispatch()
-> watchCoordinator.handleFileChanged()
-> 如果策略是 prompt:
   session.externalRuntime.pendingExternalChange = ...
-> deriveDocumentSnapshot()
-> windowSessionBridge.publishSnapshotChanged()
-> renderer store.externalFileChange 从 snapshot.externalPrompt 推导出来
-> ExternalFileChangeModal 展示

点击“应用”:
-> document.external.apply
-> documentCommandService.dispatch()
-> watchCoordinator.handleExternalApply()
-> editorSnapshot 覆盖为磁盘内容
-> pendingExternalChange 清空，lastResolutionResult = 'applied'
-> 发布新 snapshot
-> renderer 弹窗关闭、正文刷新

点击“忽略”:
-> document.external.ignore
-> documentCommandService.dispatch()
-> watchCoordinator.handleExternalIgnore()
-> 仅清空 pendingExternalChange，保留当前 editorSnapshot
-> lastResolutionResult = 'ignored'
-> 发布新 snapshot
-> renderer 弹窗关闭，但正文不变
```

## 5. 第 1 段：watcher 先把外部版本写进 session

当前新链路里，检测外部变化后的主入口在 [watchCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js):165-221，也就是 `handleFileChanged()`。

它会按固定顺序做这几件事：

1. 校验 `bindingToken` 是否还是当前 watcher 绑定
2. 校验事件是否晚于当前 `eventFloorObservedAt`
3. 把磁盘内容先写入 `diskSnapshot`
4. 如果当前编辑器内容已经和磁盘一致，直接把这次外部版本收敛成 `noop`
5. 如果策略是 `apply`，直接把磁盘内容应用到 `editorSnapshot`
6. 如果策略是 `prompt`，创建 `pendingExternalChange`

也就是说，当前实现里，外部修改的第一落点不再是 `winInfo.content`，而是：

- `session.diskSnapshot`
- `session.externalRuntime.pendingExternalChange`

这两个字段组合起来，才构成“当前主进程认为外部发生了什么”。

### 5.1 `pendingExternalChange` 表达的是什么

当策略是 `prompt` 时，`createPendingExternalChange()` 会把当前待处理外部版本写进 `session.externalRuntime.pendingExternalChange`。

它至少包含：

- `version`
- `versionHash`
- `diskContent`
- `diskStat`
- `detectedAt`
- `watchBindingToken`

你可以把它理解成：

```text
当前有一个等待用户决策的外部版本 X
```

而不是“当前文件只是脏了”这么简单。

## 6. 第 2 段：renderer 不再直接吃 legacy 事件，而是吃 snapshot

当前 renderer 侧，外部修改弹窗已经不再靠 `file-external-changed` 这类旧事件直接驱动。

新的关键点有两个：

### 6.1 `externalPrompt` 是从 snapshot 投影出来的

主进程对外统一发布 `document.snapshot.changed`。  
然后 renderer 通过 [documentSessionSnapshotUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js):166-185，把 `snapshot.externalPrompt` 推导成 store 当前还在消费的兼容字段 `externalFileChange`。

这个推导做了一件很关键的事：

- 同版本 prompt 会保留 `loading`

也就是说，当用户点击按钮后：

- 按钮先进入 loading
- 弹窗不会立刻本地关闭
- 要等下一次 snapshot 真正收敛后，弹窗才消失

这比旧模型稳得多，因为 UI 是否该关闭，终于由主进程真相决定，而不是前端自己猜。

### 6.2 事件接线已经改成统一 snapshot handler

renderer 的统一事件接线在 [eventUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/channel/eventUtil.js):44-59。

也就是：

- 收到 `document.snapshot.changed`
- 调用 `store.applyDocumentSessionSnapshot(snapshot)`
- store 再把 `externalPrompt` 派生为 `externalFileChange`

所以当前外部修改弹窗是否显示，已经是：

```text
snapshot.externalPrompt 是否存在
```

而不是：

```text
某次单独的 file-external-changed 事件是否刚刚到达
```

## 7. 第 3 段：点击“应用”现在走的是标准命令

当前外部修改弹窗组件在 [ExternalFileChangeModal.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/ExternalFileChangeModal.vue):66-92。

现在点击“应用”的逻辑是：

```js
channelUtil.send({
  event: DOCUMENT_EXTERNAL_APPLY_COMMAND,
  data: { version },
})
```

其中 `DOCUMENT_EXTERNAL_APPLY_COMMAND` 就是：

- `document.external.apply`

这和旧实现的 `file-external-change-apply` 已经不同了。

### 7.1 主进程怎么处理 `document.external.apply`

命令先进入 [documentCommandService.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentCommandService.js):281-295。

在这里：

- `document.external.apply`
- `document.external.ignore`

都会统一转给 `watchCoordinator.dispatch(...)`。

然后“应用”分支真正落在 [watchCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js):370-382 的 `handleExternalApply()`。

它做的事情很直接：

1. 先取当前 `pendingExternalChange`
2. 校验 `payload.version` 是否仍然匹配当前 pending 版本
3. 用 `pendingExternalChange.diskContent` 覆盖 `editorSnapshot`
4. 调用 `markResolved(result: 'applied')`

最核心的语义是：

- “应用”不是直接对磁盘写回什么
- “应用”只是让当前编辑器内容接受磁盘版本
- 当前会话从“冲突待处理”进入“已采用外部版本”

### 7.2 应用后为什么弹窗会消失

因为 `markResolved()` 会把：

- `pendingExternalChange` 清空
- `resolutionState` 收敛成 `resolved`
- `lastResolutionResult` 写成 `applied`

这样下一次 `deriveDocumentSnapshot(session)` 时，`externalPrompt` 就不存在了。  
renderer 再根据最新 snapshot 派生 store，自然就把弹窗关掉了。

### 7.3 为什么正文也会刷新

因为“应用”时不仅清了 pending，还把 `editorSnapshot.content` 改成了外部磁盘内容。  
所以新的 snapshot 会同时带来：

- `externalPrompt` 消失
- `content` 变成外部版本

编辑页和预览页都只消费 snapshot，所以正文和弹窗会一起正确收敛。

## 8. 第 4 段：点击“忽略”也是标准命令，但语义完全不同

当前外部修改弹窗组件里，“忽略”的按钮逻辑在 [ExternalFileChangeModal.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/ExternalFileChangeModal.vue):39-64。

它发送的是：

- `document.external.ignore`

### 8.1 主进程怎么处理 `document.external.ignore`

和“应用”一样，命令会先到 `documentCommandService`，然后交给 `watchCoordinator`。

真正的忽略逻辑在 [watchCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js):384-395 的 `handleExternalIgnore()`。

它只做两件事：

1. 校验当前 `pendingExternalChange` 是否还存在，且版本匹配
2. 调用 `markResolved(result: 'ignored')`

这里非常关键的一点是：

- 忽略不会改 `editorSnapshot.content`
- 忽略也不会把磁盘内容再写回编辑器

也就是说，忽略的语义是：

```text
我知道磁盘上有一个新版本
但我这次选择继续保留当前编辑态
并把这次 pending 冲突标记为已处理
```

### 8.2 为什么忽略后弹窗消失但正文不变

因为忽略时：

- `pendingExternalChange` 被清空，所以弹窗对应的 `externalPrompt` 消失
- `editorSnapshot.content` 没改，所以正文仍然保持用户当前编辑的版本

这就是新模型下“忽略”的严格定义。

## 9. 版本保护：为什么旧弹窗不能误处理新 pending

这次重构里，针对 apply/ignore 做得最重要的一层保护，就是“版本匹配”。

代码在 [watchCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js):337-346 的 `matchesPendingVersion()`。

规则是：

- 如果 `payload.version` 缺失，可以视为允许消费
- 如果 `payload.version` 存在，必须等于当前 `pendingExternalChange.version`

这就解决了一个典型竞态：

```text
用户看到的是旧版本 V1 的弹窗
但系统后来已经进入了更新的 pending V2
这时旧按钮点击不能把 V2 错误处理掉
```

旧模型里，这层保护主要依赖局部布尔值和 watcher state；  
新模型里，它已经是 `watchCoordinator` 的显式裁决逻辑。

## 10. 兼容层为什么还存在：`handleLegacyExternalCommand`

你在当前代码里会看到一个容易让人误会的函数：  
[winInfoUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.js):855-881 的 `handleLegacyExternalCommand()`。

这不是说新架构没落地，而是说：

- 新命令流已经是主线
- 但底层 `fileWatchUtil` 的去重状态仍然有一层 legacy 兼容需要同步

它做的事情是：

1. 先调用 `dispatchCommand(winInfo, 'document.external.apply' / 'document.external.ignore')`
2. 看本次命令是否真的处理掉了原来的 pending 版本
3. 如果是 `applied`，调用 `fileWatchUtil.settlePendingChange(...)`
4. 如果是 `ignored`，调用 `fileWatchUtil.ignorePendingChange(...)`

所以它的本质不是再造一套业务真相，而是：

```text
新 session 真相已经收敛完了
兼容层再把底层 watcher 的旧去重状态同步一下
```

读到这里时，不要把它误解成“新旧双主线”，更准确地说，它是“新主线 + 旧底层状态的收尾桥接”。

## 11. renderer 为什么现在不自己手动关弹窗

当前 [ExternalFileChangeModal.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/ExternalFileChangeModal.vue) 有一个细节很重要：

- 点击按钮后，先 `store.setExternalFileChangeLoading(true)`
- 但不会直接 `store.resetExternalFileChange()`
- 只有在结果明确失败，或者下一轮 snapshot 仍显示同版本 prompt 时，才重置 loading

这和旧版本不同。

旧版本里，成功时前端会直接 `resetExternalFileChange()`。  
新版本里，前端只是进入 loading，真正的关闭依赖下一轮 snapshot。

这样做的原因是：

1. 弹窗是否还该存在，必须由主进程真相决定
2. 如果主进程因为版本不匹配、命令无效等原因没有真正处理掉 pending，前端不能自作主张先关掉
3. 同版本 prompt 重投影时，要保留 loading 或正确回退，不能把界面抖乱

## 12. “应用”和“忽略”现在最本质的区别

可以直接用一句话记忆：

- `apply`：让 `editorSnapshot` 接受磁盘版本，然后清掉 pending
- `ignore`：保留当前 `editorSnapshot`，只清掉 pending

所以在状态层上，两者最关键的差别就是：

```text
apply  会修改 editorSnapshot.content
ignore 不修改 editorSnapshot.content
```

它们的共同点只有一个：

- 都会让 `pendingExternalChange` 消失

## 13. 这条链路你应该从哪几个文件开始看

如果你现在要系统看懂“外部修改后点击应用/忽略”，建议按下面顺序读：

1. [watchCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js)
   先看 `handleFileChanged()`、`handleExternalApply()`、`handleExternalIgnore()`、`matchesPendingVersion()`。
2. [documentSnapshotUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js)
   看 `externalPrompt` 是怎么从 session 推导出来的。
3. [documentSessionSnapshotUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js)
   看 renderer 如何把 `snapshot.externalPrompt` 派生成兼容字段 `externalFileChange`。
4. [eventUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/channel/eventUtil.js)
   看 snapshot 是怎么统一进 store 的。
5. [ExternalFileChangeModal.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/ExternalFileChangeModal.vue)
   最后看按钮点击时发什么命令、loading 怎么保留。
6. [winInfoUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.js)
   只在你想理解 legacy watcher 状态同步时，再看 `handleLegacyExternalCommand()`。

这样读，会比直接从 `winInfoUtil.js` 里找 apply/ignore 清楚得多。

## 14. 一句话总结

当前“外部修改后点击应用/忽略”这条链路，已经不再是“按钮点击后直接改 `winInfo` 并发送几个零散事件”，而是：

```text
watcher 先把外部版本建模成 pendingExternalChange
-> 用户按钮点击发成标准命令
-> watchCoordinator 按 version 精确裁决
-> session 真相收敛
-> renderer 只通过最新 snapshot 关闭弹窗、刷新正文或保持正文
```

如果你把下面三组对象对应起来，这条链路就基本看懂了：

- 冲突真相：`pendingExternalChange`
- 用户决策：`document.external.apply` / `document.external.ignore`
- UI 收敛出口：`document.snapshot.changed`
