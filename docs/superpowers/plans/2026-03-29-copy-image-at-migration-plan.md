# Copy Image At Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将预览区 `copy-image` 从“主进程重新读取原始图片字节并写剪贴板”迁移为 `webContents.copyImageAt(x, y)`，让复制语义与 Chromium 预览一致，同时保留现有的会话上下文防串窗保护与结构化错误提示。

**Architecture:** Renderer 继续负责捕获资源上下文，但 `copy-image` 不再把资源 URL 当作“需要再次下载/解码”的输入，而是把右键命中的图片坐标当作“当前渲染结果的复制目标”。执行时先关闭自定义菜单、等待一帧、在 renderer 内用 `elementFromPoint()` 复判命中点仍然落在同一张图片上，再把 `copyTarget` 发给 runtime；runtime 只做会话新鲜度、窗口可用性和坐标合法性校验，然后委托 `BrowserWindow.webContents.copyImageAt()`。`save-as` 继续沿用现有文件 / 下载链路，不与 `copy-image` 共用底层实现。

**Tech Stack:** Vue 3、Electron 39、Pinia document-session、Ant Design Vue、node:test、Vitest

---

## 文件结构与职责

- 创建：`wj-markdown-editor-web/src/util/editor/previewAssetCopyImageActionUtil.js`
  - 负责 renderer 侧的复制目标准备：关闭菜单后的下一帧再命中复判、坐标归一化、复制 payload 组装。
- 创建：`wj-markdown-editor-web/src/util/editor/__tests__/previewAssetCopyImageActionUtil.test.js`
  - 覆盖 renderer 复判逻辑，避免菜单浮层、滚动和 DOM 变更导致 silent no-op。
- 修改：`wj-markdown-editor-web/src/views/EditorView.vue`
  - 编辑页 `copy-image` 动作接入新 helper，发送 `copyTarget`，并处理新的结构化失败原因。
- 修改：`wj-markdown-editor-web/src/views/PreviewView.vue`
  - 纯预览页与编辑页保持同一条 `copy-image` 流程，避免双实现漂移。
- 修改：`wj-markdown-editor-web/src/util/editor/previewContextMenuActionUtil.js`
  - 移除按扩展名收口 `copy-image` 的逻辑，改为只要 `assetType === 'image'` 就展示复制图片。
- 修改：`wj-markdown-editor-web/src/util/editor/__tests__/previewContextMenuActionUtil.test.js`
  - 把“WebP / SVG 不显示复制图片”改成“所有图片都显示复制图片”。
- 修改：`wj-markdown-editor-web/src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js`
  - 断言编辑页 `document.resource.copy-image` payload 带有 `copyTarget`。
- 修改：`wj-markdown-editor-web/src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js`
  - 断言纯预览页 `document.resource.copy-image` payload 带有 `copyTarget`。
- 修改：`wj-markdown-editor-web/src/i18n/zhCN.js`
  - 新增 `copy-image` 命中点失效、宿主窗口不可用等新文案，删除不再需要的“格式不支持复制图片”文案。
- 修改：`wj-markdown-editor-web/src/i18n/enUS.js`
  - 与中文文案同步。
- 修改：`wj-markdown-editor-web/src/i18n/__tests__/message.test.js`
  - 更新 message key 覆盖面。
- 修改：`wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js`
  - 为资源服务注入 `resolveWindowById`，让 `documentResourceService` 能拿到真实 `BrowserWindow` / `webContents`。
- 修改：`wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
  - `copyImage` 改走 `copyImageAt`；删除 `copy-image` 专属的扩展名白名单、本地读文件、远程下载和 `nativeImage.createFromBuffer()` 逻辑；保留 `save-as` 继续使用现有下载流程。
- 修改：`wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`
  - 把 `copy-image` 的成功 / 失败测试改成围绕 `copyTarget + webContents.copyImageAt()` 的契约。
- 修改：`wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
  - 断言 `document.resource.copy-image` 透传 `copyTarget` 并继续走 runtime 统一路由。

## 约束与明确取舍

- `copy-image` 不做静默回退到旧的 buffer 解码路径。
  - 原因：一旦回退，就会重新引入“预览能看、复制失败”和“业务层维护格式白名单”的旧问题。
- `save-as` 本次不迁移到 `copyImageAt`。
  - 原因：`save-as` 语义是保存原始文件，不是复制当前渲染帧。
- 本次不改变 `document.resource.copy-image` 的命令名。
  - 原因：Renderer / IPC / runtime 现有路由已经稳定，迁移应只替换能力模型，不额外改协议名。
