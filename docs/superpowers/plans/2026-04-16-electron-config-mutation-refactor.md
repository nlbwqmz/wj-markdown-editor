# Electron 配置 Mutation 重构实施计划

> **For agentic workers:** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐项执行；步骤使用复选框 `- [ ]` 跟踪。
> **执行约束：** 不使用 worktree；执行时直接从当前 `main` 新建分支。若使用 subagent，必须与主会话保持相同模型和相同思考强度，且在其失活或长时间无响应前不得主动关闭。

**Goal:** 将 Electron 端配置更新彻底重构为统一的字段级 mutation 架构，禁止调用方提交整份配置快照，消除旧草稿覆盖新配置的更新路径，同时保持现有配置功能和用户行为不变。

**Architecture:** 主进程保留“内存态 + 串行写队列 + 原子写盘 + 成功后广播完整快照”的核心模型，但把写入口收口为单一 `config.update` 命令。更新请求只允许表达明确的 mutation 意图：普通字段走白名单路径更新，固定长度数组允许路径加下标，`shortcutKeyList` 走按 `id` 的专用更新，`autoSave` 走集合开关语义，重置配置走显式 `reset` 操作。

**Tech Stack:** Electron 39、Vue 3、Pinia 3、Vitest 4、Node `write-file-atomic`、AJV、ESLint。

---

## 范围与非目标

**本次范围：**
- Electron 主进程配置更新模型
- IPC 配置写入口收口
- Renderer 侧配置写调用适配
- 相关单元测试、组件测试、ESLint 格式化

**明确非目标：**
- 不改配置文件最终落盘结构
- 不改默认配置字段含义
- 不新增版本冲突检测或 revision/CAS 机制
- 不调整设置页视觉或交互文案
- 不改文档会话、recent、导出、资源删除等非配置主线行为

## 目标架构

### 1. Electron 端唯一写入口

Renderer 只允许发送：

```js
{
  event: 'config.update',
  data: {
    operations: [
      { type: 'set', path: ['theme', 'global'], value: 'dark' },
    ],
  },
}
```

主进程内部只保留一个统一服务入口：

```js
await configUtil.updateConfig({
  operations: [
    { type: 'set', path: ['theme', 'global'], value: 'dark' },
  ],
}, recentStore)
```

### 2. 允许的 mutation 类型

```js
[
  { type: 'set', path: ['language'], value: 'en-US' },
  { type: 'set', path: ['fileManagerSort', 'field'], value: 'name' },
  { type: 'set', path: ['fileManagerSort', 'direction'], value: 'desc' },
  { type: 'set', path: ['watermark', 'gap', 0], value: 120 },
  { type: 'setShortcutKeyField', id: 'save', field: 'keymap', value: 'Ctrl+s' },
  { type: 'setShortcutKeyField', id: 'save', field: 'enabled', value: true },
  { type: 'setAutoSaveOption', option: 'blur', enabled: true },
  { type: 'reset' },
]
```

### 3. 边界规则

- `set` 只能命中白名单路径，不能更新整个对象根节点，不能把对象字段整体替换成整坨子对象。
- 数组不能一刀切按下标更新。
- 只有固定长度数组 `watermark.gap[0]`、`watermark.gap[1]` 允许下标路径。
- `shortcutKeyList` 只能按 `id` 更新，禁止按下标更新。
- `autoSave` 只能按 `option + enabled` 开关，不允许整数组替换。
- `reset` 由主进程基于默认配置直接生成下一份完整配置，Renderer 不再先读默认配置再整份提交。

### 4. 保留的核心保障

- 保留 `configUpdateQueue` 串行写入。
- 保留原子写盘成功后再推进内存态和广播。
- 保留最终完整配置结构校验。
- 保留 `recentMax` 成功写盘后再同步 recent 上限的行为。

## 执行前准备

- [ ] **Step 1: 检查当前工作区状态**

运行：

```bash
git status --short
```

预期：

```text
确认当前改动不被覆盖；若存在用户未提交改动，后续实现时只叠加本次重构修改。
```

