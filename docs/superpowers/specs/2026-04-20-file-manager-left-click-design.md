# 文件管理栏 Markdown 左键与右键打开策略设计

## 1. 背景

基于当前代码实现，文件管理栏位于 `wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue`，其中目录项和 Markdown 项都通过 `openEntry(entry)` 进入统一分发。对 Markdown 项来说，`openEntry()` 最终会调用 `requestDocumentOpenPathByInteraction()`，而实际打开决策则由 `wj-markdown-editor-web/src/util/file-manager/fileManagerOpenDecisionController.js` 的 `openDocument()` 统一处理。

当前 `openDocument()` 的行为已经分成两层：

1. 先决定“当前窗口打开”还是“新窗口打开”。
2. 如果是“当前窗口打开”，再决定脏文档在切换前是否需要保存。

因此，现有“选择打开方式之后的处理逻辑”已经具备稳定边界。本次改动应优先复用该链路，只调整文件管理栏入口层和设置页配置，不改动后续打开、保存、切换的既有实现。

## 2. 需求范围

本次需求范围以用户确认内容为准：

1. 在 `wj-markdown-editor-web/src/views/SettingView.vue` 中新增文件管理栏左键逻辑设置，作用对象暂时仅为 Markdown。
2. 配置项需要支持三种值：
   - `prompt`：提示，保持当前行为。
   - `new-window`：新窗口打开。
   - `current-window`：当前窗口打开。
3. Markdown 文件需要支持右键菜单，菜单项为“新窗口打开”“当前窗口打开”。
4. 选择打开方式之后的处理逻辑保持不变，继续复用现有打开决策链路。
5. 设置页中需要将文件管理栏拆成独立分组，并把原来的“默认显示文件管理栏”从“视图”分组迁入该新分组。
6. 新配置结构采用 `fileManagerLeftClickAction.markdown`，默认值为 `prompt`，为后续补充其他资源类型预留扩展位。

## 3. 设计目标与非目标

设计目标：

1. 在不改变既有打开后链路的前提下，提供文件管理栏 Markdown 左键默认行为配置。
2. 为 Markdown 项补充右键快捷入口，减少每次都先弹选择框的操作成本。
3. 让文件管理栏相关配置在设置页中集中展示，避免“视图类配置”和“文件管理行为配置”混放。
4. 保证旧配置文件在升级后自动兼容，并使用默认值 `prompt`。

非目标：

1. 不调整 Electron 主进程的文档打开协议和运行时决策。
2. 不扩展目录项或非 Markdown 项的右键菜单。
3. 不修改当前窗口切换前的保存确认策略。
4. 不在本次需求中引入其他文件类型的左键策略，只预留配置结构。

## 4. 现状梳理

已确认的代码事实如下：

1. `FileManagerPanel.vue` 当前通过 `@click="openEntry(entry)"` 处理列表点击，没有右键菜单入口。
2. `fileManagerPanelController.js` 中，`openEntry(entry)` 对目录执行 `openDirectory()`，对 Markdown 执行 `requestDocumentOpenPathByInteraction(entry.path, { entrySource: 'file-manager', trigger: 'user' })`。
3. `fileManagerOpenDecisionController.js` 中，`openDocument(targetPath, options)` 已支持从 `options.openMode` 直接指定 `current-window` 或 `new-window`；未显式指定时才调用 `promptOpenModeChoice()` 弹出选择框。
4. `wj-markdown-editor-electron/src/data/defaultConfig.js` 目前已有 `fileManagerVisible`、`fileManagerSort`，但没有文件管理栏左键行为配置。
5. `wj-markdown-editor-electron/src/data/config/configSchema.js` 与 `configMutationSchema.js` 目前也没有对应字段。
6. `SettingView.vue` 现有“默认显示文件管理栏”位于 `config.view.defaultShowFileManager`，归属在“视图”分组中。
7. 现有测试已经覆盖文件管理栏、打开决策控制器、设置页文件管理栏选项、配置 schema 与 repair 逻辑，可直接作为本次 TDD 落点。

## 5. 方案设计

### 5.1 配置结构

新增顶层配置对象：

```json
{
  "fileManagerLeftClickAction": {
    "markdown": "prompt"
  }
}
```

约束如下：

1. `fileManagerLeftClickAction` 为对象。
2. 当前仅定义 `markdown` 键，取值限定为 `prompt | new-window | current-window`。
3. 默认值写入 `defaultConfig.js`，设为 `prompt`。
4. `configSchema.js` 需要将其加入完整配置 schema。
5. `configMutationSchema.js` 需要开放 `fileManagerLeftClickAction.markdown` 的局部 set 更新。
6. `configRepairUtil` 依赖默认配置补齐缺失字段，因此只要默认配置和 schema 同步更新，旧配置即可自动回填为 `prompt`。

采用嵌套结构而非单字段 `fileManagerMarkdownLeftClickAction` 的原因是：后续如需扩展 `image`、`audio`、`video` 等类型时，可以保持配置组织方式一致，不必继续新增平铺字段。

### 5.2 设置页调整

设置页需要新增独立“文件管理栏”分组，并调整锚点导航：

1. 在 `config.title` 下新增 `fileManager` 标题文案。
2. 在 `SettingView.vue` 的 `anchorList` 中新增文件管理栏锚点，位置放在“视图”和“编辑器”之间，保证导航顺序与页面实际分组一致。
3. 将现有“默认显示文件管理栏”从 `config.view` 文案域迁移到 `config.fileManager` 文案域，并在新分组中渲染。
4. 在新分组中新增“Markdown 左键逻辑”单选项，绑定路径为 `['fileManagerLeftClickAction', 'markdown']`。
5. 单选项提供三个值：
   - `prompt`
   - `new-window`
   - `current-window`

