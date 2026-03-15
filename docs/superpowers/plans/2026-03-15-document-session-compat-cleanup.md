# Document Session Compat Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏当前 `DocumentSession` 主线行为的前提下，逐步清理 renderer 与主进程中的兼容层、旧 IPC 名称、旧状态镜像和 session 相关双发事件，让保存、外部修改、关闭链路的阅读路径回到单一主线。

**Architecture:** 这次清理不是新一轮重构，而是“沿着现有 `DocumentSession` 主线去掉过渡外壳”。执行顺序固定为：先统一 renderer 命令入口，再删除无活跃调用的 IPC 别名，再收缩 `winInfoUtil` 的 facade 与 session 相关 legacy 桥接，最后再考虑 watcher 底层兼容状态的进一步收敛。所有“文档状态真相”必须继续唯一来源于主进程 session snapshot，不能在清理过程中重新长出新的局部真相。

**Tech Stack:** Electron 39、Vue 3、Pinia、Vitest、Node `node:test`、ESLint、Ripgrep、Electron IPC

---

## 前置约束

- 本计划只处理“文档 session 相关兼容层”，不顺手清理导出、截图、图片上传、设置窗口等非 session 业务的 `message` 事件。
- 当前仓库存在正在进行中的大量未提交改动，执行时严禁误删用户现有修改；所有删除动作都必须先通过 repo 内调用点检索与测试回归确认。
- 对于像 `ipcMainUtil.js` 这种兼容入口文件：只要某个旧 handler 调整完成后，仓库内已经不存在任何活跃调用，并且对应测试已经迁移到新协议，就应直接删除该旧 handler，不保留“死别名”。
- 对于 `winInfoUtil.js` 内部 facade：如果某个兼容导出仅被旧 IPC 别名或旧测试使用，且两者都已经迁移，应同步删除该 facade 与相关测试，不保留“无调用包装”。
- 对于 `windowSessionBridge.js` 的 legacy `message` 双发：只有在确认 session 相关消息已全部改走 `window.effect.message` 且 renderer 不再依赖双发去重时，才能删除 session 路径上的 legacy `message`；不能影响非 session 模块现存的旧消息流。
- 清理顺序必须遵守“外层调用点先迁移，内层兼容点后删除”的原则，禁止直接从最内层删接口导致上层大面积编译失败后再回头补。

## 目标边界

### 本计划要达到的状态

- renderer 侧的文档打开、保存、保存副本、recent 操作、外部修改 apply/ignore 不再发送旧事件名。
- `ipcMainUtil.js` 不再保留无活跃调用的 session 相关旧 handler。
- `winInfoUtil.js` 不再暴露多余的 session 相关兼容 facade。
- session 相关的一次性消息只保留 `window.effect.message` 这条主线。
- renderer store 中与 session 相关的兼容字段只作为 snapshot 派生结果存在，不再被任何模块视作独立可写真相。

### 本计划暂不强求达到的状态

- 不要求一次性彻底重写 `fileWatchUtil.js` 的全部底层状态结构。
- 不要求移除所有全局 `message` 事件，只清理 session 相关消息双发。
- 不要求把所有 `winInfoUtil.js` 内容拆成多个文件；只要求边界变清晰、无用 facade 被删除。

## 已确认的活跃旧调用点

截至当前计划编写时，仓库内仍存在以下 session 相关旧调用点，需要作为清理起点：

- `save`
  - [EditorView.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/EditorView.vue)
  - [shortcutKeyUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/shortcutKeyUtil.js)
- `save-other`
  - [shortcutKeyUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/shortcutKeyUtil.js)
- `open-file`
  - [LayoutMenu.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/layout/LayoutMenu.vue)
  - [shortcutKeyUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/shortcutKeyUtil.js)
- `get-file-info`
  - [ExportView.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/ExportView.vue)
- `recent-clear`
  - [LayoutMenu.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/layout/LayoutMenu.vue)
- `recent-remove`
  - [commonUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/commonUtil.js)
- `file-external-change-apply` / `file-external-change-ignore`
  - 当前 web 源码主线已经迁移，但 Electron 测试 [ipcMainUtil.test.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js) 仍覆盖旧入口

