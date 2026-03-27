# 编辑页预览位置配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为编辑页新增“预览在左侧/右侧”的可持久化配置，并在不影响独立预览页与文档会话链路的前提下完成布局切换。

**Architecture:** 配置层新增 `config.editor.previewPosition` 字段，由设置页负责编辑、Electron 配置系统负责持久化、编辑页通过 `EditorView -> MarkdownEdit` 透传并实时响应。为避免继续膨胀 `MarkdownEdit.vue`，先抽出一个专门的布局解析 helper，把“区域顺序、网格列、Split gutter track”统一从状态推导出来，再让组件按该结果渲染。

**Tech Stack:** Vue 3、Pinia、Ant Design Vue、split-grid、Node 内置 `node:test`、Vitest、ESLint

---

## 文件结构

### 需要修改的既有文件

- `wj-markdown-editor-electron/src/data/defaultConfig.js`
  - 补齐 `editor.previewPosition` 默认值。
- `wj-markdown-editor-electron/src/data/config/configSchema.js`
  - 扩展 `editor` schema，允许 `previewPosition` 为 `left/right`。
- `wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js`
  - 补充 schema 接纳与拒绝非法值的测试。
- `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js`
  - 补充旧配置缺失该字段时的 repair/load 行为测试。
- `wj-markdown-editor-web/src/i18n/zhCN.js`
  - 新增设置项中文文案。
- `wj-markdown-editor-web/src/i18n/enUS.js`
  - 新增设置项英文文案。
- `wj-markdown-editor-web/src/views/SettingView.vue`
  - 新增“编辑页预览位置”单选项并绑定 `config.editor.previewPosition`。
- `wj-markdown-editor-web/src/views/EditorView.vue`
  - 透传 `config.editor.previewPosition` 到 `MarkdownEdit`。
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
  - 接入布局 helper，根据配置切换编辑页区域顺序与 `Split` track。

### 推荐新增文件

- `wj-markdown-editor-web/src/components/editor/markdownEditLayoutMode.js`
  - 只负责将 `previewVisible`、`menuVisible`、`previewPosition` 解析为布局描述对象。
- `wj-markdown-editor-web/src/components/editor/__tests__/markdownEditLayoutMode.test.js`
  - 覆盖左右布局与预览/大纲开关组合。
- `wj-markdown-editor-web/src/views/__tests__/settingViewPreviewPositionOption.test.js`
  - 用现有源码匹配风格验证设置项模板与 i18n 文案接线。

## 实施约束

- 不修改 `wj-markdown-editor-web/src/views/PreviewView.vue`。
- 不调整 `document-session` 事件与 IPC。
- 不顺手把 `previewWidth` 接入编辑页。
- 所有新增注释必须使用中文。
- 修改完后分别在 Web 与 Electron 包目录按文件运行 ESLint，不做全量格式化。

### Task 1: 配置契约与持久化边界

**Files:**
- Modify: `wj-markdown-editor-electron/src/data/defaultConfig.js`
- Modify: `wj-markdown-editor-electron/src/data/config/configSchema.js`
- Modify: `wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js`
- Modify: `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js`

- [ ] **Step 1: 为配置 schema 写失败测试**

在 `wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js` 新增两个测试：

```js
it('editor.previewPosition 接纳 left 与 right', () => {
  expect(() => validateConfigShape({
    ...defaultConfig,
    editor: {
      ...defaultConfig.editor,
      previewPosition: 'left',
    },
  })).not.toThrow()
})

it('非法 editor.previewPosition 必须被拒绝', () => {
  expect(() => validateConfigShape({
    ...defaultConfig,
    editor: {
      ...defaultConfig.editor,
      previewPosition: 'center',
    },
  })).toThrow()
})
```

- [ ] **Step 2: 运行 schema 测试确认失败**

Run: `npx vitest run src/data/config/__tests__/configSchema.test.js`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-electron`

Expected: FAIL，提示 `editor.previewPosition` 缺失或不被 schema 接纳。

- [ ] **Step 3: 最小化补齐默认配置与 schema**

在 `wj-markdown-editor-electron/src/data/defaultConfig.js` 与 `wj-markdown-editor-electron/src/data/config/configSchema.js` 做最小实现：

```js
editor: {
  associationHighlight: true,
  previewPosition: 'right',
}
```

```js
required: ['associationHighlight', 'previewPosition'],
properties: {
  associationHighlight: { type: 'boolean' },
  previewPosition: { enum: ['left', 'right'] },
}
```

- [ ] **Step 4: 为旧配置 repair 行为补测试**

在 `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js` 新增一条初始化场景测试，验证旧配置缺失 `editor.previewPosition` 时不会整份回退：

```js
it('初始化时 editor.previewPosition 缺失必须只补默认值，不得覆盖其他合法 editor 配置', async () => {
  const repository = createRepositoryStub({
    readResult: {
      ...cloneValue(defaultConfig),
      editor: {
        associationHighlight: false,
      },
      language: 'en-US',
    },
  })
  // 断言最终 config.editor.previewPosition === 'right'
  // 且 associationHighlight 与 language 保持原有合法值
})
```

- [ ] **Step 5: 运行 Electron 配置测试确认通过**

Run: `npx vitest run src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configService.test.js`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-electron`