- [ ] **Step 2: 从当前 `main` 直接创建功能分支**

运行：

```bash
git checkout -b refactor/electron-config-mutation
git branch --show-current
```

预期：

```text
输出 refactor/electron-config-mutation
```

- [ ] **Step 3: 记录重构前基线测试**

在 `wj-markdown-editor-electron/` 目录运行：

```bash
npm run test:run -- src/data/config/__tests__/configService.test.js src/util/channel/ipcMainUtil.test.js src/data/configUtil.test.js
```

在 `wj-markdown-editor-web/` 目录运行：

```bash
npm run test:component:run -- src/views/__tests__/settingViewShortcutKey.vitest.test.js src/components/layout/__tests__/layoutTopFullScreenControl.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/file-manager/__tests__/fileManagerPanelController.vitest.test.js
```

预期：

```text
现有相关测试全部通过，作为后续重构对照基线。
```

### Task 1: 先建立新的 mutation 合同测试

**Files:**
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configMutationSchema.test.js`
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configMutationExecutor.test.js`
- Modify: `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js`
- Modify: `wj-markdown-editor-electron/src/data/configUtil.test.js`

- [ ] **Step 1: 为 mutation 请求白名单写失败测试**

测试代码：

```js
import { describe, expect, it } from 'vitest'
import { validateConfigMutationRequest } from '../configMutationSchema.js'

describe('validateConfigMutationRequest', () => {
  it('允许白名单 set 路径', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'set', path: ['theme', 'global'], value: 'dark' },
      ],
    })).not.toThrow()
  })

  it('拒绝未知路径', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'set', path: ['theme', 'unknown'], value: true },
      ],
    })).toThrow(/未知配置更新路径/)
  })

  it('拒绝 shortcutKeyList 下标写法', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'set', path: ['shortcutKeyList', 0, 'enabled'], value: false },
      ],
    })).toThrow(/shortcutKeyList 仅允许按 id 更新/)
  })
})
```

- [ ] **Step 2: 为 executor 写失败测试，锁定数组与集合语义**

测试代码：

```js
import { describe, expect, it } from 'vitest'
import defaultConfig from '../../defaultConfig.js'
import { applyConfigMutationRequest } from '../configMutationExecutor.js'

describe('applyConfigMutationRequest', () => {
  it('按白名单路径更新 theme.global', () => {
    const nextConfig = applyConfigMutationRequest(defaultConfig, {
      operations: [
        { type: 'set', path: ['theme', 'global'], value: 'dark' },
      ],
    })

    expect(nextConfig.theme.global).toBe('dark')
    expect(nextConfig.theme.code).toBe(defaultConfig.theme.code)
  })

  it('按下标只更新固定长度数组 watermark.gap', () => {
    const nextConfig = applyConfigMutationRequest(defaultConfig, {
      operations: [
        { type: 'set', path: ['watermark', 'gap', 0], value: 180 },
      ],
    })

    expect(nextConfig.watermark.gap).toEqual([180, 100])
  })

  it('按 id 更新快捷键字段', () => {
    const nextConfig = applyConfigMutationRequest(defaultConfig, {
      operations: [
        { type: 'setShortcutKeyField', id: 'save', field: 'enabled', value: false },
      ],
    })

    expect(nextConfig.shortcutKeyList.find(item => item.id === 'save')?.enabled).toBe(false)
  })

  it('按集合语义切换 autoSave 选项', () => {
    const nextConfig = applyConfigMutationRequest(defaultConfig, {
      operations: [
        { type: 'setAutoSaveOption', option: 'blur', enabled: true },
      ],
    })

    expect(nextConfig.autoSave).toEqual(['blur'])
  })
})
```

- [ ] **Step 3: 扩展 config service / config util 失败测试，锁定唯一入口**

测试代码：

```js
await expect(service.updateConfig({
  operations: [
    { type: 'set', path: ['language'], value: 'en-US' },
  ],
})).resolves.toEqual({
  ok: true,
  config: expect.objectContaining({
    language: 'en-US',
  }),
})

expect(configUtil.updateConfig).toBeTypeOf('function')
expect(configUtil.setConfig).toBeUndefined()
expect(configUtil.setThemeGlobal).toBeUndefined()
expect(configUtil.setLanguage).toBeUndefined()
```

