# File Manager Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为主窗口的编辑页与预览页增加左侧文件管理栏，并支持当前目录浏览、目录监听、新建目录/Markdown、当前窗口切换文档以及最近历史复用同一打开决策。

**Architecture:** 方案分成三层。Web 侧在 [HomeView](../../../wj-markdown-editor-web/src/views/HomeView.vue) 增加主窗口级左侧 split 与 `FileManagerPanel`，但不改动编辑器内部 preview/menu 布局；文件管理栏的运行时显隐状态放进 Pinia UI state，并且只在窗口初始化时由 `config.fileManagerVisible` 赋默认值。Electron 侧新增目录服务和目录监听桥接，统一通过 IPC 与 runtime 命令暴露；“当前窗口打开”使用新命令 `document.open-path-in-current-window`，通过“新建 session + 重新绑定 window -> session + 停止旧 watcher + 启动新 watcher”的方式切换文档，绝不复用旧 `sessionId`。

**Tech Stack:** Vue 3.5 + Pinia + Ant Design Vue 4 + split-grid + Electron 39 + fs-extra + Node `fs.watch` + Vitest + Node test

---

## 文件结构与职责

### Web 侧新增文件

- Create: `wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue`
  - 文件管理栏 UI 宿主，负责头部工具区、空状态、列表区、独立滚动与交互事件转发。
- Create: `wj-markdown-editor-web/src/components/layout/homeViewFilePanelLayoutUtil.js`
  - 计算主窗口外层文件管理栏布局类名、默认宽度与宽度钳制规则。
- Create: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelCommandUtil.js`
  - renderer 侧文件管理栏 IPC 命令包装，收口目录读取、目录切换、选择目录、创建目录、创建 Markdown、当前窗口打开。
- Create: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
  - 管理当前目录、目录项列表、空状态、目录变化事件订阅，以及“打开目录 / 选择目录 / 新建后重载”的运行时状态。
- Create: `wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js`
  - 统一处理“当前窗口 / 新窗口 / 取消”和“先保存再切换 / 不保存直接切换 / 取消”的打开决策，并供普通点击与新建 Markdown 成功后的继续打开复用。
- Create: `wj-markdown-editor-web/src/util/file-manager/fileManagerEventUtil.js`
  - 定义文件管理栏目录变化事件名，供主进程推送与 renderer 订阅复用。

### Web 侧修改文件

- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
  - 在主窗口内容区挂载外层 split、拖拽宽度钳制、文件管理栏和唤起手柄。
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`
  - 最近历史改走统一打开决策；View 菜单增加文件管理栏开关。
- Modify: `wj-markdown-editor-web/src/views/SettingView.vue`
  - 视图分组增加“默认显示文件管理栏”配置项。
- Modify: `wj-markdown-editor-web/src/stores/counter.js`
  - 增加文件管理栏运行时显隐状态，并在窗口初始化时用默认配置做一次性初始化。
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
  - 增加文件管理栏、打开决策、非支持文件提示等中文文案。
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
  - 增加对应英文文案。
- Modify: `wj-markdown-editor-web/src/util/document-session/rendererDocumentCommandUtil.js`
  - 暴露新的当前窗口打开命令包装。

### Web 侧新增/修改测试

- Create: `wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js`
- Create: `wj-markdown-editor-web/src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js`
- Create: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
- Create: `wj-markdown-editor-web/src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js`
- Create: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerPanelCommandUtil.vitest.test.js`
- Create: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`
- Create: `wj-markdown-editor-web/src/views/__tests__/settingViewFileManagerOption.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/homeViewShortcutKey.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/layoutMenuFullScreen.vitest.test.js`

### Electron 侧新增文件

- Create: `wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js`
  - 负责目录一层读取、创建文件夹、创建 Markdown 文件、默认目录解析。
- Create: `wj-markdown-editor-electron/src/util/document-session/documentDirectoryWatchService.js`
  - 负责当前目录一层监听、防抖重扫、按窗口维护当前显示目录与监听状态，并在目录切换或 session 切换时重绑监听目标。

### Electron 侧修改文件

- Modify: `wj-markdown-editor-electron/src/data/defaultConfig.js`
  - 增加文件管理栏默认显示配置。
- Modify: `wj-markdown-editor-electron/src/data/config/configSchema.js`
  - 校验新增配置字段。
- Modify: `wj-markdown-editor-electron/src/data/config/configRepairUtil.js`
  - 为旧配置补齐 `fileManagerVisible` 默认值，避免配置修复后丢字段。
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
  - 暴露文件管理栏目录命令、目录切换命令、目录选择命令和当前窗口打开命令。
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js`
  - 装配新的文件管理服务。
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
  - 注册 `document.open-path-in-current-window` 与文件管理栏命令路由。
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
  - 校验当前窗口切换目标路径，保留 `document.open-path` 旧语义不变。
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
  - 实现“新建 session + 当前窗口重绑 + watcher 重绑 + 清理旧 session”的切换流程，并维护目录监听生命周期。
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowSessionBridge.js`
  - 增加文件管理栏目录变化事件推送。

### Electron 侧新增/修改测试

- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentDirectoryWatchService.test.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.test.js`
- Modify: `wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js`
- Modify: `wj-markdown-editor-electron/src/data/config/__tests__/configRepairUtil.test.js`

## 约束与实现提醒

- 遵循 `@superpowers:verification-before-completion`，任何“已完成”结论都必须以实际测试输出为依据。
- 当前窗口切换严禁直接复用旧 `sessionId`。
- `document.open-path` 的既有“新建窗口或聚焦已有窗口”语义不能变化。
- 文件管理栏只监听当前显示目录一层，目录事件采用“防抖后整目录重扫”，不要实现增量 patch。
- 文件管理栏内部滚动必须隔离在侧栏自身容器中。
- View 菜单中的文件管理栏开关只控制当前窗口运行时状态；设置页 `fileManagerVisible` 只负责默认值，不要把即时开关直接写回配置。
- 文件管理栏运行时显隐状态放在 `wj-markdown-editor-web/src/stores/counter.js`，窗口初始化时从 `config.fileManagerVisible` 取默认值一次，后续设置页改默认值不反向覆盖当前窗口已切换的运行时状态。
- `FileManagerPanel.vue` 的背景、边框、高亮和 hover 必须复用现有主题变量，不能写死亮色背景或固定边框色。
- 所有新增注释与文档内容使用中文。

## 共享数据契约

- `directoryState` 至少固定以下字段：
  - `mode: 'empty' | 'directory'`
  - `directoryPath: string | null`
  - `activePath: string | null`
  - `entryList: Array<{ path: string, name: string, kind: 'directory' | 'file', extension: string | null }>`
- `document.open-path-in-current-window` 的 renderer -> main payload 固定为 `{ path: string, saveBeforeSwitch?: boolean }`。
- `requestDocumentOpenPathInCurrentWindow(path, options)` 的 `options.saveBeforeSwitch` 只由统一打开决策控制器传入：
  - 选择“先保存再切换”时传 `true`
  - 选择“不保存直接切换”时传 `false`
  - 任一阶段选择“取消”时不发 IPC，直接返回 `{ ok: false, reason: 'open-cancelled' }`
- `file-manager.create-folder` 返回完整 `directoryState`。
- `file-manager.create-markdown` 返回 `{ path, directoryState }`，其中 `path` 是新建 Markdown 的绝对路径。

### Task 1: 主窗口壳层文件管理栏布局与默认配置

**Files:**
- Create: `wj-markdown-editor-web/src/components/layout/homeViewFilePanelLayoutUtil.js`
- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
- Modify: `wj-markdown-editor-web/src/views/SettingView.vue`
- Modify: `wj-markdown-editor-web/src/stores/counter.js`
- Modify: `wj-markdown-editor-electron/src/data/defaultConfig.js`
- Modify: `wj-markdown-editor-electron/src/data/config/configSchema.js`
- Modify: `wj-markdown-editor-electron/src/data/config/configRepairUtil.js`
- Test: `wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js`
- Test: `wj-markdown-editor-web/src/views/__tests__/settingViewFileManagerOption.vitest.test.js`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js`
- Test: `wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js`
- Test: `wj-markdown-editor-electron/src/data/config/__tests__/configRepairUtil.test.js`

- [ ] **Step 1: 写主窗口壳层和设置项的失败测试**

```js
it('HomeView 主窗口壳层应挂载文件管理栏宿主与外层 gutter', () => {
  const wrapper = mountHomeView()
  expect(wrapper.find('[data-testid="home-file-manager-host"]').exists()).toBe(true)
  expect(wrapper.find('[data-testid="home-file-manager-gutter"]').exists()).toBe(true)
})

it('文件管理栏只应在 editor 与 preview 路由显示，在 setting / export / about / guide 路由隐藏', async () => {
  expect(await mountHomeViewByRoute('/editor').find('[data-testid="home-file-manager-host"]').exists()).toBe(true)
  expect(await mountHomeViewByRoute('/preview').find('[data-testid="home-file-manager-host"]').exists()).toBe(true)
  expect(await mountHomeViewByRoute('/setting').find('[data-testid="home-file-manager-host"]').exists()).toBe(false)
  expect(await mountHomeViewByRoute('/export').find('[data-testid="home-file-manager-host"]').exists()).toBe(false)
  expect(await mountHomeViewByRoute('/about').find('[data-testid="home-file-manager-host"]').exists()).toBe(false)
  expect(await mountHomeViewByRoute('/guide').find('[data-testid="home-file-manager-host"]').exists()).toBe(false)
})

it('设置页应提供默认显示文件管理栏配置项', () => {
  expect(source).toMatch(/config\.view\.defaultShowFileManager/u)
})

it('文件管理栏关闭后应保留左侧唤起手柄', () => {
  const wrapper = mountHomeView({ fileManagerPanelVisible: false })
  expect(wrapper.find('[data-testid="home-file-manager-reopen-handle"]').exists()).toBe(true)
})

it('拖动文件管理栏时应把宽度限制在 200 到 420 之间', () => {
  expect(clampFileManagerPanelWidth(120)).toBe(200)
  expect(clampFileManagerPanelWidth(520)).toBe(420)
})

it('文件管理栏关闭再打开后应重建 split-grid，拖拽能力继续可用', async () => {
  await toggleFileManagerVisible(false)
  await toggleFileManagerVisible(true)
  expect(createSplitInstance).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: 运行 web 侧测试，确认当前失败**

Run in `wj-markdown-editor-web/`: `npx vitest run src/views/__tests__/homeViewFileManagerHost.vitest.test.js src/views/__tests__/settingViewFileManagerOption.vitest.test.js src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js`

Expected: FAIL，提示找不到文件管理栏宿主节点或设置项文案。

- [ ] **Step 3: 写配置层失败测试**

```js
it('config schema 必须接纳 fileManagerVisible', () => {
  expect(() => validateConfigShape({ ...baseConfig, fileManagerVisible: true })).not.toThrow()
})
```

- [ ] **Step 4: 运行 Electron 配置测试，确认当前失败**

Run in `wj-markdown-editor-electron/`: `npx vitest run src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configRepairUtil.test.js`

Expected: FAIL，提示新增字段未被 schema 或 repair 逻辑接纳。

- [ ] **Step 5: 实现最小主窗口外层布局工具和运行时显隐状态**

```js
export const FILE_MANAGER_PANEL_DEFAULT_WIDTH = 260
export const FILE_MANAGER_PANEL_MIN_WIDTH = 200
export const FILE_MANAGER_PANEL_MAX_WIDTH = 420

export function clampFileManagerPanelWidth(width) {
  return Math.min(FILE_MANAGER_PANEL_MAX_WIDTH, Math.max(FILE_MANAGER_PANEL_MIN_WIDTH, width))
}

const fileManagerPanelVisible = ref(Boolean(configData.fileManagerVisible))

function setFileManagerPanelVisible(visible) {
  fileManagerPanelVisible.value = Boolean(visible)
}
```

- [ ] **Step 6: 补全 `homeViewFilePanelLayoutUtil.vitest.test.js` 中与拖拽钳制相关的失败断言**

```js
it('拖动文件管理栏时应把宽度限制在 200 到 420 之间', () => {
  expect(clampFileManagerPanelWidth(120)).toBe(200)
  expect(clampFileManagerPanelWidth(520)).toBe(420)
})
```

- [ ] **Step 7: 让 `HomeView` 先挂载 split 宿主、panel slot 占位节点、共用运行时显隐状态和唤起手柄，不提前依赖真实 `FileManagerPanel` 组件**

```vue
const shouldShowFileManagerShell = computed(() => ['editor', 'preview'].includes(String(route.name)))

