# wj-markdown-editor 项目上下文

## 项目概述

一款开源桌面端 Markdown 编辑器，支持 Windows 和 Linux 系统。项目采用 Electron + Vue 3 架构，提供丰富的 Markdown 编辑功能。

### 核心特性

- 支持本地 MD 文件打开与编辑
- 支持本地附件、视频、音频插入
- 支持暗黑模式与主题切换
- 精准同步滚动
- 支持公式（KaTeX）、流程图（Mermaid）
- 支持 GitHub Alert、Container、文字颜色
- 支持图片粘贴上传、截图上传（涂鸦、框选）
- 支持水印
- 目录提取与导航
- 支持导出为 PDF、图片
- 分区字体设置

## 项目结构

```
wj-markdown-editor/
├── wj-markdown-editor-web/       # Vue 3 前端项目
│   ├── src/
│   │   ├── components/           # Vue 组件
│   │   │   ├── editor/           # 编辑器相关组件
│   │   │   └── layout/           # 布局组件
│   │   ├── views/                # 页面视图
│   │   ├── util/                 # 工具函数
│   │   │   ├── editor/           # 编辑器工具（补全、快捷键）
│   │   │   ├── markdown-it/      # Markdown-it 插件
│   │   │   └── channel/          # IPC 通信
│   │   ├── stores/               # Pinia 状态管理
│   │   ├── i18n/                 # 国际化（中/英）
│   │   └── assets/style/         # 样式文件
│   └── package.json
│
└── wj-markdown-editor-electron/  # Electron 桌面应用
    ├── src/
    │   ├── main.js               # Electron 主进程入口
    │   ├── preload.js            # 预加载脚本
    │   ├── data/                 # 配置与最近文件管理
    │   └── util/                 # 工具函数
    │       ├── channel/          # IPC 通信
    │       └── win/              # 窗口管理
    └── package.json
```

## 技术栈

### 前端（wj-markdown-editor-web）

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3 (Composition API) |
| 构建工具 | Vite 6 |
| CSS 框架 | UnoCSS + SCSS |
| UI 组件库 | Ant Design Vue 4 |
| 编辑器 | CodeMirror 6 |
| Markdown 解析 | markdown-it + 多个插件 |
| 公式渲染 | KaTeX |
| 流程图 | Mermaid |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| 国际化 | vue-i18n |

### 桌面端（wj-markdown-editor-electron）

| 类别 | 技术 |
|------|------|
| 框架 | Electron 39 |
| 构建工具 | electron-builder |
| 自动更新 | electron-updater |
| 截图 | electron-screenshots |
| 日志 | electron-log |

### Markdown-it 插件

- `markdown-it-sup` / `markdown-it-sub` - 上标/下标
- `markdown-it-ins` / `markdown-it-mark` - 插入/标记
- `markdown-it-deflist` - 定义列表
- `markdown-it-task-lists` - 任务列表
- `markdown-it-github-alerts` - GitHub Alert
- `markdown-it-container` - 自定义容器
- `markdown-it-anchor` - 锚点
- `@vscode/markdown-it-katex` - 数学公式
- `@mdit/plugin-img-size` - 图片尺寸

## 构建与运行命令

### Web 前端（在 wj-markdown-editor-web 目录下）

```bash
# 开发模式
npm run dev          # 启动开发服务器，端口 8080

# 构建
npm run build        # 构建到 ../wj-markdown-editor-electron/web-dist

# 预览构建结果
npm run preview
```

### Electron 桌面端（在 wj-markdown-editor-electron 目录下）

```bash
# 开发模式（需先构建 web）
npm run start        # 启动 Electron 开发模式

# 仅构建 Electron
npm run build        # 构建 Electron 安装包

# 完整构建（Web + Electron）
npm run make         # 安装依赖、构建 Web、构建 Electron 安装包
```

### 构建产物

- Windows: NSIS 安装包 + ZIP 便携版
- Linux: DEB + RPM 包

## 开发规范

### ESLint 配置

项目使用 `@antfu/eslint-config` 作为基础配置：

```javascript
// web 端配置
{
  unocss: true,
  vue: true,
  formatters: { css: true, html: true, markdown: true }
}

// electron 端配置
{
  'no-console': 'off',
  'node/prefer-global/process': 'off'
}
```

### 代码风格

- 使用 Vue 3 Composition API (`<script setup>`)
- 使用 ES Modules（`type: "module"`）
- 样式使用 SCSS + UnoCSS
- CSS 单位使用 px（自动转换为 rem，rootValue: 16）

### 文件命名

- 组件文件：PascalCase（如 `MarkdownEdit.vue`）
- 工具文件：camelCase（如 `commonUtil.js`）
- 样式文件：kebab-case（如 `code-theme.scss`）

### IPC 通信

前端与 Electron 通过 `channelUtil` 进行 IPC 通信：

```javascript
// 前端发送消息
channelUtil.send({ event: 'save' })
channelUtil.send({ event: 'get-file-info' })

// Electron 主进程处理
// 见 src/util/channel/ipcMainUtil.js
```

## 关键模块说明

### 编辑器核心（`src/components/editor/`）

- `MarkdownEdit.vue` - 主编辑器组件，整合编辑区与预览区
- `MarkdownPreview.vue` - Markdown 预览组件
- `MarkdownMenu.vue` - 编辑器工具栏菜单
- `EditorSearchBar.vue` - 编辑器内搜索栏

### Markdown 解析（`src/util/markdown-it/`）

- `markdownItDefault.js` - Markdown-it 配置与插件集成
- `markdownItCodeBlock.js` - 代码块处理
- `markdownItContainerUtil.js` - 自定义容器
- `markdownItTextColor.js` - 文字颜色
- `markdownItImage.js` / `markdownItLink.js` - 图片/链接处理
- `markdownItVideo.js` / `markdownItAudio.js` - 视频/音频

### 编辑器补全（`src/util/editor/completion/`）

- `headingCompletion.js` - 标题补全
- `tableCompletion.js` - 表格补全
- `codeBlockCompletion.js` - 代码块补全
- `containerCompletion.js` - 容器补全
- `alertCompletion.js` - GitHub Alert 补全

### Electron 窗口管理（`wj-markdown-editor-electron/src/util/win/`）

- `winInfoUtil.js` - 窗口信息管理
- `settingUtil.js` - 设置窗口
- `exportUtil.js` - 导出窗口
- `aboutUtil.js` - 关于窗口
- `guideUtil.js` - 引导窗口
- `screenshotsUtil.js` - 截图功能

## 主题系统

### 全局主题

- `light` - 亮色主题
- `dark` - 暗色主题

### 代码高亮主题

位于 `src/assets/style/code-theme/theme/`，支持 40+ 种代码高亮主题。

### 预览主题

位于 `src/assets/style/preview-theme/theme/`，可自定义预览样式。

## 国际化

支持语言：
- 中文（zhCN）
- 英文（enUS）

配置文件位于 `src/i18n/`。

## 注意事项

1. **构建顺序**：Web 构建输出到 Electron 的 `web-dist` 目录，因此构建 Electron 前需先构建 Web
2. **便携版**：不支持自动升级，需手动下载替换
3. **单实例锁**：应用使用 `app.requestSingleInstanceLock` 确保单实例运行
4. **协议处理**：支持自定义协议打开文件
