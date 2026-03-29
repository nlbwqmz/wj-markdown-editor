# 预览资源右键菜单复制与图片导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有预览资源右键链路的前提下，为本地/网络资源补齐复制绝对路径、复制链接、复制图片、图片另存为、复制 Markdown 引用，并保持编辑页与纯预览页的权限边界、异常处理和 runtime 裁决一致。

**Architecture:** 继续沿用 `MarkdownPreview -> buildPreviewContextMenuItems -> EditorView/PreviewView -> documentSessionRuntime -> documentResourceService` 主线，不新建旁路菜单体系。菜单层只返回 `resource.*` action key，宿主视图负责把非纯文本动作映射成 `document.resource.*` 命令，Electron 端统一复判 `sourceType`、本地路径解析和网络图片 IO，所有异常都以结构化结果回到宿主。`resource.copy-markdown-reference` 保持 renderer 直写文本剪贴板的唯一例外。

**Tech Stack:** Vue 3 `<script setup>`、Ant Design Vue、vue-i18n、Electron 39、`node:test`、Vitest、`fs-extra`、Electron `clipboard` / `nativeImage` / `dialog`。

---

## 文件结构与责任

**Web 端**

- 修改 `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
  负责从 DOM 元信息提取 `assetType`、`rawSrc`、`rawPath`、`markdownReference`，并继续抛出统一 `preview-contextmenu` 事件。
- 修改 `wj-markdown-editor-web/src/components/editor/__tests__/markdownPreviewContextMenuBinding.test.js`
  负责锁定 `MarkdownPreview` 的事件契约与上下文字段来源。
- 修改 `wj-markdown-editor-web/src/util/editor/previewResourceContextUtil.js`
  负责统一归一化 `assetType` / `sourceType` / `markdownReference`，并在 `sourceType` 不稳定时 fail-closed 返回 `null`。
- 修改 `wj-markdown-editor-web/src/util/editor/__tests__/previewResourceContextUtil.test.js`
  负责覆盖本地/远程/未知资源与 `markdownReference` 隐藏条件。
- 修改 `wj-markdown-editor-web/src/util/editor/previewContextMenuActionUtil.js`
  负责根据 `context + profile + t` 生成完整菜单矩阵，不掺入执行逻辑。
- 修改 `wj-markdown-editor-web/src/util/editor/__tests__/previewContextMenuActionUtil.test.js`
  负责覆盖图片/非图片、本地/远程、编辑页/纯预览页矩阵，以及 `markdownReference = null` 时隐藏菜单项。
- 修改 `wj-markdown-editor-web/src/views/EditorView.vue`
  负责编辑页资源菜单动作分发，保留删除链路，并新增复制路径、复制链接、复制图片、另存为、复制 Markdown 引用。
- 修改 `wj-markdown-editor-web/src/views/PreviewView.vue`
  负责纯预览页资源菜单动作分发，只保留非编辑动作。
- 修改 `wj-markdown-editor-web/src/views/__tests__/editorViewPreviewResourceMenuBinding.test.js`
  负责锁定编辑页 action key 分支和 runtime 命令映射结构。
- 修改 `wj-markdown-editor-web/src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js`
  负责真实宿主交互测试，验证请求 payload 与提示行为。
- 修改 `wj-markdown-editor-web/src/views/__tests__/previewViewPreviewResourceMenuBinding.test.js`
  负责锁定纯预览页不出现删除分支，并接入新增动作。
- 新建 `wj-markdown-editor-web/src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js`
  负责纯预览页真实宿主交互测试，验证新增动作与无删除边界。
- 修改 `wj-markdown-editor-web/src/i18n/zhCN.js`
  负责新增 `previewAssetMenu.*` 菜单文案与资源菜单专属失败提示。
- 修改 `wj-markdown-editor-web/src/i18n/enUS.js`
  负责英文对应文案。
- 修改 `wj-markdown-editor-web/src/i18n/__tests__/message.test.js`
  负责校验新增中英文文案键存在且语义一致。

**Electron 端**

- 修改 `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
  负责暴露新增 `document.resource.*` 命令，不在 IPC 层拼接桌面能力。
- 修改 `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
  负责验证新增命令继续经 runtime 统一入口。
- 修改 `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
  负责把新增资源命令纳入 `RESOURCE_COMMAND_SET` 并路由到资源服务。