本次改动后，“视图”分组只保留布局和外观相关配置，例如大纲显示、编辑页预览位置、主题和字号，不再承载文件管理栏行为配置。

### 5.3 文件管理栏交互

文件管理栏交互按条目类型拆分：

1. 目录项：
   - 保持现有左键打开目录行为。
   - 不新增右键菜单。
2. Markdown 项左键：
   - 读取 `store.config.fileManagerLeftClickAction.markdown`。
   - 当值为 `prompt` 时，不传 `openMode`，继续走现有弹窗逻辑。
   - 当值为 `new-window` 时，显式传 `openMode: 'new-window'`。
   - 当值为 `current-window` 时，显式传 `openMode: 'current-window'`。
3. Markdown 项右键：
   - 弹出菜单，仅包含“新窗口打开”“当前窗口打开”两个操作。
   - 用户点选菜单项后，显式传入对应 `openMode`。
4. 当前已激活 Markdown：
   - 保持 no-op 行为，不重复打开。
5. 非 Markdown 文件：
   - 继续保留“仅支持打开 Markdown 文件”的现有提示逻辑。

组件与控制器的职责建议如下：

1. `FileManagerPanel.vue` 负责渲染右键菜单和触发方式区分。
2. `fileManagerPanelController.js` 负责统一接收 `openEntry(entry, options)`，内部根据 `options.openMode` 调用现有交互服务。

这样可以保证文件管理栏对“目录打开”“Markdown 打开”仍然只有一个控制器入口，避免把打开判断散落回组件层。

### 5.4 打开链路边界

本次不修改以下既有链路：

1. `requestDocumentResolveOpenTarget()` 的目标预判。
2. `promptOpenModeChoice()` 的具体弹窗实现。
3. `requestCurrentWindowOpenPreparation()` 和 `requestPrepareOpenPathInCurrentWindow()` 的当前窗口预判。
4. `promptSaveChoice()` 的脏文档保存选择。
5. `requestDocumentOpenPath()` 与 `requestDocumentOpenPathInCurrentWindow()` 的实际调度。

换言之，本次改动只新增“入口显式传参”的能力，不重写 `openDocument()` 的核心状态机。其行为边界是：

1. 未传 `openMode` 时，保留现在的“先问打开方式”。
2. 已传 `openMode` 时，跳过第一层选择框，但后续流程完全不变。
3. `current-window` 分支如果命中脏文档，仍然会继续弹出“先保存 / 不保存并切换”。

### 5.5 国际化与文案

需要补齐或迁移的文案包括：

1. `config.title.fileManager`
2. `config.fileManager.defaultShowFileManager`
3. `config.fileManager.markdownLeftClickAction`
4. `config.fileManager.leftClickActionOption.prompt`
5. `config.fileManager.leftClickActionOption.newWindow`
6. `config.fileManager.leftClickActionOption.currentWindow`

右键菜单项优先复用现有消息文案：

1. `message.fileManagerOpenInNewWindow`
2. `message.fileManagerOpenInCurrentWindow`

这样可以避免为同一动作重复维护两套中英文文本。

## 6. 测试方案

遵循现有项目测试分布，测试应分四层补齐：

1. `fileManagerPanel.vitest.test.js`
   - 左键在 `prompt` 配置下应继续走默认交互，不显式传 `openMode`。
   - 左键在 `new-window` 配置下应显式以 `openMode: 'new-window'` 调用。
   - 左键在 `current-window` 配置下应显式以 `openMode: 'current-window'` 调用。
   - 右键菜单只应出现在 Markdown 条目上。
   - 右键菜单点“新窗口打开”“当前窗口打开”时，应分别传入对应 `openMode`。
   - 当前文件仍应保持 no-op。
2. `fileManagerOpenDecisionController.vitest.test.js`
   - 补充显式 `openMode: 'current-window'` 时跳过 `promptOpenModeChoice()` 的测试。
   - 保留已有显式 `new-window` 跳过选择框的验证。
3. `settingViewFileManagerOption.vitest.test.js`
   - 更新为检查“文件管理栏”新分组。
   - 校验“默认显示文件管理栏”已迁入新分组。
   - 校验 `fileManagerLeftClickAction.markdown` 绑定和中英文文案键存在。
4. Electron 配置测试
   - `defaultConfig` 默认值测试。
   - `configSchema` 接纳新字段测试。
   - `configRepairUtil` 对旧配置自动补齐测试。

实现阶段应按 TDD 顺序推进，即先补失败测试，再最小化修改实现，最后做必要整理。

## 7. 风险与兼容性

主要风险与应对如下：

1. 设置页锚点顺序变化可能影响既有测试。
   - 需要同步更新锚点列表相关断言。
2. 文件管理栏右键菜单可能与按钮点击事件相互干扰。
   - 应使用明确的右键触发方案，并确保左键仍然只执行单次打开动作。
3. 旧配置文件没有 `fileManagerLeftClickAction`。
   - 通过默认配置补齐和 repair 测试保证兼容。
4. 显式 `openMode` 后如果错误绕过后续保存确认，会造成行为回归。
   - 通过 `fileManagerOpenDecisionController` 测试明确“只跳过第一层选择，不跳过 save-choice”的预期。

## 8. 实施顺序

建议实施顺序如下：

1. 先补配置默认值、schema、repair 测试与实现，建立配置基线。
2. 再补 `fileManagerOpenDecisionController` 显式 `openMode` 的失败测试。
3. 再补 `FileManagerPanel` 左键策略与右键菜单的失败测试。
4. 然后实现设置页新分组和新配置项。
5. 最后执行针对修改文件的 ESLint 格式化与相关测试验证。