Expected: PASS。

- [ ] **Step 6: 按文件执行 Electron ESLint**

Run: `npx eslint --fix src/data/defaultConfig.js src/data/config/configSchema.js src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configService.test.js`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-electron`

Expected: 命令成功退出，无新增 lint 报错。

- [ ] **Step 7: 提交配置契约改动**

```bash
git add wj-markdown-editor-electron/src/data/defaultConfig.js wj-markdown-editor-electron/src/data/config/configSchema.js wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js
git commit -m "feat(config): add editor preview position"
```

### Task 2: 设置页与文案接线

**Files:**
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/views/SettingView.vue`
- Create: `wj-markdown-editor-web/src/views/__tests__/settingViewPreviewPositionOption.test.js`

- [ ] **Step 1: 为设置页新增失败测试**

创建 `wj-markdown-editor-web/src/views/__tests__/settingViewPreviewPositionOption.test.js`，沿用现有源码匹配风格：

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'

import enUS from '../../i18n/enUS.js'
import zhCN from '../../i18n/zhCN.js'

const { test } = await import('node:test')

function readSettingViewSource() {
  return fs.readFileSync(new URL('../SettingView.vue', import.meta.url), 'utf8')
}

test('设置页中的编辑页预览位置应展示为左右单选项', () => {
  const source = readSettingViewSource()

  assert.equal(zhCN.config.view.editorPreviewPosition, '编辑页预览位置')
  assert.equal(zhCN.config.view.editorPreviewPositionOption.left, '左侧')
  assert.equal(zhCN.config.view.editorPreviewPositionOption.right, '右侧')

  assert.equal(enUS.config.view.editorPreviewPosition, 'Editor preview position')
  assert.equal(enUS.config.view.editorPreviewPositionOption.left, 'Left')
  assert.equal(enUS.config.view.editorPreviewPositionOption.right, 'Right')

  assert.match(source, /config\.editor\.previewPosition/u)
})
```

- [ ] **Step 2: 运行 Web 设置页测试确认失败**

Run: `node --test src/views/__tests__/settingViewPreviewPositionOption.test.js`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-web`

Expected: FAIL，提示缺少 i18n 文案或模板绑定。

- [ ] **Step 3: 补齐中英文文案**

在 `zhCN.js` 与 `enUS.js` 的 `config.view` 下新增：

```js
editorPreviewPosition: '编辑页预览位置',
editorPreviewPositionOption: {
  left: '左侧',
  right: '右侧',
},
```

```js
editorPreviewPosition: 'Editor preview position',
editorPreviewPositionOption: {
  left: 'Left',
  right: 'Right',
},
```

- [ ] **Step 4: 在设置页视图分组新增单选项**

在 `wj-markdown-editor-web/src/views/SettingView.vue` 的“视图”分组里加入：

```vue
<a-descriptions-item :label="$t('config.view.editorPreviewPosition')">
  <a-radio-group v-model:value="config.editor.previewPosition" button-style="solid">
    <a-radio-button value="left">
      {{ $t('config.view.editorPreviewPositionOption.left') }}
    </a-radio-button>
    <a-radio-button value="right">
      {{ $t('config.view.editorPreviewPositionOption.right') }}
    </a-radio-button>
  </a-radio-group>
</a-descriptions-item>
```

- [ ] **Step 5: 运行 Web 设置页测试确认通过**

Run: `node --test src/views/__tests__/settingViewPreviewPositionOption.test.js src/views/__tests__/settingViewInlineCodeClickCopyOption.test.js`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-web`

Expected: PASS。

- [ ] **Step 6: 按文件执行 Web ESLint**

Run: `npx eslint --fix src/i18n/zhCN.js src/i18n/enUS.js src/views/SettingView.vue src/views/__tests__/settingViewPreviewPositionOption.test.js`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-web`

Expected: 命令成功退出，无新增 lint 报错。

- [ ] **Step 7: 提交设置页改动**

```bash
git add wj-markdown-editor-web/src/i18n/zhCN.js wj-markdown-editor-web/src/i18n/enUS.js wj-markdown-editor-web/src/views/SettingView.vue wj-markdown-editor-web/src/views/__tests__/settingViewPreviewPositionOption.test.js
git commit -m "feat(setting): add editor preview position option"
```

### Task 3: 抽取编辑页布局解析 helper

