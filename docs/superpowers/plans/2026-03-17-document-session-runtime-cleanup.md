# document-session runtime cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有功能的前提下，删除 `document-session` 链路上的 compat / legacy 代码，建立清晰的 runtime / runner / registry / watch / lifecycle 边界，并最终删除 `winInfoUtil.js`。

**Architecture:** 本次改造在当前分支 `feature/document-session-save-refactor` 上进行，不创建额外 worktree。实施顺序固定为“先补行为基线测试，再分层替换，再删除兼容层”，并把已识别风险点前置映射到任务内，通过自动化验证、代码评审闸口和最终手工回归共同闭环。

**Tech Stack:** Electron 39、Vue 3、Node.js、Vitest、Node Test Runner、fs-extra、BrowserWindow、Pinia、现有 `document-session` 模块集。

---

## 文件结构

### 计划新增文件

- `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- `wj-markdown-editor-electron/src/util/document-session/documentCommandRunner.js`
- `wj-markdown-editor-electron/src/util/document-session/windowRegistry.js`
- `wj-markdown-editor-electron/src/util/document-session/externalWatchBridge.js`
- `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandRunner.test.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/windowRegistry.test.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/externalWatchBridge.test.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.test.js`

### 计划修改文件

- `wj-markdown-editor-electron/src/main.js`
- `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
- `wj-markdown-editor-electron/src/util/document-session/windowSessionBridge.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandService.test.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/watchCoordinator.test.js`
- `wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js`
- `wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js`
- `wj-markdown-editor-web/src/views/EditorView.vue`
- `wj-markdown-editor-web/src/util/document-session/rendererDocumentCommandUtil.js`
- `wj-markdown-editor-web/src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`
- `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionEventUtil.test.js`
- `wj-markdown-editor-web/src/util/document-session/__tests__/rendererSessionSnapshotController.test.js`

### 计划删除文件

- `wj-markdown-editor-electron/src/util/win/winInfoUtil.js`
- `wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js`

## 风险映射

## 执行约束

- 所有任务均在当前分支 `feature/document-session-save-refactor` 上完成
- 每个任务完成后必须先进行代码评审，没有问题后才能开始下一个任务
- 如果任务级代码评审发现问题，必须在当前任务内自动修复、重新运行该任务要求的测试与格式化，并重新发起代码评审
- 不允许带着已知问题进入下一个任务
- 全部任务执行完成后，必须针对本次更新范围执行一次全量代码评审
- 最终放行条件必须同时满足：
  - 无代码评审问题
  - 无功能前后不一致
  - 无功能降级

### 风险 1：保存链路与关闭链路交错时的时序回归

- 归属任务：Task 1、Task 3、Task 5
- 核心验证：
  - `documentCommandService.test.js`
  - `documentCommandRunner.test.js`
  - `windowLifecycleService.test.js`
- 代码评审重点：
  - `close-window` effect 不得早于保存结果收敛
  - 手动保存请求不得被后续 auto-save 串线

### 风险 2：watcher 重绑与迟到事件过滤回归

- 归属任务：Task 1、Task 4
- 核心验证：
  - `watchCoordinator.test.js`
  - `externalWatchBridge.test.js`
  - `documentEffectService.test.js`
- 代码评审重点：
  - 旧 token 与迟到 `observedAt` 必须被丢弃
  - 重绑失败只能回流 warning，不得升级成主保存失败

### 风险 3：startup / recent / open-path 多入口收口后的路径校验偏差

- 归属任务：Task 1、Task 3
- 核心验证：
  - `documentEffectService.test.js`
  - `ipcMainUtil.test.js`
  - `documentSessionRuntime.test.js`
- 代码评审重点：
  - 所有显式路径打开都走统一 opening policy
  - `.md` 目录、缺失路径、非 Markdown 文件全部统一拒绝

### 风险 4：删除兼容层后 web 端遗漏旧事件依赖

