# wj-markdown-editor 项目上下文

## 项目概述

一款开源桌面端 Markdown 编辑器，支持 Windows 和 Linux。整体架构为 Electron 39 + Vue 3 + Vite 6。

和旧版本相比，当前代码主线已经明显收口到“文档会话”模型：

- Web 端不再依赖零散的文件状态镜像，而是以 `Pinia store.documentSessionSnapshot` 作为渲染层真相。
- Electron 端通过 `documentSessionRuntime`、`windowLifecycleService`、`documentCommandService`、`documentEffectService` 统一处理打开、编辑、保存、关闭、外部变更、最近文件与资源操作。
- Renderer 与主进程之间围绕 `document.*` 命令和 `document.snapshot.changed` 事件通信，资源打开/删除也统一经 runtime 裁决。

### 当前核心特性

- 支持本地 Markdown 文件打开、编辑、另存为副本
- 支持最近文件恢复、缺失最近文件提示、单实例文件打开
- 支持本地图片、网络图片、本地附件、音频、视频插入
- 支持截图上传、隐藏窗口截图、图片上传图床（GitHub / SM.MS）
- 支持暗黑模式、代码高亮主题、预览主题、分区字体设置
- 支持精准同步滚动、滚动锚点恢复、编辑区与预览区关联高亮
- 支持公式（KaTeX）、Mermaid、GitHub Alert、自定义 Container、脚注、图片尺寸、文字颜色
- 支持预览区资源右键菜单、在资源所在目录中打开、删除当前引用、删除全部引用、按策略删除本地文件
- 支持外部文件变更监听，可配置为直接应用或弹出 diff 对比确认
- 支持全文搜索、编辑区搜索、设置页搜索定位
- 支持导出 PDF、PNG、JPEG
- 支持水印、自定义快捷键、自动保存、启动页切换

## 项目结构

```text
wj-markdown-editor/
├── docs/                              # 项目文档
├── release-notes/                     # 发布说明
├── wj-markdown-editor-web/            # Vue 3 渲染层
│   ├── src/
│   │   ├── assets/                    # 全局样式、主题、图片
│   │   ├── components/
│   │   │   ├── editor/                # 编辑器、预览、工具栏、资源右键菜单
│   │   │   └── layout/                # 主布局与其他窗口布局
│   │   ├── i18n/                      # 中英文文案
│   │   ├── router/                    # 路由定义
│   │   ├── stores/                    # Pinia，全局配置与文档快照状态
│   │   ├── util/
│   │   │   ├── channel/               # IPC 通信与窗口事件桥接
│   │   │   ├── document-session/      # Renderer 侧文档快照、命令与激活策略
│   │   │   ├── editor/                # 编辑器行为、滚动、补全、资源操作
│   │   │   ├── guide/                 # 引导页文案
│   │   │   └── markdown-it/           # Markdown 解析扩展
│   │   ├── views/                     # 编辑、预览、设置、导出、关于、引导页
│   │   └── main.js
│   ├── vite.config.js
│   └── package.json
└── wj-markdown-editor-electron/       # Electron 主进程与桌面能力
    ├── src/
    │   ├── data/                      # 配置、最近文件、默认配置
    │   ├── util/
    │   │   ├── channel/               # IPC 主进程入口
    │   │   ├── document-session/      # 文档运行时、命令、effect、窗口生命周期
    │   │   ├── win/                   # 设置、导出、引导、关于、截图窗口能力
    │   │   └── *.js / *.test.js       # 资源、协议、更新、上传、监听等工具
    │   ├── main.js
    │   └── preload.js
    └── package.json
```

## 最新主线架构

### Web 端状态与路由

- 路由定义位于 `wj-markdown-editor-web/src/router/index.js`
- 主路由结构：
  - `/#/editor` 编辑页
  - `/#/preview` 预览页
  - `/#/setting` 设置页
  - `/#/export` 导出页
  - `/#/about` 关于页
  - `/#/guide` 引导页
- `wj-markdown-editor-web/src/stores/counter.js` 是当前全局 store 入口，维护：
  - `config`
  - `documentSessionSnapshot`
  - `recentList`
  - `externalFileChange`
  - 兼容字段 `fileName`、`saved`

### Renderer 文档会话链路

- 文档真相由 `wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js` 统一归一化。
- 编辑页 `wj-markdown-editor-web/src/views/EditorView.vue` 通过以下模块驱动：
  - `rendererDocumentCommandUtil.js` 发送 `document.edit`、`document.save`、`document.save-copy`、`document.get-session-snapshot`
  - `rendererSessionSnapshotController.js` 协调首次加载、激活重放、缺失最近文件提示
  - `rendererSessionActivationStrategy.js` 处理 keep-alive 激活恢复策略
  - `createRendererSessionEventSubscription()` 监听 `document.snapshot.changed`
