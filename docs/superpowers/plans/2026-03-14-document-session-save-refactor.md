# 文档会话化保存与监听重构 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `DocumentSession` 架构统一主进程文档状态、保存链路、文件监听和资源上下文，在不回退现有业务能力的前提下消除保存与监听竞态，并为后续多标签扩展预留稳定边界。

**Architecture:** Electron 主进程作为文档状态真相，新增 `documentSessionStore`、`documentCommandService`、`saveCoordinator`、`watchCoordinator`、`documentEffectService`、`windowSessionBridge` 等模块分离状态、命令、并发控制与副作用。渲染层只消费 `document.snapshot.changed` 与一次性 `window.effect.*`，不再自行拼装保存态、外部修改态或标题态；资源打开、资源删除、recent 列表、`save-copy` 副本语义统一从当前 active session 上下文读取。

**Tech Stack:** Electron 39、Vue 3、Pinia、Vitest、Node `node:test`、ESLint（`@antfu/eslint-config`）、fs-extra、Electron IPC

---

## 执行约束

- 设计依据固定为 [2026-03-14-document-session-save-refactor-design.md](C:/wj/code/wj-markdown-editor/docs/superpowers/specs/2026-03-14-document-session-save-refactor-design.md)；实现与评审均不得偏离其中写死的命令语义、`save-copy` 规则、watch `bindingToken` 规则和 recent/resource 兼容要求。
- 除非命令中另有说明，所有命令默认从仓库根目录 `C:\wj\code\wj-markdown-editor` 执行。
- 全部新增与修改文件必须使用 UTF-8（无 BOM）编码，新增代码必须补充详细中文注释，注释需要解释状态边界、竞态裁决与兼容原因。
- 每个非只读任务都必须严格遵守同一质量门禁：先写失败测试、运行失败测试、写最小实现、运行通过测试、按包执行 ESLint、做必要手动验证、发起 `@requesting-code-review`、修复问题、再次验证、最后再提交。
- 任何任务在 reviewer 仍有 blocker 时不得进入下一任务；如果 reviewer 意见与设计文档冲突，必须先回到设计文档核对再决定是否调整实现。
- 合适时必须使用 subagent 承担互不冲突的实现或审阅任务，但不得仅因执行时间长就中断仍在正常运行的 subagent。
- 直到最终总结报告生成前，不得宣称“零问题”；只能在全量自动化验证、关键手动矩阵验证和最终代码评审全部完成后，给出交付结论。

## 文件结构

- Create: `wj-markdown-editor-electron/src/util/document-session/documentSessionFactory.js`
  - 负责创建草稿会话、已绑定文件会话、recent-missing 会话的初始状态，并集中维护所有默认值。
- Create: `wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js`
  - 负责推导 `saved`、`dirty`、`closePrompt`、`externalPrompt`、`resourceContext`、`windowTitle` 等只读快照字段。
- Create: `wj-markdown-editor-electron/src/util/document-session/documentSessionStore.js`
  - 负责 session 增删改查、window 与 active session 绑定、按路径查重、会话替换与销毁。
- Create: `wj-markdown-editor-electron/src/util/document-session/documentCommandService.js`
  - 负责统一接收用户命令、系统命令、副作用结果命令，并驱动状态收敛。
- Create: `wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js`
  - 负责单文档单写盘管线、首次保存、自动保存、关闭前保存、`save-copy` 副本语义。
- Create: `wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js`
  - 负责 watcher 绑定 token、event floor、内部保存回声抑制、缺失/恢复、迟到事件丢弃。
- Create: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
  - 负责执行真实副作用，如读写文件、show dialog、recent 持久化、watcher 绑定、消息效果。
- Create: `wj-markdown-editor-electron/src/util/document-session/windowSessionBridge.js`
  - 负责把 active session 投影为 `document.snapshot.changed` 与 `window.effect.*`。
- Create: `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
  - 负责资源打开、资源删除、资源信息查询、comparable key 查询，统一读取 active session 上下文。
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionFactory.test.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSnapshotUtil.test.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionStore.test.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/saveCoordinator.test.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandService.test.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/watchCoordinator.test.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`
- Create: `wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js`
  - 负责在 renderer 侧规范化主进程快照、兼容旧 store 字段名并生成 UI 只读派生值。
- Create: `wj-markdown-editor-web/src/util/document-session/documentSessionEventUtil.js`
  - 负责订阅 `document.snapshot.changed` 与 `window.effect.*`，并以统一事件分发给 store / view。
- Create: `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js`
- Create: `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionEventUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.js`
  - 从“状态真相 + 副作用混合体”收敛成 active session 的薄封装。
- Modify: `wj-markdown-editor-electron/src/util/fileWatchUtil.js`
  - 标准化低层 watcher registry 与事件包装，支撑 `bindingToken` 与 event floor。
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
  - 注册新的命令/查询 IPC 契约，并把旧入口代理到 `documentCommandService`。
- Modify: `wj-markdown-editor-electron/src/main.js`
  - 主进程启动时初始化会话服务、window bridge、recent 启动恢复入口。
- Modify: `wj-markdown-editor-electron/src/util/resourceFileUtil.js`
  - 保留底层资源解析能力，但去掉对旧 `winInfo` 的依赖，供 `documentResourceService` 复用。
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/fileWatchUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/resourceFileUtil.test.js`
- Modify: `wj-markdown-editor-web/src/stores/counter.js`
- Modify: `wj-markdown-editor-web/src/util/channel/eventUtil.js`
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`
- Modify: `wj-markdown-editor-web/src/components/ExternalFileChangeModal.vue`
- Modify: `wj-markdown-editor-web/src/util/commonUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/previewAssetRemovalUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewAssetRemovalUtil.test.js`
- Create: `docs/superpowers/reports/2026-03-14-document-session-save-refactor-summary.md`
  - 最终总结报告，汇总实际交付、验证证据、代码评审结果和残余风险。

## Chunk 1: 文档会话化保存与监听重构

### Task 1: 建立主进程会话状态护栏

**Files:**
- Create: `wj-markdown-editor-electron/src/util/document-session/documentSessionFactory.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/documentSessionStore.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionFactory.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSnapshotUtil.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionStore.test.js`

- [ ] **Step 1: 先写失败测试，锁定 session 初始值与派生规则**

