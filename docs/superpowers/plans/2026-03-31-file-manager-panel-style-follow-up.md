# File Manager Panel Style Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成文件管理栏样式与导航补充，统一滚动条和边框表现，新增“上一级”能力，去掉关闭态箭头区域，并补齐 `createFolder()` 的已存在失败契约。

**Architecture:** 这轮实现继续沿用现有 `FileManagerPanel -> fileManagerPanelController -> file-manager IPC -> documentFileManagerService` 主线，不新建旁路。主进程只补 `createFolder()` 的 already-exists 返回契约；renderer 侧复用现有失败提示链路，同时在组件层补按钮、滚动条、边框和关闭态样式。编辑页大纲边框只做条件样式增强，不改 split-grid 结构。

**Tech Stack:** Vue 3、Pinia、Ant Design Vue、Electron 39、Vitest、Node `test`

---

## File Map

- `wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js`
  负责补齐 `createFolder()` 的“同名目录 / 同名文件已存在”失败返回。
- `wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js`
  负责锁定 `createFolder()` already-exists 行为。
- `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
  负责返回上一级的派生状态与动作，继续复用已有失败提示链路。
- `wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue`
  负责工具栏按钮、列表滚动条、当前文件文字高亮和测试标识。
- `wj-markdown-editor-web/src/views/HomeView.vue`
  负责文件管理栏宿主 / gutter 顶部边框和关闭态移除箭头区。
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
  负责仅在左侧大纲布局时给大纲容器挂右侧边框 class。
- `wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue`
  负责承接大纲边框样式。
- `wj-markdown-editor-web/src/i18n/zhCN.js`
  负责新增“上一级”按钮相关中文文案。
- `wj-markdown-editor-web/src/i18n/enUS.js`
  负责新增“上一级”按钮相关英文文案。
- `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
  负责文件管理栏按钮、滚动条、高亮和 createFolder already-exists 提示回归。
- `wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js`
  负责 HomeView 关闭态和顶部边框回归。
- `wj-markdown-editor-web/src/components/editor/__tests__/markdownEditLayoutRuntime.vitest.test.js`
  负责左侧大纲布局边框 class 回归。

### Task 1: 补齐 Electron `createFolder()` 的 already-exists 契约

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js`

- [ ] **Step 1: 写同名目录已存在的失败测试**

```js
it('createFolder 命中已存在目录时，必须显式返回 file-manager-entry-already-exists', async () => {
  await fs.ensureDir(path.join(directoryPath, 'assets'))

  await expect(service.createFolder({
    windowId: 9,
    name: 'assets',
  })).resolves.toEqual({
    ok: false,
    reason: 'file-manager-entry-already-exists',
    path: path.join(directoryPath, 'assets'),
  })
})
```

- [ ] **Step 2: 写同名文件已存在的失败测试**

```js
it('createFolder 命中同名文件时，也必须显式返回 file-manager-entry-already-exists', async () => {
  await fs.writeFile(path.join(directoryPath, 'assets'), 'occupied', 'utf8')

  await expect(service.createFolder({
    windowId: 9,
    name: 'assets',
  })).resolves.toEqual({
    ok: false,
    reason: 'file-manager-entry-already-exists',
    path: path.join(directoryPath, 'assets'),
  })
})
```

- [ ] **Step 3: 运行 Electron 定向测试，确认先失败**

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentFileManagerService.test.js`

Expected: FAIL，说明 `createFolder()` 仍把“已存在目标”当作成功目录状态。

- [ ] **Step 4: 在 `createFolder()` 中补齐 fail-closed 返回**

```js
async function createFolder({ windowId, name }) {
  const nextName = normalizeFileManagerEntryName(name)
  // 保留现有非法名称分支

  const directoryPath = directoryPathResult.directoryPath || null
  const nextPath = path.join(directoryPath, nextName)

  if (await fsModule.pathExists(nextPath)) {
    return createFileManagerEntryAlreadyExistsResult(nextPath)
  }

  await fsModule.ensureDir(nextPath)
  return await getDirectoryState({ windowId })
}
```

