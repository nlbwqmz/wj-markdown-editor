# 打开决策流程修复设计

## 背景

当前 Markdown 打开流程存在三类问题：

1. `当前窗口打开` 分支依赖 renderer store 中的 `documentSessionSnapshot.dirty` 做保存判断，但编辑器正文上浮存在 160ms 防抖，导致最后一次输入尚未进入 session 真相时，可能误判为未修改。
2. “目标文件已在其他窗口打开”的真相只掌握在主进程，但 renderer 先弹了“保存 / 放弃 / 取消”对话框，提示顺序错误。
3. 旧的 `new-window` 分支仍保留“来源窗口是 pristine draft 时自动关闭来源窗口”的历史策略，和当前“用户显式选择打开方式”的产品语义不一致。

此外，当前“文件 -> 打开”与快捷键 `openFile` 仍走 `document.request-open-dialog -> dialog.open-target-selected -> openDocumentWindow` 旧链路，没有进入 renderer 的打开方式选择和当前窗口切换准备流程，这会让前两类问题在该入口继续保留。

本次设计目标是统一打开链路的裁决顺序，确保：

- 目标是否已被其他窗口占用，永远先于任何打开方式选择与保存选择。
- 只有真正进入“当前窗口切换”时，才处理最后一次输入同步与未保存内容选择。
- 打开动作不再隐式关闭来源窗口。

## 设计目标

### 1. 统一前置裁决

所有带 renderer 交互的打开动作都先走主进程统一预判：

- 目标是否就是当前窗口文档
- 目标是否已在其他窗口打开
- 目标路径是否合法、是否存在、是否允许打开

这里的“所有打开动作”必须显式包括：

- 最近文件
- 文件管理栏
- 菜单“打开”
- 快捷键 `openFile`
- `document.request-open-dialog` 选择完路径后的后续打开

此外，`startup`、`second-instance` 与启动期 recent 恢复不走 renderer 交互层，但主进程内部仍必须复用同一套目标预判 helper，保持“聚焦已有窗口优先”“recent-missing 语义不丢失”“路径校验结果一致”这三条规则不分叉。

只要命中“其他窗口已打开”，就直接聚焦已有窗口并结束流程，不再继续让 renderer 弹出“当前窗口 / 新窗口”或“保存 / 放弃 / 取消”。

### 2. 当前窗口切换前先稳定 renderer 文档真相

仅当用户明确选择 `当前窗口打开` 且目标未被其他窗口占用时，renderer 才执行“当前窗口切换前准备”：

1. 冲刷 `MarkdownEdit` 的挂起正文上浮任务。
2. 比较 `EditorView` 当前 `content` 与 `store.documentSessionSnapshot.content`。
3. 若不一致，则显式发送 `document.edit`，等待主进程 session 推进到最终正文对应的快照。

这样后续 `dirty` 判定、保存动作与切换动作都基于稳定快照，而不是基于可能过期的 store 状态。

对于 `/preview` 路由，由于不存在 `EditorView` 实例，当前窗口切换前准备需要允许宿主走降级路径：

- 直接读取稳定的 `documentSessionSnapshot`
- 不做编辑器级 flush
- 不补发 `document.edit`

也就是说，“当前窗口切换前准备”不是“只能由编辑页实例提供”，而是“由宿主提供统一接口，编辑页注册增强实现，预览页回退到稳定快照实现”。

### 3. 打开方式和保存方式分层

打开方式和保存方式不再混在同一次决策中：

- 第一层：目标预判
- 第二层：打开方式选择
- 第三层：当前窗口切换预判
- 第四层：执行切换

其中：

- `新窗口打开` 只负责创建新窗口，不关心当前文档是否 dirty。
- `当前窗口打开` 才可能触发“保存 / 放弃 / 取消”。

### 4. 来源窗口生命周期由用户显式控制

本次改造后，以下三类分支都不得隐式关闭来源窗口：

- 用户选择 `新窗口打开`
- 用户选择 `当前窗口打开` 但目标已在其他窗口打开
- 用户选择 `新窗口打开` 但目标已在其他窗口打开

也就是说，“打开目标文档”和“关闭来源窗口”是两件独立动作，本次不再由打开流程顺手代替用户做窗口回收。

## 目标工作流

### 阶段一：目标预判

renderer 在任何打开动作开始前，先调用新的主进程预判命令，例如：