**Files:**
- Create: `wj-markdown-editor-web/src/components/editor/markdownEditLayoutMode.js`
- Create: `wj-markdown-editor-web/src/components/editor/__tests__/markdownEditLayoutMode.test.js`

- [ ] **Step 1: 先写布局解析失败测试**

创建 `wj-markdown-editor-web/src/components/editor/__tests__/markdownEditLayoutMode.test.js`，覆盖四种主要组合：

```js
import assert from 'node:assert/strict'

const { test } = await import('node:test')
const { resolveMarkdownEditLayoutMode } = await import('../markdownEditLayoutMode.js')

test('右侧模式且大纲开启时应返回编辑区-预览区-大纲顺序', () => {
  assert.deepEqual(
    resolveMarkdownEditLayoutMode({
      previewVisible: true,
      menuVisible: true,
      previewPosition: 'right',
    }).columnOrder,
    ['editor', 'preview', 'menu'],
  )
})

test('左侧模式且大纲开启时应返回大纲-预览区-编辑区顺序', () => {
  assert.deepEqual(
    resolveMarkdownEditLayoutMode({
      previewVisible: true,
      menuVisible: true,
      previewPosition: 'left',
    }).columnOrder,
    ['menu', 'preview', 'editor'],
  )
})

test('左侧模式且大纲关闭时应返回预览区-编辑区顺序', () => {
  assert.deepEqual(
    resolveMarkdownEditLayoutMode({
      previewVisible: true,
      menuVisible: false,
      previewPosition: 'left',
    }).columnOrder,
    ['preview', 'editor'],
  )
})

test('预览关闭时应退化为仅编辑区', () => {
  const layout = resolveMarkdownEditLayoutMode({
    previewVisible: false,
    menuVisible: true,
    previewPosition: 'left',
  })

  assert.deepEqual(layout.columnOrder, ['editor'])
  assert.deepEqual(layout.columnGutters, [])
})
```

- [ ] **Step 2: 运行 helper 测试确认失败**

Run: `node --test src/components/editor/__tests__/markdownEditLayoutMode.test.js`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-web`

Expected: FAIL，提示模块或导出不存在。

- [ ] **Step 3: 写最小 helper 实现**

在 `wj-markdown-editor-web/src/components/editor/markdownEditLayoutMode.js` 实现一个纯函数，至少返回以下结构：

```js
export function resolveMarkdownEditLayoutMode({
  previewVisible,
  menuVisible,
  previewPosition,
}) {
  if (previewVisible !== true) {
    return {
      columnOrder: ['editor'],
      gridTemplateClass: 'grid-cols-[1fr_0px_0fr_0px_0fr]',
      columnGutters: [],
    }
  }

  if (previewPosition === 'left' && menuVisible === true) {
    return {
      columnOrder: ['menu', 'preview', 'editor'],
      gridTemplateClass: 'grid-cols-[0.4fr_2px_1fr_2px_1fr]',
      columnGutters: [1, 3],
    }
  }

  // 继续补齐其余分支
}
```

实现要求：

- 仅负责状态推导，不读 DOM
- 对非法 `previewPosition` 回退到 `right`
- 为后续 `Split` 初始化提供 gutter track 编号

- [ ] **Step 4: 运行 helper 测试确认通过**

Run: `node --test src/components/editor/__tests__/markdownEditLayoutMode.test.js`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-web`

Expected: PASS。

- [ ] **Step 5: 按文件执行 Web ESLint**

Run: `npx eslint --fix src/components/editor/markdownEditLayoutMode.js src/components/editor/__tests__/markdownEditLayoutMode.test.js`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-web`

Expected: 命令成功退出，无新增 lint 报错。

- [ ] **Step 6: 提交布局 helper**

```bash
git add wj-markdown-editor-web/src/components/editor/markdownEditLayoutMode.js wj-markdown-editor-web/src/components/editor/__tests__/markdownEditLayoutMode.test.js
git commit -m "refactor(editor): extract preview layout mode resolver"
```

### Task 4: 编辑页接线与回归验证

**Files:**
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- Test: `wj-markdown-editor-web/src/components/editor/__tests__/markdownEditLayoutMode.test.js`
- Test: `wj-markdown-editor-web/src/views/__tests__/settingViewPreviewPositionOption.test.js`
- Test: `wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js`
- Test: `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js`

- [ ] **Step 1: 先让 `EditorView` 透传新配置**

在 `wj-markdown-editor-web/src/views/EditorView.vue` 修改 `MarkdownEdit` 调用，加入：

```vue
:preview-position="config.editor.previewPosition"
```

- [ ] **Step 2: 为 `MarkdownEdit` 增加 prop 与布局接线**

在 `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`：

- 新增 `previewPosition` prop，默认值为 `'right'`
- 引入 `resolveMarkdownEditLayoutMode`
- 用计算属性统一得到当前布局描述
- 将 `editorContainerClass` 改为读取 helper 结果
- 将原本只监听 `menuVisible/previewVisible` 的 `watch` 改为同时响应 `previewPosition`

关键实现建议：

```js
const layoutMode = computed(() => resolveMarkdownEditLayoutMode({
  previewVisible: previewVisible.value,
  menuVisible: menuVisible.value,
  previewPosition: props.previewPosition,
}))

