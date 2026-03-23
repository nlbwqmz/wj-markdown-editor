# Setting Config Draft Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复设置页目录选择取消导致本地配置草稿污染的问题，并在配置提交失败时回滚本地草稿。

**Architecture:** 新增一个纯函数配置草稿工具模块，收口“目录选择结果过滤”和“提交失败回滚草稿”逻辑；`SettingView` 只负责接线。这样能用现有 `node:test` 做 TDD，同时把类似问题限制在一个小工具内。

**Tech Stack:** Vue 3、node:test、现有 `configUpdateSubmissionGuard`

---

### Task 1: 设置页配置草稿防脏化

**Files:**
- Create: `wj-markdown-editor-web/src/util/config/settingConfigDraftUtil.js`
- Create: `wj-markdown-editor-web/src/util/config/__tests__/settingConfigDraftUtil.test.js`
- Modify: `wj-markdown-editor-web/src/views/SettingView.vue`

- [ ] **Step 1: 写失败测试**

覆盖：

- 目录选择取消时不应覆盖字符串字段
- 配置提交失败时应回滚到 store.config，并标记下一次同步忽略

- [ ] **Step 2: 运行测试确认红灯**

Run: `npm run test:run -- src/util/config/__tests__/settingConfigDraftUtil.test.js`

- [ ] **Step 3: 写最小实现**

新增纯函数工具并在 `SettingView.vue` 接线：

- 目录选择只接受字符串结果
- 配置提交失败时回滚本地草稿

- [ ] **Step 4: 运行测试确认绿灯**

Run: `npm run test:run -- src/util/config/__tests__/settingConfigDraftUtil.test.js`

- [ ] **Step 5: 按文件执行 ESLint**

Run: `npx eslint --fix src/util/config/settingConfigDraftUtil.js src/util/config/__tests__/settingConfigDraftUtil.test.js src/views/SettingView.vue`

- [ ] **Step 6: 执行最终验证**

Run: `npm run test:run -- src/util/config/__tests__/configUpdateResultUtil.test.js src/util/config/__tests__/settingConfigDraftUtil.test.js`
