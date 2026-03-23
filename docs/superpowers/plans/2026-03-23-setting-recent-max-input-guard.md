# Setting RecentMax Input Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复设置页 `recentMax` 输入框的空值中间态问题，确保该字段始终保持为 `0-50` 的整数，并在用户清空时立即回填 `0`。

**Architecture:** 在设置页配置草稿工具模块中新增一个纯函数，统一完成 `recentMax` 的值规范化。设置页中的 `a-input-number` 改为受控输入，`@update:value` 统一走该纯函数，不再直接把 `null` 写入配置草稿。

**Tech Stack:** Vue 3、Ant Design Vue、Node 内置 `node:test`

---

### Task 1: 锁定 recentMax 输入规范化规则

**Files:**
- Modify: `wj-markdown-editor-web/src/util/config/__tests__/settingConfigDraftUtil.test.js`
- Modify: `wj-markdown-editor-web/src/util/config/settingConfigDraftUtil.js`

- [ ] **Step 1: 写 failing test，覆盖 recentMax 的空值与范围收敛**

在 `settingConfigDraftUtil.test.js` 中新增断言：

```js
test('recentMax 输入值必须被规范为 0 到 50 的整数', () => {
  const { normalizeRecentMaxInputValue } = requireSettingConfigDraftUtil()

  assert.equal(normalizeRecentMaxInputValue(null), 0)
  assert.equal(normalizeRecentMaxInputValue(undefined), 0)
  assert.equal(normalizeRecentMaxInputValue(-1), 0)
  assert.equal(normalizeRecentMaxInputValue(51), 50)
  assert.equal(normalizeRecentMaxInputValue(7.9), 7)
  assert.equal(normalizeRecentMaxInputValue(12), 12)
})
```

- [ ] **Step 2: 运行单测，确认红灯**

Run: `npm run test:run -- src/util/config/__tests__/settingConfigDraftUtil.test.js`

Expected: FAIL，提示 `normalizeRecentMaxInputValue` 尚未实现。

- [ ] **Step 3: 写最小实现**

在 `settingConfigDraftUtil.js` 中新增纯函数：

```js
export function normalizeRecentMaxInputValue(value) {
  const normalizedNumber = Number(value)
  if (Number.isNaN(normalizedNumber)) {
    return 0
  }

  const normalizedInteger = Math.trunc(normalizedNumber)
  if (normalizedInteger < 0) {
    return 0
  }
  if (normalizedInteger > 50) {
    return 50
  }
  return normalizedInteger
}
```

- [ ] **Step 4: 运行单测，确认转绿**

Run: `npm run test:run -- src/util/config/__tests__/settingConfigDraftUtil.test.js`

Expected: PASS。

### Task 2: 设置页 recentMax 改为受控输入

**Files:**
- Modify: `wj-markdown-editor-web/src/views/SettingView.vue`
- Modify: `wj-markdown-editor-web/src/util/config/settingConfigDraftUtil.js`

- [ ] **Step 1: 在设置页接入 recentMax 规范化函数**

在 `SettingView.vue` 中新增：

```js
function onRecentMaxUpdate(nextValue) {
  if (!config.value) {
    return
  }

  config.value.recentMax = normalizeRecentMaxInputValue(nextValue)
}
```

- [ ] **Step 2: 把 recentMax 输入框改为受控模式**

把模板里的：

```vue
<a-input-number v-model:value="config.recentMax" ... />
```

改为：

```vue
<a-input-number
  :value="config.recentMax"
  :min="0"
  :max="50"
  :precision="0"
  :step="1"
  :controls="false"
  class="w-full"
  @update:value="onRecentMaxUpdate"
/>
```

- [ ] **Step 3: 运行相关单测**

Run: `npm run test:run -- src/util/config/__tests__/settingConfigDraftUtil.test.js`

Expected: PASS，工具函数仍通过。

- [ ] **Step 4: 按文件执行 ESLint 修复**

Run: `npx eslint --fix src/views/SettingView.vue src/util/config/settingConfigDraftUtil.js src/util/config/__tests__/settingConfigDraftUtil.test.js`

Expected: 无 ESLint 错误。

- [ ] **Step 5: 执行最终验证**

Run: `npm run test:run`

Expected: Web 端测试全部通过。