- 修改 `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js`
  负责把资源服务需要的桌面依赖集中装配，保持组合根一致。
- 修改 `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js`
  负责验证组合根和 runtime 路由表更新。
- 修改 `wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js`
  负责兜住 runtime 初始化时对资源服务签名的更新。
- 修改 `wj-markdown-editor-electron/src/util/resourceFileUtil.js`
  负责统一本地资源解析优先级、冲突 fail-closed、同步 comparable key 与现有 open/delete/get-info 的统一行为。
- 修改 `wj-markdown-editor-electron/src/util/resourceFileUtil.test.js`
  负责覆盖 `rawPath` 优先、`documentPath = null` 相对路径拒绝、`rawPath` 与 `resourceUrl` 冲突、网络地址拒绝进入本地链路。
- 修改 `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
  负责新增复制绝对路径、复制链接、复制图片、图片另存为，并在 runtime 侧复判 `sourceType`。
- 修改 `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`
  负责覆盖文本返回、图片剪贴板写入、另存为取消、网络下载失败、非图片响应、上下文过期和类型不匹配。

## 任务 1：补齐预览资源上下文与 fail-closed 来源判定

**Files:**

- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- Modify: `wj-markdown-editor-web/src/components/editor/__tests__/markdownPreviewContextMenuBinding.test.js`
- Modify: `wj-markdown-editor-web/src/util/editor/previewResourceContextUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewResourceContextUtil.test.js`

- [ ] **Step 1: 先写失败测试，锁定上下文字段与 fail-closed 规则**

```js
assert.deepEqual(createPreviewResourceContext({
  assetType: 'image',
  rawSrc: './assets/demo.png',
  rawPath: './assets/demo.png',
  resourceUrl: 'wj://local/assets/demo.png',
  markdownReference: '![demo](./assets/demo.png)',
  clientX: 160,
  clientY: 240,
}), {
  type: 'resource',
  asset: {
    assetType: 'image',
    sourceType: 'local',
    rawSrc: './assets/demo.png',
    rawPath: './assets/demo.png',
    resourceUrl: 'wj://local/assets/demo.png',
    markdownReference: '![demo](./assets/demo.png)',
    occurrence: undefined,
    lineStart: undefined,
    lineEnd: undefined,
  },
  menuPosition: { x: 160, y: 240 },
})
```

- [ ] **Step 2: 跑失败测试，确认当前实现仍停留在 `kind` 字段和弱判定逻辑**

Run in `wj-markdown-editor-web`:

```bash
node --test src/components/editor/__tests__/markdownPreviewContextMenuBinding.test.js src/util/editor/__tests__/previewResourceContextUtil.test.js
```

Expected: `previewResourceContextUtil.test.js` 至少出现以下失败之一：

- 仍返回 `asset.kind`
- 缺少 `sourceType`
- 缺少 `markdownReference`
- 对无法稳定判定来源的资源没有返回 `null`

- [ ] **Step 3: 实现最小上下文归一化**

实现要求：

- `MarkdownPreview.vue` 从 DOM 的 `data-wj-resource-kind`、`data-wj-resource-src`、`data-wj-resource-raw`、原始 Markdown 引用元信息中提取字段。
- 组件内部允许继续使用 `kind` 作为过渡变量，但 `createPreviewResourceContext()` 的最终输出只能暴露 `assetType`。
- `createPreviewResourceContext()` 只接受稳定来源：
  - `wj://` 或稳定本地输入判定为 `local`
  - `http://` / `https://` 判定为 `remote`
  - 无法稳定判定时直接返回 `null`
- `markdownReference` 缺失时直接记为 `null`，不拼装最小引用。

- [ ] **Step 4: 重新跑测试，确认上下文结构稳定**

Run in `wj-markdown-editor-web`:

```bash
node --test src/components/editor/__tests__/markdownPreviewContextMenuBinding.test.js src/util/editor/__tests__/previewResourceContextUtil.test.js
```

Expected: PASS

- [ ] **Step 5: 提交这一轮上下文收口**

