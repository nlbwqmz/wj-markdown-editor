# CodeMirror 6.41.0 输入法稳定性修复设计

**背景**

当前编辑页存在两类相关问题：

1. CodeMirror 依赖矩阵长期处于“顶层固定旧版 `@codemirror/view` + 其他扩展包走传递依赖”的混搭状态，导致 `@codemirror/search`、`@codemirror/commands`、`@codemirror/language` 可能解析到不同版本语义下的 `view`。
2. 编辑页是受控组件，外层 `props.modelValue` 会在运行期通过 `view.dispatch(...)` 回放到编辑器。在中文输入法组合输入期间，这类外部回写会和 CodeMirror 的 DOM 观察、组合输入同步、滚动恢复和搜索选区更新发生竞争，最终触发 `Invalid child in posBefore`。

**目标**

把编辑器相关依赖统一到以 `@codemirror/view@6.41.0` 为核心的一组兼容版本，并把编辑页的组合输入同步策略改造成“组合输入期间冻结外部文档回放，组合结束后按稳定时机冲刷”，确保：

- 中文输入不再触发 `Invalid child in posBefore`
- 搜索、滚动、工具栏、预览联动等既有功能不回退
- `package.json` 与源码直接使用的 CodeMirror 依赖保持一致

---

## 需求与约束

### 功能要求

- 升级 `@codemirror/view` 到 `6.41.0`
- 与 `view` 直接配合的 CodeMirror 包全部显式声明，并保证依赖范围兼容
- 编辑器在中文输入法开始、候选、上屏、结束期间不崩溃
- 搜索条、替换、滚动定位、工具栏命令、预览联动保持可用

### 非功能要求

- 不使用 worktree
- 在新分支上开发
- 方案和计划落库后做自动评审
- 开发前必须基于官方文档和官方讨论验证关键假设

---

## 现状分析

### 当前仓库直接使用的 CodeMirror 包

源码直接 import 了：

- `@codemirror/autocomplete`
- `@codemirror/commands`
- `@codemirror/lang-markdown`
- `@codemirror/language`
- `@codemirror/language-data`
- `@codemirror/search`
- `@codemirror/state`
- `@codemirror/theme-one-dark`
- `@codemirror/view`

其中关键入口包括：

- `wj-markdown-editor-web/src/components/editor/composables/useEditorCore.js`
- `wj-markdown-editor-web/src/components/editor/EditorSearchBar.vue`
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- `wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js`
- `wj-markdown-editor-web/src/util/editor/editorUtil.js`
- `wj-markdown-editor-web/src/util/editor/keymap/keymapUtil.js`

说明：

- 当前仓库还存在 `@ant-design/icons-vue` 等非 CodeMirror 直接依赖未显式声明的问题，但这不属于本次“CodeMirror 输入法稳定性修复”的主目标。
- 本次设计只把“显式声明直接依赖”的约束收口到 CodeMirror 相关包，避免范围无控制扩张。

### 当前最危险的同步链路

1. `useEditorCore` 用 DOM `compositionstart/compositionend` 维护 `isComposing`
2. `MarkdownEdit` 在 `watch(props.modelValue)` 中直接 `view.dispatch({ changes })`
3. 组合输入期间如果父层快照、自动保存、滞后 echo、选择恢复等触发外部回放，会在 CodeMirror DOM 尚未稳定时改动文档状态

这条链路与报错栈中出现的 `DOMObserver.readMutation -> posBefore` 对应。

---

## 参考资料与结论

### 官方资料

- CodeMirror Reference: https://codemirror.net/docs/ref/
- CodeMirror Changelog: https://codemirror.net/docs/changelog/
- CodeMirror 官方讨论，关于固定版本导致功能性故障：
  - https://discuss.codemirror.net/t/fixed-version-numbers-lead-to-functional-failures-one-dark-language-autocompletion/5930
- CodeMirror 官方讨论，关于 EditContext：
  - https://discuss.codemirror.net/t/experimental-support-for-editcontext/8144
- CodeMirror 官方讨论，关于组合输入结束时不要自行追加事务：
  - https://discuss.codemirror.net/t/dispatching-compsitionend-transaction/8955
- CodeMirror 官方讨论，关于 IME 监听建议：
  - https://discuss.codemirror.net/t/how-to-listen-to-changes-with-ime-support/5737

### 基于资料的设计结论

1. 不能继续保留 `codemirror` 聚合包与分散的 `@codemirror/*` 混用。
2. 不能只升级 `@codemirror/view`，必须同步校准和它直接耦合的包。
3. 不能只依赖原生 `compositionstart/compositionend` 判定输入状态，必须同时参考 CodeMirror 自身的 `view.composing` / `view.compositionStarted`。
4. 受控组件在组合输入期间不能把外层文档回写到编辑器内部状态。

---

## 备选方案

### 方案一：仅升级 `@codemirror/view`

**做法**

- 把 `@codemirror/view` 升到 `6.41.0`
- 维持其余包和现有同步逻辑不变

**问题**

- 依赖矩阵仍然可能分叉
- 组合输入期间的外部回放问题完全没有解决
- 很可能把“旧版本未暴露的问题”变成“更稳定地暴露”

**结论**

拒绝。

### 方案二：回退到更老的整组版本

**做法**

- 保持 `view 6.27.0`
- 回退 `search/commands/language/...` 到与之更接近的一组旧版本

**问题**

- 放弃现代版本的 composition / EditContext 修复
- 无法解决源码直接依赖未显式声明的问题
- 仍然保留受控回写和组合输入相互竞争

