# 预览资源右键菜单复制与图片导出设计

## 1. 背景

当前预览区右键菜单已经收口到统一链路：

- `MarkdownPreview.vue` 通过事件委托识别命中的资源节点，并抛出 `preview-contextmenu`
- `EditorView.vue` / `PreviewView.vue` 冻结当前文档的 `actionContext`
- `buildPreviewContextMenuItems()` 按页面 profile 生成菜单项
- Electron 端经 `documentSessionRuntime -> documentResourceService` 统一处理资源级桌面能力

现状仅支持：

- 编辑页：`在资源管理器中打开`、`删除`
- 纯预览页：`在资源管理器中打开`

本次需求是在不破坏现有右键架构的前提下，为资源菜单补充复制与图片导出能力，并严格区分编辑页与纯预览页的权限边界。

## 2. 目标

### 2.1 功能目标

1. 图片资源新增以下能力：
   - 复制本地图片的绝对路径
   - 复制网络图片链接
   - 复制图片内容到系统剪贴板
   - 另存为到用户选择的位置
   - 复制当前图片对应的 Markdown 引用
2. 非图片资源新增以下能力：
   - 本地资源复制绝对路径
   - 网络资源复制资源链接
   - 复制当前资源对应的 Markdown 引用
3. 编辑页继续保留删除能力；纯预览页不得出现编辑性质菜单。
4. 所有依赖文件系统、网络下载、原生图片剪贴板或保存对话框的资源能力，都必须先由宿主视图把菜单 action key 分发为 `document.resource.*` 命令，再经 Electron runtime 执行，不在 renderer 自行拼接平台能力。
5. `复制 Markdown 引用` 作为唯一的纯文本剪贴板例外，允许宿主视图在 renderer 侧直接执行，不纳入 runtime 资源命令集合。

### 2.2 交互目标

1. 继续使用当前 `previewContextmenu -> 菜单构造 -> 视图分发 -> runtime` 的链路。
2. 纯预览页与编辑页共享同一套菜单构造规则，但由 `profile` 控制可见动作。
3. 异常场景必须有明确提示或稳定兜底，不能只覆盖 happy path。

## 3. 非目标

以下能力不纳入本次范围：

- 为音频、视频、附件增加“复制文件内容到剪贴板”
- 新增“在浏览器打开网络图片”
- 新增“替换资源”“查看资源详情”“复制 HTML 引用”等衍生功能
- 重构现有文档删除流程或 document-session 主链路

## 4. 菜单行为设计

### 4.1 动作 key

本次新增或继续使用的菜单动作 key 如下：

- `resource.copy-absolute-path`
- `resource.copy-link`
- `resource.copy-image`
- `resource.save-as`
- `resource.copy-markdown-reference`
- `resource.open-in-folder`
- `resource.delete`

### 4.2 菜单矩阵

| 资源类型 | 页面 | 菜单项 |
| --- | --- | --- |
| 本地图片 | 编辑页 | `复制绝对路径`、`复制图片`、`另存为`、`在资源管理器中打开`、`复制 Markdown 引用`、`删除` |
| 本地图片 | 纯预览页 | `复制绝对路径`、`复制图片`、`另存为`、`在资源管理器中打开`、`复制 Markdown 引用` |
| 网络图片 | 编辑页 | `复制图片链接`、`复制图片`、`另存为`、`复制 Markdown 引用`、`删除` |
| 网络图片 | 纯预览页 | `复制图片链接`、`复制图片`、`另存为`、`复制 Markdown 引用` |
| 本地非图片资源 | 编辑页 | `复制绝对路径`、`在资源管理器中打开`、`复制 Markdown 引用`、`删除` |
| 本地非图片资源 | 纯预览页 | `复制绝对路径`、`在资源管理器中打开`、`复制 Markdown 引用` |
| 网络非图片资源 | 编辑页 | `复制资源链接`、`复制 Markdown 引用`、`删除` |
| 网络非图片资源 | 纯预览页 | `复制资源链接`、`复制 Markdown 引用` |

### 4.3 编辑性边界

