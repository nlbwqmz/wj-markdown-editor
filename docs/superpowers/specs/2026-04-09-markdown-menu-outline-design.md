# MarkdownMenu 自定义大纲导航设计

## 背景

当前 `[MarkdownMenu.vue](D:/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue)` 直接依赖 Ant Design Vue 的 `a-anchor` 组件来渲染和管理大纲导航。现有实现虽然具备基础能力，但存在两个问题：

1. 视觉风格过度受第三方组件约束，无法稳定落到项目当前的编辑器/预览面板气质上。
2. 激活态识别、菜单自滚动和点击滚动都被绑定在 `a-anchor` 的 DOM 结构与类名上，后续维护空间很小。

本次需求已经确认采用 A 方案“工具型条带导航”，核心目标是在 **完全去掉 `a-anchor` 渲染依赖** 的前提下，保留当前各页面里已经存在的功能行为，不引入调用方功能回退。

## 目标

- 将 `MarkdownMenu` 从 `a-anchor` 替换为自定义渲染的树形/列表式大纲导航。
- 保持现有调用方契约不变，继续通过 `anchorList`、`getContainer`、`close` 驱动组件。
- 保持“预览区域滚动 -> 大纲动态高亮 -> 大纲自动滚动到激活项”的联动能力。
- 保持“点击大纲 -> 使用 JS 平滑滚动预览容器到目标标题”的跳转能力。
- 样式遵循项目现有全局主题变量，明暗主题下都和编辑器/预览面板视觉协调。
- 覆盖 `MarkdownEdit`、`PreviewView`、`GuideView` 等现有使用场景，不让目录功能回退。

## 非目标

- 不调整 `MarkdownPreview` 的大纲生成逻辑，不改变 `anchorList` 数据结构。
- 不修改预览区内部 hash 链接的对外行为，只在菜单点击时复用同类 JS 滚动语义。
- 不新增折叠/展开目录、搜索目录、吸顶目录等超出当前需求的交互。
- 不改变空状态、标题栏、关闭按钮的产品语义。

## 现有结构与约束

### 调用方约束

以下组件已经依赖 `MarkdownMenu`，本次改造后它们的对接方式必须保持不变：

- `[MarkdownEdit.vue](D:/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue)`
- `[PreviewView.vue](D:/code/wj-markdown-editor/wj-markdown-editor-web/src/views/PreviewView.vue)`
- `[GuideView.vue](D:/code/wj-markdown-editor/wj-markdown-editor-web/src/views/GuideView.vue)`

其中：

- `anchorList` 来自 `[MarkdownPreview.vue](D:/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue)` 对标题树的收集。
- `getContainer` 用于提供当前预览滚动容器，不同调用方会传入不同的 DOM ref。
- `close` 为可选项，仅在支持关闭目录面板的页面中出现。

### 现有滚动语义约束

预览区内部 hash 锚点点击已经由 `[previewAnchorLinkScrollUtil.js](D:/code/wj-markdown-editor/wj-markdown-editor-web/src/util/editor/previewAnchorLinkScrollUtil.js)` 接管，当前语义是：

- 不依赖浏览器默认 hash 跳转。
- 基于预览滚动容器和目标元素的相对位置计算 `scrollTop`。
- 使用 `container.scrollTo({ top, behavior: 'smooth' })` 执行平滑滚动。

菜单点击后的跳转行为必须与此保持一致，避免出现“预览内部链接一种滚动方式、左侧目录另一种滚动方式”的割裂体验。

### 主题约束

项目已经提供全局主题变量，本次目录样式必须优先复用：

- `--wj-markdown-text-primary`
- `--wj-markdown-text-secondary`
- `--wj-markdown-text-tertiary`
- `--wj-markdown-bg-primary`
- `--wj-markdown-bg-secondary`
- `--wj-markdown-bg-hover`
- `--wj-markdown-border-primary`

不允许为目录单独引入一套与项目主体脱节的新主题系统。

## 选定方案

采用 A 方案“工具型条带导航”。

该方案的视觉与交互原则如下：

- 大纲仍然表现为高密度工具面板，而不是阅读型目录卡片。
- 层级通过缩进、字重、字号微差表达，不依赖复杂图标或大面积装饰。
- 当前激活项使用“左侧细条 + 轻背景 + 文字权重提升”的组合强调。
- hover 为轻量背景反馈，不让目录面板喧宾夺主。
- 长标题默认单行省略，避免窄栏中高度失控。

## 设计方案

### 1. 组件边界

`MarkdownMenu` 只做内部渲染与内部交互重构，不改变对外接口。

组件对外仍然保持：

- `anchorList: Array`
- `getContainer: Function`
- `close: Function | null`

保留不变的区域：

- 标题栏结构
- 空状态
- 关闭按钮行为
- 最外层滚动容器

允许重构的范围：

- 模板从 `a-anchor` 替换为自定义递归/扁平渲染
- active 管理方式
- 点击锚点滚动方式
- 菜单内部滚动跟随方式
- scoped 样式实现

### 2. 数据建模

`MarkdownPreview` 当前发出的 `anchorList` 已经是树形结构，每个节点包含：

- `key`
- `href`
- `title`
- `level`
- `children`

`MarkdownMenu` 内部会新增一层只读派生数据，用于渲染和滚动定位：

- 递归拍平成一维列表，保留父子顺序。
- 每项增加稳定的缩进层级值，供样式使用。
- 建立 `href -> DOM ref` 和 `href -> 标题元素` 的查找关系。

这样既能保留原有树结构用于语义渲染，也能降低滚动联动时每次都递归整棵树的复杂度。

### 3. 预览滚动驱动 active

`MarkdownMenu` 会在组件挂载后，通过 `getContainer()` 获取当前预览滚动容器，并在该容器上绑定滚动监听。

