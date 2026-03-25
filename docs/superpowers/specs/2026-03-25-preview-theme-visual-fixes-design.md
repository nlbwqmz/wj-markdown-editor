# 预览主题视觉问题治理设计

## 1. 背景

当前项目的预览主题体系已经完成了“稳定根类 + 变量协议 + 基础骨架 + 主题特例”的第一轮收口，但用户在真实使用中仍然遇到一批预览样式问题。这批问题并不是单一主题的零散缺陷，而是同时暴露了以下几个结构性缺口：

- 预览基础层对部分 Markdown 语义没有提供统一承接，例如 `kbd`、Mermaid 图表表面、代码块工具栏显隐、主题根背景纹理等。
- `details` 同时受到自定义容器样式与预览主题样式双重控制，职责边界不清。
- 多个主题的暗黑模式分支只覆盖了极少量变量，无法表达引用、表格、Mermaid、背景纹理等运行时视觉表面。
- 当前自动化测试更偏向“主题结构约束”，但对 `kbd`、复制按钮输出结构、Mermaid 回归样本、`details` 独立链路的保护不够。

本轮设计只针对用户已明确提出的预览问题进行治理，不扩大到代码主题、编辑器主题或 Electron 侧主题配置体系。

## 2. 问题清单归类

用户当前确认的问题如下：

- 代码块的复制按钮看不见
- `::: details` 样式不好看
- `juejin` 主题四五六级标题层级异常，且 `kbd` 无样式
- `juejin` 明亮模式的表格斑马纹丢失
- `juejin` / `smart-blue` / `vuepress` / `mk-cute` / `scrolls` 等主题在暗黑模式下，对引用、表格、Mermaid、背景纹理的适配不完整
- `markdown-here` 主题无序列表样式缺失，且 `kbd` 无样式

这些问题可归为四类：

### 2.1 基础语义缺少统一兜底

涉及：

- `kbd`
- 代码块复制按钮
- Mermaid 外壳与背景
- 主题根背景纹理在暗黑模式下的可读性

这类问题不应继续分散到各主题文件中单独硬编码，而应进入统一变量协议与基础骨架。

### 2.2 `details` 链路职责冲突

当前 `details` 同时使用：

- 自定义容器插件输出结构
- `wj-markdown-it-container.scss` 的容器样式
- `preview-theme-base.scss` 中的 `details` 变量规则

并且 `summary` 仍带有内联样式，导致预览主题无法完整接管 disclosure 外观。

### 2.3 主题暗黑分支覆盖能力不足

当前多个主题的 dark 分支只能改少量文字色或行内代码变量，导致以下表面无法被主题化：

- 引用块背景与文字对比
- 表格表头、斑马纹、边框
- Mermaid 外壳背景
- 主题根背景纹理

### 2.4 回归测试覆盖缺口

当前已有测试主要保证：

- 稳定根类结构正确
- 基础骨架只消费变量
- 主题 dark 分支挂载位置正确

但以下风险没有被自动拦截：

- `markdownItCodeBlock` 输出结构退化
- `kbd` 未出现在回归样本中
- Mermaid 回归样本缺失
- `details` 渲染链路未与通用容器链路明确隔离

## 3. 目标

本轮治理目标如下：

1. 修复用户已列出的全部预览问题。
2. 将这批问题收敛为“基础语义补齐 + `details` 结构梳理 + 主题 dark 表面校准 + 测试补强”的一次性治理，而不是临时补丁。
3. 保持当前预览主题名称、配置项和值不变。
4. 保持当前 Markdown 渲染主链路不变，不引入新的主题系统或新的主题枚举。
5. 为后续继续维护预览主题提供更清晰的职责边界。

## 4. 非目标

本轮明确不做以下事项：

