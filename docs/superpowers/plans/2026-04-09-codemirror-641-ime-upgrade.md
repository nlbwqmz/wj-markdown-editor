# CodeMirror 6.41.0 输入法稳定性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把编辑页升级到以 `@codemirror/view@6.41.0` 为核心的兼容依赖矩阵，并修复中文输入法期间的外部回写竞争问题，确保不再出现 `Invalid child in posBefore`。

**Architecture:** 先统一 CodeMirror 依赖图并用依赖拓扑测试锁死，再把组合输入状态抽象成独立工具，由 `useEditorCore` 负责提供稳定输入状态，`MarkdownEdit` 负责延迟和冲刷外部回放。最后通过单测、组件测试、构建和真实依赖拓扑检查验证修复有效且无功能回退。

**Tech Stack:** Vue 3、CodeMirror 6、Vite、Vitest、Node test、PowerShell、npm

---

## 文件结构与职责

- `wj-markdown-editor-web/package.json`
  负责显式声明 CodeMirror 直接依赖和目标版本矩阵。
- `wj-markdown-editor-web/package-lock.json`
  负责锁定安装结果，确保根项目只解析到单一 `@codemirror/view`。
- `wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js`
  负责搜索扩展、主题扩展及 `EditorView` 级扩展配置。
- `wj-markdown-editor-web/src/components/editor/composables/useEditorCore.js`
  负责编辑器实例生命周期、组合输入状态采集、组合结束后的稳定冲刷通知。
- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
  负责把外层 `props.modelValue` 同步到编辑器，并在组合输入期间延迟危险回放。
- `wj-markdown-editor-web/src/util/editor/compositionStateUtil.js`
  负责组合输入窗口状态判定和挂起更新数据的纯函数逻辑。
- `wj-markdown-editor-web/src/util/editor/__tests__/compositionStateUtil.test.js`
  负责组合输入判定工具测试。
- `wj-markdown-editor-web/src/util/editor/__tests__/codemirrorDependencyTopology.test.js`
  负责依赖拓扑与显式声明测试。
- `wj-markdown-editor-web/src/components/editor/__tests__/markdownEditCompositionSync.test.js`
  负责编辑页组合输入期间的外部回放行为测试。

---

### Task 1: 锁定依赖矩阵与拓扑防线

**Files:**
- Modify: `wj-markdown-editor-web/package.json`
- Modify: `wj-markdown-editor-web/package-lock.json`
- Modify: `wj-markdown-editor-web/src/util/editor/__tests__/codemirrorDependencyTopology.test.js`

- [ ] **Step 1: 先写失败测试，锁定目标依赖矩阵**

```js
test('package.json 必须显式声明编辑器直接使用的 CodeMirror 依赖', () => {
  assert.equal(packageJson.dependencies['@codemirror/view'], '6.41.0')
  assert.equal(packageJson.dependencies['@codemirror/state'], '6.6.0')
  assert.equal(packageJson.dependencies['@codemirror/commands'], '6.10.3')
  assert.equal(packageJson.dependencies['@codemirror/language'], '6.12.3')
  assert.equal(packageJson.dependencies['@codemirror/autocomplete'], '6.20.1')
  assert.equal(packageJson.dependencies['@codemirror/search'], '6.6.0')
  assert.equal(packageJson.dependencies.codemirror, undefined)
})
```

- [ ] **Step 2: 运行依赖拓扑测试，确认当前会失败**

Run: `npm run test:node --prefix wj-markdown-editor-web`

Expected:
- `codemirrorDependencyTopology.test.js` 因版本断言失败

- [ ] **Step 3: 调整依赖并重新生成 lock**

Run:

```bash
npm install @codemirror/view@6.41.0 @codemirror/state@6.6.0 @codemirror/commands@6.10.3 @codemirror/language@6.12.3 @codemirror/autocomplete@6.20.1 @codemirror/search@6.6.0 --save --prefix wj-markdown-editor-web
npm uninstall codemirror --prefix wj-markdown-editor-web
```

并同步更新测试中的版本断言。

- [ ] **Step 4: 验证依赖拓扑与测试通过**

Run:

```bash
npm ls @codemirror/view @codemirror/state @codemirror/commands @codemirror/language @codemirror/autocomplete @codemirror/search --prefix wj-markdown-editor-web
npm run test:node --prefix wj-markdown-editor-web
```

Expected:
- 根项目只有一份 `@codemirror/view`
- Node 测试通过

- [ ] **Step 5: 记录阶段性提交**

```bash
git add wj-markdown-editor-web/package.json wj-markdown-editor-web/package-lock.json wj-markdown-editor-web/src/util/editor/__tests__/codemirrorDependencyTopology.test.js
git commit -m "test: lock codemirror dependency topology"
```

### Task 2: 抽离组合输入状态判定工具

**Files:**
- Create: `wj-markdown-editor-web/src/util/editor/compositionStateUtil.js`
- Test: `wj-markdown-editor-web/src/util/editor/__tests__/compositionStateUtil.test.js`