- `document.resolve-open-target`

该命令的入参不能只靠 `path`，还必须保留来源语义，至少包含：

- `path`
- `entrySource`：例如 `recent`、`file-manager`、`menu-open`、`shortcut-open-file`、`open-dialog`、`startup`、`second-instance`
- `trigger`：例如 `user`、`startup`、`second-instance`

规则补充如下：

1. `recent` 入口命中缺失时，必须返回 `recent-missing`，不能退化成普通 `open-target-missing`。
2. 当前窗口若是 `recent-missing` 会话，即使缺失路径与目标路径文本相同，也不能命中 `noop-current-file`。
3. `startup` / `second-instance` 不进入 renderer 的 open-choice / save-choice，但必须复用同一主进程预判 helper。

对于“文件 -> 打开”与快捷键入口，链路需要改成：

1. `document.request-open-dialog` 只负责弹系统文件选择框
2. 选择完成后，把结构化结果返回给 renderer；命中选择时返回 `{ ok: true, reason: 'selected', path }`
3. renderer 再把该路径送入与最近文件/文件管理栏相同的统一打开决策流程

也就是说，`document.request-open-dialog` 在新设计中只负责“选路径”，不再在主进程里直接决定“当前窗口打开 / 新窗口打开 / 直接打开”

`document.request-open-dialog` 的返回结构在本次改造中必须固定为：

- `{ ok: true, reason: 'selected', path }`
- `{ ok: false, reason: 'cancelled', path: null }`
- `{ ok: false, reason: 'dialog-open-failed', path: null }`

`document.resolve-open-target` 负责返回结构化结果，并统一使用以下 envelope：

- 成功短路 / 继续交互：`{ ok: true, decision, path, ...extra }`
- 失败结束：`{ ok: false, reason, path, ...extra }`

其中正式结果至少包括：

- `noop-current-file`
- `focused-existing-window`
- `recent-missing`
- `open-target-invalid-extension`
- `open-target-missing`
- `open-target-read-failed`
- `open-target-not-file`
- `needs-open-mode-choice`

规则如下：

1. 命中 `noop-current-file` 时，流程直接结束。
2. 命中 `focused-existing-window` 时，主进程聚焦目标窗口，流程直接结束。
3. recent 入口命中目标缺失时，必须返回 `recent-missing`，保留现有 recent 专属提示与会话语义，不能退化成普通 `open-target-missing`。
4. 命中打开失败结果时，renderer 按现有消息提示并结束。
5. 只有命中 `needs-open-mode-choice` 时，renderer 才弹出“当前窗口 / 新窗口 / 取消”。

### 阶段二：打开方式选择

当且仅当目标预判要求用户选择打开方式时，renderer 才弹 open-choice：

- `当前窗口打开`
- `新窗口打开`
- `取消`

若用户选择：

- `取消`：结束
- `新窗口打开`：直接执行 `document.open-path`
- `当前窗口打开`：进入“当前窗口切换准备”

### 阶段三：当前窗口切换准备

renderer 在进入当前窗口切换前，先走共享准备能力。该能力由宿主统一暴露，菜单、文件树、菜单“打开”和快捷键都统一调用。

输出上下文至少包含：

- `currentPath`
- `dirty`
- `sessionId`
- `revision`
- `snapshot`

准备完成后，renderer 再调用新的当前窗口切换预判命令，例如：

- `document.prepare-open-path-in-current-window`

该命令不是只回答“是否需要保存选择”。它还必须在弹 `save-choice` 之前再做一次目标短路复验，避免阶段一之后目标被其他窗口占用，却仍然先弹保存框。

返回值必须固定为：

- `focused-existing-window`
- `ready-to-switch`
- `needs-save-choice`

并使用统一结构：

- `{ ok: true, decision: 'focused-existing-window', path, windowId, sourceSessionId, sourceRevision }`
- `{ ok: true, decision: 'ready-to-switch', path, sourceSessionId, sourceRevision }`
- `{ ok: true, decision: 'needs-save-choice', path, sourceSessionId, sourceRevision }`

同时保留与阶段一一致的失败 envelope：

- `{ ok: false, reason: 'recent-missing' | 'open-target-invalid-extension' | 'open-target-missing' | 'open-target-read-failed' | 'open-target-not-file', path, sourceSessionId, sourceRevision }`

### 阶段四：执行切换

