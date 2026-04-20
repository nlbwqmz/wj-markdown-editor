# 文件管理栏打开策略 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为文件管理栏新增 Markdown 左键默认打开策略、Markdown 右键打开菜单，并将相关配置集中到设置页“文件管理栏”分组，且保持现有打开后链路不变。

**Architecture:** 通过配置层新增 `fileManagerLeftClickAction.markdown`，由 `FileManagerPanel`/`fileManagerPanelController` 在入口层决定是否显式传入 `openMode`。`fileManagerOpenDecisionController` 继续复用现有目标预判、脏文档保存选择和调度逻辑，只负责在显式传入 `openMode` 时跳过第一层打开方式选择框。

**Tech Stack:** Vue 3、Ant Design Vue、Pinia、Vitest、Node test、Electron 配置 schema/repair。

---

## 文件结构与职责

- 修改：`wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue`
  - 文件管理栏列表项模板，新增 Markdown 右键菜单与左键分流触发。
- 修改：`wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
  - 统一读取 `fileManagerLeftClickAction.markdown`，让 Markdown 左键与右键都通过同一打开入口复用现有交互服务。
- 修改：`wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js`
  - 明确测试显式 `openMode: 'current-window'` 的跳过逻辑，确保仅跳过第一层弹窗。
- 修改：`wj-markdown-editor-web/src/views/SettingView.vue`
  - 新增“文件管理栏”设置分组，迁移“默认显示文件管理栏”，新增 Markdown 左键逻辑配置。
- 修改：`wj-markdown-editor-web/src/i18n/zhCN.js`
- 修改：`wj-markdown-editor-web/src/i18n/enUS.js`
  - 补齐文件管理栏分组与左键策略文案。
- 修改：`wj-markdown-editor-electron/src/data/defaultConfig.js`
  - 新增 `fileManagerLeftClickAction.markdown` 默认值 `prompt`。
- 修改：`wj-markdown-editor-electron/src/data/config/configSchema.js`
  - 接纳新配置结构。
- 修改：`wj-markdown-editor-electron/src/data/config/configMutationSchema.js`
  - 允许局部写入 `fileManagerLeftClickAction.markdown`。
- 测试：`wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`
- 测试：`wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`
- 测试：`wj-markdown-editor-web/src/views/__tests__/settingViewFileManagerOption.vitest.test.js`
- 测试：`wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js`
- 测试：`wj-markdown-editor-electron/src/data/config/__tests__/configRepairUtil.test.js`

### Task 1: 锁定配置结构与设置页文案的失败测试

**Files:**
- Modify: `wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js`
- Modify: `wj-markdown-editor-electron/src/data/config/__tests__/configRepairUtil.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/settingViewFileManagerOption.vitest.test.js`

- [ ] **Step 1: 写出配置默认值与修复逻辑的失败测试**

```js
it('defaultConfig 必须提供 fileManagerLeftClickAction.markdown 默认值 prompt', () => {
  expect(defaultConfig.fileManagerLeftClickAction).toEqual({
    markdown: 'prompt',
  })
})

it('config schema 必须接纳 fileManagerLeftClickAction.markdown', () => {
  expect(() => validateConfigShape({
    ...defaultConfig,
    fileManagerLeftClickAction: {
      markdown: 'current-window',
    },
  })).not.toThrow()
})

