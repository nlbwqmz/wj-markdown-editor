# document-session 移除 winInfo facade 的纯重构设计说明

## 1. 背景

当前分支已经完成一轮 `document-session runtime boundary` 重构，运行时组合根、资源命令路由、窗口身份映射和宿主状态拆分已经初步成形，相关实现主要位于以下文件：

1. [documentSessionRuntime.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js)
2. [documentSessionRuntimeComposition.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js)
3. [windowLifecycleService.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js)
4. [windowRegistry.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/windowRegistry.js)
5. [windowHostStateStore.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/windowHostStateStore.js)

但是当前结构里仍然保留了一层 `winInfo facade` 兼容壳，用来让旧调用点继续通过“混合型窗口对象”读取或写入以下信息：

1. `windowId`
2. `BrowserWindow`
3. `sessionId`
4. `forceClose`
5. `allowImmediateClose`
6. `externalWatch`
7. `externalWatchBridge`
8. `lastClosedManualRequestCompletions`

这层 facade 在当前阶段有过渡价值，但它会继续延长旧契约：

1. 跨模块边界仍然可能把 `winInfo` 当成“公共上下文包”传来传去
2. 外围模块仍可能顺手依赖不属于自己职责的字段
3. `windowLifecycleService` 仍需要维护一套兼容 getter / setter 壳，阻碍后续继续收口边界

本次设计聚焦下一步重构：在**不影响功能和业务逻辑**的前提下，彻底移除公共 `winInfo facade` 契约。

## 2. 目标

### 2.1 总目标

在 Electron 侧 `document-session` 模块中，完成“移除 `winInfo facade` 公共契约”的纯重构，使最终跨模块边界只传显式依赖，不再暴露兼容壳对象。

### 2.2 必须同时满足的目标

1. 最终产物中不再存在对外暴露的 `winInfo facade`
2. 本次任务仅为代码重构，不得影响任何功能和业务逻辑
3. renderer、IPC、协议层、窗口行为和提示语义保持不变
4. 每一步迁移都可以通过测试和固定 smoke checklist 证明“结果不变”

## 3. 非目标

本次设计**明确不做**以下事情：

1. 不调整保存、另存为、关闭确认、强制关闭、recent、资源删除、资源打开、外部文件变更处理的业务规则
2. 不修改 renderer 可见事件名、IPC 事件名、runtime 命令名、payload 结构、返回结构
3. 不修改提示文案 key、提示触发时机、effect 类型、错误 reason、同步或异步语义
4. 不顺手做性能优化、异步化改造、文案整理、错误码整理
5. 不把 `windowRegistry` 或 `hostStateStore` 扩展为新的“万能上下文”
6. 不用新的大对象替代 `winInfo facade`

## 4. 约束与成功标准

### 4.1 纯重构硬约束

以下任一项发生变化，都不再视为“纯重构”：

1. IPC 事件名变化
2. IPC 返回结构变化
3. runtime 命令名变化
4. effect 类型变化
5. renderer 可见消息 key 或触发时机变化
6. 协议层相对路径解析语义变化
7. `resource.get-comparable-key` 从同步查询变成异步，或 sender 缺失时不再返回 `null`
8. 任意状态机分支条件变化

### 4.2 最终成功标准

最终完成时必须同时满足：

1. 生产代码跨模块边界上不再传递 `winInfo`
2. [windowLifecycleService.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js) 不再导出 `getWinInfo`、`getAll`、`getByWebContentsId`
3. `windowInfoFacadeMap`、`createWindowInfoFacade`、`ensureWindowInfoFacade` 等兼容壳实现被删除
4. Electron 侧所有消费者改为使用显式查询接口或显式参数对象
5. Electron 包全量测试通过
6. 固定 smoke checklist 全部通过
7. 任何跨模块导出的对象都不得同时暴露以下三类信息中的两类以上：
   - `BrowserWindow`
   - `windowId` / `sessionId`
   - 宿主可变状态，如 `forceClose`、`allowImmediateClose`、`externalWatch`