- 归属任务：Task 1、Task 6
- 核心验证：
  - `rendererDocumentCommandUtil.test.js`
  - `documentSessionEventUtil.test.js`
  - `rendererSessionSnapshotController.test.js`
  - `ipcMainUtil.test.js` 中的反向断言
- 代码评审重点：
  - renderer 不再发送 `file-content-update`
  - main 不再路由旧别名
  - renderer 仍只消费 `document.snapshot.changed` / `window.effect.*`

## Chunk 1: 基线与风险闸口

### Task 1: 补齐行为基线测试并冻结当前外部语义

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandService.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/watchCoordinator.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionEventUtil.test.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/__tests__/rendererSessionSnapshotController.test.js`

- [ ] **Step 1: 为 4 个风险点补齐或强化基线测试**

重点补齐以下断言：

```js
// 保存 / 关闭时序
expect(closeResult.effects.find(effect => effect.type === 'close-window')).toBeUndefined()

// watcher 重绑
expect(rebindRequested.effects).toContainEqual({
  type: 'rebind-watch',
  bindingToken: 2,
})

// opening policy
expect(result).toEqual({
  ok: false,
  reason: 'open-target-not-file',
  path: 'D:/folder.md',
})

// renderer 事件真相
assert.equal(DOCUMENT_SESSION_SNAPSHOT_CHANGED_EVENT, 'document.snapshot.changed')
```

- [ ] **Step 2: 运行 Electron 基线测试，确认当前行为已被冻结**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/win/winInfoUtil.test.js src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/windowSessionBridge.test.js
```

Expected: PASS，且没有新增 flaky 失败。

- [ ] **Step 3: 运行 web 侧基线测试，确认 snapshot 与命令契约稳定**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
node --test src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js src/util/document-session/__tests__/rendererSessionSnapshotController.test.js
```

Expected: PASS，且不依赖 `file-content-update` 之外的其他旧文档契约。

- [ ] **Step 4: 按包执行格式化**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npx eslint --fix src/util/win/winInfoUtil.test.js src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/windowSessionBridge.test.js
```

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npx eslint --fix src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js src/util/document-session/__tests__/rendererSessionSnapshotController.test.js
```

Expected: 无 ESLint 报错。

- [ ] **Step 5: 执行任务级代码评审并阻塞后续任务**

评审重点：

- 保存与关闭交错用例是否足以覆盖当前时序风险
- watcher / opening policy / renderer 事件真相是否各有明确断言
- 是否存在“只靠最后手工回归”的遗漏风险点

Expected: 无阻塞问题；如有问题，先修正测试再重新评审。

- [ ] **Step 6: 提交 Task 1**

```bash
git add wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandService.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/watchCoordinator.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/windowSessionBridge.test.js wj-markdown-editor-web/src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionEventUtil.test.js wj-markdown-editor-web/src/util/document-session/__tests__/rendererSessionSnapshotController.test.js
git commit -m "test: freeze document-session runtime behavior"
```

## Chunk 2: Runtime 核心拆分

### Task 2: 创建 `windowRegistry` 并收口窗口映射真相

**Files:**
- Create: `wj-markdown-editor-electron/src/util/document-session/windowRegistry.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowRegistry.test.js`

- [ ] **Step 1: 先写 `windowRegistry` 的失败测试**

```js
it('registerWindow / bindSession / unregisterWindow 应维护稳定映射', () => {
  const registry = createWindowRegistry()
  registry.registerWindow({ windowId: 1, win: {} })
  registry.bindSession({ windowId: 1, sessionId: 'session-1' })
  expect(registry.getSessionIdByWindowId(1)).toBe('session-1')
})
```

- [ ] **Step 2: 运行单测，确认当前缺少实现而失败**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/document-session/__tests__/windowRegistry.test.js
```

Expected: FAIL，提示找不到 `createWindowRegistry` 或相关 API。

- [ ] **Step 3: 写最小实现并明确 API 边界**