```bash
git add wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue wj-markdown-editor-web/src/components/editor/__tests__/markdownPreviewContextMenuBinding.test.js wj-markdown-editor-web/src/util/editor/previewResourceContextUtil.js wj-markdown-editor-web/src/util/editor/__tests__/previewResourceContextUtil.test.js
git commit -m "feat(web): normalize preview resource context"
```

## 任务 2：扩展菜单矩阵与国际化文案

**Files:**

- Modify: `wj-markdown-editor-web/src/util/editor/previewContextMenuActionUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewContextMenuActionUtil.test.js`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/i18n/__tests__/message.test.js`

- [ ] **Step 1: 先写失败测试，锁定菜单矩阵和文案键**

```js
assert.deepEqual(buildPreviewContextMenuItems({
  context: {
    type: 'resource',
    asset: {
      assetType: 'image',
      sourceType: 'remote',
      markdownReference: '![demo](https://example.com/demo.png)',
    },
  },
  profile: 'standalone-preview',
  t: key => `translated:${key}`,
}), [
  { key: 'resource.copy-link', label: 'translated:previewAssetMenu.copyImageLink', danger: false },
  { key: 'resource.copy-image', label: 'translated:previewAssetMenu.copyImage', danger: false },
  { key: 'resource.save-as', label: 'translated:previewAssetMenu.saveAs', danger: false },
  { key: 'resource.copy-markdown-reference', label: 'translated:previewAssetMenu.copyMarkdownReference', danger: false },
])
```

- [ ] **Step 2: 跑失败测试，确认当前菜单 util 只有打开目录和删除**

Run in `wj-markdown-editor-web`:

```bash
node --test src/util/editor/__tests__/previewContextMenuActionUtil.test.js src/i18n/__tests__/message.test.js
```

Expected: FAIL，缺少新增菜单矩阵或缺少 `previewAssetMenu.copyAbsolutePath` 等文案键。

- [ ] **Step 3: 实现最小菜单矩阵**

实现要求：

- 保持 `buildPreviewContextMenuItems({ context, profile, t })` 这一签名不变。
- `assetType = unknown` 时按非图片资源兜底。
- `markdownReference = null` 时隐藏 `resource.copy-markdown-reference`。
- `resource.delete` 只在 `editor-preview` 出现。
- 网络图片不出现 `resource.open-in-folder`。
- 新增并复用以下文案策略：
  - 菜单标签走 `previewAssetMenu.*`
  - 通用反馈继续复用 `message.copySucceeded`、`message.copyFailed`、`message.saveAsSuccessfully` 等现有 key

- [ ] **Step 4: 重新跑测试，确认矩阵与中英文文案通过**

Run in `wj-markdown-editor-web`:

```bash
node --test src/util/editor/__tests__/previewContextMenuActionUtil.test.js src/i18n/__tests__/message.test.js
```

Expected: PASS

- [ ] **Step 5: 提交菜单矩阵与文案**

```bash
git add wj-markdown-editor-web/src/util/editor/previewContextMenuActionUtil.js wj-markdown-editor-web/src/util/editor/__tests__/previewContextMenuActionUtil.test.js wj-markdown-editor-web/src/i18n/zhCN.js wj-markdown-editor-web/src/i18n/enUS.js wj-markdown-editor-web/src/i18n/__tests__/message.test.js
git commit -m "feat(web): add preview resource menu matrix"
```

## 任务 3：补齐编辑页与纯预览页宿主动作分发

**Files:**

- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`
- Modify: `wj-markdown-editor-web/src/views/__tests__/editorViewPreviewResourceMenuBinding.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/previewViewPreviewResourceMenuBinding.test.js`
- Create: `wj-markdown-editor-web/src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js`

- [ ] **Step 1: 先写失败测试，锁定动作映射与纯预览页边界**

```js
expect(channelSend).toHaveBeenCalledWith({
  event: 'document.resource.copy-image',
  data: {
    sourceType: 'remote',
    resourceUrl: 'https://cdn.example.com/demo.png',
    rawSrc: 'https://cdn.example.com/demo.png',
    rawPath: null,
    requestContext: {
      sessionId: 'session-preview-menu',
      documentPath: 'D:/docs/demo.md',
    },
  },
})
```

还要锁定以下行为：