- `resource.delete` 只允许在 `editor-preview` profile 出现。
- `resource.copy-markdown-reference` 在编辑页和纯预览页都保留，因为它只复制文本，不修改正文。
- `resource.copy-markdown-reference` 只在 `markdownReference` 可稳定提供时显示；如果当前上下文无法安全还原原始 Markdown 引用，则隐藏该菜单项。
- 网络图片不提供“在浏览器打开”。
- `resource.copy-image` 与 `resource.save-as` 仅对图片资源显示。
- `assetType = unknown` 时统一按“非图片资源”兜底处理：不显示 `复制图片` 与 `另存为`，其余动作按 `sourceType + profile` 继续裁决。

## 5. 资源上下文设计

### 5.1 扩展后的上下文字段

当前 `createPreviewResourceContext(assetInfo)` 仅透传基础资源信息。本次需要扩展为以下结构：

```js
{
  type: 'resource',
  asset: {
    assetType: 'image' | 'video' | 'audio' | 'link' | 'unknown',
    sourceType: 'local' | 'remote',
    rawSrc: string,
    rawPath: string | null,
    resourceUrl: string,
    markdownReference: string | null,
    occurrence: number,
    lineStart: number | undefined,
    lineEnd: number | undefined,
  },
  menuPosition: {
    x: number,
    y: number,
  },
}
```

### 5.2 字段判定原则

- `assetType` 由命中的 DOM 节点类型判定，避免视图层再从 URL 猜语义。
- `MarkdownPreview.vue` 内部现有的 DOM 提取字段如果仍使用 `kind` 作为中间变量，只允许在组件内部过渡使用；`createPreviewResourceContext()` 对外产出的最终上下文只保留 `assetType`，后续菜单构造与动作分发统一读取 `assetType`。
- `rawSrc` 是当前资源在 Markdown 中的原始引用文本：
  - 它必须来自可稳定回放的原始资源引用元信息，不得从最终渲染后的 `src` / `href` / `resourceUrl` 反推
  - 远程资源复制链接固定以 `rawSrc` 为权威来源
  - 远程图片下载、复制图片、另存为也固定以 `rawSrc` 为权威来源
- `rawPath` 只服务本地资源解析：
  - 它表示原始本地路径候选，可用于相对路径解析与本地文件定位
- `resourceUrl` 是预览层最终用于渲染的资源地址：
  - 对本地资源通常是 `wj://` 或等价本地协议地址
  - 它可继续作为本地资源打开目录、复制图片、本地另存为时的协议入口
- `sourceType` 由 `resourceUrl/rawSrc/rawPath` 共同判定：
  - `wj://` 或可解析为本地文件的资源视为 `local`
  - `http://` / `https://` 视为 `remote`
- 如果无法稳定判定 `sourceType`，`createPreviewResourceContext()` 必须直接返回 `null`，不弹出自定义资源菜单。
- 对本地资源的解析优先级固定如下：
  - 优先使用 `rawPath + requestContext` 解析原始本地路径
  - 仅在 `rawPath` 缺失或无法参与解析时，才允许回退 `resourceUrl`
  - 如果 `rawPath` 与 `resourceUrl` 都能解析且结果不一致，必须 fail-closed，返回固定冲突错误，不继续执行资源动作
- `markdownReference` 必须来自渲染 DOM 上可稳定回放的原始引用元信息。
- 如果 DOM 没有足够的原始引用信息，则 `markdownReference = null`，并隐藏“复制 Markdown 引用”；不得再根据 `assetType + rawSrc` 临时拼装“最小可用引用”。
- 未保存文档中的相对本地资源，在菜单可见性上仍按 `local` 处理，不额外引入新的菜单分支；凡是依赖绝对路径解析的动作，执行期统一复用现有“当前文件未保存，无法定位相对资源”失败语义。

### 5.3 `actionContext` / `requestContext` 契约

- `actionContext` 由宿主视图在菜单打开瞬间冻结，继续沿用当前右键架构：
  - `version`
  - `sessionId`
  - `documentPath`
- `requestContext` 由宿主视图基于冻结的 `actionContext` 生成，并发送给 runtime：

```js
{
  sessionId: string | null,
  documentPath: string | null,
}
```

- `requestContext` 的生成时机必须与当前 `resource.open-in-folder` / `resource.delete` 一致：
  - 不能在菜单点击时重新读取最新 store 快照
  - 必须复用菜单打开时冻结的上下文
- `actionContext.version` 只用于 renderer 侧识别“菜单打开后上下文是否已失效”，不进入 runtime 命令契约。
- runtime 继续只使用 `requestContext.sessionId + requestContext.documentPath` 做 `stale-document-context` 判定，不引入新的请求态结构。

