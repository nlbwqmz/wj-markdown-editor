# 代码块滚动条按代码主题背景自适配设计

## 1. 背景与目标

当前项目的滚动条样式主要由全局样式 [wj-markdown-editor-web/src/assets/style/scroll.scss](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/assets/style/scroll.scss) 控制。该方案适用于大多数页面滚动容器，但预览区 fenced code block 的 `pre` 滚动层在部分代码主题下会出现滑块与代码块背景对比不足的问题。

项目中已经存在“根据代码块背景颜色派生语言标记与复制按钮视觉变量”的成熟链路：

- 运行时采样入口位于 [wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue)
- 颜色派生工具位于 [wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js)
- 代码块结构层样式位于 [wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss)

本次需求目标如下：

- 仅优化预览区 fenced code block 的滚动条滑块颜色
- 根据当前代码主题实际生效后的代码块背景色自适配滚动条颜色
- 不调整全局 `.wj-scrollbar`
- 不调整编辑器 `CodeMirror` 滚动条
- 不显示代码块滚动条轨道，只保留滑块视觉
- 尽量复用现有代码块背景采样与变量派生机制，避免新增第二套主题探测路径

## 2. 范围与非目标

### 2.1 本次范围

- 预览区 `.wj-preview-theme` 内普通 fenced code block 的 `pre` 滚动层
- 运行时从 `.hljs` 计算样式派生代码块滚动条变量
- 结构层 SCSS 对代码块滚动条做局部覆盖
- 对应单元测试与样式结构测试补齐

### 2.2 非目标

- 不修改全局共享滚动条规则 [wj-markdown-editor-web/src/assets/style/scroll.scss](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/assets/style/scroll.scss)
- 不修改 `CodeMirror` 编辑器滚动条
- 不修改预览页外层 `.wj-scrollbar` 容器
- 不为所有 Markdown 元素引入新的滚动条主题系统
- 不调整 Mermaid 代码块的独立视觉策略，除非其结构天然复用相同 `pre` 规则

## 3. 现状分析

### 3.1 当前滚动条链路

[wj-markdown-editor-web/src/assets/style/scroll.scss](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/assets/style/scroll.scss) 通过共享 `:where(...)` 规则统一覆盖：

- `.wj-scrollbar`
- `.cm-editor .cm-scroller`
- `.cm-tooltip-autocomplete > ul`

它定义了全局滚动条变量与 `::-webkit-scrollbar*` 规则，其中 hover 时会显示轨道背景。该规则适合通用内容区，不适合代码块这种自身背景色随代码主题变化的局部场景。

### 3.2 当前代码块主题适配链路

[wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js) 已提供以下能力：

- 解析 `.hljs` 的前景色、背景色
- 根据背景明暗决定浅色或深色叠加基色
- 派生语言标记与复制按钮使用的结构层变量
- 在预览刷新和代码主题切换后，把变量写回 `previewShellRef`

[wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue) 已在以下时机同步变量：

- `props.codeTheme` 变化后
- 预览刷新完成后
- 首次挂载后

这说明代码主题切换、预览 DOM 更新、fallback 处理都已有稳定入口，可直接复用。

## 4. 方案选择

已确认采用“扩展现有运行时派生链路”的方案，不采用全局滚动条规则扩展或内联样式方案。

### 4.1 采用方案

在 [wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/util/codeBlockActionStyleUtil.js) 中扩展变量派生范围，在现有 action 变量之外，新增代码块滚动条滑块变量；再由 [wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss) 仅对 `.wj-preview-theme :where(.pre-container pre)` 应用局部 `::-webkit-scrollbar*` 样式。

### 4.2 选择理由

- 与现有语言标记/复制按钮的主题适配链路完全一致，避免重复实现
- 颜色采样来源统一为 `.hljs` 的实际计算样式，更接近真实视觉结果
- 作用域严格收敛在代码块结构层，不会污染全局滚动条系统
- 代码主题切换和预览刷新可直接复用现有同步时机，无需新增生命周期复杂度

## 5. 详细设计

### 5.1 变量设计

在现有 `--wj-code-block-action-*` 变量之外，新增代码块滚动条变量：

- `--wj-code-block-scrollbar-thumb-bg`
- `--wj-code-block-scrollbar-thumb-bg-hover`
- `--wj-code-block-scrollbar-thumb-bg-active`

变量写入位置保持不变，仍写入预览壳节点 `previewShellRef.style`。这样代码块结构层样式可以继续只消费变量，而不直接参与运行时颜色计算。

### 5.2 颜色派生策略

颜色派生规则与现有 action 变量保持同一设计原则：

1. 优先读取 `.hljs` 的 `backgroundColor`
2. 若背景色不可解析，或透明度过低，则回退到安全默认值
3. 基于背景相对亮度判断当前代码主题属于深背景还是浅背景
4. 深背景使用浅色滑块，浅背景使用深色滑块
5. hover 与 active 在默认态基础上增强对比，但不引入轨道底色

具体约束：

