# document-session runtime 清理重构设计

## 1. 背景

当前 Electron 侧的文档会话链路已经在向 `document-session` 架构收口，但核心编排仍集中在 [`wj-markdown-editor-electron/src/util/win/winInfoUtil.js`](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/winInfoUtil.js) 中。该文件同时承担了以下职责：

- 应用级运行时单例组装
- 窗口注册表与窗口生命周期管理
- 文档命令分发与 effect 执行
- 外部文件监听桥接与重绑
- 兼容旧字段、旧入口、旧消息的 facade
- 资源命令与部分 UI 命令路由

这导致当前代码存在以下问题：

- 单文件职责过载，阅读时需要同时理解 Electron 窗口、文档状态机、文件监听和兼容逻辑
- 兼容层与正式架构交织，难以辨认“当前真相”与“历史补丁”
- `ipcMainUtil`、`main.js`、renderer 与 `winInfoUtil` 之间形成多层间接调用，真实数据流不清晰
- 旧命令、旧字段和旧事件仍然残留，使代码无法彻底按新架构收口

本次重构目标是在 **不改变现有用户可见功能** 的前提下，移除 `document-session` 这条链路上的兼容层，建立清晰、单一、可测试的运行时边界。

## 2. 目标

### 2.1 主要目标

- 将 `document-session` 相关运行时从 `winInfoUtil.js` 中拆出，形成清晰模块边界
- 删除当前链路中不再符合架构的 compat / legacy 逻辑
- 统一 renderer -> main 的命令契约
- 统一 main -> renderer 的状态推送契约
- 通过测试基线与回归验证保证功能一致

### 2.2 非目标

- 不顺手重构与 `document-session` 无关的窗口模块
- 不修改产品功能、交互文案和业务规则
- 不为了“绝对纯净”扩大到整个仓库的所有旧接口

## 3. 约束

### 3.1 功能约束

- 重构后用户可见行为必须与当前版本保持一致
- 保存、关闭、外部文件变更、打开路径、recent、资源操作等主链路行为不得发生语义漂移

### 3.2 开发流程约束

- 在当前分支 `feature/document-session-save-refactor` 上完成开发
- 采用“先补行为基线测试，再重构”的方式推进
- 每个任务完成后必须先进行代码评审
- 只有在代码评审确认无问题后，才允许开始下一个任务
- 最终合并前不得保留本次链路中的临时兼容壳作为长期状态

### 3.3 架构约束

- `session`/`snapshot` 是文档状态唯一真相
- `commandService` 只负责状态推进与 effect 产出，不直接触碰外部世界
- `effectService` 只负责副作用执行与命令回流，不直接保存状态真相
- IPC 层只做路由，不做业务裁决

## 4. 终态架构

### 4.1 总体结构

重构后的文档会话链路按以下分层收口：

- `main.js`
  - 应用启动
  - 初始化 runtime
  - 启动时打开文件 / second-instance 请求接入
- `ipcMainUtil.js`
  - 根据窗口路由命令到 runtime
  - 不再承载业务语义翻译和兼容入口
- `documentSessionRuntime`
  - 统一组合根
  - 统一命令执行入口
  - 对外暴露只读查询与少量高层 API
- `documentCommandService`
  - 文档状态推进
- `documentEffectService`
  - 副作用执行
- `externalWatchBridge`
  - 文件监听桥接
- `windowLifecycleService`
  - BrowserWindow 生命周期接线
- `windowRegistry`
  - 窗口注册表

### 4.2 单一真相

以下对象只允许各自承担固定职责：

- `documentSessionStore`
  - 保存 session 真相
- `deriveDocumentSnapshot`
  - 派生 renderer 消费的只读快照
- `windowSessionBridge`
  - 把 snapshot / message / recent list 投影给 renderer

不再允许：

