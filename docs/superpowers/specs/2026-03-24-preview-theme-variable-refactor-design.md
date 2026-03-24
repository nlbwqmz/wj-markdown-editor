# 预览主题变量化重构设计

## 1. 背景

当前 Web 端预览主题位于 `wj-markdown-editor-web/src/assets/style/preview-theme/theme/`，存在以下问题：

- 多个主题文件同时承担“基础 Markdown 结构样式”和“主题个性化样式”两类职责，边界不清。
- 同类结构在 8 个主题文件中重复出现，例如标题、段落、列表、引用、表格、行内代码、代码块外壳。
- 历史主题文件中混入了部分来自外部样式源的规则，其中有些在当前项目渲染链路下不会命中。
- 主题切换的对外契约已经稳定，但内部实现维护成本较高，后续继续新增或清理主题样式的风险较大。

用户已确认本轮改造只处理 **预览主题**，代码主题暂不纳入范围。用户也确认：

- 允许预览主题视觉出现小幅变化。
- 只删除能够明确证明在当前项目环境下不会生效的冗余样式。
- 预览主题的对外名称和配置值必须保持不变。
- 正式开发需在新分支进行，允许使用 subagent。

## 2. 目标

本轮改造的目标如下：

1. 固定预览主题的基础骨架样式，把 Markdown 结构共性收敛到统一基础层。
2. 将各主题的大部分差异改为通过 CSS 变量驱动。
3. 允许少量无法通过变量表达的主题特例，在对应主题文件中使用更高优先级覆盖基础层。
4. 清理当前渲染链路下可明确证明不会命中的冗余样式。
5. 保持现有主题枚举值、配置结构和运行时切换方式不变。

## 3. 非目标

本轮明确不做以下事项：

- 不重构代码主题加载机制，不修改 `codeThemeUtil.js` 的行为。
- 不变更预览主题的对外名称、配置字段和值。
- 不引入新的预览主题。
- 不为了“更统一”而主动压平所有主题风格差异。
- 不删除“看起来像无用，但缺乏证据”的样式。
- 不触碰 Electron 端主题配置结构。

## 4. 当前链路与约束

### 4.1 主题切换入口

- 预览容器在 `MarkdownPreview.vue` 中通过 `preview-theme-${previewTheme}` 应用主题 class。
- 设置页通过 `config.theme.preview` 读写当前预览主题。
- Electron 默认配置中的预览主题值是 `github`。
- 历史值 `github-light` 已在配置修复逻辑中被迁移为 `github`。

### 4.2 Markdown 渲染结构

当前项目真实会输出或渲染的结构主要包括：

- 标题、段落、链接、强调、分割线
- 有序列表、无序列表、任务列表
- 表格
- 图片、音频、视频
- 行内代码、代码块容器、`pre:not(.hljs)` 外壳
- 脚注
- GitHub Alert
- 自定义容器 `info`、`warning`、`danger`、`tip`、`important`、`details`

### 4.3 代码块约束

- 当前代码块由 `markdownItCodeBlock.js` 渲染，输出 `.pre-container` 和 `.hljs` 结构。
- `.hljs` 及其 token 颜色仍由代码主题负责。
- 预览主题只负责代码块外壳、字体、边距、圆角、背景等非语法 token 部分。

## 5. 设计结论

### 5.1 总体结构

预览主题样式体系重构为 3 层：

```text
wj-markdown-editor-web/src/assets/style/preview-theme/
├─ preview-theme.scss
├─ preview-theme-contract.scss
├─ preview-theme-base.scss
└─ theme/
   ├─ github.scss
   ├─ juejin.scss
   ├─ smart-blue.scss
   ├─ vuepress.scss
   ├─ mk-cute.scss
   ├─ cyanosis.scss
   ├─ scrolls.scss
   └─ markdown-here.scss
```

各层职责如下：

- `preview-theme-contract.scss`
  - 定义统一变量协议与默认值。
  - 不出现具体主题名。
- `preview-theme-base.scss`
  - 承载 Markdown 结构骨架。
  - 只消费变量，不写具体主题名。
- `theme/*.scss`
  - 每个主题优先只做变量赋值。
  - 当变量无法表达某种视觉差异时，再写少量主题特例覆盖。