- [ ] **Step 4: 运行电子端目标测试，确认当前为失败态**

在 `wj-markdown-editor-electron/` 目录运行：

```bash
npm run test:run -- src/data/config/__tests__/configMutationSchema.test.js src/data/config/__tests__/configMutationExecutor.test.js src/data/config/__tests__/configService.test.js src/data/configUtil.test.js
```

预期：

```text
FAIL，原因应包含 configMutationSchema.js / configMutationExecutor.js / updateConfig 未实现或导出缺失。
```

- [ ] **Step 5: 提交测试基线**

运行：

```bash
git add src/data/config/__tests__/configMutationSchema.test.js src/data/config/__tests__/configMutationExecutor.test.js src/data/config/__tests__/configService.test.js src/data/configUtil.test.js
git commit -m "test(electron-config): cover mutation contract"
```

### Task 2: 实现 Electron 端 mutation schema 与 executor

**Files:**
- Create: `wj-markdown-editor-electron/src/data/config/configMutationSchema.js`
- Create: `wj-markdown-editor-electron/src/data/config/configMutationExecutor.js`
- Test: `wj-markdown-editor-electron/src/data/config/__tests__/configMutationSchema.test.js`
- Test: `wj-markdown-editor-electron/src/data/config/__tests__/configMutationExecutor.test.js`

- [ ] **Step 1: 实现 mutation schema，集中定义白名单路径和操作类型**

实现代码：

```js
const FIXED_INDEX_PATH_SET = new Set([
  'watermark.gap.0',
  'watermark.gap.1',
])

const SET_PATH_SET = new Set([
  'language',
  'theme.global',
  'theme.code',
  'theme.preview',
  'fileManagerSort.field',
  'fileManagerSort.direction',
  'fontSize',
  'previewWidth',
  'menuVisible',
  'fileManagerVisible',
  'editor.previewPosition',
  'editor.associationHighlight',
  'markdown.typographer',
  'markdown.inlineCodeClickCopy',
  'externalFileChangeStrategy',
  'startPage',
  'openRecent',
  'recentMax',
  'imgLocal',
  'imgNetwork',
  'imgAbsolutePath',
  'imgRelativePath',
  'fileMode',
  'fileAbsolutePath',
  'fileRelativePath',
  'fontFamily.editArea',
  'fontFamily.previewArea',
  'fontFamily.codeArea',
  'fontFamily.otherArea',
  'watermark.enabled',
  'watermark.previewEnabled',
  'watermark.dateEnabled',
  'watermark.datePattern',
  'watermark.content',
  'watermark.rotate',
  'watermark.font.fontSize',
  'watermark.font.fontWeight',
  'watermark.font.color',
  'export.pdf.footer.pageNumber',
  'export.pdf.footer.content',
  'export.pdf.header.content',
])

export function validateConfigMutationRequest(request) {
  if (!request || !Array.isArray(request.operations) || request.operations.length === 0) {
    throw new TypeError('配置更新请求必须包含非空 operations')
  }

  request.operations.forEach((operation) => {
    if (operation.type === 'set') {
      const normalizedPath = operation.path.join('.')
      if (!SET_PATH_SET.has(normalizedPath) && !FIXED_INDEX_PATH_SET.has(normalizedPath)) {
        throw new TypeError(`未知配置更新路径: ${normalizedPath}`)
      }
    }

    if (operation.type === 'setShortcutKeyField' && !['keymap', 'enabled'].includes(operation.field)) {
      throw new TypeError(`未知快捷键字段: ${operation.field}`)
    }

    if (operation.type === 'setAutoSaveOption' && !['blur', 'close'].includes(operation.option)) {
      throw new TypeError(`未知自动保存选项: ${operation.option}`)
    }
  })
}
```

- [ ] **Step 2: 实现 executor，基于最新内存配置生成下一份完整配置**

实现代码：

