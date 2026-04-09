# wj-markdown-editor

<div align="center">

### ✨ 开源桌面端 Markdown 编辑器

面向 Windows / Linux 的 Markdown 写作、预览、导出与资源管理工具。

[中文](./README.md) | [English](./README.en.md)

[![release](https://img.shields.io/github/v/release/nlbwqmz/wj-markdown-editor?label=release)](https://github.com/nlbwqmz/wj-markdown-editor/releases)
[![license](https://img.shields.io/badge/license-MIT-1677ff.svg)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-2ea44f.svg)](https://github.com/nlbwqmz/wj-markdown-editor/releases)

[下载地址](https://github.com/nlbwqmz/wj-markdown-editor/releases) · [问题反馈](https://github.com/nlbwqmz/wj-markdown-editor/issues) · [源码仓库](https://github.com/nlbwqmz/wj-markdown-editor)

</div>

> `wj-markdown-editor` 基于 `Electron 39 + Vue 3 + Vite 6` 构建，聚焦桌面写作场景，覆盖编辑、预览、搜索、资源管理、导出、主题定制与多窗口文档会话的完整工作流。

## ✨ 功能速览

- 📝 编辑、预览、导出一体化，支持本地 Markdown 文档的创建、打开、保存、另存为副本与最近文件恢复。
- 🗂️ 内置文件管理栏，可直接浏览目录、创建文件夹、创建 Markdown，并支持当前窗口或新窗口打开文件。
- 👀 编辑区与预览区支持精准同步滚动、滚动锚点恢复、预览左右换位、独立预览页和统一搜索定位。
- 🖼️ 资源能力完整，支持图片、附件、音频、视频、截图、图床上传，以及预览区资源右键管理。
- 🎨 提供 `72` 套代码高亮主题、`8` 套预览主题、明暗模式、水印、字体分区配置，支持导出到文件或系统剪切板。
- 🖥️ 面向桌面环境深度优化，支持单实例锁、`.md` 文件关联、自动更新、系统通知与外部文件变更处理。

## 🚀 功能亮点

### ✍️ 写作与编辑体验

- 支持本地 `Markdown(.md / .markdown)` 文件的打开、新建、保存、另存为副本
- 支持最近文件记录、最近文件恢复，以及最近文件缺失提示
- 支持启动视图切换，可选择默认进入编辑页或预览页
- 支持自动保存（窗口失焦 / 关闭窗口）
- 支持文件外部变更监听，可配置为直接应用最新内容，或弹出差异对比后手动选择应用 / 忽略
- 支持 `32` 项快捷键配置，可启用 / 禁用并自定义按键
- 支持工具栏快速插入：标题、列表、任务列表、引用、代码块、链接、标记、表格、Alert、Container、图片、视频、音频、截图、文字颜色
- 支持 `/` 触发自动补全（标题、表格、代码块、Container、Alert、媒体等）
- 支持编辑器内查找替换（大小写、整词、正则）
- 支持 Markdown 一键美化（Prettier）
- 支持智能标点（Typographer）开关
- 支持编辑增强开关：行号、自动换行、匹配文本高亮、括号高亮、自动闭合括号、关联高亮

### 🗂️ 文档与文件管理

- 内置文件管理栏，支持选择目录、返回上一级、定位到当前文件目录
- 支持在文件管理栏中新建文件夹、新建 Markdown 文件
- 支持文件管理栏内“当前窗口打开 / 新窗口打开”选择
- 切换文件前可选择“先保存再切换”或“不保存并切换”
- 支持单实例锁，避免重复启动；文件已在其他窗口打开时可直接切换到对应窗口
- 支持 `.md` 文件关联与双击打开

### 🔎 预览、导航与搜索

- 编辑区与预览区精准同步滚动
- 支持滚动锚点恢复，在视图切换、重新激活窗口或恢复文档后尽量回到之前浏览位置
- 支持编辑页预览区左右换位，适配不同写作习惯
- 支持自动提取文档目录并导航
- 支持标题锚点、脚注与文档内 Hash 链接的平滑滚动跳转
- 支持预览页、设置页、使用指南统一搜索与高亮定位
- 支持独立预览页，适合只读展示与演示
- 支持点击预览区行内代码快速复制，可在设置中开关
- 支持代码块语言标签显示与一键复制
- 图片预览支持缩放、翻页、旋转

### 🧩 Markdown 扩展能力

- 支持 KaTeX 数学公式
- 支持 Mermaid 流程图
- 支持 GitHub Alerts
- 支持自定义 Container
- 支持脚注、定义列表、任务列表、上标 / 下标、插入文本、标记文本
- 支持图片尺寸语法
- 支持自定义文字颜色与渐变文字语法

### 🖼️ 资源与媒体能力

- 支持本地图片、网络图片插入
- 支持图片粘贴上传、拖拽上传、直接截图上传、隐藏窗口截图上传
- 支持文件、视频、音频插入（含本地资源）
- 支持资源保存策略：绝对路径 / 相对路径 / 按文件名目录归档
- 支持图床上传（GitHub、SM.MS）
- 编辑页与独立预览页的资源右键菜单支持：
  - 复制图片
  - 复制图片链接 / 资源链接
  - 复制绝对路径
  - 复制 Markdown 引用
  - 另存为
  - 在资源管理器中打开资源所在目录
  - 删除本地资源，或仅清理当前文档中的引用

### 🎨 主题、导出与个性化

- 支持全局主题切换（明亮 / 暗黑）
- 支持 `72` 套代码高亮主题与 `8` 套预览主题
- 支持预览宽度、字号、分区字体设置（编辑区 / 预览区 / 代码区 / 其他区）
- 支持系统字体读取，便于直接选择本机字体
- 支持水印（内容、时间、角度、间距、字体样式）
- 支持导出到文件 `PDF / PNG / JPEG`
- 支持通过“文件 > 导出到剪切板”将当前文档导出为 `PNG / JPEG` 到系统剪切板
- 支持自定义 PDF 页眉、页脚、页码

### 🖥️ 桌面应用能力

- 支持 Windows / Linux 打包发布
- 安装版支持自动检查更新；便携版支持手动替换升级
- 支持外部文件变更系统通知，窗口未聚焦时也能及时感知内容更新
- 支持打开 Markdown 文件失败时的系统通知提醒，便于处理权限不足、文件占用等场景
- 支持文件被移走、删除后的状态感知，并在原路径恢复时继续监听
- 支持窗口置顶、在资源管理器中快速定位当前文件
- 支持中英文界面切换（`zh-CN` / `en-US`）
- 内置使用指南、关于页、设置页与导出页等桌面窗口

## 🛠️ 技术栈

| 类别          | 技术                     |
| ------------- | ------------------------ |
| 桌面框架      | Electron 39              |
| 前端框架      | Vue 3 + Vite 6           |
| 编辑器        | CodeMirror 6             |
| Markdown 渲染 | markdown-it + 自定义扩展 |
| 状态管理      | Pinia                    |
| UI 组件       | Ant Design Vue           |
| 样式          | UnoCSS + SCSS            |
| 测试          | Node Test + Vitest       |

## 📸 界面截图

| 编辑                                                                                             | 预览                                                                                                |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| ![编辑界面](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/edit_done_dKVmHx.png) | ![预览界面](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/preview_done_Lu_VHD.png) |

| 设置                                                                                                | 示例                                                                                              |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| ![设置界面](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/setting_done_mk6OCb.png) | ![示例界面](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/guide_done_rhttdX.png) |

## ⚡ 快速开始

### 下载安装

1. 进入 [Releases](https://github.com/nlbwqmz/wj-markdown-editor/releases) 下载对应系统安装包
2. 安装版支持自动升级；便携版（ZIP）需手动替换程序文件

### 开发运行

```bash
# 1) 克隆项目
git clone https://github.com/nlbwqmz/wj-markdown-editor.git
cd wj-markdown-editor

# 2) 启动前端开发服务
cd wj-markdown-editor-web
npm install
npm run dev

# 3) 启动 Electron
cd ../wj-markdown-editor-electron
npm install
npm run start
```

### 测试

```bash
# Web
cd wj-markdown-editor-web
npm run test

# Electron
cd ../wj-markdown-editor-electron
npm run test
```

## 📦 构建发布

```bash
# 仅构建 Electron 安装包
cd wj-markdown-editor-electron
npm run build

# 完整构建（Web + Electron）
npm run make
```

构建产物：

- Windows: `NSIS` 安装包 + `ZIP` 便携版
- Linux: `DEB` + `RPM`

## 📌 注意事项

- 便携版不支持自动升级，需手动下载并替换
- 构建 Electron 前需先构建 Web（`make` 已包含完整流程）
- 若新增系统字体，建议重启应用以刷新字体列表
- Electron 开发模式依赖前端开发服务，默认端口为 `8080`

## 📄 许可证

[MIT](./LICENSE)
