# document-session 时间与 jobId 参数收口设计

## 背景

`wj-markdown-editor-electron/src/util/document-session/` 当前存在一批“生产环境恒定、测试中可注入”的构造参数，例如：

- `createSaveCoordinator({ createJobId, now })`
- `createWatchCoordinator({ now })`
- `createDocumentCommandService({ now })`
- `createDocumentSessionRuntime({ now, createJobId })`

这些参数在生产代码中的实际传值始终一致：

- `createJobId` 最终都等价于 `commonUtil.createId()`
- `now` 最终都等价于 `Date.now()`

因此当前实现出现了两类问题：

1. 组合根与调用链需要反复透传相同依赖，接口噪音偏大
2. 读代码时很难区分“真正的可替换协作者”与“只是为了测试暴露的实现细节”

此外，`documentSessionFactory` 中的 `now` 也表现为同样的统一值输入，调用方基本都直接传 `Date.now()`。

## 目标

- 将 `document-session` 中统一值的 `createJobId` / `now` 收回模块内部，减少无意义透传
- 统一 `save job` 与 `copy save job` 的 id 生成方式，直接使用 `commonUtil.createId()`
- 统一需要当前时间的位置，直接使用 `Date.now()`
- 保持现有行为、状态机语义与测试覆盖不变

## 非目标

- 不调整 `store`、`effectService`、`commandRunner` 等真实协作者注入方式
- 不改变保存、关闭、外部变更、recent、资源命令的业务语义
- 不把本次清理扩展到 `document-session` 目录之外的其它模块

## 设计决策

### 1. `jobId` 不使用时间戳，统一收口到 `commonUtil.createId()`

`saveCoordinator` 中的 `jobId` 是保存结果回流的精确匹配键，不能退化为 `Date.now()` 这种可能同毫秒碰撞的值。

终态要求：

- `saveCoordinator` 内部直接依赖 `commonUtil.createId()`
- `documentSessionRuntime` 与 `windowLifecycleService` 不再向下透传 `createJobId`

### 2. 协调器与服务层的“当前时间”直接使用 `Date.now()`

以下位置的 `now` 仅用于获取当前时间戳，不承担业务输入语义：

- `saveCoordinator`
- `watchCoordinator`
- `documentCommandService`
- `documentSessionRuntime`

这些模块改为内部直接调用 `Date.now()`，调用方不再传参。

### 3. `documentSessionFactory` 一并收口 `now`

虽然 `documentSessionFactory` 的 `now` 更接近“初始化观测时间”，但当前调用方和测试同样几乎全部传固定时间或 `Date.now()`。为了让 `document-session` 目录风格一致，本次一并收口：

- `createDraftSession({ sessionId })`
- `createBoundFileSession({ sessionId, path, content, stat })`
- `createRecentMissingSession({ sessionId, missingPath })`

工厂内部通过 `Date.now()` 生成初始化时间。

## 影响范围

需要修改的核心文件：

- `wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js`
- `wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js`
- `wj-markdown-editor-electron/src/util/document-session/documentCommandService.js`
- `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- `wj-markdown-editor-electron/src/util/document-session/documentSessionFactory.js`
- `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`

需要同步调整的测试文件：

- `wj-markdown-editor-electron/src/util/document-session/__tests__/saveCoordinator.test.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/watchCoordinator.test.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandService.test.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionFactory.test.js`
- 其它直接依赖旧构造参数的 `document-session` 相关测试

## 验证策略

- 先修改测试，让测试不再依赖构造参数注入固定 `now` / `createJobId`
- 对时间相关断言，改用 `vi.useFakeTimers()` 固定 `Date.now()`
- 对 `jobId` 相关断言，改为 mock `commonUtil.createId()` 或使用宽松匹配
- 运行 `document-session` 相关测试，确认保存、watch、session 工厂行为无回归
- 按包执行 ESLint 定点格式化
