# 预览布局索引第一阶段设计

## 背景

当前编辑页与纯预览页的同步滚动、跳转到当前行、联动高亮，都需要根据预览区内带 `data-line-start` / `data-line-end` 的节点反查目标元素。现有实现主要问题不在算法语义，而在于高频路径重复执行以下操作：

- 在滚动、光标移动、激活恢复等高频事件中反复 `querySelectorAll('[data-line-start]')`
- 对候选节点重复做范围过滤、层级比较与排序
- 在多个模块里维护接近但不完全相同的查找逻辑

这些逻辑集中在以下模块：

- `wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js`
- `wj-markdown-editor-web/src/components/editor/composables/useAssociationHighlight.js`
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- `wj-markdown-editor-web/src/views/PreviewView.vue`

## 目标

第一阶段只解决“高频路径重复扫描预览结构 DOM”的问题：

- 引入一份基于当前预览 DOM 构建的结构索引 `previewLayoutIndex`
- 在预览刷新完成后低频重建索引
- 在同步滚动与联动高亮的热路径中优先读取索引，不再反复全量扫描结构节点
- 保留现有滚动定位与高亮的业务语义
- 保留旧逻辑作为回退路径，保证第一阶段不因为索引缺失或命中失败而破坏已有行为

## 非目标

第一阶段明确不处理以下事项：

- 不改 `MarkdownPreview.vue` 的整文 `markdown-it -> updateDOM -> refreshComplete` 渲染链路
- 不做块级增量渲染
- 不长期缓存节点 `top` / `height`
- 不改资源删除、资源打开、图片预览、大纲扫描、预览搜索的现有业务语义
- 不引入 worktree，直接在当前分支开发

## 非回归要求

第一阶段虽然只改同步滚动与联动高亮的消费层，但必须明确保证以下功能不受影响：

- 预览区资源右键菜单打开、在资源所在目录中打开
- 资源删除时的“删除当前引用 / 删除全部引用 / 统计相同引用数”语义
- 预览搜索的打开、关闭、标记清理与滚动到命中结果
- 预览区图片点击预览与图片索引顺序
- 目录大纲生成与页内锚点跳转

实现阶段必须遵守两条规则：

1. 第一阶段不得修改上述功能对应的业务实现文件
2. 第一阶段必须在验证阶段执行针对上述功能的非回归检查

## 执行约束

- 直接在当前分支开发，不新建 worktree
- 允许使用 subagent 协助拆分实现或文档评审
- subagent 仅负责明确边界内的独立任务，不得改动未纳入本设计的逻辑
- 所有新增文档、注释与计划统一使用中文

## 现状约束

### 保留的查找语义

索引化后必须保持现有查找语义不变：

- 按行查找时，优先找到“覆盖当前行”的预览节点
- 若当前行没有对应节点，则向后寻找下一条可映射行
- 多个候选节点同时命中时，优先选择覆盖范围更小的节点
- 若覆盖范围相同，则优先选择 DOM 层级更深的节点

### 保留的几何语义

第一阶段仅缓存“找谁”，不缓存“有多高”：

- 命中目标节点后，仍然通过当前真实 DOM 读取 `getBoundingClientRect()` 与容器滚动值
- 同步滚动最终滚动到哪里，仍由当前真实布局决定
- 因此图片加载、Mermaid settle、字体变化、容器宽度变化导致的高度变化，不会因为本阶段引入索引而天然变得更不准确

## 方案概述

新增独立结构索引模块：

- `wj-markdown-editor-web/src/util/editor/previewLayoutIndexUtil.js`

该模块只负责两类事情：

1. 扫描当前预览根节点下所有带 `data-line-start` 的节点，建立稳定索引
2. 提供统一的结构查找接口，供同步滚动与联动高亮复用

### 统一返回契约

为避免同步滚动与联动高亮各自实现一套索引命中语义，`previewLayoutIndexUtil.js` 必须定义稳定的查找返回契约。但第一阶段不强行让“按行查找”和“按滚动位置查找”共用完全相同的返回结构。

按行查找 `findPreviewElementByLine(...)` 的返回结构为：

- `entry`：命中的索引条目；未命中时为 `null`
- `found`：是否命中当前请求语义对应的首选节点
- `matchedLineNumber`：本次实际命中的行号
- `source`：`index` 或 `legacy-dom`

其中 `found` 的语义保持与现有同步滚动逻辑一致：

- `true`：命中了当前请求行对应的节点
- `false`：当前请求行没有节点，向后找到最近可映射行

按滚动位置查找 `findPreviewElementAtScrollTop(...)` 的返回结构为：

- `entry`：命中的索引条目；未命中时为 `null`
- `index`：当前命中的条目索引；未命中时为 `-1`
- `source`：`index` 或 `legacy-dom`

其中 `entry` 无论来自索引还是旧 DOM 回退，都必须归一化成同一结构：