<div class="h-0 flex-1 overflow-hidden">
  <template v-if="shouldShowFileManagerShell">
    <div data-testid="home-file-manager-host" class="grid h-full overflow-hidden">
      <div v-if="store.fileManagerPanelVisible" data-testid="home-file-manager-panel-slot" />
      <div v-if="store.fileManagerPanelVisible" data-testid="home-file-manager-gutter" />
      <button v-else data-testid="home-file-manager-reopen-handle" @click="store.setFileManagerPanelVisible(true)" />
      <LayoutContainer />
    </div>
  </template>
  <LayoutContainer v-else />
</div>
```

- [ ] **Step 8: 用 `split-grid` 在主窗口外层接通拖动调宽和最大/最小值钳制**

```js
splitInstance = Split({
  columnGutters: [{ track: 1, element: gutterRef.value }],
  minSize: FILE_MANAGER_PANEL_MIN_WIDTH,
  onDrag: () => {
    fileManagerWidth.value = clampFileManagerPanelWidth(readCurrentPanelWidth())
  },
})

watch(() => store.fileManagerPanelVisible, async (visible) => {
  splitInstance?.destroy?.()
  splitInstance = null
  if (visible) {
    await nextTick()
    splitInstance = createSplitInstance()
  }
})
```

- [ ] **Step 9: 在设置页、默认配置、schema 和 repair 逻辑中加入 `fileManagerVisible`**

```js
export default {
  ...,
  fileManagerVisible: true,
}
```

- [ ] **Step 10: 重新运行上述测试，确认通过**

Run in `wj-markdown-editor-web/`: `npx vitest run src/views/__tests__/homeViewFileManagerHost.vitest.test.js src/views/__tests__/settingViewFileManagerOption.vitest.test.js src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js`

Run in `wj-markdown-editor-electron/`: `npx vitest run src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configRepairUtil.test.js`

Expected: PASS

- [ ] **Step 11: 按文件做 ESLint 修复**

Run in `wj-markdown-editor-web/`: `npx eslint --fix src/views/HomeView.vue src/views/SettingView.vue src/stores/counter.js src/components/layout/homeViewFilePanelLayoutUtil.js`

Run in `wj-markdown-editor-electron/`: `npx eslint --fix src/data/defaultConfig.js src/data/config/configSchema.js src/data/config/configRepairUtil.js`

- [ ] **Step 12: 提交本任务**

```bash
git add wj-markdown-editor-web/src/views/HomeView.vue \
  wj-markdown-editor-web/src/views/SettingView.vue \
  wj-markdown-editor-web/src/stores/counter.js \
  wj-markdown-editor-web/src/components/layout/homeViewFilePanelLayoutUtil.js \
  wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js \
  wj-markdown-editor-web/src/components/layout/__tests__/homeViewFilePanelLayoutUtil.vitest.test.js \
  wj-markdown-editor-web/src/views/__tests__/settingViewFileManagerOption.vitest.test.js \
  wj-markdown-editor-electron/src/data/defaultConfig.js \
  wj-markdown-editor-electron/src/data/config/configSchema.js \
  wj-markdown-editor-electron/src/data/config/configRepairUtil.js \
  wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js \
  wj-markdown-editor-electron/src/data/config/__tests__/configRepairUtil.test.js
git commit -m "feat(layout): add file manager shell layout"
```

### Task 2: renderer 文件管理栏 UI、空状态与打开决策控制器

**Files:**
- Create: `wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue`
- Create: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Create: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelCommandUtil.js`
- Create: `wj-markdown-editor-web/src/util/file-manager/fileManagerEventUtil.js`
- Create: `wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js`
- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
- Modify: `wj-markdown-editor-web/src/util/document-session/rendererDocumentCommandUtil.js`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/util/channel/__tests__/eventUtil.vitest.test.js`
- Test: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerPanelCommandUtil.vitest.test.js`
- Test: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`
- Test: `wj-markdown-editor-web/src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`

- [ ] **Step 1: 写文件管理栏 UI 的失败测试**

```js
it('draft 会话应显示空状态，正常文件会话应显示目录列表并高亮当前文件', async () => {
  expect(screen.getByText('message')).toBeTruthy()
  expect(screen.getByTestId('file-manager-entry-current').classes()).toContain('is-active')
})

it('recent-missing 父目录存在时应展示该目录且无高亮，父目录不存在时应直接空状态', async () => {
  expect(screen.queryByTestId('file-manager-entry-current')).toBeNull()
  expect(screen.getByTestId('file-manager-empty-state')).toBeTruthy()
})

it('文件管理栏工具区应显示当前目录标题或面包屑', async () => {
  expect(screen.getByTestId('file-manager-breadcrumb')).toBeTruthy()
})

it('当前窗口切换文档后，文件管理栏应依据新的 session snapshot 重新解析目录并更新高亮', async () => {
  await applySnapshot(nextSnapshot)
  expect(reloadDirectoryStateFromSnapshot).toHaveBeenCalled()
})

it('目录、Markdown、其他文件应显示不同图标，长文件名保持单行省略', async () => {
  expect(screen.getByTestId('file-manager-entry-icon-directory')).toBeTruthy()
  expect(screen.getByTestId('file-manager-entry-name')).toHaveClass('truncate')
})
```

- [ ] **Step 2: 写打开决策控制器的失败测试**

```js
it('点击其他 markdown 时应先返回 open-choice，再在 dirty 文档下追加 save-choice', async () => {
  const result = await controller.openDocument('/tmp/next.md', { isDirty: true })
  expect(result.stageList).toEqual(['open-choice', 'save-choice', 'dispatch'])
})

it('选择新窗口打开时不应进入 save-choice，即使当前文档未保存', async () => {
  const result = await controller.openDocument('/tmp/next.md', { isDirty: true, openMode: 'new-window' })
  expect(result.stageList).toEqual(['open-choice', 'dispatch'])
})

it('目标文件已在其他窗口打开时应给出统一提示', async () => {
  await controller.openDocument('/tmp/next.md', { isDirty: false })
  expect(showInfoMessage).toHaveBeenCalledWith('message.fileAlreadyOpenedInOtherWindow')
})