## 6. 架构与职责拆分

### 6.1 Renderer 侧职责

#### `MarkdownPreview.vue`

- 继续通过事件委托识别右键命中的资源节点
- 补齐 `assetType`、`sourceType`、`markdownReference`
- 只负责抛出统一的 `previewContextmenu` 事件
- 不直接触发系统剪贴板、文件保存或下载

#### `previewResourceContextUtil.js`

- 统一归一化资源上下文结构
- 封装本地/网络来源判定，避免 `EditorView.vue` / `PreviewView.vue` 重复判断

#### `previewContextMenuActionUtil.js`

- 保持 `buildPreviewContextMenuItems({ context, profile, t })` 这一层输入模型
- 先判断 `context.type`
- 当 `context.type === 'resource'` 时，再基于 `assetType + sourceType + profile` 生成菜单项
- 输出稳定菜单项数组
- `assetType = unknown` 时必须落到非图片兜底分支，不能单独派生新的菜单体系
- 不在该 util 中夹带具体执行逻辑

#### `EditorView.vue`

- 继续作为编辑页菜单动作分发中心
- 继续接收菜单层回传的 `resource.*` action key
- 新增以下分发分支：
  - `resource.copy-absolute-path`
  - `resource.copy-link`
  - `resource.copy-image`
  - `resource.save-as`
  - `resource.copy-markdown-reference`
- 继续保留 `resource.open-in-folder` 与 `resource.delete`
- 除 `resource.copy-markdown-reference` 外，其余资源动作都由宿主再映射为 `document.resource.*` IPC 命令

#### `PreviewView.vue`

- 继续作为纯预览页菜单动作分发中心
- 继续接收菜单层回传的 `resource.*` action key
- 仅处理非编辑动作：
  - `resource.copy-absolute-path`
  - `resource.copy-link`
  - `resource.copy-image`
  - `resource.save-as`
  - `resource.copy-markdown-reference`
  - `resource.open-in-folder`
- 除 `resource.copy-markdown-reference` 外，其余资源动作都由宿主再映射为 `document.resource.*` IPC 命令

### 6.2 Electron 侧职责

#### `ipcMainUtil.js`

- 继续扩展现有 `sendToMain` -> `document.resource.*` 分发链路
- 不新增并行 IPC 通道
- 继续统一透传到 runtime，而不是在 IPC 层直接写散落逻辑

#### `documentSessionRuntime.js`

- 注册新的资源类 UI 命令：
  - `document.resource.copy-absolute-path`
  - `document.resource.copy-link`
  - `document.resource.copy-image`
  - `document.resource.save-as`
- 仍把资源命令路由到 `documentResourceService`

#### `documentResourceService.js`

- 继续以 active session 为资源解析上下文
- 承接本地/网络资源桌面能力：
  - 解析本地绝对路径文本
  - 解析网络链接文本
  - 复制图片到系统剪贴板
  - 图片另存为
  - 本地资源在资源管理器中打开
- 不能盲信 renderer 传入的 `sourceType`，必须在 runtime 再次校验输入组合是否自洽
- 保持 `requestContext` 过期保护，避免文档切换后操作旧资源

#### 可选新 util

如果 `documentResourceService.js` 出现明显职责膨胀，则新增一个聚焦图片 IO 的 util，封装：

- 网络图片下载
- Content-Type 校验
- 默认文件名与扩展名推导
- Electron `nativeImage` / `clipboard` 转换

## 7. 命令与数据流设计

### 7.0 菜单动作与运行时命令映射

| 菜单 action key | 宿主分发结果 |
| --- | --- |
| `resource.copy-absolute-path` | `document.resource.copy-absolute-path` |
| `resource.copy-link` | `document.resource.copy-link` |
| `resource.copy-image` | `document.resource.copy-image` |
| `resource.save-as` | `document.resource.save-as` |
| `resource.open-in-folder` | `document.resource.open-in-folder` |
| `resource.delete` | `document.resource.delete-local` |
| `resource.copy-markdown-reference` | renderer 直接执行，不经过 runtime |

### 7.1 最小运行时命令契约

