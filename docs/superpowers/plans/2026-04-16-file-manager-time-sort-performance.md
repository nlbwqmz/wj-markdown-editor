# 文件管理栏时间排序性能优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变文件管理栏排序语义与 UI 的前提下，优化按时间排序的性能热点，并修复目录 watch 重扫时修改时间标记未透传的问题。

**Architecture:** 保持现有“Electron 读目录 + Renderer 归一化排序”的架构，只在热点链路上做最小变更。Renderer 侧改为预计算排序键并去掉一次重复重算，Electron 侧修正 `includeModifiedTime` 透传缺口，并分别用现有测试体系覆盖。

**Tech Stack:** Vue 3、Pinia、Node 内置 `node:test`、Vitest 4、Electron 39、ES Modules

---

### Task 1: 排序工具回归测试

**Files:**
- Modify: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerEntryMetaUtil.test.js`

- [ ] **Step 1: 写失败测试**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 用最小改动实现排序键预计算**
- [ ] **Step 4: 运行测试确认通过**

### Task 2: 控制器排序重算去重

**Files:**
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

- [ ] **Step 1: 写失败测试**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 删除多余的立即重算逻辑**
- [ ] **Step 4: 运行测试确认通过**

### Task 3: 目录 watch 修改时间透传

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntimeComposition.test.js`

- [ ] **Step 1: 写失败测试**
- [ ] **Step 2: 运行测试确认失败**
- [ ] **Step 3: 透传 `includeModifiedTime`**
- [ ] **Step 4: 运行测试确认通过**

### Task 4: 收尾验证

**Files:**
- Modify: `docs/superpowers/specs/2026-04-16-file-manager-time-sort-performance-design.md`
- Modify: `docs/superpowers/plans/2026-04-16-file-manager-time-sort-performance.md`

- [ ] **Step 1: 按包分别执行 ESLint 格式化受影响文件**
- [ ] **Step 2: 运行 Web 与 Electron 针对性测试**
- [ ] **Step 3: 复核设计与实现是否一致**
