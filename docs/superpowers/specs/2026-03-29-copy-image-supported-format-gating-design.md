# copy-image 支持格式收口设计

## 背景

当前预览区右键菜单只要识别为 `image` 资源，就会显示“复制图片”。但主进程复制实现实际依赖 `nativeImage.createFromBuffer()`，在当前 Electron 跨平台稳定能力下，只能把 PNG / JPEG 视为可承诺支持的格式。这样会导致 WebP、AVIF、SVG、GIF、BMP 或无扩展名远程图片仍显示“复制图片”入口，但点击后高概率失败，形成错误能力承诺。

## 目标

收口 `copy-image` 的能力矩阵，使 UI 暴露能力与主进程可稳定支持的能力一致：

- 菜单层仅对可稳定支持复制的图片格式显示“复制图片”
- 主进程对 `document.resource.copy-image` 再做一次防御式格式校验
- `save-as` 保持现状，不受 `copy-image` 能力矩阵影响

## 非目标

- 不引入 `sharp`、`canvas` 等新依赖
- 不新增现代图片格式转码为 PNG 的链路
- 不调整 `save-as` 的默认文件名 probe、下载和写文件逻辑
- 不把右键菜单改为异步能力查询

## 设计方案

### 1. 菜单显示策略

Renderer 仍保持同步纯函数拼装菜单，但“复制图片”不再只依赖 `assetType === 'image'`。改为：

- 先要求 `assetType === 'image'`
- 再从 `asset.rawPath`、`asset.rawSrc`、`asset.resourceUrl` 中推导扩展名
- 仅当扩展名属于 `.png`、`.jpg`、`.jpeg` 时显示 `resource.copy-image`
- `resource.save-as` 仍然对所有图片资源显示

这样可以保证：

- `.png` / `.jpg` / `.jpeg` 保持现有体验
- `.webp` / `.avif` / `.svg` / `.gif` / `.bmp` 等图片仍可另存为，但不再虚假暴露“复制图片”
- 无扩展名远程地址默认视为不支持复制图片，避免在菜单层做额外网络探测

### 2. 主进程兜底策略

`documentResourceService.copyImage()` 在真正读文件或下载远程内容前，新增一次格式校验：

- 本地资源：优先以解析后的本地文件路径扩展名为准
- 远程资源：以 `rawSrc/resourceUrl` 的 URL 路径扩展名为准
- 若扩展名不在支持集合内，直接返回结构化失败 `copy-image-format-unsupported`

这样可以避免：

- Renderer 与 runtime 判断漂移时，仍误执行不支持格式
- IPC 被直接调用时绕过 UI 限制
- 继续下载远程 WebP / AVIF 后才在 `nativeImage` 解码处失败

### 3. 用户提示

新增统一提示文案：

- 中文：当前图片格式暂不支持复制图片，请使用 PNG 或 JPEG，或改用另存为。
- 英文：This image format is not supported for copy image yet. Use PNG/JPEG or Save As instead.

这条文案比“不是图片”或泛化的“复制失败”更准确。

## 测试策略

### Web

更新 `previewContextMenuActionUtil.test.js`：

- PNG / JPEG 图片仍显示 `copy-image`
- WebP / AVIF / SVG / 无扩展名远程图片不显示 `copy-image`
- `save-as` 对图片资源仍保留

### Electron

更新 `documentResourceService.test.js`：

- 本地 PNG / JPEG 仍可复制
- 本地 WebP 直接返回 `copy-image-format-unsupported`，且不读文件、不写剪贴板
- 远程 WebP 直接返回 `copy-image-format-unsupported`，且不发起下载
- 不支持格式场景下仍保留 stale-context 和既有结构化失败风格

## 风险与取舍

- 该方案会让一部分过去“能看到但点了失败”的入口直接消失，这是预期修正，不是能力回退。
- 无扩展名但实际是 PNG/JPEG 的远程图片会被保守隐藏“复制图片”，这是为了保持菜单同步和无网络探测的设计约束。
- 若后续产品要求支持 WebP / AVIF / SVG / GIF 的复制，应另开 feature，走显式转码方案，而不是在当前分支继续扩大 `nativeImage` 的假定能力。