| 命令 | 请求入参 | 成功返回 | 失败返回 |
| --- | --- | --- | --- |
| `document.resource.copy-absolute-path` | `{ resourceUrl, rawPath, requestContext }` | `{ ok: true, text }` | `{ ok: false, reason }` |
| `document.resource.copy-link` | `{ rawSrc, requestContext }` | `{ ok: true, text }` | `{ ok: false, reason }` |
| `document.resource.copy-image` | `{ sourceType, resourceUrl, rawSrc, rawPath, requestContext }` | `{ ok: true, sourceType }` | `{ ok: false, reason }` |
| `document.resource.save-as` | `{ sourceType, resourceUrl, rawSrc, rawPath, requestContext }` | `{ ok: true, path }` | `{ ok: false, reason, cancelled?: true }` |

统一校验规则：

- `document.resource.copy-link` 只接受可再次判定为 `remote` 的 `rawSrc`；否则返回固定失败结果。
- `document.resource.copy-image` / `document.resource.save-as` 必须在 runtime 再次校验：
  - `sourceType = local` 时，输入必须能按本地资源规则稳定解析
  - `sourceType = remote` 时，`rawSrc` 必须是可直接下载的远程地址
  - 如果 runtime 复判结果与 renderer 传入的 `sourceType` 不一致，必须 fail-closed，返回固定类型不匹配错误
- 任一本地资源动作遇到 `rawPath` 与 `resourceUrl` 解析结果冲突时，必须 fail-closed，返回固定目标冲突错误

### 7.2 复制绝对路径 / 复制链接

1. Renderer 右键命中资源并冻结 `actionContext`
2. 菜单层回传 `resource.copy-absolute-path` 或 `resource.copy-link`
3. 宿主视图把 action key 映射为 `document.resource.copy-absolute-path` 或 `document.resource.copy-link`
4. 宿主经 IPC 调用 runtime
5. 复制绝对路径固定由 runtime 基于 `resourceUrl + rawPath + requestContext` 解析权威本地路径文本
6. 复制资源链接固定由 runtime 基于 `rawSrc` 返回权威原始链接文本
7. Electron 返回 `{ ok: true, text }`
8. 宿主视图在 renderer 侧写入文本剪贴板
9. Renderer 依据结构化结果显示成功或失败消息

### 7.3 复制图片

1. 菜单层回传 `resource.copy-image`
2. 宿主视图把 action key 映射为 `document.resource.copy-image`
3. 本地图片固定以 `resourceUrl + rawPath + requestContext` 作为权威输入
4. 网络图片固定以 `rawSrc` 作为权威下载地址
5. Electron 根据 `sourceType` 读取本地图片或下载网络图片
6. 校验结果确为图片内容
7. 转换为系统剪贴板支持的图片格式并写入剪贴板
8. 返回 `{ ok, reason }` 结构化结果

### 7.4 图片另存为

1. 菜单层回传 `resource.save-as`
2. 宿主视图把 action key 映射为 `document.resource.save-as`
3. 本地图片固定以 `resourceUrl + rawPath + requestContext` 作为权威输入
4. 网络图片固定以 `rawSrc` 作为权威下载地址
5. Electron 解析默认文件名
6. 打开保存对话框
7. 用户确认后读取本地文件或下载网络图片
8. 写入目标路径
9. 返回保存结果；若用户取消则返回取消态

### 7.5 复制 Markdown 引用

1. 该动作是本次唯一允许绕开 runtime 的资源菜单动作
2. 菜单层回传 `resource.copy-markdown-reference`
3. 宿主视图直接使用当前 `asset.markdownReference`
4. 写入文本剪贴板
5. 复用现有 `message.copySucceeded` / `message.copyFailed`
6. 不经过 runtime，不修改文档内容

## 8. 异常与边界处理

### 8.1 本地资源异常

- 本地文件已不存在：
  - `复制绝对路径` 仍然允许
  - `复制图片` / `另存为` / `在资源管理器中打开` 返回“文件不存在”
- `rawPath` 与 `resourceUrl` 指向不同本地目标：
  - runtime 必须返回固定目标冲突错误
  - renderer 只显示失败提示，不做任意一侧的猜测性兜底
- 未保存文档中的相对资源：
  - 继续复用现有“相对资源需要已保存文档”语义
- 请求上下文过期：
  - runtime 返回 `stale-document-context`
  - 视图层静默中止或提示统一失败，不继续执行旧文档动作

