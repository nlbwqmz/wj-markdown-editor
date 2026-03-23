# Electron Config Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有配置文件路径语义、IPC 读取契约和非配置功能行为的前提下，将 Electron 端配置模块重构为 `schema + repair + repository + service` 的分层结构，并补齐配置更新失败的国际化提示链路。

**Architecture:** 继续保留 `wj-markdown-editor-electron/src/data/configUtil.js` 作为兼容外观层，内部转调新的 `configService`。`configService` 负责内存态与广播，`configRepository` 负责路径与原子写，`configRepairUtil` 负责兼容修复，`configSchema` 负责结构约束；`ipcMainUtil.js` 只为配置更新型 IPC 增加结构化结果返回，`get-config` 和 `get-default-config` 继续返回原始配置快照。

**Tech Stack:** Electron 39、Node ESM、Vitest 4、Vue 3、vue-i18n、Ajv、write-file-atomic

---

## File Map

- Modify: `wj-markdown-editor-electron/package.json`
- Modify: `wj-markdown-editor-electron/package-lock.json`
- Modify: `wj-markdown-editor-electron/src/data/defaultConfig.js`
- Modify: `wj-markdown-editor-electron/src/data/configUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`
- Modify: `wj-markdown-editor-web/src/views/SettingView.vue`
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutTop.vue`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/i18n/__tests__/message.test.js`
- Create: `wj-markdown-editor-electron/src/data/config/configConstants.js`
- Create: `wj-markdown-editor-electron/src/data/config/configSchema.js`
- Create: `wj-markdown-editor-electron/src/data/config/configSnapshotUtil.js`
- Create: `wj-markdown-editor-electron/src/data/config/configRepairUtil.js`
- Create: `wj-markdown-editor-electron/src/data/config/configRepository.js`
- Create: `wj-markdown-editor-electron/src/data/config/configService.js`
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js`
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configSnapshotUtil.test.js`
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configRepairUtil.test.js`
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configRepository.test.js`
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js`
- Create: `wj-markdown-editor-electron/src/data/configUtil.test.js`
- Create: `wj-markdown-editor-web/src/util/config/configUpdateResultUtil.js`
- Create: `wj-markdown-editor-web/src/util/config/__tests__/configUpdateResultUtil.test.js`

## Scope Guards

- `get-config`、`get-default-config` 继续返回原始 payload，不改成 `{ ok, data }`
- 只为 `user-update-config`、`user-update-theme-global`、`user-update-language` 增加结构化返回
- `recentMax` 仍由 `ipcMainUtil.js` 在配置更新成功后触发 `recent.setMax(...)`，不并入 `configService` 事务
- 不修改 `recent.js`、`document-session` 主链路、导出、截图、资源处理的可观察行为
- 开发环境路径继续使用 `app.getAppPath()/config.json`，打包环境继续使用 `Documents/wj-markdown-editor/config.json`

## Preflight

- [ ] **Step 0: 确认当前工作在约定分支**

Run: `git branch --show-current`  
Expected: `refactor/electron-config-layer`

如果不是该分支，先执行：

```bash
git switch refactor/electron-config-layer || git switch -c refactor/electron-config-layer
```

### Task 1: 建立配置基础模块与依赖

**Files:**
- Modify: `wj-markdown-editor-electron/package.json`
- Modify: `wj-markdown-editor-electron/package-lock.json`
- Create: `wj-markdown-editor-electron/src/data/config/configConstants.js`
- Create: `wj-markdown-editor-electron/src/data/config/configSchema.js`
- Create: `wj-markdown-editor-electron/src/data/config/configSnapshotUtil.js`
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configSchema.test.js`
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configSnapshotUtil.test.js`

- [ ] **Step 1: 写基础模块的失败测试**

```js
import { describe, expect, it } from 'vitest'
import { cloneConfig } from '../configSnapshotUtil.js'
import { validateConfigShape } from '../configSchema.js'

describe('configSnapshotUtil', () => {
  it('必须返回深拷贝，防止调用方回写内存态', () => {
    const source = { theme: { global: 'light' } }
    const snapshot = cloneConfig(source)
    snapshot.theme.global = 'dark'
    expect(source.theme.global).toBe('light')
  })
})