测试必须至少覆盖以下场景：
- `createDraftSession` 生成 `diskSnapshot.content = ''`、`diskSnapshot.exists = false`、`saved = true`。
- `createRecentMissingSession({ sessionId, missingPath, now })` 在命令层已经判定为 startup recent-missing 后，生成 `isRecentMissing = true`、`displayPath = missingPath`、`fileName = 'Unnamed'`。
- `deriveDocumentSnapshot` 在 `editorSnapshot.content !== diskSnapshot.content` 时返回 `dirty = true`。
- `documentSessionStore` 能按 `windowId` 绑定 active session，并拒绝把同一个 `sessionId` 重复注册两次。

- [ ] **Step 2: 运行失败测试，确认护栏尚未实现**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentSessionFactory.test.js src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionStore.test.js`

Expected:
- 因模块尚不存在或导出缺失而失败。
- 失败信息必须明确指出缺少文件、缺少导出或断言不满足，不能出现测试文件语法错误。

- [ ] **Step 3: 写最小实现，补齐状态模型与 store**

实现必须包含以下明确接口：
- `createDraftSession({ sessionId, now })`
- `createBoundFileSession({ sessionId, path, content, stat, now })`
- `createRecentMissingSession({ sessionId, missingPath, now })`
- `deriveDocumentSnapshot(session)`
- `createDocumentSessionStore()`

实现要求：
- `documentSessionFactory.js` 只负责生成标准化 session 对象与默认 runtime 字段，不触碰 Electron API。
- `createRecentMissingSession` 只负责构造 recent-missing 会话数据，不负责判断 `trigger`；“只有 startup 才允许创建 recent-missing 会话”的分流由后续命令层负责并在 Task 4 断言。
- `documentSnapshotUtil.js` 只负责纯推导，不持有可变状态。
- `documentSessionStore.js` 提供 `createSession`、`replaceSession`、`destroySession`、`bindWindowToSession`、`getSessionByWindowId`、`findSessionByComparablePath` 等接口，并为路径比较预留 Windows 大小写不敏感逻辑。
- 所有导出函数都要用详细中文注释写清楚“为什么这样初始化”，尤其是 `recent-missing`、`persistedSnapshot` 与 `watchRuntime` 的默认值。

- [ ] **Step 4: 运行通过测试，确认纯状态层已经稳定**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentSessionFactory.test.js src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionStore.test.js`

Expected:
- 全部 PASS。
- 失败时先修测试或实现，不允许跳过断言。

- [ ] **Step 5: 补一轮现有主进程回归测试，确认新模块未破坏旧行为**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/win/winInfoUtil.test.js`

Expected:
- PASS。
- 如果现有测试因为新模块引入的 import side effect 失败，先消除副作用，再继续后续任务。

- [ ] **Step 6: 对新增文件执行 ESLint 格式化**

Run: `cd wj-markdown-editor-electron && npx eslint --fix src/util/document-session/documentSessionFactory.js src/util/document-session/documentSnapshotUtil.js src/util/document-session/documentSessionStore.js src/util/document-session/__tests__/documentSessionFactory.test.js src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionStore.test.js`

Expected:
- 命令成功退出，无新的 lint error。

- [ ] **Step 7: 做最小手动验证，确认应用仍能正常起草稿**

Run:
- `cd wj-markdown-editor-web && npm run build`
- `cd wj-markdown-editor-electron && npm run static`

Manual checks:
- 应用能正常启动到编辑器页。
- 新建草稿时标题和保存状态没有明显异常。
- 不进行任何编辑直接关闭，不应出现错误弹窗。

- [ ] **Step 8: 发起代码评审并清零 blocker**

Run: `@requesting-code-review`

Review scope:
- 仅审 Task 1 的 diff。
- 重点关注 state 默认值、路径比较、`recent-missing` 是否与设计文档一致。

- [ ] **Step 9: 按评审意见修复后重新验证**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentSessionFactory.test.js src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionStore.test.js src/util/win/winInfoUtil.test.js`
- `cd wj-markdown-editor-electron && npx eslint --fix src/util/document-session/documentSessionFactory.js src/util/document-session/documentSnapshotUtil.js src/util/document-session/documentSessionStore.js src/util/document-session/__tests__/documentSessionFactory.test.js src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionStore.test.js`

Expected:
- 相关测试重新 PASS。
- review blocker 全部关闭。

- [ ] **Step 10: 提交 Task 1**

Run:
- `git add wj-markdown-editor-electron/src/util/document-session/documentSessionFactory.js wj-markdown-editor-electron/src/util/document-session/documentSnapshotUtil.js wj-markdown-editor-electron/src/util/document-session/documentSessionStore.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionFactory.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentSnapshotUtil.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionStore.test.js`
- `git commit -m "feat: add document session state primitives"`

### Task 2: 落地命令层与保存协调器

**Files:**
- Create: `wj-markdown-editor-electron/src/util/document-session/documentCommandService.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandService.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/saveCoordinator.test.js`
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js`

- [ ] **Step 1: 先写失败测试，锁定命令入口与保存竞态**

测试必须至少覆盖以下场景：
- 手动保存时，同一 session 同时只能存在一个 in-flight save job。
- `window.blur` 触发自动保存时，必须走与手动保存同一条 `saveCoordinator` 管线，只是 `trigger = 'blur-auto-save'` 且不发送成功提示。
- 保存进行中继续编辑，`save.succeeded` 只能更新 `persistedSnapshot`，不能把新增编辑误标记为已保存。
- 未命名草稿首次保存必须先等待 `dialog.save-target-selected`，取消后会话保持草稿态。
- `document.save-copy` 命中 same-path 时必须回流 `copy-save.failed(reason = 'same-path')`，不能退化为普通保存。
- `copy-save.succeeded` / `copy-save.failed` 必须以标准副作用结果命令回流命令层，而不是旁路返回给 renderer。
- `dialog.copy-target-cancelled` 发生后不得改动当前 active session、当前保存态或 watcher 绑定。
- 关闭请求命中 `autoSave=close` 且已有有效路径时，必须走同一保存管线而不是旁路写盘。
- `document.cancel-close` 会清空 `closeRuntime` 并回到继续编辑态。
- `document.confirm-force-close` 会把 `forceClose = true` 并允许窗口立即关闭。
- 关闭请求发生时如果已有 in-flight save，必须按 `closeRuntime.waitingSaveJobId` 决策矩阵等待已有 job 或补写最新 revision，而不是直接关闭或重复起并发保存。
- `dialog.save-target-cancelled` 发生在关闭链路的首次保存分支时，必须取消关闭并保持窗口打开。

- [ ] **Step 2: 运行失败测试，确认新命令语义尚未被旧逻辑满足**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/saveCoordinator.test.js src/util/win/winInfoUtil.test.js`