```js
export function createWindowRegistry() {
  return {
    registerWindow() {},
    unregisterWindow() {},
    bindSession() {},
    getWindowById() {},
    getSessionIdByWindowId() {},
    getAllWindows() {},
  }
}
```

- [ ] **Step 4: 重新运行测试并修正实现直到通过**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/document-session/__tests__/windowRegistry.test.js
```

Expected: PASS。

- [ ] **Step 5: 执行格式化**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npx eslint --fix src/util/document-session/windowRegistry.js src/util/document-session/__tests__/windowRegistry.test.js
```

- [ ] **Step 6: 执行任务级代码评审**

评审重点：

- 注册表是否只保存窗口身份映射，不混入文档状态
- API 是否足够支撑 runtime / lifecycle，而没有把 `winInfo` 老结构继续带进来

Expected: 无阻塞问题；如有问题，必须在当前任务内自动修复、重跑测试/格式化并重新评审。

- [ ] **Step 7: 提交 Task 2**

```bash
git add wj-markdown-editor-electron/src/util/document-session/windowRegistry.js wj-markdown-editor-electron/src/util/document-session/__tests__/windowRegistry.test.js
git commit -m "refactor: add window registry for document runtime"
```

### Task 3: 创建 `documentCommandRunner` 与 `documentSessionRuntime`，先收口执行链路

**Files:**
- Create: `wj-markdown-editor-electron/src/util/document-session/documentCommandRunner.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandRunner.test.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js`
- Modify: `wj-markdown-editor-electron/src/main.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`

- [ ] **Step 1: 先为 runner 和 runtime 写失败测试**

```js
it('runner 必须按 dispatch -> snapshot -> effects 的顺序执行', async () => {
  const events = []
  await runner.run({ command: 'document.save' })
  expect(events).toEqual(['dispatch', 'publish-snapshot', 'apply-effects'])
})

it('runtime 必须作为唯一组合根暴露 dispatch / executeUiCommand / getSessionSnapshot', () => {
  const runtime = createDocumentSessionRuntime()
  expect(typeof runtime.dispatch).toBe('function')
})
```

- [ ] **Step 2: 运行单测，确认当前缺少实现而失败**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/document-session/__tests__/documentCommandRunner.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js
```

Expected: FAIL。

- [ ] **Step 3: 实现最小 runner / runtime，并先让 `main.js` / `ipcMainUtil.js` 通过新 runtime 调用**

```js
export function createDocumentSessionRuntime(deps = {}) {
  const registry = deps.windowRegistry || createWindowRegistry()
  const store = createDocumentSessionStore()
  const commandService = createDocumentCommandService({ store, saveCoordinator: deps.saveCoordinator })
  return {
    dispatch() {},
    executeUiCommand() {},
    getSessionSnapshot() {},
  }
}
```

- [ ] **Step 4: 把 startup / recent / open-path 三类入口改走 runtime，并补测试**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/document-session/__tests__/documentCommandRunner.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/documentEffectService.test.js
```

Expected: PASS，且 `open-path` / `recent` / `document.get-session-snapshot` 继续保持原外部语义。

