# 远程图片另存为默认文件名探测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不恢复“弹框前下载远程图片内容”的前提下，为远程图片 `save-as` 增加单次 `HEAD` 探测能力，尽量修正默认文件名，同时保持现有 stale-context、取消态和真实下载链路不变。

**Architecture:** 实现只收口在 Electron `document-session` 层。新增一个聚焦远程文件名裁决的小 util，负责 URL 解析、`Content-Disposition` 解析、`Content-Type` 扩展名映射、可靠性判断和最终文件名组装；`documentResourceService.saveAs()` 只负责在 URL 文件名不可靠时发起单次 `HEAD` probe，并在 probe 前后继续执行现有 stale 校验，用户选定路径后仍复用 `fetchRemoteImageBuffer()` 做真实下载。

**Tech Stack:** Electron 39、Node `fetch`/`AbortController`、Vitest 4、`fs-extra`、ES Modules、现有 `document-session` 测试夹具。

---

## 文件结构与责任

- Create: `wj-markdown-editor-electron/src/util/document-session/remoteImageSaveFileNameUtil.js`
  负责远程图片默认文件名相关的纯函数与轻量 probe 帮助函数：
  - URL basename 解析
  - 文件名安全清洗与 Windows 保留名处理
  - 图片扩展名可靠性判断，大小写不敏感
  - `Content-Disposition` 的 `filename*` / `filename` 解析
  - `Content-Type` 到扩展名映射
  - `buildRemoteSaveFileName()` 唯一闭合入口
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js`
  负责锁定纯函数状态机，不把复杂的文件名裁决全塞进 `documentResourceService.test.js`。
- Modify: `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
  负责接入新 util，在远程 `save-as` 的“弹框前阶段”执行 URL 可靠性判断、单次 `HEAD` probe、probe 前后 stale 校验，并把最终 `defaultPath` 统一走 `buildRemoteSaveFileName()`。
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`
  负责锁定 `save-as` 的集成行为：
  - URL 可靠时不 probe
  - URL 不可靠时只发 `HEAD`
  - probe 超时/失败时静默回退
  - `Content-Disposition` 与 `Content-Type` 优先级
  - probe 期间 session 切换的 stale 保护
  - 用户取消时允许 `HEAD probe`，但仍不得实际下载内容

## 任务 1：先锁定远程文件名状态机的纯函数测试

**Files:**

- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js`

- [ ] **Step 1: 写第一批失败测试，覆盖 URL 可靠性与最终文件名闭合规则**

```js
it('buildRemoteSaveFileName 在 probe 失败但 URL 仍有 basename 时，应补默认扩展名', () => {
  expect(buildRemoteSaveFileName({
    urlFileName: 'demo.php',
    headerFileName: null,
    contentType: null,
  })).toBe('demo.png')
})

it('isReliableRemoteImageFileName 对大小写扩展名必须大小写不敏感', () => {
  expect(isReliableRemoteImageFileName('cover.JPG')).toBe(true)
  expect(isReliableRemoteImageFileName('cover.JPEG')).toBe(true)
})

it('buildRemoteSaveFileName 应清洗 Windows 非法文件名边界', () => {
  expect(buildRemoteSaveFileName({
    urlFileName: 'CON .JPG ',
    headerFileName: null,
    contentType: null,
  })).toBe('image.jpg')
})

it('buildRemoteSaveFileName 应去除尾随空格和点，并统一扩展名小写', () => {
  expect(buildRemoteSaveFileName({
    urlFileName: '封面 .PNG. ',
    headerFileName: null,
    contentType: null,
  })).toBe('封面.png')
})
```

- [ ] **Step 2: 跑测试，确认它们先失败**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js
```

Expected: FAIL，至少会出现模块不存在或导出函数不存在。

- [ ] **Step 3: 补第二批失败测试，锁定头字段优先级与解析边界**

```js
it('buildRemoteSaveFileName 应优先使用 header 文件名基础名，再用 content-type 补扩展名', () => {
  expect(buildRemoteSaveFileName({
    urlFileName: 'download',
    headerFileName: 'photo',
    contentType: 'image/avif',
  })).toBe('photo.avif')
})

it('parseContentDispositionFileName 应优先 filename*', () => {
  expect(parseContentDispositionFileName(
    "attachment; filename=plain.png; filename*=UTF-8''%E5%B0%81%E9%9D%A2.webp",
  )).toBe('封面.webp')
})

it('parseContentDispositionFileName 在坏编码输入下应静默返回 null', () => {
  expect(parseContentDispositionFileName(
    "attachment; filename*=UTF-8''%E5%B0%81%E9%9D%A2%E0%A4",
  )).toBe(null)
})
```

- [ ] **Step 4: 再跑测试，确认失败原因已经对准目标行为**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js
```