const editorContainerClass = computed(() => layoutMode.value.gridTemplateClass)
```

- [ ] **Step 3: 重写 `Split` 初始化逻辑，禁止散落的分支复制**

把 `Split` 初始化收拢成一个函数，例如：

```js
function rebuildSplit() {
  if (editorContainer.value) {
    editorContainer.value.style['grid-template-columns'] = ''
  }
  splitInstance?.destroy(true)

  const gutterTracks = layoutMode.value.columnGutters.map((track, index) => ({
    track,
    element: index === 0 ? gutterRef.value : gutterMenuRef.value,
  }))

  if (gutterTracks.length === 0) {
    previewController.value = previewVisible.value
    menuController.value = false
    return
  }

  splitInstance = Split({
    columnGutters: gutterTracks,
    minSize: 200,
    snapOffset: 0,
  })
}
```

要求：

- `previewController`、`menuController` 仍保持现有语义
- 左侧模式下第二个 gutter 必须落在“预览区与编辑区”之间
- 右侧模式下保持现有行为

- [ ] **Step 4: 按布局结果调整模板区域顺序**

不要只用 CSS 镜像，按 helper 结果显式渲染顺序。实现方式可二选一：

1. 模板里用小块条件分支分别渲染左/右模式
2. 抽出最小的列渲染描述，再按顺序 `v-if` 渲染

本任务要求的验收点只有一个：阅读模板时能直接看出左右两种布局，而不是把真实顺序藏在样式里。

- [ ] **Step 5: 运行 Web 定向测试**

Run: `node --test src/components/editor/__tests__/markdownEditLayoutMode.test.js src/views/__tests__/settingViewPreviewPositionOption.test.js src/components/editor/__tests__/markdownEditPreviewLayoutIndexWiring.test.js`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-web`

Expected: PASS。

- [ ] **Step 6: 运行 Electron 定向测试回归配置链路**

Run: `npx vitest run src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configService.test.js`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-electron`

Expected: PASS。

- [ ] **Step 7: 按文件执行 Web ESLint**

Run: `npx eslint --fix src/views/EditorView.vue src/components/editor/MarkdownEdit.vue`

Workdir: `D:\code\wj-markdown-editor\wj-markdown-editor-web`

Expected: 命令成功退出，无新增 lint 报错。

- [ ] **Step 8: 人工回归编辑页布局**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
npm run dev
```

另开终端：

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npm run start
```

检查项：

- 设置中切换“编辑页预览位置”为左侧后，编辑页即时变为“大纲 -> 预览 -> 编辑”
- 切回右侧后恢复当前布局
- 独立预览页不受影响
- 关闭预览时编辑区全宽
- 大纲开关、滚动同步、资源右键菜单仍可工作

- [ ] **Step 9: 提交编辑页联调改动**

```bash
git add wj-markdown-editor-web/src/views/EditorView.vue wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue
git commit -m "feat(editor): support preview position switch"
```

### Task 5: 最终验证与收尾

**Files:**
- Modify: `docs/superpowers/specs/2026-03-27-editor-preview-position-design.md`
- Create: 无
- Test: 所有本次受影响测试文件

- [ ] **Step 1: 汇总定向测试命令并重新跑一遍**

Run:

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-web
node --test src/views/__tests__/settingViewPreviewPositionOption.test.js src/views/__tests__/settingViewInlineCodeClickCopyOption.test.js src/components/editor/__tests__/markdownEditLayoutMode.test.js src/components/editor/__tests__/markdownEditPreviewLayoutIndexWiring.test.js
```

```bash
cd D:\code\wj-markdown-editor\wj-markdown-editor-electron
npx vitest run src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configService.test.js
```

Expected: 全部 PASS。

- [ ] **Step 2: 记录设计文档与实现之间的偏差**

如果实现过程中对字段名、文案或布局 helper 结构有微调，回到设计文档补充“最终实现说明”，保证文档与代码一致。

- [ ] **Step 3: 查看工作区差异，确认没有误改独立预览页**

Run: `git diff --stat`

Workdir: `D:\code\wj-markdown-editor`

Expected: 不应包含 `wj-markdown-editor-web/src/views/PreviewView.vue` 的变更。

- [ ] **Step 4: 整理最终提交**

```bash
git add docs/superpowers/specs/2026-03-27-editor-preview-position-design.md
git commit -m "docs: align editor preview position spec"
```

如设计文档没有变化，则跳过此提交。