Expected:
- 新增测试 FAIL。
- 失败原因集中在缺失的命令服务、缺失的保存协调器或旧 `winInfo` 行为不再满足新语义。

- [ ] **Step 3: 写最小实现，把所有保存入口收口到统一管线**

实现要求：
- `documentCommandService.js` 统一处理 `document.edit`、`document.save`、`document.save-copy`、`window.blur`、`document.request-close`、`document.cancel-close`、`document.confirm-force-close`、`dialog.save-target-selected`、`dialog.save-target-cancelled`、`dialog.copy-target-selected`、`dialog.copy-target-cancelled`、`save.started`、`save.succeeded`、`save.failed`、`copy-save.succeeded`、`copy-save.failed` 等命令。
- `saveCoordinator.js` 固化 `jobId`、`revision`、`content`、`path`、`trigger` 的冻结快照，保证单 session 单写盘。
- `saveCoordinator.js` 必须把 `window.blur` 自动保存建模为标准触发源，与手动保存、关闭前保存共用冻结快照、并发裁决和失败处理逻辑。
- `saveCoordinator.js` 必须显式实现关闭相关决策矩阵：已有保存任务时通过 `closeRuntime.waitingSaveJobId` 挂靠当前 job，并在必要时继续补写最新 revision；取消首次保存或保存失败时回到未保存确认态。
- `winInfoUtil.js` 退化为 active window 的兼容 facade，只保留窗口引用、配置读取和对新命令层的委托，不再直接管理保存态真相。
- `save-copy` 实现严格保持“保存副本、不切换当前文档、不重绑 watcher、不修改当前保存态”的语义。
- 如果 `documentCommandService.js` 或 `saveCoordinator.js` 在实现中明显膨胀，允许按关闭链路 / 保存链路拆分内部 handler 文件，但不能改动本计划列出的外部接口与测试护栏。

- [ ] **Step 4: 运行通过测试，确认保存协调器能挡住核心竞态**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/saveCoordinator.test.js src/util/win/winInfoUtil.test.js`

Expected:
- 全部 PASS。
- 特别检查 same-path `save-copy`、首次保存取消、保存中继续编辑三个断言。

- [ ] **Step 5: 扩大主进程回归范围，确保旧保存行为没有回退**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/channel/ipcMainUtil.test.js src/util/commonUtil.test.js`

Expected:
- PASS。
- 如果 IPC 现有测试暴露保存入口兼容问题，优先修主进程兼容层，不要让 renderer 被迫先改。

- [ ] **Step 6: 对本任务改动文件执行 ESLint**

Run: `cd wj-markdown-editor-electron && npx eslint --fix src/util/document-session/documentCommandService.js src/util/document-session/saveCoordinator.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/saveCoordinator.test.js src/util/win/winInfoUtil.js src/util/win/winInfoUtil.test.js`

Expected:
- 命令成功退出。

- [ ] **Step 7: 做手动验证，确认手动保存、首次保存、保存副本、关闭自动保存都可用**

Run:
- `cd wj-markdown-editor-web && npm run build`
- `cd wj-markdown-editor-electron && npm run static`

Manual checks:
- 打开现有 Markdown，编辑后执行手动保存，标题中的未保存标记消失。
- 编辑后切换到其他应用触发窗口失焦，若已开启失焦自动保存，应通过同一保存链路落盘且不弹成功提示。
- 新建草稿后执行保存，选择路径成功写盘；再次打开同一路径内容一致。
- 对已保存文档执行“另存为/保存副本”，副本文件生成，但当前窗口标题和当前文档路径不变。
- 开启 `autoSave=close` 后编辑文档直接关闭窗口，应自动保存并退出；若关闭前取消路径选择，窗口应保持打开。

- [ ] **Step 8: 发起代码评审并修复所有 blocker**

Run: `@requesting-code-review`

Review scope:
- 仅审 Task 2 的 diff。
- 重点检查保存快照冻结、`window.blur` 自动保存是否复用统一管线、`closeRuntime` 收敛、`copy-save` 结果命令语义、`winInfo` 是否仍残留状态真相。

- [ ] **Step 9: 按评审意见修复并再次验证**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/saveCoordinator.test.js src/util/win/winInfoUtil.test.js src/util/channel/ipcMainUtil.test.js src/util/commonUtil.test.js`
- `cd wj-markdown-editor-electron && npx eslint --fix src/util/document-session/documentCommandService.js src/util/document-session/saveCoordinator.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/saveCoordinator.test.js src/util/win/winInfoUtil.js src/util/win/winInfoUtil.test.js`

Expected:
- review blocker 全部关闭。
- 相关测试再次 PASS。

- [ ] **Step 10: 提交 Task 2**

Run:
- `git add wj-markdown-editor-electron/src/util/document-session/documentCommandService.js wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandService.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/saveCoordinator.test.js wj-markdown-editor-electron/src/util/win/winInfoUtil.js wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js`
- `git commit -m "feat: centralize document save commands"`

### Task 3: 落地监听协调器与低层 watcher 标准化

**Files:**
- Create: `wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/watchCoordinator.test.js`
- Modify: `wj-markdown-editor-electron/src/util/fileWatchUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/fileWatchUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentCommandService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandService.test.js`

- [ ] **Step 1: 先写失败测试，锁定 watcher token、event floor 与缺失/恢复规则**

测试必须至少覆盖以下场景：
- `watch.bound` 只能在 `bindingToken` 仍等于当前 token 时落状态。
- 旧 token 的 `watch.file-changed`、`watch.file-missing`、`watch.file-restored`、`watch.error` 必须被丢弃。
- 同 token 下，`observedAt <= eventFloorObservedAt` 的迟到事件必须丢弃。
- `watch.file-missing` 会把 `diskSnapshot` 重置为空基线，并保持用户当前编辑内容不被清空。
- `watch.file-restored` 后首次成功读盘会把 `resolutionState` 收敛为 `restored`，随后回落到 `idle`。
- 外部修改待处理期间继续编辑，不得把 `pendingExternalChange` 清掉。
- 当外部修改策略配置为 `apply` 时，检测到真实外部差异后必须自动应用磁盘内容、写入 `lastResolutionResult = 'applied'`，且不创建 `pendingExternalChange`。
- `document.external.apply` 必须把当前 pending 外部版本应用到编辑内容，同时正确写入 `lastResolutionResult = 'applied'` 与 `lastHandledVersionHash`。
- `document.external.ignore` 必须保留本地编辑内容，同时正确写入 `lastResolutionResult = 'ignored'` 与 `lastHandledVersionHash`，并抑制同版本重复弹窗。
- 差异自然消失或保存后把差异消解时，必须把 `lastResolutionResult` 收敛为 `noop` 并更新 `lastHandledVersionHash`。
- `watch.error` 触发后必须进入 `rebinding`，立即生成新的 `bindingToken` 并只允许一个自动重绑尝试在途。
- 自动重绑成功时只能接受新 token 的 `watch.bound`；自动重绑失败时必须进入 `degraded` 并产出一次性 warning effect intent，供 Task 4 的窗口桥转换成真正的 `window.effect.message`。

- [ ] **Step 2: 运行失败测试，确认旧 watcher 模型不能通过新规则**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/fileWatchUtil.test.js`