Expected: FAIL；在 util 模块尚未创建前，允许继续表现为“模块不存在 / 导出不存在”的红灯，这一阶段只要求先把行为预期钉死。

- [ ] **Step 5: 提交测试骨架**

```bash
git add wj-markdown-editor-electron/src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js
git commit -m "test(electron): cover remote image save-as filename rules"
```

## 任务 2：实现远程文件名 util，并把纯函数测试拉绿

**Files:**

- Create: `wj-markdown-editor-electron/src/util/document-session/remoteImageSaveFileNameUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js`

- [ ] **Step 1: 先实现最小纯函数集合**

```js
export function buildRemoteSaveFileName({
  urlFileName,
  headerFileName,
  contentType,
}) {
  // 只保留一个闭合入口：
  // 基础名优先 header -> url -> image
  // 扩展名优先 header 已知图片后缀 -> content-type -> url 已知图片后缀 -> .png
}
```

必须最小实现以下导出：

- `sanitizeRemoteFileNamePart`
- `deriveRemoteFileNameFromUrl`
- `isReliableRemoteImageFileName`
- `parseContentDispositionFileName`
- `buildRemoteSaveFileName`
- `createRemoteImageSaveMetadataProbe`

并明确实现这些验收点：

- probe timeout 必须独立于真实下载 timeout 注入
- Windows 保留设备名必须回退到 `image`
- 文件名尾随空格与尾随点必须被清洗
- 最终扩展名必须统一为小写

- [ ] **Step 2: 跑 util 测试，确认转绿**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js
```

Expected: PASS

- [ ] **Step 3: 做一次纯函数级重构，只保留单一闭合入口**

重构要求：

- 不允许把最终默认文件名拼装逻辑散落在多个 helper 里。
- `buildRemoteSaveFileName()` 必须是唯一“文件名结果输出口”。
- `isReliableRemoteImageFileName()` 只决定“要不要 probe”，不能决定“结果走哪条分支”。
- 保留中文注释，只解释状态机边界，不写显而易见注释。

- [ ] **Step 4: 再跑 util 测试，确认重构后仍全绿**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js
```

Expected: PASS

- [ ] **Step 5: 提交 util 实现**

```bash
git add wj-markdown-editor-electron/src/util/document-session/remoteImageSaveFileNameUtil.js wj-markdown-editor-electron/src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js
git commit -m "feat(electron): add remote image save-as filename util"
```

## 任务 3：先写 `documentResourceService.saveAs()` 的集成失败测试

**Files:**

- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`

- [ ] **Step 1: 写失败测试，锁定当前实现尚不支持的 probe 行为**

```js
it('document.resource.save-as 对 URL 无扩展名的远程图片应通过 HEAD 的 Content-Type 补默认扩展名', async () => {
  // rawSrc: https://example.com/assets/demo
  // HEAD 返回 image/avif
  // 断言 showSaveDialogSync defaultPath === demo.avif
  // 断言第一次 fetch 调用 method === HEAD
})
```

- [ ] **Step 2: 跑单测，确认它先失败**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/document-session/__tests__/documentResourceService.test.js -t "URL 无扩展名的远程图片应通过 HEAD 的 Content-Type 补默认扩展名"
```

Expected: FAIL，因为当前实现还没有 probe 分支，也不会在弹框前用 `HEAD` 修正默认扩展名。

- [ ] **Step 3: 写第二批失败测试，锁定 probe 行为与禁止触碰 body**

```js
it('document.resource.save-as 对 URL 不可靠的远程图片应只发一次 HEAD probe，并禁止读取 body', async () => {
  // rawSrc: https://example.com/assets/demo
  // fetchImpl 第一次返回 HEAD 响应，headers 含 image/avif
  // 断言 defaultPath === demo.avif
  // 断言 probe 请求 method === HEAD
  // 断言未调用 arrayBuffer/blob/text，也未访问 response.body
})
```

还要补这些失败用例：

- `HEAD` 超时后应静默回退到 `demo.png`
- `HEAD probe` 必须使用独立短超时，且不能复用真实下载的 15s 超时
- `HEAD` 返回 `405` 时，禁止退化成 `GET fallback`
- `Content-Disposition` 的 `filename*` 应覆盖 `filename`
- probe 期间 session 切换时，必须返回 `stale-document-context` 且不再弹保存框
- 用户取消时允许出现 `HEAD probe`，但仍不得进入真实下载内容阶段