- 不重构代码高亮主题体系。
- 不新增预览主题。
- 不改动 Electron 端配置结构与存储格式。
- 不为了这批问题重写整个 Markdown 渲染器。
- 不引入视觉截图测试平台或完整的浏览器端 E2E 体系。
- 不把 Mermaid 做成“每个主题都拥有一套独立 SVG token 映射”的重型方案，除非基础表面治理后仍无法满足效果。

## 5. 现状分析

### 5.1 相关文件

本轮主要影响以下文件：

- `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- `wj-markdown-editor-web/src/util/markdown-it/markdownItCodeBlock.js`
- `wj-markdown-editor-web/src/util/markdown-it/markdownItContainerUtil.js`
- `wj-markdown-editor-web/src/assets/style/wj-markdown-it-container.scss`
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/*.scss`
- `wj-markdown-editor-web/src/assets/style/__tests__/`

### 5.2 当前结构问题

#### 5.2.1 代码块复制按钮

`markdownItCodeBlock.js` 当前直接输出：

- 工具类颜色
- `hidden`
- 图标类
- 内联 `onclick`

这导致复制按钮的“可见性”和“主题表面”被同时绑定在 HTML 结构里，而不是由预览主题接管。

#### 5.2.2 `details`

`markdownItContainerUtil.js` 当前为 `details` 输出：

- 外层 `.wj-markdown-it-container`
- 内层原生 `details`
- 带内联样式的 `summary`

这会让“提示容器”和“折叠容器”两种视觉语义混在一起，导致 `details` 很难做出清晰的 disclosure 外观。

#### 5.2.3 Mermaid

`MarkdownPreview.vue` 只根据全局主题在 Mermaid 的 `default/dark` 主题之间切换，但并没有把“预览主题表面”映射到 Mermaid 外壳层。结果是：

- Mermaid 图表主体跟随 Mermaid 自身主题
- 但图表外壳和周边背景仍可能沿用不适合当前主题的默认表面

#### 5.2.4 主题 dark 分支

当前部分主题的 dark 分支被限制为极少变量覆盖，设计初衷是避免回到“dark 分支里写一整套元素规则”的老路。但现在的问题不是主题乱写，而是允许运行时覆盖的语义 token 不足，最终阻止了合理修复。

## 6. 设计结论

### 6.1 总体策略

采用“小范围治理，一次收口”的方案，拆成四个层次：

1. 补齐基础语义协议
2. 梳理 `details` 独立链路
3. 逐主题校准视觉表面
4. 补强测试与回归样本

这四层的边界必须清晰，避免再次回到“哪里坏了就在哪个主题里硬补”。

## 7. 方案设计

### 7.1 补齐预览基础语义协议

需要在 `preview-theme-contract.scss` 新增并在 `preview-theme-base.scss` 消费以下变量：

#### 7.1.1 `kbd` 语义

- `--wj-preview-kbd-padding`
- `--wj-preview-kbd-font-size`
- `--wj-preview-kbd-text-color`
- `--wj-preview-kbd-background-color`
- `--wj-preview-kbd-border`
- `--wj-preview-kbd-border-radius`
- `--wj-preview-kbd-box-shadow`

基础层统一提供 `kbd` 兜底外观。未单独定制的主题至少具备可读、可辨识的键帽样式。

#### 7.1.2 代码块工具栏语义

- `--wj-preview-code-toolbar-text-color`
- `--wj-preview-code-toolbar-background-color`
- `--wj-preview-code-toolbar-opacity`
- `--wj-preview-code-toolbar-hover-opacity`
- `--wj-preview-code-toolbar-copy-display`
- `--wj-preview-code-toolbar-copy-hover-display`

当前已有部分工具栏变量，但缺少“默认可见状态”和“悬浮增强”的完整表达。本轮需要让复制按钮默认可感知，而不是完全不可见。

#### 7.1.3 Mermaid 表面语义

- `--wj-preview-mermaid-background-color`
- `--wj-preview-mermaid-border-radius`
- `--wj-preview-mermaid-padding`
- `--wj-preview-mermaid-text-align`

