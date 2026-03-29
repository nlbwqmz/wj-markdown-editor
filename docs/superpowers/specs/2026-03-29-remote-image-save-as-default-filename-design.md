# 远程图片另存为默认文件名探测设计

## 1. 背景

当前预览区远程图片的 `另存为` 已经改成：

- 弹出保存对话框前，不再预取远程资源内容
- 默认文件名优先按 URL 推导
- URL 无法提供可靠文件名时，回退到安全默认名
- 用户选定保存路径后，才真正下载远程图片并执行内容校验

现有实现位于：

- `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
  - `deriveRemoteFileName(remoteUrl, contentType)`
  - `resolveRemoteImageSaveSource(payload)`
  - `fetchRemoteImageBuffer(remoteUrl)`

该行为已经满足“不在弹框前下载内容”的约束，但仍存在一个体验缺口：部分远程图片链接来自 CDN、签名地址或动态接口，URL 上没有可靠扩展名，导致默认文件名经常退化为 `image.png` 或与真实图片格式不一致。

本次设计目标是在不恢复“弹框前下载内容”的前提下，尽量提升远程图片 `另存为` 默认文件名的准确率。

## 2. 目标

### 2.1 功能目标

1. 远程图片 `另存为` 时，默认文件名继续优先按 URL 推导。
2. 当 URL 文件名缺失、无扩展名或扩展名可疑时，允许发起一次轻量级远程探测，以补齐或修正默认文件名。
3. 轻量级探测只能依赖单次 `HEAD` 响应头信息，不得在弹框前发起任何 `GET` 内容请求。
4. 真正的远程图片下载、图片类型校验和体积校验，继续延后到用户选定保存路径之后执行。
5. 探测失败不得阻断 `另存为` 主流程，只允许回退到 URL 推导名或安全默认名。

### 2.2 交互目标

1. 对 URL 已经可靠的远程图片，不增加额外网络请求。
2. 对 URL 不可靠的远程图片，探测必须使用总预算受限的短超时，避免明显拖慢弹框体验。
3. 用户取消保存时，仍不得发起实际图片下载。

## 3. 非目标

以下内容不在本次范围内：

- 修改远程图片 `复制图片` 的下载逻辑
- 在弹框前读取完整图片内容后再决定默认文件名
- 为远程非图片资源新增统一命名探测流程
- 试图在所有站点上 100% 还原服务端真实文件名
- 改造当前 `fetchRemoteImageBuffer()` 的实际下载和大小校验语义

## 4. 方案选择

### 4.1 方案 A：完全只看 URL

做法：

- 继续只解析 URL basename
- 不增加任何网络探测

优点：

- 实现最简单
- 无额外请求
- 完全符合“弹框前不联网”的最保守策略

缺点：

- 对无扩展名 URL、签名链接、动态资源链接命中率差
- 默认文件名准确率无法改善

### 4.2 方案 B：所有远程图片统一探测响应头

做法：

- 远程图片 `另存为` 时，无论 URL 是否可靠，都先进行一次头探测

优点：

- 默认文件名修正命中率最高
- 规则简单直接

缺点：

- 每次远程图片另存为都会增加一次网络往返
- 会拖慢本来已经可靠的场景
- 慢链路和异常站点会影响弹框前体验

### 4.3 方案 C：URL 优先，文件名不可靠时才探测单次 `HEAD` 响应头

做法：

- 先按 URL 推导默认文件名
- 仅当文件名不可靠时，才发起短超时 `HEAD` 响应头探测
- 探测失败时静默回退

优点：

- 与当前“弹框前不下载内容”的方向一致
- 只在真正需要时增加额外请求
- 兼顾性能、稳定性和默认文件名准确率

缺点：

- 逻辑比纯 URL 推导更复杂
- 无法保证所有站点都拿到准确文件名

### 4.4 推荐结论

采用方案 C。

理由如下：

1. “不在弹框前下载内容”是这条链路的主约束，不能被默认文件名优化反向破坏。
2. URL 已可靠的场景占比不低，不应为这部分流量引入无意义探测。
3. URL 不可靠时，短超时 `HEAD` 探测可以显著提升默认文件名质量，同时把失败成本控制在较小范围内。

## 5. 触发条件设计

### 5.1 当前入口

远程图片 `另存为` 仍由 `document.resource.save-as` 触发，并在 `documentResourceService.saveAs()` 中进入远程分支。

本次只调整“生成 `showSaveDialogSync({ defaultPath })` 的默认文件名”这一段逻辑，不改变：

- 菜单动作
- IPC 命令
- 用户选定路径后的真实下载时机

### 5.2 文件名可靠性判定

新增文件名可靠性判断函数，例如 `isReliableRemoteImageFileName(fileName)`，仅用于决定是否需要发起头探测。

URL 推导出的候选文件名满足以下任一条件时，判定为“不可靠”：

- 文件名为空
- 文件名为 `.` 或清洗后为空
- 文件名没有扩展名
- 文件名扩展名不是已知图片扩展名

已知图片扩展名建议与现有 `IMAGE_CONTENT_TYPE_EXTENSION_MAP` 对齐，至少包含：

- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.webp`
- `.avif`
- `.svg`
- `.bmp`
- `.ico`