- `element`
- `lineStart`
- `lineEnd`
- `depth`
- `span`
- `order`

只有完全未命中时，`entry` 才允许为 `null`。消费方不应因为 `source` 不同而再分叉处理 `entry` 结构。

`findPreviewElementAtScrollTop(...)` 的选取规则第一阶段必须与现有预览滚动回写语义保持一致：

- 以预览容器当前真实坐标为准
- 在所有有效结构节点中，选择“DOM 顺序中最后一个 `top <= scrollTop` 的节点”
- 若多个嵌套节点具有相同或几乎相同的 `top`，仍按现有结构遍历语义取最后一个满足条件的节点
- 该规则必须通过表格、容器、嵌套块场景的测试锁定，避免第一阶段因为 tie-break 变化产生回归

第一阶段必须将“索引优先 + 旧逻辑回退”收口成共享 helper，而不是让 `usePreviewSync` 与 `useAssociationHighlight` 各自复制一套回退逻辑。第一阶段建议统一提供以下 helper：

- `findPreviewElementByLine(...)`
- `findPreviewElementAtScrollTop(...)`

其中：

- `previewLayoutIndex` 只负责索引命中与条目校验
- 共享 helper 负责在索引未命中或条目失效时调用旧 DOM 扫描逻辑
- `usePreviewSync` 与 `useAssociationHighlight` 只消费共享 helper 的统一返回结构，不再各自决定回退策略

### 索引条目结构

每个索引条目只保留稳定结构信息：

- `element`
- `lineStart`
- `lineEnd`
- `depth`
- `span`
- `order`

第一阶段不在索引条目中长期缓存以下字段：

- `top`
- `height`
- `scrollTop`

### 索引实例能力

索引实例建议暴露以下方法：

- `rebuild(rootElement)`
- `clear()`
- `hasEntries()`
- `findByLine(lineNumber, maxLineNumber)`
- `findAtScrollTop(scrollTop, options)`

其中：

- `findByLine()` 只返回按行查找的索引层结果，不负责旧逻辑回退
- `findAtScrollTop()` 允许接受 `getElementTop` 等回调，用于在不缓存几何信息的前提下实时读取节点位置
- 所有查找方法都必须在返回前校验条目是否仍然有效

### 结构索引内部数据

建议维护以下内部状态：

- `entries`：按文档顺序排列的全部结构节点
- `mappedLines`：所有可映射的 Markdown 行号列表
- `lineToBestEntry`：每一行对应的最佳节点
- `version`：每次重建递增
- `lastScrollHitIndex`：预览连续滚动场景下的命中 hint

## 模块接入方案

### 编辑页

在 `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue` 中持有索引实例，并在预览刷新完成后重建：

- 预览刷新完成后调用 `previewLayoutIndex.rebuild(previewRef.value)`
- 将索引实例注入 `usePreviewSync`
- 将索引实例注入 `useAssociationHighlight`
- `MarkdownEdit.vue` 内现有预览滚动锚点 capture / restore 第一阶段保持 legacy 实现，不接入索引

### 纯预览页

第一阶段不把 `wj-markdown-editor-web/src/views/PreviewView.vue` 纳入实际改造范围。

原因：

- 当前第一阶段收益集中在编辑页的同步滚动与联动高亮
- 纯预览页目前没有对应的高频结构扫描热点需要同步改造
- 若在第一阶段同时纳入纯预览页，只会扩大范围，增加不必要的回归面

纯预览页的索引接入留到后续阶段，与滚动锚点恢复一并处理。

### 同步滚动模块

`wj-markdown-editor-web/src/components/editor/composables/usePreviewSync.js` 做如下调整：

- 将现有 `findPreviewElement()` 替换为共享 helper 的按行查找
- 将现有 `findElementAtPreviewScroll()` 替换为共享 helper 的按滚动位置查找
- 继续保留 `getElementToTopDistance()`、滚动比例换算、`scrollTo()` 的现有行为

### 联动高亮模块

`wj-markdown-editor-web/src/components/editor/composables/useAssociationHighlight.js` 做如下调整：

- 不再自己决定旧逻辑回退归属
- 改为复用共享 helper 的按行查找结果
- 预览点击后仍按现有 `closest('[data-line-start]')` 路径处理

## 重建时机

第一阶段只保留一个冷路径重建入口：

- `MarkdownPreview` 发出 `refreshComplete` 事件后重建结构索引

第一阶段暂不增加以下重建入口：

- 图片 `load`
- Mermaid 二次 settle 之后的局部重建
- 容器 `resize`
- 字体或主题切换后的额外重建

原因是第一阶段并未缓存几何高度，这些变化不会让“节点是谁”失效，只会改变“节点此刻有多高”，而几何仍然通过实时 DOM 读取。

## 条目失效与校验策略

虽然第一阶段不缓存几何高度，但索引条目长期持有 `element`、`lineStart`、`lineEnd`，因此必须在每次命中前执行有效性校验。