- 当前编辑流不要再新增绕过 `document-session` 的旧式状态通道。

### Electron 文档运行时链路

- 应用入口 `wj-markdown-editor-electron/src/main.js` 负责：
  - 初始化 `documentSessionRuntime`
  - 注册 `wj://` 自定义协议
  - 配置单实例锁
  - 启动时打开文件、恢复最近文件或创建草稿窗口
- `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js` 是统一 runtime 入口：
  - `document.edit`
  - `document.save`
  - `document.save-copy`
  - `document.request-open-dialog`
  - `document.open-path`
  - `document.get-session-snapshot`
  - `document.external.apply`
  - `document.external.ignore`
  - `document.resource.open-in-folder`
  - `document.resource.delete-local`
  - `resource.get-info`
- `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js` 负责窗口创建、关闭链路、外部文件监听、保存等待、最近文件维护与 BrowserWindow 生命周期。

### 资源操作主线

- 预览区资源菜单位于 `wj-markdown-editor-web/src/components/editor/PreviewAssetContextMenu.vue`
- Renderer 侧资源删除相关逻辑位于：
  - `previewAssetSessionController.js`
  - `previewAssetDeleteDecisionUtil.js`
  - `previewAssetDeleteConfirmController.js`
  - `previewAssetRemovalUtil.js`
- 主进程资源处理统一经 runtime 与资源服务完成，不要在 Web 端自行拼接平台路径或直接假设删除权限。

### 外部文件变更主线

- 配置项 `externalFileChangeStrategy` 位于默认配置 `wj-markdown-editor-electron/src/data/defaultConfig.js`
- 取值：
  - `apply`：自动应用磁盘最新内容
  - `prompt`：弹出差异对比，由用户选择忽略或应用
- 差异对比弹窗组件为 `wj-markdown-editor-web/src/components/ExternalFileChangeModal.vue`，基于 `diff` + `diff2html` 生成并排对比视图。

## 技术栈

### Web 前端（`wj-markdown-editor-web`）

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3.5（Composition API + `<script setup>`） |
| 构建工具 | Vite 6 |
| 路由 | Vue Router 4 |
| 状态管理 | Pinia 3 |
| UI 组件库 | Ant Design Vue 4 |
| 样式方案 | UnoCSS + SCSS |
| 编辑器 | CodeMirror 6 |
| Markdown 解析 | markdown-it 14 + 自定义扩展 |
| 图表渲染 | Mermaid 11 |
| 差异对比 | diff + diff2html |
| 公式渲染 | KaTeX |
| 国际化 | vue-i18n 11 |
| 测试 | Node 内置 `node:test` |

### Electron 桌面端（`wj-markdown-editor-electron`）

| 类别 | 技术 |
|------|------|
| 框架 | Electron 39.2.7 |
| 构建工具 | electron-builder 26 |
| 自动更新 | electron-updater |
| 日志 | electron-log |
| 截图 | electron-screenshots |
| 文件操作 | fs-extra |
| 调度 | node-schedule |
| 测试 | Vitest 4 |

## Markdown 能力

### 当前已接入的 markdown-it 插件

- `markdown-it-sup` / `markdown-it-sub`
- `markdown-it-ins` / `markdown-it-mark`
- `markdown-it-deflist`
- `markdown-it-task-lists`
- `markdown-it-github-alerts`
- `markdown-it-container`
- `markdown-it-anchor`
- `@vscode/markdown-it-katex`
- `@mdit/plugin-img-size`
- `@mdit/plugin-footnote`

### 当前自定义扩展

- `markdownItCodeBlock.js`：代码块渲染，包含 Mermaid 代码块输出
- `markdownItContainerUtil.js`：容器扩展，当前支持 `info`、`warning`、`danger`、`tip`、`important`、`details`
- `markdownItTextColor.js`：文字颜色
- `markdownItImage.js`：本地图片协议与资源路径处理
- `markdownItLink.js`：链接 `_blank`
- `markdownItLineNumber.js`：预览行号映射
- `markdownItVideo.js`：视频渲染
- `markdownItAudio.js`：音频渲染

## 构建、运行与测试命令

### Web 前端（在 `wj-markdown-editor-web/` 目录执行）

```bash
# 开发模式（端口 8080）
npm run dev

# 构建到 ../wj-markdown-editor-electron/web-dist
npm run build

# 预览构建结果
npm run preview

# 测试
npm run test
npm run test:run
```

### Electron 桌面端（在 `wj-markdown-editor-electron/` 目录执行）

```bash
# 开发模式（需先在 web 目录启动 `npm run dev`，Electron 会连接 http://localhost:8080）
npm run start

# 使用已构建的 web-dist 直接启动 Electron
npm run static

# 构建安装包
npm run build

# 一键安装依赖并构建 Web + Electron
npm run make

# 仅限 electron 包内文件的 ESLint 修复
npm run lint

# 测试
npm run test
npm run test:run
```