8. 生产代码中不得再存在以“窗口上下文包”形式跨模块传递旧混合语义的参数或返回值
9. repo 级静态检查必须能证明：
   - 旧符号名 `getWinInfo`、`getAll`、`getByWebContentsId` 已从生产代码消失
   - 生产代码跨模块 `winInfo` 参数或返回值已消失
   - 不存在新的等价聚合导出替代 facade

## 5. 设计决策

### 5.1 备选方案

#### 方案 A：保留 facade，逐步减少使用

优点：

1. 改动最小
2. 短期成本最低

缺点：

1. 兼容层会长期存在
2. 新代码仍可能继续依赖旧形状
3. 最终很难真正完成边界收口

结论：不采用。

#### 方案 B：使用显式窄接口，分阶段迁移，最后删除 facade

优点：

1. 最终没有兼容层
2. 迁移可以拆成小步，每一步都能验证行为不变
3. 每个模块只依赖自己真正需要的数据

缺点：

1. 需要先补齐替代接口
2. 迁移周期更长

结论：采用。

#### 方案 C：一次性硬切，直接删除 facade

优点：

1. 结构最干净
2. 过渡期最短

缺点：

1. 单批改动过大
2. 很难证明“只是重构”
3. 关闭状态机、保存状态机、watcher 链路的回归风险最高

结论：不采用。

### 5.2 选型结论

采用**方案 B：显式窄接口 + 分阶段迁移 + 最终删除 facade**。

核心原则是：

1. 不保留公共兼容层
2. 可以保留短期迁移接口，但这些接口必须是显式、窄职责的
3. 先冻结行为，再替换边界
4. 外围模块先戒掉 `winInfo`
5. 内核最后改成 `windowId` 驱动

## 6. 目标架构

### 6.1 跨模块边界原则

最终跨模块边界统一采用：

`IDs in, explicit data out`

具体要求：

1. 需要定位窗口时，只传 `windowId`
2. 需要真实窗口对象时，只传 `BrowserWindow`
3. 需要文档信息时，只取 `documentContext`
4. 需要消息通知时，只传 `notify` 或 `publishWindowMessage`
5. 不允许传“同时包含窗口身份、宿主状态、会话关联”的混合型对象

这里对“公共 facade”做负面定义：

1. 任何对外导出的对象，如果同时携带 `BrowserWindow`、`windowId/sessionId`、宿主可变状态三类信息中的两类以上，都视为 facade
2. 任何跨模块函数，如果通过单个参数对象或返回对象打包传递上述混合语义，也视为 facade
3. 私有实现可以在模块内部临时组合 `windowRecord`，但不能 export，也不能让其他模块依赖其字段结构

### 6.2 对外保留的正式接口

以下为建议保留的对外接口形态。它们可以由 `windowLifecycleService` 或后续拆出的更窄宿主服务提供，但对外契约必须保持显式：

1. `getWindowById(windowId): BrowserWindow | null`
2. `getWindowIdByWin(win): string | null`
3. `getWindowIdByWebContentsId(webContentsId): string | null`
4. `getParentWindowIdByWebContentsId(webContentsId): string | null`
   - 输入：整数 `webContentsId`
   - 输出：该 `webContents` 所属窗口的父编辑窗口 `windowId`，不存在时返回 `null`
   - 规则：
     - 只用于协议链路或其他需要“子窗口继承父编辑窗口上下文”的场景
     - 调用方必须先尝试 `getWindowIdByWebContentsId`，只有当前窗口未注册时才回退到父窗口
     - 如果 `webContents` 不存在、窗口不存在、父窗口不存在、父窗口未注册，统一返回 `null`
   - 不允许返回 `BrowserWindow`、`winInfo` 或其他聚合上下文对象
