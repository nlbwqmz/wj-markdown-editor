# 预览区 `#` 链接平滑滚动设计

## 背景

当前 Markdown 预览区已经支持多类点击行为：

- 图片点击后打开图片预览
- 本地资源链接点击后走现有资源打开逻辑
- 脚注链接点击后使用 `scrollIntoView({ behavior: 'smooth' })` 在页面内跳转

但普通 Markdown 链接如果写成 `[#标题](#title)` 这类以 `#` 开头的锚点时，还没有一套明确且受控的预览区内跳转行为。浏览器默认 hash 导航会把 hash 写入 URL，并且滚动目标由浏览器自行决定，不符合本次需求。

用户要求新增以下行为：

- 仅在预览区内处理普通 `#` 锚点链接
- 点击后让预览区滚动条平滑滚动到目标锚点
- 不把 hash 写入 URL
- 不影响现有脚注跳转
- 不影响现有 `http/https` 链接打开方式

## 目标

- 在预览区点击普通 `href="#..."` 链接时，阻止浏览器默认 hash 导航
- 使用 JavaScript 对预览滚动容器执行平滑滚动
- 普通锚点定位语义固定为“目标元素顶部对齐到预览区顶部”
- 只在当前预览内容范围内查找目标元素，不依赖全局页面滚动
- 保持脚注、图片、本地资源链接、`http/https` 链接的现有行为不变

## 非目标

- 不修改 Markdown 标题锚点的生成策略
- 不修改脚注点击时当前的滚动语义
- 不修改浏览器外链打开方式
- 不新增路由或 URL hash 同步逻辑
- 不把该能力扩展到编辑区、目录面板或应用其他页面的非预览区域

## 关键约束

### 1. 脚注行为保持原样

脚注链接当前已经有单独分支处理，且滚动语义与普通锚点不同。  
本次改动必须保证脚注链接仍优先命中既有逻辑，不能被新的普通锚点分支截走。

### 2. 外链行为保持原样

当前普通 `http/https` 链接已有稳定的打开方式。  
本次只允许拦截以 `#` 开头的普通锚点链接，不得改变其他链接的默认行为或现有代理逻辑。

### 3. 不依赖 `scrollIntoView` 控制容器

虽然 `scrollIntoView({ block: 'start' })` 看起来可以完成“顶部对齐”，但它依赖浏览器自行决定滚动哪些祖先容器。  
本次需求强调的是“预览区滚动条滚到锚点位置”，因此需要显式计算目标 `top`，再对预览滚动容器调用 `scrollTo({ top, behavior: 'smooth' })`。

### 4. 只在当前预览根节点内部查找锚点

目标元素的定位不能继续依赖 `document.getElementById()` 这类全局查找方式。  
否则在编辑页、引导页、设置页等多个区域同时存在相同 id 时，可能命中错误节点。

## 核心设计

### 1. 保持点击事件委托入口不变

本次仍在 `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue` 的点击事件委托里处理预览区点击。  
不改动 `markdown-it` 渲染层，不新增自定义协议，不把普通锚点改写成新的 HTML 结构。

这样做的原因是：

- 现有图片、本地资源链接、脚注点击已经都在同一个入口做分流
- 本次需求本质上是“点击行为变化”，不是“渲染语义变化”
- 保持渲染层不动，可以把回归风险收敛到预览组件本身

### 2. 点击分流顺序固定

`handlePreviewClick()` 内部的优先级固定为：

1. 图片点击
2. 本地资源链接点击
3. 脚注链接点击
4. 普通 `#` 锚点点击
5. 其他链接或元素，保持原样

其中第 3 步和第 4 步的顺序不能互换。  
只有这样才能保证脚注链接继续走原有逻辑，而不是被通用锚点分支拦截。

### 3. 普通锚点只拦截 `href` 以 `#` 开头的链接

普通锚点分支的拦截条件为：

- 点击目标或其祖先节点命中 `<a>`
- `href` 是非空字符串
- `href.startsWith('#') === true`
- `href` 不是空锚点 `#`
- 当前链接不属于脚注分支
- 当前链接不属于本地资源链接分支

命中后执行：

1. `event.preventDefault()`
2. 从 `href.slice(1)` 取出目标 id
3. 在当前预览根节点内部查找对应元素
4. 计算目标元素相对滚动容器内容顶部的距离
5. 调用滚动容器 `scrollTo({ top, behavior: 'smooth' })`

### 4. 显式把滚动容器传入 `MarkdownPreview.vue`

`MarkdownPreview.vue` 当前内部的 `previewRef` 指向的是实际渲染 Markdown HTML 的根节点，但在编辑页中，真正带滚动条的是外层的 `previewRef` 容器，位于 `MarkdownEdit.vue`。

因此本次需要给 `MarkdownPreview.vue` 新增一个可选属性，例如：

```js
previewScrollContainer: {
  type: Function,
  default: () => null,
}
```

语义为：

- 父组件传入时，由父组件明确指定“应该滚动哪一个容器”
- 父组件未传入时，组件内部安全降级到自身 `previewRef`

这样可以覆盖两类场景：

- 编辑页：由 `MarkdownEdit.vue` 传入外层预览滚动容器
- 非编辑页：由组件内部使用自身容器或调用方传入各自的滚动容器

### 5. 使用显式几何计算得到目标 `top`