### 构建产物

- Web 构建输出到 `wj-markdown-editor-electron/web-dist`
- Electron 构建输出目录为 `wj-markdown-editor-electron/electron-build`
- Windows：`nsis` 安装包 + `zip`
- Linux：`deb` + `rpm`

## 开发规范

### ESLint 与格式化

项目使用 `@antfu/eslint-config` 作为基础配置。

补充要求：

- 修改或新增文件后，必须在对应包目录下使用该包自己的 ESLint 配置进行格式化，不得跨包混用配置。
- `wj-markdown-editor-web` 下的文件，需要在 `wj-markdown-editor-web/` 目录中按文件执行 ESLint 格式化；如果修改了多个文件，则一次传入多个文件路径一起格式化，例如：`npx eslint --fix <文件路径1> <文件路径2>`，不要执行全局格式化。
- `wj-markdown-editor-electron` 下的文件，需要在 `wj-markdown-editor-electron/` 目录中按文件执行 ESLint 格式化；如果修改了多个文件，则一次传入多个文件路径一起格式化，例如：`npx eslint --fix <文件路径1> <文件路径2>`，不要执行全局格式化。

### 代码风格

- 使用 Vue 3 Composition API（`<script setup>`）
- 使用 ES Modules（`type: "module"`）
- 样式使用 SCSS + UnoCSS
- CSS 单位使用 px，通过 `postcss-pxtorem` 转换，`rootValue: 16`
- 代码注释、文档统一使用中文

### 文件命名

- 组件文件：PascalCase，例如 `MarkdownEdit.vue`
- 工具文件：camelCase，例如 `commonUtil.js`
- 样式文件：kebab-case，例如 `code-theme.scss`

## 关键模块说明

### Web 端核心页面

- `wj-markdown-editor-web/src/views/EditorView.vue`
  - 编辑页主入口
  - 负责会话快照加载、编辑器内容同步、预览资源右键菜单与资源删除流程
- `wj-markdown-editor-web/src/views/PreviewView.vue`
  - 预览页
- `wj-markdown-editor-web/src/views/SettingView.vue`
  - 设置页，涵盖通用配置、字体、视图、编辑器、文件、图片、图床、快捷键、水印、导出
- `wj-markdown-editor-web/src/views/ExportView.vue`
  - 导出窗口渲染页

### Web 端编辑器与搜索

- `wj-markdown-editor-web/src/components/editor/MarkdownEdit.vue`
  - 主编辑器组件，组合编辑区与预览区
- `wj-markdown-editor-web/src/components/editor/MarkdownPreview.vue`
  - Markdown 预览，负责 Mermaid 渲染与预览区资源交互
- `wj-markdown-editor-web/src/components/editor/EditorToolbar.vue`
  - 编辑工具栏
- `wj-markdown-editor-web/src/components/editor/EditorSearchBar.vue`
  - 编辑区搜索栏
- `wj-markdown-editor-web/src/util/editor/composables/`
  - 编辑器核心、同步滚动、视图锚点、工具栏构建等组合逻辑
- `wj-markdown-editor-web/src/util/searchBarController.js`
  - 设置页/预览区搜索控制器

### Renderer 文档会话模块

- `wj-markdown-editor-web/src/util/document-session/documentSessionEventUtil.js`
  - 统一事件名与命令名常量
- `wj-markdown-editor-web/src/util/document-session/rendererDocumentCommandUtil.js`
  - Renderer 对 runtime 命令的调用封装
- `wj-markdown-editor-web/src/util/document-session/rendererSessionSnapshotController.js`
  - 编辑页快照控制器
- `wj-markdown-editor-web/src/util/document-session/rendererSessionEventSubscription.js`
  - 会话事件订阅
- `wj-markdown-editor-web/src/util/document-session/documentSessionSnapshotUtil.js`
  - snapshot 归一化与 store 派生

### Electron 端文档运行时

- `wj-markdown-editor-electron/src/util/document-session/documentSessionRuntime.js`
  - 文档会话统一入口
- `wj-markdown-editor-electron/src/util/document-session/documentCommandService.js`
  - 文档状态命令分发
- `wj-markdown-editor-electron/src/util/document-session/documentEffectService.js`
  - 打开、保存、提示、recent、snapshot 查询等副作用执行
- `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
  - 窗口创建、关闭、外部监听、保存等待、window -> session 绑定
- `wj-markdown-editor-electron/src/util/document-session/documentResourceService.js`
  - 文档资源信息、删除、本地资源路径能力

### IPC 与窗口模块

- `wj-markdown-editor-web/src/util/channel/channelUtil.js`
  - Renderer 调用主进程 IPC 的统一入口
- `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
  - Electron 主进程 IPC 分发入口