- [ ] **Step 1: 先写纯函数失败测试**

```js
test('当 view.composing 为 true 时应判定为组合输入中', () => {
  assert.equal(isEditorCompositionActive({ view: { composing: true } }), true)
})

test('当 compositionStarted 为 true 时也应判定为组合输入窗口中', () => {
  assert.equal(isEditorCompositionActive({ view: { composing: false, compositionStarted: true } }), true)
})

test('当没有组合输入状态且兜底标记为 false 时应返回 false', () => {
  assert.equal(isEditorCompositionActive({ view: { composing: false, compositionStarted: false }, fallbackActive: false }), false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test wj-markdown-editor-web/src/util/editor/__tests__/compositionStateUtil.test.js`

Expected:
- 缺少 `compositionStateUtil.js` 或导出函数失败

- [ ] **Step 3: 实现最小工具函数**

```js
function isEditorCompositionActive({ view, fallbackActive = false } = {}) {
  return Boolean(
    fallbackActive
    || view?.composing === true
    || view?.compositionStarted === true,
  )
}

function shouldDeferCompositionExternalSync({ view, fallbackActive = false, currentValue, nextValue }) {
  if (currentValue === nextValue) {
    return false
  }
  return isEditorCompositionActive({ view, fallbackActive })
}

export {
  isEditorCompositionActive,
  shouldDeferCompositionExternalSync,
}
```

- [ ] **Step 4: 运行纯函数测试确认通过**

Run: `node --test wj-markdown-editor-web/src/util/editor/__tests__/compositionStateUtil.test.js`

Expected:
- 测试通过

- [ ] **Step 5: 记录阶段性提交**

```bash
git add wj-markdown-editor-web/src/util/editor/compositionStateUtil.js wj-markdown-editor-web/src/util/editor/__tests__/compositionStateUtil.test.js
git commit -m "test: add composition state utilities"
```

### Task 3: 改造 useEditorCore 的组合输入时序

**Files:**
- Modify: `wj-markdown-editor-web/src/components/editor/composables/useEditorCore.js`
- Test: `wj-markdown-editor-web/src/components/editor/__tests__/useEditorCoreComposition.test.js`

- [ ] **Step 1: 写失败测试，描述组合结束后的稳定冲刷行为**

```js
test('组合输入期间不应触发 onDocChange，结束后应在稳定时机触发 onCompositionIdle', async () => {
  const onDocChange = vi.fn()
  const onCompositionIdle = vi.fn()
  // 挂载 useEditorCore，模拟 compositionstart -> docChanged -> compositionend
  // 断言组合期间 onDocChange 不被调用，结束后 onCompositionIdle 被调用一次
})
```

- [ ] **Step 2: 运行组件测试确认失败**

Run: `npm run test:component:run --prefix wj-markdown-editor-web -- useEditorCoreComposition`

Expected:
- 缺少测试或行为不符合断言

- [ ] **Step 3: 修改 useEditorCore，统一组合输入判定**

实现方向：

```js
const domCompositionActive = ref(false)
const compositionIdlePending = ref(false)

function isCompositionActive() {
  return isEditorCompositionActive({
    view: editorView.value,
    fallbackActive: domCompositionActive.value,
  })
}
```

并在：

- `compositionstart` 中只更新兜底标记
- `compositionend` 中标记 `compositionIdlePending = true`，并安排一次 `queueMicrotask` 或下一帧检查
- `updateListener` 中当 `compositionIdlePending === true && isCompositionActive() === false` 时触发 `onCompositionIdle`

- [ ] **Step 4: 运行组件测试确认通过**

Run: `npm run test:component:run --prefix wj-markdown-editor-web -- useEditorCoreComposition`

Expected:
- 组合输入时序测试通过

- [ ] **Step 5: 记录阶段性提交**

```bash
git add wj-markdown-editor-web/src/components/editor/composables/useEditorCore.js wj-markdown-editor-web/src/components/editor/__tests__/useEditorCoreComposition.test.js
git commit -m "fix: stabilize codemirror composition lifecycle"
```

### Task 4: 改造 MarkdownEdit 的外部回放冻结与冲刷

**Files:**
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
- Modify: `wj-markdown-editor-web/src/util/editor/contentUpdateMetaUtil.js`
- Test: `wj-markdown-editor-web/src/components/editor/__tests__/markdownEditCompositionSync.test.js`

- [ ] **Step 1: 写失败测试，描述组合输入期间挂起外部回放**

```js
test('组合输入期间应延迟外部正文与 selection 回放，并在组合结束后只应用最新快照', async () => {
  // 初始 doc = "abc"
  // 模拟进入组合输入
  // 外部先后回放 "abcd"、"abcde"，并带有 selection/scrollIntoView
  // 断言组合期间编辑器正文与 selection 都不被覆盖
  // 断言组合结束后最终只应用 "abcde"
})
```

- [ ] **Step 2: 运行组件测试确认失败**

Run: `npm run test:component:run --prefix wj-markdown-editor-web -- markdownEditCompositionSync`