**结论**

只适合临时止血，不适合作为主线方案。

### 方案三：统一升级到现代兼容矩阵，并重构组合输入同步

**做法**

- 删除 `codemirror`
- 显式声明所有直接使用的 CodeMirror 包
- 以 `@codemirror/view@6.41.0` 为核心统一依赖矩阵
- 重构组合输入状态判断与外部回放时机

**优点**

- 依赖图稳定，行为更可预期
- 与官方建议一致
- 能同时解决版本分叉和输入法竞争条件

**结论**

采用。

---

## 最终设计

### 1. 依赖矩阵

采用以下显式依赖矩阵：

- `@codemirror/view: 6.41.0`
- `@codemirror/state: 6.6.0`
- `@codemirror/commands: 6.10.3`
- `@codemirror/language: 6.12.3`
- `@codemirror/autocomplete: 6.20.1`
- `@codemirror/search: 6.6.0`
- `@codemirror/lang-markdown: 保持当前主线兼容版本`
- `@codemirror/language-data: 保持当前主线兼容版本`
- `@codemirror/theme-one-dark: 保持当前主线兼容版本`

并彻底移除：

- `codemirror`

### 2. 编辑器组合输入状态模型

`useEditorCore` 不再把原生 DOM composition 事件当作唯一真相，而是形成“CodeMirror 状态优先，DOM 事件兜底”的模型：

- 活跃组合输入：`view.composing === true`
- 组合输入启动窗口：`view.compositionStarted === true`
- DOM `compositionstart/compositionend` 只用于补充更新本地标记，不能单独决定什么时候冲刷业务同步

### 3. 外部文档回放策略

`MarkdownEdit` 中的 `watch(props.modelValue)` 改为两段式：

- 若当前处于组合输入窗口，且本次更新会改动正文，或会修改 selection / `scrollIntoView`，则缓存为“待回放更新”，不立即 `dispatch`
- 当组合输入真正结束，并确认 `view.composing` / `view.compositionStarted` 均已退出后，再按最新快照回放

必须保证：

- 同一时刻只有一份待回放外部更新
- 只保留最新快照，避免回放陈旧内容
- 选择恢复、聚焦和滚动参数与正文回放一起处理
- 冲刷挂起更新前，重新基于当前文档状态执行一次 stale 判定，避免把旧快照重新覆盖到编辑器中

### 4. 组合输入结束后的冲刷时机

不在原生 `compositionend` 回调中直接执行复杂同步，而是：

- 标记“允许冲刷”
- 在后续稳定时机执行，且采用双通道兜底：
  - `queueMicrotask` 或下一帧检查一次
  - `updateListener` 再做一次兜底
  - 更新向父层的模型同步
  - 回放挂起的外部快照

这样能避免在 DOM 尚未稳定时再次触发 CodeMirror 内部 mutation 读取。

### 5. 搜索扩展兼容性

`editorExtensionUtil.js` 中 `search({ scrollToMatch })` 的自定义回调按官方签名整理，确保升级后与 `@codemirror/search`、`@codemirror/view` 的行为一致。

### 6. 自动验证防线

新增两类测试：

1. 依赖拓扑测试
   - 确保 `package.json` 显式声明全部直接依赖
   - 确保根项目只解析到单一 `@codemirror/view`

2. 组合输入同步测试
   - 组合输入期间外部回放应被延迟
   - 组合输入结束后只回放最新快照
   - 搜索、选择恢复、滚动定位不受影响

---

## 涉及文件

### 必改

- `wj-markdown-editor-web/package.json`
- `wj-markdown-editor-web/package-lock.json`
- `wj-markdown-editor-web/src/components/editor/composables/useEditorCore.js`
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- `wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js`
- `wj-markdown-editor-web/src/util/editor/contentUpdateMetaUtil.js`

### 建议新增

- `wj-markdown-editor-web/src/util/editor/compositionStateUtil.js`
- `wj-markdown-editor-web/src/util/editor/__tests__/compositionStateUtil.test.js`

### 必补测试

- `wj-markdown-editor-web/src/util/editor/__tests__/codemirrorDependencyTopology.test.js`
- `wj-markdown-editor-web/src/components/editor/__tests__/...` 中新增或扩展组合输入外部回放测试

---

## 风险与缓解

### 风险一：升级后搜索或滚动定位行为变化

**缓解**

- 保留现有自定义 `scrollToMatch`
- 单独补搜索条回归测试

### 风险二：组合输入结束后冲刷时机过晚，导致父层模型更新滞后

**缓解**

- 保持现有 `scheduleModelSync` 语义
- 只把“危险窗口期”改为挂起
- 组合结束后立即冲刷最新内容

### 风险三：外部回放与选择恢复逻辑交织

**缓解**

- 统一把正文、selection、focus、scrollIntoView 作为一个待回放对象管理
- 用单测覆盖“正文变化”和“仅 selection 变化”两类路径

---

## 成功判定

- `npm ls` 显示根项目只解析到单一 `@codemirror/view`
- 中文输入法在问题文档末尾区域连续输入，不再出现 `Invalid child in posBefore`
- 搜索条、替换、工具栏、预览联动、滚动恢复全部通过回归验证
- Web 包测试与构建通过

---

## 设计自审

- 无 TBD / TODO / 待定占位
- 依赖升级、输入同步、测试和验证四个维度均有覆盖
- 方案聚焦于单一子系统：CodeMirror 编辑器稳定性修复
- 与用户约束一致：不使用 worktree，基于新分支开发，先文档和评审，再实施