- `wj-markdown-editor-electron/src/util/win/settingUtil.js`
  - 设置窗口
- `wj-markdown-editor-electron/src/util/win/exportUtil.js`
  - 导出窗口与导出执行
- `wj-markdown-editor-electron/src/util/win/aboutUtil.js`
  - 关于窗口
- `wj-markdown-editor-electron/src/util/win/guideUtil.js`
  - 引导窗口
- `wj-markdown-editor-electron/src/util/win/screenshotsUtil.js`
  - 截图能力

## 配置系统

默认配置位于 `wj-markdown-editor-electron/src/data/defaultConfig.js`，当前重要配置包括：

- 启动页：`editor` / `preview`
- 最近文件恢复与最近记录数量
- 自动保存时机：失焦 / 关闭窗口
- 外部文件变更策略：`apply` / `prompt`
- 编辑器扩展：行号、自动换行、当前行高亮、匹配文本高亮、括号匹配、自动补全括号
- 关联高亮
- 文件与图片保存策略
- 图床配置：GitHub / SM.MS
- 快捷键列表
- 水印配置
- 导出 PDF 页眉页脚
- 主题配置：全局、代码、预览

## 主题系统

### 全局主题

- `light`
- `dark`

### 代码高亮主题

- 位于 `wj-markdown-editor-web/src/assets/style/code-theme/theme/`
- 当前共 `72` 个主题

### 预览主题

- 位于 `wj-markdown-editor-web/src/assets/style/preview-theme/theme/`
- 当前共 `8` 个主题

## 国际化

支持语言：

- 中文（`zh-CN`）
- 英文（`en-US`）

配置文件位于 `wj-markdown-editor-web/src/i18n/`。

## 测试分布

### Web 端

- 单测主要分布在 `src/**/__tests__/`
- 也有页面级测试，例如：
  - `src/views/__tests__/editorViewActivationRestoreScheduler.test.js`

### Electron 端

- 同目录测试与 `document-session/__tests__/` 并存
- 当前测试覆盖较多的主线包括：
  - runtime 命令分发
  - 保存与另存为
  - 外部文件变更
  - 关闭确认
  - recent 与 open-path
  - 资源打开与删除

## 开发注意事项

1. **构建顺序**：Web 构建输出到 Electron 的 `web-dist` 目录，打包 Electron 前必须先有最新的 Web 构建结果。
2. **开发端口**：Vite 开发端口固定为 `8080`，Electron 开发模式中的导出窗口也写死依赖该端口。
3. **单实例锁**：应用使用 `app.requestSingleInstanceLock`；第二实例打开 Markdown 文件时，会把路径与 `baseDir` 交给首实例 runtime 处理。
4. **协议处理**：本地资源访问依赖 `wj://` 自定义协议，相关问题优先检查 `protocolUtil.js` 与 `resourceUrlUtil.js`。
5. **会话真相优先**：涉及当前文档状态时，优先读 `documentSessionSnapshot` 或 Electron runtime session，不要回退到旧镜像字段推断。
6. **资源操作统一走 runtime**：预览区资源打开、删除、本地路径比较都已统一收口，不要在 Renderer 侧自行实现一套路径解析。
7. **外部文件监听**：外部文件变更处理由 `windowLifecycleService + externalWatchBridge + document.external.apply/ignore` 主导，Web 端只负责展示与发命令。
8. **最近文件缺失**：当前支持 recent-missing 会话，不存在的最近文件不是普通已保存文档，处理逻辑要区别对待。
9. **设置页字体列表**：设置页通过 `window.queryLocalFonts()` 读取系统字体，相关能力只应在 Electron 渲染环境中使用。

## 代码评审豁免项

针对 2026-03-11 至 2026-03-12 引入的“预览区删除本地资源”相关逻辑，后续代码评审默认不要重复将以下行为识别为缺陷，除非当前需求或提交明确要求收紧这部分策略：

1. **允许删除任意被当前 Markdown 引用到的本地路径**：当前实现允许删除项目外文件、绝对路径文件、以及经相对路径解析后定位到的本地文件；这属于既定产品行为，不应默认以“删除范围过宽”“可能删除项目外文件”作为评审问题。
2. **允许仅按当前文档统计资源引用次数**：当前实现不会扫描其他 Markdown 文档中的引用；删除“全部引用并删除文件”时，只保证清理当前文档内的引用，不以“未做跨文档引用分析”作为默认评审问题。
3. **允许资源文件删除与 Markdown 落盘非原子**：当前实现允许先删除本地资源，再由用户决定是否保存文档；不以“删除后未立即保存可能导致文档仍保留旧引用”作为默认评审问题。

如果后续评审发现的是上述策略之外的新风险，例如实现偏离既定行为、误删目录、解析错误导致删错目标、或与本次需求冲突，再正常报告。
