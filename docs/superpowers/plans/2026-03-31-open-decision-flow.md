# 打开决策流程修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Markdown 打开流程中的决策顺序问题，确保“其他窗口已打开”优先裁决、“当前窗口切换”先稳定正文再决定保存策略，并移除来源窗口自动回收的历史行为。

**Architecture:** 打开流程拆成“目标预判 -> 打开方式选择 -> 当前窗口切换准备 -> 当前窗口切换执行”四段。renderer 负责交互编排和正文稳定化，Electron 负责目标占用判定、切换预判和最终执行，双方通过新的结构化命令协议对齐。开发过程严格按 @superpowers:test-driven-development 执行，先补失败测试，再做最小实现。

**Tech Stack:** Vue 3、Pinia、Electron、Vitest、Node 内置测试、ESLint

---

## 文件结构

### Web 端

- Create: `wj-markdown-editor-web/src/util/document-session/documentOpenInteractionService.js`
  负责收口“按路径打开文档”和“先弹 open dialog 再进入统一打开流程”的宿主级能力，供菜单、快捷键、最近文件和文件树复用。
- Create: `wj-markdown-editor-web/src/util/document-session/currentWindowOpenPreparationService.js`
  负责注册、获取、清理“当前窗口切换前准备”能力，避免菜单和文件树直接耦合编辑器实例。
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
  暴露切换前稳定化逻辑，并向准备 service 注册 / 释放当前窗口准备器。
- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
  作为宿主串起 `LayoutMenu`、`FileManagerPanel`、快捷键和 `EditorView/PreviewView` 的准备能力与统一打开交互能力。
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`
  负责暴露预览页下的稳定 snapshot 上下文，供 `HomeView` 持有的降级准备 service 使用。
- Modify: `wj-markdown-editor-web/src/util/document-session/rendererDocumentCommandUtil.js`
  新增“open dialog 仅选路径”“目标预判”“当前窗口切换预判”命令封装，并更新当前窗口执行命令 payload。
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js`
  改造成四段式编排，不再直接依赖 `options.isDirty` 作为最终真相。
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`
  入口改为只传当前路径与来源标记，不再直接把 store 中的 `dirty` 当成最终判断。
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
  同步改造文件树入口逻辑。
- Modify: `wj-markdown-editor-web/src/util/shortcutKeyUtil.js`
  将 `openFile` 快捷键接到统一打开交互 service，不再在拿到 open dialog 结果后直接走旧打开链路。

### Web 测试

- Create: `wj-markdown-editor-web/src/util/document-session/__tests__/documentOpenInteractionService.test.js`
  覆盖按路径打开、open dialog 结果回流和无宿主时的结构化失败结果。
- Create: `wj-markdown-editor-web/src/util/document-session/__tests__/currentWindowOpenPreparationService.test.js`
  覆盖准备器注册、替换、清理和空实现回退。
- Create: `wj-markdown-editor-web/src/views/__tests__/editorViewCurrentWindowOpenPreparation.vitest.test.js`
  覆盖 `EditorView` 在挂起正文同步时执行 flush、补发 `document.edit` 并返回稳定 snapshot。
- Create: `wj-markdown-editor-web/src/views/__tests__/previewViewCurrentWindowOpenPreparation.vitest.test.js`
  覆盖预览页缺少编辑器实例时返回稳定 snapshot 的降级路径。
- Modify: `wj-markdown-editor-web/src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`
  覆盖新增 IPC 命令、open dialog 返回值和新的 execute payload 形状。
- Modify: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`
  覆盖“目标预判优先”“只有 current-window 才进入准备与 save-choice”的编排顺序。
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js`
  覆盖最近文件入口、菜单“打开”入口的预判优先与错误提示行为。
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
  覆盖文件树入口的预判优先与切换前准备接线。
- Modify: `wj-markdown-editor-web/src/util/__tests__/shortcutKeyUtil.vitest.test.js`
  覆盖 `openFile` 快捷键改走统一打开交互 service。

### Electron 端

- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
  透传新增的 open dialog 选路径、目标预判、当前窗口切换预判命令。
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
  覆盖新增 IPC 命令透传。
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
  新增 open dialog 仅选路径、目标预判命令与当前窗口切换预判命令的 effect 分发。
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
  移除 `new-window` 历史上的 pristine draft 自动关闭逻辑，并接入新的命令封装。
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
  拆分“目标占用预判”“当前窗口切换预判”“当前窗口切换执行”，并保留 execute 阶段复验。

### Electron 测试

- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
  覆盖新增命令透传与 open dialog 入口新语义。
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js`
  覆盖新增 effect 命令分发与 open dialog 只返回选择结果。
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js`
  覆盖“来源窗口不再自动关闭”的新语义。
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.test.js`
  覆盖“目标预判优先”“needs-save-choice 仅在 current-window 且目标未占用时出现”“execute 只在显式保存策略下触发保存”，以及 execute 阶段的再次占用复验。