- [ ] **Step 5: 按包执行格式化**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npx eslint --fix src/main.js src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js src/util/document-session/documentCommandRunner.js src/util/document-session/documentSessionRuntime.js src/util/document-session/documentEffectService.js src/util/document-session/__tests__/documentCommandRunner.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js
```

- [ ] **Step 6: 执行任务级代码评审**

评审重点：

- 保存与关闭相关 effect 顺序是否保持不变
- `main.js` 和 `ipcMainUtil.js` 是否只剩 runtime 调用，不再承载业务裁决
- startup / recent / open-path 风险是否已由测试覆盖

Expected: 无阻塞问题；如有问题，必须在当前任务内自动修复、重跑测试/格式化并重新评审。

- [ ] **Step 7: 提交 Task 3**

```bash
git add wj-markdown-editor-electron/src/main.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js wj-markdown-editor-electron/src/util/document-session/documentEffectService.js wj-markdown-editor-electron/src/util/document-session/documentCommandRunner.js wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentCommandRunner.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js
git commit -m "refactor: introduce document session runtime"
```

## Chunk 3: Watch 与窗口生命周期剥离

### Task 4: 创建 `externalWatchBridge` 并删除 legacy watcher 补洞

**Files:**
- Create: `wj-markdown-editor-electron/src/util/document-session/externalWatchBridge.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/externalWatchBridge.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/watchCoordinator.test.js`
- Modify: `wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js`

- [ ] **Step 1: 先为 watch bridge 写失败测试**

```js
it('watch bridge 必须把 onExternalChange / onMissing / onRestored / onError 全部回流到统一命令', async () => {
  expect(dispatchedCommands).toEqual([
    'watch.file-changed',
    'watch.file-missing',
    'watch.file-restored',
    'watch.error',
  ])
})
```

- [ ] **Step 2: 运行单测，确认桥接层尚不存在**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/document-session/__tests__/externalWatchBridge.test.js
```

Expected: FAIL。

- [ ] **Step 3: 实现 watch bridge，并把当前 watcher 回调全部迁到 bridge**

```js
export function createExternalWatchBridge() {
  return {
    start() {},
    stop() {},
    markInternalSave() {},
  }
}
```

- [ ] **Step 4: 删除 legacy watcher 补洞 helper，并用测试覆盖重绑与迟到事件风险**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/document-session/__tests__/externalWatchBridge.test.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/win/winInfoUtil.test.js
```

Expected: PASS，且 watcher 重绑失败只产生 warning，不污染主保存结果。

- [ ] **Step 5: 执行格式化**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npx eslint --fix src/util/document-session/externalWatchBridge.js src/util/document-session/documentEffectService.js src/util/document-session/__tests__/externalWatchBridge.test.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/win/winInfoUtil.test.js
```

- [ ] **Step 6: 执行任务级代码评审**

评审重点：

- 所有 watcher 命令是否都经由统一命令流
- stale token / stale observedAt 是否都有明确丢弃策略
- 是否还有任何 legacy watcher 直接改 session 或直接发 renderer 事件

Expected: 无阻塞问题；如有问题，必须在当前任务内自动修复、重跑测试/格式化并重新评审。

- [ ] **Step 7: 提交 Task 4**

```bash
git add wj-markdown-editor-electron/src/util/document-session/externalWatchBridge.js wj-markdown-editor-electron/src/util/document-session/documentEffectService.js wj-markdown-editor-electron/src/util/document-session/__tests__/externalWatchBridge.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/watchCoordinator.test.js wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js
git commit -m "refactor: extract external watch bridge"
```

### Task 5: 创建 `windowLifecycleService`，迁移 BrowserWindow 接线并删除 `winInfoUtil`

**Files:**
- Create: `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.test.js`
- Modify: `wj-markdown-editor-electron/src/main.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Delete: `wj-markdown-editor-electron/src/util/win/winInfoUtil.js`
- Delete: `wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js`

- [ ] **Step 1: 为窗口生命周期服务写失败测试**

```js
it('close 事件命中 hold-window-close 时必须阻止 BrowserWindow 立即关闭', async () => {
  expect(closePrevented).toBe(true)
})

it('force-close 命中 confirm-force-close 时必须直接关闭窗口', async () => {
  expect(closedWindowIds).toEqual([1])
})
```

- [ ] **Step 2: 运行单测，确认生命周期服务尚不存在**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/document-session/__tests__/windowLifecycleService.test.js
```

Expected: FAIL。

- [ ] **Step 3: 实现 `windowLifecycleService`，把 createNew / close / blur / open-handler 全部迁入新服务**

```js
export function createWindowLifecycleService() {
  return {
    createWindow() {},
    openDocumentPath() {},
    handleSecondInstanceOpen() {},
  }
}
```