基础层统一承接 `pre.mermaid` 与 `pre.mermaid-cache` 的外壳表面，确保图表落在正确背景上。

#### 7.1.4 主题根背景语义

- `--wj-preview-theme-background-image`
- `--wj-preview-theme-background-size`
- `--wj-preview-theme-background-position`

基础层负责根容器消费这些变量。这样 `smart-blue`、`mk-cute` 等主题在 dark 分支里只需要改背景 token，不再写分散的根块覆盖。

### 7.2 调整代码块复制按钮输出结构

`markdownItCodeBlock.js` 需要从“结构里写死展示逻辑”改为“结构只暴露语义类，展示交给样式层”。

具体要求：

- 移除复制按钮上的 `hidden`
- 保留语义类，例如 `.pre-container-copy`
- 保留图标表现，但不要把“是否显示”依赖到工具类切换
- 增加可访问语义，例如 `title` 与 `aria-label`
- 语言标签与复制按钮共享统一工具栏表面变量

本轮不处理 `window.copyCode` 的调用方式，仅处理可视与结构语义。

### 7.3 将 `details` 从通用容器体系中拆开

`details` 不能继续复用提示容器视觉。

具体做法：

1. `markdownItContainerUtil.js` 中的 `details` 分支改为输出独立 disclosure 结构。
2. 移除 `summary` 的内联样式。
3. 不再让 `details` 挂到 `.wj-markdown-it-container-*` 体系下。
4. `wj-markdown-it-container.scss` 继续只负责 `info`、`warning`、`danger`、`tip`、`important` 等提示容器。
5. `preview-theme-base.scss` 统一承接 `details` / `summary` 的基础交互与表面。

最终目标是：

- `details` 拥有统一的“折叠块”视觉语义
- 各主题只通过变量微调风格
- 不再出现提示容器样式污染 `details`

### 7.4 调整主题 dark 分支的允许覆盖范围

本轮不允许 dark 分支重新回到元素级大块覆盖，但允许通过变量覆盖以下语义表面：

- 引用块背景、边框、文字
- 表格边框、表头背景、斑马纹
- 代码块/ Mermaid 外壳背景
- 主题根背景纹理
- `kbd`、行内代码等局部表面

约束仍然保留：

- dark 分支必须挂在稳定根类下
- dark 分支只能写变量声明
- dark 分支不得直接写元素选择器覆盖

也就是说，本轮是“扩展可覆盖的语义 token”，而不是“放弃变量协议”。

### 7.5 逐主题修复策略

#### 7.5.1 `juejin`

修复项：

- 纠正 `h4~h6` 层级尺寸，保证不大于 `h3`
- 恢复明亮模式表格斑马纹
- dark 分支补齐引用、表格、Mermaid 外壳表面
- 增加 `kbd` 主题变量

#### 7.5.2 `smart-blue`

修复项：

- dark 分支补齐引用、表格、Mermaid 外壳背景
- 补强 dark 背景纹理对比度，保证网格可见
- 保留原有标题人格和 `kbd` 特例，但把背景纹理改为变量驱动

#### 7.5.3 `vuepress`

修复项：

- 增加 `kbd` 样式
- dark 分支补齐引用块背景与边框对比

#### 7.5.4 `mk-cute`

修复项：

- 增加 `kbd` 样式
- dark 分支补齐表格与 Mermaid 外壳表面
- 保留旋转标题图标、引用装饰等人格特征

#### 7.5.5 `scrolls`

修复项：

- 增加 `kbd` 样式
- dark 分支补齐表格与 Mermaid 外壳表面
- 保留卷轴标题装饰和任务列表皮肤

#### 7.5.6 `markdown-here`

修复项：

- 恢复无序列表标记，不再让 `ul` 退化为纯文本块
- 增加 `kbd` 样式
- dark 分支补齐表格、引用、Mermaid 外壳的可读性

### 7.6 Mermaid 的处理边界

本轮 Mermaid 分两级处理：

#### 一级：必须完成