```js
import defaultConfig from '../defaultConfig.js'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function setByPath(target, path, value) {
  let current = target
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]]
  }
  current[path[path.length - 1]] = cloneValue(value)
}

export function applyConfigMutationRequest(currentConfig, request) {
  const nextConfig = cloneValue(currentConfig)

  for (const operation of request.operations) {
    if (operation.type === 'set') {
      setByPath(nextConfig, operation.path, operation.value)
      continue
    }

    if (operation.type === 'setShortcutKeyField') {
      const shortcutKey = nextConfig.shortcutKeyList.find(item => item.id === operation.id)
      if (!shortcutKey) {
        throw new TypeError(`未找到快捷键: ${operation.id}`)
      }
      shortcutKey[operation.field] = cloneValue(operation.value)
      continue
    }

    if (operation.type === 'setAutoSaveOption') {
      const optionSet = new Set(nextConfig.autoSave)
      if (operation.enabled) {
        optionSet.add(operation.option)
      } else {
        optionSet.delete(operation.option)
      }
      nextConfig.autoSave = Array.from(optionSet)
      continue
    }

    if (operation.type === 'reset') {
      return cloneValue(defaultConfig)
    }
  }

  return nextConfig
}
```

- [ ] **Step 3: 运行 schema 与 executor 测试，确认通过**

运行：

```bash
npm run test:run -- src/data/config/__tests__/configMutationSchema.test.js src/data/config/__tests__/configMutationExecutor.test.js
```

预期：

```text
PASS，覆盖未知路径、非法数组写法、按 id 更新快捷键、按集合语义更新 autoSave、reset。
```

- [ ] **Step 4: 对新增文件执行定点 ESLint**

运行：

```bash
npx eslint --fix src/data/config/configMutationSchema.js src/data/config/configMutationExecutor.js src/data/config/__tests__/configMutationSchema.test.js src/data/config/__tests__/configMutationExecutor.test.js
```

- [ ] **Step 5: 提交 mutation 核心实现**

运行：

```bash
git add src/data/config/configMutationSchema.js src/data/config/configMutationExecutor.js src/data/config/__tests__/configMutationSchema.test.js src/data/config/__tests__/configMutationExecutor.test.js
git commit -m "refactor(electron-config): add mutation executor"
```

### Task 3: 将 config service / config util 收口到唯一 `updateConfig`

**Files:**
- Modify: `wj-markdown-editor-electron/src/data/config/configService.js`
- Modify: `wj-markdown-editor-electron/src/data/configUtil.js`
- Modify: `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js`
- Modify: `wj-markdown-editor-electron/src/data/configUtil.test.js`

- [ ] **Step 1: 把 service 改成统一入口，删除 legacy setter**

目标实现：

```js
import { validateConfigMutationRequest } from './configMutationSchema.js'
import { applyConfigMutationRequest } from './configMutationExecutor.js'

async function updateConfig(request, recentStore) {
  return await runConfigUpdate(async () => {
    const previousConfig = getCurrentConfigOrDefault()
    let nextConfig = null

    try {
      validateConfigMutationRequest(request)
      nextConfig = normalizeConfigForWrite(
        applyConfigMutationRequest(previousConfig, request),
      )
    } catch {
      return createInvalidConfigResult()
    }

    const persistResult = await persistConfig(nextConfig)
    if (persistResult.ok === false) {
      return persistResult
    }

    if (nextConfig.recentMax !== previousConfig.recentMax) {
      await syncRecentMaxBestEffort(recentStore, nextConfig.recentMax)
    }

    return persistResult
  })
}

return {
  init,
  getConfig,
  updateConfig,
}
```

- [ ] **Step 2: 在 `configUtil.js` 只暴露统一更新方法**

目标实现：

```js
export default {
  initConfig: callback => configService.init(callback),
  getConfig: () => configService.getConfig(),
  updateConfig: (request, recentStore) => configService.updateConfig(request, recentStore),
  getDefaultConfig: () => cloneConfig(defaultConfig),
}
```

- [ ] **Step 3: 扩展 service 测试，锁定并发、写盘、recentMax 行为不退化**

