# 代码块主题职责收口设计

## 1. 背景

当前 Web 端预览区同时存在两套主题体系：

- 预览主题：通过 `preview-theme-${previewTheme}` 挂到 `MarkdownPreview` 根容器上。
- 代码主题：通过 `code-theme-${codeTheme}` 挂到同一个根容器上，并由 `codeThemeUtil.js` 动态注入样式。

这套体系在“正文排版”和“代码高亮”两个方向上本来是合理的，但当前实现中，预览主题、预览基础层与代码主题对代码块同时有控制，导致职责边界不清，表现不统一。

当前已经确认的根因有两类：

1. 预览主题基础层与个别主题文件仍直接处理 fenced code block 的样式，例如 `pre`、`pre > code`、`.pre-container`、工具栏可见性和代码块背景。
2. `markdownItCodeBlock.js` 输出的是 `<pre class="hljs"><code>...</code></pre>`，而现有 72 个代码主题几乎都沿用 highlight.js 的标准选择器 `pre code.hljs` / `code.hljs` / `.hljs-*`。这导致代码主题对“代码块外观”的承接并不完整，预览主题被迫补位。

用户已确认本轮改造采用以下方向：

- 三层职责方案
- 对齐代码块 DOM 到 highlight.js 标准结构
- 不改现有 72 个代码主题文件

## 2. 目标

本轮改造的目标如下：

1. 让预览主题退出 fenced code block 的直接视觉控制，只保留正文排版和 inline code。
2. 新增独立的 `code block base` 层，用于承接代码块结构、交互和中立几何样式。
3. 让现有代码主题在不修改源码的前提下，重新稳定接管 `.hljs` 与 token 层的视觉皮肤。
4. 对齐 `markdownItCodeBlock.js` 输出的 DOM 结构，使其符合 highlight.js 主题的普遍选择器约定。
5. 通过自动化测试明确锁定三层职责边界，防止后续主题再次互相污染。
6. 保持当前主题配置项、主题名称和值不变，不影响 Electron 端配置存储。

## 3. 非目标

本轮明确不做以下事项：

- 不修改 `wj-markdown-editor-web/src/assets/style/code-theme/theme/` 下的 72 个代码主题文件。
- 不新增或删除预览主题、代码主题的枚举值。
- 不重构 `codeThemeUtil.js` 的动态加载机制。
- 不将 inline code 交给代码主题；inline code 仍属于预览主题。
- 不在本轮处理 Mermaid 图内部配色；Mermaid 只处理外壳与结构承接，不参与 preview theme 人格化。
- 不改动 `window.copyCode` 的调用方式，只处理结构语义与样式职责。
- 不改动 Electron 端主题配置结构或默认配置字段。

## 4. 当前链路与约束

### 4.1 主题挂载方式

- `MarkdownPreview.vue` 在同一个根节点同时挂载 `wj-preview-theme`、`preview-theme-${previewTheme}`、`code-theme-${codeTheme}`。
- 预览主题样式在应用启动时静态导入。
- 代码主题样式在运行时通过 `<style id="dynamic-code-theme">` 动态注入。

这意味着两套主题天然会一起参与层叠。若不先定义职责边界，就算简单删除某几条规则，也无法从根本上保证一致性。

### 4.2 当前代码块 DOM 契约

`markdownItCodeBlock.js` 当前对普通 fenced code block 输出：

```html
<div class="pre-container">
  <div>...语言标签与复制按钮...</div>
  <pre class="hljs">
    <code>...</code>
  </pre>
</div>
```

问题在于：

- 代码主题普遍假设 `.hljs` 挂在 `code` 元素上。
- 当前 `.hljs` 挂在 `pre` 上，导致主题文件中的 `pre code.hljs`、`code.hljs` 规则无法稳定命中。

### 4.3 当前预览主题越界范围

当前预览主题体系中，以下代码相关职责仍由预览层承接：

- `preview-theme-base.scss` 直接处理 `pre`、`pre:not(.hljs)`、`pre > code`、`.pre-container`、`.pre-container-copy`、`.pre-container-lang`
- 若干主题文件直接追加 `pre`、`pre code`、`code::selection`、`.highlight` 等规则
- 预览主题变量协议仍包含代码块背景、文字、padding、圆角、工具栏等变量

这意味着“代码块外壳”和“高亮内容层”并没有清晰切开。

### 4.4 当前代码主题实际覆盖能力

对 72 个代码主题的静态扫描结果表明：

