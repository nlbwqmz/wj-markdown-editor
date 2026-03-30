# 文件管理栏 Follow-up 修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复主窗口文件管理栏在最终集成评审中暴露的目录越界创建、目录 watcher 重绑 silent failure、文件管理栏缺失文案和切换失败无提示问题，使整条 web/electron 集成链路达到可发布状态。

**Architecture:** 这轮 follow-up 继续沿用现有的 renderer 打开决策 + Electron document-session/runtime 主线，不新建旁路。目录名边界校验采用“Electron 服务层 fail-closed + renderer 输入层即时提示”的双层防线；目录 watcher 重绑改成显式成功语义，当前窗口切换只有在新目录绑定真实落地后才允许提交；文件管理栏所有实际使用到的文案和失败提示统一补齐到 i18n，并在统一打开决策 controller 中集中反馈。

**Tech Stack:** Vue 3、Pinia、Ant Design Vue、Electron 39、Vitest、Node `test`

---

## Task 4 执行记录

- [x] 已确认当前工作区仅包含 Follow-up 允许范围内的 13 个代码文件未提交改动，计划文档待在本任务内同步最终状态。
- [x] 已执行本轮实际改动文件的 ESLint 修复、聚焦回归与全量回归。
- [x] 已依据回归结果回填 Task 4 完成状态，并准备按固定提交信息执行最终提交。
- [x] 当前结果：web 聚焦回归 `3 files / 54 tests` 通过，electron 聚焦回归 `3 files / 103 tests` 通过，web 全量回归 `435 + 150 tests` 通过，electron 全量回归 `48 files / 731 tests` 通过。

### Task 1: 收口新建名称边界，禁止越出当前目录

**Files:**
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js`

- [ ] **Step 1: 先写失败测试，锁定目录越界与非法名称输入**

```js
it('createFolder/createMarkdown 遇到 ../ 或路径分隔符时必须拒绝创建并返回结构化失败', async () => {
  await expect(service.createFolder({ windowId: 1, name: '../escape-dir' })).resolves.toEqual({
    ok: false,
    reason: 'invalid-file-manager-entry-name',
  })
})