it('rendererDocumentCommandUtil 应暴露 document.open-path-in-current-window 包装', async () => {
  await requestDocumentOpenPathInCurrentWindow('/tmp/next.md')
  expect(channelSend).toHaveBeenCalledWith(expect.objectContaining({
    event: 'document.open-path-in-current-window',
  }))
})

it('当前窗口打开包装应透传 saveBeforeSwitch 请求契约', async () => {
  await requestDocumentOpenPathInCurrentWindow('/tmp/next.md', { saveBeforeSwitch: true })
  expect(channelSend).toHaveBeenCalledWith(expect.objectContaining({
    event: 'document.open-path-in-current-window',
    data: expect.objectContaining({
      path: '/tmp/next.md',
      saveBeforeSwitch: true,
    }),
  }))
})

it('fileManagerPanelCommandUtil 应复用既有 open-dir-select IPC 作为选择目录能力', async () => {
  await requestFileManagerPickDirectory()
  expect(channelSend).toHaveBeenCalledWith(expect.objectContaining({
    event: 'open-dir-select',
  }))
})
```

- [ ] **Step 3: 运行 web 测试，确认当前失败**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/channel/__tests__/eventUtil.vitest.test.js src/util/file-manager/__tests__/fileManagerPanelCommandUtil.vitest.test.js src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`

Run in `wj-markdown-editor-web/`: `node ./scripts/runNodeTests.mjs src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`

Expected: FAIL，提示组件/控制器不存在或行为不符合预期。

- [ ] **Step 4: 先实现命令包装与事件常量，并显式复用已存在的 `open-dir-select` IPC 作为选择目录能力**

```js
export const FILE_MANAGER_DIRECTORY_CHANGED_EVENT = 'window.effect.file-manager-directory-changed'

export function requestFileManagerDirectoryState(payload) {
  return channelUtil.send({ event: 'file-manager.get-directory-state', data: payload })
}

export function requestFileManagerOpenDirectory(payload) {
  return channelUtil.send({ event: 'file-manager.open-directory', data: payload })
}

export function requestFileManagerCreateFolder(payload) {
  return channelUtil.send({ event: 'file-manager.create-folder', data: payload })
}

export function requestFileManagerCreateMarkdown(payload) {
  return channelUtil.send({ event: 'file-manager.create-markdown', data: payload })
}

export function requestFileManagerPickDirectory() {
  // 复用设置页已存在的选择目录能力，不新增主进程命令
  return channelUtil.send({ event: 'open-dir-select' })
}
```

- [ ] **Step 5: 实现 `fileManagerOpenDecisionController`，统一处理两层确认和跨窗口聚焦提示**

```js
if (targetPath === currentPath) {
  return { ok: true, reason: 'noop-current-file' }
}

if (selectedOpenMode === 'new-window') {
  return await requestDocumentOpenPath(targetPath)
}

if (selectedOpenMode === 'current-window' && selectedSaveChoice === 'cancel') {
  return { ok: false, reason: 'open-cancelled' }
}

if (selectedOpenMode === 'current-window') {
  const result = await requestDocumentOpenPathInCurrentWindow(targetPath, {
    saveBeforeSwitch: selectedSaveChoice === 'save-before-switch',
  })
  if (result?.reason === 'focused-existing-window') {
    message.info(t('message.fileAlreadyOpenedInOtherWindow'))
  }
  return result
}
```

- [ ] **Step 6: 为 `draft` 空状态动作入口和文件管理栏工具区动作写失败测试**

```js
it('draft 空状态应提供选择目录入口，并在选择成功后切换到该目录', async () => {
  expect(screen.getByTestId('file-manager-empty-open-directory')).toBeTruthy()
})

it('点击新建文件夹或新建 Markdown 时应先弹出单输入框 Modal 收集名称，取消时不发起创建', async () => {
  expect(openNameInputModal).toHaveBeenCalled()
})

it('新建文件夹成功后应刷新当前目录列表', async () => {
  await createFolder('assets')
  expect(reloadDirectoryState).toHaveBeenCalled()
})

it('新建 Markdown 成功后应复用统一打开决策控制器', async () => {
  await createMarkdown('draft-note.md')
  expect(openDecisionController.openDocument).toHaveBeenCalledWith(expect.stringContaining('draft-note.md'), expect.objectContaining({
    source: 'file-panel-create-markdown',
  }))
})
```

- [ ] **Step 7: 实现 `FileManagerPanel` 与 `fileManagerPanelController` 的最小可运行版本，并把 `HomeView` 里的 panel slot 替换为真实组件**

```vue
<div class="file-manager-panel h-full overflow-hidden">
  <div class="file-manager-panel__toolbar">
    <div data-testid="file-manager-breadcrumb" class="file-manager-panel__breadcrumb">...</div>
    <button data-testid="file-manager-create-folder" />
    <button data-testid="file-manager-create-markdown" />
  </div>
  <div class="file-manager-panel__list min-h-0 overflow-y-auto">
    <div class="file-manager-panel__entry truncate">
      <span data-testid="file-manager-entry-icon-directory" />
      <span data-testid="file-manager-entry-name" class="truncate">...</span>
    </div>
  </div>
</div>

<FileManagerPanel v-if="store.fileManagerPanelVisible" />
```

- [ ] **Step 8: 在控制器中接通“打开目录 / 选择目录 / 新建文件夹 / 新建 Markdown / 目录排序 / 目录切换后重载”**

```js
async function requestEntryName(kind) {
  return await openNameInputModal({
    kind,
    trim: true,
    emptyMessageKey: kind === 'folder' ? 'message.fileManagerFolderNameRequired' : 'message.fileManagerMarkdownNameRequired',
  })
}

async function openDirectory(targetPath) {
  const nextState = await requestFileManagerOpenDirectory({ directoryPath: targetPath })
  applyDirectoryState(nextState)
}

async function pickDirectory() {
  const selectedPath = await requestFileManagerPickDirectory()
  if (selectedPath) {
    await openDirectory(selectedPath)
  }
}

async function createFolder(name) {
  const nextState = await requestFileManagerCreateFolder({ name })
  applyDirectoryState(nextState)
}

async function createMarkdown(name) {
  const result = await requestFileManagerCreateMarkdown({ name })
  if (result?.directoryState) {
    applyDirectoryState(result.directoryState)
  }
  return result
}

const documentDirectoryIdentity = computed(() => {
  const snapshot = store.documentSessionSnapshot
  return [
    snapshot.sessionId,
    snapshot.path,
    snapshot.missingPath,
  ].join('::')
})

watch([
  documentDirectoryIdentity,
  () => store.fileManagerPanelVisible,
], async ([, visible]) => {
  if (visible) {
    await reloadDirectoryStateFromSnapshot(store.documentSessionSnapshot)
  }
}, { immediate: true })
```