- 默认态应保持足够可见，但不能压过代码内容
- hover 和 active 只增强滑块本身，不显示轨道
- 变量仍采用 `rgba(...)` 文本输出，以便与现有 util 保持一致

### 5.3 样式作用域

滚动条覆盖只允许出现在 [wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/assets/style/code-block/code-block-base.scss) 的 `.wj-preview-theme` 作用域内，并限定到 `.pre-container pre`：

- `::-webkit-scrollbar`
- `::-webkit-scrollbar-track`
- `::-webkit-scrollbar-corner`
- `::-webkit-scrollbar-thumb`
- `::-webkit-scrollbar-thumb:hover`
- `::-webkit-scrollbar-thumb:active`

样式约束：

- `track` 必须透明
- `corner` 必须透明
- 不通过 `::-webkit-scrollbar:hover` 显示轨道
- 只消费 `--wj-code-block-scrollbar-*` 变量，不改写全局 `--wj-scrollbar-*`

### 5.4 生命周期与数据流

数据流保持现有单向链路：

1. `MarkdownPreview` 完成渲染或代码主题切换
2. `syncCodeBlockActionVariables(previewShellRef.value)` 被调用
3. util 从 `.hljs` 读取计算样式
4. util 同时派生 action 变量和 scrollbar 变量
5. util 把变量写回 `previewShellRef.style`
6. `code-block-base.scss` 消费新变量渲染代码块滚动条滑块

该链路不新增 IPC、不新增 store 字段、不新增组件 props。

## 6. 错误处理与回退策略

为避免主题加载异常或 DOM 尚未稳定时滚动条不可见，需要保留安全回退：

- 找不到 `.hljs` 节点时，仍写入默认滚动条变量
- `.hljs` 背景色解析失败时，仍写入默认滚动条变量
- 背景色透明度接近零时，视为不可用背景并回退
- util 内部若读取计算样式失败，不抛出异常到组件层，保持现有“吞错并回退”的处理方式

## 7. 测试设计

### 7.1 util 行为测试

在 [wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/util/__tests__/codeBlockActionStyleUtil.test.js) 中新增或扩展测试，覆盖：

- 合法深色背景下能派生 `--wj-code-block-scrollbar-*` 变量
- 合法浅色背景下能派生 `--wj-code-block-scrollbar-*` 变量
- 深浅背景下滑块颜色应不同
- 背景透明或解析失败时，滚动条变量回退到默认值
- `syncCodeBlockActionVariables()` 在重复调用时，滚动条变量也会被最新样式覆盖

### 7.2 样式结构测试

在 [wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js](/D:/code/wj-markdown-editor/wj-markdown-editor-web/src/assets/style/__tests__/codeBlockThemeBoundary.test.js) 中补充结构约束，覆盖：

- `code-block-base.scss` 必须在 `.wj-preview-theme` 下对 `.pre-container pre` 定义局部滚动条规则
- `track` 和 `corner` 默认必须透明
- `thumb` 必须消费 `--wj-code-block-scrollbar-*` 变量
- 不得在 `code-block-base.scss` 中引入全局 `.wj-scrollbar` 选择器
- 不得通过 `::-webkit-scrollbar:hover` 为代码块显示轨道

### 7.3 回归关注点

- 代码主题切换后，语言标记与复制按钮原有适配不能退化
- 代码块复制按钮 hover/focus 行为不能被滚动条样式影响
- 普通页面滚动条、设置页、文件管理区、编辑器滚动条不应受影响

## 8. 实施步骤

1. 先在 util 测试中补充失败用例，覆盖新增滚动条变量和回退逻辑
2. 再补样式结构测试，约束代码块滚动条的作用域与变量消费方式
3. 实现 util 变量派生与默认值扩展
4. 实现 `code-block-base.scss` 的代码块局部滚动条规则
5. 对修改文件执行包内 ESLint 格式化
6. 执行相关测试，确认红绿过程与最终结果

## 9. 风险与控制

### 9.1 风险

- 某些代码主题背景色过于中性，简单深浅判断可能导致 hover 态对比仍偏弱
- WebKit 滚动条伪元素规则若写到错误作用域，可能误伤非代码块容器
- 新增变量若与现有 action 变量回写逻辑耦合不当，可能影响原有按钮视觉

### 9.2 控制措施

- 使用与现有 action 变量一致的亮度判断和混色策略，降低主题边界偏差
- 用结构测试锁定 `.wj-preview-theme :where(.pre-container pre)` 作用域
- 保持 action 变量和 scrollbar 变量的职责分离，仅共享颜色采样输入
- 通过重复同步测试确认新旧变量都能被正确覆盖

## 10. 验收标准

满足以下条件即可视为完成：

- 预览区 fenced code block 滚动条滑块颜色会随代码主题背景变化
- 深色与浅色代码主题下，滑块均具备清晰可见的对比
- 代码块滚动条不显示轨道，只显示滑块
- 全局 `.wj-scrollbar` 和 `CodeMirror` 滚动条视觉无变化
- 原有语言标记与复制按钮的背景自适配行为保持正常
- 新增测试通过，且相关结构测试能够锁定这次行为边界