扩展名匹配必须大小写不敏感，例如 `.JPG`、`.JPEG` 也应视为可靠图片后缀。

当 URL 文件名可靠时，直接使用 URL 推导结果作为默认文件名，不发起任何额外请求。

## 6. 头探测设计

### 6.1 新增探测入口

新增一个轻量级探测函数，例如：

- `probeRemoteResourceMetadata(remoteUrl, { timeoutMs })`

该函数只服务于默认文件名修正，不承担资源合法性校验，也不负责返回文件字节。

返回结果建议统一为：

```js
{
  ok: true,
  fileName: string | null,
  contentType: string | null,
}
```

这里只表达“HTTP probe 是否拿到了可解析的响应头”，不表达“最终文件名是否可靠”。

也就是说：

- `fileName = null` 只表示 `Content-Disposition` 不可用
- `contentType = null` 只表示 `Content-Type` 不可用
- 单个字段不可用不等于整次 probe 失败

仅当 `HEAD` 请求本身无法提供可用响应时，才静默返回：

```js
{
  ok: false,
}
```

探测失败不得冒泡为 `另存为` 错误。

### 6.2 请求策略

探测策略固定如下：

1. 只允许发起一次 `HEAD`
2. `HEAD` 超时、失败或返回非成功状态时，直接静默回退
3. 禁止使用 `GET fallback`

这样设计的原因是：

- 只要发起 `GET`，即使调用方不主动消费 body，服务端也可能已经把内容发出
- 在快链路或小文件场景下，`GET` 响应体可能在应用执行取消前就已完整传输
- 当前链路的主约束是“弹框前不下载远程内容”，因此不能引入任何 `GET` 兜底
- 默认文件名优化是增强项，不应以破坏主约束为代价

### 6.3 超时策略

头探测必须使用单独短超时，不复用当前实际下载的超时配置。

建议值：

- 默认 `1000ms`
- 可接受范围 `800ms` 到 `1500ms`

设计原则：

- 超时只影响默认文件名命中率
- 不允许为了修正默认文件名而让弹框明显卡顿
- 超时预算按整次探测计算，而不是按单次请求分摊；由于只允许一次 `HEAD`，探测总预算就等于 `HEAD` 超时预算

### 6.4 `HEAD` 行为

`HEAD` 请求成功后，只解析以下头信息：

- `Content-Disposition`
- `Content-Type`

不读取响应体，不做图片内容解析。

`HEAD` 请求的结果处理规则固定如下：

1. 先尝试解析 `Content-Disposition` 文件名
2. 再尝试根据 `Content-Type` 推导扩展名
3. 将头信息与 URL 文件名合并，生成一个最终候选文件名
4. 无论头信息完整还是不完整，都不再发起第二次请求
5. 最终候选文件名统一由 `buildRemoteSaveFileName()` 补齐到确定结果，不允许在调用点再写额外回退分支

### 6.5 `HEAD` 失败回退

`HEAD` 出现以下情况时，直接静默回退，不做第二次网络请求：

- 超时
- 网络异常
- 返回非成功状态

该回退只影响默认文件名，不影响用户继续看到保存对话框。

## 7. 默认文件名合并规则

### 7.1 信息来源

默认文件名最多来自三个来源：

1. URL basename
2. `HEAD` 响应头中的 `Content-Disposition` 文件名
3. `HEAD` 响应头中的 `Content-Type` 对应扩展名