- 所有主题都定义了 `display`、`overflow-x`、`padding`
- 所有主题都定义了 `color`
- 绝大多数主题定义了 `background`
- 绝大多数主题定义了 `font-style`、`font-weight`
- 一部分主题定义了 `background-color`、`text-decoration`
- 极少数主题定义了 `background-image`、`::selection`、`.language-*` 特化规则

这说明代码主题已经具备完整的“高亮皮肤”能力，但它们并不负责编辑器自定义结构，例如：

- 复制按钮
- 语言标签
- 外层容器布局
- 统一圆角与结构间距
- Mermaid 外壳

因此，最佳实践不是“全部交给代码主题”，而是“让代码主题只负责皮肤，让独立基础层负责结构”。

## 5. 设计结论

### 5.1 三层职责方案

本轮将代码相关样式明确拆为三层：

```text
1. preview theme
   - 正文排版
   - 行内代码

2. code block base
   - 代码块结构
   - 代码块交互
   - 几何与中立外壳

3. code theme
   - .hljs 容器皮肤
   - token 颜色
   - 语言特化规则
```

三层边界如下：

### 5.2 Preview Theme 职责

预览主题只负责以下内容：

- 标题、段落、列表、链接、引用、表格、图片、脚注、任务列表、`details`
- inline code，即 `:not(pre) > code`、`tt`、`samp`
- 与正文语义直接绑定的排版样式

预览主题不再负责以下内容：

- fenced code block 的背景、颜色、padding、圆角
- fenced code block 的滚动条、选区、box-shadow
- `.pre-container` 与工具栏结构
- `.hljs` 与 `.hljs-*` 颜色体系
- `pre > code.hljs` 的几何样式

### 5.3 Code Block Base 职责

新增独立的 `code block base` 层，负责以下内容：

- `.pre-container` 的布局结构
- 语言标签与复制按钮的定位、显隐和可访问性
- `pre` / `code.hljs` 的结构性承接
- 统一圆角、外层间距与容器溢出策略
- Mermaid 外壳布局与中立承接

`code block base` 的核心原则是：

- 不定义 `.hljs` 的主题皮肤颜色
- 不定义 token 级语义色
- 只定义与代码块组件结构强相关、且不应因预览主题而变化的样式
- Mermaid 外壳只由 `code block base` 持有样式所有权，preview theme 不再声明 Mermaid 专属变量或主题特例

### 5.4 Code Theme 职责

代码主题只负责 highlight.js 语义皮肤，包括：

- `.hljs` / `code.hljs` 的背景与文字色
- `.hljs-*` token 颜色
- `font-style` / `font-weight` / `text-decoration`
- `.language-*` 特化规则
- 极少数主题的 `::selection`、局部 `background-color`、渐变背景等增强

这部分继续完全复用现有 72 个代码主题文件，不做源码修改。

## 6. DOM 契约调整

### 6.1 目标结构

普通 fenced code block 的目标 DOM 调整为：

```html
<div class="pre-container">
  <div class="pre-container-toolbar">
    <div class="pre-container-lang">javascript</div>
    <div class="pre-container-copy" role="button" tabindex="0" title="复制" aria-label="复制"></div>
  </div>
  <pre>
    <code class="hljs language-javascript">...</code>
  </pre>
</div>
```

约束如下：

- `.hljs` 从 `pre` 移到 `code`
- 显式语言场景下，输出稳定的 `language-*` class
- 自动识别场景下，若 `highlightAuto` 返回语言名，也应补充对应 `language-*` class
- `pre` 保留为纯结构容器，不再承载 highlight 主题 class

### 6.2 语言 class 与工具栏标签规则

为避免 `.language-*` 主题特化与工具栏语言显示出现歧义，本轮固定以下规则：

#### 场景 A：显式语言且被 highlight.js 识别

- 输入值取 markdown fence 的原始语言标记，先做 `trim + lowercase`
- 使用 `hljs.getLanguage(normalizedInput)` 判断是否可识别
- 生成 `language-${normalizedInput}` class
- 若能从 `hljs.listLanguages()` 解析到不同的注册主键，再额外补一个 `language-${canonicalKey}` class
- 工具栏语言标签显示用户原始 fence 语言标记，保留用户输入大小写，只做首尾空白裁剪，不显示自动推断值

示例：

- ```` ```js ```` -> `class="hljs language-js language-javascript"`，标签显示 `js`
- ```` ```sh ```` -> `class="hljs language-sh language-bash"`，标签显示 `sh`

#### 场景 B：显式语言但未被 highlight.js 识别

- 不输出基于该语言标记的 `language-*` class
- 仍沿用 `highlightAuto` 做 token 着色兜底
- 工具栏语言标签显示用户原始 fence 语言标记，保留用户输入大小写，只做首尾空白裁剪

