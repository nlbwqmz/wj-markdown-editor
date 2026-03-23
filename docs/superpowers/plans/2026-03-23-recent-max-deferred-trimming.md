# RecentMax Deferred Trimming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调整 `recentMax` 更新语义，使设置页修改 recent 上限时只更新配置与运行期上限，不立即裁剪当前 recent 列表；列表收敛只发生在下次启动或后续 recent 真正更新时。

**Architecture:** `configService` 侧取消 recent 事务化裁剪，只在配置写盘成功后通知 recent 模块同步新的运行期上限。`recent.js` 侧集中负责“规范化并按上限裁剪”的逻辑，只在 `initRecent()` 和 `add()` 等真实 recent 更新路径触发持久化收敛。

**Tech Stack:** Electron、Vitest、现有 `configService` / `recent` / `ipcMainUtil` 模块

---

### Task 1: 锁定配置层“只更新上限”的新语义

**Files:**
- Modify: `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js`
- Modify: `wj-markdown-editor-electron/src/data/config/configService.js`

- [ ] **Step 1: 写 failing test，要求 `setConfigWithRecentMax()` 成功时不再广播 recent 列表**

在 `configService.test.js` 中，把当前“成功后显式通知 recent”的断言改成新语义：

```js
it('setConfigWithRecentMax 成功时只更新配置与 recent 上限，不立即广播 recent 列表', async () => {
  await expect(service.setConfigWithRecentMax({
    recentMax: 6,
    language: 'en-US',
  }, recentStore)).resolves.toEqual({
    ok: true,
    config: expect.objectContaining({
      recentMax: 6,
      language: 'en-US',
    }),
  })

  expect(recentStore.setMax).toHaveBeenCalledWith(6, { notify: false })
  expect(recentStore.notifyCurrentState).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 写 failing test，要求配置写盘失败时不再走 recent 回滚链路**

把当前依赖 `createStateSnapshot()` / `restoreState()` 的失败用例改成：

```js
it('setConfigWithRecentMax 在 config 写盘失败时不得推进 recent 上限', async () => {
  await expect(service.setConfigWithRecentMax({ recentMax: 7 }, recentStore)).resolves.toEqual({
    ok: false,
    reason: 'config-write-failed',
    messageKey: 'message.configWriteFailed',
  })

  expect(recentStore.setMax).not.toHaveBeenCalled()
  expect(recentStore.restoreState).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: 运行配置服务单测，确认红灯**

Run: `npm run test:run -- src/data/config/__tests__/configService.test.js`

Expected: FAIL，提示旧实现仍会即时广播 recent 或依赖 recent 回滚事务。

- [ ] **Step 4: 实现最小代码，移除配置层 recent 裁剪事务**

在 `configService.js` 中调整 `setConfigWithRecentMax()`：

```js
async function setConfigWithRecentMax(nextPartial, recentStore) {
  return await runConfigUpdate(async () => {
    const buildResult = buildNextConfig(nextPartial)
    if (!buildResult.ok) {
      return buildResult.result
    }

    const persistResult = await persistConfig(buildResult.nextConfig)
    if (persistResult.ok === false) {
      return persistResult
    }

    try {
      await recentStore.setMax(buildResult.nextConfig.recentMax, { notify: false })
    }
    catch {
      return createWriteFailedResult()
    }

    return persistResult
  })
}
```

- [ ] **Step 5: 运行配置服务单测，确认转绿**

Run: `npm run test:run -- src/data/config/__tests__/configService.test.js`

Expected: PASS，且 `setConfigWithRecentMax()` 的成功/失败语义符合新设计。

### Task 2: 锁定 recent 存储层“延迟收敛”行为

**Files:**
- Modify: `wj-markdown-editor-electron/src/data/recent.test.js`
- Modify: `wj-markdown-editor-electron/src/data/recent.js`

- [ ] **Step 1: 写 failing test，要求 `setMax()` 只更新运行期上限，不立即裁剪 recent 列表**

把现有 `setMax` 相关测试改成新语义：

```js
it('setMax 成功时只更新运行期上限，不立即修改 recent 列表和磁盘', async () => {
  await recent.setMax(1)

  expect(recent.get()).toEqual([
    { name: 'one.md', path: 'D:/docs/one.md' },
    { name: 'two.md', path: 'D:/docs/two.md' },
    { name: 'three.md', path: 'D:/docs/three.md' },
  ])
  expect(writeFileMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 写 failing test，要求 `initRecent()` 启动时会按上限一次性收敛并回写**

新增用例：

```js
it('initRecent 读取到超出上限的 recent 时，必须在启动阶段收敛并回写', async () => {
  pathExistsMock.mockResolvedValue(true)
  readFileMock.mockResolvedValue(JSON.stringify([
    'D:/docs/one.md',
    'D:/docs/two.md',
    'D:/docs/three.md',
  ]))

  await recent.initRecent(1, vi.fn())

  expect(recent.get()).toEqual([
    { name: 'one.md', path: 'D:/docs/one.md' },
  ])
  expect(writeFileMock).toHaveBeenCalledWith(
    expect.stringMatching(/[\\\\/]recent\\.json$/),
    JSON.stringify(['D:/docs/one.md']),
    'utf-8',
  )
})
```

- [ ] **Step 3: 写 failing test，要求 `setMax()` 之后下一次 `add()` 会按新上限统一收敛**

新增用例：

```js
it('setMax 更新上限后，下一次 add 必须按新上限统一收敛', async () => {
  await recent.initRecent(3, vi.fn())
  await recent.setMax(1, { notify: false })
  writeFileMock.mockClear()

  await recent.add('D:/docs/four.md')

  expect(recent.get()).toEqual([
    { name: 'four.md', path: 'D:/docs/four.md' },
  ])
})
```

- [ ] **Step 4: 运行 recent 单测，确认红灯**

Run: `npm run test:run -- src/data/recent.test.js`

Expected: FAIL，提示旧实现仍在 `setMax()` 时立刻裁剪 recent。

- [ ] **Step 5: 实现最小代码，集中 recent 的“规范化并按上限裁剪”逻辑**

在 `recent.js` 中：

```js
function trimRecentListToMax(recentList, max) {
  const normalizedRecent = normalizeRecentList(recentList)
  if (!max || max <= 0) {
    return []
  }
  return normalizedRecent.slice(0, max)
}

async function initRecent(max, callbackFunction) {
  // 读取后统一调用 trimRecentListToMax()
  // 仅在收敛结果和磁盘内容不一致时回写
}

async function addInternal(filePath, { notify = true } = {}) {
  // unshift 后统一调用 trimRecentListToMax(nextRecent, maxSize)
}

async function setMaxInternal(max, { notify = true } = {}) {
  // 只更新运行期 maxSize，不写 recent.json，不改 recent 数组
  // notify=true 时也不广播，因为列表本身未变化
}
```

- [ ] **Step 6: 运行 recent 单测，确认转绿**

Run: `npm run test:run -- src/data/recent.test.js`

Expected: PASS，且启动收敛、延迟收敛、后续 add 收敛全部符合预期。

### Task 3: 收口契约与格式化验证

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/data/config/configService.js`
- Modify: `wj-markdown-editor-electron/src/data/recent.js`
- Modify: `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js`
- Modify: `wj-markdown-editor-electron/src/data/recent.test.js`

- [ ] **Step 1: 运行 IPC 相关测试，确认 `user-update-config` 仍透传结构化结果**

Run: `npm run test:run -- src/util/channel/ipcMainUtil.test.js`

Expected: PASS，证明 recent 行为变化没有破坏 IPC 契约。

- [ ] **Step 2: 按文件执行 ESLint 修复**

Run: `npx eslint --fix src/data/config/configService.js src/data/config/__tests__/configService.test.js src/data/recent.js src/data/recent.test.js src/util/channel/ipcMainUtil.test.js`

Expected: 无 ESLint 错误。

- [ ] **Step 3: 执行最终回归验证**

Run: `npm run test:run -- src/data/config/__tests__/configService.test.js src/data/recent.test.js src/util/channel/ipcMainUtil.test.js`

Expected: 全部通过，证明配置层、recent 层和 IPC 契约保持一致。