### 7.2 优先级规则

基础名优先级：

1. `Content-Disposition` 解析出的文件名基础名
2. URL basename 的基础名
3. 安全默认基础名 `image`

扩展名优先级：

1. `Content-Disposition` 文件名中的已知图片扩展名
2. `Content-Type` 映射出的扩展名
3. URL 文件名中的已知图片扩展名
4. 安全默认扩展名 `.png`

### 7.3 组装规则

最终默认文件名按以下规则生成：

1. 先分别解析 URL 文件名、头文件名、`Content-Type` 对应扩展名
2. 头探测成功时，即使只有部分字段可用，也继续参与最终合并
3. 头探测失败时，仅表示头来源整体不可用；URL 来源继续保留
4. 选择基础名优先级最高的可用值
5. 选择扩展名优先级最高的可用值
6. 如果基础名为空，回退为 `image`
7. 如果扩展名为空，回退为 `.png`
8. 拼接后统一执行 `sanitizeFileName()`

这意味着：

- `Content-Disposition` 解析失败但 `Content-Type` 可用时，继续使用 `Content-Type`
- `Content-Type` 不可映射但头文件名已带合法图片扩展名时，继续保留头文件名
- probe 整体失败但 URL 仍有 basename 时，继续使用 URL basename，并按规则补扩展名
- 只有在 URL 与头信息都无法提供基础名时，才最终回退到 `image`

为了避免实现分叉，最终默认文件名一律通过同一个 `buildRemoteSaveFileName()` 生成，不允许在不同失败分支里各自拼接结果。

### 7.4 `Content-Disposition` 解析规则

建议新增 `parseContentDispositionFileName(headerValue)`：

- 优先支持 `filename*=`
- 其次支持 `filename=`
- 两者同时存在时优先 `filename*=`
- 解析失败时静默返回 `null`
- 成功解析后，需继续经过安全清洗与平台非法名称约束

建议补充以下命名清洗约束：

- 去除尾随空格与尾随点
- 统一扩展名大小写到小写
- 若基础名命中 Windows 保留设备名，则回退到安全默认基础名 `image`

其职责仅为提取服务端建议文件名，不负责最终扩展名裁决。

## 8. 主流程设计

### 8.1 `resolveRemoteImageSaveSource(payload)` 调整

当前远程 `save-as` 的默认文件名准备阶段，建议调整为：

1. 提取远程 URL
2. 调用 `deriveRemoteFileNameFromUrl(remoteUrl)`，获得 URL 候选文件名及其可用字段
3. 调用 `isReliableRemoteImageFileName(urlFileName)`
4. 若可靠，则跳过 probe，并令 `headerFileName = null`、`contentType = null`
5. 若不可靠，则调用 `probeRemoteResourceMetadata(remoteUrl, { timeoutMs })`
6. 无论 URL 是否可靠、probe 是否执行、probe 是否成功，都统一调用 `buildRemoteSaveFileName({ urlFileName, headerFileName, contentType })`
7. 返回 `{ ok: true, remoteUrl, fileName }`

也就是说，`isReliableRemoteImageFileName()` 只决定“是否需要发起 probe”，不决定“最终文件名走哪条拼装路径”。

### 8.2 `saveAs()` 时序保持不变

`saveAs()` 远程分支的总体时序保持如下：

1. 先解析默认文件名
2. 打开保存对话框
3. 用户取消则静默结束
4. 用户确认路径后，才调用 `fetchRemoteImageBuffer(remoteUrl)` 真实下载
5. 继续沿用现有的：
   - `Content-Type` 图片校验
   - `Content-Length` / 流式超限校验
   - 写盘逻辑

也就是说，本次新增逻辑只能影响 `defaultPath`，不改变后续实际下载链路。

### 8.3 stale-context 约束

由于本次在弹框前新增了异步 `HEAD` 探测，必须显式保留当前 `saveAs()` 的会话一致性要求：

1. 发起探测前，仍按现有逻辑冻结 `capturedActionContext`
2. 探测结束后、弹框前，必须重新执行一次 `stale-document-context` 判定
3. 如果 probe 期间 active session 已切换，则不得继续弹出保存对话框
4. 弹框返回后、真实下载前，继续沿用现有 stale 校验

也就是说，probe 只是把“弹框前异步阶段”拉长了一点，但不能改变当前 stale 保护边界。