Expected:
- 新测试 FAIL。
- 失败原因应集中在 token 裁决、event floor 或缺失/恢复语义不满足。

- [ ] **Step 3: 写最小实现，建立 `watchCoordinator` 与低层 watcher 包装**

实现要求：
- `watchCoordinator.js` 只负责状态机与事件裁决，不直接读写窗口 UI。
- `fileWatchUtil.js` 保留底层 fs watcher registry，但新增携带 `bindingToken`、`observedAt`、目录级共享 watcher 的标准化回调包装。
- `documentCommandService.js` 接入 `watch.file-changed`、`watch.file-missing`、`watch.file-restored`、`watch.error`、`watch.bound`、`watch.unbound`、`watch.rebind-failed`、`document.external.apply`、`document.external.ignore` 命令。
- 对内部保存回声抑制继续复用已有内容 hash 逻辑，但抑制命中后只能返回“忽略事件”，不能直接改写 session 真相。
- `watch.error` 的最小处理策略必须完整实现：先把 `watchRuntime.status` 置为 `rebinding`，再立即生成新的 `bindingToken` 发起单次自动重绑；若新 token 下 `watch.bound` 成功则回到 `active`，若收到 `watch.rebind-failed` 则进入 `degraded` 并保留 `lastError`，同时返回 warning effect intent；旧 token 下的任何 watcher 回调一律视为迟到事件丢弃。
- 外部修改状态机必须完整维护 `resolutionState`、`lastResolutionResult`、`lastHandledVersionHash`，确保自动 `apply`、手动 `apply`、`ignore`、`noop`、`superseded`、`missing` 的去重和审计字段与 spec 一致。

- [ ] **Step 4: 运行通过测试，确认监听竞态已被收敛**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/fileWatchUtil.test.js`

Expected:
- 全部 PASS。
- 特别检查“旧 token 迟到事件不污染新路径”和“缺失后恢复仍可继续保存”。

- [ ] **Step 5: 扩大回归测试，确认旧 watcher 工具与窗口逻辑未退化**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/win/winInfoUtil.test.js src/util/channel/ipcMainUtil.test.js`

Expected:
- PASS。
- 如果失败来自旧入口仍依赖 watcher 内部状态，优先补兼容桥，而不是让测试降级。

- [ ] **Step 6: 对本任务改动文件执行 ESLint**

Run: `cd wj-markdown-editor-electron && npx eslint --fix src/util/document-session/watchCoordinator.js src/util/document-session/documentCommandService.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/fileWatchUtil.js src/util/fileWatchUtil.test.js`

Expected:
- 命令成功退出。

- [ ] **Step 7: 做手动验证，确认外部修改、忽略、文件缺失、恢复都正常**

Run:
- `cd wj-markdown-editor-web && npm run build`
- `cd wj-markdown-editor-electron && npm run static`

Manual checks:
- 打开一个已保存文件，在系统外部修改内容，应用内应出现外部修改提示。
- 把外部修改策略切到 `apply` 后，再次修改同一文件，应自动应用磁盘内容且不弹确认框。
- 选择“应用”后，编辑区内容应切换到外部版本，且同一外部版本不会再次弹窗。
- 先选择“忽略”，再次改动同一外部版本时不应重复弹窗；改成新外部版本时应重新弹窗。
- 在系统外部删除当前文件，应用内应进入缺失态，但编辑区已有内容不应被强制清空。
- 把文件恢复后，应用应重新识别为可绑定状态，并能继续保存。

- [ ] **Step 8: 发起代码评审并修复 blocker**

Run: `@requesting-code-review`

Review scope:
- 仅审 Task 3 的 diff。
- 重点关注 `bindingToken` 生命周期、event floor、内部保存回声抑制、`document.external.apply` / `document.external.ignore` 去重字段，以及缺失/恢复的状态收敛。

- [ ] **Step 9: 按评审意见修复并再次验证**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/fileWatchUtil.test.js src/util/win/winInfoUtil.test.js src/util/channel/ipcMainUtil.test.js`
- `cd wj-markdown-editor-electron && npx eslint --fix src/util/document-session/watchCoordinator.js src/util/document-session/documentCommandService.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/fileWatchUtil.js src/util/fileWatchUtil.test.js`

Expected:
- 相关测试重新 PASS。
- review blocker 全部清零。

- [ ] **Step 10: 提交 Task 3**

Run:
- `git add wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js wj-markdown-editor-electron/src/util/document-session/documentCommandService.js wj-markdown-editor-electron/src/util/document-session/__tests__/watchCoordinator.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandService.test.js wj-markdown-editor-electron/src/util/fileWatchUtil.js wj-markdown-editor-electron/src/util/fileWatchUtil.test.js`
- `git commit -m "feat: add watcher coordination for document sessions"`

### Task 4: 落地副作用层、窗口桥与 IPC 契约

**Files:**
- Create: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/windowSessionBridge.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/main.js`
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.js`

- [ ] **Step 1: 先写失败测试，锁定 IPC 与窗口投影契约**

测试必须至少覆盖以下场景：
- `document.get-session-snapshot` 与 `document.snapshot.changed` 返回同结构。
- `windowSessionBridge` 在命令收敛后先推送快照，再推送一次性 `window.effect.message`。
- recent 列表变更时，`window.effect.recent-list-changed` 必须直接携带完整列表。
- `document.open-recent({ trigger: 'user' })` 命中缺失文件时不能改动当前 active session，并且必须返回 `{ ok: false, reason: 'recent-missing', path }`。
- `document.open-recent({ trigger: 'startup' })` 命中缺失文件时会创建 recent-missing 会话。
- `document.request-open-dialog` 必须通过 `dialog.open-target-selected` / `dialog.open-target-cancelled` 回流，而不是直接在 IPC handler 里旁路打开文件。

- [ ] **Step 2: 运行失败测试，确认旧 IPC 拼装模型无法通过**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/windowSessionBridge.test.js src/util/channel/ipcMainUtil.test.js`