只有用户走到 `needs-save-choice` 时，renderer 才弹保存选择框：

- `save-before-switch`
- `discard-switch`
- `cancel`

用户确认后，再调用真正执行切换的命令：

- `document.open-path-in-current-window`

其 payload 不再只传 `saveBeforeSwitch: boolean`，而是改成显式策略：

- `switchPolicy: 'direct-switch'`
- `switchPolicy: 'save-before-switch'`
- `switchPolicy: 'discard-switch'`

同时必须附带：

- `expectedSessionId`
- `expectedRevision`

用于防止用户看到旧弹窗后，当前会话已变化但仍沿用旧选择继续执行切换。

如果 execute 命中 `expectedSessionId` / `expectedRevision` 失配，必须返回结构化结果：

- `{ ok: false, reason: 'source-session-changed', path }`

renderer 命中 `source-session-changed` 时，必须中止本次打开流程，并提示“当前文档状态已变化，请重新执行打开操作”，不能把该结果静默吞掉。

execute 阶段也必须继续沿用统一 envelope。除切换成功外，至少需要保留这些既有失败结果：

- `focused-existing-window`
- `save-before-switch-cancelled`
- `save-before-switch-failed`
- `open-current-window-switch-failed`
- `source-session-changed`
- `open-target-invalid-extension`
- `open-target-missing`
- `open-target-read-failed`
- `open-target-not-file`

同时 execute 阶段必须保留两类复验，不能只依赖 preflight 的一次结果：

1. 再次校验目标路径是否合法、是否仍存在、是否仍可打开
2. 在真正保存或切换前，再次校验目标是否已被其他窗口打开

也就是说，preflight 用来决定“是否需要用户交互”，execute 仍必须承担最终一致性校验，避免多步弹窗带来的时间窗把 `focused-existing-window` 优先级回退掉。

## 模块职责划分

### Web 端

#### `EditorView.vue`

负责注册“编辑页增强版”的当前窗口切换前准备能力：

- 冲刷挂起正文同步
- 将最终正文推进到 session snapshot
- 返回稳定的当前文档上下文

#### `HomeView.vue`

负责承载两个共享 service：

- 当前窗口切换前准备 service
- 统一打开交互 service

让 `LayoutMenu`、`FileManagerPanel`、菜单“打开”和快捷键 `openFile` 都能在不直接引用编辑器实例的前提下走相同流程。

对于 `/preview` 路由，`HomeView` 还负责提供准备 service 的降级实现，保证没有 `EditorView` 时仍能返回稳定上下文。

同时，`HomeView` 持有统一打开交互的 request token / context identity。只要发生以下任一事件，就必须主动销毁当前 open-choice / save-choice 并使旧 promise 失效：

- 当前会话 identity 变化
- 页面失活、卸载或 keep-alive 切走
- 新一轮打开请求开始

#### `shortcutKeyUtil.js` / 菜单“打开”入口

不再在拿到 `requestDocumentOpenDialog()` 结果后直接完成打开，而是只负责触发“选路径”，随后把选中的路径交回统一打开交互 service。

#### `fileManagerOpenDecisionController.js`

只负责 renderer 侧决策编排：

- 调目标预判
- 需要时弹 open-choice
- 需要时调用当前窗口切换准备
- 需要时弹 save-choice
- 调最终 execute 命令

它不再直接相信调用方传入的 `isDirty` 是最终真相。

### Electron 端

#### 目标预判命令

在主进程中统一实现目标占用判断，确保：

- 其他窗口占用结果先于所有 renderer 交互暴露
- renderer 不需要自己推测窗口占用状态

#### 当前窗口切换预判命令

负责在 renderer 已完成切换前准备后，根据主进程 session 真相判断：

- 当前文档是否需要保存选择
- 是否允许直接进入 execute

#### 当前窗口切换执行命令

只负责：

- 根据 `switchPolicy` 决定是否先保存
- 读取目标文件
- 切换当前窗口 session
- 复验目标路径合法性与“是否已在其他窗口打开”

不再承担“是否需要弹保存框”的职责。

#### `ipcMainUtil.js`

必须同步扩展新的 IPC 命令透传，确保 renderer 新增的命令 wrapper 能真正抵达 runtime。

## 第三个评审问题的处理策略

第三个评审问题原始建议是：

> 当前窗口打开命中已有窗口时，也应像新窗口分支那样自动回收空白草稿来源窗口。

