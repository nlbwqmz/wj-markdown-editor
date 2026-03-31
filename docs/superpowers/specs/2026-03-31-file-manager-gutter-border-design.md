# 文件管理栏 gutter 边界设计

## 1. 背景

主窗口文件管理栏已经在 [HomeView](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/views/HomeView.vue) 外层壳层落地，目前结构为：

- 文件管理栏面板本体
- 文件管理栏与主内容之间的 `gutter`
- 主内容区

当前实现里，文件管理栏右侧视觉边界主要来自面板容器自身的 `border-right`，而 `gutter` 仍然是独立存在的一条透明拖拽轨道。这会导致视觉上看起来像“边框 + 拖拽条”两层结构，而不是“拖拽条本身就是分隔线”。

本次需求希望把这层视觉边界收口到 `gutter` 自身承担，不再直接使用文件管理栏面板的右边框。同时，用户已明确确认：`gutter` 的真实宽度也要一起收成接近 `1px` 的细线，而不是只在视觉上伪装成细线。

## 2. 目标与非目标

### 2.1 目标

1. 让文件管理栏右侧分隔线完全由 `gutter` 本身承担。
2. 让 `gutter` 的视觉宽度与真实轨道宽度都收成 `1px`。
3. 保持当前 `split-grid` 拖拽接线方式不变，只做最小布局与样式调整。
4. 保持文件管理栏关闭后的宿主退化行为不变，不重新引入左侧唤起手柄或额外空槽。

### 2.2 非目标

1. 不优化 `1px` 轨道下的拖拽命中区；命中区变窄是本次需求接受的交互取舍。
2. 不新增伪元素、额外透明热区或新的拖拽节点。
3. 不调整文件管理栏默认宽度、最小宽度、最大宽度规则。
4. 不修改编辑器内部 `MarkdownEdit`、预览页或引导页已有的分栏轨道宽度。

## 3. 用户确认的交互决策

### 3.1 gutter 真实宽度

用户已确认：

- 不仅要把 `gutter` 视觉上做成细线。
- 还要把 `gutter` 的真实宽度一起收成接近 `1px`。

这意味着拖拽命中区会明显变窄。该结果属于本次需求明确接受的交互取舍，不视为实现缺陷。

### 3.2 实现方案

用户已确认采用最直接的收口方案：

- 去掉文件管理栏面板本体自己的右边框。
- 保留现有 `gutter` 节点和 `split-grid` 接线。
- 将 `gutter` 轨道直接改为 `1px`，让它同时承担视觉边界和拖拽轨道。

## 4. 视觉设计

### 4.1 分隔线归属

文件管理栏右侧分隔线从“面板容器右边框”迁移到“外层 gutter 轨道本身”：

- `home-file-manager-panel-slot` 不再提供 `border-right`。
- `home-file-manager-gutter` 成为唯一的右侧分隔线承载节点。

这样视觉上会统一为一条真实存在的细线，而不是“边框 + 独立拖拽条”的双层表达。

### 4.2 线宽与颜色

- `gutter` 轨道宽度改为 `1px`。
- 颜色继续使用系统现有 `border-primary` 语义对应的边框色。
- 不引入新的主题变量，也不单独写死亮暗主题颜色。

### 4.3 顶部边界

当前文件管理栏宿主顶部已经有与主内容区对齐的上边框，这轮调整不改变其存在方式：

- 文件管理栏面板容器继续保留顶部边框。
- `gutter` 继续保留顶部边框。

本次只迁移右侧视觉边界，不改变顶部边界职责。

## 5. 交互设计

### 5.1 展开态布局

文件管理栏展开时，主窗口外层宿主仍然保持三列结构：

- `文件管理栏面板`
- `gutter`
- `主内容区`

只是列定义从：

```text
<panel-width> 2px 1fr
```

调整为：

```text
<panel-width> 1px 1fr
```

### 5.2 关闭态布局

文件管理栏关闭时继续保持现有行为：

- 宿主直接退化为 `1fr`
- 不渲染文件管理栏插槽
- 不渲染 `gutter`
- 不渲染额外唤起手柄

本次不改变关闭态语义。

### 5.3 拖拽行为

拖拽行为继续沿用现有 `split-grid` 配置：

- `columnGutters` 仍绑定现有 `gutter` 元素。
- 宽度变化仍通过现有 `onDrag()` 读取当前网格列宽并钳制。
- 文件管理栏宽度边界仍为 `200px` 到 `420px`。

唯一变化是：由于 `gutter` 真实轨道宽度改成 `1px`，拖拽命中区也会同步缩窄。