这些调用点迁移完成前，不能直接删对应 handler。

## 文件结构

- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
  - 将手动保存入口改为新命令 `document.save`。
- Modify: `wj-markdown-editor-web/src/util/shortcutKeyUtil.js`
  - 将快捷键层的打开、保存、保存副本命令改成新协议。
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`
  - 将 recent 打开、recent 清空等菜单入口切到新协议。
- Modify: `wj-markdown-editor-web/src/util/commonUtil.js`
  - 将 recent 删除等工具层入口切到新协议。
- Modify: `wj-markdown-editor-web/src/views/ExportView.vue`
  - 评估 `get-file-info` 是否可切到 `document.get-session-snapshot`，并把导出页依赖的字段改成从 snapshot 读取。
- Modify: `wj-markdown-editor-web/src/components/ExternalFileChangeModal.vue`
  - 清理剩余旧协议依赖，确保 apply/ignore 只使用 `document.external.apply` / `document.external.ignore`。
- Modify: `wj-markdown-editor-web/src/stores/counter.js`
  - 明确 `documentSessionSnapshot` 为唯一 session 真相，兼容字段只保留派生用途。
- Modify: `wj-markdown-editor-web/src/util/channel/eventUtil.js`
  - 删除只服务于 session 旧真相拼装的残留兼容逻辑；保留非 session 旧 `message` 兼容入口。
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
  - 删除已无活跃调用的旧 session handler；保留仍被非 session 业务使用的入口。
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
  - 将旧协议测试迁移到新协议；当旧 handler 删除后，同步删除旧入口测试。
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.js`
  - 压缩 session 相关 facade，删除无活跃调用的兼容函数与导出。
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js`
  - 将测试从 facade 行为改成新命令流行为；删除不再存在的 facade 测试。
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowSessionBridge.js`
  - 分离 session 与非 session 消息投影，删掉 session 路径上的 legacy `message` 双发。
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js`
  - 校验 session 消息只通过 `window.effect.message` 投影。
- Modify: `wj-markdown-editor-web/src/util/document-session/documentSessionEventUtil.js`
  - 在 renderer 明确只接 session 主线事件，不再为已删除的 legacy session 事件保留适配。
- Modify: `wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js`
  - 如有必要，继续压缩纯兼容派生字段，保证派生语义清晰。
- Create: `docs/superpowers/reports/2026-03-15-document-session-compat-cleanup-audit.md`
  - 每一阶段完成后记录“哪些旧入口已经删除、哪些仍保留、为什么保留”。

## 删除规则

### 规则 1：旧 IPC handler 删除规则

以下条件同时满足时，旧 handler 必须直接删除，不再保留：

1. `rg` 检索仓库业务代码后，已不存在活跃调用。
2. 对应测试已经迁移到新协议，或该旧测试已同步删除。
3. 新协议的端到端行为已有测试覆盖。

典型适用对象：

- `save`
- `save-other`
- `open-file`
- `get-file-info`
- `recent-clear`
- `recent-remove`
- `file-external-change-apply`
- `file-external-change-ignore`

### 规则 2：旧 facade 删除规则

以下条件同时满足时，`winInfoUtil.js` 里的兼容 facade 必须直接删除：

1. 不再有活跃 IPC handler 调用它。
2. 不再有测试直接以旧 facade 为行为入口。
3. 新命令流对应测试已经补齐。

典型适用对象：

- `save(winInfo)`
- `applyExternalPendingChange(winInfo, version)`
- `ignoreExternalPendingChange(winInfo, version)`
- `getFileInfoPayload(winInfo)`，前提是导出页与其余调用方已经迁到 snapshot 读取

### 规则 3：session 消息双发删除规则

以下条件同时满足时，`windowSessionBridge.js` 中 session 路径的 legacy `message` 双发必须删除：

1. renderer 侧 session UI 已完全基于 `window.effect.message`。
2. `eventUtil.js` 不再依赖“同一条 session 消息既从 `window.effect.message` 来又从 `message` 来”的去重逻辑。
3. 非 session 业务仍需要 legacy `message` 时，要改为它们各自直接发送 legacy `message`，而不是复用 bridge 的 session 双发。

## Chunk 1: 迁移 renderer 入口并清理无活跃旧 IPC

### Task 1: 先把 web 侧调用点全部切到新协议

**Files:**
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/util/shortcutKeyUtil.js`
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`
- Modify: `wj-markdown-editor-web/src/util/commonUtil.js`
- Modify: `wj-markdown-editor-web/src/views/ExportView.vue`
- Test: `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionEventUtil.test.js`

- [ ] **Step 1: 先写一份调用点清单注释，锁定替换映射**

在本任务开始前，先把下列旧 -> 新映射写入本地工作记录或任务注释，执行时严格照此替换：

```text
save -> document.save
save-other -> document.save-copy
open-file (无 path) -> document.request-open-dialog
open-file (有 path) -> document.open-path
recent-clear -> recent.clear
recent-remove -> recent.remove
get-file-info -> document.get-session-snapshot
```

- [ ] **Step 2: 写失败测试或补断言，证明 renderer 主动调用的是新协议**

为现有 web 测试补断言，至少覆盖：
- `EditorView.vue` 保存入口不再发送 `save`
- 快捷键保存/保存副本不再发送 `save` / `save-other`
- LayoutMenu recent 打开与清空不再发送 `open-file` / `recent-clear`
- ExternalFileChangeModal 不再发送 `file-external-change-apply` / `file-external-change-ignore`

Run: `cd wj-markdown-editor-web && node --test src/util/document-session/__tests__/documentSessionEventUtil.test.js src/util/document-session/__tests__/rendererSessionSnapshotController.test.js`

Expected:
- 先 FAIL，或至少新增断言先暴露旧事件名仍在被发送。

- [ ] **Step 3: 修改调用点到新协议**

实现要求：
- [EditorView.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/EditorView.vue) 中保存入口改为发送 `document.save`
- [shortcutKeyUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/shortcutKeyUtil.js) 中打开、保存、保存副本快捷键全部改为新协议
- [LayoutMenu.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/components/layout/LayoutMenu.vue) 中 recent 打开改为 `document.open-path` 或 `document.open-recent`，清空改为 `recent.clear`
- [commonUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/commonUtil.js) 中 recent 删除改为 `recent.remove`
- [ExportView.vue](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/views/ExportView.vue) 从 `document.get-session-snapshot` 读取所需字段；如果导出页只需要 `content/fileName/displayPath/saved`，应从 snapshot 派生，不再依赖旧 `get-file-info` 形状

- [ ] **Step 4: 运行 web 定向测试**

Run: `cd wj-markdown-editor-web && node --test src/util/document-session/__tests__/documentSessionEventUtil.test.js src/util/document-session/__tests__/rendererSessionSnapshotController.test.js src/util/document-session/__tests__/editorSessionSnapshotController.test.js`

Expected:
- PASS。
- 不再出现对旧事件名的断言依赖。

- [ ] **Step 5: 按包执行 ESLint**

Run: `cd wj-markdown-editor-web && npx eslint --fix src/views/EditorView.vue src/util/shortcutKeyUtil.js src/components/layout/LayoutMenu.vue src/util/commonUtil.js src/views/ExportView.vue`

Expected:
- 命令成功退出。

### Task 2: 删除已失活的 session 旧 IPC handler

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`