Expected:
- FAIL。
- 失败原因集中在缺失的新 IPC、推送顺序不符或 recent 缺失策略不符。

- [ ] **Step 3: 写最小实现，收敛 effect 与对外推送出口**

实现要求：
- `documentEffectService.js` 统一负责文件读写、对话框、recent 持久化、watcher 绑定与失败消息标准化。
- `windowSessionBridge.js` 是唯一允许向 renderer 发送 `document.snapshot.changed` 与 `window.effect.*` 的模块。
- `ipcMainUtil.js` 把旧 `save`、`save-other`、`open-file`、`recent.remove`、`recent.clear` 等入口映射到新命令模型，并暴露 `document.get-session-snapshot`、`recent.get-list`、`resource.get-info`、`resource.get-comparable-key`。
- `main.js` 在应用启动时初始化 session store、command service、effect service、window bridge，并处理 startup recent 恢复入口。
- 如果 `documentEffectService.js` 体积开始失控，允许按 recent / dialog / file I/O / watcher effect 拆内部 helper，但外部调用面仍保持当前任务定义。
- `ipcMainUtil.js` 与 `documentEffectService.js` 必须把 `document.request-open-dialog`、`dialog.open-target-selected`、`dialog.open-target-cancelled` 作为标准命令流实现，避免打开文件再次回到旧的旁路逻辑。

- [ ] **Step 4: 运行通过测试，确认新 IPC 契约已稳定**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/windowSessionBridge.test.js src/util/channel/ipcMainUtil.test.js`

Expected:
- 全部 PASS。
- `document.snapshot.changed` 结构、recent 启动/用户触发分流、消息 effect 顺序必须被断言覆盖。

- [ ] **Step 5: 跑一轮主进程综合回归**

Run: `cd wj-markdown-editor-electron && npx vitest run src/util/win/winInfoUtil.test.js src/util/fileWatchUtil.test.js src/util/commonUtil.test.js`

Expected:
- PASS。
- 不允许为了迁移 IPC 契约而删掉旧测试中的关键行为断言。

- [ ] **Step 6: 对本任务改动文件执行 ESLint**

Run: `cd wj-markdown-editor-electron && npx eslint --fix src/util/document-session/documentEffectService.js src/util/document-session/windowSessionBridge.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/windowSessionBridge.test.js src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js src/main.js src/util/win/winInfoUtil.js`

Expected:
- 命令成功退出。

- [ ] **Step 7: 做手动验证，确认 recent、标题、消息提示与快照推送兼容**

Run:
- `cd wj-markdown-editor-web && npm run build`
- `cd wj-markdown-editor-electron && npm run static`

Manual checks:
- 启动应用后最近文件列表能正常显示。
- 点击一个不存在的 recent 文件时，当前正在编辑的文档不能被替换；用户仍可手动移除该 recent 记录。
- 使用应用启动自动恢复 recent 时，若文件缺失，应进入 recent-missing 形态。
- 标题栏、保存态提示、普通成功/失败消息仍能显示。

- [ ] **Step 8: 发起代码评审并修复 blocker**

Run: `@requesting-code-review`

Review scope:
- 仅审 Task 4 的 diff。
- 重点关注 IPC 契约兼容性、窗口桥是否成为唯一推送出口、recent 广播是否只在列表变化时发送。

- [ ] **Step 9: 按评审意见修复并再次验证**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/windowSessionBridge.test.js src/util/channel/ipcMainUtil.test.js src/util/win/winInfoUtil.test.js src/util/fileWatchUtil.test.js`
- `cd wj-markdown-editor-electron && npx eslint --fix src/util/document-session/documentEffectService.js src/util/document-session/windowSessionBridge.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/windowSessionBridge.test.js src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js src/main.js src/util/win/winInfoUtil.js`

Expected:
- review blocker 已清零。
- 相关测试再次 PASS。

- [ ] **Step 10: 提交 Task 4**

Run:
- `git add wj-markdown-editor-electron/src/util/document-session/documentEffectService.js wj-markdown-editor-electron/src/util/document-session/windowSessionBridge.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js wj-markdown-editor-electron/src/main.js wj-markdown-editor-electron/src/util/win/winInfoUtil.js`
- `git commit -m "feat: bridge document sessions to ipc and windows"`

### Task 5: 迁移渲染层到 snapshot / effect 模型