- 继续在 `winInfo` 上保存与 session 并行的文档状态镜像
- 通过 legacy helper 直接改 session 后再补发旁路事件
- 通过 compat facade 对旧调用方“补洞”

## 5. 模块拆分设计

### 5.1 `documentSessionRuntime.js`

职责：

- 创建并持有 `store`
- 创建并持有 `saveCoordinator`
- 创建并持有 `documentCommandService`
- 创建并持有 `documentEffectService`
- 创建并持有 `windowSessionBridge`
- 创建并持有 `documentResourceService`
- 暴露统一入口，例如：
  - `dispatch(windowId, command, payload)`
  - `executeUiCommand(windowId, command, payload)`
  - `getSessionSnapshot(windowId)`
  - `getDocumentContext(windowId)`

约束：

- 它是本链路唯一组合根
- `createDocumentCommandService({ store, saveCoordinator })` 仍保留显式依赖注入
- 不允许把 `store`、`saveCoordinator` 重新藏回命令服务内部

### 5.2 `windowRegistry.js`

职责：

- 管理 `windowId <-> BrowserWindow <-> sessionId` 映射
- 查询当前窗口实例
- 获取全部有效窗口

约束：

- 只保留真正属于窗口注册表的数据
- 不再混入文档保存态、兼容路径、legacy watcher pending 等文档领域数据

### 5.3 `documentCommandRunner.js`

职责：

- 执行统一链路：
  - 命令分发
  - snapshot 收敛
  - snapshot 广播
  - effect 执行
- 作为 `commandService` 与 `effectService` 之间的编排器

约束：

- 所有文档命令都必须走这条链路
- 不允许某些调用方跳过 runner 直接写状态或直接发消息

### 5.4 `externalWatchBridge.js`

职责：

- 启动/停止文件监听
- 把 watcher 回调标准化成统一命令
- 处理重绑
- 标记内部保存，避免刚写盘又被识别成外部修改

约束：

- watcher 只通过统一命令流推进状态
- 不允许直接改 session
- 不允许直接发 renderer 事件
- 不允许保留 legacy watcher 补洞逻辑

### 5.5 `windowLifecycleService.js`

职责：

- 创建 `BrowserWindow`
- 绑定窗口生命周期事件
- 接线 `ready-to-show`、`maximize`、`blur`、`close`、`setWindowOpenHandler`
- 在窗口关闭时协调 runtime 与 registry 清理

约束：

- 只处理窗口生命周期，不直接持有文档状态机
- 关闭流程的语义裁决仍由命令系统负责

### 5.6 `winInfoUtil.js` 终态

终态要求：

- 删除 `winInfoUtil.js`

原因：

- 文件名已经无法准确表达职责
- 继续保留会让后续维护者误判架构中心
- 这次重构的目标不是“换壳”，而是“真正收口”

## 6. 统一命令与事件契约

### 6.1 Renderer -> Main 正式命令

保留以下正式命令：

- `document.edit`
- `document.save`
- `document.save-copy`
- `document.request-open-dialog`
- `document.open-path`
- `document.cancel-close`
- `document.confirm-force-close`
- `document.external.apply`
- `document.external.ignore`
- `recent.get-list`
- `recent.remove`
- `recent.clear`
- `document.resource.open-in-folder`
- `document.resource.delete-local`
- `resource.get-info`
- `resource.get-comparable-key`

### 6.2 Main -> Renderer 正式事件

只保留以下 3 类推送：

- `document.snapshot.changed`
- `window.effect.message`
- `window.effect.recent-list-changed`

所有持久状态都必须从 `snapshot` 派生，不再单独发“已保存/未保存/关闭确认/外部变更”等旁路状态事件。

### 6.3 必删兼容入口

以下内容在本次重构完成时必须删除：

- `file-content-update`
- `unsaved` 推送依赖
- `winInfo.path` compat accessor
- `pendingCompatSavePath`
- 资源命令旧别名
- session 路径上的 legacy message 补发
- legacy external watch 补洞链路