- [ ] **Step 1: 用 `rg` 重新确认旧 handler 是否还有活跃调用**

Run:

```powershell
rg -n "event:\s*'save'|event:\s*'save-other'|event:\s*'open-file'|event:\s*'get-file-info'|event:\s*'recent-clear'|event:\s*'recent-remove'|event:\s*'file-external-change-apply'|event:\s*'file-external-change-ignore'" wj-markdown-editor-web/src wj-markdown-editor-electron/src
```

Expected:
- 只允许 Electron 测试文件还提到这些旧事件名。
- 若 web 业务代码仍有残留，返回上一个任务修完再继续。

- [ ] **Step 2: 先改测试，迁移到新协议**

将 [ipcMainUtil.test.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js) 中针对以下旧入口的测试改写为新协议：
- `save` -> `document.save`
- `open-file` -> `document.request-open-dialog` / `document.open-path`
- `file-external-change-apply` -> `document.external.apply`
- `file-external-change-ignore` -> `document.external.ignore`
- `recent-clear` -> `recent.clear`
- `recent-remove` -> `recent.remove`

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/channel/ipcMainUtil.test.js`

Expected:
- 先 FAIL，证明测试已不再依赖旧 handler。

- [ ] **Step 3: 删除无活跃调用的旧 handler**

在 [ipcMainUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js) 中执行以下清理：
- 删除不再有活跃调用的旧 session handler
- 删除只服务这些旧 handler 的轻量兼容包装，例如 `toLegacyOpenFileResult()`，前提是其唯一消费方已删除
- 保留非 session 或仍有活跃调用的 handler，不做顺手清理

删除前必须逐项核对：
- 对应 web 源码调用已迁移
- 对应测试已迁移

- [ ] **Step 4: 跑 Electron 定向测试**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/channel/ipcMainUtil.test.js src/util/win/winInfoUtil.test.js`