新增测试示例：

```js
it('updateConfig 在 config 写盘失败时不得推进内存态和广播', async () => {
  await expect(service.updateConfig({
    operations: [
      { type: 'set', path: ['language'], value: 'en-US' },
    ],
  }, recentStore)).resolves.toEqual({
    ok: false,
    reason: 'config-write-failed',
    messageKey: 'message.configWriteFailed',
  })
})

it('updateConfig 并发排队时，后续 mutation 不得被旧快照覆盖', async () => {
  const first = service.updateConfig({
    operations: [
      { type: 'set', path: ['recentMax'], value: 3 },
    ],
  }, recentStore)

  const second = service.updateConfig({
    operations: [
      { type: 'set', path: ['theme', 'global'], value: 'dark' },
    ],
  }, recentStore)

  await expect(first).resolves.toEqual(expect.objectContaining({ ok: true }))
  await expect(second).resolves.toEqual(expect.objectContaining({ ok: true }))
})
```

- [ ] **Step 4: 运行 service / util 测试，确认旧接口已移除**

运行：

```bash
npm run test:run -- src/data/config/__tests__/configService.test.js src/data/configUtil.test.js
```

预期：

```text
PASS，且不再出现 setConfig / setThemeGlobal / setLanguage 的调用断言。
```

- [ ] **Step 5: 提交 service 收口改造**

运行：

```bash
git add src/data/config/configService.js src/data/configUtil.js src/data/config/__tests__/configService.test.js src/data/configUtil.test.js
git commit -m "refactor(electron-config): unify config service updates"
```

### Task 4: 收口 IPC，移除多个配置写事件

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`

- [ ] **Step 1: 把 IPC 写入口改为单一 `config.update`**

目标实现：

```js
'config.update': async (_windowContext, data) => {
  return await executeConfigUpdate(async () => await configUtil.updateConfig(data, recent))
},
```

需要删除：

```js
'user-update-config'
'user-update-theme-global'
'user-update-language'
```

- [ ] **Step 2: 更新 IPC 测试，删除旧事件断言，新增新协议测试**

新增测试示例：

```js
it('config.update 在配置服务整体成功时必须返回结构化成功结果', async () => {
  const payload = {
    operations: [
      { type: 'set', path: ['theme', 'global'], value: 'dark' },
    ],
  }

  configUpdateConfig.mockResolvedValueOnce({ ok: true })

  await expect(dispatch('config.update', payload)).resolves.toEqual({ ok: true })
  expect(configUpdateConfig).toHaveBeenCalledWith(payload, expect.objectContaining({
    setMax: recentSetMax,
  }))
})
```

- [ ] **Step 3: 运行 IPC 测试，确认新旧边界生效**

运行：

```bash
npm run test:run -- src/util/channel/ipcMainUtil.test.js
```

预期：

```text
PASS，配置写入口仅剩 config.update；读取型 get-config / get-default-config 继续保持原样。
```

- [ ] **Step 4: 对 IPC 文件执行定点 ESLint**

运行：

```bash
npx eslint --fix src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js
```

- [ ] **Step 5: 提交 IPC 收口改造**

运行：

```bash
git add src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js
git commit -m "refactor(electron-config): replace legacy ipc update events"
```

### Task 5: 新增 Renderer 侧 mutation 命令封装并迁移小型调用点

**Files:**
- Create: `wj-markdown-editor-web/src/util/config/configMutationCommandUtil.js`
- Create: `wj-markdown-editor-web/src/util/config/__tests__/configMutationCommandUtil.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutTop.vue`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/layoutTopFullScreenControl.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/util/file-manager/__tests__/fileManagerPanelController.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/components/layout/__tests__/fileManagerPanel.vitest.test.js`

- [ ] **Step 1: 新建 Renderer 命令封装，统一拼装 `config.update` payload**

目标实现：

