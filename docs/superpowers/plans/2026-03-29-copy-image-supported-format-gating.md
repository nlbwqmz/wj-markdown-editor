# copy-image 支持格式收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让预览区“复制图片”只对 PNG/JPEG 暴露，并在主进程对不支持格式做结构化兜底。

**Architecture:** Web 端同步按资源扩展名裁决 `copy-image` 菜单是否显示，Electron 端再按同样的支持矩阵做运行时防御校验。`save-as`、下载链路和其他资源菜单动作保持不变。

**Tech Stack:** Vue 3、Electron 39、Node:test、Vitest 4、现有 `document-session` 结构化结果协议。

---

## 文件结构与责任

- Modify: `wj-markdown-editor-web/src/util/editor/previewContextMenuActionUtil.js`
  - 增加“复制图片是否支持”的同步判断
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewContextMenuActionUtil.test.js`
  - 锁定 PNG/JPEG 显示、WebP/AVIF/SVG/无扩展名隐藏
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
  - 在 `copyImage()` 前加入格式校验，并映射新错误 reason
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`
  - 锁定本地/远程不支持格式直接失败，且不读文件、不下载、不写剪贴板
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/i18n/__tests__/message.test.js`
  - 增加新错误文案

## 任务 1：先写菜单层红灯测试

**Files:**
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewContextMenuActionUtil.test.js`

- [ ] **Step 1: 写失败测试，锁定 PNG/JPEG 仍显示 copy-image**
- [ ] **Step 2: 写失败测试，锁定 WebP/AVIF/SVG/无扩展名远程图片隐藏 copy-image，但保留 save-as**
- [ ] **Step 3: 运行 Node 测试确认红灯**

Run in `wj-markdown-editor-web`:

```bash
node --test src/util/editor/__tests__/previewContextMenuActionUtil.test.js
```

## 任务 2：实现菜单层能力收口并拉绿

**Files:**
- Modify: `wj-markdown-editor-web/src/util/editor/previewContextMenuActionUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewContextMenuActionUtil.test.js`

- [ ] **Step 1: 实现纯函数格式判断，只允许 .png/.jpg/.jpeg 显示 copy-image**
- [ ] **Step 2: 运行菜单测试确认转绿**

Run in `wj-markdown-editor-web`:

```bash
node --test src/util/editor/__tests__/previewContextMenuActionUtil.test.js
```

## 任务 3：先写主进程 copyImage 红灯测试

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`

- [ ] **Step 1: 写失败测试，锁定本地 WebP 直接返回 unsupported，且不读文件**
- [ ] **Step 2: 写失败测试，锁定远程 WebP 直接返回 unsupported，且不发起下载**
- [ ] **Step 3: 写失败测试，锁定本地 PNG/JPEG 仍可走现有复制链路**
- [ ] **Step 4: 运行文档资源服务测试确认红灯只集中在新行为**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/document-session/__tests__/documentResourceService.test.js
```

## 任务 4：实现主进程兜底与文案

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/i18n/__tests__/message.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`

- [ ] **Step 1: 增加 copy-image 支持格式校验与统一 reason/messageKey**
- [ ] **Step 2: 运行 Electron 测试确认 copyImage 相关场景转绿**
- [ ] **Step 3: 运行 i18n 测试确认新文案键值齐全**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/document-session/__tests__/documentResourceService.test.js
```

Run in `wj-markdown-editor-web`:

```bash
node --test src/i18n/__tests__/message.test.js
```

## 任务 5：定向格式化与最终验证

**Files:**
- Modify: `wj-markdown-editor-web/src/util/editor/previewContextMenuActionUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewContextMenuActionUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/i18n/__tests__/message.test.js`

- [ ] **Step 1: 运行 web 定向 ESLint**

```bash
npx eslint --fix src/util/editor/previewContextMenuActionUtil.js src/util/editor/__tests__/previewContextMenuActionUtil.test.js src/i18n/zhCN.js src/i18n/enUS.js src/i18n/__tests__/message.test.js
```

- [ ] **Step 2: 运行 electron 定向 ESLint**

```bash
npx eslint --fix src/util/document-session/documentResourceService.js src/util/document-session/__tests__/documentResourceService.test.js
```

- [ ] **Step 3: 运行目标测试**

```bash
node --test src/util/editor/__tests__/previewContextMenuActionUtil.test.js
node --test src/i18n/__tests__/message.test.js
npx vitest run src/util/document-session/__tests__/documentResourceService.test.js
```

- [ ] **Step 4: 核对工作区状态**

```bash
git status --short
```