## 6. 实现设计

### 6.1 Renderer 落点

#### `wj-markdown-editor-web/src/views/HomeView.vue`

负责以下调整：

- 去掉 `home-file-manager-panel-slot` 的 `border-right` 相关 class。
- 保留文件管理栏插槽的顶部边框 class。
- 保留 `home-file-manager-gutter`，让它继续承载顶部边框与拖拽语义。
- 将 `gutter` 作为唯一分隔线节点，不新增额外 DOM。

#### `wj-markdown-editor-web/src/components/layout/homeViewFilePanelLayoutUtil.js`

负责以下调整：

- 将 `resolveHomeViewFilePanelGridTemplateColumns(width)` 的列定义从 ``${width}px 2px 1fr`` 改为 ``${width}px 1px 1fr``。
- 保持 `clampFileManagerPanelWidth()`、`readCurrentPanelWidth()` 和 `split-grid` 生命周期逻辑不变。

### 6.2 不涉及的模块

以下模块本次不调整：

- `wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue`
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- `wj-markdown-editor-web/src/views/PreviewView.vue`
- `wj-markdown-editor-web/src/views/GuideView.vue`

原因是本次需求只针对主窗口文件管理栏区域，不扩散到其他使用 `2px` gutter 的场景。

## 7. 数据流与状态规则

本次改动不新增状态，不改变任何 IPC 和会话链路：

- `store.fileManagerPanelVisible` 的使用方式不变。
- `fileManagerPanelWidth` 的更新方式不变。
- `document-session`、文件管理栏目录状态和当前文档高亮逻辑都不受影响。

这次变更是纯布局与样式收口，不引入新的状态来源。

## 8. 风险与取舍

### 8.1 明确接受的取舍

由于用户明确要求“真实宽度也一起收成接近 `1px`”，因此以下结果属于已接受取舍：

- `gutter` 的拖拽热区显著变窄。
- 拖拽时会比 `2px` 轨道更挑手。

实现上不会额外补透明热区，也不会通过伪元素扩大命中范围，否则会偏离用户确认的方案。

### 8.2 控制范围

为了降低风险，本次只调整 `HomeView` 的文件管理栏外层壳层与对应布局 util：

- 不改文件管理栏内部内容结构。
- 不改关闭态逻辑。
- 不改其他页面分栏宽度。

这样可以把回归面收敛在主窗口文件管理栏宿主层。

## 9. 测试设计

### 9.1 Web 布局 util 测试

需要更新或补充以下断言：

1. 默认宿主 `grid-template-columns` 应从 `260px 2px 1fr` 变为 `260px 1px 1fr`。
2. 拖拽读取当前轨道宽度时，示例值应从 `520px 2px 1fr` 改为 `520px 1px 1fr`，并继续验证面板宽度钳制。
3. 文件管理栏关闭再打开后，`split-grid` 仍会重建，确认 `1px` 轨道没有破坏接线。

### 9.2 HomeView 宿主测试

需要更新或补充以下断言：

1. `home-file-manager-panel-slot` 不再包含 `b-r-1`、`b-r-border-primary`、`b-r-solid`。
2. `home-file-manager-panel-slot` 仍保留顶部边框相关 class。
3. `home-file-manager-gutter` 仍存在，并继续保留顶部边框相关 class。
4. 文件管理栏关闭时宿主仍退化为单列 `1fr`。

### 9.3 回归验证

实现完成后需要至少做以下定向验证：

1. 对改动文件运行包内定向 `eslint --fix`。
2. 运行文件管理栏宿主与布局 util 相关测试，确认没有引入结构回归。

## 10. 实施顺序建议

1. 先修改布局 util 相关测试，让 `2px` 轨道预期变为 `1px`，并观察失败。
2. 再修改 `HomeView` 宿主测试，明确右边框从面板迁移到 `gutter` 的断言。
3. 之后再调整 `homeViewFilePanelLayoutUtil.js` 与 `HomeView.vue` 实现。
4. 最后执行定向 ESLint 与测试验证。

## 11. 最终结论

本轮采用“由 `gutter` 直接承担右侧边界，且真实轨道宽度收成 `1px`”的最小改动方案：

- 满足用户对视觉归属和真实宽度的一致性要求。
- 不引入新的 DOM、状态或拖拽机制。
- 将变更范围控制在主窗口文件管理栏宿主层与对应布局 util。

代价是拖拽命中区会同步变窄，但该行为已由用户明确接受，因此本方案可以直接进入实现计划阶段。