普通锚点跳转的目标计算统一使用以下坐标语义：

```js
targetTop = targetRect.top - containerRect.top - container.clientTop + container.scrollTop
```

然后执行：

```js
container.scrollTo({
  top: targetTop,
  behavior: 'smooth',
})
```

这样有几个好处：

- 只滚动预览区，不影响外层布局或窗口滚动
- 顶部对齐语义明确，不依赖浏览器对 `scrollIntoView()` 的祖先选择策略
- 与项目内现有预览滚动计算方式保持一致，降低后续维护成本

### 6. 锚点查找限定在当前预览内容内部

锚点元素查找逻辑不使用全局 `document.getElementById()`。  
建议改为：

1. 优先用 `previewRef.value.querySelector(`#${CSS.escape(targetId)}`)` 查找
2. 若运行环境不支持 `CSS.escape`，则使用保守兜底逻辑，仅在 id 简单可用时再拼接选择器
3. 也可直接遍历 `previewRef.value.querySelectorAll('[id]')` 比对 `element.id`

本次以稳定性优先，允许实现选择更保守但更易测试的方案。  
关键要求只有一个：查找范围必须限定在当前预览根节点内部。

## 组件改动方案

### 1. `MarkdownPreview.vue`

职责变化：

- 新增普通锚点点击处理分支
- 新增“解析预览滚动容器”的辅助方法
- 新增“在预览根节点内查找锚点目标”的辅助方法
- 新增“计算目标 `top` 并平滑滚动”的辅助方法

要求：

- 保持原有 `refreshComplete`、`anchorChange`、`assetContextmenu`、`assetOpen` 事件不变
- 保持脚注逻辑不变
- 普通锚点找不到目标时静默返回，不报错、不提示

### 2. `MarkdownEdit.vue`

职责变化：

- 在使用 `MarkdownPreview` 时，显式把当前编辑页右侧的预览滚动容器传给子组件

要求：

- 不改动当前编辑区与预览区滚动同步逻辑
- 不改动现有工具栏、目录面板、搜索条或高亮联动行为
- 该改动仅用于告诉子组件“滚动容器是谁”

### 3. 其他页面调用点

需要检查 `GuideView.vue`、`ExportView.vue` 以及其他直接使用 `MarkdownPreview` 的页面，确保新增属性是可选的，不传也不会破坏现有行为。  
如果某个页面本身也有外层滚动容器，并且希望普通锚点滚动外层容器，则可以按编辑页同样的方式传入。

## 测试策略

### 1. 单元测试优先覆盖点击分流

本次优先补充 web 端单元测试，测试目标集中在点击逻辑，不做整页端到端场景。

建议新增测试覆盖：

- 点击普通 `#` 链接时，会阻止默认行为并对指定滚动容器调用 `scrollTo({ top, behavior: 'smooth' })`
- 普通 `#` 链接找不到目标元素时，不调用 `scrollTo`
- 脚注链接点击时仍走原有脚注逻辑，不落入普通锚点分支
- `http/https` 链接点击时，不被新的普通锚点逻辑拦截
- 未传 `previewScrollContainer` 时，组件可安全降级

### 2. 手工验证场景

至少验证以下场景：

- 编辑页预览区点击目录式锚点链接，预览区平滑滚动到对应标题顶部
- 点击脚注引用和脚注返回链接，行为与改动前一致
- 点击 `http/https` 链接，仍按当前方式打开
- 点击本地资源链接，仍按当前资源打开逻辑执行
- 点击图片，仍打开图片预览
- 连续点击多个不同锚点时，滚动目标始终落在预览区，不改 URL

## 回归风险与控制

### 1. 脚注被通用锚点分支误拦截

风险来源：把普通 `a[href^="#"]` 分支写在脚注判断前。  
控制方式：测试中明确覆盖脚注优先级，并在实现中先判断脚注再处理普通锚点。

### 2. 锚点滚动到了错误容器

风险来源：直接使用 `scrollIntoView()` 或错误地回退到全局页面滚动。  
控制方式：父组件显式传入滚动容器，并对滚动目标调用容器级 `scrollTo()`。

### 3. 外链行为被破坏

风险来源：通用链接分支写得过宽，把 `http/https` 也一并拦截。  
控制方式：普通锚点分支仅匹配 `href.startsWith('#')`。

### 4. 相同 id 的全局元素误命中

风险来源：仍使用 `document.getElementById()`。  
控制方式：把查找范围限定在当前预览根节点内。

## 影响范围

预计修改文件：

- `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`

预计新增测试文件：

- `wj-markdown-editor-web/src/components/editor/__tests__/MarkdownPreview.anchor-link.test.js`

如果测试最终更适合落在工具函数或 composable，也允许在实现阶段微调测试文件位置，但测试目标和覆盖边界不变。

## 最终结论

本次功能以最小改动落在 `MarkdownPreview.vue` 的点击事件委托层完成：

- 保留现有图片、本地资源、脚注和外链行为
- 仅新增普通 `#` 锚点点击的受控拦截
- 通过父组件显式提供滚动容器，确保真正滚动的是预览区
- 通过显式计算 `top` 再 `scrollTo({ behavior: 'smooth' })`，保证“顶部对齐且不改 URL”的行为稳定可控

这样可以在不改 Markdown 渲染语义、不改现有链接体系的前提下，为预览区补上符合预期的锚点平滑滚动能力。
