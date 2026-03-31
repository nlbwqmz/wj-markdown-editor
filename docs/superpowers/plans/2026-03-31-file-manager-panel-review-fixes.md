# File Manager Panel Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复文件管理栏评审指出的两个真实缺陷，保证目录刷新尊重 renderer 显式目标目录，并让 `recent-missing` 父目录不存在时进入静默空状态。

**Architecture:** 先收敛 `file-manager.get-directory-state` 的跨层契约，让 renderer 传入的 `directoryPath` 能从 IPC 一直传到主进程目录服务，并由目录服务在显式目录存在时覆盖旧 binding。随后修正 renderer 对 `directoryPath: null` 空结果的判定逻辑，使 `recent-missing` 缺失父目录场景走设计要求的静默空状态分支。最后补齐 Electron 与 renderer 两侧回归测试，避免未来再次出现契约漂移。

**Tech Stack:** Electron 39、Vue 3、Vitest、Node `fs-extra`

---

### Task 1: 补齐失败测试

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

- [ ] **Step 1: 写 Electron IPC 失败测试**

  断言 `file-manager.get-directory-state` 必须把 renderer 传入的 `directoryPath` 原样透传给 runtime。

- [ ] **Step 2: 运行 Electron IPC 单测，确认先失败**

  Run: `npm run test:run -- src/util/channel/ipcMainUtil.test.js`

- [ ] **Step 3: 写目录服务失败测试**

  断言 `getDirectoryState({ windowId, directoryPath })` 在显式目录存在时必须忽略旧 binding 并返回新目录。

- [ ] **Step 4: 运行目录服务单测，确认先失败**

  Run: `npm run test:run -- src/util/document-session/__tests__/documentFileManagerService.test.js`

- [ ] **Step 5: 写 renderer 静默空状态失败测试**

  断言 `recent-missing` 场景收到 `directoryPath: null` 的空状态对象时，不显示额外空文案。

- [ ] **Step 6: 运行 renderer 组件单测，确认先失败**

  Run: `npm run test:component:run -- src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

### Task 2: 修主进程目录刷新契约

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js`

- [ ] **Step 1: 透传 IPC payload**

  `file-manager.get-directory-state` 不再写死 `null`，而是透传 renderer 请求数据。

- [ ] **Step 2: 收紧 effect 层调用契约**

  `documentEffectService.executeCommand()` 直接把 `directoryPath` 解包后传给目录服务。

- [ ] **Step 3: 实现显式目录优先**

  `documentFileManagerService.getDirectoryState()` 支持显式 `directoryPath`，并在该参数存在时优先读取目标目录、更新窗口 binding，再返回目录状态。

- [ ] **Step 4: 运行对应 Electron 单测，确认转绿**

  Run: `npm run test:run -- src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/documentFileManagerService.test.js`

### Task 3: 修 renderer 静默空状态

**Files:**
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`

- [ ] **Step 1: 统一识别空结果对象**

  在 `reloadDirectoryStateFromSnapshot()` 中把 `directoryPath: null` 的返回值也视为空状态，而不是只对 `null` 走静默分支。

- [ ] **Step 2: 保持 `recent-missing` 的静默语义**

  当 `missingDirectoryEmptyMessageKey` 显式为 `null` 时，提交空状态时保留这个值，不回退到“当前目录为空”文案。

- [ ] **Step 3: 运行 renderer 单测，确认转绿**

  Run: `npm run test:component:run -- src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

### Task 4: 格式化与最终验证

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

- [ ] **Step 1: 按包执行 ESLint 修复**

  Run: `npx eslint --fix src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js src/util/document-session/documentEffectService.js src/util/document-session/documentFileManagerService.js src/util/document-session/__tests__/documentFileManagerService.test.js`

  Run: `npx eslint --fix src/util/file-manager/fileManagerPanelController.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

- [ ] **Step 2: 运行最终定向验证**

  Run: `npm run test:run -- src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/documentFileManagerService.test.js`

  Run: `npm run test:component:run -- src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