- 编辑页 `resource.delete` 仍走旧删除链路。
- `resource.copy-markdown-reference` 直接 `navigator.clipboard.writeText(markdownReference)`，不经过 runtime。
- `PreviewView.vue` 不出现删除分支，也不发送 `document.resource.delete-local`。
- 文本复制动作在 runtime 成功后才写文本剪贴板；图片复制由 runtime 直接写系统剪贴板。
- `save-as` 取消态静默结束，不提示错误。

- [ ] **Step 2: 跑失败测试，确认宿主层尚未识别新增 action key**

Run in `wj-markdown-editor-web`:

```bash
npx vitest run src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js
node --test src/views/__tests__/editorViewPreviewResourceMenuBinding.test.js src/views/__tests__/previewViewPreviewResourceMenuBinding.test.js
```

Expected: FAIL，至少会出现“未发送新增 runtime 命令”或“纯预览页断言缺少新增分支”。

- [ ] **Step 3: 实现最小宿主动作分发**

实现要求：

- `EditorView.vue` / `PreviewView.vue` 基于冻结的 `actionContext` 继续调用 `previewAssetSessionController.createRequestContext(actionContext)`。
- 动作映射保持分层：
  - `resource.copy-absolute-path` -> `document.resource.copy-absolute-path`
  - `resource.copy-link` -> `document.resource.copy-link`
  - `resource.copy-image` -> `document.resource.copy-image`
  - `resource.save-as` -> `document.resource.save-as`
  - `resource.open-in-folder` -> `document.resource.open-in-folder`
  - `resource.delete` -> `document.resource.delete-local`
  - `resource.copy-markdown-reference` -> renderer 直写文本剪贴板
- runtime 返回 `{ ok: true, text }` 的动作，由宿主负责写文本剪贴板并显示 `message.copySucceeded` / `message.copyFailed`。
- runtime 返回 `{ ok: true }` 的图片复制动作，只负责显示结果，不再重复写文本剪贴板。
- `cancelled: true` 的另存为结果直接结束，不弹失败提示。

- [ ] **Step 4: 重新跑宿主测试，确认视图层接线稳定**

Run in `wj-markdown-editor-web`:

```bash
npx vitest run src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js
node --test src/views/__tests__/editorViewPreviewResourceMenuBinding.test.js src/views/__tests__/previewViewPreviewResourceMenuBinding.test.js
```

Expected: PASS

- [ ] **Step 5: 提交宿主动作分发**

```bash
git add wj-markdown-editor-web/src/views/EditorView.vue wj-markdown-editor-web/src/views/PreviewView.vue wj-markdown-editor-web/src/views/__tests__/editorViewPreviewResourceMenuBinding.test.js wj-markdown-editor-web/src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js wj-markdown-editor-web/src/views/__tests__/previewViewPreviewResourceMenuBinding.test.js wj-markdown-editor-web/src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js
git commit -m "feat(web): route preview resource actions"
```

## 任务 4：扩展 IPC、runtime 与组合根命令契约

**Files:**

- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js`

- [ ] **Step 1: 先写失败测试，锁定新增 runtime 命令仍走统一入口**

```js
expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.resource.copy-absolute-path', {
  resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
  rawPath: './assets/demo.png',
  requestContext: {
    sessionId: 'resource-session',
    documentPath: 'D:\\docs\\note.md',
  },
})
```

还要补以下断言：

- `RESOURCE_COMMAND_SET` 包含 `document.resource.copy-absolute-path`、`document.resource.copy-link`、`document.resource.copy-image`、`document.resource.save-as`。
- `ipcMainUtil` 对新增命令不走旧 `windowLifecycleService.executeResourceCommand` 分支。
- `documentSessionRuntimeComposition` 继续集中创建 `resourceService`，而不是在 IPC 层散落依赖。

- [ ] **Step 2: 跑失败测试，确认命令表和 IPC handler 还没有这些分支**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js
```

Expected: FAIL，缺少新增资源命令路由或组合根参数不匹配。

- [ ] **Step 3: 实现最小命令路由与依赖装配**

实现要求：

- `ipcMainUtil.js` 新增直连入口，但仍只做 `executeRuntimeUiCommand(...)` 转发。
- `documentSessionRuntime.js` 统一把新增命令交给 `resourceService`，不回落到 `effectService.executeCommand`。
- `documentSessionRuntimeComposition.js` 统一注入资源服务需要的桌面依赖，保持测试可替换性。
- 若 `documentResourceService` 需要额外依赖签名，`windowLifecycleService.runtime-init.test.js` 同步锁定组合根契约。