**Files:**
- Create: `wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js`
- Create: `wj-markdown-editor-web/src/util/document-session/documentSessionEventUtil.js`
- Create: `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js`
- Create: `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionEventUtil.test.js`
- Modify: `wj-markdown-editor-web/src/stores/counter.js`
- Modify: `wj-markdown-editor-web/src/util/channel/eventUtil.js`
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`
- Modify: `wj-markdown-editor-web/src/components/ExternalFileChangeModal.vue`
- Modify: `wj-markdown-editor-web/src/util/commonUtil.js`

- [ ] **Step 1: 先写失败测试，锁定 renderer 对新快照的消费方式**

测试必须至少覆盖以下场景：
- `documentSessionSnapshotUtil` 能把主进程快照映射成当前 store 所需的 `saved`、`displayPath`、`externalPromptVisible`、`closePromptVisible`。
- `documentSessionEventUtil` 只订阅 `document.snapshot.changed`、`window.effect.message`、`window.effect.recent-list-changed`，不再依赖旧的局部保存态事件。
- 缺失文件 recent-missing 快照会在 renderer 保持 `fileName = 'Unnamed'` 且展示缺失路径。
- `window.effect.recent-list-changed` 到达后，store 直接替换 recent 列表，不再再次查询。
- 外部修改弹窗点击“应用”/“忽略”后，renderer 必须分别发送 `document.external.apply` / `document.external.ignore`，并在快照收敛后移除待处理弹窗。

- [ ] **Step 2: 运行失败测试，确认旧 renderer 事件拼装无法通过**

Run: `cd wj-markdown-editor-web && node --test src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js`

Expected:
- FAIL。
- 失败原因来自缺失的新 util 或旧事件订阅仍然耦合旧 IPC。

- [ ] **Step 3: 写最小实现，把 renderer 统一迁移到快照模型**

实现要求：
- `counter.js` 成为 active session 快照的唯一 store 真相。
- `eventUtil.js` 只负责把用户操作发成命令，不再本地拼装保存态或外部修改态。
- `EditorView.vue`、`PreviewView.vue`、`LayoutMenu.vue`、`ExternalFileChangeModal.vue` 都改为消费快照字段与一次性 effect。
- 外部修改弹窗的“应用”和“忽略”按钮必须显式发送 `document.external.apply` / `document.external.ignore`，并以快照中的 `lastResolutionResult`、`externalPrompt` 收敛结果作为 UI 刷新依据。
- `commonUtil.js` 保留兼容辅助函数，但不得再偷偷依赖旧 `winInfo` 风格字段。

- [ ] **Step 4: 运行通过测试，确认 renderer 已切换到单一快照流**

Run: `cd wj-markdown-editor-web && node --test src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js`

Expected:
- PASS。
- 测试需明确证明 renderer 不再监听旧的保存态/外部修改局部事件。

- [ ] **Step 5: 扩大 web 回归范围，确保编辑器与预览链路不回退**

Run: `cd wj-markdown-editor-web && node --test src/util/editor/__tests__/previewAssetDeleteDecisionUtil.test.js src/util/editor/__tests__/previewAssetRemovalUtil.test.js src/util/__tests__/searchTargetUtil.test.js`

Expected:
- PASS。
- 如果快照字段迁移影响资源删除或搜索桥接逻辑，先补兼容适配再继续。

- [ ] **Step 6: 对本任务改动文件执行 ESLint**

Run: `cd wj-markdown-editor-web && npx eslint --fix src/util/document-session/documentSessionSnapshotUtil.js src/util/document-session/documentSessionEventUtil.js src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js src/stores/counter.js src/util/channel/eventUtil.js src/views/EditorView.vue src/views/PreviewView.vue src/components/layout/LayoutMenu.vue src/components/ExternalFileChangeModal.vue src/util/commonUtil.js`

Expected:
- 命令成功退出。

- [ ] **Step 7: 做手动验证，确认编辑页、预览页、外部修改弹窗与 recent 列表正常**

Run:
- `cd wj-markdown-editor-web && npm run build`
- `cd wj-markdown-editor-electron && npm run static`

Manual checks:
- 编辑器输入后保存态立即从快照更新。
- 预览页切换、刷新与编辑页内容同步不退化。
- 外部修改弹窗的文案、按钮行为与现有业务一致，点击“应用”/“忽略”后 UI 会跟随最新快照正确收敛。
- recent 列表增删清空后 UI 立即刷新，无需重新进入页面。

- [ ] **Step 8: 发起代码评审并修复 blocker**

Run: `@requesting-code-review`

Review scope:
- 仅审 Task 5 的 diff。
- 重点关注 renderer 是否彻底切到单一快照真相、是否仍遗留旧事件拼装、外部修改弹窗是否与主进程快照对齐。

- [ ] **Step 9: 按评审意见修复并再次验证**

Run:
- `cd wj-markdown-editor-web && node --test src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js src/util/editor/__tests__/previewAssetDeleteDecisionUtil.test.js src/util/editor/__tests__/previewAssetRemovalUtil.test.js`
- `cd wj-markdown-editor-web && npx eslint --fix src/util/document-session/documentSessionSnapshotUtil.js src/util/document-session/documentSessionEventUtil.js src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js src/stores/counter.js src/util/channel/eventUtil.js src/views/EditorView.vue src/views/PreviewView.vue src/components/layout/LayoutMenu.vue src/components/ExternalFileChangeModal.vue src/util/commonUtil.js`

Expected:
- review blocker 清零。
- 相关 web 测试再次 PASS。

- [ ] **Step 10: 提交 Task 5**

Run:
- `git add wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js wj-markdown-editor-web/src/util/document-session/documentSessionEventUtil.js wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionEventUtil.test.js wj-markdown-editor-web/src/stores/counter.js wj-markdown-editor-web/src/util/channel/eventUtil.js wj-markdown-editor-web/src/views/EditorView.vue wj-markdown-editor-web/src/views/PreviewView.vue wj-markdown-editor-web/src/components/layout/LayoutMenu.vue wj-markdown-editor-web/src/components/ExternalFileChangeModal.vue wj-markdown-editor-web/src/util/commonUtil.js`
- `git commit -m "feat: migrate renderer to document session snapshots"`

### Task 6: 收口 recent、资源上下文与保存副本兼容语义

**Files:**
- Create: `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`
- Modify: `wj-markdown-editor-electron/src/util/resourceFileUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/resourceFileUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-web/src/util/editor/previewAssetRemovalUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewAssetRemovalUtil.test.js`
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`

- [ ] **Step 1: 先写失败测试，锁定 recent、资源能力与 `save-copy` 兼容线**

测试必须至少覆盖以下场景：
- `document.resource.open-in-folder` 能从 active session 解析相对资源，并在未保存文档中对相对资源返回 `relative-resource-without-document`。
- 当 `resourceUrl` 解析出的目标不存在，但 `rawPath` 去掉 query / hash 后能解析到真实本地文件时，`document.resource.open-in-folder` 仍必须返回成功打开。
- `document.resource.delete-local` 删除成功时返回 `reason = 'deleted'`，删除失败时返回 `reason = 'delete-failed'` 且 renderer 不清理 Markdown。
- `resource.get-comparable-key` 对不存在但可解析的本地路径仍返回稳定 key。
- `recent.remove`、`recent.clear` 必须幂等；recent 只有在列表实际变化时才广播 `window.effect.recent-list-changed`。
- `save-copy` 成功后当前 active session 的 `path`、`saved`、watch 绑定与标题都不变化。

