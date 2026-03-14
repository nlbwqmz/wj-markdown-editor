# 文档会话化保存与监听重构设计

> 状态：已完成设计评审前版本
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
   执行真实副作用，例如写文件、读文件、重绑 watcher、发送系统通知、向渲染端发投影事件。

7. `windowSessionBridge`
   负责将当前激活会话投影到窗口标题、保存态、外部修改弹窗、消息提示等 UI 表现。

### 4.2 责任边界

新的责任边界必须满足：

- 会话负责业务真相
- 协调器负责并发和时序控制
- 副作用服务负责执行，不负责定策略
- 窗口桥负责展示，不负责推导真相
- 渲染层负责输入和展示，不负责最终状态判断

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

### 5.3 持久化基线 `persistedSnapshot`

- `content`
- `revision`
- `savedAt`
- `path`

它表示“当前主进程认定的持久化基线”。保存态统一由 `editorSnapshot` 与 `persistedSnapshot` 对比推导。

### 5.4 保存运行态 `saveRuntime`

- `status`
- `inFlightJobId`
- `inFlightRevision`
- `requestedRevision`
- `trigger`
- `lastError`

它只描述保存管线，不是业务真相。

### 5.5 外部变更运行态 `externalRuntime`

- `pendingChange`
- `resolutionState`
- `lastHandledVersionHash`
- `lastKnownDiskVersionHash`

它负责承载“外部修改待处理”这一独立业务，不允许被普通编辑动作顺手覆盖。

### 5.6 监听运行态 `watchRuntime`

- `bindingToken`
- `watchingPath`
- `watchingDirectoryPath`
- `fileExists`
- `recentInternalWrites`
- `lastError`

监听状态从业务态中拆出，由协调器维护。

### 5.7 关闭运行态 `closeRuntime`

- `intent`
- `waitingSaveJobId`
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

## 6. 命令模型

### 6.1 用户命令

- `document.edit`
- `document.save`
- `document.save-copy`
- `document.request-close`
- `document.confirm-force-close`
- `document.external.apply`
- `document.external.ignore`

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
- `watch.bound`
- `watch.unbound`
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
7. 收敛后由窗口桥向渲染层发送最新投影

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

写盘成功后，只允许用“本次成功快照”更新 `persistedSnapshot`。

不能直接把当前最新 `editorSnapshot.content` 覆盖成已保存内容，否则会误把保存期间新增的编辑也标记成已保存。

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

## 8. 监听协调器设计

### 8.1 监听抽象

`watchCoordinator` 只负责把底层监听适配成统一事件，不直接改会话真相。

无论底层仍然复用当前目录级共享 watcher，还是未来替换实现，上层只看到：

- `watch.file-changed`
- `watch.file-missing`
- `watch.file-restored`
- `watch.error`

### 8.2 绑定令牌隔离

每次会话切路径、首次保存绑定路径、窗口解绑、会话关闭时，监听绑定都生成新的 `bindingToken`。

任何迟到事件只要 token 不匹配，必须直接丢弃，避免：

- 旧路径 watcher 污染新路径
- 关闭后迟到回调污染会话
- 未来多标签切换 active session 时旧订阅继续生效

### 8.3 内部保存回声抑制

内部保存回声抑制统一收口到 `watchCoordinator`：

- 保存前记录写盘内容指纹
- 保存后保留短时间窗口内的最近内部写盘指纹
- watcher 收到文件变化时先匹配内部指纹
- 命中则视为内部保存回声，直接忽略

不能让 watcher 直接参与“是否属于外部修改”的业务判断。

### 8.4 外部修改处理规则

外部修改事件进入会话后，固定按以下顺序处理：

1. 先更新“磁盘真实值”基线
2. 立即重算保存态
3. 若差异自然消失，则直接收敛结束
4. 若仍有差异，则按策略分为：
   - 自动应用
   - 提醒用户

提醒模式下，`pendingExternalChange` 必须作为独立状态保留，直到：

- 用户明确应用
- 用户明确忽略
- 后续收敛时发现差异已经消失

普通编辑动作不能直接清除它。

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

### 9.2 IPC 契约

IPC 会统一整理为三类：

- 命令类
  - `document.edit`
  - `document.save`
  - `document.save-copy`
  - `document.request-close`
  - `document.external.apply`
  - `document.external.ignore`

- 查询类
  - `document.get-session-snapshot`

- 推送类
  - `document.snapshot.changed`
  - `document.effect.message`
  - `document.effect.external-change`

### 9.3 UI 兼容要求

虽然内部事件模型会收敛，但外部表现必须保持兼容：

- 标题栏保存态展示保持可用
- 外部修改弹窗保持当前产品能力
- 现有编辑器和预览页的刷新体验不下降
- 消息提示语义不被削弱

## 10. 资源相关能力的兼容要求

本次重构虽然聚焦文档保存与监听，但验收范围必须覆盖依赖当前文档会话状态的资源相关能力，至少包括：

- 从编辑区或预览区对本地资源执行“在资源管理器打开”
- 打开失败时的错误提示
- 未保存文档中的相对资源打开提示
- 本地资源删除
- 删除后 Markdown 清理与后续保存
- 资源路径解析、相对路径归一化、可比较 key 计算

原因是这些能力虽然不是保存功能本身，但依赖当前文档路径、当前内容、当前保存状态、当前窗口/会话上下文。如果文档会话重构导致这些能力退化，则本次重构视为失败。

## 11. 迁移策略

本次迁移分阶段进行，避免一次性翻转所有逻辑。

### 阶段 1：引入会话模型

- 引入 `DocumentSession` 与 `documentSessionStore`
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
- 前端消费会话投影，不再拼接多种局部事件
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
