# Web 端滚动条悬停样式改造设计

## 背景

当前 Web 端存在两套滚动条样式来源：

- 通用容器滚动条由 `wj-markdown-editor-web/src/assets/style/scroll.scss` 中的 `.wj-scrollbar` 控制
- CodeMirror 编辑器滚动条由 `wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js` 内联主题样式控制

现状问题：

- 默认状态下轨道始终可见，视觉存在感偏强
- 通用容器与 CodeMirror 的滚动条样式重复维护
- 直接通过改变滚动条真实宽度来做“细/粗”切换，容易在经典滚动条场景下带来布局抖动

## 目标

本次改造目标如下：

- 所有使用 `.wj-scrollbar` 的滚动容器统一滚动条交互
- CodeMirror 编辑器滚动层与通用容器保持同一套视觉规则
- 默认状态仅显示较细的滚动条 thumb，不显示轨道
- 鼠标进入滚动条真实命中区时，显示轨道，并将 thumb 视觉上变粗
- 不影响布局，不因 hover 前后切换导致内容区重排

## 非目标

- 不引入自绘假滚动条
- 不改变页面滚动逻辑、同步滚动逻辑或 CodeMirror 行为
- 不尝试实现“距离边缘若干像素即触发”的近距离感知交互，纯 CSS 无法稳定表达该语义

## 约束与最佳实践结论

### 官方能力边界

- `scrollbar-width` 是标准属性，但仅支持 `auto`、`thin`、`none` 这类粗粒度控制，不适合实现“默认无轨道、hover 显轨道并变粗”的交互
- `scrollbar-gutter` 的主要用途是为经典滚动条预留稳定 gutter，减少滚动条出现或消失时的布局变化；它不能替代具体的滚动条视觉交互
- Chromium / Electron 中要实现本次交互，仍需使用 `::-webkit-scrollbar` 系列伪元素；该能力是非标准能力，但在当前运行环境下是可行方案

### 设计约束

- 为满足“不影响布局”，不能通过 hover 前后改变 `::-webkit-scrollbar` 的真实 `width` / `height` 来制造粗细变化
- “靠近边缘触发”在实现上收敛为“鼠标进入滚动条真实命中区时触发”，即使用滚动条伪元素自身的 hover 状态，而不是容器整体 hover

## 方案对比

### 方案 A：容器 hover 触发轨道显示与变粗

做法：

- 鼠标进入整个可滚动容器时，统一显示轨道并把滚动条变粗

优点：

- 实现最简单

缺点：

- 与“只有鼠标靠近或压到滚动条边缘才触发”的需求不一致
- 触发范围过大，滚动区内移动鼠标时视觉噪声偏高

结论：

- 不采用

### 方案 B：固定命中区，默认细 thumb，进入滚动条命中区后显示轨道并视觉变粗

做法：

- 固定 `::-webkit-scrollbar` 的真实宽度与高度，作为稳定命中区
- 默认轨道透明，仅显示经过透明边框压缩后的细 thumb
- 当鼠标进入滚动条真实命中区时，显示轨道，并减小 thumb 透明边框，使其视觉上变粗

优点：

- 符合需求语义
- 不改变真实 gutter 宽度，不会引起内容重排
- 通用容器与 CodeMirror 都能复用同一组设计令牌

缺点：

- 依赖 `::-webkit-scrollbar` 非标准能力

结论：

- 采用本方案

### 方案 C：覆盖层自绘滚动条

做法：

- 在内容上层渲染自定义滚动条，并自行同步滚动状态

优点：

- 可实现完全自由的视觉交互

缺点：

- 实现和维护成本显著增加
- 需要额外处理拖拽、滚轮、键盘、无障碍和 CodeMirror 集成

结论：

- 不采用

## 最终设计

### 设计原则

- 统一来源：滚动条视觉变量集中定义，避免通用容器和编辑器维护两份独立样式
- 固定占位：真实滚动条命中区固定，hover 前后不改变 gutter
- 视觉切换：通过透明边框、背景裁剪与轨道透明度来制造“细/粗”和“有轨道/无轨道”的状态差异