Expected:
- PASS。
- 不再有测试依赖已删除的旧 handler。

- [ ] **Step 5: 按包执行 ESLint**

Run: `cd wj-markdown-editor-electron && npx eslint --fix src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js`

Expected:
- 命令成功退出。

## Chunk 2: 收缩 `winInfoUtil` facade，消除 session 双真相感

### Task 3: 收缩手动保存 facade

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js`

- [ ] **Step 1: 先盘点 `save(winInfo)` 的真实调用者**

Run:

```powershell
rg -n "winInfoUtil\.save\(" wj-markdown-editor-electron/src wj-markdown-editor-electron/src/**/*.test.js
```

Expected:
- 若只剩 `executeCommand('document.save')` 内部路径与旧测试使用，则可进入收缩。

- [ ] **Step 2: 把 `document.save` 的 compat 结算压回命令流结果，不再暴露额外 facade**

实现目标：
- 如果 `save(winInfo)` 只剩兼容用途，将其内联回 `executeCommand()` 或拆成私有 helper
- 删除不再需要的导出
- `pendingCompatSavePath` 如果在 renderer 和 IPC 全部切新协议后不再需要，评估并删除；如果首存兼容仍依赖，先保留但把注释写清楚“唯一剩余原因”

- [ ] **Step 3: 重写对应测试**

将 [winInfoUtil.test.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js) 中“直接测 `save(winInfo)`”的用例改成“测 `executeCommand(winInfo, 'document.save')` 的行为”。

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/win/winInfoUtil.test.js src/util/document-session/__tests__/saveCoordinator.test.js`

Expected:
- 先 FAIL，再修实现后 PASS。

- [ ] **Step 4: 删除无调用的导出并补注释**

当确认外部已无直接调用后：
- 删除 `save` 导出
- 更新相关 mock 和测试
- 在保留的私有 helper 上补充中文注释，明确其为何尚未删除

- [ ] **Step 5: 跑测试并执行 ESLint**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/win/winInfoUtil.test.js src/util/document-session/__tests__/saveCoordinator.test.js src/util/document-session/__tests__/documentCommandService.test.js`
- `cd wj-markdown-editor-electron && npx eslint --fix src/util/win/winInfoUtil.js src/util/win/winInfoUtil.test.js`

Expected:
- PASS，且不存在旧 facade 直接对外暴露。

### Task 4: 收缩外部修改 compat facade

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`

- [ ] **Step 1: 确认 `applyExternalPendingChange` / `ignoreExternalPendingChange` 是否还有生产调用**

Run:

```powershell
rg -n "applyExternalPendingChange|ignoreExternalPendingChange" wj-markdown-editor-electron/src wj-markdown-editor-web/src
```

Expected:
- 若只剩测试或已删除旧 IPC 入口，则可以删 facade。

- [ ] **Step 2: 把旧 facade 测试迁到新命令入口**