Expected:
- 当前实现会在组合输入期间直接 dispatch，测试失败

- [ ] **Step 3: 在 MarkdownEdit 中实现挂起与冲刷**

实现方向：

```js
const pendingExternalSync = ref(null)

function queueExternalSync(payload) {
  pendingExternalSync.value = payload
}

function flushPendingExternalSync() {
  const payload = pendingExternalSync.value
  pendingExternalSync.value = null
  if (!payload) {
    return
  }
  applyExternalSync(payload)
}
```

`watch(props.modelValue)` 中：

- 先判断陈旧 echo
- 再判断这次是否会触发外部 dispatch
- 若处于组合输入窗口，则只缓存最新 payload；正文 changes 与 selection/`scrollIntoView` 一并挂起
- 若否，则立即应用

`useEditorCore` 的 `onCompositionIdle` 回调中：

- `scheduleModelSync()`
- `flushPendingExternalSync()`

并在 `flushPendingExternalSync()` 中重新执行一次 stale 判定，只有 payload 仍然是最新合法外部状态时才真正回放。

- [ ] **Step 4: 运行组件测试确认通过**

Run: `npm run test:component:run --prefix wj-markdown-editor-web -- markdownEditCompositionSync`

Expected:
- 组合输入挂起与冲刷测试通过
- selection-only 外部事务在组合输入期间同样被挂起

- [ ] **Step 5: 记录阶段性提交**

```bash
git add wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue wj-markdown-editor-web/src/util/editor/contentUpdateMetaUtil.js wj-markdown-editor-web/src/components/editor/__tests__/markdownEditCompositionSync.test.js
git commit -m "fix: defer external editor sync during composition"
```

### Task 5: 搜索扩展与回归验证

**Files:**
- Modify: `wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js`
- Test: `wj-markdown-editor-web/src/util/editor/__tests__/editorSearchBehavior.test.js`

- [ ] **Step 1: 写失败测试，锁定搜索行为不回退**

```js
test('搜索 query 更新后应继续生成滚动效果，且不扰动组合输入状态', () => {
  // 挂载编辑器后执行 setSearchQuery / findNext
  // 断言 scrollToMatch 仍被调用
  // 断言搜索命令不会错误触发组合输入挂起状态变化
})
```

- [ ] **Step 2: 运行测试确认失败或缺失**

Run: `npm run test:component:run --prefix wj-markdown-editor-web -- editorSearchBehavior`

Expected:
- 当前缺少对升级后搜索行为的显式保护

- [ ] **Step 3: 按官方签名整理 scrollToMatch**

```js
search({
  scrollToMatch: (range, view) => EditorView.scrollIntoView(range, { y: 'center' }),
})
```

同时确认 `EditorSearchBar.vue` 与 `@codemirror/search@6.6.0` 的现有 API 用法一致；若确认无须改动，则该文件不进入实际改动集合。

- [ ] **Step 4: 运行搜索行为测试**

Run: `npm run test:component:run --prefix wj-markdown-editor-web -- editorSearchBehavior`

Expected:
- 搜索行为测试通过

- [ ] **Step 5: 记录阶段性提交**

```bash
git add wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js wj-markdown-editor-web/src/util/editor/__tests__/editorSearchBehavior.test.js
git commit -m "test: cover codemirror search behavior after upgrade"
```

### Task 6: 全量验证与真实回归

**Files:**
- Verify only

- [ ] **Step 1: 运行 Node 测试**

Run: `npm run test:node --prefix wj-markdown-editor-web`

Expected:
- 全部通过

- [ ] **Step 2: 运行组件测试**

Run: `npm run test:component:run --prefix wj-markdown-editor-web`

Expected:
- 全部通过

- [ ] **Step 3: 运行 Web 构建**

Run: `npm run build --prefix wj-markdown-editor-web`

Expected:
- 构建成功

- [ ] **Step 4: 运行依赖拓扑检查**

Run:

```bash
npm ls @codemirror/view @codemirror/state @codemirror/commands @codemirror/language @codemirror/autocomplete @codemirror/search --prefix wj-markdown-editor-web
```

Expected:
- 根项目只有一份 `@codemirror/view@6.41.0`

- [ ] **Step 5: 真实回归验证问题文档**

手工验证：

1. 打开 `C:\Users\robot\Desktop\中转账号.md`
2. 在文末问题区域点击、输入、连续拼音上屏
3. 打开编辑器搜索条执行查找和替换
4. 切换预览、大纲、工具栏命令

Expected:
- 不再出现 `Invalid child in posBefore`
- 功能无回退

- [ ] **Step 6: 记录最终提交**

```bash
git add wj-markdown-editor-web
git commit -m "fix: upgrade codemirror view to 6.41.0 safely"
```

---

## 计划自审

- 依赖升级、组合输入、防回放竞争、搜索回归、最终验证均有对应任务
- 无 TBD、待补充、同上类占位
- 文件边界明确，新增纯函数工具把复杂逻辑从组件中抽离
- 计划满足用户约束：新分支、无 worktree、先文档与评审，再开发