5. `listWindows(): BrowserWindow[]`
6. `getDocumentContext(windowId)`
7. `getSessionSnapshot(windowId)`
8. `publishWindowMessage(windowId, data)`
9. `requestForceClose(windowId)`
10. `startExternalWatch(windowId, options)`
11. `stopExternalWatch(windowId)`
12. `updateTempContent(windowId, content)`

### 6.3 runtime / effect 专用宿主能力接口

为了真正替代 facade，除了外围只读查询接口，还必须补齐 runtime / effect 侧会用到的显式宿主能力。它们不是给一般外围模块使用的公共对象，而是由 `windowLifecycleService` 以显式函数形式注入给 runtime 或 effect 上下文。

建议补齐以下能力分组：

1. `closeHostController`
   - `requestForceClose(windowId)`
   - `continueWindowClose(windowId)`
   - `finalizeWindowClose(windowId)`
   - `getClosedManualRequestCompletions(windowId)`
2. `externalWatchController`
   - `start(windowId, options)`
   - `stop(windowId)`
   - `getContext(windowId)`
   - `markInternalSave(windowId, content)`
   - `settlePendingChange(windowId, versionHash)`
   - `ignorePendingChange(windowId)`
3. `windowMessageController`
   - `publishWindowMessage(windowId, data)`
   - `publishSnapshotChanged(windowId, snapshot)`

这些能力必须满足：

1. effect 和 runtime 只能通过显式动作驱动宿主行为，不能回退读写 host mutable state
2. `allowImmediateClose` 不提供公共 setter，只能由 `continueWindowClose` / `finalizeWindowClose` 这类显式动作独占写入
3. `externalWatchBridge` 不再向外暴露，只允许 `externalWatchController` 在内部持有并对外提供动作接口
4. `lastClosedManualRequestCompletions` 必须通过专门的 close/save 协调能力读取，不能重新泄漏为宿主状态字段

### 6.4 旧 facade 字段迁移映射

| 旧字段 | 新 owner | 读接口 | 写接口 | 可见范围 | 所属批次 |
| --- | --- | --- | --- | --- | --- |
| `id/windowId` | `windowRegistry` | `getWindowIdByWin` / `getWindowIdByWebContentsId` | `registerWindow` / `unregisterWindow` | 对外只读 | 批次 2 |
| `win` | `windowRegistry` | `getWindowById` / `listWindows` | `registerWindow` / `unregisterWindow` | 对外只读 | 批次 2 |
| `sessionId` | `windowRegistry` | `getSessionIdByWindowId` | `bindSession` | 仅 runtime / lifecycle 内部 | 批次 5 |
| `forceClose` | `closeHostController` | `isForceClose(windowId)` 或内部 close 流程读取 | `requestForceClose(windowId)` | 写入口显式公开，读取仅内部 | 批次 4 |
| `allowImmediateClose` | `closeHostController` | `canCloseImmediately(windowId)` | `continueWindowClose(windowId)` / `finalizeWindowClose(windowId)` | 仅内部 | 批次 5 |
| `lastClosedManualRequestCompletions` | `closeHostController` / `closeCompletionCache` | `getClosedManualRequestCompletions(windowId)` | `cacheClosedManualRequestCompletions(windowId, completions)` | 仅内部 | 批次 5 |
| `externalWatch` | `externalWatchController` | `getContext(windowId)` 或专用状态快照 | `start` / `stop` / `markInternalSave` / `settlePendingChange` / `ignorePendingChange` | 仅 runtime / effect 内部 | 批次 4 |
| `externalWatchBridge` | `externalWatchController` | 不直接暴露 | 仅内部持有 | 完全私有 | 批次 4 |

说明：

1. 上表中的 `isForceClose`、`canCloseImmediately`、`cacheClosedManualRequestCompletions` 等名称是设计占位，重点是职责必须显式收口，而不是必须采用这些字面命名
2. `externalWatch` 与 `externalWatchBridge` 不允许在实现中换个名字继续以对象形式向外暴露

### 6.5 私有实现细节

以下内容可以继续存在，但只能作为模块私有实现细节，不得再作为公共契约泄漏：