- [ ] **Step 4: 让 `main.js` 和 `ipcMainUtil.js` 改依赖 runtime + lifecycle，移除 `winInfoUtil`**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/document-session/__tests__/windowLifecycleService.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/documentCommandService.test.js
```

Expected: PASS，且所有文档命令仍能在窗口上下文内正确命中 active session。

- [ ] **Step 5: 执行格式化**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npx eslint --fix src/main.js src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js src/util/document-session/windowLifecycleService.js src/util/document-session/__tests__/windowLifecycleService.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/documentCommandService.test.js
```

- [ ] **Step 6: 执行任务级代码评审**

评审重点：

- 保存 / 关闭链路时序是否仍与基线一致
- `winInfoUtil` 是否已完全退出主链路
- 是否仍存在通过窗口对象偷读文档状态的路径

Expected: 无阻塞问题；如有问题，必须在当前任务内自动修复、重跑测试/格式化并重新评审。

- [ ] **Step 7: 提交 Task 5**

```bash
git add wj-markdown-editor-electron/src/main.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.test.js
git rm wj-markdown-editor-electron/src/util/win/winInfoUtil.js wj-markdown-editor-electron/src/util/win/winInfoUtil.test.js
git commit -m "refactor: remove legacy win info utility"
```

## Chunk 4: Renderer / IPC 契约清理与终态验证

### Task 6: 迁移 renderer 到 `document.edit`，删除旧 IPC 别名与 compat 字符串

**Files:**
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/util/document-session/rendererDocumentCommandUtil.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionEventUtil.test.js`
- Modify: `wj-markdown-editor-web/src/util/document-session/__tests__/rendererSessionSnapshotController.test.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`

- [ ] **Step 1: 先写 renderer 命令工具的失败测试，要求改发 `document.edit`**

```js
await requestDocumentEdit('# 新内容')
assert.deepEqual(sentPayloadList[0], {
  event: 'document.edit',
  data: { content: '# 新内容' },
})
```

- [ ] **Step 2: 运行 web 单测，确认当前仍在发送 `file-content-update` 而失败**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
node --test src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js
```

Expected: FAIL。

- [ ] **Step 3: 为 renderer 命令工具增加 `requestDocumentEdit`，并替换 `EditorView.vue` 里的旧发送逻辑**

```js
export function requestDocumentEdit(content) {
  return channelUtil.send({
    event: 'document.edit',
    data: { content },
  })
}
```

- [ ] **Step 4: 删除 `ipcMainUtil` 中的旧别名路由与兼容注释**

要删除的目标至少包括：

```js
'file-content-update'
'delete-local-resource'
'get-local-resource-info'
'get-local-resource-comparable-key'
```

- [ ] **Step 5: 运行跨包测试，确认 web 与 Electron 只剩正式契约**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
node --test src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js src/util/document-session/__tests__/rendererSessionSnapshotController.test.js
```

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/windowSessionBridge.test.js
```

Expected: PASS，且 `ipcMainUtil.test.js` 的反向断言明确证明旧别名已删除。

- [ ] **Step 6: 按包执行格式化**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npx eslint --fix src/views/EditorView.vue src/util/document-session/rendererDocumentCommandUtil.js src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js src/util/document-session/__tests__/rendererSessionSnapshotController.test.js
```

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npx eslint --fix src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/windowSessionBridge.test.js
```

- [ ] **Step 7: 执行任务级代码评审**

评审重点：

- renderer 是否已不再发送 `file-content-update`
- IPC 是否只保留正式文档命令与正式资源命令
- renderer 是否仍只依赖 `document.snapshot.changed` 与 `window.effect.*`

Expected: 无阻塞问题；如有问题，必须在当前任务内自动修复、重跑测试/格式化并重新评审。

- [ ] **Step 8: 提交 Task 6**

```bash
git add wj-markdown-editor-web/src/views/EditorView.vue wj-markdown-editor-web/src/util/document-session/rendererDocumentCommandUtil.js wj-markdown-editor-web/src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js wj-markdown-editor-web/src/util/document-session/__tests__/documentSessionEventUtil.test.js wj-markdown-editor-web/src/util/document-session/__tests__/rendererSessionSnapshotController.test.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js
git commit -m "refactor: remove legacy document session ipc aliases"
```