- 继续保留 `requestContext` / stale 检查。
  - 原因：坐标复制同样可能发生在窗口切到另一篇文档之后，必须阻止串文档复制。

## 异常矩阵

| 场景 | 处理策略 | 结果 |
| --- | --- | --- |
| 右键菜单浮层遮住原图片 | renderer 先关闭菜单，再等待一帧后执行复判 | 避免 `copyImageAt()` 命中菜单浮层 |
| 用户打开菜单后滚动 / resize / DOM 重渲染 | renderer 用 `elementFromPoint(x, y)` 复判同一资源签名；不一致则拒绝发送 IPC | 返回 `copy-image-target-unavailable` |
| 坐标缺失、非数字、超出视口 | renderer 先拦截；main 再次校验 | 返回 `invalid-copy-image-target` |
| 图片资源在预览里是坏图 / 尚未渲染完成 | renderer 复判无法命中对应图片，直接失败 | 返回 `copy-image-target-unavailable` |
| 菜单打开后文档切换 / keep-alive 页面失活 | 继续沿用 `previewAssetSessionController` 与 runtime stale 校验 | 返回 `stale-document-context` |
| `windowId` 对应窗口不存在 | runtime 拒绝执行 | 返回 `host-window-unavailable` |
| `BrowserWindow` 或 `webContents` 已销毁 | runtime 拒绝执行 | 返回 `host-window-unavailable` |
| `webContents.copyImageAt()` 抛异常 | runtime 结构化兜底 | 返回 `copy-image-failed` |
| 原图是 WebP / AVIF / SVG / GIF 等非 PNG/JPEG | 不再按扩展名拦截；能渲染就允许复制 | 复制当前 Chromium 解码/渲染结果 |
| 远程图受 cookie / 代理 / 登录态控制 | 不再重新下载；直接基于当前渲染结果复制 | 预览与复制共享同一 Chromium 会话语义 |
| 动图 | 明确保留 Chromium 语义 | 复制当前可命中的静态帧，不承诺保留原始动图文件 |
| 缩放 / 高 DPI | 先保持使用 `MouseEvent.clientX/clientY` 直接透传 | 通过手测矩阵验证，不在首版引入额外坐标换算 |

## 需要新增的结构化失败原因

- `invalid-copy-image-target`
  - 含义：renderer 传来的 `copyTarget` 不完整，或 main 复判后发现坐标不是有限整数。
- `copy-image-target-unavailable`
  - 含义：关闭菜单后的下一帧，页面上已经无法在该坐标命中同一张图片。
- `host-window-unavailable`
  - 含义：当前 `windowId` 取不到可用 `BrowserWindow` / `webContents`，或宿主已销毁。

## Task 1: Renderer 侧复制目标契约与命中复判

**Files:**
- Create: `wj-markdown-editor-web/src/util/editor/previewAssetCopyImageActionUtil.js`
- Test: `wj-markdown-editor-web/src/util/editor/__tests__/previewAssetCopyImageActionUtil.test.js`
- Modify: `wj-markdown-editor-web/src/views/EditorView.vue`
- Modify: `wj-markdown-editor-web/src/views/PreviewView.vue`
- Modify: `wj-markdown-editor-web/src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js`

- [ ] **Step 1: 先写 renderer 复判与 payload 的失败用例**

```js
test('preparePreviewAssetCopyImagePayload 在下一帧无法命中同一资源时，返回 copy-image-target-unavailable', async () => {
  const result = await preparePreviewAssetCopyImagePayload({
    asset: {
      assetType: 'image',
      resourceUrl: 'https://example.com/demo.webp',
      rawSrc: 'https://example.com/demo.webp',
    },
    menuPosition: { x: 180, y: 260 },
    resolveElementFromPoint: () => null,
  })

  assert.deepEqual(result, {
    ok: false,
    reason: 'copy-image-target-unavailable',
  })
})
```

- [ ] **Step 2: 给两个页面宿主测试补上 `copyTarget` 断言**

```js
expect(channelSend).toHaveBeenCalledWith(expect.objectContaining({
  event: 'document.resource.copy-image',
  data: expect.objectContaining({
    copyTarget: { x: 188, y: 288 },
  }),
}))
```

- [ ] **Step 3: 运行 web 侧失败用例，确认新契约尚未实现**

Run in `wj-markdown-editor-web/`:

```bash
npm run test:node -- src/util/editor/__tests__/previewAssetCopyImageActionUtil.test.js
npm run test:component:run -- src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js
```

Expected: 新增断言失败，提示缺少 `copyTarget` 或缺少 helper。

- [ ] **Step 4: 实现 renderer 侧 helper，只负责“菜单关闭后准备复制目标”**

