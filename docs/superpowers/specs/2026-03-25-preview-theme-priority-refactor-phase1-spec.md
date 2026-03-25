# Preview Theme Priority Refactor Phase 1 Spec

## 背景

当前预览主题已经完成“变量协议 + 基础骨架 + 主题特例”的第一轮重构，但在真实页面里出现了样式优先级失效问题。问题并非仅限 `juejin`，而是多个预览主题都存在相同风险。

当前基础层在 [wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss) 与 [wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss) 中大量使用 `:where([class*='preview-theme-'])` 和 `:where(...)` 作为根作用域，导致基础层规则 specificity 为 `0`。

与此同时，Web 入口在 [wj-markdown-editor-web/src/main.js](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/main.js) 中引入了 `ant-design-vue/dist/reset.css`。该 reset 对 `h1~h6`、`p`、`ul/ol`、`blockquote`、`pre`、`table` 等元素使用普通元素选择器，specificity 高于基础层，因此会覆盖掉本应由预览主题承接的结构样式。

## 问题陈述

在当前架构下，预览主题的实际行为变成：

- 少量主题文件中的高优先级特例规则仍然生效。
- 大部分依赖基础层承接的结构样式会被 reset 覆盖。
- 同一主题内部出现“部分规则生效、部分规则失效”的混合状态。

这会直接导致以下视觉问题：

- 标题顶部节奏丢失。
- 段落与引用块节奏被打平。
- 嵌套列表层级样式退化。
- 行内代码与代码块的尺寸、背景和滚动行为偏离原主题。
- 表格节奏与间距失真。

## 目标

第一阶段只解决“预览主题整体优先级必须高于 reset”这一架构问题，不进入主题视觉微调。

目标包括：

- 保持预览主题对外名称和配置值不变。
- 为预览主题引入稳定的高优先级根作用域。
- 让基础层整体高于 reset，而不是仅靠个别主题特例规则抢优先级。
- 统一 8 个预览主题文件的根选择器写法。
- 为后续第二阶段的视觉校准提供稳定基础。

## 非目标

第一阶段不做以下事项：

- 不修改主题配置键名或对外主题名。
- 不重做各主题的视觉设计。
- 不进入代码主题改造。
- 不通过 `!important` 或移动 import 顺序来临时修补。
- 不在本阶段处理与优先级无关的主题细节优化。

## 方案原则

### 1. 使用稳定根类承接预览主题

在 `MarkdownPreview` 的主题根容器上增加一个稳定类，例如 `wj-preview-theme`。当前已有的动态类 `preview-theme-${previewTheme}` 继续保留，用于区分具体主题。

目标结构：

```html
<div class="wj-preview-theme preview-theme-juejin code-theme-github">
  ...
</div>
```

### 2. 基础层不再使用 `:where(...)` 作为根作用域

允许继续在后代结构上使用 `:where(p)`、`:where(blockquote)` 等写法降低局部复杂度，但根选择器必须使用具备稳定 specificity 的类选择器。

推荐结构：

```scss
.wj-preview-theme {
  color: var(--wj-preview-text-color);
}

.wj-preview-theme :where(p) {
  margin: var(--wj-preview-paragraph-margin);
}
```

第一阶段需要被自动化验证的关键点不是“旧根选择器被删掉了”，而是“关键基础结构选择器已经显式具备类级 specificity”。至少应覆盖：

- `.wj-preview-theme :where(h1, h2, h3, h4, h5, h6)`
- `.wj-preview-theme :where(p)`
- `.wj-preview-theme :where(ul, ol)`
- `.wj-preview-theme :where(blockquote)`
- `.wj-preview-theme :where(table)`
- `.wj-preview-theme :where(:not(pre) > code, :not(pre) > tt, :not(pre) > samp)`
- `.wj-preview-theme :where(pre)`

### 3. 主题文件统一显式挂到稳定根类上

所有主题变量入口、暗黑模式覆盖和主题特例都统一改为显式根类组合，不再仅以 `.preview-theme-xxx` 作为单独根选择器。

推荐结构：

```scss
.wj-preview-theme.preview-theme-juejin {
  --wj-preview-paragraph-margin: 22px 0;
}

:root[theme='dark'] {
  .wj-preview-theme.preview-theme-juejin {
    --wj-preview-text-color: var(--wj-markdown-text-primary);
  }
}
```

第一阶段需要明确禁止的状态：

- 主题文件中仍存在裸根块 `.preview-theme-xxx { ... }`
- 暗黑模式分支中仍存在裸根块 `.preview-theme-xxx { ... }`
- 媒体查询分支中仍存在裸根块 `.preview-theme-xxx { ... }`

### 4. 第一阶段只修结构，不修视觉细节

第一阶段的验收标准是“预览主题基础层整体赢回优先级”，而不是“8 个主题全部恢复到最终目标视觉”。若某些主题仍有局部视觉偏差，放到第二阶段逐一校准。

## 影响范围

直接影响文件：

- `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/*.scss`
- `wj-markdown-editor-web/src/assets/style/__tests__/`

间接受影响页面：

- 编辑页中的预览区
- 独立预览页
- 导出页中的预览渲染
- 引导页中使用 `MarkdownPreview` 的场景

## 验收标准

第一阶段完成后，应满足：

- 基础层不再使用 `:where([class*='preview-theme-'])` 作为根。
- 基础层关键结构选择器显式具备类级 specificity。
- `MarkdownPreview` 根容器带有稳定预览主题类。
- 8 个主题文件的变量入口、暗黑模式覆盖、主题特例都统一挂到稳定根类上。
- 8 个主题文件中不再残留裸 `.preview-theme-xxx` 根块。
- 标题、段落、引用、列表、表格、代码块这些基础结构样式在真实页面里不再被 AntD reset 压过。
- 当前已确认的 `juejin` 结构性回归具备被修复的前提条件。