- [ ] **Step 5: 重跑 Electron 定向测试，确认转绿**

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentFileManagerService.test.js`

Expected: PASS

- [ ] **Step 6: 提交本任务**

```bash
git add wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js \
  wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js
git commit -m "fix(file-manager): return exists for create folder"
```

### Task 2: 在 renderer controller 中增加“上一级”能力并确认复用已有失败提示

**Files:**
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

- [ ] **Step 1: 写 controller 级失败测试，锁定返回上一级的状态与动作**

```js
it('openParentDirectory 在普通目录下应打开父目录，在根目录下应返回 noop', async () => {
  controller.applyDirectoryState(createDirectoryState({
    directoryPath: 'D:/docs/project',
    entryList: [],
  }))

  await controller.openParentDirectory()

  expect(fileManagerPanelState.requestFileManagerOpenDirectory).toHaveBeenCalledWith({
    directoryPath: 'D:/docs',
  })
  expect(controller.canOpenParentDirectory.value).toBe(true)
})
```

- [ ] **Step 2: 写 createFolder already-exists 回归测试，确认 renderer 继续复用已有提示**

```js
it('createFolder 收到 file-manager-entry-already-exists 时，应提示用户并保留当前目录状态', async () => {
  fileManagerPanelState.requestFileManagerCreateFolder.mockResolvedValue({
    ok: false,
    reason: 'file-manager-entry-already-exists',
    path: 'D:/docs/assets',
  })

  const result = await controller.createFolder('assets')

  expect(result.reason).toBe('file-manager-entry-already-exists')
  expect(fileManagerPanelState.messageWarning).toHaveBeenCalledWith('translated:message.fileManagerEntryAlreadyExists')
  expect(controller.directoryPath.value).toBe('D:/docs')
})
```

- [ ] **Step 3: 运行 Web 定向测试，确认先失败**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Expected: FAIL，说明 controller 还没有公开“上一级”能力或 createFolder 链路未覆盖。

- [ ] **Step 4: 复用现有路径工具实现 `canOpenParentDirectory` / `openParentDirectory`**

```js
const parentDirectoryPath = computed(() => getPathDirname(directoryPath.value))
const canOpenParentDirectory = computed(() => {
  const currentPath = normalizeComparablePath(directoryPath.value)
  const parentPath = normalizeComparablePath(parentDirectoryPath.value)
  return Boolean(currentPath && parentPath && currentPath !== parentPath)
})

async function openParentDirectory() {
  if (canOpenParentDirectory.value !== true) {
    return {
      ok: true,
      reason: 'noop-parent-directory',
    }
  }

  return await openDirectory(parentDirectoryPath.value)
}
```

- [ ] **Step 5: 补齐“上一级”按钮文案 key**

```js
message: {
  fileManagerOpenParentDirectory: '返回上一级',
}
```

```js
message: {
  fileManagerOpenParentDirectory: 'Go to parent directory',
}
```

- [ ] **Step 5.1: 把新 key 纳入现有文案完整性测试**

```js
expect(zhCN.message.fileManagerOpenParentDirectory).toBeTruthy()
expect(enUS.message.fileManagerOpenParentDirectory).toBeTruthy()
```

- [ ] **Step 6: 重跑 Web 定向测试，确认转绿**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Expected: PASS

- [ ] **Step 7: 提交本任务**

```bash
git add wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js \
  wj-markdown-editor-web/src/i18n/zhCN.js \
  wj-markdown-editor-web/src/i18n/enUS.js \
  wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js
git commit -m "feat(file-manager): support opening parent directory"
```

### Task 3: 调整文件管理栏组件的工具栏、滚动条和当前文件高亮

**Files:**
- Modify: `wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue`
- Test: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

- [ ] **Step 1: 写组件失败测试，锁定按钮、滚动条和当前文件高亮语义**

```js
it('文件管理栏应渲染上一级按钮，并把列表滚动容器挂到 wj-scrollbar', async () => {
  expect(wrapper.get('[data-testid="file-manager-open-parent"]').exists()).toBe(true)
  expect(wrapper.get('.file-manager-panel__list').classes()).toContain('wj-scrollbar')
})

it('根目录或无目录时，上一级按钮应保持禁用', async () => {
  expect(wrapper.get('[data-testid="file-manager-open-parent"]').attributes('disabled')).toBeDefined()
})

