# Document Session 兼容层清理审计报告

> 日期：2026-03-15
> 适用范围：`DocumentSession` 兼容层清理计划执行到 Task 6 后的当前工作区
> 目标：记录已经删除的旧入口、仍保留的兼容点，以及下一轮继续收敛时应从哪里开始

## 1. 当前结论

本轮清理已经完成了 renderer 入口迁移、主进程旧 IPC handler 删除、`winInfoUtil` 手动保存与外部修改 facade 收缩，以及 session 路径 `legacy message` 双发删除。

当前工作区里，`DocumentSession` 主线已经具备以下特点：

- renderer 业务代码不再发送旧的 session 命令名
- `ipcMainUtil.js` 不再保留已失活的 session 旧 handler
- `winInfoUtil.js` 不再对外暴露 `save`、`applyExternalPendingChange`、`ignoreExternalPendingChange`
- session 路径的一次性提示只走 `window.effect.message`
- renderer store 不再维护没人消费的 `displayPath` / `recentMissingPath` / `exists` / `closePrompt` 镜像字段

## 2. 已删除的旧入口

### 2.1 已删除的旧 IPC handler

以下旧 session IPC 名称已经从生产代码删除，只在测试负向断言里保留“现在必须返回 `false`”的校验：

- `save`
- `save-other`
- `open-file`
- `get-file-info`
- `recent-clear`
- `recent-remove`
- `get-recent-list`
- `file-external-change-apply`
- `file-external-change-ignore`

说明：

- 这些名称目前只出现在 [ipcMainUtil.test.js](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js) 的删除回归测试里
- `rg` 扫描 `wj-markdown-editor-web/src` 与 `wj-markdown-editor-electron/src` 的生产代码时，已经没有这些旧入口的活跃发送/处理

### 2.2 已删除的旧 facade

以下 `winInfoUtil.js` 对外 facade 已删除：

- `save(winInfo)`
- `applyExternalPendingChange(winInfo, version)`
- `ignoreExternalPendingChange(winInfo, version)`

当前对外只保留统一命令入口：

- `executeCommand(winInfo, 'document.save')`
- `executeCommand(winInfo, 'document.external.apply', { version })`
- `executeCommand(winInfo, 'document.external.ignore', { version })`

### 2.3 已删除的 session 双发出口

以下 session 兼容出口已删除：

- `windowSessionBridge.publishMessage()` 不再为 session 路径补发 legacy `message`
- renderer 侧 `createWindowEffectMessageDeduper()` 已删除，不再为 session 双发做去重兜底

这意味着：

- session snapshot 仍由 `document.snapshot.changed` 投影
- session 一次性提示只由 `window.effect.message` 投影
- legacy `message` 监听继续保留，但只服务非 session 模块

### 2.4 已删除的 renderer 兼容派生噪音

以下字段已从 Pinia store 的独立镜像中移除：

- `displayPath`
- `recentMissingPath`
- `exists`
- `closePrompt`
- `closePromptVisible`
- `externalPromptVisible`

这些信息现在只保留在 `documentSessionSnapshot` 真相里，避免 store 再维护第二份字段外形。

## 3. 仍保留的兼容点与原因

### 3.1 `pendingCompatSavePath`

位置：

- [winInfoUtil.js](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.js)

当前保留原因：

- 手动首存链路仍需要兼容“旧调用方先把目标路径塞进 `winInfo.path`”的历史行为
- 这条路径已经被压缩到 `document.save -> open-save-dialog -> dialog.save-target-selected` 主线内部
- 它当前属于“首存路径选择 compat fallback”，不是新的对外 API

### 3.2 `getFileInfoPayload(winInfo)`

位置：

- [winInfoUtil.js](/C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.js)

当前状态：

- 生产代码里已没有活跃调用
- 当前只剩测试直接读取它的返回形状

保留原因：

- 这次计划没有把“是否彻底删除 `getFileInfoPayload()`”纳入单独任务
- 现阶段它更像一个待确认的遗留读取 facade，而不是仍有业务依赖的主线接口

建议：