这样可以保留作者显式声明的语言文本，同时避免给代码主题注入错误的 `.language-*` class。

#### 场景 C：未显式声明语言，但自动识别成功

- 根据 `highlightAuto` 返回的语言 key 输出单个 `language-${detectedKey}` class
- 工具栏语言标签隐藏，不展示推断结果

原因是自动识别存在误判概率，不应把猜测结果直接暴露为 UI 文案。

#### 场景 D：未显式声明语言，且自动识别失败

- 仅输出 `class="hljs"`
- 工具栏语言标签隐藏

### 6.3 调整收益

采用这套结构后：

- 现有代码主题中的 `pre code.hljs`、`code.hljs` 能重新稳定命中
- `.language-*` 特化规则也能恢复效果
- 预览主题不再需要通过 `pre:not(.hljs)` 或 `pre > code` 去兜底代码块皮肤

## 7. 样式文件组织方案

### 7.1 新增独立基础文件

建议新增：

```text
wj-markdown-editor-web/src/assets/style/code-block/
└─ code-block-base.scss
```

职责如下：

- 代码块外层容器结构
- 工具栏布局与中立表面
- 统一圆角、间距、滚动承接
- Mermaid 外壳承接

该文件不与预览主题绑定，也不与任何单个代码主题绑定。

### 7.2 导入顺序

静态样式导入顺序建议调整为：

```text
preview-theme.scss
code-block-base.scss
动态 code theme
```

原因如下：

1. 预览主题先完成正文排版。
2. `code-block-base.scss` 在静态层面兜住代码块结构。
3. 动态代码主题最后注入，覆盖 `.hljs` 与 token 皮肤。

这样可以保证：

- preview theme 不再“压住”代码块皮肤
- code block base 不需要使用高优先级去和 preview theme 打架
- code theme 继续依赖现有动态注入顺序即可

## 8. 预览主题协议调整

### 8.1 保留的预览主题能力

预览主题协议继续保留：

- inline code 变量
- `kbd`
- 标题、列表、链接、引用、表格、脚注等正文语义变量
- `details`

### 8.2 从预览主题移出的能力

以下能力从 `preview-theme-contract.scss` 与 `theme/*.scss` 中移出，不再允许由 preview theme 驱动：

- `--wj-preview-code-block-*`
- `--wj-preview-code-toolbar-*`
- Mermaid 外壳相关变量与主题特例
- 任何 fenced code block 背景、颜色、padding、圆角变量
- 任何以 `.hljs`、`pre > code`、`.pre-container` 为目标的主题特例

若基础层仍需要统一几何值，应迁移为 `code block base` 自有变量，例如：

- `--wj-code-block-radius`
- `--wj-code-block-toolbar-gap`
- `--wj-code-block-toolbar-offset`

这些变量不属于预览主题协议，也不对外暴露为主题人格的一部分。

## 9. 允许与禁止的选择器边界

### 9.1 Preview Theme 允许

- `.wj-preview-theme :where(:not(pre) > code, :not(pre) > tt, :not(pre) > samp)`
- 正文结构选择器，例如标题、段落、列表、表格、引用、图片、脚注

### 9.2 Preview Theme 禁止

预览主题基础层与具体主题文件禁止新增或保留以下类型：

- `.hljs`
- `.hljs *`
- `.hljs-*`
- `.language-* .hljs-*`
- `.pre-container`
- `.pre-container-copy`
- `.pre-container-lang`
- `pre code`
- `pre > code.hljs`
- `pre:not(.hljs)`
- `pre.mermaid`
- `pre.mermaid-cache`
- 代码块相关 `::selection`

例外说明：

- inline code 不在本禁止范围内。

### 9.3 Code Block Base 允许

- `.pre-container`
- `.pre-container-toolbar`
- `.pre-container-copy`
- `.pre-container-lang`
- `.pre-container pre`
- `.pre-container code.hljs`
- `pre.mermaid`
- `pre.mermaid-cache`

但不允许在 `code block base` 中定义：

- 具体 token 颜色
- 针对某个代码主题名称的差异样式

## 10. 需要修改的文件范围

本轮预期影响如下文件：

- `wj-markdown-editor-web/src/util/markdown-it/markdownItCodeBlock.js`
- `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-contract.scss`
- `wj-markdown-editor-web/src/assets/style/preview-theme/preview-theme-base.scss`
- `wj-markdown-editor-web/src/assets/style/preview-theme/theme/*.scss`
- `wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss`（新增）
- `wj-markdown-editor-web/src/main.js`
- `wj-markdown-editor-web/src/assets/style/__tests__/...`