## Task 1：补当前窗口切换前准备能力的失败测试

**Files:**
- Create: `wj-markdown-editor-web/src/util/document-session/documentOpenInteractionService.js`
- Create: `wj-markdown-editor-web/src/util/document-session/__tests__/documentOpenInteractionService.test.js`
- Create: `wj-markdown-editor-web/src/util/document-session/currentWindowOpenPreparationService.js`
- Create: `wj-markdown-editor-web/src/util/document-session/__tests__/currentWindowOpenPreparationService.test.js`
- Create: `wj-markdown-editor-web/src/views/__tests__/editorViewCurrentWindowOpenPreparation.vitest.test.js`
- Create: `wj-markdown-editor-web/src/views/__tests__/previewViewCurrentWindowOpenPreparation.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`
- Modify: `wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

- [ ] **Step 1: 先写统一打开交互 service 和准备 service 的失败测试**

```js
test('open dialog 未返回路径时，应返回结构化 cancelled 结果', async () => {
  const result = await requestDocumentOpenByDialog()
  expect(result).toEqual({
    ok: false,
    reason: 'cancelled',
    path: null,
  })
})

test('open dialog 选中文件时，应返回结构化 selected 结果', async () => {
  const result = await requestDocumentOpenByDialog()
  expect(result).toEqual({
    ok: true,
    reason: 'selected',
    path: 'D:/docs/next.md',
  })
})

test('未注册准备器时，应返回结构化 unavailable 结果', async () => {
  const result = await requestCurrentWindowOpenPreparation()
  expect(result).toEqual({
    ok: false,
    reason: 'preparation-unavailable',
  })
})

test('新一轮打开请求开始时，必须让上一轮交互 promise 失效并销毁旧弹窗', async () => {
  expect(destroyActiveDialog).toHaveBeenCalledTimes(1)
  await expect(previousRequestPromise).rejects.toMatchObject({
    reason: 'request-invalidated',
  })
})
```

- [ ] **Step 2: 运行 web 侧单测，确认失败原因正确**

Run: `npm run test:node -- src/util/document-session/__tests__/documentOpenInteractionService.test.js src/util/document-session/__tests__/currentWindowOpenPreparationService.test.js`

Expected: FAIL，提示 service 尚未实现或导出缺失。

- [ ] **Step 3: 再写 EditorView / PreviewView 切换前准备的失败测试**

```js
it('当前窗口切换前准备命中挂起正文时，必须先 flush，再等待 document.edit 返回最新快照', async () => {
  expect(flushPendingModelSync).toHaveBeenCalledTimes(1)
  expect(requestDocumentEdit).toHaveBeenCalledWith('# 最新正文')
  expect(result.snapshot.revision).toBe(8)
})

it('预览页下未注册编辑器实例时，应回退到稳定 snapshot 上下文', async () => {
  expect(result.snapshot.revision).toBe(5)
  expect(requestDocumentEdit).not.toHaveBeenCalled()
})
```

- [ ] **Step 4: 运行视图级测试，确认失败**

Run: `npm run test:component:run -- src/views/__tests__/editorViewCurrentWindowOpenPreparation.vitest.test.js src/views/__tests__/previewViewCurrentWindowOpenPreparation.vitest.test.js src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

Expected: FAIL，提示当前窗口准备逻辑尚未对外暴露、缺少预览页降级实现、宿主接线缺失或旧交互未失效。