- 下一轮继续清理时，优先确认这些测试是否可直接迁到 `document.get-session-snapshot` 或 session snapshot 派生断言
- 如果可以迁完，就直接删除这个 facade

### 3.3 `winInfoUtil.js` 内仍带 `legacy` 前缀的 watcher 桥接 helper

典型位置：

- `updateSessionForLegacyExternalEvent`
- `ensureLegacyExternalWatchPending`
- `applyLegacyPendingExternalChangeToSession`
- `resolveLegacyPendingExternalChange`
- `resetLegacyExternalWatchHistory`

当前保留原因：

- 这些 helper 不是旧对外 API，而是 `fileWatchUtil` 底层去重状态与 `watchCoordinator` 新命令流之间的内部桥接
- 当前 live watcher 仍依赖 `fileWatchUtil` 的 pending/handled 状态来压制重复回调
- 如果现在直接删掉，会把底层 watcher 收敛问题和本轮 compat 清理混在一起

### 3.4 legacy `message` 监听与发送

当前状态：

- session 路径已经不再补发 legacy `message`
- 但非 session 模块仍在直接发送 legacy `message`

典型来源：

- `fileUploadUtil.js`
- `imgUtil.js`
- `exportUtil.js`
- `ipcMainUtil.js` 里与非 session 逻辑相关的提示

当前保留原因：

- 本轮计划明确只清理 session 路径，不顺手改导出、上传、图片、设置等非 session 业务

## 4. 下一轮建议的清理起点

### 4.1 先看 `getFileInfoPayload()` 能否彻底删除

原因：

- 现在它已经没有生产调用，只剩测试引用
- 这是最接近“无活跃业务依赖”的遗留 facade

建议起点：

- 先改 `winInfoUtil.test.js` 中依赖它的断言
- 迁完后直接删除生产导出

### 4.2 再收 `fileWatchUtil` 相关 legacy helper

原因：

- 当前最大的兼容壳还留在 watcher 底层桥接
- 这些 helper 是 `winInfoUtil.js` 里仍然最“别扭”的一块

建议起点：

- 从 `applyLegacyPendingExternalChangeToSession()` 与 `resolveLegacyPendingExternalChange()` 开始
- 先确认 `watchCoordinator` 是否已经能独立承担 pending/handled/settled 语义
- 再决定哪些 `legacy` helper 可以内联，哪些还需要保留一轮

### 4.3 最后再评估是否继续收窄 renderer 派生字段

当前仍保留的 renderer 派生字段只有：

- `fileName`
- `saved`
- `externalFileChange`

其中：

- `fileName`、`saved` 目前仍被 `LayoutTop.vue` 直接消费
- `externalFileChange` 目前仍承担外部修改弹窗的 `loading` 运行态

如果下一轮要继续收窄：

- 可以先评估 `LayoutTop.vue` 是否直接改读 `documentSessionSnapshot`
- 再评估 `externalFileChange.loading` 是否要单独变成局部组件状态

## 5. 本轮结束时的代码扫描结论

### 5.1 旧 session 命令名

扫描结论：

- 旧 session 命令名目前只剩测试里的删除回归断言
- 生产代码中已无活跃调用

### 5.2 session 路径消息投影

扫描结论：

- `windowSessionBridge.js` 中 session 路径只保留 `window.effect.message`
- `eventUtil.js` 中 legacy `message` 监听已标注为“只服务非 session 流程”

### 5.3 renderer store 镜像字段

扫描结论：

- store 已不再维护未消费的 `displayPath` / `recentMissingPath` / `exists` / `closePrompt`
- 这些信息继续存在于 `documentSessionSnapshot` 中，供 recent-missing / close prompt 等控制器直接读取

## 6. 一句话总结

到当前工作区为止，`DocumentSession` 兼容层已经从“旧入口还在、双发还在、镜像还很多”的状态，收敛到了“只剩 watcher 底层桥接和首存 compat fallback 这两类明确保留项”。

下一轮如果继续清理，优先级建议是：

1. 删除 `getFileInfoPayload()`
2. 收 `fileWatchUtil` 相关 legacy helper
3. 视 UI 消费面情况，再决定是否继续压缩 `fileName` / `saved` / `externalFileChange`