将相关测试改成通过：
- `executeCommand(winInfo, 'document.external.apply', { version })`
- `executeCommand(winInfo, 'document.external.ignore', { version })`

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/win/winInfoUtil.test.js src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/watchCoordinator.test.js`

Expected:
- 先 FAIL，再修实现。

- [ ] **Step 3: 删除 `handleLegacyExternalCommand` 外层 facade 或将其私有化**

清理目标：
- 若 `executeCommand()` 已直接支持新命令入口，删除 `applyExternalPendingChange()` / `ignoreExternalPendingChange()` 对外导出
- `handleLegacyExternalCommand()` 如仍需要承担 `fileWatchUtil` 底层去重状态同步，则保留为私有 helper，不再作为对外 API 语义出现
- 若其逻辑可直接吸收进 `executeCommand()` 的 `document.external.apply/ignore` 分支，则进一步内联

- [ ] **Step 4: 跑测试并执行 ESLint**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/win/winInfoUtil.test.js src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/watchCoordinator.test.js`
- `cd wj-markdown-editor-electron && npx eslint --fix src/util/win/winInfoUtil.js src/util/win/winInfoUtil.test.js src/util/channel/ipcMainUtil.test.js`

Expected:
- PASS。
- 生产代码不再直接暴露旧外部修改 facade。

## Chunk 3: 去掉 session 路径上的消息双发与多余派生噪音

### Task 5: 删除 session 路径上的 legacy `message` 双发

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowSessionBridge.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js`
- Modify: `wj-markdown-editor-web/src/util/channel/eventUtil.js`

- [ ] **Step 1: 先确认当前 renderer 对 session 消息是否仍依赖 legacy `message`**

检查以下事实：
- `eventUtil.js` 中 session 相关逻辑已经直接接收 `window.effect.message`
- legacy `message` 主要留给非 session 模块

Run:

```powershell
rg -n "window.effect.message|eventEmit\\.on\\('message'" wj-markdown-editor-web/src wj-markdown-editor-electron/src
```

- [ ] **Step 2: 修改桥接测试，要求 session 消息只发 `window.effect.message`**

更新 [windowSessionBridge.test.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js)：
- 对 session 路径上的 `publishMessage()`，不再期望 legacy `message` 同步发出

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/windowSessionBridge.test.js`

Expected:
- 先 FAIL。

- [ ] **Step 3: 修改 `windowSessionBridge.js`**

实现要求：
- session 路径上的消息只发 `window.effect.message`
- 非 session 模块原本直接 `sendUtil.send(..., { event: 'message' })` 的路径不动

- [ ] **Step 4: 调整 renderer 去重逻辑**

在 [eventUtil.js](C:/wj/code/wj-markdown-editor/wj-markdown-editor-web/src/util/channel/eventUtil.js) 中：
- 保留对 legacy `message` 的监听，但仅服务非 session 模块
- session 路径不再依赖“双发 + 去重”才成立