- [ ] **Step 5: 实现最小统一打开交互 service、准备 service 与视图接线**

```js
export function registerCurrentWindowOpenPreparation(handler) {
  activePreparationHandler = handler
  return () => {
    if (activePreparationHandler === handler) {
      activePreparationHandler = null
    }
  }
}
```

实现要点：
- `documentOpenInteractionService` 负责把 open dialog 结果回流到统一打开流程。
- `EditorView` 注册增强版准备器。
- `PreviewView` 只暴露降级所需的稳定 snapshot 上下文。
- `HomeView` 负责持有准备 service 的 owner 身份，并把预览页降级能力与统一打开交互 service 一起接到 `LayoutMenu`、`FileManagerPanel` 和快捷键宿主。
- `HomeView` / 统一打开交互 service 必须持有 request token；新请求开始、页面失活卸载或 session identity 变化时，都要主动 destroy 旧对话框并使旧 promise 失效。

- [ ] **Step 6: 再次运行上述两组测试，确认转绿**

Run:
- `npm run test:node -- src/util/document-session/__tests__/documentOpenInteractionService.test.js src/util/document-session/__tests__/currentWindowOpenPreparationService.test.js`
- `npm run test:component:run -- src/views/__tests__/editorViewCurrentWindowOpenPreparation.vitest.test.js src/views/__tests__/previewViewCurrentWindowOpenPreparation.vitest.test.js src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

Expected: PASS

## Task 2：先补 renderer 决策顺序测试，再改造 web 端打开编排

**Files:**
- Modify: `wj-markdown-editor-web/src/util/document-session/documentOpenInteractionService.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/rendererDocumentCommandUtil.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js`
- Modify: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/util/shortcutKeyUtil.js`
- Modify: `wj-markdown-editor-web/src/util/__tests__/shortcutKeyUtil.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
- Modify: `wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

- [ ] **Step 1: 先写 renderer 命令工具的失败测试**

```js
it('应发送目标预判命令和当前窗口切换预判命令', async () => {
  await requestDocumentOpenDialog()
  await requestDocumentResolveOpenTarget('D:/docs/next.md')
  await requestPrepareOpenPathInCurrentWindow('D:/docs/next.md', {
    sourceSessionId: 'session-1',
    sourceRevision: 5,
  })
  expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
    event: 'document.resolve-open-target',
  }))
  expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
    event: 'document.request-open-dialog',
  }))
})

it('执行当前窗口切换时，必须发送 switchPolicy / expectedSessionId / expectedRevision', async () => {
  await requestDocumentOpenPathInCurrentWindow('D:/docs/next.md', {
    switchPolicy: 'discard-switch',
    expectedSessionId: 'session-1',
    expectedRevision: 5,
  })
  expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
    event: 'document.open-path-in-current-window',
    data: expect.objectContaining({
      switchPolicy: 'discard-switch',
      expectedSessionId: 'session-1',
      expectedRevision: 5,
    }),
  }))
})
```

- [ ] **Step 2: 运行命令工具测试，确认失败**

Run: `npm run test:node -- src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`

Expected: FAIL，提示新增命令工具不存在。

- [ ] **Step 3: 再写打开决策 controller、快捷键与菜单“打开”入口的失败测试**

