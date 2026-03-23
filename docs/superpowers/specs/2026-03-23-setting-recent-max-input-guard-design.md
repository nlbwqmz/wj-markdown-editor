# 设置页 recentMax 输入保护设计

## 背景

设置页当前使用 `a-input-number v-model:value="config.recentMax"` 直接绑定配置草稿字段。现有 Ant Design Vue 版本在用户清空输入框时，会先发出 `update:value(null)`，随后设置页的深度监听会立即提交整份配置。

由于 `recentMax` 在主进程 schema 中必须是 `0-50` 的数字，`null` 会被判为非法配置并触发草稿回滚，导致“先清空再输入新数字”的常见编辑流程被打断。

## 目标

1. `recentMax` 在设置页中始终保持为合法数字，不允许进入 `null`。
2. 用户清空输入框时，字段立即回填为 `0`。
3. 字段取值只允许 `0-50` 的整数。
4. 改动范围只限于设置页这一项输入约束，不改变整个设置页的提交机制。

## 非目标

1. 本次不修改设置页对 `config.value` 的深度监听策略。
2. 本次不改 Electron 端 `recentMax` 的配置存储语义。
3. 本次不扩展成所有数字输入框的通用适配器。

## 方案

### 1. recentMax 改为受控输入

模板中不再直接使用 `v-model:value="config.recentMax"`，改为：

1. `:value="config.recentMax"`
2. `@update:value="onRecentMaxUpdate"`

这样可以把 `a-input-number` 发出的 `null` 和越界值拦在设置页本地，不再直接污染配置草稿。

### 2. 增加 recentMax 输入规范化函数

在设置页配置草稿工具模块中新增一个纯函数，用于把输入值规范成合法的 `recentMax`：

1. `null` / `undefined` / `NaN` 统一回填为 `0`
2. 小于 `0` 的值回填为 `0`
3. 大于 `50` 的值回填为 `50`
4. 非整数按整数处理

采用纯函数的原因是：

1. 更容易使用现有 `node:test` 做 TDD
2. 避免把范围修正逻辑散落在组件内部

### 3. 组件参数补强

`a-input-number` 同时补上：

1. `:precision="0"`
2. `:step="1"`
3. 保留 `:min="0"`、`:max="50"`

这样既有组件层约束，也有业务层兜底，不依赖单一实现细节。

## 影响文件

1. `wj-markdown-editor-web/src/views/SettingView.vue`
2. `wj-markdown-editor-web/src/util/config/settingConfigDraftUtil.js`
3. `wj-markdown-editor-web/src/util/config/__tests__/settingConfigDraftUtil.test.js`

## 测试策略

### 工具函数测试

增加纯函数单测，覆盖：

1. `null` 输入回填为 `0`
2. 小于 `0` 的值被压成 `0`
3. 大于 `50` 的值被压成 `50`
4. 小数被收敛为整数
5. 合法整数保持不变

### 设置页接线验证

本次不新增组件级测试，改为通过工具函数测试 + 模板接线修改控制风险。该字段逻辑足够局部，继续维持当前测试策略即可。

## 验证标准

满足以下条件即可认为本次修复完成：

1. 用户清空 `recentMax` 输入框时，不再触发 `config-invalid` 回滚。
2. 清空输入框后字段立即显示 `0`。
3. 输入值最终只能落在 `0-50` 整数范围内。