1. `windowRegistry`
   - 只维护 `windowId <-> BrowserWindow`
   - 只维护 `windowId -> sessionId`
2. `hostStateStore`
   - 只保存宿主可变状态，如 `forceClose`、`allowImmediateClose`、`externalWatchBridge`
3. 私有 `windowRecord`
   - 如果 `windowLifecycleService` 内部需要组合 `win`、`hostState`、`session`，可以在内部拼装
   - 不允许 export
   - 不允许被其他模块依赖字段结构

### 6.6 明确废弃的旧接口

以下接口最终必须删除：

1. `windowLifecycleService.getWinInfo`
2. `windowLifecycleService.getAll`
3. `windowLifecycleService.getByWebContentsId`
4. 所有跨模块以 `winInfo` 为参数的公共函数

## 7. 受影响模块与目标形态

### 7.1 外围消费者

以下生产模块当前仍依赖 `winInfo` 公共形状，必须迁移：

1. [ipcMainUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js)
2. [imgUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/imgUtil.js)
3. [fileUploadUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/fileUploadUtil.js)
4. [protocolUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/protocolUtil.js)
5. [updateUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/updateUtil.js)
6. [exportUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/exportUtil.js)

### 7.2 目标参数形态示例

以下示例用于说明迁移方向，不代表本次设计要求改变任何业务逻辑：

1. `imgUtil.save({ win, documentPath, data, config, notify })`
2. `fileUploadUtil.save({ win, documentPath, filePath, config, notify })`
3. `createExportWin({ parentWindow, documentContext, type, notify })`
4. `updateUtil.checkUpdate(windows)`，其中 `windows` 为 `BrowserWindow[]`
5. `protocolUtil` 通过 `windowId -> documentContext` 完成相对路径解析，不再中转 `winInfo`

## 8. 迁移计划

### 8.1 批次 1：补行为锁定测试

目标：

1. 先冻结现有行为，再开始迁移结构
2. 只加测试，不改生产代码

重点覆盖：

1. `ipcMainUtil`
2. `protocolUtil`
3. `windowLifecycleService`
4. `documentSessionRuntime`

必须锁定的行为：

1. `document.request-close` / `document.confirm-force-close`
2. `document.save` / `document.save-copy`
3. `document.resource.open-in-folder` / `document.resource.delete-local` / `resource.get-info`
4. `resource.get-comparable-key`
5. 协议相对路径解析
6. 导出、上传、文件保存时的消息触发与返回值

### 8.2 批次 2：补显式查询接口，先迁真正低风险模块

目标：

1. 在不删除旧接口的前提下，补齐无 facade 时代的正式查询接口
2. 只迁移真正低风险、只读、无父子窗口语义的消费者

建议迁移模块：

1. [updateUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/updateUtil.js)

约束：

1. 旧接口暂时保留
2. 不改任何业务判断和返回结果

### 8.3 批次 2B：单独迁移 protocol 相关链路

目标：

1. 在批次 2 的显式查询接口稳定后，单独迁移高敏感的协议相关链路
2. 把 `protocolUtil` 对 `winInfo` 的依赖改为 `windowId -> documentContext` 与父窗口回退接口

建议迁移模块：

1. [protocolUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/protocolUtil.js)

前置条件：

1. `getWindowIdByWebContentsId` 已稳定
2. `getParentWindowIdByWebContentsId(webContentsId): string | null` 已实现并通过锁定测试
3. 协议相关锁定测试已补齐

约束：

1. `protocolUtil` 不视为“最简单外围模块”
2. 不改 `wj://` 相对路径继承语义
3. 不改导出子窗口等父子窗口场景下的资源解析结果
4. 必须统一使用“先查当前窗口，再回退父窗口”的单一路径，禁止在不同调用点各自实现父子窗口继承逻辑

### 8.4 批次 3：把工具模块改为显式参数对象

目标：

