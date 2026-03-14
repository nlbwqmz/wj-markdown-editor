# 文档会话化保存与监听重构设计

> 状态：设计评审已通过，待用户审阅
> 日期：2026-03-14
> 适用仓库：`wj-markdown-editor`
> 目标分支：`feature/document-session-save-refactor`

## 1. 背景与问题

当前项目中，手动保存、自动保存、关闭前自动保存、外部文件监听、外部修改提示、文件缺失处理等逻辑，主要分散在以下位置：

- `wj-markdown-editor-electron/src/util/win/winInfoUtil.js`
- `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- `wj-markdown-editor-electron/src/util/fileWatchUtil.js`
- `wj-markdown-editor-web/src/util/channel/eventUtil.js`
- `wj-markdown-editor-web/src/views/EditorView.vue`
- `wj-markdown-editor-web/src/views/PreviewView.vue`

现状的主要问题不是“代码多”，而是“状态真相与副作用边界不稳定”：

- `winInfo` 同时承载窗口生命周期、文档内容、保存任务、外部监听状态、关闭流程控制，职责过重。
- 手动保存、自动保存、关闭拦截、文件监听回调分别从不同入口改动状态，容易形成竞态。
- 前端与主进程之间使用多种事件拼接出最终视图状态，导致“谁负责最终收敛”不够明确。
- `save-other` 的产品语义实际是“保存副本”，但现有代码结构容易被误读成“另存为并切换当前文档”。
- 现有模型以“窗口”为核心，不利于未来演进到“同窗口多文档/多标签”。

这次重构不接受“局部补丁式修复”，而是以行业常见的“文档会话 + 命令收口 + 副作用协调器”模型重新设计主进程文档生命周期。

## 2. 设计目标

### 2.1 核心目标

1. 将文档状态真相彻底收口到 Electron 主进程。
2. 将保存、自动保存、关闭拦截、外部监听、外部修改处理统一进一条可推导、可测试的命令流。
3. 让窗口与文档解耦，为未来“同窗口多标签”演进预留稳定边界。
4. 消除现有保存与监听链路中的竞态风险，避免迟到回调污染当前状态。
5. 在架构重建的前提下，保证现有业务能力不回退。

### 2.2 强兼容目标

这次重构必须兼容现有业务功能，兼容的定义不是“主要功能还能用”，而是“原有能力集合不发生回退”。以下能力必须保持：

- 手动保存
- 首次保存未命名草稿
- 自动保存：窗口失焦触发
- 自动保存：关闭窗口触发
- 关闭未保存文档时的拦截与确认流程
- 文件被外部修改后的提醒、自动应用、手动应用、手动忽略
- 文件被外部删除或移走后的处理
- 文件恢复后的继续编辑与继续保存
- 最近文件打开与不存在提示
- 最近文件移除与清空
- 预览区 / 编辑区使用本地资源在资源管理器中打开
- 本地资源删除相关能力
- 本地资源路径解析、打开失败提示、未保存文档中的相对资源提示
- 现有导入、打开、预览刷新、标题栏保存态展示
- `save-other` 的“保存当前文档副本”语义

### 2.3 扩展目标

本次设计需要为“同窗口多文档 / 多标签”预留抽象，但本次实现阶段不要求直接交付多标签界面。要求做到：

- 文档会话与窗口生命周期解耦
- 一个窗口理论上可以绑定多个会话
- 当前窗口只需暴露“激活中的会话”即可工作
- 后续多标签实现时，不需要再次推翻保存/监听架构

## 3. 非目标

本次不将以下内容纳入交付范围：

- 直接实现多标签 UI
- 引入云同步、远程存储、协同编辑
- 大范围重写预览渲染、编辑器本身、资源管理产品语义
- 改变 `save-other` 为“保存并切换当前文档”

如果未来需要“保存到新路径并切换当前文档”，那应是一个新的明确命令，而不是复用现有 `save-other` 语义。

## 4. 总体方案

本次采用“`DocumentSession` 文档会话”为核心的新架构。

新模型下：

- 文档是状态真相
- 窗口只是文档的展示宿主
- IPC、窗口事件、watcher 事件都只能发命令，不能直接改业务状态
- 读写文件、系统通知、watcher 绑定等都下沉到副作用协调器

### 4.1 核心模块

主进程新增并重构为以下模块：

1. `documentSessionStore`
   负责创建、销毁、查找 `DocumentSession`，并维护窗口与会话的绑定关系。

2. `documentSession`
   只存放文档业务状态，不直接触碰 Electron API、文件系统 API。

3. `documentCommandService`
   统一接收用户命令、系统命令和副作用结果命令，负责驱动状态流转。

4. `saveCoordinator`
   统一处理当前文档本体的保存、自动保存、关闭前自动保存，保证同一文档单写盘管线。

5. `watchCoordinator`
   统一处理文件监听、内部保存回声抑制、文件缺失/恢复识别、监听绑定令牌隔离。

6. `documentEffectService`
   执行真实副作用，例如写文件、读文件、重绑 watcher、发送系统通知。它不直接向渲染端发状态投影；如果某个副作用需要驱动 UI，则只产出标准化的 effect result 或一次性 UI effect intent，再交给 `windowSessionBridge` 统一对外发送。

7. `windowSessionBridge`
   负责将当前激活会话投影到窗口标题、保存态、外部修改弹窗、消息提示等 UI 表现。它是唯一允许向渲染层发送会话快照和一次性 UI effect 的模块。

### 4.2 责任边界

新的责任边界必须满足：

- 会话负责业务真相
- 协调器负责并发和时序控制
- 副作用服务负责执行，不负责定策略
- 窗口桥是唯一对 renderer 的推送出口，负责展示，不负责推导真相
- 渲染层负责输入和展示，不负责最终状态判断，也不允许通过多种局部事件自行拼装状态真相

## 5. 文档会话模型

每个 `DocumentSession` 维护如下状态分区。

### 5.1 文档来源状态 `documentSource`

- `path`
- `exists`
- `missingPath`
- `missingReason`
- `encoding`
- `lastKnownStat`

这部分只表达“当前文档本体是谁、是否存在、磁盘身份是什么”。

### 5.2 编辑态 `editorSnapshot`

- `content`
- `revision`
- `updatedAt`

渲染层每次编辑只更新这里。任何编辑都不允许直接改保存态。

### 5.3 磁盘真实基线 `diskSnapshot`

- `content`
- `versionHash`
- `exists`
- `stat`
- `observedAt`
- `source`

`diskSnapshot` 表示“当前主进程观察到的最新磁盘真实值”，无论它来自：

- 初次打开文件
- watcher 读取到的外部修改
- 文件缺失/恢复
- 当前会话成功写盘后的回写确认

`saved / dirty` 统一由 `editorSnapshot` 与 `diskSnapshot` 对比推导，而不是由最近一次成功保存结果推导。

为避免实现阶段对空值语义产生分叉，本次固定以下初始化 / 清空规则：

- 新建未命名草稿
  - `diskSnapshot.content = ''`
  - `diskSnapshot.versionHash = hash('')`
  - `diskSnapshot.exists = false`
  - `diskSnapshot.stat = null`
  - `diskSnapshot.source = 'draft-init'`

- 通过最近文件入口打开，但目标文件不存在
  - `diskSnapshot.content = ''`
  - `diskSnapshot.versionHash = hash('')`
  - `diskSnapshot.exists = false`
  - `diskSnapshot.stat = null`
  - `diskSnapshot.source = 'recent-missing'`

- 已绑定文件后续被删除或移走
  - `diskSnapshot.content = ''`
  - `diskSnapshot.versionHash = hash('')`
  - `diskSnapshot.exists = false`
  - `diskSnapshot.stat = null`
  - `diskSnapshot.source = 'missing'`

这里明确禁止把 `diskSnapshot.content` 置为 `null` 或保留旧值。文件缺失时统一重置为空内容基线，以保持当前产品语义：如果这时编辑器内容也为空，则文档可重新视为已保存；如果编辑器内容非空，则继续视为未保存。

此外仍保留 `persistedSnapshot` 作为“最近一次由当前会话成功写盘得到的提交基线”，字段如下：

- `content`
- `revision`
- `savedAt`
- `path`
- `jobId`

`persistedSnapshot` 只用于：

- 判断当前 save job 成功落盘了哪一版内容
- 判断保存期间新增编辑是否需要继续补写
- 为调试和回归测试提供稳定断言

它不直接参与 UI 层 `saved / dirty` 的计算。

### 5.4 保存运行态 `saveRuntime`

- `status`
- `inFlightJobId`
- `inFlightRevision`
- `requestedRevision`
- `trigger`
- `lastError`

它只描述保存管线，不是业务真相。

### 5.5 外部变更运行态 `externalRuntime`

- `pendingExternalChange`
- `resolutionState`
- `lastResolutionResult`
- `lastHandledVersionHash`
- `lastKnownDiskVersionHash`

其中 `pendingExternalChange` 的字段固定为：

- `version`
- `versionHash`
- `diskContent`
- `diskStat`
- `detectedAt`
- `watchBindingToken`

其中枚举值固定为：

- `resolutionState`
  - `idle`
  - `pending-user`
  - `missing`
  - `restored`
  - `resolved`

- `lastResolutionResult`
  - `none`
  - `applied`
  - `ignored`
  - `superseded`
  - `noop`
  - `missing`

这里明确：

- `pendingExternalChange` 只要存在，就表示“当前有一个等待用户决策的外部版本”；因此它不再携带内部 `status` 字段，也不允许再派生第二套子状态机
- `resolutionState` 只表示“当前外部修改收敛阶段”
- 最终动作结果由 `lastResolutionResult` 体现；其中只有 `applied` / `ignored` / `noop` 这三类终态结果才要求同步落 `lastHandledVersionHash`
- `resolutionState = 'pending-user'` 当且仅当 `pendingExternalChange !== null`
- `resolutionState` 为 `idle` / `resolved` / `missing` / `restored` 时，`pendingExternalChange` 必须为 `null`
- `resolved` 是一次收敛完成后的非粘性终态；在本轮快照投影完成后，下一轮空转收敛会自动回落到 `idle`
- `missing` 与 `restored` 是阶段态，会分别持续到文件缺失被处理完毕、或恢复后的首次有效读盘完成
- `lastResolutionResult` 是持久审计字段，只能被新的外部修改收敛结果覆盖，不能被普通编辑、普通保存、窗口切焦直接清空
- `lastHandledVersionHash` 只记录“已经完成终态收敛并允许后续去重”的版本 hash，因此只允许和 `applied` / `ignored` / `noop` 这三类结果配对；`superseded` 与 `missing` 不得写入它

它负责承载“外部修改待处理”这一独立业务，不允许被普通编辑动作顺手覆盖。

### 5.6 监听运行态 `watchRuntime`

- `bindingToken`
- `watchingPath`
- `watchingDirectoryPath`
- `status`
- `fileExists`
- `eventFloorObservedAt`
- `recentInternalWrites`
- `lastError`

监听状态从业务态中拆出，由协调器维护。

### 5.7 关闭运行态 `closeRuntime`

- `intent`
- `promptReason`
- `waitingSaveJobId`
- `awaitingPathSelection`
- `forceClose`

关闭请求也进入状态机，不能继续散落在窗口事件回调里。

### 5.8 派生状态

下列状态不单独存真相，只在收敛阶段统一计算：

- `saved`
- `dirty`
- `canCloseImmediately`
- `needsUnsavedPrompt`
- `shouldAutoSaveOnBlur`
- `shouldAutoSaveOnClose`
- `activeExternalPrompt`

其中必须明确：

- `saved = (editorSnapshot.content === diskSnapshot.content) && (documentSource.exists === diskSnapshot.exists)`
- `dirty = !saved`

## 6. 命令模型

### 6.1 用户命令

- `document.create-draft`
- `document.request-open-dialog`
- `document.open-path`
- `document.open-recent`
- `document.edit`
- `document.save`
- `document.save-copy`
- `document.request-close`
- `document.cancel-close`
- `document.confirm-force-close`
- `document.external.apply`
- `document.external.ignore`
- `document.resource.open-in-folder`
- `document.resource.delete-local`
- `recent.remove`
- `recent.clear`

### 6.2 系统命令

- `window.blur`
- `window.focus`
- `watch.file-changed`
- `watch.file-missing`
- `watch.file-restored`
- `watch.error`

### 6.3 副作用结果命令

- `save.started`
- `save.succeeded`
- `save.failed`
- `dialog.save-target-selected`
- `dialog.save-target-cancelled`
- `dialog.copy-target-selected`
- `dialog.copy-target-cancelled`
- `dialog.open-target-selected`
- `dialog.open-target-cancelled`
- `watch.bound`
- `watch.unbound`
- `watch.rebind-failed`
- `copy-save.succeeded`
- `copy-save.failed`

### 6.4 命令流原则

所有入口统一遵守以下规则：

1. 入口只发命令
2. 命令服务更新会话状态
3. 命令服务产出下一步 effect 计划
4. effect 服务执行副作用
5. effect 结果回流成新的命令
6. 每轮命令结束后统一执行状态收敛
7. 收敛后由窗口桥向渲染层发送最新会话快照
8. 如果存在一次性 UI effect，也由窗口桥在快照投影之后统一发出

这里必须明确两条规则：

- `document.snapshot.changed` 是渲染层唯一的状态真相投影
- 一次性 UI effect 只用于 toast、系统消息、聚焦提示等瞬时表现，不能承载第二套状态真相

## 7. 保存协调器设计

### 7.1 单文档单写盘管线

每个 `DocumentSession` 任意时刻最多只允许一个进行中的写盘任务。

保存开始时，`saveCoordinator` 会冻结一个不可变快照：

- `jobId`
- `sessionId`
- `revision`
- `content`
- `path`
- `trigger`

写盘任务只认这个快照，写盘期间后续编辑不会污染当前任务。

### 7.2 保存成功后的基线更新规则

写盘成功后：

- 必须用“本次成功快照”更新 `persistedSnapshot`
- 只有在当前没有被 watcher 观测到更新的磁盘版本时，才允许用相同内容刷新 `diskSnapshot`

不能直接把当前最新 `editorSnapshot.content` 覆盖成已保存内容，否则会误把保存期间新增的编辑也标记成已保存。

这里固定一条竞态优先级规则：

- 如果 `watchCoordinator` 已经观测到一个与当前 save job 内容 hash 不同的 `lastKnownDiskVersionHash`
- 则 `save.succeeded` 只能更新 `persistedSnapshot`
- 不能反向覆盖 `diskSnapshot`
- 后续收敛必须继续以 watcher 已观测到的更新磁盘版本为准

为避免实现阶段再出现覆盖歧义，`diskSnapshot` / `lastKnownDiskVersionHash` / `diskSnapshot.stat` / `documentSource.lastKnownStat` 的写入优先级固定如下：

| 事件 | 允许更新 `diskSnapshot` | 允许更新 `lastKnownDiskVersionHash` | 允许更新 `diskSnapshot.stat` / `documentSource.lastKnownStat` | 说明 |
|------|-------------------------|-------------------------------------|--------------------------------------------------------------|------|
| `watch.file-changed` 读盘成功 | 是 | 是 | 是 | 当前 bindingToken 匹配时，watcher 结果优先级最高 |
| `watch.file-restored` 后首次读盘成功 | 是 | 是 | 是 | 以恢复后的实际磁盘内容为准 |
| `watch.file-missing` | 是，重置为空基线 | 是，重置为 `hash('')` | 是，清空为 `null` | 缺失事件优先于旧保存回调 |
| `save.succeeded` 且未观测到不同 watcher 版本 | 是 | 是 | 是 | 仅在未被 watcher 观察到更高优先级磁盘版本时生效 |
| `save.succeeded` 但已观测到不同 watcher 版本 | 否 | 否 | 否 | 只能更新 `persistedSnapshot`，不得回写覆盖 watcher 结果 |

无论 watcher 是否及时回读，`save.succeeded` 对当前文档身份都必须立即执行以下收敛：

- 将 `documentSource.exists` 置为 `true`
- 如果这是草稿首次保存或 recent-missing 会话首次绑定正式路径，则清空 `documentSource.missingPath` / `documentSource.missingReason`
- 将 `watchRuntime.eventFloorObservedAt` 推进到 `max(当前值, savedAt)`，用于拒绝同一 `bindingToken` 下早于本次保存的迟到 watcher 事件
- 如果这次保存建立了新的文档身份，或把当前会话从 `exists = false` 恢复为 `exists = true`，则必须立即触发 watcher 重绑并生成新的 `bindingToken`
- 以上收敛不能等待后续 watcher 事件，否则会把“已写盘成功”的会话错误地停留在 `exists = false` / `dirty = true`

### 7.3 后续编辑与补写规则

如果写盘成功时发现：

- `editorSnapshot.revision === savedRevision`

则本轮保存完成，文档进入已保存态。

如果发现：

- `editorSnapshot.revision > savedRevision`

则表示保存期间又发生了新编辑，文档继续保持脏状态，并由协调器根据策略决定是否立刻补写下一轮。

### 7.4 保存触发源统一建模

以下触发源都统一进入同一个保存管线：

- 手动保存
- 自动保存：窗口失焦
- 自动保存：窗口关闭前

它们只在策略上不同：

- 手动保存：有明确成功提示，失败提示可见
- 自动保存：不提示成功，只提示失败
- 关闭自动保存：失败后需要回流关闭决策

### 7.5 首次保存规则

未命名草稿首次保存时，路径选择属于保存前置步骤：

1. 先获取用户选择的目标路径
2. 路径有效后进入主保存管线
3. 保存成功后，该会话正式绑定到此路径
4. 再建立 recent / watcher / 标题投影

### 7.6 保存副本 `save-other` 规则

`save-other` 的语义明确为“保存当前文档副本”，不是“切换当前文档到新路径”。

因此 `document.save-copy` 的规则是：

- 写出当前编辑快照到用户选择的新路径
- 不改变当前会话的 `path`
- 不改变当前会话的 `persistedSnapshot.path`
- 不重绑 watcher
- 不切换标题
- 不改变当前文档保存态真相
- 不把副本文档纳入当前会话生命周期管理
- same-path 判断必须使用固定的路径身份比较规则：
  - 先把目标路径与当前会话路径都归一成绝对路径
  - 统一折叠 `.` / `..`
  - 统一路径分隔符
  - Windows 下整条归一化路径按大小写不敏感比较
- 目标路径在按上述规则归一后如果与当前会话路径相同，则本次 `document.save-copy` 必须在写盘前直接失败，并通过 `copy-save.failed` 回流 `reason = 'same-path'`
- same-path 的 `document.save-copy` 既不能退化为普通 `document.save`，也不能真的写盘到当前文档路径

`copy-save` 结果命令的 payload 也在这里固定：

- `copy-save.succeeded`
  - `path: string`

- `copy-save.failed`
  - `reason: 'same-path' | 'write-failed'`
  - `path: string | null`

### 7.7 关闭与首次保存决策矩阵

关闭链路必须具备完整决策树，至少遵守以下规则：

| 场景 | 系统动作 | 失败 / 取消后的状态 |
|------|----------|---------------------|
| 当前会话已保存 | 直接关闭 | 无 |
| 关闭请求发生时已存在进行中的 save job，且该 job 已覆盖当前最新待保存 revision | `closeRuntime.waitingSaveJobId` 挂靠当前 save job，等待结果后再决定关闭 | save 失败后窗口保持打开，回到未保存确认态 |
| 关闭请求发生时已存在进行中的 save job，但该 job 尚未覆盖当前最新待保存 revision | 等待当前 save job 完成，再由 `saveCoordinator` 继续补写最新 revision，最终关闭 | 任一轮失败都回到未保存确认态 |
| 当前会话未保存，且未启用 `autoSave=close` | 进入未保存确认态 | 用户取消关闭后清空 `closeRuntime`，继续编辑 |
| 当前会话未保存，已启用 `autoSave=close`，且已有有效路径 | 进入关闭前自动保存流程，保存成功后继续关闭 | 保存失败后窗口保持打开，回到未保存确认态 |
| 当前会话未保存，已启用 `autoSave=close`，但当前为未命名草稿 | 先进入首次保存选路径流程，路径选定后再保存并关闭 | 用户取消选路径后清空 `closeRuntime`，窗口保持打开 |
| 未保存确认态下用户选择强制关闭 | 标记 `forceClose=true` 并立即关闭 | 无 |
| 未保存确认态下用户取消 | 清空 `closeRuntime` | 继续编辑 |

为保证后续实现计划可以稳定拆分，本次设计还明确关闭相关命令语义：

- `document.request-close`：窗口请求关闭当前激活会话
- `document.cancel-close`：用户取消关闭
- `document.confirm-force-close`：用户确认放弃未保存改动并关闭

对应的文件对话框结果统一通过副作用结果命令回流：

- `dialog.save-target-selected` / `dialog.save-target-cancelled`
- `dialog.copy-target-selected` / `dialog.copy-target-cancelled`
- `dialog.open-target-selected` / `dialog.open-target-cancelled`

其中“关闭流程中的首次保存选路径被取消”不是新的独立业务命令，而是：

- `dialog.save-target-cancelled`
- 在 `closeRuntime.awaitingPathSelection === true` 条件下
- 由 `documentCommandService` 解释为“关闭流程被取消，窗口保持打开”

而普通保存时收到 `dialog.save-target-cancelled`，则只表示“保存请求结束但当前文档状态不变”。

## 8. 监听协调器设计

### 8.1 监听抽象

`watchCoordinator` 只负责把底层监听适配成统一事件，不直接改会话真相。

无论底层仍然复用当前目录级共享 watcher，还是未来替换实现，上层只看到：

- `watch.file-changed`
- `watch.file-missing`
- `watch.file-restored`
- `watch.error`

普通 watcher 事件的 payload 也必须固定包含 `bindingToken`：

- `watch.file-changed`
  - `bindingToken`
  - `watchingPath`
  - `diskContent`
  - `diskStat`
  - `observedAt`

- `watch.file-missing`
  - `bindingToken`
  - `watchingPath`
  - `observedAt`

- `watch.file-restored`
  - `bindingToken`
  - `watchingPath`
  - `observedAt`

这里的 `observedAt` 固定表示“主进程实际接收并标准化这条 watcher 事件的时间戳”，不是文件 stat 自身的 mtime。

### 8.2 绑定令牌隔离

每次会话切路径、首次保存绑定路径、缺失文件重新保存成功导致 `exists = false -> true`、`watch.error` 触发自动重绑、窗口解绑、会话关闭时，监听绑定都生成新的 `bindingToken`。

每次生成新的 `bindingToken` 时，也必须同步重置该绑定下的 `watchRuntime.eventFloorObservedAt`，避免旧绑定的排序下界污染新绑定。

任何迟到事件只要 token 不匹配，必须直接丢弃，避免：

- 旧路径 watcher 污染新路径
- 关闭后迟到回调污染会话
- 未来多标签切换 active session 时旧订阅继续生效

除 `bindingToken` 隔离外，同一 `bindingToken` 内还必须按 `observedAt` 做顺序裁决：

- `watchRuntime.eventFloorObservedAt` 表示“当前会话还允许接受的最早 watcher 事件时间下界”
- 任何 watcher 事件只要 `observedAt <= watchRuntime.eventFloorObservedAt`，即使 `bindingToken` 匹配，也必须视为迟到事件并丢弃
- 成功应用一条 `watch.file-changed` / `watch.file-missing` / `watch.file-restored` 后，必须把 `watchRuntime.eventFloorObservedAt` 推进到该事件的 `observedAt`
- 当前文档成功写盘后，也必须按保存时间推进 `watchRuntime.eventFloorObservedAt`，防止同一 token 下早于保存的缺失事件或旧读盘结果回滚刚刚恢复的会话身份

### 8.3 内部保存回声抑制

内部保存回声抑制统一收口到 `watchCoordinator`：

- 保存前记录写盘内容指纹
- 保存后保留短时间窗口内的最近内部写盘指纹
- watcher 收到文件变化时先匹配内部指纹
- 命中则视为内部保存回声，直接忽略

不能让 watcher 直接参与“是否属于外部修改”的业务判断。

`watchRuntime.status` 的枚举固定为：

- `idle`
- `active`
- `rebinding`
- `degraded`

`watch.error` 的 payload 固定为：

- `bindingToken`
- `watchingPath`
- `error`
  - `name: string`
  - `message: string`
  - `code: string | null`

`watch.bound` 的 payload 固定为：

- `bindingToken`
- `watchingPath`
- `watchingDirectoryPath`

`watch.rebind-failed` 的 payload 固定为：

- `bindingToken`
- `watchingPath`
- `error`
  - `name: string`
  - `message: string`
  - `code: string | null`

### 8.4 外部修改处理规则

外部修改事件进入会话后，固定按以下顺序处理：

1. 先更新“磁盘真实值”基线
2. 立即重算保存态
3. 若差异自然消失，则直接收敛结束
4. 若仍有差异，则按策略分为自动应用或提醒用户

提醒模式下，`pendingExternalChange` 必须作为独立状态保留，直到：

- 用户明确应用
- 用户明确忽略
- 后续收敛时发现差异已经消失

普通编辑动作不能直接清除它。

为确保后续实现与测试可执行，本次明确外部修改策略矩阵如下：

| 前置条件 | 策略 | 系统动作 |
|----------|------|----------|
| 命中内部保存回声指纹 | 任意 | 直接忽略 |
| 文件已缺失 | 任意 | 转入文件缺失流程，不走普通外部修改分支 |
| `diskContent === editorContent` | 任意 | 更新磁盘基线后直接收敛，不弹窗 |
| 存在差异，且配置为 `apply` | `apply` | 直接用外部内容覆盖编辑态，设置 `lastResolutionResult='applied'`，并进入 `resolved` |
| 存在差异，且配置为 `prompt` | `prompt` | 写入 `pendingExternalChange`，通过会话快照投影给渲染层，由用户决定应用或忽略 |
| 保存进行中收到真实外部修改 | `apply` / `prompt` | 不取消当前保存任务；待保存结果回流后，继续以最新磁盘版本重新收敛，且不能因为保存成功而自动清空 `pendingExternalChange` |

这一定义沿用当前产品语义：当用户配置为 `apply` 时，即便当前编辑态未保存，只要检测到真实外部修改且不是内部回声，也会直接应用磁盘最新内容。

为彻底消除 `externalRuntime` 终态解释分叉，再固定以下不变量：

1. `pendingExternalChange === null` 表示“当前没有等待用户决策的外部版本”。
2. `resolutionState = 'pending-user'` 等价于“存在 `pendingExternalChange` 且正在等待用户动作”。
3. `resolutionState = 'resolved'` 只用于让本轮 `document.snapshot.changed` 明确携带“刚完成了一次外部修改收敛”的事实；快照投影完成后，命令层必须立即执行 housekeeping，将其回落到 `idle`，且这个 housekeeping 不得改写 `lastResolutionResult`、`lastHandledVersionHash`。
4. `lastResolutionResult` 是所有收敛动作的最终落点；`lastHandledVersionHash` 只服务于 `applied` / `ignored` / `noop` 这三类终态去重。即使 `resolved` 已回落到 `idle`，这些字段也必须保留到下一次外部修改收敛结果覆盖它们。
5. `superseded` 只表示“旧 pending 被更新的外部版本覆盖”，不是终态；写入 `superseded` 后系统仍保持 `pending-user`，等待用户处理新的 pending。
6. “保存导致差异消失”严格归类为 `noop`，禁止再引入新的 resolution result 枚举。
7. 外部修改去重只允许把 `lastHandledVersionHash` 当作“终态已处理版本”的去重标记使用；当 `lastResolutionResult` 为 `superseded` 或 `missing` 时，禁止仅凭同 hash 直接丢弃后续恢复或重现的外部版本。

相关字段的更新点也在这里固定：

- `lastKnownDiskVersionHash`
  - 每次成功读取磁盘内容时更新
  - 只有在未观测到更高优先级 watcher 版本时，当前会话成功写盘才允许更新为该写盘内容的 hash

- `lastHandledVersionHash`
  - 用户应用外部修改时更新
  - 用户忽略外部修改时更新
  - 差异自然消失时更新
  - “保存导致差异自然消失”时更新
  - `superseded` 与 `missing` 时禁止更新

- `diskSnapshot.stat` / `documentSource.lastKnownStat`
  - 文件变更并读取成功时更新
  - 文件恢复并读取成功时更新
  - 文件缺失时清空
  - 只有在未观测到更高优先级 watcher 版本时，保存成功才允许刷新

`externalRuntime` 的状态迁移也在这里固定：

| 事件 | `resolutionState` | `lastResolutionResult` | `pendingExternalChange` | `lastHandledVersionHash` |
|------|-------------------|------------------------|-------------------------|--------------------------|
| 新外部修改进入，且当前无 pending | `pending-user` | 保持原值 | 创建新 pending | 不变 |
| 新外部修改进入，且已有 pending，被新版本替换 | `pending-user` | `superseded` | 旧 pending 被新 pending 替换 | 不变 |
| 用户 apply | `resolved` | `applied` | 清空 | 更新为当前 pending 的 `versionHash` |
| 用户 ignore | `resolved` | `ignored` | 清空 | 更新为当前 pending 的 `versionHash` |
| 差异自然消失 | `resolved` | `noop` | 清空 | 更新为当前差异的 `versionHash` |
| `save.succeeded` 后收敛发现既有差异被消解 | `resolved` | `noop` | 清空 | 更新为被消解 pending 的 `versionHash` |
| 收到 `watch.file-missing` | `missing` | `missing` | 清空 | 不变 |
| 收到 `watch.file-restored` | `restored` | 保持原值 | 保持为空 | 不变 |
| 恢复后的首次有效读盘发现无需提示 | `resolved` | `noop` | 清空 | 更新为恢复后版本的 `versionHash` |
| 恢复后的首次有效读盘发现仍有差异且策略为 prompt | `pending-user` | 保持原值 | 创建新 pending | 不变 |
| `resolved` 阶段完成一次快照投影并执行 housekeeping | `idle` | 保持原值 | 保持为空 | 不变 |

- 收到 `watch.file-missing`
  - 清理 `pendingExternalChange`
  - `resolutionState = 'missing'`
  - 隐藏外部修改弹窗投影

- 收到 `watch.file-restored`
  - `resolutionState = 'restored'`
  - 不直接恢复 `pendingExternalChange`
  - 等待后续实际读盘结果再进入 `resolved` / `pending-user`

- 收到 `save.succeeded`
  - 默认不清理 `pendingExternalChange`
  - 只有当保存成功后的 `editorSnapshot.content === diskSnapshot.content` 时，才允许在收敛阶段把 `resolutionState` 推进到 `resolved`
  - 此时如果是“由保存使差异自然消失”的场景，则必须同步设置 `lastResolutionResult = 'noop'`
  - 并用被消解的 pending `versionHash` 更新 `lastHandledVersionHash`

- 用户执行 apply / ignore
  - 对应更新 `lastResolutionResult = 'applied' / 'ignored'`
  - 更新 `lastHandledVersionHash`
  - 清理待处理外部修改并进入 `resolved`

- 差异自然消失
  - 清理 `pendingExternalChange`
  - `resolutionState = 'resolved'`
  - `lastResolutionResult = 'noop'`
  - 更新 `lastHandledVersionHash`

### 8.5 文件缺失与恢复

文件被删除或移走时：

- `documentSource.exists = false`
- 保留当前文档路径标识
- 保留用户正在编辑的 `editorSnapshot.content`
- 清空磁盘真实内容基线
- 重新计算保存态
- 更新窗口投影与提示

文件恢复时：

- 会话恢复 `exists = true`
- watcher 继续正常工作
- 后续如有真实内容差异，再进入外部修改流程

### 8.6 watcher 错误处理

`watch.error` 的最小处理策略固定如下：

- 如果 `bindingToken` 与当前 `watchRuntime.bindingToken` 不匹配，则整个事件直接丢弃，不做任何状态更新
- 更新 `watchRuntime.lastError`
- 将 `watchRuntime.status` 置为 `rebinding`
- 记录日志
- 通过 `window.effect.message` 向当前窗口发送一次性警告提示
- 立即为本次重绑尝试生成新的 `bindingToken`
- 调度一次针对同一路径的自动重绑尝试

自动重绑结果：

- 成功：`watch.bound` 必须回传“新重绑尝试”的 `bindingToken`，并将 `watchRuntime.status` 置为 `active`
- 失败：`watch.rebind-failed` 必须回传“新重绑尝试”的 `bindingToken`，保留 `watchRuntime.lastError`，并将 `watchRuntime.status` 置为 `degraded`

为避免多个重绑尝试互相覆盖，再固定以下规则：

- 同一会话任意时刻最多只允许一个进行中的自动重绑尝试
- 新的自动重绑尝试一旦创建，旧 token 下的所有 watcher 事件都必须视为迟到事件并丢弃
- `watch.bound` / `watch.rebind-failed` 只有在其 `bindingToken` 仍等于当前 `watchRuntime.bindingToken` 时才允许落状态

`watch.error` 不允许：

- 直接清理 `pendingExternalChange`
- 直接修改 `diskSnapshot`
- 直接修改 `documentSource.path`

`watchRuntime.status = 'degraded'` 只表示“当前没有有效 watcher 保护”，不表示文档不可编辑、不可保存或必须强制关闭。处于 `degraded` 时仍允许正常编辑和保存，但外部修改检测能力视为暂时不可用。

后续重新进入 `active` 的机会包括：

- 自动重绑成功
- 用户再次保存成功
- 用户重新打开或重新绑定当前文档

## 9. 窗口桥与渲染层契约

### 9.1 渲染层职责

渲染层只保留三类职责：

1. 编辑器输入
2. 展示主进程投影状态
3. 将用户动作转为命令

渲染层不再负责：

- 保存态真相判断
- 外部修改是否应清理
- 标题与保存状态的多事件拼装
- 关闭逻辑判断

渲染层只消费：

- 一个状态快照流：`document.snapshot.changed`
- 少量一次性 UI effect：例如消息提示

其中外部修改弹窗的数据也来自快照，不再通过单独的“外部修改状态事件”拼装。

### 9.2 IPC 契约

IPC 会统一整理为三类：

- 命令类
  - `document.create-draft`
  - `document.request-open-dialog`
  - `document.open-path`
  - `document.open-recent`
  - `document.edit`
  - `document.save`
  - `document.save-copy`
  - `document.request-close`
  - `document.cancel-close`
  - `document.confirm-force-close`
  - `document.external.apply`
  - `document.external.ignore`
  - `document.resource.open-in-folder`
  - `document.resource.delete-local`
  - `recent.remove`
  - `recent.clear`

- 查询类
  - `document.get-session-snapshot`
  - `recent.get-list`
  - `resource.get-info`
  - `resource.get-comparable-key`

- 推送类
  - `document.snapshot.changed`
  - `window.effect.message`
  - `window.effect.recent-list-changed`

其中：

- `document.snapshot.changed` 是唯一状态投影
- `window.effect.message` 只用于一次性消息提示
- `window.effect.recent-list-changed` 只承载 recent 列表刷新，不属于文档快照
- 外部修改弹窗、文件缺失状态、保存态、标题信息都从快照中读取
- recent 列表首次加载使用 `recent.get-list`
- recent 列表后续变化通过 `window.effect.recent-list-changed` 直接携带完整列表，renderer 不需要再次查询
- `resource.get-info` 采用异步查询
- `resource.get-comparable-key` 在本次重构中保持同步查询语义，仅用于兼容当前编辑区资源引用计数与删除流程

### 9.3 `DocumentSessionSnapshot` 契约

`document.get-session-snapshot` 与 `document.snapshot.changed` 必须返回相同结构，至少包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `sessionId` | `string` | 当前会话唯一标识 |
| `content` | `string` | 当前编辑正文 |
| `fileName` | `string` | 当前展示文件名 |
| `displayPath` | `string \\| null` | 当前展示路径 |
| `recentMissingPath` | `string \\| null` | 最近文件缺失提示路径，仅 `isRecentMissing=true` 时非空 |
| `windowTitle` | `string` | 当前窗口标题 |
| `saved` | `boolean` | 当前是否已保存 |
| `dirty` | `boolean` | 当前是否有未保存修改 |
| `exists` | `boolean` | 当前目标文件是否存在 |
| `isRecentMissing` | `boolean` | 是否为“最近文件不存在”场景 |
| `closePrompt` | `object \\| null` | 未保存关闭确认态投影 |
| `externalPrompt` | `object \\| null` | 外部修改待处理投影 |
| `resourceContext` | `object` | 当前会话为资源相关动作提供的固定上下文字段 |

其中 recent-missing 形态还必须满足：

- `isRecentMissing = true`
- `fileName = 'Unnamed'`
- `displayPath = recentMissingPath`
- `recentMissingPath = documentSource.missingPath`

其中两个嵌套对象也必须固定结构：

- `closePrompt`
  - `visible`
  - `reason`
  - `allowForceClose`

- `externalPrompt`
  - `visible`
  - `version`
  - `localContent`
  - `externalContent`
  - `fileName`

`resourceContext` 的字段固定为：

- `documentPath`
- `saved`
- `exists`

它只承载当前会话的资源解析上下文摘要，不承载大块资源业务数据。

### 9.4 UI 兼容要求

虽然内部事件模型会收敛，但外部表现必须保持兼容：

- 标题栏保存态展示保持可用
- 外部修改弹窗保持当前产品能力
- 现有编辑器和预览页的刷新体验不下降
- 消息提示语义不被削弱

## 10. 会话生命周期与资源集成要求

### 10.1 会话生命周期入口

会话生命周期入口必须明确归属到命令层，不能继续由不同 IPC 入口各自拼接：

- `document.create-draft`
  - 创建未命名草稿会话
  - 绑定到当前窗口的 active session

- `document.request-open-dialog`
  - 请求 effect 层弹出“打开文件”对话框
  - 最终通过 `dialog.open-target-selected` / `dialog.open-target-cancelled` 回流

- `document.open-path`
  - 打开指定路径
  - 如路径已被其他会话占用，按当前产品语义复用或聚焦对应窗口

- `document.open-recent`
  - 从最近文件入口恢复会话
  - payload 固定为 `{ path: string, trigger?: 'user' | 'startup' }`，默认 `trigger = 'user'`
  - 应用启动阶段的“自动恢复最近文件”必须显式使用 `trigger = 'startup'`；菜单、快捷键、最近文件列表点击一律使用 `trigger = 'user'`
  - 如果目标文件存在，则行为等同于 `document.open-path`
  - 如果目标文件不存在，必须按触发来源拆分：
    - `trigger = 'user'`
      - 不得修改当前 active session，也不得替换用户当前正在编辑的内容
      - 直接返回 `{ ok: false, reason: 'recent-missing', path: string }`
      - renderer 可基于该结果提示用户是否执行 `recent.remove`
    - `trigger = 'startup'`
      - 才允许创建一个“未命名草稿 + 缺失路径提示”的 recent-missing 会话作为启动态：
        - `documentSource.path = null`
        - `documentSource.missingPath = 请求的 recent 路径`
        - `documentSource.missingReason = 'recent-missing'`
        - `exists = false`
        - `fileName = 'Unnamed'`
        - snapshot 中必须设置 `isRecentMissing = true`
  - `document.open-recent` 本身不能隐式执行 `recent.add` / `recent.remove`，也不能因为打开失败自动改写 recent 列表
  - renderer 继续提供“移除该历史记录”的交互，命令入口固定为 `recent.remove`
  - 如果用户拒绝移除该历史记录，则 recent 列表保持不变

- 首次保存成功后的重新绑定
  - 只能在保存成功后把草稿会话绑定到正式路径
  - 不能在选路径后、写盘前提前切换文档身份

### 10.2 资源相关能力的兼容要求

本次重构虽然聚焦文档保存与监听，但验收范围必须覆盖依赖当前文档会话状态的资源相关能力，至少包括：

- 从编辑区或预览区对本地资源执行“在资源管理器打开”
- 打开失败时的错误提示
- 未保存文档中的相对资源打开提示
- 本地资源删除
- 删除后 Markdown 清理与后续保存
- 资源路径解析、相对路径归一化、可比较 key 计算

原因是这些能力虽然不是保存功能本身，但依赖当前文档路径、当前内容、当前保存状态、当前窗口/会话上下文。如果文档会话重构导致这些能力退化，则本次重构视为失败。

### 10.3 资源集成边界

资源相关能力需要通过会话上下文解析器统一拿到当前文档上下文，至少包括：

- 当前 active session 的 `documentSource.path`
- 当前 active session 的 `editorSnapshot.content`
- 当前 active session 的保存态

资源相关动作的归属规则如下：

- `document.resource.open-in-folder`
  - 由专门的资源服务执行
  - 通过 `documentSessionStore` 获取当前 active session 的上下文
  - 不能绕过会话直接依赖旧 `winInfo`
  - 输入 payload 固定为：
    - `resourceUrl: string`
    - `rawPath?: string`
  - 返回结构固定为：
    - `ok: boolean`
    - `opened: boolean`
    - `reason: 'opened' | 'not-found' | 'relative-resource-without-document' | 'invalid-resource-url' | 'invalid-resource-payload' | 'open-failed'`
    - `path: string | null`
  - `rawPath` 只用于兼容当前预览区链接的 query / hash 后缀回退逻辑：如果 `resourceUrl` 解析出的目标不存在，但 `rawPath` 去掉 query / hash 后能解析到真实本地文件，则仍应视为成功打开
  - `open-failed` 表示主进程已经吸收底层异常并标准化返回，禁止直接把原始异常抛给 renderer
  - 该命令本身不得修改 `DocumentSessionSnapshot`，只能返回结构化结果，并在需要时附带一次性消息 effect

- `document.resource.delete-local`
  - 由资源服务完成本地文件删除
  - Markdown 清理由 renderer / 编辑层基于当前 active session 的内容快照完成
  - 主进程命令层只负责本地文件删除及返回结构化结果，不直接改写 Markdown 文本
  - 输入 payload 固定为 `{ resourceUrl: string }`
  - 删除后仍要回到正常保存链路，不能旁路修改文档本体状态；任何 Markdown 变更都必须回到 `document.edit` -> 保存链路
  - 返回结构固定为：
    - `ok: boolean`
    - `removed: boolean`
    - `reason: 'deleted' | 'not-found' | 'invalid-resource-url' | 'invalid-resource-payload' | 'relative-resource-without-document' | 'directory-not-allowed' | 'unsupported-target' | 'delete-failed'`
    - `path: string | null`
  - `delete-failed` 表示主进程已经吸收底层文件系统异常并标准化返回，禁止直接把原始异常抛给 renderer
  - 为兼容当前业务，renderer / 编辑层必须继续基于结构化 `reason` 决定是否执行 Markdown 清理：
    - `deleted`：删除文件并清理 Markdown
    - `not-found` / `invalid-resource-url` / `invalid-resource-payload` / `relative-resource-without-document` / `directory-not-allowed` / `unsupported-target`：允许仅清理 Markdown，并向用户展示对应提示
    - `delete-failed`：禁止清理 Markdown，保留原文并提示删除失败

- `resource.get-info`
  - 输入 payload 固定为 `{ resourceUrl: string }`
  - 返回结构固定为：
    - `ok: boolean`
    - `reason: 'resolved' | 'invalid-resource-url' | 'invalid-resource-payload' | 'relative-resource-without-document' | 'info-failed'`
    - `decodedPath: string | null`
    - `exists: boolean`
    - `isDirectory: boolean`
    - `isFile: boolean`
    - `path: string | null`
  - `info-failed` 表示主进程已经吸收底层解析 / stat 异常并标准化返回，禁止直接把原始异常抛给 renderer

这样定义后，资源能力不再只是验收清单，而是明确挂接到新的模块边界上。

### 10.4 最近文件与资源辅助查询边界

最近文件与资源 helper 的归属也必须明确：

- recent 相关 side effect
  - recent 列表项结构固定为：
    - `name: string`
    - `path: string`
  - `recent.get-list` 返回完整 recent 列表数组，返回 schema 与 `window.effect.recent-list-changed` 完全一致
  - `recent.add`：打开现有文件成功后执行；未命名草稿首次保存成功后执行
  - `recent.remove`：用户显式移除最近文件时执行，payload 固定为 `{ path: string }`
  - `recent.clear`：用户显式清空最近文件时执行，无 payload
  - `recent.remove` 与 `recent.clear` 都必须是幂等命令：
    - 目标路径不存在于 recent 列表时，`recent.remove` 也必须安全返回
    - recent 已为空时，`recent.clear` 也必须安全返回
  - recent 文件不存在时，只有用户显式触发 `recent.remove` 或 `recent.clear` 才允许修改列表；`document.open-recent` 失败不能隐式清理 recent
  - `documentEffectService` 负责调用 recent service 完成 add / remove / clear
  - `windowSessionBridge` 只负责通过 `window.effect.recent-list-changed` 统一广播展示层更新；只有 recent 列表内容实际变化时才广播
  - `window.effect.recent-list-changed` 的 payload 为完整 recent 列表数组，renderer 不需要再次查询

- 资源辅助查询接口
  - `resource.get-info`
  - `resource.get-comparable-key`

这两类 helper 不进入 `DocumentSessionSnapshot` 主体，而是保留为资源服务的查询接口。原因是它们是按需查询的辅助能力，不属于当前文档视图的主状态投影。

接口语义固定为：

- `resource.get-info`：异步查询
- `resource.get-comparable-key`：同步查询，仅在本次重构中为兼容现有编辑区同步引用统计流程而保留
- `resource.get-comparable-key` 输入 payload 固定为 `{ rawPath: string }`
- `resource.get-comparable-key` 返回 `string | null`
- `resource.get-comparable-key` 必须保持当前兼容语义：
  - 对本地绝对路径、以及可按当前文档路径解析的相对路径，返回稳定的 `wj-local-file:` comparable key
  - 对 Windows 盘符路径执行大小写归一
  - 对锚点、协议相对路径、非本地 scheme 返回 `null`
  - 对不含 query / hash 的本地路径，即便目标文件当前不存在，也要返回可比较 key，以兼容当前引用计数与批量清理逻辑

## 11. 迁移策略

本次迁移分阶段进行，避免一次性翻转所有逻辑。

### 阶段 1：引入会话模型

- 引入 `DocumentSession` 与 `documentSessionStore`
- 引入草稿创建、路径打开、最近文件打开等会话生命周期入口
- 当前仍保持单窗口单激活文档
- 让窗口通过桥访问会话，而不是直接操作 `winInfo`

### 阶段 2：保存链路迁移

- 将 `save`、`autoSave`、`close before save` 收口到 `saveCoordinator`
- 保持现有用户行为不变
- 以现有测试为回归护栏

### 阶段 3：监听链路迁移

- 将 `fileWatchUtil` 与会话解耦
- 引入 `watchCoordinator`
- 外部修改、文件缺失、文件恢复统一走命令流

### 阶段 4：IPC 与窗口桥收敛

- 收敛前端事件与主进程消息投影
- 前端只消费单一快照投影和一次性 UI effect，不再拼接多种局部事件
- 保证编辑页、预览页、资源相关交互不退化

## 12. 并发与竞态消除标准

以下场景必须通过设计与测试证明已被系统性处理：

- 保存中继续编辑，不会把后续编辑误标记为已保存
- 手动保存、自动保存、关闭自动保存同时触发，不会并发写同一路径
- 强制关闭后，迟到的保存成功/监听回调不会污染状态
- 旧 watcher 的迟到事件不会污染新路径或新会话
- 外部修改与内部保存同时发生时，内部回声不会误报为外部修改
- 外部修改待处理时继续编辑，不会错误清除 pending 状态
- 文件缺失、恢复、再次保存之间，不会进入半绑定中间态
- 保存副本不会改变当前文档本体会话

## 13. 测试与验收标准

### 13.1 验收总原则

本次重构的验收标准必须比“测试通过”更严格，具体要求如下：

1. 新架构需要证明竞态被收敛，而不是只是换了文件位置。
2. 原有业务功能不能发生能力回退。
3. 资源相关能力也属于验收范围，不允许因文档会话重构间接退化。
4. 每一阶段完成后，都必须在进入下一阶段前完成验证与代码评审。

### 13.2 必须覆盖的回归验证范围

- 手动保存链路
- 自动保存链路
- 首次保存未命名草稿
- 关闭未保存文档链路
- 外部修改提醒 / 应用 / 忽略
- 文件被删 / 被移走 / 恢复
- 最近文件相关能力
- 最近文件移除 / 清空 / 广播刷新
- 编辑页与预览页内容刷新
- 标题与已保存状态展示
- 本地资源在资源管理器打开
- 本地资源删除
- 本地资源删除后的 Markdown 清理
- 本地资源路径解析与错误提示
- `save-other` 保存副本

### 13.3 测试层次

至少包括以下两层：

- 单元测试
  - `DocumentSession` 状态收敛
  - `saveCoordinator` 并发与快照逻辑
  - `watchCoordinator` 监听绑定、内部回声抑制、缺失/恢复处理

- 集成测试
  - 窗口关闭链路
  - IPC 命令到主进程会话再到渲染层投影的关键路径
  - 资源相关业务回归

## 14. 实施流程要求

以下要求不是建议，而是本次开发必须遵守的流程规则。

### 14.1 分支要求

- 本次开发必须在独立功能分支上进行。
- 当前分支固定为：`feature/document-session-save-refactor`

### 14.2 subagent 使用要求

- 当任务边界清晰、写入范围互不冲突、且能并行推进时，应使用 subagent。
- subagent 更适合承担：
  - 独立测试补充
  - 独立模块迁移
  - 独立审阅任务
- subagent 不能被仅因为执行时间较长而中断。
- 如果 subagent 偏离任务目标，可以调整任务或中断并重派。

### 14.3 阶段性验证与代码评审要求

每完成一个“非只读任务”后，必须执行以下动作，全部完成后才能进入下一个任务：

1. 执行该任务对应的自动化测试
2. 执行必要的手动验证
3. 发起代码评审
4. 修复评审发现的问题
5. 再次运行测试确认

这里的“非只读任务”包括但不限于：

- 新增或修改主进程逻辑
- 新增或修改前端交互
- 新增或修改测试
- 调整 IPC 协议

### 14.4 最终交付报告要求

全部任务完成后，必须输出一份总结报告，至少包含：

- 实际完成的任务列表
- 架构变化概览
- 回归验证范围与结果
- 阶段性代码评审结果汇总
- 遗留风险与后续建议

## 15. 风险与控制策略

### 风险 1：迁移过程中过度耦合旧逻辑

控制策略：

- 用迁移阶段拆解工作
- 每阶段只收口一类主链路
- 让旧测试先变成护栏，再替换实现

### 风险 2：保存与监听改造影响资源相关能力

控制策略：

- 将资源相关能力明确纳入验收范围
- 把资源路径、打开、删除、提示相关用例纳入回归测试

### 风险 3：为了未来多标签而过度设计

控制策略：

- 本次只预留窗口与会话解耦边界
- 不实现未被要求的标签 UI
- 不引入 actor 模型等过重机制

## 16. 结论

本次重构采用“文档会话化”的主进程架构：

- 以 `DocumentSession` 作为状态真相
- 以命令流统一所有入口
- 以 `saveCoordinator` 消除保存竞态
- 以 `watchCoordinator` 消除监听竞态
- 以 `windowSessionBridge` 将状态投影到现有 UI

该方案在兼容现有业务能力的前提下，为未来同窗口多标签保留扩展空间，并把“每阶段验证 + 每个非只读任务后的代码评审 + 最终总结报告”固化为开发流程的一部分。