```js
import channelUtil from '@/util/channel/channelUtil.js'

export function sendConfigMutationRequest(request) {
  return channelUtil.send({
    event: 'config.update',
    data: request,
  })
}

export function createSetConfigPathRequest(path, value) {
  return {
    operations: [
      { type: 'set', path, value },
    ],
  }
}

export function createBatchSetConfigPathRequest(pairList) {
  return {
    operations: pairList.map(item => ({
      type: 'set',
      path: item.path,
      value: item.value,
    })),
  }
}
```

- [ ] **Step 2: 迁移 `LayoutTop.vue`，不再使用专用主题/语言事件**

目标替换：

```js
const result = await sendConfigMutationRequest(
  createSetConfigPathRequest(['theme', 'global'], theme.value === 'light' ? 'dark' : 'light'),
)

const result = await sendConfigMutationRequest(
  createSetConfigPathRequest(['language'], lang),
)
```

- [ ] **Step 3: 迁移 `fileManagerPanelController.js`，排序改为 batch path 更新**

目标替换：

```js
const result = await sendCommand({
  event: 'config.update',
  data: {
    operations: [
      { type: 'set', path: ['fileManagerSort', 'field'], value: normalizedSortConfig.field },
      { type: 'set', path: ['fileManagerSort', 'direction'], value: normalizedSortConfig.direction },
    ],
  },
})
```

- [ ] **Step 4: 运行 Renderer 小型调用点测试**

在 `wj-markdown-editor-web/` 目录运行：

```bash
npm run test:component:run -- src/components/layout/__tests__/layoutTopFullScreenControl.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/file-manager/__tests__/fileManagerPanelController.vitest.test.js src/util/config/__tests__/configMutationCommandUtil.vitest.test.js
```

预期：

```text
PASS，且断言 payload 中不再出现 user-update-theme-global / user-update-language / user-update-config。
```

- [ ] **Step 5: 提交 Renderer 命令封装**

运行：

```bash
git add src/util/config/configMutationCommandUtil.js src/util/config/__tests__/configMutationCommandUtil.vitest.test.js src/components/layout/LayoutTop.vue src/util/file-manager/fileManagerPanelController.js src/components/layout/__tests__/layoutTopFullScreenControl.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/file-manager/__tests__/fileManagerPanelController.vitest.test.js
git commit -m "refactor(web-config): use mutation command util"
```

### Task 6: 重写 SettingView 提交流程，移除整份配置 deep watch 提交

**Files:**
- Create: `wj-markdown-editor-web/src/util/config/settingConfigMutationController.js`
- Create: `wj-markdown-editor-web/src/util/config/__tests__/settingConfigMutationController.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/SettingView.vue`
- Modify: `wj-markdown-editor-web/src/util/config/settingConfigDraftUtil.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/settingViewShortcutKey.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/settingViewFileManagerOption.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/settingViewPreviewPositionOption.test.js`
- Modify: `wj-markdown-editor-web/src/views/__tests__/settingViewInlineCodeClickCopyOption.test.js`

- [ ] **Step 1: 提取 SettingView 专用 mutation controller，保留本地 draft 但按字段提交**

目标实现：

```js
export function createSettingConfigMutationController(deps) {
  const {
    cloneConfigDraft,
    sendConfigMutationRequest,
    getFailureMessageKey,
  } = deps

  function createDraft(storeConfig) {
    return cloneConfigDraft(storeConfig)
  }

  async function commitPathUpdate(draftConfig, path, value) {
    const result = await sendConfigMutationRequest({
      operations: [
        { type: 'set', path, value },
      ],
    })

    return {
      result,
      nextDraft: cloneConfigDraft(draftConfig),
      messageKey: getFailureMessageKey(result),
    }
  }

  return {
    createDraft,
    commitPathUpdate,
  }
}
```

- [ ] **Step 2: 在 `SettingView.vue` 移除这段深度监听整份提交逻辑**

必须删除的旧逻辑：

```js
watch(() => config.value, (newValue) => {
  const nextConfig = cloneConfigDraft(newValue)
  channelUtil.send({ event: 'user-update-config', data: nextConfig })
}, { deep: true })
```

替换为字段级提交流程：