- [ ] **Step 5: 跑跨包测试**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/windowSessionBridge.test.js src/util/channel/ipcMainUtil.test.js`
- `cd wj-markdown-editor-web && node --test src/util/document-session/__tests__/documentSessionEventUtil.test.js`

Expected:
- PASS。

- [ ] **Step 6: 按包执行 ESLint**

Run:
- `cd wj-markdown-editor-electron && npx eslint --fix src/util/document-session/windowSessionBridge.js src/util/document-session/__tests__/windowSessionBridge.test.js`
- `cd wj-markdown-editor-web && npx eslint --fix src/util/channel/eventUtil.js`

Expected:
- 命令成功退出。

### Task 6: 继续压缩 renderer 中的兼容派生噪音

**Files:**
- Modify: `wj-markdown-editor-web/src/stores/counter.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js`

- [ ] **Step 1: 确认哪些兼容字段仍有真实消费**

Run:

```powershell
rg -n "store\\.(fileName|saved|displayPath|recentMissingPath|externalFileChange|closePrompt)" wj-markdown-editor-web/src
```

Expected:
- 得到当前仍在消费的字段清单。

- [ ] **Step 2: 只保留仍被 UI 消费的派生字段**

实现目标：
- 如果某些派生字段已无消费，直接删除
- 仍保留的字段必须全部由 `documentSessionSnapshot` 派生，且代码注释要明确“不属于独立真相”

- [ ] **Step 3: 跑 web 定向测试**

Run: `cd wj-markdown-editor-web && node --test src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/document-session/__tests__/rendererSessionSnapshotController.test.js`

Expected:
- PASS。

- [ ] **Step 4: 执行 ESLint**

Run: `cd wj-markdown-editor-web && npx eslint --fix src/stores/counter.js src/util/document-session/documentSessionSnapshotUtil.js src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js`

Expected:
- 命令成功退出。

## Chunk 4: 记录保留项、补审计文档、为下一轮 watcher 清理留边界

### Task 7: 输出兼容层审计报告

**Files:**
- Create: `docs/superpowers/reports/2026-03-15-document-session-compat-cleanup-audit.md`

- [ ] **Step 1: 列出已删除的旧入口**

报告中至少包含：
- 哪些旧 IPC handler 已删除
- 哪些旧 facade 已删除
- 哪些 session 双发出口已删除

- [ ] **Step 2: 列出仍保留的兼容点与原因**

必须明确说明仍保留项属于哪一类：
- 非 session 业务仍依赖
- watcher 底层桥接尚未收口
- 导出或其它视图尚未迁完

- [ ] **Step 3: 指出下一轮若继续清理，应从哪些残留点开始**

至少记录：
- `fileWatchUtil.js` 底层 pending/handled 状态语义是否还需要二次收口
- `getFileInfoPayload()` 是否仍存在非 session 消费
- 是否还有 session 旧事件名只出现在测试中

## 最终验证矩阵

- [ ] **Step 1: 仓库级检索确认旧入口清理状态**

Run:

```powershell
rg -n "event:\s*'save'|event:\s*'save-other'|event:\s*'open-file'|event:\s*'get-file-info'|event:\s*'recent-clear'|event:\s*'recent-remove'|event:\s*'file-external-change-apply'|event:\s*'file-external-change-ignore'" wj-markdown-editor-web/src wj-markdown-editor-electron/src
```

Expected:
- 若仍有结果，必须逐条解释是“测试专用残留”还是“未完成迁移”。
- 对于已迁移完成的旧入口，结果应为 0。

- [ ] **Step 2: Electron 定向回归**

Run:

```powershell
cd wj-markdown-editor-electron
npx vitest run src/util/channel/ipcMainUtil.test.js src/util/win/winInfoUtil.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/saveCoordinator.test.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/windowSessionBridge.test.js
```

Expected:
- PASS。

- [ ] **Step 3: Web 定向回归**

Run:

```powershell
cd wj-markdown-editor-web
node --test src/util/document-session/__tests__/documentSessionEventUtil.test.js src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/document-session/__tests__/editorSessionSnapshotController.test.js src/util/document-session/__tests__/rendererSessionSnapshotController.test.js
```

Expected:
- PASS。

- [ ] **Step 4: Web 构建验证**

Run:

```powershell
cd wj-markdown-editor-web
npm run build
```

Expected:
- 构建成功。

- [ ] **Step 5: 手动验证**

Manual checks:
- 快捷键 `Ctrl+S`、菜单保存、保存副本都正常。
- recent 打开、recent 删除、recent 清空都正常。
- 外部修改弹窗点击“应用/忽略”后，UI 仍通过 snapshot 正常收敛。
- 关闭前确认弹窗与 session snapshot 保持同步。

## 完成定义

- renderer 业务代码中不再发送任何 session 旧命令名。
- `ipcMainUtil.js` 中所有已无活跃调用的 session 旧 handler 都已删除，没有死别名残留。
- `winInfoUtil.js` 中所有已无活跃调用的 session facade 都已删除或改为私有 helper。
- session 路径上的消息只通过 `window.effect.message` 投影。
- 审计报告已写明已删除项、保留项和下一轮清理边界。

Plan complete and saved to `docs/superpowers/plans/2026-03-15-document-session-compat-cleanup.md`. Ready to execute?