通过主题变量解决 Mermaid 外壳表面问题，包括：

- 背景色
- 圆角
- 内边距
- 对齐

#### 二级：按需追加

如果一级处理后，仍然出现“图内部节点颜色与主题强烈冲突”，再在 `MarkdownPreview.vue` 中根据 `previewTheme + globalTheme` 为 Mermaid 注入有限的 `themeVariables`。这一步不是默认第一优先级，避免把本轮工作扩成 Mermaid 专项改造。

## 8. 测试与验证设计

### 8.1 回归样本补充

扩充 `preview-theme-regression.md`，至少新增：

- `kbd` 示例
- Mermaid 示例
- 多级无序列表示例
- 更明确的 `details` 示例

### 8.2 静态结构测试补充

新增或扩展测试，覆盖：

- `markdownItCodeBlock` 输出中复制按钮不再依赖 `hidden`
- `details` 渲染不再输出提示容器根类
- 基础层已消费 `kbd`、Mermaid、主题根背景相关变量

### 8.3 主题变量测试调整

更新 `previewThemeVariableCoverage.test.js`：

- 允许目标主题 dark 分支覆盖新的语义变量
- 继续禁止 dark 分支写元素级规则
- 继续要求 dark 分支挂在稳定根类下

### 8.4 人工验收矩阵

至少覆盖：

- 8 个预览主题
- 明亮 / 暗黑两种全局主题
- 编辑页预览区
- 独立预览页

重点检查项：

- 代码块复制按钮是否可见且对比清晰
- `kbd` 是否具备清晰键帽样式
- `details` 是否具备统一 disclosure 外观
- 表格、引用、Mermaid 在 dark 模式下是否可读
- `markdown-here` 无序列表是否恢复标记
- `juejin` 标题层级是否正确

## 9. 风险与控制

### 9.1 风险：为了解决 dark 问题而重新放大主题自由度

控制方式：

- 只扩展变量协议，不放开元素级 dark 覆盖
- 保持 dark 分支“只能写变量”的约束

### 9.2 风险：`details` 链路改动后影响导出页

控制方式：

- 导出页同样依赖预览 DOM 结构，必须纳入人工验收
- `ExportView.vue` 当前会主动展开 `details`，需要验证新结构不影响该行为

### 9.3 风险：复制按钮结构调整后影响当前交互

控制方式：

- 只改结构语义与样式显示逻辑，不改 `window.copyCode` 入口
- 增加输出结构测试，避免交互被误删

### 9.4 风险：Mermaid 修复过深导致范围失控

控制方式：

- 默认只治理外壳表面
- 只有在一级方案不足时，才进入 Mermaid `themeVariables`

## 10. 实施顺序

建议按以下顺序执行：

1. 补齐 `preview-theme-contract.scss` 与 `preview-theme-base.scss` 的新语义变量。
2. 调整 `markdownItCodeBlock.js` 的复制按钮输出结构。
3. 调整 `markdownItContainerUtil.js`，将 `details` 独立出通用容器体系。
4. 清理 `wj-markdown-it-container.scss` 中只针对 `details` 的残留职责。
5. 修复 `juejin` 与 `smart-blue` 两个问题最集中的主题。
6. 修复 `vuepress`、`mk-cute`、`scrolls`、`markdown-here` 的补充问题。
7. 扩充回归样本并更新静态测试。
8. 进行明亮 / 暗黑全主题手工回归。

## 11. 完成标准

当满足以下条件时，本轮治理视为完成：

- 用户问题清单中的全部问题已被修复。
- `kbd`、代码块工具栏、Mermaid 外壳、主题根背景纹理拥有统一变量协议。
- `details` 不再复用提示容器样式，也不再带内联 `summary` 样式。
- 受影响主题的 dark 分支只通过变量覆盖完成视觉校准。
- 回归样本已覆盖 `kbd`、Mermaid、多级列表、`details`。
- 自动化测试能够阻止这批问题以同样形式再次回归。
