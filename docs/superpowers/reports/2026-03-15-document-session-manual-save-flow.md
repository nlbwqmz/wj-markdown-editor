# 文档会话化重构后的手动保存链路说明

> 日期：2026-03-15
> 适用代码：`feature/document-session-save-refactor` 当前分支
> 关注范围：用户在编辑器中按 `Ctrl+S`，也就是 `document.save` 这条链路

## 1. 先记住一句话

这次重构前，手动保存的核心模型是：

- 窗口 `winInfo` 同时保存“当前编辑内容”“磁盘基线”“保存任务”“watcher 状态”
- 保存时直接围绕 `winInfo` 写盘，再向渲染层发送多个零散事件

这次重构后，手动保存的核心模型变成了：

- `DocumentSession` 才是文档状态真相
- `document.save` 只是一个命令
- 保存动作要先进入命令层，再经过保存协调器、效果层、副作用结果回流，最后统一投影成 session snapshot

如果只看一句对比，就是：

```text
以前：直接改 winInfo -> 直接写盘 -> 直接发事件
现在：发命令 -> 改 session -> 执行 effect -> 结果回流 -> 发布 snapshot
```

## 2. 重构前的手动保存流程是什么

重构前的主线主要集中在旧版 `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js` 和旧版 `wj-markdown-editor-electron/src/util/win/winInfoUtil.js`。

当用户按下 `Ctrl+S` 时，流程大致如下：

```text
EditorView
-> channelUtil.send({ event: 'save' })
-> ipcMainUtil 处理 'save'
-> 如果 winInfo.path 为空，直接在 IPC 层弹保存对话框
-> winInfoUtil.save(winInfo)
-> flushSaveQueue()
-> writeSnapshot()
-> 直接 fs.writeFile()
-> 成功后直接修改 winInfo.content / winInfo.exists
-> 直接发送 save-success / file-is-saved / message
-> renderer 再分别监听这些事件更新标题、saved 状态、提示消息
```

旧实现的几个关键点：

- “当前编辑内容”放在 `winInfo.tempContent`
- “当前磁盘基线”放在 `winInfo.content`
- 保存态直接靠 `winInfo.content === winInfo.tempContent` 判断
- 首次保存、自动保存、关闭前保存共用 `winInfo.saveTask`，但入口分散
- recent、watcher 重绑、消息提示都在保存链路里顺手处理
- renderer 侧需要同时监听 `file-is-saved`、`save-success`、`message` 等多个事件，自己把 UI 拼起来

这个模型能工作，但有两个问题很明显：

1. `winInfo` 既是窗口容器，又是文档真相，又是保存运行态，职责太重。
2. 手动保存、自动保存、watcher、关闭流程都可能同时修改状态，竞态很难收口。

## 3. 重构后的手动保存主流程

现在看当前分支，手动保存链路已经被拆成四层：

1. renderer 入口层
2. 主进程兼容外壳层
3. session 命令与协调层
4. 副作用执行与结果回流层

完整路径可以先看这个总图：

```text
EditorView
-> channelUtil.send({ event: 'save' })
-> ipcMainUtil: 'save'
-> winInfoUtil.executeCommand(winInfo, 'document.save')
-> winInfoUtil.save()
-> winInfoUtil.dispatchCommand('document.save')
-> documentCommandService.dispatch()
-> saveCoordinator.requestSave()
-> 产出 effect: open-save-dialog 或 execute-save
-> documentEffectService.applyEffect()
-> 回流 save.started / save.succeeded / save.failed
-> documentCommandService.dispatch()
-> saveCoordinator.handleSaveSucceeded() / handleSaveFailed()
-> watchCoordinator.reconcileAfterSave()
-> deriveDocumentSnapshot(session)
-> windowSessionBridge.publishSnapshotChanged()
-> renderer store / 页面统一按 snapshot 收敛
```

下面按文件逐段讲。

## 4. 第 1 段：renderer 只负责发起保存，不再判断保存态

编辑器页里，保存入口已经非常薄了，在 [EditorView.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/EditorView.vue) 的 `save()`：

```js
function save() {
  channelUtil.send({ event: 'save' })
}
```

`channelUtil` 本身也只是一个 IPC 包装，在 [channelUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/channel/channelUtil.js)：