- [ ] **Step 9: 复用现有 `eventUtil.link()` 原样透传主进程目录变化事件，并在 `eventUtil` 测试与控制器订阅链路中锁定该契约**

```js
it('eventUtil.link 应把 window.effect.file-manager-directory-changed 原样转发到 eventEmit', async () => {
  bridgeHandler({
    event: 'window.effect.file-manager-directory-changed',
    data: { directoryPath: 'D:/docs' },
  })
  expect(eventEmit.publish).toHaveBeenCalledWith('window.effect.file-manager-directory-changed', expect.any(Object))
})

window.node.sendToShow((obj) => {
  eventEmit.publish(obj.event, obj.data)
})

// 不额外扩展 document-session handler，文件管理栏直接消费原始窗口事件
const handleDirectoryChanged = (payload) => {
  applyDirectoryState(payload)
}

eventEmit.on(FILE_MANAGER_DIRECTORY_CHANGED_EVENT, handleDirectoryChanged)
onScopeDispose(() => eventEmit.remove(FILE_MANAGER_DIRECTORY_CHANGED_EVENT, handleDirectoryChanged))
```

- [ ] **Step 10: 让“新建文件夹成功后刷新列表，新建 Markdown 成功后走与点击 Markdown 相同的打开决策”**

```js
const createdResult = await requestFileManagerCreateMarkdown({ name })
if (createdResult?.directoryState) {
  applyDirectoryState(createdResult.directoryState)
}
if (createdResult?.path) {
  await openDecisionController.openDocument(createdResult.path, { source: 'file-panel-create-markdown' })
}
```

- [ ] **Step 11: 重新运行 web 测试，确认通过**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/channel/__tests__/eventUtil.vitest.test.js src/util/file-manager/__tests__/fileManagerPanelCommandUtil.vitest.test.js src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`

Run in `wj-markdown-editor-web/`: `node ./scripts/runNodeTests.mjs src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`

Expected: PASS

- [ ] **Step 12: 按文件做 ESLint 修复**

Run in `wj-markdown-editor-web/`: `npx eslint --fix src/views/HomeView.vue src/components/layout/FileManagerPanel.vue src/util/channel/__tests__/eventUtil.vitest.test.js src/util/file-manager/fileManagerPanelController.js src/util/file-manager/fileManagerPanelCommandUtil.js src/util/file-manager/fileManagerEventUtil.js src/util/file-manager/fileManagerOpenDecisionController.js src/util/file-manager/__tests__/fileManagerPanelCommandUtil.vitest.test.js src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js src/util/document-session/rendererDocumentCommandUtil.js`

- [ ] **Step 13: 提交本任务**

```bash
git add wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue \
  wj-markdown-editor-web/src/views/HomeView.vue \
  wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js \
  wj-markdown-editor-web/src/util/file-manager/fileManagerPanelCommandUtil.js \
  wj-markdown-editor-web/src/util/file-manager/fileManagerEventUtil.js \
  wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js \
  wj-markdown-editor-web/src/util/document-session/rendererDocumentCommandUtil.js \
  wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js \
  wj-markdown-editor-web/src/util/channel/__tests__/eventUtil.vitest.test.js \
  wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerPanelCommandUtil.vitest.test.js \
  wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js \
  wj-markdown-editor-web/src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js
git commit -m "feat(web): add file manager panel ui"
```

### Task 3: Electron 目录服务与当前目录监听

**Files:**
- Create: `wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/documentDirectoryWatchService.js`
  - 按窗口维护当前显示目录与 watcher 生命周期，提供 `ensureWindowDirectory`、`rebindWindowDirectory`、`rebindWindowDirectoryFromSession`、`stopWindowDirectory` 等接口。
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowSessionBridge.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentDirectoryWatchService.test.js`
- Test: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`

- [ ] **Step 1: 写目录服务的失败测试**

```js
it('正常文件会话应返回当前文件目录；draft 应返回空状态；recent-missing 父目录不存在也应返回空状态', async () => {
  expect(result.mode).toBe('empty')
})

it('recent-missing 父目录仍存在时应定位到原父目录，且当前高亮为空', async () => {
  expect(result.directoryPath).toBe('D:/docs')
  expect(result.activePath).toBe(null)
})

it('目录列表应保持目录在前、文件在后、同类按名称排序', async () => {
  expect(result.entryList.map(item => item.name)).toEqual(['assets', 'notes', 'a.md', 'z.txt'])
})

it('新建文件夹成功后应返回刷新后的目录列表', async () => {
  expect(result.entryList.map(item => item.name)).toContain('assets')
})

it('新建 Markdown 成功后应返回 path 与刷新后的目录列表', async () => {
  expect(result.path).toBe('D:/docs/draft-note.md')
  expect(result.directoryState.entryList.map(item => item.name)).toContain('draft-note.md')
})
```

- [ ] **Step 2: 写目录监听桥接的失败测试**

```js
it('正常文件会话首次读取当前目录状态时就应为该窗口绑定目录监听', async () => {
  await service.getDirectoryState({ windowId: 9 })
  expect(startWatching).toHaveBeenCalled()
})

it('draft 或 recent-missing 空状态下不应绑定目录 watcher', async () => {
  await service.getDirectoryState({ windowId: 9 })
  expect(startWatching).not.toHaveBeenCalled()
})

it('目录事件经防抖后应整目录重扫，并向指定窗口推送完整列表', async () => {
  expect(sendToRenderer).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    event: 'window.effect.file-manager-directory-changed',
  }))
})

it('切换目录后应停止旧目录监听并开始监听新目录', async () => {
  expect(stopWatching).toHaveBeenCalled()
  expect(startWatching).toHaveBeenCalledWith(expect.objectContaining({
    directoryPath: 'D:/docs/next',
  }))
})