```js
it('目标已在其他窗口打开时，必须在 open-choice 前直接结束', async () => {
  mocked.requestDocumentResolveOpenTarget.mockResolvedValue({
    ok: true,
    decision: 'focused-existing-window',
  })
  const result = await controller.openDocument('/tmp/next.md', {})
  expect(result.stageList).toEqual(['target-preflight'])
  expect(mocked.promptOpenModeChoice).not.toHaveBeenCalled()
  expect(mocked.promptSaveChoice).not.toHaveBeenCalled()
})

it('openFile 快捷键选中的路径，必须进入统一打开决策流程', async () => {
  expect(openDocumentByDialogMock).toHaveBeenCalledTimes(1)
})

it('当前窗口切换预判若发现目标已在其他窗口打开，必须在 save-choice 前直接结束', async () => {
  expect(mocked.promptSaveChoice).not.toHaveBeenCalled()
  expect(result.stageList).toContain('current-window-preflight')
})

it('execute 返回 source-session-changed 时，必须中止流程并提示用户重新发起打开', async () => {
  expect(mocked.promptSaveChoice).not.toHaveBeenCalled()
  expect(mocked.notifySourceSessionChanged).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 4: 运行 controller 与入口组件测试，确认失败**

Run:
- `npm run test:component:run -- src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`
- `npm run test:component:run -- src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js`
- `npm run test:component:run -- src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
- `npm run test:component:run -- src/util/__tests__/shortcutKeyUtil.vitest.test.js`
- `npm run test:component:run -- src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

Expected: FAIL，提示决策顺序与新预期不一致。

- [ ] **Step 5: 实现最小 web 端编排改造**

实现要点：
- 先调目标预判命令。
- 仅在 `needs-open-mode-choice` 时弹 open-choice。
- 仅在 `current-window` 分支调用准备 service。
- 仅在当前窗口切换预判要求时弹 save-choice。
- open dialog 结果必须回流到统一打开交互 service，而不是直接打开。
- `LayoutMenu` / `FileManagerPanel` 不再直接把 store `dirty` 作为最终真相。
- `shortcutKeyUtil.openFile` 改走统一打开交互 service。
- `HomeView` 必须成为统一打开交互与准备 service 的真实宿主接线点。
- 当前窗口切换预判若返回 `focused-existing-window` 或阶段一同类终止结果，必须在 `save-choice` 前直接结束。
- `document.open-path-in-current-window` 的 renderer wrapper 与 controller 必须固定发送 `switchPolicy`、`expectedSessionId`、`expectedRevision`。
- 命中 `source-session-changed` 时，controller 必须终止流程并提示用户重新执行打开。

- [ ] **Step 6: 重新运行上述 web 测试，确认转绿**

Run:
- `npm run test:node -- src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`
- `npm run test:component:run -- src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`
- `npm run test:component:run -- src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js`
- `npm run test:component:run -- src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
- `npm run test:component:run -- src/util/__tests__/shortcutKeyUtil.vitest.test.js`
- `npm run test:component:run -- src/views/__tests__/homeViewFileManagerHost.vitest.test.js`

Expected: PASS

## Task 3：先补 Electron 侧预判与执行的失败测试，再拆分主进程命令

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.test.js`

- [ ] **Step 1: 先写 IPC 透传与 effect 分发的失败测试**

```js
it('ipcMainUtil 必须透传 resolve-open-target 与 prepare-open-path-in-current-window', async () => {
  expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.resolve-open-target', { path: 'D:/other.md' })
})

it('document.request-open-dialog 选中文件时，只能返回结构化 selected 结果，不能直接 openDocumentWindow', async () => {
  expect(result).toEqual({
    ok: true,
    reason: 'selected',
    path: 'D:/docs/demo.md',
  })
  expect(openDocumentWindow).not.toHaveBeenCalled()
})

it('document.request-open-dialog 取消时，必须返回 cancelled 结构化结果', async () => {
  expect(result).toEqual({
    ok: false,
    reason: 'cancelled',
    path: null,
  })
})

it('document.request-open-dialog 打开系统对话框失败时，必须返回 dialog-open-failed 结构化结果', async () => {
  expect(result).toEqual({
    ok: false,
    reason: 'dialog-open-failed',
    path: null,
  })
})
```

- [ ] **Step 2: 运行 IPC 与 effect 测试，确认失败**

Run:
- `npm run test:run -- src/util/channel/ipcMainUtil.test.js`
- `npm run test:run -- src/util/document-session/__tests__/documentEffectService.test.js`

Expected: FAIL，提示命令不存在或 open dialog 仍走旧语义。

- [ ] **Step 3: 再写目标预判与当前窗口切换预判的失败测试**

```js
it('目标已在其他窗口打开时，resolve-open-target 必须先返回 focused-existing-window', async () => {
  const result = await executeTestCommand(currentWinInfo, 'document.resolve-open-target', {
    path: 'D:/other.md',
    entrySource: 'file-manager',
    trigger: 'user',
  })
  expect(result).toEqual({
    ok: true,
    decision: 'focused-existing-window',
    windowId: otherWinInfo.id,
  })
})