describe('configSchema', () => {
  it('非法 language 必须被识别为 schema 违规', () => {
    expect(() => validateConfigShape({ language: 'jp-JP' })).toThrow()
  })
})
```

- [ ] **Step 2: 运行基础测试，确认当前缺少模块时会失败**

Run: `npm run test:run -- src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configSnapshotUtil.test.js`  
Expected: FAIL，提示缺少模块或导出符号

- [ ] **Step 3: 安装并声明新依赖**

Run: `npm install ajv write-file-atomic`

修改 `package.json`，确保依赖明确入库：

```json
{
  "dependencies": {
    "ajv": "^8.x",
    "write-file-atomic": "^6.x"
  }
}
```

- [ ] **Step 4: 实现常量、schema 与快照工具**

```js
// configConstants.js
export const configVersion = 1
export const configFileName = 'config.json'
export function resolveConfigDir(app) {
  return app.isPackaged
    ? path.resolve(app.getPath('documents'), 'wj-markdown-editor')
    : app.getAppPath()
}
```

```js
// configSnapshotUtil.js
export function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config))
}
```

```js
// configSchema.js
const schema = {
  type: 'object',
  properties: {
    language: { enum: ['zh-CN', 'en-US'] },
    recentMax: { type: 'number', minimum: 0, maximum: 50 },
  },
}
```

- [ ] **Step 5: 运行基础测试，确认新模块可用**

Run: `npm run test:run -- src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configSnapshotUtil.test.js`  
Expected: PASS

- [ ] **Step 6: 提交本任务**

```bash
git add package.json package-lock.json src/data/config/configConstants.js src/data/config/configSchema.js src/data/config/configSnapshotUtil.js src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configSnapshotUtil.test.js
git commit -m "refactor(config): add config base modules"
```

### Task 2: 提取兼容修复逻辑

**Files:**
- Modify: `wj-markdown-editor-electron/src/data/defaultConfig.js`
- Create: `wj-markdown-editor-electron/src/data/config/configRepairUtil.js`
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configRepairUtil.test.js`

- [ ] **Step 1: 先写 repair 失败测试，锁定现有兼容行为**

```js
it('必须删除不存在的快捷键并补齐缺失项', () => {
  const repaired = repairConfig({
    shortcutKeyList: [{ id: 'unknown', index: 999 }],
  })
  expect(repaired.shortcutKeyList.some(item => item.id === 'unknown')).toBe(false)
  expect(repaired.shortcutKeyList.some(item => item.id === 'save')).toBe(true)
})

it('旧 preview 主题 github-light 必须修正为 github', () => {
  const repaired = repairConfig({ theme: { preview: 'github-light' } })
  expect(repaired.theme.preview).toBe('github')
})
```

- [ ] **Step 2: 运行 repair 测试，确认当前实现尚未抽离**

Run: `npm run test:run -- src/data/config/__tests__/configRepairUtil.test.js`  
Expected: FAIL，提示 `repairConfig` 未实现

- [ ] **Step 3: 在默认配置和 repair 模块中固化兼容语义**

```js
// defaultConfig.js
export default {
  configVersion: 1,
  // ...
}
```

```js
// configRepairUtil.js
export function repairConfig(rawConfig, defaultConfig) {
  const merged = mergeAndPrune(rawConfig, defaultConfig)
  merged.shortcutKeyList = repairShortcutKeyList(merged.shortcutKeyList, defaultConfig.shortcutKeyList)
  if (merged.theme.preview === 'github-light') {
    merged.theme.preview = 'github'
  }
  return merged
}
```

- [ ] **Step 4: 运行 repair 测试，确认旧行为被测试锁定**

Run: `npm run test:run -- src/data/config/__tests__/configRepairUtil.test.js`  
Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/data/defaultConfig.js src/data/config/configRepairUtil.js src/data/config/__tests__/configRepairUtil.test.js
git commit -m "refactor(config): extract repair rules"
```

### Task 3: 引入配置仓储与原子写

**Files:**
- Create: `wj-markdown-editor-electron/src/data/config/configRepository.js`
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configRepository.test.js`

- [ ] **Step 1: 先写 repository 失败测试**

```js
it('开发环境必须继续使用 app.getAppPath 下的 config.json', async () => {
  const repository = createConfigRepository({ app: fakeDevApp })
  expect(repository.getConfigPath()).toMatch(/[\\/]config\.json$/)
})

it('JSON 解析失败时必须备份损坏文件并回退默认配置流程', async () => {
  await expect(repository.readParsedConfig()).rejects.toThrow('CONFIG_PARSE_FAILED')
})
```