- [ ] **Step 4: 跑整组 `documentResourceService` 测试，确认失败集中在新行为**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/document-session/__tests__/documentResourceService.test.js
```

Expected: FAIL，且失败原因集中在：

- 默认文件名仍只按 URL 推导
- 没有 `HEAD` probe
- 没有 probe 前后 stale 保护
- 旧“远程取消前完全不调用 fetch”断言需要按新语义调整

- [ ] **Step 5: 提交集成测试更新**

```bash
git add wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js
git commit -m "test(electron): cover remote save-as head probe flow"
```

## 任务 4：接入 `saveAs()` probe 编排并拉绿集成测试

**Files:**

- Modify: `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/remoteImageSaveFileNameUtil.js`

- [ ] **Step 1: 最小接入 probe 编排**

实现要求：

- `documentResourceService.js` 引入 `remoteImageSaveFileNameUtil.js`。
- 远程 `save-as` 的默认文件名准备阶段改为：
  - 先解析 URL 文件名
  - 判断是否可靠
  - 不可靠时只发单次 `HEAD`
  - `HEAD` 使用单独短超时常量或独立注入项，不复用真实下载的 `DEFAULT_REMOTE_IMAGE_FETCH_TIMEOUT_MS`
  - probe 前后各做一次 stale 校验
  - 无论 probe 是否执行、是否成功，都统一调用 `buildRemoteSaveFileName()`
- 真实下载仍继续使用现有 `fetchRemoteImageBuffer()`，且只发生在用户选定路径之后。

- [ ] **Step 2: 跑 `documentResourceService` 测试，确认转绿**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/document-session/__tests__/documentResourceService.test.js
```

Expected: PASS

- [ ] **Step 3: 补一个回归测试，防止以后再次引入 `GET fallback`**

```js
it('document.resource.save-as 的默认文件名 probe 禁止使用 GET fallback', async () => {
  // HEAD 返回 405
  // 断言最终只出现一次 fetch 调用，且 method === HEAD
  // defaultPath 按 demo.png 或 image.png 回退
})
```

- [ ] **Step 4: 再跑资源服务相关测试，确认回归测试也通过**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js src/util/document-session/__tests__/documentResourceService.test.js
```

Expected: PASS

- [ ] **Step 5: 提交 `saveAs()` 接入实现**

```bash
git add wj-markdown-editor-electron/src/util/document-session/documentResourceService.js wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js wj-markdown-editor-electron/src/util/document-session/remoteImageSaveFileNameUtil.js
git commit -m "feat(electron): probe remote save-as filename with head"
```

## 任务 5：定向格式化与最终验证

**Files:**

- Modify: `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/remoteImageSaveFileNameUtil.js`
- Create: `wj-markdown-editor-electron/src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/util/document-session/__tests__/documentResourceService.test.js`

- [ ] **Step 1: 对变更文件执行定向 ESLint 修复**

Run in `wj-markdown-editor-electron`:

```bash
npx eslint --fix src/util/document-session/documentResourceService.js src/util/document-session/remoteImageSaveFileNameUtil.js src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js src/util/document-session/__tests__/documentResourceService.test.js
```

Expected: exit code `0`

- [ ] **Step 2: 跑目标测试**

Run in `wj-markdown-editor-electron`:

```bash
npx vitest run src/util/document-session/__tests__/remoteImageSaveFileNameUtil.test.js src/util/document-session/__tests__/documentResourceService.test.js
```

Expected: PASS

- [ ] **Step 3: 做一次人工核对清单**

核对点：

- URL 为 `demo.jpg?download=1` 时，不发 `HEAD probe`，默认名仍为 `demo.jpg`
- URL 为 `demo` 时，`HEAD` 成功返回 `image/avif`，默认名为 `demo.avif`
- URL 为 `demo.php` 且 `HEAD` 失败时，默认名为 `demo.png`
- URL 无 basename 且 `HEAD` 失败时，默认名为 `image.png`
- `filename*` 优先于 `filename`
- `HEAD probe` 的超时预算明显短于真实下载超时，且预算到点后会立即回退，不拖延弹框
- probe 期间切换 session，不弹保存框
- 用户取消后，不会发起真实下载内容请求

- [ ] **Step 4: 确认工作区状态**

```bash
git status --short
```

Expected: 只剩本轮尚未提交的验证性差异；若计划按任务提交执行，则这里应为空。

## 执行注意事项

- 本次实现只动 Electron 端，不改 Web 端菜单、IPC 契约和 renderer 逻辑。
- probe 请求必须显式使用 `method: 'HEAD'`。
- probe 阶段不得调用 `arrayBuffer()`、`blob()`、`text()`，也不得访问或消费 `response.body`。
- 任何 probe 失败都只能静默回退到统一文件名构造逻辑，不能让 `save-as` 提前失败。
- 最终默认文件名必须统一走 `buildRemoteSaveFileName()`，不能在“URL 已可靠”路径直接返回裸值。
- 真实下载阶段继续沿用现有 `fetchRemoteImageBuffer()` 的 `Content-Type`、`Content-Length`、超时与结构化失败语义。