active 计算规则：

1. 从 `anchorList` 对应的标题节点中，找到所有在当前容器内存在的目标标题。
2. 按标题在预览容器中的垂直位置排序。
3. 取“顶部位置小于等于当前滚动位置的最后一个标题”作为 active。
4. 若还未滚到首个标题，则兜底高亮第一个标题。
5. 若接近文档底部，则兜底高亮最后一个标题。

这样可以保持当前用户感知到的行为：随着预览向下阅读，目录高亮同步推进。

### 4. active 变化驱动菜单自滚动

active 项发生变化后，菜单内部会继续自动滚动，使激活项尽量保持在目录视口中段附近。

实现要求：

- 自滚动逻辑只作用于目录自己的滚动容器。
- 当激活项已经完整可见时，不做多余滚动。
- 当激活项接近顶部/底部边缘时，才触发 `scrollIntoView` 或等价定位逻辑。
- 保留原先“高亮项随阅读移动”的观感，不让用户在长目录中丢失当前位置。

### 5. 点击锚点驱动预览滚动

点击目录项后，由 `MarkdownMenu` 自己执行 JS 滚动：

1. 阻止默认点击行为。
2. 通过 `href` 找到预览中的真实目标标题节点。
3. 基于容器与目标节点的 `getBoundingClientRect()` 计算目标 `scrollTop`。
4. 调用 `container.scrollTo({ top, behavior: 'smooth' })` 平滑滚动。

实现要求：

- 计算方式与 `previewAnchorLinkScrollUtil.js` 保持一致或复用同一套 helper。
- 不修改地址栏 hash。
- 不依赖浏览器原生锚点跳转。
- 找不到目标标题时静默失败或走现有 warning 语义，但不能抛出未捕获异常。

### 6. 样式策略

样式落地遵循以下规则：

- 目录背景与当前面板背景保持一致，边框继续复用现有分隔线语义。
- 一级标题权重略高，二三级标题通过缩进和更轻的字重表达。
- active 项使用项目现有蓝色强调系的轻量表达，但不直接复制 Ant Design 默认 anchor 样式。
- hover 态只做细微背景变化和文字颜色增强。
- 长标题使用单行省略。
- 目录项高度保持紧凑，适配编辑器三栏布局中的窄列宽度。

### 7. 生命周期与稳定性

为避免不同页面之间的容器切换导致监听残留，需要满足：

- 组件挂载时绑定当前容器监听。
- `getContainer()` 返回对象变化时重新绑定。
- 组件卸载时统一解绑监听和清理内部状态。
- 不依赖 `a-anchor` 自动注入的类名或副作用。

## 实现影响面

### 主要修改文件

- `[MarkdownMenu.vue](D:/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue)`

### 可能新增的辅助文件

如果 `MarkdownMenu.vue` 内部逻辑明显膨胀，可以拆出以下纯函数/工具：

- `markdownMenuAnchorActiveUtil.js`
- `markdownMenuScrollUtil.js`

是否拆文件，以最终保持组件职责清晰为准；如果单文件仍可读，则优先避免过度拆分。

### 调用方回归范围

以下页面的行为必须确认不回退：

- `[MarkdownEdit.vue](D:/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue)`
- `[PreviewView.vue](D:/code/wj-markdown-editor/wj-markdown-editor-web/src/views/PreviewView.vue)`
- `[GuideView.vue](D:/code/wj-markdown-editor/wj-markdown-editor-web/src/views/GuideView.vue)`

## 测试与验证要求

### 行为验证

- 编辑页中，目录跟随预览滚动动态高亮。
- 编辑页中，点击目录项可以平滑滚动到对应标题。
- 纯预览页中，上述两项行为保持成立。
- 引导页中，上述两项行为保持成立。
- 关闭目录按钮、空状态展示不回退。

### 主题验证

- 明亮主题下，目录文字、边框、hover、active 色彩与当前项目协调。
- 暗黑主题下，目录 active 态仍可辨认，但不出现过强发光或高饱和失衡。

### 回归测试

Web 侧需要补充或更新组件测试，至少覆盖：

- `anchorList` 渲染结果与层级缩进语义
- 容器滚动驱动 active 更新
- 点击目录驱动容器平滑滚动
- 容器切换或组件卸载时正确解绑
- 空目录场景渲染

## 风险与规避

### 风险 1：active 判定与真实阅读位置不一致

原因：

- 目录目标节点定位与预览滚动坐标系不一致。

规避：

- 统一使用预览容器相对坐标计算。
- 复用现有 hash 锚点滚动工具的计算方式，避免出现第二套坐标语义。

### 风险 2：替换 `a-anchor` 后调用方行为退化

原因：

- 对外 props 或边界行为被不小心改动。

规避：

- 明确本次只替换内部实现，不改 props 契约。
- 对 `MarkdownEdit`、`PreviewView`、`GuideView` 做回归测试。

### 风险 3：主题不协调

原因：

- 目录新样式绕开现有主题变量，独立定义颜色。

规避：

- 限定只复用当前全局主题变量和项目已有蓝色强调语义。
- 明暗主题均做验证。

## 交付约束

- 不使用 Git worktree。
- 在当前仓库中创建独立开发分支进行后续实现。
- 后续规格文档与实现计划文档都需要在交付给用户前完成自动化检查与人工自审。

## 结论

本次改造本质上是一次 **无功能回退前提下的目录视图重构**。`MarkdownMenu` 会从第三方组件驱动改为项目自管渲染与滚动联动，但外部页面继续沿用现有数据与调用方式。最终结果应当是：

- 视觉更贴近当前编辑器
- 预览滚动与目录高亮继续同步
- 点击目录继续 JS 平滑滚动
- 明暗主题协调
- 现有页面不回退