it('文件管理栏新建弹框输入非法名称时，应提示无效名称且不发起创建命令', async () => {
  expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.fileManagerInvalidEntryName')
  expect(fileManagerPanelState.requestFileManagerCreateFolder).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 运行定向测试，确认先失败**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentFileManagerService.test.js`

Expected: FAIL，说明当前仍允许 `../` 或分隔符越界。

- [ ] **Step 3: 在 renderer 输入层和 Electron 服务层同时收口名称校验**

```js
function isInvalidFileManagerEntryName(name) {
  return !name
    || name.includes('/')
    || name.includes('\\')
    || name === '.'
    || name === '..'
    || name.split('.').includes('..')
}

if (isInvalidFileManagerEntryName(nextValue)) {
  showWarning('message.fileManagerInvalidEntryName')
  return Promise.reject(new Error('file-manager-entry-name-invalid'))
}

if (isInvalidFileManagerEntryName(name)) {
  return {
    ok: false,
    reason: 'invalid-file-manager-entry-name',
  }
}
```

- [ ] **Step 4: 重跑定向测试，确认通过**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentFileManagerService.test.js`

Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js \
  wj-markdown-editor-web/src/i18n/zhCN.js \
  wj-markdown-editor-web/src/i18n/enUS.js \
  wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js \
  wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js \
  wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js
git commit -m "fix(file-manager): guard entry names"
```

### Task 2: 让目录 watcher 重绑 fail-closed，并阻止错误提交新会话

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentDirectoryWatchService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentDirectoryWatchService.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.test.js`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

- [ ] **Step 1: 先写失败测试，锁定 silent failure 现象**

```js
it('rebindWindowDirectory 创建 watcher 失败时必须显式返回失败，而不是保留旧 binding 冒充成功', async () => {
  expect(result).toEqual(expect.objectContaining({
    ok: false,
    reason: 'directory-watch-rebind-failed',
  }))
})

it('当前窗口切换文档时，如果目录 watcher 仍绑定旧目录，必须回滚旧 session', async () => {
  expect(result.reason).toBe('open-current-window-switch-failed')
  expect(currentSnapshot.sessionId).toBe(previousSnapshot.sessionId)
})

it('文件管理栏打开目录时，如果重绑 watcher 失败，不能把旧 binding 误当成新目录成功返回', async () => {
  expect(result).toEqual({
    ok: false,
    reason: 'open-directory-watch-failed',
  })
})

it('renderer 收到 open-directory-watch-failed 时，必须保留旧目录状态并提示失败', async () => {
  expect(controller.directoryPath.value).toBe('D:/docs')
  expect(messageWarning).toHaveBeenCalledWith('message.fileManagerOpenDirectoryFailed')
})
```

- [ ] **Step 2: 运行定向测试，确认先失败**

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentDirectoryWatchService.test.js src/util/document-session/__tests__/documentFileManagerService.test.js src/util/document-session/__tests__/windowLifecycleService.test.js`

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Expected: FAIL，说明当前仍把旧 binding 当成成功路径。

- [ ] **Step 3: 改目录 watcher 重绑契约为显式成功/失败语义**

```js
return {
  ok: false,
  reason: 'directory-watch-rebind-failed',
  directoryPath: currentWindowState?.directoryPath || null,
  activePath: currentWindowState?.activePath || null,
  error,
}

if (bindingResult?.ok === false || bindingResult?.directoryPath !== directoryState.directoryPath) {
  throw new Error('directory watcher binding mismatch')
}
```

- [ ] **Step 4: 让 openDirectory 和当前窗口切换都以新 binding 真正落地为成功前提**

```js
const bindingResult = await directoryWatchService.rebindWindowDirectory(...)
if (bindingResult?.ok === false || bindingResult?.directoryPath !== directoryPath) {
  return {
    ok: false,
    reason: 'open-directory-watch-failed',
  }
}

if (result?.ok === false && result.reason === 'open-directory-watch-failed') {
  showWarningMessage('message.fileManagerOpenDirectoryFailed')
  return result
}
```

- [ ] **Step 5: 重跑定向测试，确认通过**

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentDirectoryWatchService.test.js src/util/document-session/__tests__/documentFileManagerService.test.js src/util/document-session/__tests__/windowLifecycleService.test.js`

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Expected: PASS

- [ ] **Step 6: 提交本任务**

```bash
git add wj-markdown-editor-electron/src/util/document-session/documentDirectoryWatchService.js \
  wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js \
  wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js \
  wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js \
  wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js \
  wj-markdown-editor-electron/src/util/document-session/__tests__/documentDirectoryWatchService.test.js \
  wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js \
  wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.test.js
git commit -m "fix(file-manager): fail closed on directory rebind"
```

### Task 3: 补齐文件管理栏文案并把切换失败显式反馈给用户

**Files:**
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
- Test: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`

- [ ] **Step 1: 先写失败测试，锁定缺失 i18n 和 silent no-op**

```js
expect(zhCN.message.fileManagerSelectDirectory).toBeTruthy()
expect(zhCN.message.fileManagerDirectoryEmpty).toBeTruthy()
expect(zhCN.message.fileManagerCreateFolder).toBeTruthy()
expect(zhCN.message.fileManagerCreateMarkdown).toBeTruthy()
expect(zhCN.message.fileManagerOpenModeTitle).toBeTruthy()
expect(zhCN.message.fileManagerSaveBeforeSwitchTitle).toBeTruthy()
expect(zhCN.message.fileManagerDiscardAndSwitch).toBeTruthy()
expect(zhCN.message.fileManagerOpenDirectoryFailed).toBeTruthy()

it('当前窗口切换返回 save-before-switch-failed 时，必须提示用户失败原因', async () => {
  expect(mocked.showErrorMessage).toHaveBeenCalledWith('message.fileManagerSaveBeforeSwitchFailed')
})

it('当前窗口切换返回 open-current-window-switch-failed 时，必须提示用户失败原因', async () => {
  expect(mocked.showErrorMessage).toHaveBeenCalledWith('message.fileManagerOpenCurrentWindowFailed')
})
```

- [ ] **Step 2: 运行定向测试，确认先失败**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`

Expected: FAIL，提示文件管理栏 key 缺失或切换失败无提示。

- [ ] **Step 3: 补齐当前真实用到的 fileManager 文案 key**

```js
message: {
  fileManagerSelectDirectory: '选择目录',
  fileManagerDirectoryEmpty: '当前目录为空',
  fileManagerCreateFolder: '新建文件夹',
  fileManagerCreateMarkdown: '新建 Markdown',
  fileManagerFolderNameRequired: '请输入文件夹名称',
  fileManagerMarkdownNameRequired: '请输入 Markdown 文件名',
  fileManagerInvalidEntryName: '名称不能包含路径穿越或路径分隔符',
  fileManagerOpenModeTitle: '如何打开该文件？',
  fileManagerOpenModeTip: '请选择在当前窗口还是新窗口打开',
  fileManagerOpenInCurrentWindow: '当前窗口打开',
  fileManagerOpenInNewWindow: '新窗口打开',
  fileManagerSaveBeforeSwitchTitle: '切换前如何处理当前文件？',
  fileManagerSaveBeforeSwitch: '先保存再切换',
  fileManagerDiscardAndSwitch: '不保存并切换',
  fileManagerOpenDirectoryFailed: '打开目录失败，请重试。',
  fileManagerSaveBeforeSwitchFailed: '保存当前文件失败，已取消切换。',
  fileManagerOpenCurrentWindowFailed: '切换当前窗口失败，请重试。',
}
```

- [ ] **Step 4: 在统一打开决策 controller 中显式处理切换失败结果**

```js
if (dispatchResult?.reason === 'save-before-switch-failed') {
  showErrorMessage('message.fileManagerSaveBeforeSwitchFailed')
}
if (dispatchResult?.reason === 'open-current-window-switch-failed') {
  showErrorMessage('message.fileManagerOpenCurrentWindowFailed')
}
```

- [ ] **Step 5: 重跑定向测试，确认通过**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`

Expected: PASS

- [ ] **Step 6: 提交本任务**

```bash
git add wj-markdown-editor-web/src/i18n/zhCN.js \
  wj-markdown-editor-web/src/i18n/enUS.js \
  wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js \
  wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js \
  wj-markdown-editor-web/src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js \
  wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js \
  wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js
git commit -m "fix(file-manager): complete feedback messages"
```

### Task 4: 最终回归、格式化与集成提交

**Files:**
- Modify: `docs/superpowers/plans/2026-03-31-file-manager-panel-follow-up.md`
- Modify: `wj-markdown-editor-web/src/**`（仅限前 3 个任务实际改动文件）
- Modify: `wj-markdown-editor-electron/src/**`（仅限前 2 个任务实际改动文件）

- [x] **Step 1: 按实际改动文件执行 ESLint 修复**

Run in `wj-markdown-editor-web/`: `npx eslint --fix <本轮实际改动的 web 文件>`

Run in `wj-markdown-editor-electron/`: `npx eslint --fix <本轮实际改动的 electron 文件>`

- [x] **Step 2: 跑本轮聚焦回归**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentFileManagerService.test.js src/util/document-session/__tests__/documentDirectoryWatchService.test.js src/util/document-session/__tests__/windowLifecycleService.test.js`

Expected: PASS

- [x] **Step 3: 跑 web/electron 全量回归**

Run in `wj-markdown-editor-web/`: `npm run test:run`

Run in `wj-markdown-editor-electron/`: `npm run test:run`

Expected: PASS

- [x] **Step 4: 提交最终 follow-up**

```bash
git add docs/superpowers/plans/2026-03-31-file-manager-panel-follow-up.md \
  <本轮实际改动的 web 文件> \
  <本轮实际改动的 electron 文件>
git commit -m "fix(file-manager): harden panel edge cases"
```