- [ ] **Step 2: 运行失败测试，确认资源与 recent 兼容护栏尚未被实现**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentResourceService.test.js src/util/resourceFileUtil.test.js src/util/channel/ipcMainUtil.test.js`
- `cd wj-markdown-editor-web && node --test src/util/editor/__tests__/previewAssetRemovalUtil.test.js`

Expected:
- 至少一组新增测试 FAIL。
- 失败原因集中在 active session 上下文、recent 广播幂等或删除后 Markdown 清理判定不符。

- [ ] **Step 3: 写最小实现，把资源与 recent 都挂接到 active session**

实现要求：
- `documentResourceService.js` 统一读取 active session 的 `documentSource.path`、`editorSnapshot.content`、`saved`，对外提供 `openInFolder`、`deleteLocal`、`getInfo`、`getComparableKey`。
- `documentResourceService.openInFolder` 必须支持 `rawPath` query / hash 回退：当 `resourceUrl` 解析目标不存在时，若 `rawPath` 去掉 query / hash 后能解析到真实本地文件，则仍视为成功打开。
- `resourceFileUtil.js` 只保留纯路径解析与底层文件系统能力，不再依赖旧 `winInfo` 状态容器。
- `ipcMainUtil.js` 的资源相关查询与命令全部委托给 `documentResourceService`。
- `previewAssetRemovalUtil.js` 继续在 renderer 侧负责 Markdown 清理，但必须严格按结构化 `reason` 判断是否清理。
- `save-copy` 的主进程逻辑与 renderer 响应都要再次对齐“保存副本而不是切换文档”。

- [ ] **Step 4: 运行通过测试，确认资源能力和 recent 行为未回退**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentResourceService.test.js src/util/resourceFileUtil.test.js src/util/channel/ipcMainUtil.test.js`
- `cd wj-markdown-editor-web && node --test src/util/editor/__tests__/previewAssetRemovalUtil.test.js`

Expected:
- 全部 PASS。
- 资源打开、资源删除、recent 幂等、`save-copy` 会话不切换都必须有断言覆盖。

- [ ] **Step 5: 扩大回归测试，确认现有资源相关业务保持兼容**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/previewAssetContextMenuUtil.test.js src/util/previewAssetRemovalUtil.test.js`
- `cd wj-markdown-editor-web && node --test src/util/editor/__tests__/previewAssetDeleteDecisionUtil.test.js`

Expected:
- PASS。
- 如果失败来自资源上下文字段改名，优先在兼容层适配，不要下调测试断言。

- [ ] **Step 6: 按包对改动文件执行 ESLint**

Run:
- `cd wj-markdown-editor-electron && npx eslint --fix src/util/document-session/documentResourceService.js src/util/document-session/__tests__/documentResourceService.test.js src/util/resourceFileUtil.js src/util/resourceFileUtil.test.js src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js`
- `cd wj-markdown-editor-web && npx eslint --fix src/util/editor/previewAssetRemovalUtil.js src/util/editor/__tests__/previewAssetRemovalUtil.test.js src/views/EditorView.vue src/views/PreviewView.vue`

Expected:
- 两个包的 lint 都成功退出。

- [ ] **Step 7: 做手动验证，确认资源与 recent 相关业务零回退**

Run:
- `cd wj-markdown-editor-web && npm run build`
- `cd wj-markdown-editor-electron && npm run static`

Manual checks:
- 从编辑区与预览区分别执行“在资源管理器打开”，现有本地资源都能正常打开。
- 对预览区带 query / hash 的本地资源执行“在资源管理器打开”，若底层文件存在，仍应成功打开原始本地文件。
- 对未保存文档中的相对资源执行“在资源管理器打开”，应看到原有错误提示。
- 删除本地资源后，文件系统中的资源被删除，Markdown 被按原有规则清理；如果删除失败，Markdown 不应被清理。
- recent 列表执行移除、清空、重复移除、空列表清空，UI 和持久化都应稳定。
- 再次执行 `save-copy`，副本生成后当前文档仍是原始文档。

- [ ] **Step 8: 发起代码评审并修复 blocker**

Run: `@requesting-code-review`

Review scope:
- 仅审 Task 6 的 diff。
- 重点关注资源路径解析、资源删除后的 Markdown 清理边界、recent 幂等广播、`save-copy` 副本语义。

- [ ] **Step 9: 按评审意见修复并再次验证**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/documentResourceService.test.js src/util/resourceFileUtil.test.js src/util/channel/ipcMainUtil.test.js src/util/previewAssetContextMenuUtil.test.js src/util/previewAssetRemovalUtil.test.js`
- `cd wj-markdown-editor-web && node --test src/util/editor/__tests__/previewAssetRemovalUtil.test.js src/util/editor/__tests__/previewAssetDeleteDecisionUtil.test.js`
- `cd wj-markdown-editor-electron && npx eslint --fix src/util/document-session/documentResourceService.js src/util/document-session/__tests__/documentResourceService.test.js src/util/resourceFileUtil.js src/util/resourceFileUtil.test.js src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js`
- `cd wj-markdown-editor-web && npx eslint --fix src/util/editor/previewAssetRemovalUtil.js src/util/editor/__tests__/previewAssetRemovalUtil.test.js src/views/EditorView.vue src/views/PreviewView.vue`

Expected:
- review blocker 清零。
- 相关 electron / web 测试再次 PASS。

- [ ] **Step 10: 提交 Task 6**

Run:
- `git add wj-markdown-editor-electron/src/util/document-session/documentResourceService.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js wj-markdown-editor-electron/src/util/resourceFileUtil.js wj-markdown-editor-electron/src/util/resourceFileUtil.test.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js wj-markdown-editor-web/src/util/editor/previewAssetRemovalUtil.js wj-markdown-editor-web/src/util/editor/__tests__/previewAssetRemovalUtil.test.js wj-markdown-editor-web/src/views/EditorView.vue wj-markdown-editor-web/src/views/PreviewView.vue`
- `git commit -m "feat: preserve resource and recent workflows in document sessions"`