- [ ] **Step 4: 重新跑命令契约测试**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js
```

Expected: PASS

- [ ] **Step 5: 提交 IPC 与 runtime 契约**

```bash
git add wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js
git commit -m "feat(electron): add preview resource runtime commands"
```

## 任务 5：统一本地资源解析与图片桌面能力

**Files:**

- Modify: `wj-markdown-editor-electron/src/util/resourceFileUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/resourceFileUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`

- [ ] **Step 1: 先写失败测试，锁定本地解析优先级、sourceType 复判和图片 IO 异常**

```js
expect(await service.copyAbsolutePath({
  windowId,
  payload: {
    resourceUrl: convertResourceUrl('./assets/demo.png'),
    rawPath: './assets/demo.png',
    requestContext: {
      sessionId: 'resource-session',
      documentPath: 'D:\\docs\\note.md',
    },
  },
})).toEqual({
  ok: true,
  text: 'D:\\docs\\assets\\demo.png',
})
```

必须补齐的失败用例：

- `rawPath` 和 `resourceUrl` 同时可解析但目标不一致时，返回固定冲突错误。
- `documentPath = null` 且 `rawPath` 为相对路径时，禁止回退 `resourceUrl`。
- `document.resource.copy-link` 只接受 runtime 复判为 `remote` 的 `rawSrc`。
- `document.resource.copy-image` 对网络非图片响应返回固定失败。
- `document.resource.save-as` 在用户取消时返回 `{ ok: false, cancelled: true, reason: 'cancelled' }`。
- 本地文件不存在时：
  - `copy-absolute-path` 仍返回路径文本
  - `copy-image` / `save-as` / `open-in-folder` 返回文件不存在

- [ ] **Step 2: 跑失败测试，确认当前实现只支持 open/delete/get-info**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/resourceFileUtil.test.js src/util/document-session/__tests__/documentResourceService.test.js
```

Expected: FAIL，缺少新 API、缺少冲突裁决或缺少网络图片处理。

- [ ] **Step 3: 实现最小解析与桌面能力**

实现要求：

- `resourceFileUtil.js`
  - 新增统一本地资源解析入口，优先 `rawPath + documentContext`，仅在 `rawPath` 不可参与解析时回退 `resourceUrl`。
  - 保持 `openLocalResourceInFolder`、`deleteLocalResource`、`getLocalResourceInfo`、`getLocalResourceComparableKey` 复用同一解析规则。
  - 冲突时 fail-closed，不做猜测性修复。
- `documentResourceService.js`
  - 新增 `copyAbsolutePath`、`copyLink`、`copyImage`、`saveAs`。
  - 用 active session + `requestContext` 做过期保护。
  - 对 `sourceType` 做 runtime 复判，和 renderer 不一致时拒绝执行。
  - 本地图片读取文件字节后转为 `nativeImage` 写入系统剪贴板。
  - 网络图片先验证响应状态与 `Content-Type`，再推导默认文件名和扩展名。
  - 另存为通过 `dialog.showSaveDialogSync` 或当前项目已统一的 dialog 注入打开保存对话框，取消时返回取消态。

- [ ] **Step 4: 重新跑资源服务测试**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/resourceFileUtil.test.js src/util/document-session/__tests__/documentResourceService.test.js
```

Expected: PASS

- [ ] **Step 5: 提交资源解析与图片能力**

```bash
git add wj-markdown-editor-electron/src/util/resourceFileUtil.js wj-markdown-editor-electron/src/util/resourceFileUtil.test.js wj-markdown-editor-electron/src/util/document-session/documentResourceService.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js
git commit -m "feat(electron): support preview resource copy and save"
```

## 任务 6：定向格式化与最终验证

**Files:**

- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
- Modify: `wj-markdown-editor-web/src/components/editor/__tests__/markdownPreviewContextMenuBinding.test.js`
- Modify: `wj-markdown-editor-web/src/util/editor/previewResourceContextUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewResourceContextUtil.test.js`
- Modify: `wj-markdown-editor-web/src/util/editor/previewContextMenuActionUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewContextMenuActionUtil.test.js`
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`
- Modify: `wj-markdown-editor-web/src/views/__tests__/editorViewPreviewResourceMenuBinding.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/previewViewPreviewResourceMenuBinding.test.js`
- Create: `wj-markdown-editor-web/src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/i18n/__tests__/message.test.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentSessionRuntime.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js`
- Modify: `wj-markdown-editor-electron/src/util/resourceFileUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/resourceFileUtil.test.js`

