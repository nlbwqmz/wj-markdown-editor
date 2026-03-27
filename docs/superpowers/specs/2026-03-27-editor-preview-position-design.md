# 编辑页预览位置配置设计

## 1. 背景

当前编辑页仅支持一种固定布局：编辑区在左，预览区在中，大纲在最右。对应实现集中在 `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`，模板顺序、网格列定义以及 `split-grid` 的 gutter track 都是按这一种顺序写死的。

现有产品诉求是在设置中新增一个可持久化配置，仅作用于编辑页：

- 当预览位置为右侧时，保持当前布局不变
- 当预览位置为左侧且大纲开启时，布局切换为“大纲 -> 预览区 -> 编辑区”
- 当预览位置为左侧且大纲关闭时，布局切换为“预览区 -> 编辑区”

本次需求不要求修改独立预览页，不要求调整文档会话模型，也不要求改变主进程运行时逻辑。

## 2. 目标与非目标

### 2.1 目标

- 在设置页新增“编辑页预览位置”配置
- 配置支持持久化到现有配置系统
- 编辑页根据配置切换左右布局
- 保持现有滚动同步、关联高亮、预览索引、资源右键菜单等能力可继续工作

### 2.2 非目标

- 不修改独立预览页 `PreviewView.vue`
- 不新增第三种及以上布局模式
- 不调整 `document-session` 命令、事件或 Electron runtime
- 不顺带把 `previewWidth` 接入编辑页

## 3. 当前实现现状

### 3.1 编辑页布局现状

编辑页布局由 `MarkdownEdit.vue` 自身维护：

- 模板顺序固定为“编辑区 -> 预览区 -> 大纲”
- `editorContainerClass` 根据 `previewVisible`、`menuVisible` 返回固定的 `grid-cols-*`
- `watch(() => [menuVisible.value, previewVisible.value], ...)` 中按固定 track 初始化 `Split`
- `menuVisible` 在 `onMounted` 时只读取一次 `store.config.menuVisible`，语义是“默认显示大纲”

这意味着当前布局不是“可配置方向的通用布局系统”，而是一套写死顺序的三列网格。

### 3.2 设置与配置现状

设置页“视图”分组当前已经包含：

- 默认显示大纲 `config.menuVisible`
- 代码主题 `config.theme.code`
- 预览主题 `config.theme.preview`
- 预览宽度 `config.previewWidth`
- 字体大小 `config.fontSize`

配置写入路径为：

1. `SettingView.vue` 编辑本地草稿
2. 通过 `user-update-config` IPC 提交完整配置
3. Electron 侧 `configService` 写盘
4. 主进程通过 `update-config` 事件回推到 Renderer store

因此，只要新字段进入默认配置与 schema，旧配置文件也可以通过现有 repair/sanitize 流程补齐默认值。

## 4. 配置设计

### 4.1 字段位置

推荐新增字段：

```json
{
  "editor": {
    "associationHighlight": true,
    "previewPosition": "right"
  }
}
```

不建议把该字段放在顶层，原因如下：

- 该配置只作用于编辑页，不影响独立预览页
- 放在 `editor` 下语义更明确
- 可以避免未来将独立预览页行为误绑到该字段

### 4.2 可选值

- `right`：预览区在右侧，保持当前布局
- `left`：预览区在左侧，且大纲位于预览区左侧

### 4.3 默认值

- 默认值为 `right`

### 4.4 设置项文案

推荐设置项：

- 展示名称：`编辑页预览位置`
- 选项：`左侧`、`右侧`

如果产品坚持使用更短文案“预览位置”，建议增加提示“仅编辑页生效”，避免用户误解为会影响独立预览页。

## 5. 交互与行为设计

### 5.1 编辑页布局行为

编辑页布局应按以下规则运行：

- 当预览关闭时，编辑区全宽显示，不受 `previewPosition` 影响
- 当预览开启且 `previewPosition = right` 时：
  - 大纲关闭：`编辑区 -> 预览区`
  - 大纲开启：`编辑区 -> 预览区 -> 大纲`
- 当预览开启且 `previewPosition = left` 时：
  - 大纲关闭：`预览区 -> 编辑区`
  - 大纲开启：`大纲 -> 预览区 -> 编辑区`

### 5.2 配置生效时机

