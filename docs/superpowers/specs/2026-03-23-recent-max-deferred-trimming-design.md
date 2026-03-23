# recentMax 延迟收敛设计

## 背景

当前 Electron 端在更新 `recentMax` 时，会在配置写盘链路中同步调用 recent 模块的 `setMax()`，立即裁剪运行期 `recent` 数组并改写 `recent.json`。

这种实现与本次期望的产品语义不一致：

1. 用户修改“最近历史数量”时，只是修改上限配置，不应立刻改变当前 recent 列表。
2. recent 列表的收敛应当发生在“recent 列表下一次真实更新”或“应用启动加载 recent”时。
3. 配置写盘与 recent 写盘被绑在同一条事务链路中，会放大失败回滚复杂度。

## 目标

1. 更新 `recentMax` 时，只写配置，不立即裁剪当前 `recent` 内存态。
2. 更新 `recentMax` 时，不立即改写 `recent.json`。
3. 应用启动时，如果 `recent.json` 超过当前配置上限，允许在初始化阶段统一收敛并回写。
4. 后续 recent 列表发生真实更新时，按最新 `recentMax` 统一收敛。
5. 保持现有 IPC 契约不变，不新增用户可见文案。

## 非目标

1. 本次不调整设置页 `a-input-number` 的提交流程。
2. 本次不修改 recent 列表的展示结构。
3. 本次不重构 renderer 侧设置页监听逻辑。

## 方案选择

本次采用“更新上限”和“裁剪列表”拆分的方案。

### 不采用的方案

#### 方案 2：保留事务结构，但让 `setMax()` 只改上限

这个方案虽然改动面较小，但 `setMax()` 的命名会和行为脱节，后续维护者仍然会误以为该接口会同步收敛列表，不利于理解。

#### 方案 3：让 recent 模块在每次操作时动态读取配置

这个方案会让 recent 模块反向依赖 config 模块，耦合更深，不符合当前配置分层收口方向。

## 设计

### 1. `configService` 调整

`setConfigWithRecentMax()` 改为：

1. 构造并校验 `nextConfig`
2. 先写 `config.json`
3. 写成功后更新配置内存态并广播配置
4. 再通知 recent 模块更新运行期 `maxSize`

这里 recent 模块只接收“运行期上限已变更”的信号，不在这个阶段改动 recent 列表，也不写 `recent.json`。

### 2. recent 模块职责调整

recent 模块新增统一的“规范化并按上限裁剪”辅助逻辑，用于以下两个入口：

1. `initRecent(max, callback)`：启动时读取 `recent.json` 后执行一次规范化与裁剪，必要时回写磁盘。
2. `addInternal(filePath)`：后续有新 recent 项加入时，按当前 `maxSize` 统一裁剪。

`removeInternal()` 和 `clearInternal()` 本身就是列表真实更新，但它们天然只会减少列表长度，不需要额外的上限裁剪逻辑。

### 3. `setMax()` 语义调整

recent 模块对外保留 `setMax()`，但其语义改为：

1. 仅更新运行期 `maxSize`
2. 不修改 `recent` 内存数组
3. 不写 `recent.json`
4. 默认不广播 recent 更新

这样可以保持调用方接口基本稳定，同时让行为符合“延迟收敛”的新语义。

### 4. 收敛时机

#### 启动时

如果 `recent.json` 中保存了 20 条记录，而当前配置 `recentMax = 5`，那么应用启动加载 recent 时，会把 recent 收敛到前 5 条，并把收敛后的结果回写到 `recent.json`。

#### 后续 recent 更新时

如果用户把 `recentMax` 从 20 改成 5，但当前会话 recent 仍保留 20 条，那么：

1. 设置保存成功后，当前 recent 列表保持不变。
2. 当用户后续再次打开新文件触发 `recent.add()` 时，recent 模块会基于最新 `maxSize = 5` 对新列表统一收敛。

## 影响范围

### 直接修改文件

1. `wj-markdown-editor-electron/src/data/config/configService.js`
2. `wj-markdown-editor-electron/src/data/recent.js`
3. `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js`
4. `wj-markdown-editor-electron/src/data/recent.test.js`

### 兼容性说明

1. `user-update-config` IPC 事件名保持不变。
2. `recent.setMax()` 调用点可以保留，但不再承担即时裁剪语义。
3. 旧的 `recent.json` 文件不需要迁移；仅在启动或后续 recent 更新时按新规则收敛。

## 测试策略

### `configService` 侧

增加失败测试与成功测试，覆盖：

1. 更新 `recentMax` 成功时，配置成功写盘并更新配置内存态。
2. 更新 `recentMax` 成功时，不立即裁剪 recent 列表，也不触发 recent 列表广播。
3. 配置写盘失败时，不应把 recent 状态推进到新上限对应的裁剪结果。

### recent 模块侧

增加行为测试，覆盖：

1. `initRecent()` 在磁盘 recent 超过上限时会统一收敛并回写。
2. `setMax()` 只更新运行期上限，不立即修改 `recent` 内存态和磁盘态。
3. 在 `setMax()` 之后下一次 `add()` 时，会按新上限统一收敛。

## 风险与规避

### 风险 1：`setMax()` 名称与行为直觉不完全一致

规避方式：

1. 在 recent 模块内部补充中文注释，明确它只同步运行期上限。
2. 用测试锁定“不会立即裁剪”的新语义。

### 风险 2：当前会话 recent 列表会短暂超过最新上限

这是本次需求要求的既定行为，不视为缺陷。系统只保证在“下一次 recent 更新”或“下次启动”时完成收敛。

## 验证标准

满足以下条件即可认为本次变更完成：

1. 设置页修改 `recentMax` 后，当前 recent 列表不立即变化。
2. 设置页修改 `recentMax` 后，不会立即改写 `recent.json`。
3. 重启应用后，recent 列表会按最新 `recentMax` 收敛。
4. 不重启应用的情况下，后续触发 recent 新增时也会按最新 `recentMax` 收敛。