it.each([
  ['普通缺失路径', { path: 'D:/missing.md', entrySource: 'file-manager', trigger: 'user' }, 'open-target-missing'],
  ['非法扩展名', { path: 'D:/other.txt', entrySource: 'file-manager', trigger: 'user' }, 'open-target-invalid-extension'],
  ['路径指向目录', { path: 'D:/folder', entrySource: 'file-manager', trigger: 'user' }, 'open-target-not-file'],
  ['目标不可读', { path: 'D:/locked.md', entrySource: 'file-manager', trigger: 'user' }, 'open-target-read-failed'],
])('resolve-open-target 命中%s时，必须直接返回结构化结果并终止后续交互', async (_title, payload, expectedDecision) => {
  const result = await executeTestCommand(currentWinInfo, 'document.resolve-open-target', payload)
  expect(result).toEqual(expect.objectContaining({
    ok: false,
    reason: expectedDecision,
  }))
})

it('recent 入口命中缺失路径时，resolve-open-target 必须返回 recent-missing', async () => {
  const result = await executeTestCommand(currentWinInfo, 'document.resolve-open-target', {
    path: 'D:/recent-missing.md',
    entrySource: 'recent',
    trigger: 'user',
  })
  expect(result).toEqual(expect.objectContaining({
    ok: false,
    reason: 'recent-missing',
  }))
})

it('current session 为 recent-missing 且路径文本相同时，resolve-open-target 也不得返回 noop-current-file', async () => {
  const result = await executeTestCommand(currentWinInfo, 'document.resolve-open-target', {
    path: 'D:/recent-missing.md',
    entrySource: 'recent',
    trigger: 'user',
  })
  expect(result?.decision).not.toBe('noop-current-file')
})

it('当前文件重复打开时，resolve-open-target 必须返回 noop-current-file', async () => {
  const result = await executeTestCommand(currentWinInfo, 'document.resolve-open-target', {
    path: 'D:/current.md',
    entrySource: 'file-manager',
    trigger: 'user',
  })
  expect(result).toEqual(expect.objectContaining({
    ok: true,
    decision: 'noop-current-file',
  }))
})

it('目标有效且未被占用时，resolve-open-target 必须返回 needs-open-mode-choice', async () => {
  const result = await executeTestCommand(currentWinInfo, 'document.resolve-open-target', {
    path: 'D:/next.md',
    entrySource: 'file-manager',
    trigger: 'user',
  })
  expect(result).toEqual(expect.objectContaining({
    ok: true,
    decision: 'needs-open-mode-choice',
  }))
})
```

- [ ] **Step 4: 运行 windowLifecycleService 测试，确认失败**

Run: `npm run test:run -- src/util/document-session/__tests__/windowLifecycleService.test.js`

Expected: FAIL，提示命令不存在或返回结构不匹配。

- [ ] **Step 5: 再写 execute 复验相关的失败测试**

```js
it('prepare-open-path-in-current-window 命中 dirty 时，必须返回 needs-save-choice', async () => {
  expect(result).toEqual({
    ok: true,
    decision: 'needs-save-choice',
    path: 'D:/next.md',
    sourceSessionId: 'session-1',
    sourceRevision: 5,
  })
})

it('prepare-open-path-in-current-window 命中 clean path 时，必须返回 ready-to-switch', async () => {
  expect(result).toEqual({
    ok: true,
    decision: 'ready-to-switch',
    path: 'D:/next.md',
    sourceSessionId: 'session-1',
    sourceRevision: 5,
  })
})

it('prepare-open-path-in-current-window 若在 save-choice 前发现目标已被其他窗口打开，必须返回 focused-existing-window', async () => {
  expect(result).toEqual({
    ok: true,
    decision: 'focused-existing-window',
    path: 'D:/next.md',
    windowId: 12,
    sourceSessionId: 'session-1',
    sourceRevision: 5,
  })
})

it('open-path-in-current-window 在 switchPolicy=direct-switch 时，不得进入保存分支', async () => {
  expect(showSaveDialogSyncMock).not.toHaveBeenCalled()
})

it('open-path-in-current-window 仅在 switchPolicy=save-before-switch 时进入保存分支', async () => {
  expect(showSaveDialogSyncMock).toHaveBeenCalledTimes(1)
})