it('当前文件高亮应保留激活态 class，但不再依赖背景块表达', async () => {
  expect(wrapper.get('[data-testid="file-manager-entry-current"]').classes()).toContain('is-active')
})
```

- [ ] **Step 2: 运行 Web 定向测试，确认先失败**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Expected: FAIL，说明模板和样式还没切到新方案。

- [ ] **Step 3: 在模板中接入“上一级”按钮和 `wj-scrollbar`**

```vue
<button
  type="button"
  data-testid="file-manager-open-parent"
  class="file-manager-panel__action-btn"
  :title="t('message.fileManagerOpenParentDirectory')"
  :disabled="!canOpenParentDirectory"
  @click="openParentDirectory"
>
  <span class="i-tabler:corner-left-up" />
</button>

<div
  v-else-if="entryList.length > 0"
  class="file-manager-panel__list wj-scrollbar h-full min-h-0 overflow-y-auto px-2 py-2"
>
```

- [ ] **Step 4: 把默认项颜色下沉为次级色，激活态改成文字高亮**

```scss
.file-manager-panel__entry {
  color: var(--wj-markdown-text-secondary);

  &:hover {
    background: var(--wj-markdown-bg-hover);
    color: var(--wj-markdown-text-primary);
  }

  &.is-active {
    background: transparent;
    color: var(--wj-markdown-text-primary);
    box-shadow: none;
    font-weight: 500;
  }
}
```

- [ ] **Step 5: 重跑 Web 定向测试，确认转绿**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Expected: PASS

- [ ] **Step 6: 提交本任务**

```bash
git add wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue \
  wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js
git commit -m "style(file-manager): refresh panel actions and highlight"
```

### Task 4: 调整 HomeView 壳层边框与关闭态，并补左侧大纲右边框

**Files:**
- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue`
- Test: `wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js`
- Test: `wj-markdown-editor-web/src/components/editor/__tests__/markdownEditLayoutRuntime.vitest.test.js`

- [ ] **Step 1: 写 HomeView 失败测试，锁定顶部边框和关闭态移除箭头区**

```js
it('文件管理栏关闭后不再渲染左侧唤起手柄', async () => {
  expect(wrapper.find('[data-testid="home-file-manager-reopen-handle"]').exists()).toBe(false)
})

it('文件管理栏宿主和 gutter 应带顶部边框 class', async () => {
  expect(wrapper.get('[data-testid="home-file-manager-panel-slot"]').classes()).toContain('b-t-1')
  expect(wrapper.get('[data-testid="home-file-manager-gutter"]').classes()).toContain('b-t-1')
})
```

- [ ] **Step 2: 写 MarkdownEdit 失败测试，锁定左侧大纲边框 class**

```js
it('左侧三栏布局的大纲容器应带右侧边框 class', async () => {
  const wrapper = await mountMarkdownEdit({
    previewPosition: 'left',
    menuVisible: true,
  })

  expect(wrapper.get('[data-layout-item="menu"]').classes()).toContain('markdown-edit-layout__menu--left-bordered')
})
```

- [ ] **Step 3: 运行 Web 定向测试，确认先失败**

Run in `wj-markdown-editor-web/`: `npx vitest run src/views/__tests__/homeViewFileManagerHost.vitest.test.js src/components/editor/__tests__/markdownEditLayoutRuntime.vitest.test.js`

Expected: FAIL，说明关闭态、边框 class 和左侧大纲样式还未调整。

- [ ] **Step 4: 在 HomeView 中补边框并移除关闭态箭头区域**

```vue
const homeViewFileManagerHostStyle = computed(() => {
  if (store.fileManagerPanelVisible) {
    return {
      gridTemplateColumns: resolveHomeViewFilePanelGridTemplateColumns(fileManagerPanelWidth.value),
    }
  }

  return {
    gridTemplateColumns: '1fr',
  }
})

<div
  v-if="store.fileManagerPanelVisible"
  data-testid="home-file-manager-panel-slot"
  class="h-full min-w-0 overflow-hidden b-t-1 b-r-1 b-t-border-primary b-r-border-primary b-t-solid b-r-solid"
>
  <FileManagerPanel />
</div>
<div
  v-if="store.fileManagerPanelVisible"
  ref="fileManagerGutterRef"
  data-testid="home-file-manager-gutter"
  class="h-full cursor-col-resize bg-[#E2E2E2] op-0 b-t-1 b-t-border-primary b-t-solid"
/>
```