- [ ] **Step 2: 运行 repository 测试，确认原子写仓储尚未实现**

Run: `npm run test:run -- src/data/config/__tests__/configRepository.test.js`  
Expected: FAIL

- [ ] **Step 3: 实现目录解析、读取、原子写和损坏备份**

```js
export function createConfigRepository({ app, fs, writeFileAtomic }) {
  return {
    async ensureConfigDir() { /* ... */ },
    async readConfigText() { /* ... */ },
    async writeConfigText(text) {
      await writeFileAtomic(configPath, text, { encoding: 'utf8' })
    },
    async backupCorruptedConfig(rawText) { /* ... */ },
  }
}
```

- [ ] **Step 4: 运行 repository 测试，确认路径语义和原子写都被锁定**

Run: `npm run test:run -- src/data/config/__tests__/configRepository.test.js`  
Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/data/config/configRepository.js src/data/config/__tests__/configRepository.test.js
git commit -m "refactor(config): add config repository"
```

### Task 4: 实现配置服务与兼容外观层

**Files:**
- Create: `wj-markdown-editor-electron/src/data/config/configService.js`
- Create: `wj-markdown-editor-electron/src/data/config/__tests__/configService.test.js`
- Create: `wj-markdown-editor-electron/src/data/configUtil.test.js`
- Modify: `wj-markdown-editor-electron/src/data/configUtil.js`

- [ ] **Step 1: 先写 service 行为测试**

```js
it('初始化时必须在 repair 后保存内存快照，并在必要时回写规范化配置', async () => {
  const service = createConfigService(deps)
  await service.init()
  expect(service.getConfig().theme.preview).toBe('github')
})

it('运行期写盘失败时，内存态与广播都不能前移', async () => {
  await expect(service.setConfig({ language: 'en-US' })).resolves.toEqual({
    ok: false,
    reason: 'config-write-failed',
    messageKey: 'message.configWriteFailed',
  })
})
```

- [ ] **Step 2: 运行 service 与 facade 测试，确认当前外观层还未代理新服务**

Run: `npm run test:run -- src/data/config/__tests__/configService.test.js src/data/configUtil.test.js`  
Expected: FAIL

- [ ] **Step 3: 实现 service，并让 `configUtil.js` 退化成兼容代理**

```js
// configService.js
export function createConfigService(deps) {
  let currentConfig = null
  let updateCallback = null

  return {
    async init(callback) { /* 初始化与规范化回写 */ },
    getConfig() { return cloneConfig(currentConfig) },
    async setConfig(nextPartial) { /* 先写盘，后切内存，再广播 */ },
    async setThemeGlobal(theme) { /* ... */ },
    async setLanguage(language) { /* ... */ },
  }
}
```

```js
// configUtil.js
export default {
  initConfig: callback => configService.init(callback),
  getConfig: () => configService.getConfig(),
  setConfig: data => configService.setConfig(data),
  setThemeGlobal: data => configService.setThemeGlobal(data),
  setLanguage: data => configService.setLanguage(data),
}
```

- [ ] **Step 4: 运行 service、facade 与现有依赖方测试**

Run: `npm run test:run -- src/data/config/__tests__/configService.test.js src/data/configUtil.test.js src/util/win/exportUtil.test.js src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js src/util/document-session/__tests__/windowLifecycleService.test.js src/util/protocolUtil.test.js`  
Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/data/config/configService.js src/data/config/__tests__/configService.test.js src/data/configUtil.js src/data/configUtil.test.js
git commit -m "refactor(config): add config service facade"
```

### Task 5: 为配置更新型 IPC 增加结构化结果