其中职责重点如下：

- `markdownItCodeBlock.js`
  - 输出标准化 DOM
  - 追加 `language-*` class
  - 收敛复制按钮语义
- `preview-theme-*`
  - 删除 fenced code block 的直接皮肤能力
  - 保留 inline code 与正文排版
- `code-block-base.scss`
  - 集中承接结构与几何

## 11. 测试策略

### 11.1 DOM 契约测试

新增或更新测试，断言：

- 普通 fenced code block 输出 `code.hljs`
- 显式语言被识别时同时满足 `language-${normalizedInput}` 与可选的 `language-${canonicalKey}` 规则
- 显式语言未识别时不输出基于该输入的 `language-*` class
- 自动识别语言时，若有结果则输出单个 `language-${detectedKey}` class
- `pre` 不再携带 `hljs` class
- 工具栏语言标签在“显式语言”场景显示原始 fence 文本，在“自动识别”场景隐藏

### 11.2 预览主题边界测试

新增静态扫描测试，禁止预览主题文件出现：

- `.hljs`
- `.hljs-*`
- `.pre-container`
- `pre code`
- `pre:not(.hljs)`
- `pre.mermaid`
- `pre.mermaid-cache`
- 代码块相关 `::selection`

同时继续允许：

- inline code 选择器
- 非代码块 Markdown 结构选择器

### 11.3 Code Block Base 测试

新增静态测试，保证：

- 代码块基础层只处理结构与几何
- 不出现 `.code-theme-*` 特化
- 不出现 token 级 `.hljs-*` 语义色定义

### 11.4 回归验证

人工回归至少覆盖：

- 8 个预览主题
- 多个代码主题切换
- 编辑页、独立预览页、导出页
- 普通 fenced code block、无语言代码块、自动识别代码块、Mermaid 代码块

重点关注：

- 代码块背景是否随代码主题切换
- 预览主题切换后 fenced code block 是否保持稳定
- inline code 是否仍按预览主题变化
- 复制按钮与语言标签是否稳定可见

## 12. 风险与控制

### 12.1 风险：去掉预览主题代码块皮肤后，部分主题观感变化明显

控制方式：

- 明确接受 fenced code block 从“跟随 preview theme”改为“跟随 code theme”
- 把变化限制在代码块区域，不波及正文排版

### 12.2 风险：只改 DOM 后，少数代码主题仍表现异常

控制方式：

- 本轮先以“不改代码主题源码”为硬约束
- 若发现极少数主题依赖异常结构，再通过单独后续问题处理，不在本轮扩大范围

### 12.3 风险：工具栏与代码块背景割裂

控制方式：

- 工具栏表面由 `code block base` 统一提供中立样式
- 不把工具栏皮肤混回 preview theme
- 不强行要求 72 个代码主题都感知工具栏颜色

### 12.4 风险：Mermaid 被误当作 highlight.js 代码块处理

控制方式：

- Mermaid 明确归入 `code block base` 的特殊结构承接
- 不让 preview theme 再对 Mermaid 写变量或主题特例
- 不让 code theme 直接承担 Mermaid 外壳样式

## 13. 实施顺序

建议按以下顺序执行：

1. 新增 `code-block-base.scss`，先定义结构层职责。
2. 调整 `markdownItCodeBlock.js` 输出为 `code.hljs` + `language-*`。
3. 调整 `main.js` 导入顺序，接入 `code-block-base.scss`。
4. 从 `preview-theme-contract.scss` 中移出 fenced code block 变量。
5. 从 `preview-theme-base.scss` 中移出 fenced code block 结构规则，仅保留 inline code。
6. 清理 8 个预览主题文件中的代码块直接覆盖。
7. 新增静态边界测试和 DOM 契约测试。
8. 做多主题回归验证。

## 14. 完成标准

当满足以下条件时，本轮设计目标视为达成：

- 普通 fenced code block 输出为标准 highlight.js 结构。
- `language-*` class 与工具栏语言标签的四种场景规则已固定并可测试。
- 不修改任何现有代码主题源码。
- preview theme 不再直接控制 fenced code block 皮肤。
- `code block base` 成为代码块结构与几何的唯一静态承接层。
- code theme 能重新稳定接管 `.hljs` 与 token 颜色。
- inline code 仍然由 preview theme 控制。
- 预览主题与代码主题切换后，职责边界稳定且行为一致。
- 自动化测试能够阻止 preview theme 再次越界到 fenced code block 皮肤层。