- `preview-theme.scss`
  - 只做聚合入口。
  - 固定引入顺序：变量协议 -> 基础骨架 -> 具体主题。

### 5.2 变量优先原则

每个主题文件必须优先尝试通过变量表达差异，只在以下情况允许写特例覆盖：

- 标题装饰、背景纹理、伪元素图形等结构化视觉效果
- 变量无法覆盖的特殊布局
- 个别主题确实需要改变某个局部结构的呈现方式

不允许保留“大段完整结构样式 + 少量变量”的旧模式，否则无法实现这次重构的目标。

## 6. 变量协议

变量统一以 `--wj-preview-*` 为前缀，避免与现有全局变量混淆。

### 6.1 基础文本

- `--wj-preview-text-color`
- `--wj-preview-muted-color`
- `--wj-preview-bg`
- `--wj-preview-font-size`
- `--wj-preview-line-height`

### 6.2 标题系统

- `--wj-preview-heading-color`
- `--wj-preview-heading-weight`
- `--wj-preview-h1-size`
- `--wj-preview-h2-size`
- `--wj-preview-h3-size`
- `--wj-preview-heading-border-color`

### 6.3 链接与强调

- `--wj-preview-link-color`
- `--wj-preview-link-hover-color`
- `--wj-preview-strong-color`
- `--wj-preview-inline-code-color`
- `--wj-preview-inline-code-bg`

### 6.4 引用与分隔

- `--wj-preview-blockquote-text-color`
- `--wj-preview-blockquote-bg`
- `--wj-preview-blockquote-border-color`
- `--wj-preview-hr-color`

### 6.5 表格

- `--wj-preview-table-border-color`
- `--wj-preview-table-header-bg`
- `--wj-preview-table-stripe-bg`

### 6.6 代码块外壳

- `--wj-preview-code-block-bg`
- `--wj-preview-code-block-color`
- `--wj-preview-code-block-radius`
- `--wj-preview-code-block-padding`

### 6.7 其他结构

- `--wj-preview-kbd-bg`
- `--wj-preview-kbd-color`
- `--wj-preview-image-shadow`

## 7. 基础层承载范围

以下结构统一进入 `preview-theme-base.scss`：

- 根容器排版
- 标题、段落、列表
- 引用、链接、强调、分割线
- 表格
- 图片
- 行内代码
- `pre:not(.hljs)` 与 `pre > code`
- `.pre-container`、复制按钮、语言标签
- 脚注
- 任务列表
- `details` / `summary`

以下结构不进入预览基础层：

- `.hljs` 及其语法 token 颜色
- 已由独立全局样式文件管理的 container 通用样式

## 8. 主题层承载范围

每个主题文件只保留两类内容：

1. `.preview-theme-xxx { ...变量赋值... }`
2. 少量无法变量化的特例覆盖

示例：

```scss
.preview-theme-smart-blue {
  --wj-preview-text-color: #595959;
  --wj-preview-heading-color: #135ce0;
  --wj-preview-link-color: #036aca;
  --wj-preview-inline-code-bg: #fff5f5;
  --wj-preview-inline-code-color: #ff502c;
  --wj-preview-blockquote-bg: #fff9f9;
}

.preview-theme-smart-blue {
  background-image:
    linear-gradient(90deg, rgba(60, 10, 30, 0.04) 3%, rgba(0, 0, 0, 0) 3%),
    linear-gradient(360deg, rgba(60, 10, 30, 0.04) 3%, rgba(0, 0, 0, 0) 3%);
  background-size: 20px 20px;
}
```

## 9. 冗余样式删除标准

本轮删除遵循最保守标准：**只删除能够由当前项目代码与插件链路明确证明不会命中的样式。**

允许删除的典型类型：

### 9.1 历史主题名残留

- `.preview-theme-github-light ...`

删除依据：

- 当前预览主题配置值为 `github`。
- 历史值 `github-light` 已在配置修复逻辑中迁移为 `github`。
- 运行时不会再生成 `preview-theme-github-light` 主题 class。

### 9.2 GitHub 锚点图标相关规则

- `.octicon`
- `.anchor .octicon-link`

删除依据：

- 当前仅使用 `markdown-it-anchor` 默认接入。
- 未配置 GitHub 风格 permalink 渲染。
- 当前渲染链路不会生成 `.anchor`、`.octicon-link` 结构。