**Files:**
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js`

- [ ] **Step 1: 先写 IPC 失败测试**

```js
it('user-update-config 在配置写盘失败时必须返回 messageKey，而不是直接抛出中文提示', async () => {
  setConfigMock.mockResolvedValueOnce({
    ok: false,
    reason: 'config-write-failed',
    messageKey: 'message.configWriteFailed',
  })
  await expect(dispatch('user-update-config', payload)).resolves.toEqual({
    ok: false,
    reason: 'config-write-failed',
    messageKey: 'message.configWriteFailed',
  })
})
```

- [ ] **Step 2: 运行 IPC 配置更新测试，确认当前事件仍然返回 `undefined`**

Run: `npm run test:run -- src/util/channel/ipcMainUtil.test.js`  
Expected: FAIL，至少失败在 `user-update-config` / `user-update-theme-global` / `user-update-language` 的新断言

- [ ] **Step 3: 实现更新型 IPC 的结构化返回，并隔离 `recentMax` 副作用**

```js
'user-update-config': async (_windowContext, data) => {
  const result = await configUtil.setConfig(data)
  if (result?.ok !== true) {
    return result
  }

  try {
    await recent.setMax(data.recentMax)
  } catch (error) {
    // 仅记录日志，不回滚已成功的配置写入
  }

  return { ok: true }
}
```

- [ ] **Step 4: 运行 IPC 测试，确认读取型 IPC 仍保持旧契约**

Run: `npm run test:run -- src/util/channel/ipcMainUtil.test.js`  
Expected: PASS，且 `get-config`、`get-default-config` 相关断言保持原样

- [ ] **Step 5: 提交本任务**

```bash
git add src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js
git commit -m "refactor(config): return structured config update results"
```

### Task 6: 接入前端国际化失败提示

**Files:**
- Modify: `wj-markdown-editor-web/src/views/SettingView.vue`
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutTop.vue`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`
- Modify: `wj-markdown-editor-web/src/i18n/__tests__/message.test.js`
- Create: `wj-markdown-editor-web/src/util/config/configUpdateResultUtil.js`
- Create: `wj-markdown-editor-web/src/util/config/__tests__/configUpdateResultUtil.test.js`

- [ ] **Step 1: 先写前端映射工具失败测试**

```js
it('配置更新失败结果必须映射出可直接用于 i18n 的 messageKey', () => {
  expect(getConfigUpdateFailureMessageKey({
    ok: false,
    reason: 'config-write-failed',
    messageKey: 'message.configWriteFailed',
  })).toBe('message.configWriteFailed')
})
```

- [ ] **Step 2: 运行前端工具与 i18n 测试，确认新 key 尚未接入**

Run: `npm run test:run -- src/util/config/__tests__/configUpdateResultUtil.test.js src/i18n/__tests__/message.test.js`  
Workdir: `wj-markdown-editor-web`  
Expected: FAIL

- [ ] **Step 3: 实现结果映射工具，并同时接入设置页与顶部主题/语言切换**

```js
// configUpdateResultUtil.js
export function getConfigUpdateFailureMessageKey(result) {
  return result?.ok === false ? result.messageKey || 'message.configWriteFailed' : null
}
```

```js
// SettingView.vue
watch(() => config.value, (newValue) => {
  channelUtil.send({ event: 'user-update-config', data: clone })
    .then((result) => {
      const messageKey = getConfigUpdateFailureMessageKey(result)
      if (messageKey) {
        message.warning(t(messageKey))
      }
    })
    .catch(() => {
      message.warning(t('message.configWriteFailed'))
    })
  closePreviewSearchBar()
}, { deep: true })
```

```js
// LayoutTop.vue
async function toggleTheme() {
  const result = await channelUtil.send({
    event: 'user-update-theme-global',
    data: theme.value === 'light' ? 'dark' : 'light',
  })
  const messageKey = getConfigUpdateFailureMessageKey(result)
  if (messageKey) {
    message.warning(t(messageKey))
  }
}
```

```js
async function changeLanguage(lang) {
  const result = await channelUtil.send({
    event: 'user-update-language',
    data: lang,
  })
  const messageKey = getConfigUpdateFailureMessageKey(result)
  if (messageKey) {
    message.warning(t(messageKey))
  }
}
```

- [ ] **Step 4: 补齐中英文文案**

```js
message: {
  configWriteFailed: '配置保存失败，请稍后重试。',
  configReadFailed: '读取配置失败，已回退到默认配置。',
  configDirectoryUnavailable: '配置目录不可用，请检查权限。',
}
```

- [ ] **Step 5: 运行前端测试，确认 messageKey 与文案齐全**

Run: `npm run test:run -- src/util/config/__tests__/configUpdateResultUtil.test.js src/i18n/__tests__/message.test.js`  
Workdir: `wj-markdown-editor-web`  
Expected: PASS

- [ ] **Step 6: 提交本任务**

```bash
git add src/views/SettingView.vue src/components/layout/LayoutTop.vue src/i18n/zhCN.js src/i18n/enUS.js src/i18n/__tests__/message.test.js src/util/config/configUpdateResultUtil.js src/util/config/__tests__/configUpdateResultUtil.test.js
git commit -m "feat(config): show localized config update failures"
```

### Task 7: 运行针对性回归验证并格式化修改文件

**Files:**
- Modify: `wj-markdown-editor-electron/src/data/configUtil.js`
- Modify: `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- Modify: `wj-markdown-editor-web/src/views/SettingView.vue`
- Modify: `wj-markdown-editor-web/src/components/layout/LayoutTop.vue`
- Modify: `wj-markdown-editor-web/src/i18n/zhCN.js`
- Modify: `wj-markdown-editor-web/src/i18n/enUS.js`