`previewPosition` 建议在编辑页实时生效，不应仅在首次挂载时读取一次默认值。

原因：

- 该字段是稳定布局配置，不是工具栏里的临时会话开关
- 用户在设置页修改后，预期应立刻看到布局变化
- 当前主进程已有 `update-config` 回推链路，可以直接复用

相比之下，`menuVisible` 仍可继续保留当前“默认显示大纲”的语义，不强行改造成实时全局开关，以免扩大本次需求范围。

## 6. 实现建议

### 6.1 不建议的做法

不建议仅通过 CSS `order`、`grid-area` 或整体镜像的方式翻转现有 DOM 顺序。

原因：

- 当前 gutter 的 DOM 位置和 `Split` track 编号是耦合的
- 大纲与预览之间存在第二个 gutter，只做样式翻转容易造成拖拽列与视觉列不一致
- 后续维护者难以直接从模板顺序理解真实布局

### 6.2 推荐做法

在 `MarkdownEdit.vue` 内引入一个“布局模式解析”层，由以下状态共同决定最终布局：

- `previewVisible`
- `menuVisible`
- `previewPosition`

推荐将其解析为局部计算结果，再统一驱动：

- 模板中的区域渲染顺序
- `grid-template-columns` 对应 class
- `Split` 的 `columnGutters` track 定义
- 布局切换时的重新初始化

### 6.3 组件职责建议

#### `EditorView.vue`

- 从 `store.config` 中读取 `config.editor.previewPosition`
- 作为 prop 传给 `MarkdownEdit`

#### `MarkdownEdit.vue`

- 新增 `previewPosition` prop
- 将现有固定布局改成基于布局模式的渲染
- 在 `previewPosition`、`previewVisible`、`menuVisible` 变化时统一销毁并重建 `Split`

#### `SettingView.vue`

- 在“视图”分组新增单选配置项
- 绑定到 `config.editor.previewPosition`

#### 配置层

- `defaultConfig.js` 增加默认值
- `configSchema.js` 在 `editor` schema 中接纳 `previewPosition`
- Electron 配置服务无需单独迁移逻辑，沿用当前 repair/sanitize 流程即可

## 7. 影响范围

预计需要修改的文件如下：

- `wj-markdown-editor-web/src/views/SettingView.vue`
- `wj-markdown-editor-web/src/views/EditorView.vue`
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- `wj-markdown-editor-web/src/i18n/zhCN.js`
- `wj-markdown-editor-web/src/i18n/enUS.js`
- `wj-markdown-editor-electron/src/data/defaultConfig.js`
- `wj-markdown-editor-electron/src/data/config/configSchema.js`

预计需要新增或调整的测试如下：

- Web 侧编辑页布局状态解析测试
- 设置页文案与模板接线测试
- Electron 配置 schema 测试

## 8. 风险点

### 8.1 主要风险

最大风险在 `MarkdownEdit.vue` 的布局切换逻辑：

- 模板顺序改变后，两个 gutter 的插入位置会变化
- `Split` 的 `track` 需要与新网格顺序严格对应
- 布局切换时若销毁/重建时机不当，可能导致分割条残留或列宽异常

### 8.2 次要风险

以下能力理论上不应因左右切换失效，但需要回归验证：

- 编辑区与预览区滚动同步
- 关联高亮
- 预览索引重建
- 大纲锚点跳转
- 预览区资源右键菜单与打开资源

## 9. 验收标准

满足以下条件即可视为本需求完成：

- 设置页可以配置编辑页预览位置为左侧或右侧
- 默认值为右侧
- 修改设置后，编辑页布局即时切换
- 右侧模式保持现有行为不变
- 左侧模式下，大纲位于预览区左边，编辑区位于最右
- 预览关闭时编辑区全宽
- 独立预览页行为保持不变
- 旧配置文件升级后不会因缺少新字段而报错

## 10. 结论

本需求适合按“编辑页预览位置配置”实现，而不是抽象成更泛化的“多布局模式系统”。

推荐方案的核心原则是：

- 字段只作用于编辑页
- 配置语义直接表达“左/右”
- 在 `MarkdownEdit.vue` 中显式支持两种区域顺序
- 不改独立预览页，不触碰文档会话链路

按该方案实现，改动边界清晰，兼容成本低，也更符合当前项目已收口的架构方向。