```js
async function submitConfigPath(path, value, applyDraft) {
  applyDraft()
  const { result, messageKey } = await settingConfigMutationController.commitPathUpdate(config.value, path, value)
  if (messageKey) {
    config.value = cloneConfigDraft(store.config)
    message.warning(t(messageKey))
  }
  return result
}
```

- [ ] **Step 3: 把数组与特殊集合改成专用提交方式**

关键替换示例：

```js
await sendConfigMutationRequest({
  operations: [
    { type: 'setAutoSaveOption', option: 'blur', enabled: true },
  ],
})

await sendConfigMutationRequest({
  operations: [
    { type: 'setShortcutKeyField', id: shortcutKey.id, field: 'keymap', value: keymap },
  ],
})

await sendConfigMutationRequest({
  operations: [
    { type: 'set', path: ['watermark', 'gap', 0], value: nextGapWidth },
  ],
})

await sendConfigMutationRequest({
  operations: [
    { type: 'reset' },
  ],
})
```

- [ ] **Step 4: 运行设置页测试，确认不再依赖整份 config 提交**

运行：

```bash
npm run test:component:run -- src/views/__tests__/settingViewShortcutKey.vitest.test.js src/views/__tests__/settingViewFileManagerOption.vitest.test.js src/views/__tests__/settingViewPreviewPositionOption.test.js src/views/__tests__/settingViewInlineCodeClickCopyOption.test.js src/util/config/__tests__/settingConfigMutationController.vitest.test.js
```

预期：

```text
PASS，断言发送 payload 时只包含 operations，不再出现整份 config 草稿。
```

- [ ] **Step 5: 提交 SettingView 重构**

运行：

```bash
git add src/util/config/settingConfigMutationController.js src/util/config/__tests__/settingConfigMutationController.vitest.test.js src/views/SettingView.vue src/util/config/settingConfigDraftUtil.js src/views/__tests__/settingViewShortcutKey.vitest.test.js src/views/__tests__/settingViewFileManagerOption.vitest.test.js src/views/__tests__/settingViewPreviewPositionOption.test.js src/views/__tests__/settingViewInlineCodeClickCopyOption.test.js
git commit -m "refactor(setting): submit config as field mutations"
```

### Task 7: 全量回归、死代码清理与交付检查