1. 移除 `imgUtil`、`fileUploadUtil`、`exportUtil` 对 `winInfo` 的依赖
2. 让 `ipcMainUtil` 改为组装显式参数，而不是传递混合对象

建议迁移模块：

1. [imgUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/imgUtil.js)
2. [fileUploadUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/fileUploadUtil.js)
3. [exportUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/win/exportUtil.js)
4. [ipcMainUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js)

约束：

1. 不改路径计算逻辑
2. 不改消息 key
3. 不改导出、上传、保存的触发时机和返回值

### 8.5 批次 4：把 runtime / effect / IPC 公共边界改成显式上下文

目标：

1. runtime 与 effect 层之间不再传 `winInfo`
2. `ipcMainUtil` 不再直接写宿主状态字段
3. runtime / effect 改为通过 `closeHostController`、`externalWatchController` 等显式能力驱动宿主行为

建议迁移模块：

1. [documentSessionRuntime.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js)
2. [documentEffectService.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentEffectService.js)
3. [windowLifecycleService.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js)
4. [ipcMainUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js)

约束：

1. 不改 runtime 命令名
2. 不改 effect 类型
3. 不改同步或异步语义
4. 不改关闭状态机和保存状态机分支条件

### 8.6 批次 5：内部统一改成 windowId 驱动，最后删除 facade

目标：

1. 把 `windowLifecycleService` 内部 helper 主参数统一收敛为 `windowId`
2. 删除 facade 实现和旧接口

必须删除的内容：

1. `windowInfoFacadeMap`
2. `createWindowInfoFacade`
3. `ensureWindowInfoFacade`
4. `getWinInfo`
5. `getAll`
6. `getByWebContentsId`

约束：

1. 只改访问方式，不改状态机逻辑
2. 如内部仍需要组合数据，只允许存在私有 `windowRecord`

## 9. 冻结的敏感行为

以下行为在整个迁移过程中必须冻结：

1. `document.request-close` 在什么条件下直接关闭、等待保存、弹未保存确认
2. `document.confirm-force-close` 何时立即返回 `close-window` effect
3. `allowImmediateClose` 何时置位
4. `forceClose` 何时由宿主入口改写
5. watcher 何时启动、停止、重绑、结算 pending change
6. recent 在关窗链路中的刷新时机
7. 打开已存在文档时的窗口复用行为
8. 资源打开、资源删除、资源比较 key 的裁决来源和返回结构
9. 导出子窗口或其他父子窗口场景下 `wj://` 相对资源继承解析
10. sender 无法映射窗口时 `resource.get-comparable-key` 同步返回 `null` 的回退语义

这些冻结点对应的核心代码主要位于：

1. [documentCommandService.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentCommandService.js)
2. [windowLifecycleService.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js)
3. [documentSessionRuntime.js](/D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js)

## 10. 验收策略

### 10.1 自动测试验收

每一批迁移都必须执行：

1. 在 `wj-markdown-editor-electron/` 目录执行 `npm run test:run`
2. 执行 `git diff --check`

通过标准：

1. Electron 包全量测试必须全部通过
2. 不允许有格式问题

### 10.2 冻结点与验收映射表

| 冻结点 | 自动化锁定 | 人工 smoke |
| --- | --- | --- |
| `document.request-close` / `document.confirm-force-close` 分支与 effect 顺序 | `windowLifecycleService` / `documentSessionRuntime` 测试 | 是 |
| `document.save` / `document.save-copy` 请求等待与消息时机 | `windowLifecycleService` 测试 | 是 |
| `forceClose` 被宿主入口改写与 `allowImmediateClose` 置位时机 | `windowLifecycleService` / `documentCommandService` 相关测试 | 是 |
| watcher 启停、重绑、pending change 结算、apply/ignore | `windowLifecycleService` / `externalWatchBridge` / `documentCommandService` 相关测试 | 是 |
| recent 在关窗链路中的刷新时机 | `windowLifecycleService` 测试 | 是 |
| 已打开文档再次打开时复用现有窗口 | `windowLifecycleService` 测试 | 是 |
| 资源打开、资源删除、资源信息查询结果 | `ipcMainUtil` / `documentSessionRuntime` / `documentResourceService` 测试 | 是 |
| `resource.get-comparable-key` 的同步空值回退 | `ipcMainUtil` / `documentSessionRuntime` 测试 | 否，由自动化锁定 |
| `wj://` 相对路径解析与父子窗口继承 | `protocolUtil` / `protocolUtil.integration` 测试 | 是 |
| 导出子窗口相关资源解析 | `protocolUtil.integration` 与导出链路测试 | 是 |
| 导出、上传、文件保存时的消息触发与返回值 | `ipcMainUtil` / `exportUtil` / `imgUtil` / `fileUploadUtil` 相关测试 | 是 |