- `send()` 直接调用 `window.node.sendToMain(data)`

这里有一个很重要的设计变化：

- renderer 不再自己判断“当前是否已保存”
- renderer 也不再把 `Ctrl+S` 直接理解成“立刻写文件”
- renderer 只是发出 `save` 请求，真正的状态裁决全部在主进程

## 5. 第 2 段：IPC 层把旧事件名代理到新命令

当前 `ipcMainUtil.js` 里仍保留了旧事件名 `save`，但它已经不是旧语义了。入口在 [ipcMainUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js):108-109：

```js
'save': async winInfo => await winInfoUtil.executeCommand(winInfo, 'document.save', null)
```

这说明两件事：

1. renderer 还在发旧 IPC 名称 `save`
2. 但主进程内部已经把它翻译成新命令 `document.save`

也就是说，`ipcMainUtil.js` 现在只是兼容入口，不再承担保存业务本身。

## 6. 第 3 段：winInfoUtil 现在是外壳，不再是保存真相

当前的 [winInfoUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.js) 看起来还是很大，但手动保存相关代码要用“兼容外壳”视角去读。

### 6.1 `executeCommand()` 只是把命令分流

在 [winInfoUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.js):1196-1283，`executeCommand()` 负责把不同类型的命令分发出去。

对手动保存来说，它先进入：

- `executeCommand(winInfo, 'document.save')`
- 然后走到 `save(winInfo)`

### 6.2 `save(winInfo)` 是旧 facade，对外仍返回“这次 Ctrl+S 成没成功”

真正的兼容层逻辑在 [winInfoUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.js):948-1003。

它做的事情不是“自己保存”，而是：

1. 如果当前 session 还没有正式 `documentSource.path`，但兼容层已经预塞了 `winInfo.path`，先把它暂存在 `pendingCompatSavePath`
2. 调用 `dispatchCommand(winInfo, 'document.save')`
3. 取回本次 `manualRequestId`
4. 等待这一次手动保存请求自己的 completion
5. 再根据这次 request 的结果，决定是否给用户显示“保存成功”或“取消保存”

这里最值得注意的是第 4 步。

旧逻辑里，`Ctrl+S` 往往只是在等“当前 saveTask 跑完”。  
新逻辑里，`Ctrl+S` 等的是“这一次 manual request 自己的结算结果”，也就是：

- 不会被后面新来的自动保存吞掉
- 不会把别的保存结果误算成这次 `Ctrl+S` 的结果

这就是重构里“manual save request 独立建模”的意义。

## 7. 第 4 段：真正的命令入口是 `documentCommandService`

所有保存相关命令，最终都进 [documentCommandService.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentCommandService.js):81-315。

对手动保存来说，核心分支是：

- `document.save`
- `dialog.save-target-selected`
- `dialog.save-target-cancelled`
- `save.started`
- `save.succeeded`
- `save.failed`

### 7.1 `document.save`

在 [documentCommandService.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentCommandService.js):112-120：

- 命令层收到 `document.save`
- 直接调用 `saveCoordinator.requestSave(session, { trigger: 'manual-save' })`
- 把协调器返回的 effect 继续交给外层执行

也就是说，命令层本身不写盘，它只做两件事：

1. 取到当前 active session
2. 把保存意图交给 `saveCoordinator`

### 7.2 `save.succeeded`

在 [documentCommandService.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentCommandService.js):255-267：

- 先让 `saveCoordinator.handleSaveSucceeded()` 收敛保存结果
- 再调用 `watchCoordinator.reconcileAfterSave(session)`
- 最后如有必要，刷新手动请求 completion

这里说明当前实现里“保存成功”不只是一句写盘成功，而是一次状态收敛：

- 保存运行态要收敛
- 磁盘基线可能要更新
- watcher 的 event floor / binding token 可能要推进
- 关闭链路如果正在等待这个 job，也要继续裁决

## 8. 第 5 段：`saveCoordinator` 才是真正的保存核心

如果你只想看“现在手动保存到底怎么跑”，最重要的文件就是 [saveCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js)。

建议优先看下面几个函数。

### 8.1 `requestSave()`：把一次保存请求转成统一状态机入口

入口在 [saveCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js):627-700。

手动保存进来后，它会做几件关键事：