### 8.2 网络资源异常

- 下载失败：提示失败，不写空文件
- `sourceType` 与 runtime 复判结果不一致：返回固定类型不匹配错误，不继续下载或写剪贴板
- 响应不是图片：`复制图片` 与 `另存为` 必须拒绝
- URL 带 query/hash：默认文件名推导时剥离 query/hash
- URL 缺少扩展名：
  - 优先根据 `Content-Type` 推导扩展名
  - 仍无法推导时使用安全默认名，如 `image.png`
- 下载超时或资源过大：
  - 返回明确失败原因
  - 不允许动作长时间无响应且无反馈

### 8.3 用户交互异常

- 用户取消另存为：返回取消态，静默结束，不提示错误
- 剪贴板写入失败：提示复制失败
- `markdownReference = null`：隐藏“复制 Markdown 引用”菜单项；若异常情况下仍触发执行，则提示复制失败，不拼接错误内容
- `assetType = unknown`：按非图片资源处理，不显示图片专属动作
- 纯预览页任何情况下都不出现删除入口

## 9. 国际化策略

采用“通用反馈复用 + 菜单专属文案新增”的策略：

- 复用现有文案：
  - `top.openInExplorer`
  - `message.copySucceeded`
  - `message.copyFailed`
  - `message.saveAsSuccessfully`
  - `message.theFileDoesNotExist`
  - `message.openResourceLocationFailed`
  - `message.imageDownloadFailed`
  - `message.theLinkIsNotValid`
- 新增 `previewAssetMenu.*` 文案：
  - `copyAbsolutePath`
  - `copyResourceLink`
  - `copyImageLink`
  - `copyImage`
  - `copyMarkdownReference`
  - `saveAs`
  - 与资源菜单专属失败态对应的消息 key

这样可以保持全局通用动作语义不分叉，同时把预览资源菜单自己的标签和错误语境集中管理。

图片资源右键菜单中的“另存为取消”保持静默结束，不复用 `message.cancelSaveAs`，避免与当前需求中的交互约束冲突。

## 10. 测试策略

### 10.1 Web 单测

- `previewContextMenuActionUtil.test.js`
  - 覆盖本地/网络、图片/非图片、编辑页/纯预览页的菜单矩阵
- `previewResourceContextUtil` 或 `MarkdownPreview` 相关测试
  - 覆盖 `assetType / sourceType / markdownReference` 归一化
- `EditorView` 菜单宿主测试
  - 覆盖新增 action 分发
  - 保证编辑页保留删除动作
- `PreviewView` 菜单宿主测试
  - 保证纯预览页没有删除动作
  - 保留 `复制 Markdown 引用`
- i18n 测试
  - 覆盖新增键存在性

### 10.2 Electron 单测

- `ipcMainUtil.test.js`
  - 验证新增 IPC 命令继续经 runtime 统一入口
- `documentSessionRuntime.test.js`
  - 验证新增资源命令已注册并正确路由
- `documentResourceService.test.js`
  - 覆盖本地图片复制成功/失败
  - 覆盖网络图片下载成功/失败/非图片响应
  - 覆盖另存为成功/取消/写盘失败
  - 覆盖绝对路径/链接复制
  - 覆盖 `stale-document-context`
  - 覆盖 query/hash 文件名剥离与扩展名推导

## 11. 实施约束

1. 不新增绕过 runtime 的资源操作通道。
2. 不在 Web 端自行实现平台路径解析、下载写盘或图片剪贴板能力。
3. 菜单 action key 与 runtime 命令必须保持分层：菜单层继续使用 `resource.*`，宿主层再分发为 `document.resource.*`。
4. `resource.copy-markdown-reference` 是唯一允许在 renderer 直接执行的例外，因为它只依赖纯文本剪贴板，不涉及文件系统、原生图片剪贴板或保存对话框。
5. 不改变当前删除流程的产品策略，只补菜单能力和资源动作。
6. 优先保持现有模块边界；只有在 Electron 资源服务明显膨胀时才新增辅助 util。

## 12. 计划入口

该设计对应一个单一实现计划即可，不需要再拆成多个独立子项目。后续实施计划将基于以下顺序展开：

1. 先补资源上下文与菜单矩阵测试
2. 再补 renderer 动作分发
3. 最后补 Electron 资源命令与异常覆盖