it('缺失 fileManagerLeftClickAction 时必须从默认配置补齐', () => {
  const legacyConfig = { ...defaultConfig }
  delete legacyConfig.fileManagerLeftClickAction

  const repaired = repairConfig(legacyConfig, defaultConfig)

  expect(repaired.fileManagerLeftClickAction).toEqual({
    markdown: 'prompt',
  })
})
```

- [ ] **Step 2: 运行测试，确认它们因缺少新配置而失败**

Run: `npm run test:run -- src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configRepairUtil.test.js`

Expected: FAIL，提示 `fileManagerLeftClickAction` 不存在或结构校验不通过。

- [ ] **Step 3: 写出设置页分组迁移与新配置项的失败测试**

```js
it('设置页应提供文件管理栏分组，并包含默认显示和 Markdown 左键逻辑配置项', () => {
  const source = readSettingViewSource()

  expect(zhCN.config.title.fileManager).toBe('文件管理栏')
  expect(enUS.config.title.fileManager).toBe('File Manager')
  expect(zhCN.config.fileManager.defaultShowFileManager).toBe('默认显示文件管理栏')
  expect(zhCN.config.fileManager.markdownLeftClickAction).toBe('Markdown 左键逻辑')
  expect(source).toMatch(/id=\"fileManager\"/u)
  expect(source).toMatch(/config\.fileManagerVisible/u)
  expect(source).toMatch(/fileManagerLeftClickAction', 'markdown'/u)
})
```

- [ ] **Step 4: 运行设置页测试，确认它因旧分组结构而失败**

Run: `npm run test:run -- src/views/__tests__/settingViewFileManagerOption.vitest.test.js`

Expected: FAIL，提示缺少 `config.title.fileManager`、`config.fileManager.*` 或模板绑定未命中。

### Task 2: 锁定打开行为的失败测试

**Files:**
- Modify: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

- [ ] **Step 1: 为打开决策控制器补显式 current-window 测试**

```js
it('显式传入 current-window 时应跳过打开方式选择，但仍保留当前窗口预判与后续保存选择', async () => {
  const controller = createController()

  const result = await controller.openDocument('/tmp/next.md', {
    openMode: 'current-window',
    entrySource: 'file-manager',
    trigger: 'user',
  })

  expect(result.stageList).toEqual([
    'target-preflight',
    'open-choice',
    'current-window-preflight',
    'save-choice',
    'dispatch',
  ])
  expect(mocked.promptOpenModeChoice).not.toHaveBeenCalled()
  expect(mocked.promptSaveChoice).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: 运行该测试，确认旧实现或旧测试矩阵未覆盖该分支**

Run: `npm run test:run -- src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js`

Expected: FAIL 或至少缺少该行为断言，进入补实现阶段前必须先让新增测试落地。

- [ ] **Step 3: 为文件管理栏左键策略和右键菜单补失败测试**

```js
it('markdown 左键在 prompt 配置下应继续不显式传 openMode', async () => {
  fileManagerPanelState.store.config.fileManagerLeftClickAction = { markdown: 'prompt' }
  await findFileManagerEntryByName(wrapper, 'next.md').trigger('click')

  expect(fileManagerPanelState.openDecisionOpenDocument).toHaveBeenCalledWith('D:/docs/next.md', {
    entrySource: 'file-manager',
    trigger: 'user',
  })
})

it('markdown 左键在 new-window 配置下应显式传 openMode', async () => {
  fileManagerPanelState.store.config.fileManagerLeftClickAction = { markdown: 'new-window' }
  await findFileManagerEntryByName(wrapper, 'next.md').trigger('click')

  expect(fileManagerPanelState.openDecisionOpenDocument).toHaveBeenCalledWith('D:/docs/next.md', {
    entrySource: 'file-manager',
    trigger: 'user',
    openMode: 'new-window',
  })
})

it('markdown 右键菜单应提供当前窗口打开与新窗口打开', async () => {
  const entry = findFileManagerEntryByName(wrapper, 'next.md')
  await entry.trigger('contextmenu')
  await wrapper.get('[data-testid=\"file-manager-entry-menu-new-window\"]').trigger('click')

  expect(fileManagerPanelState.openDecisionOpenDocument).toHaveBeenCalledWith('D:/docs/next.md', {
    entrySource: 'file-manager',
    trigger: 'user',
    openMode: 'new-window',
  })
})
```

- [ ] **Step 4: 运行文件管理栏测试，确认它们先失败**

Run: `npm run test:run -- src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Expected: FAIL，提示缺少 `fileManagerLeftClickAction` 读取、缺少右键菜单或调用参数不符。

### Task 3: 最小实现配置层与设置页

**Files:**
- Modify: `wj-markdown-editor-electron/src/data/defaultConfig.js`
- Modify: `wj-markdown-editor-electron/src/data/config/configSchema.js`
- Modify: `wj-markdown-editor-electron/src/data/config/configMutationSchema.js`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/views/SettingView.vue`

- [ ] **Step 1: 在默认配置中加入新字段**

```js
fileManagerVisible: true,
fileManagerSort: {
  field: 'type',
  direction: 'asc',
},
fileManagerLeftClickAction: {
  markdown: 'prompt',
},
previewWidth: 80,
```

- [ ] **Step 2: 在 schema 与 mutation schema 中接纳新字段**

```js
const fileManagerLeftClickActionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['markdown'],
  properties: {
    markdown: { enum: ['prompt', 'new-window', 'current-window'] },
  },
}
```

```js
'fileManagerLeftClickAction.markdown',
```

- [ ] **Step 3: 补中英文文案**

```js
title: {
  general: '常规',
  view: '视图',
  fileManager: '文件管理栏',
}
```

```js
fileManager: {
  defaultShowFileManager: '默认显示文件管理栏',
  markdownLeftClickAction: 'Markdown 左键逻辑',
  leftClickActionOption: {
    prompt: '提示',
    newWindow: '新窗口打开',
    currentWindow: '当前窗口打开',
  },
}
```

- [ ] **Step 4: 在设置页迁移分组并新增配置项**

```vue
<a-descriptions bordered :column="1" size="small">
  <template #title>
    <span id="fileManager">{{ $t('config.title.fileManager') }}</span>
  </template>
  <a-descriptions-item :label="$t('config.fileManager.defaultShowFileManager')">
    <a-radio-group :value="config.fileManagerVisible" button-style="solid" @update:value="value => submitSetPathMutation(['fileManagerVisible'], value)">
      <a-radio-button :value="true">{{ $t('config.yes') }}</a-radio-button>
      <a-radio-button :value="false">{{ $t('config.no') }}</a-radio-button>
    </a-radio-group>
  </a-descriptions-item>
  <a-descriptions-item :label="$t('config.fileManager.markdownLeftClickAction')">
    <a-radio-group :value="config.fileManagerLeftClickAction.markdown" button-style="solid" @update:value="value => submitSetPathMutation(['fileManagerLeftClickAction', 'markdown'], value)">
      <a-radio-button value="prompt">{{ $t('config.fileManager.leftClickActionOption.prompt') }}</a-radio-button>
      <a-radio-button value="new-window">{{ $t('config.fileManager.leftClickActionOption.newWindow') }}</a-radio-button>
      <a-radio-button value="current-window">{{ $t('config.fileManager.leftClickActionOption.currentWindow') }}</a-radio-button>
    </a-radio-group>
  </a-descriptions-item>
</a-descriptions>
```

- [ ] **Step 5: 运行前两组测试，确认它们转绿**

Run: `npm run test:run -- src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configRepairUtil.test.js src/views/__tests__/settingViewFileManagerOption.vitest.test.js`

Expected: PASS。

### Task 4: 最小实现文件管理栏左键策略与右键菜单

**Files:**
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Modify: `wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js`

- [ ] **Step 1: 让控制器接收显式 openMode**

```js
function resolveMarkdownOpenMode() {
  const nextOpenMode = store?.config?.fileManagerLeftClickAction?.markdown

  return ['prompt', 'new-window', 'current-window'].includes(nextOpenMode)
    ? nextOpenMode
    : 'prompt'
}

async function openEntry(entry, options = {}) {
  if (entry?.kind === 'directory') {
    return await openDirectory(entry.path)
  }

  if (entry?.kind === 'markdown') {
    const openMode = options.openMode
      || (options.useConfiguredLeftClickAction === true ? resolveMarkdownOpenMode() : null)

    return await requestOpenDocumentPath(entry.path, {
      entrySource: 'file-manager',
      trigger: 'user',
      ...(openMode && openMode !== 'prompt' ? { openMode } : {}),
    })
  }
}
```

- [ ] **Step 2: 在组件中区分左键与右键菜单**

```js
function createEntryMenuList(entry) {
  if (entry?.kind !== 'markdown') {
    return []
  }

  return [
    {
      key: 'current-window',
      label: t('message.fileManagerOpenInCurrentWindow'),
      action: () => openEntry(entry, { openMode: 'current-window' }),
    },
    {
      key: 'new-window',
      label: t('message.fileManagerOpenInNewWindow'),
      action: () => openEntry(entry, { openMode: 'new-window' }),
    },
  ]
}
```

```vue
<a-dropdown
  v-if="entry.kind === 'markdown'"
  :trigger="['contextmenu']"
  placement="bottomLeft"
>
  <button
    type="button"
    class="file-manager-panel__entry"
    :class="{ 'is-active': entry.isActive }"
    @click="openEntry(entry, { useConfiguredLeftClickAction: true })"
  >
```

- [ ] **Step 3: 保持打开决策控制器仅跳过第一层弹窗**

```js
const selectedOpenMode = options.openMode || await promptOpenModeChoice(...)
```

这里不改状态机，只通过新增测试锁定该语义。

- [ ] **Step 4: 运行打开行为相关测试，确认全部转绿**

Run: `npm run test:run -- src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

Expected: PASS。

### Task 5: 格式化与最终验证

**Files:**
- Modify: 上述所有改动文件

- [ ] **Step 1: 对修改文件按包执行 ESLint 修复**

Run web:

```bash
npx eslint --fix src/components/layout/FileManagerPanel.vue src/util/file-manager/fileManagerPanelController.js src/util/file-manager/fileManagerOpenDecisionController.js src/views/SettingView.vue src/views/__tests__/settingViewFileManagerOption.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js src/i18n/zhCN.js src/i18n/enUS.js
```

Run electron:

```bash
npx eslint --fix src/data/defaultConfig.js src/data/config/configSchema.js src/data/config/configMutationSchema.js src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configRepairUtil.test.js
```

- [ ] **Step 2: 运行本次需求相关测试**

Run web:

```bash
npm run test:run -- src/views/__tests__/settingViewFileManagerOption.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/file-manager/__tests__/fileManagerOpenDecisionController.vitest.test.js
```

Run electron:

```bash
npm run test:run -- src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configRepairUtil.test.js
```

Expected: 全部 PASS，且没有新增 warning 或 lint 错误。

- [ ] **Step 3: 检查工作区并确认没有遗留临时文件**

Run: `git status --short`

Expected: 仅保留本次需求相关文件变更，不应出现临时日志、缓存文件或无关产物。