- [ ] **Step 1: 运行 Electron 侧全部相关测试**

Run: `npm run test:run -- src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configSnapshotUtil.test.js src/data/config/__tests__/configRepairUtil.test.js src/data/config/__tests__/configRepository.test.js src/data/config/__tests__/configService.test.js src/data/configUtil.test.js src/util/channel/ipcMainUtil.test.js src/util/win/exportUtil.test.js src/util/document-session/__tests__/windowLifecycleService.runtime-init.test.js src/util/document-session/__tests__/windowLifecycleService.test.js src/util/protocolUtil.test.js`  
Workdir: `wj-markdown-editor-electron`  
Expected: PASS

- [ ] **Step 2: 运行 Web 侧相关测试**

Run: `npm run test:run -- src/util/config/__tests__/configUpdateResultUtil.test.js src/i18n/__tests__/message.test.js`  
Workdir: `wj-markdown-editor-web`  
Expected: PASS

- [ ] **Step 3: 对修改文件执行分包 ESLint 格式化**

Run: `npx eslint --fix src/data/configUtil.js src/util/channel/ipcMainUtil.js src/data/defaultConfig.js src/data/config/configConstants.js src/data/config/configSchema.js src/data/config/configSnapshotUtil.js src/data/config/configRepairUtil.js src/data/config/configRepository.js src/data/config/configService.js src/data/configUtil.test.js src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configSnapshotUtil.test.js src/data/config/__tests__/configRepairUtil.test.js src/data/config/__tests__/configRepository.test.js src/data/config/__tests__/configService.test.js`  
Workdir: `wj-markdown-editor-electron`

Run: `npx eslint --fix src/views/SettingView.vue src/components/layout/LayoutTop.vue src/i18n/zhCN.js src/i18n/enUS.js src/i18n/__tests__/message.test.js src/util/config/configUpdateResultUtil.js src/util/config/__tests__/configUpdateResultUtil.test.js`  
Workdir: `wj-markdown-editor-web`

- [ ] **Step 4: 做最小手工回归**

Run:

```bash
# Terminal 1
cd wj-markdown-editor-web
npm run dev

# Terminal 2
cd wj-markdown-editor-electron
npm run start
```

检查：
- 设置页能读取并展示现有配置
- 修改主题或语言后，现有窗口仍收到 `update-config`
- 打开 Markdown、保存、另存为链路未受影响
- recent 数量调整后，recent 列表功能仍可用
- 导出、截图、资源操作仍能读取完整配置

- [ ] **Step 5: 提交验证结果**

```bash
git add src/data/defaultConfig.js src/data/configUtil.js src/data/configUtil.test.js src/data/config/configConstants.js src/data/config/configSchema.js src/data/config/configSnapshotUtil.js src/data/config/configRepairUtil.js src/data/config/configRepository.js src/data/config/configService.js src/data/config/__tests__/configSchema.test.js src/data/config/__tests__/configSnapshotUtil.test.js src/data/config/__tests__/configRepairUtil.test.js src/data/config/__tests__/configRepository.test.js src/data/config/__tests__/configService.test.js src/util/channel/ipcMainUtil.js src/util/channel/ipcMainUtil.test.js
git add src/views/SettingView.vue src/components/layout/LayoutTop.vue src/i18n/zhCN.js src/i18n/enUS.js src/i18n/__tests__/message.test.js src/util/config/configUpdateResultUtil.js src/util/config/__tests__/configUpdateResultUtil.test.js
git add package.json package-lock.json
git commit -m "test(config): verify config layer refactor regression coverage"
```