## 9. 失败与回退策略

### 9.1 头探测失败

头探测出现以下情况时，统一静默回退：

- 超时
- 网络异常
- `HEAD` 失败

这里的“回退”仅指“头来源整体不可用”，不表示直接放弃最终文件名拼装。

最终默认文件名仍按统一规则生成，来源顺序如下：

1. URL 基础名
2. URL 中的已知图片扩展名
3. 安全默认扩展名 `.png`
4. 安全默认基础名 `image`

示例：

- URL 为 `https://example.com/demo`，probe 失败，最终文件名为 `demo.png`
- URL 为 `https://example.com/demo.php`，probe 失败，最终文件名为 `demo.png`
- URL 完全没有可用 basename，probe 失败，最终文件名为 `image.png`

### 9.2 探测阶段的职责边界

探测阶段不得做以下事情：

- 不得判定“资源一定不是图片”并提前中止 `另存为`
- 不得读取完整响应体
- 不得把错误抛给 UI 作为另存为失败

真正的失败语义仍由实际下载阶段决定，例如：

- 资源不是图片
- 资源体积过大
- 下载超时
- 写盘失败

## 10. 模块职责建议

建议把远程图片默认文件名相关能力拆成以下函数：

- `deriveRemoteFileNameFromUrl(remoteUrl)`
- `isReliableRemoteImageFileName(fileName)`
- `probeRemoteResourceMetadata(remoteUrl, { timeoutMs })`
- `parseContentDispositionFileName(headerValue)`
- `buildRemoteSaveFileName({ urlFileName, headerFileName, contentType })`
- `resolveRemoteImageSaveSource(payload)`

职责边界如下：

- URL 解析函数只负责 basename 提取和清洗
- 探测函数只负责发起单次 `HEAD` 并返回头信息
- 合并函数只负责文件名与扩展名裁决
- `resolveRemoteImageSaveSource()` 负责编排，不直接读完整响应体

## 11. 测试策略

建议至少补齐以下 Electron 单测：

1. URL 已是可靠图片名时，不应发起探测请求
2. URL 无扩展名时，`HEAD` 返回 `Content-Type: image/avif`，默认文件名应补 `.avif`
3. URL 扩展名可疑时，应触发头探测并按响应头修正
4. `HEAD` 返回 `405`、`403` 或超时时，应继续按统一合并规则产出确定文件名，例如 `demo.png` 或 `image.png`
5. `Content-Disposition` 提供文件名时，应优先于 URL basename
6. `filename*=` 与 `filename=` 同时存在时，应优先使用 `filename*=`
7. `.JPG`、`.JPEG` 等大小写扩展名应视为可靠图片后缀，不应误触发 probe
8. `HEAD` 只给 basename 不给扩展名时，应按“头信息 + URL + 默认扩展名”合并，不再发起第二次请求
9. probe 期间若 active session 切换，不得继续弹框，应返回 `stale-document-context`
10. 用户取消保存时，不应进入实际内容下载
11. 头探测请求必须显式使用 `method: 'HEAD'`
12. 头探测阶段不得调用 `arrayBuffer()`、`blob()`、`text()`，也不得访问或消费 `response.body`
13. 探测超时时，不应让 `saveAs()` 结构化失败
14. probe 失败但 URL 仍有 basename 时，应补默认扩展名而不是直接退化为 `image.png`

## 12. 实施约束

1. 远程图片默认文件名探测只属于 `save-as`，不扩散到 `copy-image`。
2. 不新增新的 IPC 命令或 renderer 侧网络能力。
3. 不修改 `fetchRemoteImageBuffer()` 的超时和体积裁决语义。
4. 不把头探测失败当作用户可见错误。
5. 禁止在弹框前发起任何 `GET` 内容请求。
6. 现有“远程取消时不应提前下载内容”的测试语义需要相应调整为：允许 `HEAD probe`，但禁止实际内容下载。

## 13. 计划入口

后续实现计划可按以下顺序推进：

1. 重构远程默认文件名推导函数，拆出 URL 解析与文件名可靠性判断
2. 增加头探测与 `Content-Disposition` 解析能力
3. 调整 `resolveRemoteImageSaveSource(payload)` 编排逻辑
4. 补齐单测，验证“不可靠 URL 才探测”与“探测失败静默回退”两条主约束