- [ ] **Step 5: 在 MarkdownEdit / MarkdownMenu 中补左侧大纲右边框**

```vue
<MarkdownMenu
  v-else-if="item.type === 'menu'"
  data-layout-item="menu"
  class="allow-search markdown-edit-layout__menu"
  :class="{ 'markdown-edit-layout__menu--left-bordered': layoutMode.columnOrder[0] === 'menu' }"
/>
```

```scss
.markdown-edit-layout__menu--left-bordered {
  border-right: 1px solid var(--wj-markdown-border-primary);
}
```

- [ ] **Step 6: 重跑 Web 定向测试，确认转绿**

Run in `wj-markdown-editor-web/`: `npx vitest run src/views/__tests__/homeViewFileManagerHost.vitest.test.js src/components/editor/__tests__/markdownEditLayoutRuntime.vitest.test.js`

Expected: PASS

- [ ] **Step 7: 提交本任务**

```bash
git add wj-markdown-editor-web/src/views/HomeView.vue \
  wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue \
  wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue \
  wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js \
  wj-markdown-editor-web/src/components/editor/__tests__/markdownEditLayoutRuntime.vitest.test.js
git commit -m "style(layout): align panel and outline borders"
```

### Task 5: 格式化与最终验证

**Files:**
- Modify: `docs/superpowers/plans/2026-03-31-file-manager-panel-style-follow-up.md`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue`
- Modify: `wj-markdown-editor-web/src/views/HomeView.vue`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/components/editor/__tests__/markdownEditLayoutRuntime.vitest.test.js`

- [ ] **Step 1: 按包执行 ESLint 修复**

Run in `wj-markdown-editor-web/`: `npx eslint --fix src/util/file-manager/fileManagerPanelController.js src/i18n/zhCN.js src/i18n/enUS.js src/components/layout/FileManagerPanel.vue src/views/HomeView.vue src/components/editor/MarkdownEdit.vue src/components/editor/MarkdownMenu.vue src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/views/__tests__/homeViewFileManagerHost.vitest.test.js src/components/editor/__tests__/markdownEditLayoutRuntime.vitest.test.js`

Run in `wj-markdown-editor-electron/`: `npx eslint --fix src/util/document-session/documentFileManagerService.js src/util/document-session/__tests__/documentFileManagerService.test.js`

- [ ] **Step 2: 运行聚焦回归**

Run in `wj-markdown-editor-web/`: `npx vitest run src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/views/__tests__/homeViewFileManagerHost.vitest.test.js src/components/editor/__tests__/markdownEditLayoutRuntime.vitest.test.js`

Run in `wj-markdown-editor-electron/`: `npx vitest run src/util/document-session/__tests__/documentFileManagerService.test.js`

Expected: PASS

- [ ] **Step 3: 运行对应包全量回归**

Run in `wj-markdown-editor-web/`: `npm run test:run`

Run in `wj-markdown-editor-electron/`: `npm run test:run`

Expected: PASS

- [ ] **Step 4: 提交最终集成结果**

```bash
git add docs/superpowers/plans/2026-03-31-file-manager-panel-style-follow-up.md \
  wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js \
  wj-markdown-editor-web/src/i18n/zhCN.js \
  wj-markdown-editor-web/src/i18n/enUS.js \
  wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue \
  wj-markdown-editor-web/src/views/HomeView.vue \
  wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue \
  wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue \
  wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js \
  wj-markdown-editor-web/src/views/__tests__/homeViewFileManagerHost.vitest.test.js \
  wj-markdown-editor-web/src/components/editor/__tests__/markdownEditLayoutRuntime.vitest.test.js \
  wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js \
  wj-markdown-editor-electron/src/util/document-session/__tests__/documentFileManagerService.test.js
git commit -m "feat(file-manager): polish panel navigation and styles"
```
