# Document Session Clock Id Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口 `document-session` 中统一值的 `createJobId` / `now` 参数，改为内部统一使用 `commonUtil.createId()` 与 `Date.now()`。

**Architecture:** 保留 `store`、`effectService`、`commandRunner` 等真实协作者注入，只删除生产环境恒定的原语级依赖透传。实现上先改测试入口，再改协调器与工厂内部实现，最后清理组合根与调用方的冗余参数。

**Tech Stack:** Electron 39、Node.js ESM、Vitest、ESLint

---

## Chunk 1: 测试基线调整

### Task 1: 调整依赖固定时间与 jobId 的测试

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/saveCoordinator.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/watchCoordinator.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandService.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionFactory.test.js`

- [ ] **Step 1: 写出新的失败测试或调整现有断言**

将测试改为不再向构造函数传入 `createJobId` / `now`，并为时间或 id 断言准备 fake timers / mock。

- [ ] **Step 2: 运行相关测试并确认按预期失败**

Run: `npx vitest run src/util/document-session/__tests__/saveCoordinator.test.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/documentSessionFactory.test.js`

Expected: 因构造函数签名或断言尚未同步而失败。

## Chunk 2: 实现收口

### Task 2: 收口协调器与运行时中的 `createJobId` / `now`

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentCommandService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
- Modify: `wj-markdown-editor-electron/src/util/commonUtil.js`（只读确认，通常无需修改）

- [ ] **Step 1: 在 `saveCoordinator` 内部直接使用 `commonUtil.createId()` 与 `Date.now()`**

- [ ] **Step 2: 删除 `watchCoordinator`、`documentCommandService`、`documentSessionRuntime` 的冗余时间与 id 透传**

- [ ] **Step 3: 清理 `windowLifecycleService` 中对应的构造参数传递**

- [ ] **Step 4: 运行相关测试验证通过**

Run: `npx vitest run src/util/document-session/__tests__/saveCoordinator.test.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js`

Expected: PASS

## Chunk 3: 收口 session 工厂与最终整理

### Task 3: 统一 session 工厂初始化时间来源并完成验证

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionFactory.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionFactory.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionStore.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSnapshotUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js`

- [ ] **Step 1: 去掉工厂函数对 `now` 的外部输入，内部使用 `Date.now()` 初始化**

- [ ] **Step 2: 同步修改调用方和测试**

- [ ] **Step 3: 运行工厂与 store 相关测试**

Run: `npx vitest run src/util/document-session/__tests__/documentSessionFactory.test.js src/util/document-session/__tests__/documentSessionStore.test.js src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/windowSessionBridge.test.js`

Expected: PASS

## Chunk 4: 格式化与回归验证

### Task 4: 完成定点格式化与最终验证

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/saveCoordinator.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/watchCoordinator.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentCommandService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionFactory.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/saveCoordinator.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/watchCoordinator.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandService.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionFactory.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionStore.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSnapshotUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js`

- [ ] **Step 1: 按包执行定点 ESLint 格式化**

Run: `npx eslint --fix src/util/document-session/saveCoordinator.js src/util/document-session/watchCoordinator.js src/util/document-session/documentCommandService.js src/util/document-session/documentSessionRuntime.js src/util/document-session/documentSessionFactory.js src/util/document-session/windowLifecycleService.js src/util/document-session/__tests__/saveCoordinator.test.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/documentSessionFactory.test.js src/util/document-session/__tests__/documentSessionStore.test.js src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/windowSessionBridge.test.js`

Expected: 退出码 0

- [ ] **Step 2: 运行最终相关测试集**

Run: `npx vitest run src/util/document-session/__tests__/saveCoordinator.test.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/documentSessionFactory.test.js src/util/document-session/__tests__/documentSessionStore.test.js src/util/document-session/__tests__/documentSnapshotUtil.test.js src/util/document-session/__tests__/windowSessionBridge.test.js src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js`

Expected: PASS

Plan complete and saved to `docs/superpowers/plans/2026-03-18-document-session-clock-id-cleanup.md`. Ready to execute?