### 交互定义

- 默认状态
  - 滚动条真实命中区固定存在
  - 轨道透明
  - thumb 视觉较细
- 鼠标进入滚动条真实命中区
  - 轨道显示
  - thumb 视觉变粗
- thumb hover / active
  - 在命中区已激活的基础上进一步加深颜色，保留当前可点击反馈

### 样式结构

计划引入一组 CSS 变量，用于统一配置：

- `--wj-scrollbar-hit-size`
- `--wj-scrollbar-idle-border`
- `--wj-scrollbar-active-border`
- `--wj-scrollbar-track-color`
- `--wj-scrollbar-thumb-color`
- `--wj-scrollbar-thumb-hover-color`
- `--wj-scrollbar-thumb-active-color`

其中：

- `hit-size` 表示真实命中区大小，固定不变
- `idle-border` 与 `active-border` 分别控制细态与粗态的可见宽度

### 通用容器落地

在 `wj-markdown-editor-web/src/assets/style/scroll.scss` 中：

- 保留 `.wj-scrollbar` 作为统一入口
- 继续覆盖后代滚动容器，确保嵌套滚动区保持一致体验
- 默认 track/corner 透明
- thumb 使用透明边框与 `background-clip: content-box`
- `::-webkit-scrollbar:hover`、`::-webkit-scrollbar-thumb:hover`、`::-webkit-scrollbar-thumb:active` 驱动视觉增强

### CodeMirror 落地

在 `wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js` 中：

- 保留与编辑器布局直接相关的规则，例如 `.cm-scroller { overflow-y: scroll }`
- 移除当前内联的整套 `::-webkit-scrollbar*` 规则，避免重复维护

在 `wj-markdown-editor-web/src/assets/style/scroll.scss` 中补充对 CodeMirror 滚动层的统一覆盖：

- `.cm-editor .cm-scroller`
- 必要时覆盖其后代原生滚动区域

这样通用区与编辑器区共享同一组滚动条视觉变量与伪元素规则。

## 影响文件

- `wj-markdown-editor-web/src/assets/style/scroll.scss`
- `wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js`

如果在实施中发现某些组件存在特殊滚动容器未命中 `.wj-scrollbar` 或 `.cm-scroller`，仅做最小补充，不扩散到无关样式文件。

## 测试与验证

### 测试策略

- 为 `scroll.scss` 新增样式快照测试不具备明显收益，本次以行为验证为主
- 为 `editorExtensionUtil.js` 增加单测，确保不再内联维护 `::-webkit-scrollbar` 规则，同时保留 `.cm-scroller` 的 `overflowY: scroll`

### 手工验证项

- 预览区、设置页、文件管理器、其他使用 `.wj-scrollbar` 的区域默认仅显示细 thumb
- 鼠标未进入滚动条命中区时，轨道不可见
- 鼠标进入滚动条命中区后，轨道显示且 thumb 视觉变粗
- CodeMirror 编辑区滚动条行为与普通容器一致
- hover 前后内容区宽度无可见变化，分栏、同步滚动、滚动锚点不受影响

## 风险与缓解

- 非标准实现风险：`::-webkit-scrollbar` 属于非标准能力
  - 缓解：当前目标平台为 Electron，Chromium 环境稳定，可接受
- 不同系统滚动条形态差异
  - 缓解：本次以 Electron 中实际经典滚动条效果为准，验证 Windows 与 Linux 运行结果
- CodeMirror 样式优先级变化
  - 缓解：将编辑器滚动样式收敛到全局样式时，保留必要选择器优先级，避免被主题覆盖

## 参考资料

- MDN `scrollbar-width`: https://developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-width
- MDN `scrollbar-gutter`: https://developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-gutter
- MDN `::-webkit-scrollbar`: https://developer.mozilla.org/en-US/docs/Web/CSS/::-webkit-scrollbar
- CSS Scrollbars Styling Module Level 1: https://drafts.csswg.org/css-scrollbars-1/
- CSS Overflow Module Level 3 `scrollbar-gutter`: https://drafts.csswg.org/css-overflow-3/#scrollbar-gutter-property