**Files:**
- Modify: `wj-markdown-editor-electron/src/data/configUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-web/src/views/SettingView.vue`
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutTop.vue`
- Modify: `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js`

- [ ] **Step 1: 扫描并清理旧入口与旧调用**

运行：

```bash
rg -n "user-update-config|user-update-theme-global|user-update-language|setConfigWithRecentMax|setThemeGlobal|setLanguage" wj-markdown-editor-electron\\src wj-markdown-editor-web\\src
```

预期：

```text
仅允许出现在历史测试快照或本次删除前的 diff 中；工作树最终代码不应再包含这些运行期入口。
```

- [ ] **Step 2: 分包执行定点 ESLint**

在 `wj-markdown-editor-electron/` 目录运行：

```bash
npx eslint --fix src/data/config/configService.js src/data/configUtil.js src/util/channel/ipcMainUtil.js src/data/config/__tests__/configService.test.js src/data/configUtil.test.js src/util/channel/ipcMainUtil.test.js
```

在 `wj-markdown-editor-web/` 目录运行：

```bash
npx eslint --fix src/util/config/configMutationCommandUtil.js src/util/config/settingConfigMutationController.js src/util/config/settingConfigDraftUtil.js src/views/SettingView.vue src/components/layout/LayoutTop.vue src/util/file-manager/fileManagerPanelController.js src/util/config/__tests__/configMutationCommandUtil.vitest.test.js src/util/config/__tests__/settingConfigMutationController.vitest.test.js src/views/__tests__/settingViewShortcutKey.vitest.test.js src/views/__tests__/settingViewFileManagerOption.vitest.test.js src/views/__tests__/settingViewPreviewPositionOption.test.js src/views/__tests__/settingViewInlineCodeClickCopyOption.test.js src/components/layout/__tests__/layoutTopFullScreenControl.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/file-manager/__tests__/fileManagerPanelController.vitest.test.js
```

- [ ] **Step 3: 执行完整相关测试矩阵**

在 `wj-markdown-editor-electron/` 目录运行：

```bash
npm run test:run -- src/data/config/__tests__/configMutationSchema.test.js src/data/config/__tests__/configMutationExecutor.test.js src/data/config/__tests__/configService.test.js src/data/configUtil.test.js src/util/channel/ipcMainUtil.test.js
```

在 `wj-markdown-editor-web/` 目录运行：

```bash
npm run test:component:run -- src/util/config/__tests__/configMutationCommandUtil.vitest.test.js src/util/config/__tests__/settingConfigMutationController.vitest.test.js src/views/__tests__/settingViewShortcutKey.vitest.test.js src/views/__tests__/settingViewFileManagerOption.vitest.test.js src/views/__tests__/settingViewPreviewPositionOption.test.js src/views/__tests__/settingViewInlineCodeClickCopyOption.test.js src/components/layout/__tests__/layoutTopFullScreenControl.vitest.test.js src/components/layout/__tests__/fileManagerPanel.vitest.test.js src/util/file-manager/__tests__/fileManagerPanelController.vitest.test.js
```

预期：

```text
PASS，且行为保持不变：主题切换、语言切换、排序切换、设置页字段更新、快捷键更新、重置配置、recentMax 同步均正常。
```

- [ ] **Step 4: 清理临时文件与运行痕迹**

运行：

```bash
git status --short
```

检查项：

```text
不得保留临时脚本、临时日志、临时 JSON、临时测试夹具副本；只保留源码、测试和本计划文档。
```

- [ ] **Step 5: 提交最终收尾**

运行：

```bash
git add docs/superpowers/plans/2026-04-16-electron-config-mutation-refactor.md wj-markdown-editor-electron/src wj-markdown-editor-web/src
git commit -m "refactor(config): unify electron config mutations"
```

## 验收标准

- Electron 运行期配置写 IPC 只剩 `config.update` 一个入口。
- Electron `configService` / `configUtil` 只剩一个统一写方法 `updateConfig`。
- Renderer 不再提交整份配置对象。
- `SettingView.vue` 不再对整份 `config.value` 使用 deep watch 后整份提交。
- `shortcutKeyList` 不存在按下标更新路径。
- `autoSave` 不存在整数组替换提交路径。
- `watermark.gap` 只允许固定下标字段更新。
- 写盘失败时内存态与广播不前移。
- 跨字段更新不再因旧草稿整份提交而覆盖不相关的新值。
- 用户可见功能不变。

## 建议的 subagent 分工

仅在开始执行本计划时使用，且所有 subagent 必须显式继承主会话当前模型与当前思考强度。

1. Electron 子任务代理
   负责 Task 1-4：`configMutationSchema`、`configMutationExecutor`、`configService`、`ipcMainUtil` 与对应测试。

2. Web 子任务代理
   负责 Task 5-6：`configMutationCommandUtil`、`settingConfigMutationController`、`LayoutTop.vue`、`fileManagerPanelController.js`、`SettingView.vue` 与对应测试。

3. 主会话集成与验收
   负责最终冲突处理、定点 ESLint、整体验证、清理临时文件、检查旧入口已清除。

## 风险提示

- `SettingView.vue` 体量较大，字段级提交重构时最容易漏掉某些输入控件。
- `shortcutKeyList` 与 `autoSave` 都是数组，但语义不同，不能复用同一套“按下标更新”逻辑。
- `recentMax` 有额外 recent 同步副作用，必须在写盘成功后再触发。
- 删除旧 IPC 事件后，任何残留调用点都会在运行期直接失效，所以必须用 `rg` 彻底扫净。

## 完成定义

满足以下条件才算完成：

- 代码、测试、ESLint 全部通过。
- 运行期不再存在整份配置提交路径。
- 旧配置写 IPC 入口和 legacy setter 已从工作代码中删除。
- 无临时文件残留。
- 最终改动只属于“内部配置管理重构”，不引入额外功能差异。