### Task 7: 终态清理、全量验证与手工回归

**Files:**
- Modify: `wj-markdown-editor-electron/src/main.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/externalWatchBridge.js`
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`

- [ ] **Step 1: 扫描仓库，确认兼容入口已全部不可达**

Run:

```bash
rg -n "file-content-update|delete-local-resource|get-local-resource-info|get-local-resource-comparable-key|pendingCompatSavePath|defineCompatPathAccessor|legacy-watch|winInfoUtil" D:\code\wj-markdown-editor
```

Expected: 除计划文档、历史 Git 对象和必要注释外，主代码路径中无残留。

- [ ] **Step 2: 运行 Electron 侧全量目标测试**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run test:run -- src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/documentCommandRunner.test.js src/util/document-session/__tests__/windowRegistry.test.js src/util/document-session/__tests__/externalWatchBridge.test.js src/util/document-session/__tests__/windowLifecycleService.test.js src/util/document-session/__tests__/watchCoordinator.test.js src/util/document-session/__tests__/windowSessionBridge.test.js src/util/document-session/__tests__/documentResourceService.test.js
```

Expected: PASS。

- [ ] **Step 3: 运行 web 侧全量 document-session 测试**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
node --test src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js src/util/document-session/__tests__/documentSessionEventUtil.test.js src/util/document-session/__tests__/documentSessionSnapshotUtil.test.js src/util/document-session/__tests__/editorSessionSnapshotController.test.js src/util/document-session/__tests__/recentMissingPromptController.test.js src/util/document-session/__tests__/rendererSessionActivationStrategy.test.js src/util/document-session/__tests__/rendererSessionEventSubscription.test.js src/util/document-session/__tests__/rendererSessionSnapshotController.test.js
```

Expected: PASS。

- [ ] **Step 4: 运行必要格式化**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npx eslint --fix src/main.js src/util/channel/ipcMainUtil.js src/util/document-session/documentSessionRuntime.js src/util/document-session/documentCommandRunner.js src/util/document-session/windowRegistry.js src/util/document-session/externalWatchBridge.js src/util/document-session/windowLifecycleService.js
```

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npx eslint --fix src/views/EditorView.vue src/util/document-session/rendererDocumentCommandUtil.js
```

- [ ] **Step 5: 执行手工回归**

回归场景：

- 新建草稿，编辑后首次保存
- 已有文件编辑，Ctrl+S 保存
- 开启 auto-save 后触发 blur / close
- 外部修改文件，验证 apply / ignore
- recent 打开、recent 缺失处理
- 预览区资源打开、删除、本地路径比较

Expected: 与基线行为一致。

- [ ] **Step 6: 执行最终代码评审并阻塞收尾**

评审重点：

- `winInfoUtil` 删除后是否仍保有单一真相
- 4 个风险点是否都已在任务内完成实现闭环
- 是否还有任何“只剩最后人工兜底”的已知问题
- 本次更新前后是否存在功能不一致
- 本次更新是否引入任何功能降级

Expected: 评审结论必须为无问题；如有问题，必须自动修复并回到对应任务补齐，直到全量代码评审结论为“无问题、无功能前后不一致、无功能降级”。

- [ ] **Step 7: 提交 Task 7**

```bash
git add wj-markdown-editor-electron/src/main.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js wj-markdown-editor-electron/src/util/document-session/documentCommandRunner.js wj-markdown-editor-electron/src/util/document-session/windowRegistry.js wj-markdown-editor-electron/src/util/document-session/externalWatchBridge.js wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js wj-markdown-editor-web/src/views/EditorView.vue wj-markdown-editor-web/src/util/document-session/rendererDocumentCommandUtil.js
git commit -m "refactor: finalize document session runtime cleanup"
```