it('open-path-in-current-window 在 switchPolicy=discard-switch 时，必须跳过保存并继续切换', async () => {
  expect(showSaveDialogSyncMock).not.toHaveBeenCalled()
})

it('execute 前若目标已被其他窗口占用，必须返回 focused-existing-window 而不是继续保存', async () => {
  expect(showSaveDialogSyncMock).not.toHaveBeenCalled()
})

it.each([
  ['目标已不存在', 'open-target-missing'],
  ['目标变成目录', 'open-target-not-file'],
  ['目标变得不可读', 'open-target-read-failed'],
])('execute 期间若%s，必须返回结构化失败结果', async (_title, expectedReason) => {
  expect(result).toEqual(expect.objectContaining({
    ok: false,
    reason: expectedReason,
  }))
})

it('execute 命中 session / revision 失配时，必须返回 source-session-changed', async () => {
  expect(result.reason).toBe('source-session-changed')
})
```

- [ ] **Step 6: 先运行 execute 复验测试，确认红灯**

Run: `npm run test:run -- src/util/document-session/__tests__/windowLifecycleService.test.js`

Expected: FAIL，提示 execute 复验与 stale dialog 保护尚未实现。

- [ ] **Step 7: 实现最小主进程命令拆分**

实现要点：
- `ipcMainUtil` 先透传新命令。
- `document.request-open-dialog`：只做文件选择，并返回固定结构 `{ ok, reason, path }`。
- `document.resolve-open-target`：必须接收 `path + entrySource + trigger`，并覆盖 `noop-current-file`、`focused-existing-window`、`recent-missing`、`open-target-invalid-extension`、`open-target-missing`、`open-target-read-failed`、`open-target-not-file`、`needs-open-mode-choice` 全部正式结果。
- recent 入口命中缺失时必须返回 `recent-missing`，不能退化成普通 missing。
- `document.prepare-open-path-in-current-window`：除了 `ready-to-switch` / `needs-save-choice` 外，还必须允许在 save-choice 前短路返回 `focused-existing-window` 或阶段一同类终止结果。
- `document.open-path-in-current-window`：只做 execute，但必须再次复验目标路径和“是否已在其他窗口打开”，并在 session / revision 失配时返回 `source-session-changed`。
- `documentSessionRuntime` 必须同步改造成透传 `switchPolicy`、`expectedSessionId`、`expectedRevision`，不能继续把当前窗口打开 payload 压缩回旧的 `saveBeforeSwitch` 布尔语义。
- `documentSessionRuntime.openDocumentPath` / `openRecent` 以及 startup / second-instance 入口，必须继续复用同一主进程目标预判 helper，不能分叉出另一套 recent / focus 语义。

- [ ] **Step 8: 重新运行 Electron 测试，确认转绿**

Run:
- `npm run test:run -- src/util/channel/ipcMainUtil.test.js`
- `npm run test:run -- src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js`
- `npm run test:run -- src/util/document-session/__tests__/windowLifecycleService.test.js`

Expected: PASS

## Task 4：去掉来源窗口自动回收的旧行为，并修正 runtime / recent 回归测试

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js`

- [ ] **Step 1: 先写 / 调整失败测试，表达新语义**

```js
it('new-window 打开其他文档后，不得自动关闭 pristine draft 来源窗口', async () => {
  expect(sourceWindow.close).not.toHaveBeenCalled()
})

it('命中 focused-existing-window 时，只能聚焦已有窗口，不得关闭来源窗口', async () => {
  expect(sourceWindow.close).not.toHaveBeenCalled()
})

it('recent-missing 提示在统一打开流程下仍然保留', async () => {
  expect(recentFileNotExists).toHaveBeenCalledWith('D:/docs/missing.md')
})
```

- [ ] **Step 2: 运行 runtime 测试，确认失败**

Run: `npm run test:run -- src/util/document-session/__tests__/documentSessionRuntime.test.js`

Expected: FAIL，提示仍存在自动关闭来源窗口的旧逻辑。

- [ ] **Step 3: 实现最小 runtime 修正**