it('同一窗口切换目录后，再次读取目录状态应返回新目录', async () => {
  await service.openDirectory({ windowId: 9, directoryPath: 'D:/docs/next' })
  await expect(service.getDirectoryState({ windowId: 9 })).resolves.toEqual(expect.objectContaining({
    directoryPath: 'D:/docs/next',
  }))
})

it('session 切换后应基于新 session 重新绑定窗口目录 watcher，并在空状态 session 下清理旧 watcher', async () => {
  await service.rebindWindowDirectoryFromSession(9, nextSession)
  expect(stopWatching).toHaveBeenCalledWith(9)
  expect(startWatching).toHaveBeenCalledWith(expect.objectContaining({
    windowId: 9,
    directoryPath: 'D:/docs',
  }))

  await service.rebindWindowDirectoryFromSession(9, draftSession)
  expect(clearWindowDirectory).toHaveBeenCalledWith(9)
})
```

- [ ] **Step 3: 运行 Electron 测试，确认当前失败**

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentFileManagerService.test.js src/util/document-session/__tests__/documentDirectoryWatchService.test.js src/util/channel/ipcMainUtil.test.js`

Expected: FAIL，提示服务或 IPC 事件不存在。

- [ ] **Step 4: 实现目录服务的一层读取与创建逻辑**

```js
if (isRecentMissingSnapshot(snapshot) && await fs.pathExists(parentDirectoryPath)) {
  return createDirectoryState({ directoryPath: parentDirectoryPath, activePath: null })
}

const directoryPath = resolveDirectoryPathFromWindow(windowId)
const entryList = (await fs.readdir(directoryPath, { withFileTypes: true }))
  .map(entry => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }))

async function createFolder({ windowId, name }) {
  const directoryPath = resolveDirectoryPathFromWindow(windowId)
  await fs.ensureDir(path.join(directoryPath, name))
  return await getDirectoryState({ windowId })
}

async function createMarkdown({ windowId, name }) {
  const directoryPath = resolveDirectoryPathFromWindow(windowId)
  const nextPath = appendMarkdownExtension(path.join(directoryPath, name))
  await fs.writeFile(nextPath, '', 'utf-8')
  return {
    path: nextPath,
    directoryState: await getDirectoryState({ windowId }),
  }
}
```

- [ ] **Step 5: 实现目录监听服务，采用“防抖 + 整目录重扫 + 按窗口保存当前目录”**

```js
watch(directoryPath, () => {
  clearTimeout(timer)
  timer = setTimeout(rescanDirectory, 120)
})
```

- [ ] **Step 6: 明确定义首次绑定、目录切换与 session 切换重绑接口，并在窗口级状态中保存监听目标**

```js
async function getDirectoryState({ windowId }) {
  const state = await resolveWindowDirectoryState(windowId)
  if (!state.directoryPath) {
    await directoryWatchService.clearWindowDirectory(windowId)
    return state
  }
  await directoryWatchService.ensureWindowDirectory(windowId, state.directoryPath)
  return state
}

async function openDirectory({ windowId, directoryPath }) {
  await directoryWatchService.rebindWindowDirectory(windowId, directoryPath)
  return await getDirectoryState({ windowId })
}

async function rebindWindowDirectoryFromSession(windowId, sessionSnapshot) {
  const state = await resolveDirectoryStateFromSession(sessionSnapshot)
  if (!state.directoryPath) {
    await clearWindowDirectory(windowId)
    return state
  }
  await rebindWindowDirectory(windowId, state.directoryPath, {
    activePath: state.activePath,
  })
  return state
}
```

- [ ] **Step 7: 在 composition、runtime、effect 和 IPC 中接线目录命令，并让目录服务实例暴露 `rebindWindowDirectoryFromSession` 供窗口生命周期链路复用**

```js
'file-manager.get-directory-state': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'file-manager.get-directory-state', data)
'file-manager.open-directory': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'file-manager.open-directory', data)
'file-manager.create-folder': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'file-manager.create-folder', data)
'file-manager.create-markdown': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'file-manager.create-markdown', data)

case 'file-manager.get-directory-state':
  return await fileManagerService.getDirectoryState({ windowId, payload })
case 'file-manager.open-directory':
  return await fileManagerService.openDirectory({ windowId, directoryPath: payload?.directoryPath })
case 'file-manager.create-folder':
  return await fileManagerService.createFolder({ windowId, name: payload?.name })
case 'file-manager.create-markdown':
  return await fileManagerService.createMarkdown({ windowId, name: payload?.name })

return {
  ...runtimeApi,
  fileManagerService,
  directoryWatchService,
}
```

- [ ] **Step 8: 通过 `windowSessionBridge` 增加目录变化推送**

```js
sendToRenderer(win, {
  event: 'window.effect.file-manager-directory-changed',
  data: payload,
})
```

- [ ] **Step 9: 重新运行 Electron 测试，确认通过**

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentFileManagerService.test.js src/util/document-session/__tests__/documentDirectoryWatchService.test.js src/util/channel/ipcMainUtil.test.js`

Expected: PASS

- [ ] **Step 10: 按文件做 ESLint 修复**

Run in `wj-markdown-editor-electron/`: `npx eslint --fix src/util/document-session/documentFileManagerService.js src/util/document-session/documentDirectoryWatchService.js src/util/channel/ipcMainUtil.js src/util/document-session/documentSessionRuntimeComposition.js src/util/document-session/documentSessionRuntime.js src/util/document-session/documentEffectService.js src/util/document-session/windowSessionBridge.js`

- [ ] **Step 11: 提交本任务**

```bash
git add wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js \
  wj-markdown-editor-electron/src/util/document-session/documentDirectoryWatchService.js \
  wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js \
  wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js \
  wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js \
  wj-markdown-editor-electron/src/util/document-session/documentEffectService.js \
  wj-markdown-editor-electron/src/util/document-session/windowSessionBridge.js \
  wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js \
  wj-markdown-editor-electron/src/util/document-session/__tests__/documentDirectoryWatchService.test.js \
  wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js
git commit -m "feat(electron): add file manager directory service"
```

### Task 4: 当前窗口打开命令与 session 重绑

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.test.js`
- Test: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`

- [ ] **Step 1: 写 runtime / effect / IPC 层失败测试**

```js
it('document.open-path-in-current-window 命中当前已打开文档时必须返回结构化 no-op，而不是重建 session', async () => {
  expect(await runtime.executeUiCommand(1, 'document.open-path-in-current-window', payload)).toEqual(expect.objectContaining({
    ok: true,
    reason: 'noop-current-file',
  }))
})