### Task 7: 全量回归、移除旧事件残留并输出总结报告

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.js`
- Modify: `wj-markdown-editor-web/src/util/channel/eventUtil.js`
- Modify: `wj-markdown-editor-web/src/stores/counter.js`
- Create: `docs/superpowers/reports/2026-03-14-document-session-save-refactor-summary.md`

- [ ] **Step 1: 先补失败测试或断言，清理旧事件残留**

补充或加强断言，至少证明以下事实：
- renderer 不再依赖旧保存态事件、旧外部修改事件、旧标题拼装事件。
- 主进程不再通过散落入口直接推送文档真相，所有文档状态都能经由 `windowSessionBridge` 投影。
- 关键遗留兼容入口若保留，只能作为新命令的薄代理。

- [ ] **Step 2: 运行定向测试，确认清理动作先把风险暴露出来**

Run:
- `cd wj-markdown-editor-electron && npx vitest run src/util/channel/ipcMainUtil.test.js src/util/win/winInfoUtil.test.js`
- `cd wj-markdown-editor-web && node --test src/util/document-session/__tests__/documentSessionEventUtil.test.js`

Expected:
- 如果仍有旧事件耦合，测试会 FAIL。
- 在没有暴露问题前，不要直接删代码。

- [ ] **Step 3: 写最小清理实现并生成最终总结报告**

实现要求：
- 删除已经被 `document.snapshot.changed` / `window.effect.*` 完全替代的旧事件监听与发送逻辑。
- 保留必要兼容代理时，必须在中文注释中写清楚“为什么保留、何时可删”。
- 新建 `docs/superpowers/reports/2026-03-14-document-session-save-refactor-summary.md`，至少包含：实际完成任务、架构变化概览、自动化验证结果、手动验证矩阵、代码评审记录汇总、残余风险与后续建议。

- [ ] **Step 4: 运行全量自动化验证**

Run:
- `cd wj-markdown-editor-electron && npm run test:run`
- `cd wj-markdown-editor-web && node --test src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js src/util/editor/__tests__/previewAssetDeleteDecisionUtil.test.js src/util/editor/__tests__/previewAssetRemovalUtil.test.js src/util/__tests__/searchTargetUtil.test.js src/util/__tests__/searchTargetBridgeUtil.test.js src/util/__tests__/searchBarController.test.js`

Expected:
- electron 全量测试 PASS。
- web 关键回归测试 PASS。

- [ ] **Step 5: 对所有最终改动文件按包执行 ESLint**

Run:
- `cd wj-markdown-editor-electron && npx eslint --fix src/main.js src/util/channel/ipcMainUtil.js src/util/win/winInfoUtil.js src/util/fileWatchUtil.js src/util/resourceFileUtil.js src/util/document-session/documentSessionFactory.js src/util/document-session/documentSnapshotUtil.js src/util/document-session/documentSessionStore.js src/util/document-session/documentCommandService.js src/util/document-session/saveCoordinator.js src/util/document-session/watchCoordinator.js src/util/document-session/documentEffectService.js src/util/document-session/windowSessionBridge.js src/util/document-session/documentResourceService.js src/util/document-session/__tests__/documentSessionFactory.test.js src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionStore.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/saveCoordinator.test.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/windowSessionBridge.test.js src/util/document-session/__tests__/documentResourceService.test.js src/util/channel/ipcMainUtil.test.js src/util/win/winInfoUtil.test.js src/util/fileWatchUtil.test.js src/util/resourceFileUtil.test.js`
- `cd wj-markdown-editor-web && npx eslint --fix src/stores/counter.js src/util/channel/eventUtil.js src/util/commonUtil.js src/util/document-session/documentSessionSnapshotUtil.js src/util/document-session/documentSessionEventUtil.js src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js src/views/EditorView.vue src/views/PreviewView.vue src/components/layout/LayoutMenu.vue src/components/ExternalFileChangeModal.vue src/util/editor/previewAssetRemovalUtil.js src/util/editor/__tests__/previewAssetRemovalUtil.test.js`

Expected:
- 两个包的 lint 都成功退出。

- [ ] **Step 6: 执行最终手动回归矩阵**

Run:
- `cd wj-markdown-editor-web && npm run build`
- `cd wj-markdown-editor-electron && npm run start`

Manual matrix:
- 手动保存。
- 窗口失焦自动保存。
- 关闭前自动保存。
- 草稿首次保存与取消保存。
- `save-copy` 保存副本且当前文档不切换。
- 外部修改应用 / 忽略。
- 文件缺失 / 恢复 / 缺失后继续保存。
- recent 打开 / 缺失提示 / 移除 / 清空。
- 编辑区和预览区的本地资源在资源管理器打开。
- 本地资源删除与删除后的 Markdown 清理。

- [ ] **Step 7: 发起最终代码评审并修复 blocker**

Run: `@requesting-code-review`

Review scope:
- 审最终整体 diff。
- 重点关注架构边界是否闭合、是否仍有旧逻辑旁路、是否存在功能回退风险、总结报告是否完整。

- [ ] **Step 8: 按评审意见修复并重新完成最终验证**

Run:
- `cd wj-markdown-editor-electron && npm run test:run`
- `cd wj-markdown-editor-web && node --test src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js src/util/editor/__tests__/previewAssetDeleteDecisionUtil.test.js src/util/editor/__tests__/previewAssetRemovalUtil.test.js`
- `cd wj-markdown-editor-web && npm run build`

Expected:
- review blocker 清零。
- 全量自动化验证仍 PASS。
- 最终构建成功。

- [ ] **Step 9: 提交最终收口与总结报告**

Run:
- `git add docs/superpowers/reports/2026-03-14-document-session-save-refactor-summary.md wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js wj-markdown-editor-electron/src/util/win/winInfoUtil.js wj-markdown-editor-web/src/util/channel/eventUtil.js wj-markdown-editor-web/src/stores/counter.js`
- `git commit -m "chore: finalize document session save refactor"`

## 完成定义

- 所有 Task 均已完成，且每个 Task 的 review blocker 已清零。
- `save-copy` 仍保持“保存副本”语义，没有任何路径切换或 watcher 重绑副作用。
- recent、资源打开、资源删除、Markdown 清理、外部修改、文件缺失/恢复全部通过自动化与手动回归。
- 总结报告已经写入 `docs/superpowers/reports/2026-03-14-document-session-save-refactor-summary.md`。

Plan complete and saved to `docs/superpowers/plans/2026-03-14-document-session-save-refactor.md`. Ready to execute?