1. 如果是 `manual-save`，先创建 `manualRequestId`
2. 如果当前正处在“等待选路径”状态，就只合并 trigger，不重复起流程
3. 如果当前已有 in-flight save job，就不并发再写盘，但会保留更强的 trigger 语义
4. 如果当前文档还没有正式路径，转入 `awaiting-path-selection`
5. 否则调用 `beginSave()`

这一段解决的是“手动保存不是立即写盘，而是一个请求进入统一裁决流程”的问题。

### 8.2 `beginSave()`：冻结这次要写盘的快照

入口在 [saveCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js):537-591。

这是整个重构里最关键的保存动作之一。

它会把当前 session 冻结成一个 save job：

- `jobId`
- `sessionId`
- `revision`
- `content`
- `path`
- `trigger`

也就是 [saveCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js):461-469 的 `createSaveJob()`。

这个冻结动作很重要，因为它保证：

- 保存中的后续编辑不会污染本次写盘内容
- 本次 `save.succeeded` 只能结算这次冻结出来的 revision
- “保存期间继续编辑”时，新增编辑不会被误标记为已保存

### 8.3 首次保存不是特例写盘，而是标准 effect

如果当前 session 没有正式路径，`requestSave()` 不会直接写盘，而是返回：

- `status = 'awaiting-path-selection'`
- effect: `open-save-dialog`

对应代码在 [saveCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js):667-688。

这意味着首次保存现在也是标准命令流的一部分：

```text
document.save
-> open-save-dialog
-> dialog.save-target-selected
-> beginSave()
-> execute-save
```

而不是像旧实现那样，在 IPC 层先弹窗、再直接改 `winInfo.path`、再继续保存。

### 8.4 `handleSaveSucceeded()`：写盘成功后不是直接算完，而是继续收敛

入口在 [saveCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js):892-1040。

它会做下面这些事：

1. 先校验 `payload.jobId` 是否等于当前 in-flight job
2. 更新 `persistedSnapshot`
3. 把当前文档身份收敛成“存在且绑定到目标路径”
4. 只有在 watcher 没有先看到更高优先级磁盘版本时，才回写 `diskSnapshot`
5. 推进 `watchRuntime.eventFloorObservedAt`
6. 如果路径身份变化或文件从不存在恢复为存在，推进 `bindingToken`
7. 清理 in-flight save runtime
8. 结算已经被这次保存覆盖到的 manual request
9. 如果保存期间又有新编辑，决定是否继续补写下一轮

这里最值得你重点理解的是第 4 步：

- `save.succeeded` 并不总是可以把 `diskSnapshot` 改成这次保存的内容
- 如果 watcher 在保存期间已经观测到了一个不同的磁盘版本，那么磁盘真相应该以 watcher 为准
- 这就是当前代码里“保护 watched disk truth”的核心

这也是为什么你会看到 `persistedSnapshot` 和 `diskSnapshot` 分成两套：

- `persistedSnapshot` 表示“本会话最近一次确认写盘成功的版本”
- `diskSnapshot` 表示“主进程当前观测到的磁盘真相”

两者不是一回事。

## 9. 第 6 段：真正写文件的是 `documentEffectService`

`saveCoordinator` 只产出 effect，不直接碰文件系统。  
真正写盘发生在 [documentEffectService.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentEffectService.js):297-365。

当 effect 类型是 `execute-save` 时，效果层会：

1. 先回流 `save.started`
2. 执行 `fs.writeFile(effect.job.path, effect.job.content)`
3. 成功后回流 `save.succeeded`
4. 异步补做 `recent.add`
5. 如有必要，重绑 watcher，并回流 `watch.bound` 或 `watch.rebind-failed`

这一层的关键设计是：

- 写盘属于 effect
- effect 自己不持有业务真相
- effect 的结果必须回流命令层，不能在 effect 内直接偷偷改 session

所以现在的写盘链路不是：

```text
saveCoordinator -> fs.writeFile -> 完事
```

而是：

```text
saveCoordinator -> effect.execute-save
-> effect 层写盘
-> dispatch save.succeeded
-> 命令层再收敛状态
```

## 10. 第 7 段：快照是唯一对 renderer 的文档真相出口

命令执行完以后，`winInfoUtil.dispatchCommand()` 会：