it('documentEffectService 应对 missing / invalid-extension / not-file 返回结构化失败结果', async () => {
  expect(result.reason).toBe('open-target-missing')
})

it('ipcMainUtil 应暴露 document.open-path-in-current-window 并透传到 runtime', async () => {
  expect(executeRuntimeUiCommand).toHaveBeenCalledWith(expect.anything(), 'document.open-path-in-current-window', payload)
})
```

- [ ] **Step 2: 写生命周期层失败测试**

```js
it('当前窗口切换文档时应新建 session、重绑窗口、停止旧 watcher、启动新 watcher，并销毁旧 session', async () => {
  expect(store.getSessionByWindowId(windowId)?.sessionId).toBe('next-session')
})

it('当前窗口切换文档或窗口关闭时，应停止旧目录 watcher，并按新 session 重绑目录 watcher', async () => {
  expect(directoryWatchService.stopWindowDirectory).toHaveBeenCalledWith(windowId)
  expect(directoryWatchService.rebindWindowDirectoryFromSession).toHaveBeenCalled()
})

it('当前窗口切换文档成功后，文件管理栏应按新 session 目录重新解析并更新高亮来源', async () => {
  expect(directoryWatchService.rebindWindowDirectoryFromSession).toHaveBeenCalledWith(windowId, expect.objectContaining({
    documentSource: expect.any(Object),
  }))
})

it('目标文件已在其他窗口打开时，即使当前文档是 dirty，也不进入保存决策，只返回 focused-existing-window', async () => {
  expect(saveDispatcher).not.toHaveBeenCalled()
  expect(result.reason).toBe('focused-existing-window')
})
```

- [ ] **Step 3: 运行 Electron 测试，确认当前失败**

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/windowLifecycleService.test.js src/util/channel/ipcMainUtil.test.js`

Expected: FAIL，提示新命令或切换行为不存在。

- [ ] **Step 4: 先在 IPC / effect / runtime 中引入新命令名，不修改旧 `document.open-path`**

```js
'document.open-path-in-current-window': async (windowContext, data) => {
  return await executeRuntimeUiCommand(windowContext, 'document.open-path-in-current-window', data)
}

case 'document.open-path-in-current-window': {
  const validationResult = await validateExplicitOpenTarget(targetPath, {
    baseDir: getOpenBaseDir(payload),
  })
  if (validationResult.ok !== true) {
    return validationResult
  }
  return await openDocumentInCurrentWindow(validationResult.path, payload)
}

case 'document.open-path-in-current-window':
  return await openDocumentInCurrentWindow(...)

if (targetPath === currentDocumentPath) {
  return { ok: true, reason: 'noop-current-file', path: targetPath }
}
```

- [ ] **Step 5: 在 `windowLifecycleService` 中实现“新建 session + 重绑窗口 + 目录 watcher 重绑”主链路**

```js
const { directoryWatchService } = getDocumentSessionRuntime()

if (targetPath === previousSession.documentSource.path) {
  return { ok: true, reason: 'noop-current-file', path: targetPath }
}

directoryWatchService.stopWindowDirectory(windowId)
stopExternalWatch(windowId)
store.createSession(nextSession)
store.bindWindowToSession({ windowId, sessionId: nextSession.sessionId })
publishSnapshotChanged(windowId)
await directoryWatchService.rebindWindowDirectoryFromSession(windowId, nextSession)
startExternalWatch(windowId)
store.destroySession(previousSession.sessionId)

function finalizeWindowClose(windowId) {
  directoryWatchService.stopWindowDirectory(windowId)
}
```

- [ ] **Step 6: 先处理“目标文件已在其他窗口打开”的聚焦分支，命中后直接返回，不进入保存决策**

```js
if (existingWindowId && String(existingWindowId) !== String(windowId)) {
  getWindowById(existingWindowId)?.show?.()
  return { ok: true, reason: 'focused-existing-window', windowId: existingWindowId }
}
```

- [ ] **Step 7: 再补上 dirty 文档的“先保存再切换 / 不保存直接切换”分支**

```js
if (payload.saveBeforeSwitch === true) {
  const saved = await executeDocumentSaveCommandWithDispatcher(windowId, dispatch)
  if (saved !== true) {
    return { ok: false, reason: 'switch-save-aborted' }
  }
}
```

- [ ] **Step 8: 重新运行 Electron 测试，确认通过**

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/windowLifecycleService.test.js src/util/channel/ipcMainUtil.test.js`

Expected: PASS

- [ ] **Step 9: 按文件做 ESLint 修复**

Run in `wj-markdown-editor-electron/`: `npx eslint --fix src/util/document-session/documentSessionRuntime.js src/util/document-session/documentEffectService.js src/util/document-session/windowLifecycleService.js src/util/channel/ipcMainUtil.js`

- [ ] **Step 10: 提交本任务**

```bash
git add wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js \
  wj-markdown-editor-electron/src/util/document-session/documentEffectService.js \
  wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js \
  wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js \
  wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js \
  wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js \
  wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.test.js \
  wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js
git commit -m "feat(session): support open in current window"
```

### Task 5: 最近历史复用统一打开决策并接通文件管理栏动作

**Files:**
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`
- Modify: `wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

- [ ] **Step 1: 写最近历史复用打开决策和 View 菜单开关的失败测试**

```js
it('最近历史点击应先进入统一打开决策，而不是直接 requestDocumentOpenPath', async () => {
  await recentItem.click()
  expect(openDecisionController.openDocument).toHaveBeenCalled()
})

it('View 菜单应提供文件管理栏开关，并随运行时状态切换 show/hide 文案', () => {
  expect(findViewMenuToggle(true).label).toContain('topMenu.view.children.hideFileManager')
  expect(findViewMenuToggle(false).label).toContain('topMenu.view.children.showFileManager')
})
```

- [ ] **Step 2: 写文件管理栏点击行为的失败测试**

```js
it('点击目录应进入目录，点击当前 markdown 应无操作，点击其他文件类型应提示不支持', async () => {
  await clickEntry('notes')
  expect(openDirectory).toHaveBeenCalled()

  await clickEntry('current.md')
  expect(openDecisionController.openDocument).not.toHaveBeenCalled()

  await clickEntry('archive.zip')
  expect(showUnsupportedFileTypeMessage).toHaveBeenCalled()
})