```js
export async function preparePreviewAssetCopyImagePayload(options = {}) {
  await options.closeMenu?.()
  await options.waitForNextFrame?.()

  const x = normalizeClientCoordinate(options.menuPosition?.x)
  const y = normalizeClientCoordinate(options.menuPosition?.y)
  if (x === null || y === null) {
    return { ok: false, reason: 'invalid-copy-image-target' }
  }

  const hitElement = options.resolveElementFromPoint?.(x, y) || null
  if (matchPreviewImageResource(hitElement, options.asset) !== true) {
    return { ok: false, reason: 'copy-image-target-unavailable' }
  }

  return {
    ok: true,
    payload: {
      ...options.basePayload,
      copyTarget: { x, y },
    },
  }
}
```

- [ ] **Step 5: 在 `EditorView.vue` / `PreviewView.vue` 中改造 `copyPreviewAssetImage()`**

```js
const prepared = await preparePreviewAssetCopyImagePayload({
  asset: actionTarget.assetInfo,
  menuPosition: previewAssetMenu.value,
  basePayload: createPreviewAssetRuntimePayload(actionTarget),
  closeMenu: async () => closePreviewAssetMenu(),
  waitForNextFrame: () => new Promise(resolve => requestAnimationFrame(() => resolve())),
  resolveElementFromPoint: (x, y) => document.elementFromPoint(x, y),
})
```

- [ ] **Step 6: 为 renderer 的本地失败结果补统一提示**

```js
showPreviewAssetActionFailure({
  ok: false,
  reason: prepared.reason,
  messageKey: 'message.previewAssetCopyImageTargetUnavailable',
})
```

- [ ] **Step 7: 重新运行 web 测试，确认页面侧契约收口**

Run in `wj-markdown-editor-web/`:

```bash
npm run test:node -- src/util/editor/__tests__/previewAssetCopyImageActionUtil.test.js
npm run test:component:run -- src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js
```

Expected: PASS

- [ ] **Step 8: 提交这一批 renderer 契约改动**

```bash
git add wj-markdown-editor-web/src/util/editor/previewAssetCopyImageActionUtil.js wj-markdown-editor-web/src/util/editor/__tests__/previewAssetCopyImageActionUtil.test.js wj-markdown-editor-web/src/views/EditorView.vue wj-markdown-editor-web/src/views/PreviewView.vue wj-markdown-editor-web/src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js wj-markdown-editor-web/src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js
git commit -m "refactor(web): prepare preview copy-image target before ipc"
```

## Task 2: Electron 资源服务切换到 `webContents.copyImageAt`

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
- Test: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`

- [ ] **Step 1: 先写 main 侧 `copyImageAt` 成功与失败用例**

```js
it('document.resource.copy-image 对远程 webp 图片应直接走 webContents.copyImageAt，且不再下载', async () => {
  const result = await service.copyImage({
    windowId,
    payload: {
      sourceType: 'remote',
      resourceUrl: 'https://example.com/demo.webp',
      rawSrc: 'https://example.com/demo.webp',
      copyTarget: { x: 180, y: 260 },
      requestContext: { sessionId: session.sessionId, documentPath: session.documentSource.path },
    },
  })

  expect(result).toEqual({ ok: true, reason: 'copied' })
  expect(fetchImpl).not.toHaveBeenCalled()
  expect(fsModule.readFile).not.toHaveBeenCalled()
  expect(nativeImageApi.createFromBuffer).not.toHaveBeenCalled()
  expect(window.webContents.copyImageAt).toHaveBeenCalledWith(180, 260)
})
```

- [ ] **Step 2: 补齐异常用例**

```js
it('document.resource.copy-image 在 copyTarget 缺失时应返回 invalid-copy-image-target', async () => {})
it('document.resource.copy-image 在窗口已销毁时应返回 host-window-unavailable', async () => {})
it('document.resource.copy-image 在执行期间 session 已切换时应返回 stale-document-context', async () => {})
it('document.resource.copy-image 在 webContents.copyImageAt 抛错时应返回 copy-image-failed', async () => {})
```

- [ ] **Step 3: 运行 electron 侧失败用例**

Run in `wj-markdown-editor-electron/`:

```bash
npm run test:run -- src/util/document-session/__tests__/documentResourceService.test.js
```

Expected: FAIL，旧实现仍在读文件 / 下载 / `nativeImage.createFromBuffer()`。

- [ ] **Step 4: 给资源服务注入窗口解析能力**

```js
const resourceService = createDocumentResourceService({
  store,
  showItemInFolder,
  dialogApi,
  clipboardApi,
  nativeImageApi,
  fsModule,
  fetchImpl,
  resolveWindowById: windowId => registry?.getWindowById?.(windowId) || null,
})
```

- [ ] **Step 5: 在 `documentResourceService.copyImage()` 中改成坐标复制**

```js
function normalizeResourcePayload(payload) {
  return {
    // ...已有字段
    copyTarget: payload?.copyTarget && typeof payload.copyTarget === 'object'
      ? {
          x: payload.copyTarget.x,
          y: payload.copyTarget.y,
        }
      : null,
  }
}