### 9.3 GitHub Prettylights 语法高亮规则

- `.pl-c`
- `.pl-k`
- `.pl-s`
- 其他 `.pl-*`

删除依据：

- 当前代码块输出为 `.hljs` 结构。
- 当前项目不输出 GitHub Prettylights 的 `.pl-*` token class。

### 9.4 不可能命中的后代选择器

- `.preview-theme-github body:has(:modal)`

删除依据：

- 预览区主题 class 应用于组件内根容器。
- `body` 不会作为该容器的后代存在。

### 9.5 当前链路不会输出的组件选择器

- `details-dialog`

删除依据：

- 当前 `details` 相关输出来自自定义容器插件，渲染的是普通 `details` / `summary` 结构。

## 10. 明确保留的规则

以下规则即使看起来来源较旧，也不应在本轮按“冗余”删除：

- `.markdown-alert` 相关规则
- `.task-list-item` 相关规则
- `.footnotes` 与 `[data-footnote-ref]` 相关规则
- `details` / `summary` 相关规则

原因是这些结构在当前项目中仍由实际插件链路产出。

## 11. 实施顺序

### 11.1 第一步：建立基础层

- 新建变量协议文件
- 新建预览基础骨架文件
- 将 `preview-theme.scss` 改为纯聚合入口

### 11.2 第二步：以 `github` 主题为样板迁移

- 把 `github` 主题迁移为“变量赋值 + 少量特例覆盖”
- 同时删除已确认不会命中的历史规则
- 用它验证变量协议是否足以覆盖主流结构

### 11.3 第三步：迁移其余主题

建议顺序：

- `juejin`
- `vuepress`
- `markdown-here`
- `smart-blue`
- `mk-cute`
- `cyanosis`
- `scrolls`

排序原则：

- 先迁偏排版型主题
- 后迁强风格化主题

### 11.4 第四步：统一回归与清理

- 逐个核对 8 个主题的视觉完整性
- 统一清理可证明无效的残留选择器
- 修正默认值残留，例如组件层的 `github-light`

## 12. 验证方案

需要准备一份固定的回归样本文档，覆盖以下内容：

- 标题、段落、加粗、斜体、链接、引用、分割线
- 有序列表、无序列表、任务列表
- 表格、图片、音频、视频
- 行内代码、代码块
- 脚注
- GitHub Alert
- `details` 容器

验证方法：

1. 在同一份样本文档下切换 8 个主题。
2. 确认结构统一稳定。
3. 确认主题差异主要由变量驱动。
4. 确认个性化主题的特例覆盖没有污染其他主题。
5. 确认删除的规则确实不会影响当前输出。

## 13. 风险与控制

### 13.1 风险：基础层范围过大，导致主题个性被压平

控制方式：

- 基础层只承载结构共性，不承载主题人格。
- 对强风格主题保留薄覆盖层。

### 13.2 风险：变量协议不完整，导致主题迁移后仍需回填大量结构规则

控制方式：

- 先用 `github` 主题试跑。
- 协议不足时先补变量，再继续迁移其他主题。

### 13.3 风险：冗余删除误删边缘功能样式

控制方式：

- 每一条删除都必须附带渲染链路依据。
- 不做无证据删除。

### 13.4 风险：改造范围失控，顺手触碰代码主题

控制方式：

- 本轮明确不进入代码主题实现。
- 只有在预览主题重构被代码主题现状直接阻塞时，才允许单点补救。

## 14. 完成标准

当满足以下条件时，本轮设计目标视为达成：

- `preview-theme.scss` 成为纯聚合入口。
- 新增统一的变量协议文件和预览基础骨架文件。
- 8 个预览主题全部迁移到“变量为主，少量特例覆盖”的结构。
- `github-light` 等预览主题历史残留默认值被清理。
- 当前链路下可明确证明无效的选择器被删除。
- 预览主题对外名称和配置值保持不变。
- 8 个主题在统一回归样本文档下均能正常切换和展示。

## 15. 开发组织要求

- 正式实现必须在新分支进行。
- 允许使用 subagent，但任务拆分必须遵守清晰边界。
- 建议拆分为以下职责：
  - 基础层与变量协议
  - `github` 样板迁移
  - 其他主题迁移
  - 冗余选择器清理与验证