it('工具区新建文件夹应调用 controller.createFolder，新建 Markdown 应继续走统一打开决策', async () => {
  await clickToolbar('create-folder')
  expect(controller.createFolder).toHaveBeenCalled()

  await clickToolbar('create-markdown')
  expect(openDecisionController.openDocument).toHaveBeenCalled()
})
```

- [ ] **Step 3: 运行 web 测试，确认当前失败**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Expected: FAIL，提示最近历史仍在直连旧打开命令。

- [ ] **Step 4: 修改 `LayoutMenu`，让最近历史与 View 菜单开关接入统一控制器**

```js
click: async () => {
  const result = await openDecisionController.openDocument(item.path, { source: 'recent-menu' })
  if (isDocumentOpenMissingResult(result)) {
    commonUtil.recentFileNotExists(item.path)
  }
}

viewChildren.push({
  key: commonUtil.createId(),
  label: t(store.fileManagerPanelVisible ? 'topMenu.view.children.hideFileManager' : 'topMenu.view.children.showFileManager'),
  click: () => store.setFileManagerPanelVisible(!store.fileManagerPanelVisible),
})

watch(() => store.fileManagerPanelVisible, () => {
  updateMenuList()
}, { immediate: true })
```

- [ ] **Step 5: 修改文件管理栏点击行为**

```js
if (entry.kind === 'directory') {
  return enterDirectory(entry.path)
}
if (entry.extension === '.md') {
  return openDecisionController.openDocument(entry.path, { source: 'file-panel' })
}
return notifyUnsupportedFileType()
```

- [ ] **Step 6: 重新运行 web 测试，确认通过**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Expected: PASS

- [ ] **Step 7: 按文件做 ESLint 修复**

Run in `wj-markdown-editor-web/`: `npx eslint --fix src/components/layout/LayoutMenu.vue src/components/layout/FileManagerPanel.vue src/util/file-manager/fileManagerOpenDecisionController.js src/util/file-manager/fileManagerPanelController.js`

- [ ] **Step 8: 提交本任务**

```bash
git add wj-markdown-editor-web/src/components/layout/LayoutMenu.vue \
  wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue \
  wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js \
  wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js \
  wj-markdown-editor-web/src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js \
  wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js
git commit -m "feat(menu): reuse file open decision flow"
```

### Task 6: 国际化、回归测试与最终验证

**Files:**
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/stores/counter.js`
- Modify: `wj-markdown-editor-web/src/util/channel/__tests__/eventUtil.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/layoutMenuFullScreen.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/homeViewShortcutKey.vitest.test.js`
- Modify: `wj-markdown-editor-electron/src/data/config/configRepairUtil.js`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js`
- Test: `wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
- Test: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerPanelCommandUtil.vitest.test.js`
- Test: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentDirectoryWatchService.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentEffectService.test.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.test.js`
- Test: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`

- [ ] **Step 1: 补齐所有新增文案并写回归测试**

```js
expect(t('config.view.defaultShowFileManager')).toBeTruthy()
expect(t('message.unsupportedFileType')).toBeTruthy()
expect(t('message.fileAlreadyOpenedInOtherWindow')).toBeTruthy()
expect(t('topMenu.view.children.showFileManager')).toBeTruthy()
expect(t('topMenu.view.children.hideFileManager')).toBeTruthy()
```

- [ ] **Step 2: 运行 web 侧聚焦测试**

Run in `wj-markdown-editor-web/`: `npm run test:component:run -- src/views/__tests__/homeViewFileManagerHost.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/components/layout/__tests__/layoutMenuFileManagerOpenDecision.vitest.test.js src/util/channel/__tests__/eventUtil.vitest.test.js src/util/file-manager/__tests__/fileManagerPanelCommandUtil.vitest.test.js src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`

Run in `wj-markdown-editor-web/`: `node ./scripts/runNodeTests.mjs src/util/document-session/__tests__/rendererDocumentCommandUtil.test.js`

Expected: PASS

- [ ] **Step 3: 运行 Electron 侧聚焦测试**

Run in `wj-markdown-editor-electron/`: `npm run test:run -- src/util/document-session/__tests__/documentFileManagerService.test.js src/util/document-session/__tests__/documentDirectoryWatchService.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/documentEffectService.test.js src/util/document-session/__tests__/windowLifecycleService.test.js src/util/channel/ipcMainUtil.test.js`

Expected: PASS

- [ ] **Step 4: 运行两侧受影响文件的 ESLint 修复**

Run in `wj-markdown-editor-web/`: `npx eslint --fix src/i18n/zhCN.js src/i18n/enUS.js src/stores/counter.js src/util/channel/__tests__/eventUtil.vitest.test.js src/components/layout/LayoutMenu.vue src/components/layout/FileManagerPanel.vue src/views/HomeView.vue src/views/SettingView.vue src/util/file-manager/fileManagerPanelController.js src/util/file-manager/fileManagerPanelCommandUtil.js src/util/file-manager/fileManagerEventUtil.js src/util/file-manager/fileManagerOpenDecisionController.js src/util/document-session/rendererDocumentCommandUtil.js`

Run in `wj-markdown-editor-electron/`: `npx eslint --fix src/data/defaultConfig.js src/data/config/configSchema.js src/data/config/configRepairUtil.js src/util/channel/ipcMainUtil.js src/util/document-session/documentSessionRuntimeComposition.js src/util/document-session/documentSessionRuntime.js src/util/document-session/documentEffectService.js src/util/document-session/windowLifecycleService.js src/util/document-session/windowSessionBridge.js src/util/document-session/documentFileManagerService.js src/util/document-session/documentDirectoryWatchService.js`

- [ ] **Step 5: 执行最终最小回归**

Run in `wj-markdown-editor-web/`: `npm run test:run`

Run in `wj-markdown-editor-electron/`: `npm run test:run`

Expected: PASS

- [ ] **Step 6: 使用 `@superpowers:verification-before-completion` 检查所有验证输出，并整理变更摘要**

- [ ] **Step 7: 提交最终集成结果**

```bash
git add docs/superpowers/plans/2026-03-30-file-manager-panel.md \
  wj-markdown-editor-web/src \
  wj-markdown-editor-electron/src
git commit -m "feat(file-manager): add main window file manager panel"
```
