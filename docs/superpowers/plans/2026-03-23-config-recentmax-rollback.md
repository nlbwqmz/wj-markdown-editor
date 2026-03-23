# Config RecentMax Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `recent.setMax()` 写盘失败时仍把 `user-update-config` 作为成功返回的问题，保证 `recentMax` 更新与配置更新要么同时成功，要么整体失败。

**Architecture:** 把 `recentMax` 相关副作用从 IPC 成功后的附带动作收口到配置服务层，由服务层统一处理“配置写盘、recent 裁剪写盘、失败回滚配置文本”的事务化流程。只有全部步骤成功后，才提交内存配置并广播 `update-config`。

**Tech Stack:** Electron、Vitest、现有 `configService` / `configRepository` / `recent` 模块

---

### Task 1: recentMax 更新失败整体回滚

**Files:**
- Modify: `wj-markdown-editor-electron/src/data/config/configService.js`
- Modify: `wj-markdown-editor-electron/src/data/configUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Test: `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js`
- Test: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`

- [ ] **Step 1: 写失败测试，覆盖 `recent.setMax()` 失败时的服务层返回语义**

在 `configService.test.js` 中新增用例，约束：

```js
it('recentMax 持久化失败时必须整体失败并回滚配置文本', async () => {
  // 初始化已有配置
  // 第一次 writeConfigText 成功写入新配置
  // recent.setMax 失败
  // 第二次 writeConfigText 成功回滚旧配置
  // 断言返回 { ok: false, reason: 'config-write-failed', messageKey: 'message.configWriteFailed' }
  // 断言 getConfig() 仍为旧配置
})
```

- [ ] **Step 2: 运行单测，确认红灯**

Run: `npm run test:run -- src/data/config/__tests__/configService.test.js -t "recentMax 持久化失败时必须整体失败并回滚配置文本"`

Expected: FAIL，提示当前 `configService` 还没有提供整体失败回滚能力。

- [ ] **Step 3: 写失败测试，覆盖 IPC 返回语义**

在 `ipcMainUtil.test.js` 中把现有“`recent.setMax` 失败仍返回成功”的预期改为整体失败：

```js
it('user-update-config 在 recent.setMax 失败时必须返回结构化失败结果', async () => {
  // configSetConfigWithRecentMax mock 为失败
  // 断言 IPC 返回 config-write-failed/message.configWriteFailed
})
```

- [ ] **Step 4: 运行单测，确认红灯**

Run: `npm run test:run -- src/util/channel/ipcMainUtil.test.js -t "user-update-config 在 recent.setMax 失败时必须返回结构化失败结果"`

Expected: FAIL，提示当前 IPC 仍把该场景当作成功。

- [ ] **Step 5: 实现最小代码**

实现要求：

```js
// configService.js
// 新增 setConfigWithRecentMax(nextPartial, recentStore)
// 1. 先基于当前配置合成并校验 nextConfig
// 2. 先写入新 config 文本
// 3. 调用 recentStore.setMax(nextConfig.recentMax)
// 4. recent 失败时，把 config 文本回滚到旧文本，并返回 config-write-failed
// 5. 只有全部成功后才更新 currentConfig 并触发 updateCallback

// configUtil.js
// 暴露兼容层 setConfigWithRecentMax(data, recentStore)

// ipcMainUtil.js
// user-update-config 直接调用 configUtil.setConfigWithRecentMax(data, recent)
// recentMax 不再挂在 executeConfigUpdate(afterSuccess) 上
```

- [ ] **Step 6: 运行针对性测试，确认转绿**

Run: `npm run test:run -- src/data/config/__tests__/configService.test.js src/util/channel/ipcMainUtil.test.js`

Expected: 新增回归测试通过，已有配置 IPC 契约测试不回退。

- [ ] **Step 7: 按文件执行 ESLint 修复**

Run: `npx eslint --fix src/data/config/configService.js src/data/config/__tests__/configService.test.js src/data/configUtil.js src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js`

Expected: 无 ESLint 错误。

- [ ] **Step 8: 执行最终验证**

Run: `npm run test:run -- src/data/config/__tests__/configService.test.js src/data/configUtil.test.js src/util/channel/ipcMainUtil.test.js`

Expected: 全部通过，证明配置服务、兼容层和 IPC 契约一致。