- [ ] **Step 1: 对修改文件执行定向 ESLint 修复**

Run in `wj-markdown-editor-web`:

```bash
npx eslint --fix src/components/editor/MarkdownPreview.vue src/components/editor/__tests__/markdownPreviewContextMenuBinding.test.js src/util/editor/previewResourceContextUtil.js src/util/editor/__tests__/previewResourceContextUtil.test.js src/util/editor/previewContextMenuActionUtil.js src/util/editor/__tests__/previewContextMenuActionUtil.test.js src/views/EditorView.vue src/views/PreviewView.vue src/views/__tests__/editorViewPreviewResourceMenuBinding.test.js src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js src/views/__tests__/previewViewPreviewResourceMenuBinding.test.js src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js src/i18n/zhCN.js src/i18n/enUS.js src/i18n/__tests__/message.test.js
```

Run in `wj-markdown-editor-electron`:

```bash
npx eslint --fix src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js src/util/document-session/documentSessionRuntime.js src/util/document-session/documentSessionRuntimeComposition.js src/util/document-session/documentResourceService.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/documentResourceService.test.js src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js src/util/resourceFileUtil.js src/util/resourceFileUtil.test.js
```

Expected: exit code `0`

- [ ] **Step 2: 跑 Web 端目标测试**

Run in `wj-markdown-editor-web`:

```bash
node --test src/components/editor/__tests__/markdownPreviewContextMenuBinding.test.js src/util/editor/__tests__/previewResourceContextUtil.test.js src/util/editor/__tests__/previewContextMenuActionUtil.test.js src/views/__tests__/editorViewPreviewResourceMenuBinding.test.js src/views/__tests__/previewViewPreviewResourceMenuBinding.test.js src/i18n/__tests__/message.test.js
npx vitest run src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js
```

Expected: PASS

- [ ] **Step 3: 跑 Electron 端目标测试**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/channel/ipcMainUtil.test.js src/util/document-session/__tests__/documentSessionRuntime.test.js src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js src/util/document-session/__tests__/documentResourceService.test.js src/util/resourceFileUtil.test.js
```

Expected: PASS

- [ ] **Step 4: 做一次人工回归清单**

人工验证项目：

- 本地图片右键：复制绝对路径、复制图片、另存为、打开所在目录、复制 Markdown 引用、删除。
- 网络图片右键：复制图片链接、复制图片、另存为、复制 Markdown 引用；没有“在浏览器打开”。
- 本地非图片右键：复制绝对路径、打开所在目录、复制 Markdown 引用；纯预览页无删除。
- 网络非图片右键：复制资源链接、复制 Markdown 引用；纯预览页无删除。
- 未保存文档中的相对本地图片：
  - 菜单仍可见
  - 执行期 `copy-image` / `save-as` / `open-in-folder` 走明确失败
- `rawPath` / `resourceUrl` 冲突时，所有本地动作都失败而不是猜测执行。

- [ ] **Step 5: 确认没有遗漏的未提交实现变更**

```bash
git status --short
```

Expected: 空输出；如果仍有为通过验证而补的实现文件改动，先补测试再单独提交，不把未验证的尾差留在工作区。

## 执行注意事项

- 所有代码注释必须使用中文。
- 不在 Web 端自行实现平台路径解析、网络下载写盘或原生图片剪贴板。
- `resource.copy-markdown-reference` 之外的所有资源动作都必须经 `document.resource.*`。
- 旧的 `document.resource.open-in-folder` / `document.resource.delete-local` 也必须复用新的本地解析规则；如果当前 payload 不足以满足统一规则，同步扩展其入参到可携带 `rawPath`。
- 任何新增失败原因都要优先保持结构化返回，再决定宿主提示，不要在中间层抛裸异常。