本次设计不采纳该建议，原因如下：

1. 它基于历史遗留的自动回收逻辑，而不是基于当前产品语义。
2. 当前产品语义已经明确允许用户显式选择“当前窗口打开”或“新窗口打开”。
3. 一旦目标已在其他窗口打开，实际语义应该退化为“直接聚焦已有窗口”，而不是“顺便替用户关闭来源窗口”。

因此，本次设计对第三个问题的改造方案是：

- 不给 `current-window` 分支新增来源窗口自动回收。
- 同时清理 `new-window` 分支中的旧自动回收逻辑。
- 统一规则为：`focused-existing-window` 只聚焦，不关闭来源窗口。

真正承载这段历史行为的位置在 Electron runtime 的 `openDocumentWindowWithRuntimePolicy()`，实现时必须明确修改这里，而不是只改 renderer 决策分支。

## 测试策略

### Web 侧

1. 补组合链路测试，覆盖“最后一次输入尚未上浮”时点击 `当前窗口打开` 的场景，验证必须先稳定化正文，再进入正确保存分支。
2. 补组合链路测试，覆盖“目标文件已在其他窗口打开”时的场景，验证不应出现 open-choice，也不应出现 save-choice。
3. 补 `/preview` 路由下的降级测试，验证没有 `EditorView` 时仍能返回稳定上下文。
4. 补“文件 -> 打开 / 快捷键打开”链路测试，验证 `document.request-open-dialog` 选择出的路径也会进入统一打开决策流程。
5. 保留现有 controller 单测，但将其角色调整为“纯编排规则测试”，不再让它假设 `store.dirty` 就是最终真相。
6. 补 renderer 命令 wrapper 契约测试，确保新增命令和 payload 形状固定下来。
7. 保留并扩展 recent 入口测试，验证 recent 缺失仍返回 `recent-missing` 而不是普通 missing。

### Electron 侧

1. 补目标预判测试，验证命中其他窗口占用时必须优先返回 `focused-existing-window`。
2. 补当前窗口切换预判测试，验证只有真正需要时才返回 `needs-save-choice`。
3. 补执行切换测试，验证仅显式 `switchPolicy=save-before-switch` 时进入保存分支。
4. 补 `ipcMainUtil` 契约测试，验证新增命令能从 IPC 层透传到 runtime。
5. 保留并扩展 `document.request-open-dialog` 回流测试，确保它只负责路径选择，不再直接完成最终打开。
6. 调整旧测试，移除“新窗口打开后自动关闭 pristine draft 来源窗口”的旧预期。
7. 保留 `recent-missing` 回归测试，避免统一打开流程后丢掉最近文件缺失提示。
8. 补 stale execute 契约测试，验证 session / revision 失配时返回 `source-session-changed`。

## 风险与控制

### 风险一：renderer 准备逻辑与 route leave 逻辑重复

控制方式：

- 抽共享 helper，避免 `EditorView` 内出现两套几乎相同的“flush + edit + get snapshot”流程。

### 风险二：preflight / execute 协议增加后，旧调用方遗漏迁移

控制方式：

- 所有文件打开入口统一收口到宿主打开交互 service，再由该 service 驱动 `fileManagerOpenDecisionController`。
- `rendererDocumentCommandUtil` 增加明确命令函数，禁止调用方继续散落拼装旧事件名。
- `ipcMainUtil` 与其测试同步迁移，禁止新增命令只停留在 renderer wrapper。

### 风险三：旧测试仍将“自动关闭来源窗口”视为正确行为

控制方式：

- 在 Electron runtime 测试中显式替换预期，并补充来源窗口保留场景。

## 验收标准

满足以下条件才视为本次改造完成：

1. 目标文件已在其他窗口打开时，所有入口都只聚焦已有窗口，不弹 open-choice，不弹 save-choice。
2. 用户在最后一次输入 160ms 内点击 `当前窗口打开` 时，仍能正确识别 dirty 并进入正确保存逻辑。
3. 菜单“打开”和快捷键 `openFile` 选中的文件，也必须进入同一套统一打开决策流程。
4. `/preview` 路由下没有 `EditorView` 时，`当前窗口打开` 仍能走稳定快照降级逻辑。
5. `新窗口打开` 不再隐式关闭来源空白窗口。
6. 现有相关测试更新通过，新增回归测试覆盖新顺序与新语义。