```js
if (normalizedSourceWindowId != null
  && normalizedOpenedWindowId != null
  && String(normalizedOpenedWindowId) !== String(normalizedSourceWindowId)) {
  // 不再自动关闭来源窗口，来源窗口生命周期由用户显式控制。
}
```

实现位置：
- `openDocumentWindowWithRuntimePolicy()`
- `document.open-path` 走到的新窗口统一策略封装

- [ ] **Step 4: 重新运行 runtime 测试，确认转绿**

Run: `npm run test:run -- src/util/document-session/__tests__/documentSessionRuntime.test.js`

Expected: PASS

## Task 5：格式化、回归验证与收尾

**Files:**
- Modify: `wj-markdown-editor-web/src/util/document-session/documentOpenInteractionService.js`
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`
- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
- Modify: `wj-markdown-editor-web/src/util/document-session/currentWindowOpenPreparationService.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/rendererDocumentCommandUtil.js`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js`
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Modify: `wj-markdown-editor-web/src/util/shortcutKeyUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
- Modify: 本次任务涉及的相关测试文件，具体以 Step 1-4 中列出的 ESLint 与测试命令为准。

- [ ] **Step 1: 对 web 侧改动文件执行定向 ESLint**

Run:
`npx eslint --fix src/util/document-session/documentOpenInteractionService.js src/views/EditorView.vue src/views/PreviewView.vue src/views/HomeView.vue src/util/document-session/currentWindowOpenPreparationService.js src/util/document-session/rendererDocumentCommandUtil.js src/util/file-manager/fileManagerOpenDecisionController.js src/components/layout/LayoutMenu.vue src/util/file-manager/fileManagerPanelController.js src/util/shortcutKeyUtil.js src/util/document-session/__tests__/documentOpenInteractionService.test.js src/util/document-session/__tests__/currentWindowOpenPreparationService.test.js src/views/__tests__/editorViewCurrentWindowOpenPreparation.vitest.test.js src/views/__tests__/previewViewCurrentWindowOpenPreparation.vitest.test.js src/views/__tests__/homeViewFileManagerHost.vitest.test.js src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/__tests__/shortcutKeyUtil.vitest.test.js`

Workdir: `wj-markdown-editor-web`

Expected: 无报错退出

- [ ] **Step 2: 对 Electron 侧改动文件执行定向 ESLint**

Run:
`npx eslint --fix src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js src/util/document-session/documentEffectService.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/documentSessionRuntime.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/windowLifecycleService.js src/util/document-session/__tests__/windowLifecycleService.test.js`

Workdir: `wj-markdown-editor-electron`

Expected: 无报错退出

- [ ] **Step 3: 运行 web 侧相关测试集合**

Run:
- `npm run test:node -- src/util/document-session/__tests__/documentOpenInteractionService.test.js src/util/document-session/__tests__/currentWindowOpenPreparationService.test.js src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`
- `npm run test:component:run -- src/views/__tests__/editorViewCurrentWindowOpenPreparation.vitest.test.js src/views/__tests__/previewViewCurrentWindowOpenPreparation.vitest.test.js src/views/__tests__/homeViewFileManagerHost.vitest.test.js src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/__tests__/shortcutKeyUtil.vitest.test.js`

Workdir: `wj-markdown-editor-web`

Expected: PASS

- [ ] **Step 4: 运行 Electron 侧相关测试集合**

Run:
- `npm run test:run -- src/util/channel/ipcMainUtil.test.js`
- `npm run test:run -- src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/windowLifecycleService.test.js`

Workdir: `wj-markdown-editor-electron`

Expected: PASS

- [ ] **Step 5: 记录回归结果与剩余风险**

记录内容：
- 是否所有入口都改为“目标预判优先”
- `document.request-open-dialog` 是否已退化为“只选路径，不直接打开”
- 是否所有 `current-window` 流程都通过准备 service 稳定化正文
- `/preview` 路由下是否具备稳定快照降级实现
- 是否所有打开动作都不再自动关闭来源窗口
- 是否仍有未迁移的旧 IPC 命令调用方
- startup / second-instance 是否仍复用同一主进程目标预判 helper
- 旧 open-choice / save-choice 是否会在新请求、页面失活或 session identity 变化时主动失效