function normalizeCopyImageTarget(payload) {
  const x = Number.isFinite(payload?.copyTarget?.x) ? Math.trunc(payload.copyTarget.x) : null
  const y = Number.isFinite(payload?.copyTarget?.y) ? Math.trunc(payload.copyTarget.y) : null
  return x === null || y === null ? null : { x, y }
}

async function copyImage({ windowId, payload }) {
  const actionContext = getFreshActionContext(windowId, payload, () => ({ ok: false, reason: 'stale-document-context' }))
  if (actionContext.error) {
    return actionContext.error
  }

  const runtimeSourceType = resolveRuntimeSourceType(actionContext.normalizedPayload)
  if (!runtimeSourceType
    || (actionContext.normalizedPayload.sourceType
      && actionContext.normalizedPayload.sourceType !== runtimeSourceType)) {
    return createBinaryActionFailureResult('source-type-mismatch')
  }

  const copyTarget = normalizeCopyImageTarget(actionContext.normalizedPayload)
  if (!copyTarget) {
    return createBinaryActionFailureResult('invalid-copy-image-target')
  }

  const win = resolveWindowById?.(windowId) || null
  const webContents = win?.webContents
  if (!win || win.isDestroyed?.() === true || !webContents || webContents.isDestroyed?.() === true) {
    return createBinaryActionFailureResult('host-window-unavailable')
  }

  const staleActionError = getStaleActionError(windowId, actionContext.capturedActionContext, () => createBinaryActionFailureResult('stale-document-context'))
  if (staleActionError) {
    return staleActionError
  }

  webContents.copyImageAt(copyTarget.x, copyTarget.y)
  return { ok: true, reason: 'copied' }
}
```

- [ ] **Step 6: 删除 `copy-image` 已不再需要的旧实现分支**

```js
// 删除：COPY_IMAGE_SUPPORTED_EXTENSION_SET
// 删除：deriveCopyImageExtension / isCopyImageFormatSupported
// 删除：readResolvedLocalImageBuffer
// 删除：createNativeImageFromBuffer
// 保留：fetchRemoteImageBuffer（仅供 save-as 使用）
```

- [ ] **Step 7: 重新运行 electron 资源测试**

Run in `wj-markdown-editor-electron/`:

```bash
npm run test:run -- src/util/document-session/__tests__/documentResourceService.test.js
```

Expected: PASS

- [ ] **Step 8: 提交 runtime 切换改动**

```bash
git add wj-markdown-editor-electron/src/util/document-session/documentSessionRuntimeComposition.js wj-markdown-editor-electron/src/util/document-session/documentResourceService.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js
git commit -m "refactor(electron): switch preview copy-image to copyImageAt"
```

## Task 3: 清理菜单能力收口与 message 契约

**Files:**
- Modify: `wj-markdown-editor-web/src/util/editor/previewContextMenuActionUtil.js`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/previewContextMenuActionUtil.test.js`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/i18n/__tests__/message.test.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`

- [ ] **Step 1: 先写“所有图片都显示复制图片”的失败测试**

```js
test('remote webp 图片也应显示 resource.copy-image', () => {
  const items = buildPreviewContextMenuItems({
    context: {
      type: 'resource',
      asset: {
        assetType: 'image',
        sourceType: 'remote',
        rawSrc: 'https://example.com/demo.webp',
        resourceUrl: 'https://example.com/demo.webp',
      },
    },
    profile: 'editor-preview',
  })

  assert.equal(items.some(item => item.key === 'resource.copy-image'), true)
})
```

- [ ] **Step 2: 给 i18n 测试换成新的 message key**

```js
assert.ok(zhCN.message.previewAssetCopyImageTargetUnavailable)
assert.ok(zhCN.message.previewAssetHostWindowUnavailable)
assert.equal(zhCN.message.previewAssetCopyImageFormatUnsupported, undefined)
```

- [ ] **Step 3: 运行 web 侧 node:test 失败用例**

Run in `wj-markdown-editor-web/`:

```bash
npm run test:node -- src/util/editor/__tests__/previewContextMenuActionUtil.test.js src/i18n/__tests__/message.test.js
```

Expected: FAIL，旧白名单仍阻止 WebP / SVG 展示复制图片。

- [ ] **Step 4: 移除 renderer 菜单扩展名白名单**

```js
function isCopyImageSupportedAsset(asset) {
  return asset?.assetType === 'image'
}
```

- [ ] **Step 5: 清理旧文案并新增新失败文案**

```js
message: {
  previewAssetCopyImageTargetUnavailable: '当前图片位置已变化，请重新右键后再试。',
  previewAssetHostWindowUnavailable: '当前窗口已不可用，无法复制图片，请重试。',
}
```

- [ ] **Step 6: 更新 IPC 透传测试，明确 `copyTarget` 不能在 IPC 层被吞掉**

```js
expect(runtimeExecuteUiCommand).toHaveBeenCalledWith(1, 'document.resource.copy-image', {
  resourceUrl: 'wj://...',
  copyTarget: { x: 188, y: 288 },
})
```

- [ ] **Step 7: 重新运行 web + electron 相关测试**

Run in `wj-markdown-editor-web/`:

```bash
npm run test:node -- src/util/editor/__tests__/previewContextMenuActionUtil.test.js src/i18n/__tests__/message.test.js
```

Run in `wj-markdown-editor-electron/`:

```bash
npm run test:run -- src/util/channel/ipcMainUtil.test.js
```

Expected: PASS

- [ ] **Step 8: 提交菜单与文案契约清理**

```bash
git add wj-markdown-editor-web/src/util/editor/previewContextMenuActionUtil.js wj-markdown-editor-web/src/util/editor/__tests__/previewContextMenuActionUtil.test.js wj-markdown-editor-web/src/i18n/zhCN.js wj-markdown-editor-web/src/i18n/enUS.js wj-markdown-editor-web/src/i18n/__tests__/message.test.js wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js
git commit -m "refactor(copy-image): align menu and message contract with copyImageAt"
```

## Task 4: 集成验证与手测矩阵

**Files:**
- Modify: `docs/superpowers/plans/2026-03-29-copy-image-at-migration-plan.md`

- [ ] **Step 1: 运行最小回归测试集**

Run in `wj-markdown-editor-web/`:

```bash
npm run test:node -- src/util/editor/__tests__/previewAssetCopyImageActionUtil.test.js src/util/editor/__tests__/previewContextMenuActionUtil.test.js src/i18n/__tests__/message.test.js
npm run test:component:run -- src/views/__tests__/editorViewPreviewResourceMenuHost.vitest.test.js src/views/__tests__/previewViewPreviewResourceMenuHost.vitest.test.js
```

Run in `wj-markdown-editor-electron/`:

```bash
npm run test:run -- src/util/document-session/__tests__/documentResourceService.test.js src/util/channel/ipcMainUtil.test.js
```

Expected: PASS

- [ ] **Step 2: 做桌面手测矩阵**

```text
1. 编辑页本地 PNG / JPEG / WebP / SVG 右键复制图片，粘贴到画图或 IM。
2. 纯预览页远程 PNG / WebP / SVG 右键复制图片，验证不再触发额外下载失败。
3. 打开菜单后滚动页面，再点“复制图片”，应提示“图片位置已变化”而不是静默成功。
4. 打开菜单后切换到另一篇文档，再点“复制图片”，应返回 stale-document-context。
5. 打开菜单后关闭窗口，再触发动作，不应抛未捕获异常。
6. Windows 125% / 150% 缩放下验证坐标命中是否仍准确。
```

- [ ] **Step 3: 若高 DPI 命中偏移，补一次小范围坐标修正设计**

```text
仅在手测明确失败时，才增加坐标换算；不要在首版预先引入 devicePixelRatio 修正。
```

- [ ] **Step 4: 记录验证结果并提交**

```bash
git add docs/superpowers/plans/2026-03-29-copy-image-at-migration-plan.md
git commit -m "docs: record copyImageAt migration verification notes"
```

## 实施完成判定

- `copy-image` 不再依赖扩展名白名单。
- `copy-image` 不再读取本地文件、下载远程图片、也不再调用 `nativeImage.createFromBuffer()`。
- `save-as` 仍保持原始文件/下载语义，测试不回退。
- 右键菜单关闭后再复制，不会命中自定义菜单浮层。
- 页面滚动、DOM 变化、会话切换、窗口销毁等异常都有结构化失败结果。
- 手测确认 WebP / SVG 等 Chromium 可渲染图片可复制，认证态远程图不再因主进程重新请求而失败。