规则：

1. `9` 节列出的每个冻结点都必须映射到至少一个自动化用例
2. 如果某项不适合人工 smoke，必须在此表中明确标注“由自动化锁定”
3. 没有映射到这张表的冻结点，视为验收标准不完整

### 10.3 固定 smoke checklist

每一批迁移后都必须执行固定 smoke checklist，不允许按批次自由变化：

1. 打开已有文档
2. 打开 recent 丢失文档
3. 未保存关闭并取消
4. 未保存关闭并强制关闭
5. 图片或文件插入并保存
6. 本地资源打开或删除
7. 外部文件修改后触发 pending change，并分别验证 apply 与 ignore
8. 已打开文档再次打开时复用现有窗口
9. 导出或子窗口场景下的相对资源解析

### 10.4 静态契约检查

每一批迁移完成后，除自动测试与 smoke 外，还必须做静态契约检查：

1. 生产代码中旧符号 `getWinInfo`、`getAll`、`getByWebContentsId` 是否仍存在
2. 生产代码跨模块 `winInfo` 参数与返回值是否仍存在
3. 是否出现新的等价“窗口上下文包”导出对象

静态检查必须至少包含以下两层，确保“删 facade”是可证明的，而不是仅靠人工判断：

1. repo 级 grep：
   - 旧符号 `getWinInfo`、`getAll`、`getByWebContentsId`
   - 跨模块 `winInfo` 参数或返回值
2. export inventory 审查：
   - 对受影响生产模块的所有 `export` 做清单审查，至少覆盖：
     - `windowLifecycleService`
     - `documentSessionRuntime`
     - `documentEffectService`
     - `ipcMainUtil`
     - `protocolUtil`
     - `updateUtil`
     - `imgUtil`
     - `fileUploadUtil`
     - `exportUtil`
   - 逐项记录每个导出函数的参数形态和返回形态
   - 任何导出一旦以对象形式同时暴露以下两类以上字段即判失败：
     - 窗口对象，如 `win`、`BrowserWindow`
     - 身份字段，如 `windowId`、`sessionId`
     - 宿主可变状态字段，如 `forceClose`、`allowImmediateClose`、`externalWatch`

这份 export inventory 可以作为 PR 检查项或设计实施 checklist 的必填项，从而形成可重复执行的静态验收口径。

### 10.5 评审判定规则

评审时按以下规则判断是否仍属于纯重构：

1. 只要 renderer 或调用方需要跟改一行业务代码，原则上就不再是纯重构
2. 只要行为性 diff 与结构性 diff 混在同一批，就必须拆开
3. 如果某一批出现 smoke 失败，不允许顺手改行为修复，必须先定位是结构改动导致的回归，再按纯重构要求重做

## 11. 最终结论

本次移除 `winInfo facade` 的最佳路径不是继续保留兼容层，也不是一次性硬切，而是：

1. 先冻结行为
2. 再补显式窄接口
3. 外围模块先迁
4. runtime / effect 公共边界再迁
5. 最后把 `windowLifecycleService` 改成 `windowId` 驱动并删除 facade

这条路径最符合当前任务的核心约束：

**整个任务必须只是代码重构，不能影响功能和业务逻辑。**