索引条目命中前至少校验以下条件：

- `entry.element` 仍然存在
- `entry.element.isConnected !== false`
- 当前根节点仍包含该元素
- 元素当前 `dataset.lineStart` / `dataset.lineEnd` 与条目记录一致

若校验失败：

- 本次索引命中直接视为无效
- 由共享 helper 自动回退到旧 DOM 扫描逻辑
- 不允许在热路径中抛异常或继续使用过期条目

第一阶段允许附加一个保守策略：

- 在编辑页检测到预览将要因内容变更而刷新时，可提前执行一次 `previewLayoutIndex.clear()`

但这不是第一阶段正确性的唯一依赖条件；即使没有提前 `clear()`，条目有效性校验也必须独立成立。

## 回退策略

为降低第一阶段回归风险，必须保留旧逻辑作为回退路径：

- 索引尚未建立时，直接回退旧逻辑
- 索引为空时，直接回退旧逻辑
- 索引未命中有效节点时，直接回退旧逻辑
- 索引命中条目但校验发现元素已失效时，直接回退旧逻辑
- 索引命中节点但后续几何读取失败时，沿用现有保护逻辑，不强行继续

此回退策略保证第一阶段上线后，即使索引存在边角问题，也不会直接打坏同步滚动与联动高亮。

## 风险分析

### 可接受风险

- 第一阶段不会直接优化整文预览渲染成本
- 纯预览页的滚动锚点恢复第一阶段收益有限
- `findAtScrollTop` 仍然需要实时读取候选节点几何信息，因此不会立刻消除所有滚动期布局读取

### 必须规避的风险

- 索引化后改变现有行号命中语义
- 移除旧逻辑回退口
- 在第一阶段顺手改动资源删除、预览搜索或目录生成逻辑
- 将索引错误当成布局错误，导致同步滚动位置偏移
- 因为查找 helper 或索引实例注入方式变化，间接破坏资源删除相同引用统计等未纳入改造范围的功能

## 测试策略

第一阶段至少补齐以下测试：

### 新增测试

- `wj-markdown-editor-web/src/util/editor/__tests__/previewLayoutIndexUtil.test.js`
  - 多候选节点优先级测试
  - 向后寻找最近可映射行测试
  - 空索引与非法输入测试
  - `findAtScrollTop` hint 与回退测试

- `wj-markdown-editor-web/src/components/editor/composables/__tests__/useAssociationHighlight.test.js`
  - 通过索引命中预览节点测试
  - 索引缺失回退测试
  - 预览点击后双侧高亮语义测试

### 修改测试

- `wj-markdown-editor-web/src/components/editor/composables/__tests__/usePreviewSync.test.js`
  - 优先走索引测试
  - 索引未命中时回退旧逻辑测试
  - 索引命中条目已失效时回退旧逻辑测试
  - 恢复期保护语义不变测试

### 共享 helper 测试

- `wj-markdown-editor-web/src/util/editor/__tests__/previewLayoutIndexUtil.test.js`
  - 按行查找返回结构测试
  - 按滚动位置查找返回结构测试
  - 旧 DOM 回退后 `entry` 归一化结构测试
  - 同 `top` / 嵌套节点场景的滚动位置选取规则测试
  - 条目失效校验测试
  - 共享 helper 的回退路径测试

### 非回归验证

第一阶段必须执行至少一轮手工非回归验证，覆盖以下场景：

- 在编辑页预览区对同一资源出现多次引用时，确认“统计相同引用数”仍正确
- 确认“删除当前引用”和“删除全部引用”仍按当前正文内容工作
- 确认预览搜索仍可打开、关闭、清理旧标记
- 确认点击图片仍能打开正确图片预览
- 确认目录仍能生成并可跳转到正确标题

## 验证命令

在 `wj-markdown-editor-web/` 目录执行：

```bash
node --test src/util/editor/__tests__/previewLayoutIndexUtil.test.js
node --test src/components/editor/composables/__tests__/usePreviewSync.test.js
node --test src/components/editor/composables/__tests__/useAssociationHighlight.test.js
npx eslint --fix src/util/editor/previewLayoutIndexUtil.js src/util/editor/__tests__/previewLayoutIndexUtil.test.js src/components/editor/composables/usePreviewSync.js src/components/editor/composables/useAssociationHighlight.js src/components/editor/composables/__tests__/usePreviewSync.test.js src/components/editor/composables/__tests__/useAssociationHighlight.test.js src/components/editor/MarkdownEdit.vue
```

## 后续阶段衔接

第一阶段完成后，后续优化可以继续沿着以下顺序推进：

1. 将纯预览页与滚动锚点恢复逐步接入同一份布局索引
2. 将大纲扫描、资源元数据扫描从主刷新链路拆成后置阶段
3. 在布局失效机制完善后，再考虑缓存 `top` / `height`
4. 最后再评估是否需要块级增量渲染