1. 把 session 同步回兼容镜像
2. 生成最新 snapshot
3. 通过 `windowSessionBridge.publishSnapshotChanged()` 发给 renderer
4. 再执行 effect

关键逻辑在 [winInfoUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.js):704-728 和 [windowSessionBridge.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/windowSessionBridge.js):41-52。

也就是说，现在 renderer 真正应该相信的是：

- `document.snapshot.changed`

而不是旧时代的：

- `file-is-saved`
- `save-success`
- `file-content-reloaded`

这些旧事件里，真正与手动保存主流程相关的文档真相已经被 snapshot 取代了。

## 11. 现在的手动保存为什么更稳

和重构前相比，这条链路主要解决了 5 类问题。

### 11.1 保存期间继续编辑

现在每次保存都冻结 `revision + content`，不会再把保存期间新增的编辑误算成已保存。

### 11.2 手动保存不会被自动保存吞掉

现在 `manualRequestId` 单独记录这次 `Ctrl+S` 的完成态，手动保存是按 request 结算，不是按“系统里最后一次 saveTask”结算。

### 11.3 首次保存路径选择进入标准命令流

首次保存不再是 IPC 层的特殊分支，而是：

- `open-save-dialog`
- `dialog.save-target-selected`
- `beginSave`

这样首存、自动保存、关闭前保存都能复用同一套保存状态机。

### 11.4 保存成功不会盲目覆盖 watcher 已知的磁盘真相

`handleSaveSucceeded()` 会判断当前 `diskSnapshot` 是否还能安全回写，避免 watcher 已经看见更新版本时，又被旧保存结果倒灌回去。

### 11.5 renderer 不再靠多事件拼装保存结果

现在标题、保存态、close prompt、external prompt 都从 snapshot 推导，状态出口统一了。

## 12. 这条链路你该从哪几个文件开始看

如果你只想理解“手动保存”，建议按下面顺序读：

1. [EditorView.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/EditorView.vue)
   先看 `save()`，确认 renderer 入口到底有多薄。
2. [ipcMainUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js)
   看旧 IPC 名称 `save` 如何代理到 `document.save`。
3. [winInfoUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.js)
   重点看 `executeCommand()`、`save()`、`dispatchCommand()`。
4. [documentCommandService.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentCommandService.js)
   看 `document.save`、`save.succeeded`、`save.failed` 三个入口。
5. [saveCoordinator.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js)
   重点看 `requestSave()`、`beginSave()`、`handleSaveSucceeded()`。
6. [documentEffectService.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentEffectService.js)
   看 `execute-save` effect 如何真正写文件并回流命令。
7. [documentSnapshotUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js)
   最后看当前保存态是怎么从 session 推导出来的。

如果你按这个顺序读，会比一上来直接啃整份 `winInfoUtil.js` 清晰很多。

## 13. 阅读时最容易混淆的点

### 13.1 `winInfo` 还在，但它已经不是文档真相

当前 `winInfoUtil.js` 里仍然有：

- `winInfo.path`
- `winInfo.content`
- `winInfo.tempContent`

但这些现在更像兼容镜像，不应该再把它们当成保存业务的根状态。

### 13.2 `persistedSnapshot` 不等于 `diskSnapshot`

这是新架构里最重要的认知点之一：

- `persistedSnapshot` 说明“本会话曾经成功写过什么”
- `diskSnapshot` 说明“磁盘现在是什么”

只有理解这两个分离，你才能看懂为什么 `save.succeeded` 之后还要继续判 watcher 竞态。

### 13.3 “写盘成功”不等于“当前文档已经 saved=true”

如果保存期间 watcher 已经发现了另一个更新版本，当前文档依然可能不是 `saved=true`。  
这个行为不是 bug，而是这次重构故意加上的保护。

## 14. 一句话总结

当前手动保存链路的本质，不再是“按下 Ctrl+S 直接把 `tempContent` 写到磁盘”，而是：

```text
把一次手动保存意图建模成独立 request
-> 进入统一命令流
-> 冻结本次 save job
-> effect 层执行写盘
-> 结果回流命令层收敛
-> 最终只通过 session snapshot 投影给 renderer
```

如果你能把这句话和下面三组对象对应起来，这条链路就算看懂了一半：

- 命令入口：`document.save`
- 保存协调：`saveCoordinator`
- 真相出口：`document.snapshot.changed`