## 7. 数据流设计

### 7.1 文档命令主链路

统一执行顺序：

1. renderer 发送正式命令
2. IPC 层定位当前窗口
3. runtime 调用 `commandRunner`
4. `commandService.dispatch`
5. 回写 `store`
6. 重新推导 `snapshot`
7. 如 snapshot 变化，则广播 `document.snapshot.changed`
8. 顺序执行 `effects`
9. 如有一次性提示或 recent 刷新，则通过 `windowSessionBridge` 广播

### 7.2 外部文件监听链路

统一执行顺序：

1. `externalWatchBridge` 接收底层 watcher 回调
2. 标准化成 `watch.*` 命令
3. 经 `commandRunner` 进入统一命令流
4. 由 `watchCoordinator` 推进状态
5. 由 `effectService` 执行重绑或提示等副作用

### 7.3 打开文件链路

以下入口必须共享统一 opening policy：

- 启动参数打开
- second-instance 打开
- 手动选择文件打开
- `document.open-path`
- recent 打开

不允许存在某个入口直接绕过路径校验、窗口复用或 regular file 校验。

## 8. 迁移策略

### 8.1 总体策略

采用“测试先行、分层替换、最后删除兼容层”的顺序：

1. 先补行为基线测试
2. 引入新 runtime 与新模块边界
3. 迁移 Electron 入口到新 runtime
4. 迁移 web 端到正式命令契约
5. 使旧兼容入口变为内部不可达
6. 删除 compat / legacy 代码
7. 执行完整自动化测试与关键手工回归

### 8.2 中间态原则

- 允许在中间提交中存在迁移过渡代码
- 但过渡代码只为迁移服务，不能作为终态保留
- 进入下一个任务前，必须确认上一个任务已无新增兼容债务

## 9. 测试与验证策略

### 9.1 基线测试范围

重构前补齐并冻结以下行为：

- `save`
- `save-copy`
- `close`
- `external watch`
- `open-path`
- `recent`
- `resource`
- `snapshot/message/recent` 推送顺序

### 9.2 测试迁移原则

当前压在 `winInfoUtil.test.js` 的集成语义，重构后要迁移到更符合职责的新测试中：

- `documentSessionRuntime.test.js`
- `documentCommandRunner.test.js`
- `windowLifecycleService.test.js`
- `externalWatchBridge.test.js`
- `ipcMainUtil.test.js`
- web 端 `document-session` 命令与 snapshot 消费测试

### 9.3 反向断言

必须显式验证以下旧入口已不存在：

- 无 `file-content-update` 路由
- 无 `unsaved` 推送依赖
- 无 `winInfo.path` 兼容访问
- 无资源命令旧别名
- 无 legacy message 补发

### 9.4 手工回归场景

自动化通过后，至少执行以下手工回归：

- 新建草稿并首次保存
- 编辑已有文件并手动保存
- 自动保存与关闭确认
- 外部修改后的应用与忽略
- recent 打开与 recent 缺失处理
- 预览区资源打开与删除

## 10. 完成判定

满足以下条件才视为本次重构完成：

- `winInfoUtil.js` 已删除
- `document-session` 链路兼容层已删除
- renderer 与 Electron 只保留一套正式命令/事件契约
- 自动化测试全部通过
- 关键手工回归通过
- 每个任务均完成“实现 -> 代码评审 -> 修正/确认 -> 下一任务”的闸口流程

## 11. 风险

主要风险：

- 保存链路与关闭链路交错时的时序回归
- watcher 重绑与迟到事件过滤回归
- startup / recent / open-path 多入口收口时的路径校验偏差
- 删除兼容层后 web 端遗漏旧事件依赖

对应策略：

- 先补基线测试
- 逐任务推进并在任务间做代码评审
- 每删除一类兼容入口都补充反向断言
- 用手工回归验证 Electron 真环境行为

