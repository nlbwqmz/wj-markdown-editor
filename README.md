# wj-markdown-editor

<div align="center">

开源桌面端 Markdown 编辑器，支持 Windows / Linux。

[中文](./README.md) | [English](./README.en.md)

[![release](https://img.shields.io/github/v/release/nlbwqmz/wj-markdown-editor?label=release)](https://github.com/nlbwqmz/wj-markdown-editor/releases)
[![license](https://img.shields.io/badge/license-MIT-1677ff.svg)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-2ea44f.svg)](https://github.com/nlbwqmz/wj-markdown-editor/releases)

[下载地址](https://github.com/nlbwqmz/wj-markdown-editor/releases) · [问题反馈](https://github.com/nlbwqmz/wj-markdown-editor/issues) · [源码仓库](https://github.com/nlbwqmz/wj-markdown-editor)

</div>

## 项目简介

`wj-markdown-editor` 是一款面向桌面场景的开源 Markdown 编辑器，采用 `Electron + Vue 3` 架构，提供“编辑 + 预览 + 导出 + 资源管理 + 主题定制”的完整写作体验。

## 功能亮点

### 编辑与写作体验

- 支持本地 `Markdown(.md)` 文件的打开、新建、保存、另存为
- 支持最近文件记录与“启动时打开最近一次记录”
- 支持自动保存（窗口失焦 / 关闭窗口）
- 支持文件监听，检测其他程序对当前 Markdown 文件的外部修改
- 支持外部变更处理策略：直接应用最新内容，或弹出差异对比后手动选择应用 / 忽略
- 支持 30 项快捷键配置（可启用/禁用并自定义按键）
- 支持工具栏快速插入：标题、列表、任务列表、引用、代码块、链接、标记、表格、Alert、Container、图片、视频、音频、截图、文字颜色
- 支持 `/` 触发自动补全（标题、表格、代码块、Container、Alert、媒体等）
- 支持编辑器内查找替换（大小写、整词、正则）
- 支持 Markdown 一键美化（Prettier）
- 支持智能标点（Typographer）开关
- 支持编辑增强开关：行号、自动换行、匹配文本高亮、括号高亮、自动闭合括号、关联高亮

### Markdown 扩展能力

- 支持 KaTeX 数学公式
- 支持 Mermaid 流程图
- 支持 GitHub Alerts
- 支持自定义 Container
- 支持脚注、定义列表、任务列表、上标/下标、插入文本、标记文本
- 支持图片尺寸语法
- 支持自定义文字颜色与渐变文字语法

### 资源与媒体能力

- 支持本地图片、网络图片插入
- 支持图片粘贴上传、拖拽上传、截图上传
- 支持文件、视频、音频插入（含本地资源）
- 支持资源保存策略：绝对路径 / 相对路径 / 按文件名目录归档
- 支持图床上传（GitHub、SM.MS）

### 预览与导出能力

- 编辑区与预览区精准同步滚动
- 自动提取文档目录并导航
- 图片预览支持缩放、翻页、旋转
- 支持全局主题切换（明亮 / 暗黑）
- 支持多种种代码高亮主题和预览主题
- 支持预览宽度、字号、分区字体设置（编辑区/预览区/代码区/其他区）
- 支持水印（内容、时间、角度、间距、字体样式）
- 支持导出 `PDF / PNG / JPEG`
- 支持自定义 PDF 页眉、页脚、页码

### 桌面应用能力

- 支持 Windows / Linux 打包发布
- 支持 `.md` 文件关联与双击打开
- 支持单实例锁（防止重复启动）
- 支持自动检查更新（安装版）
- 支持外部文件变更系统通知，窗口未聚焦时也能及时感知内容更新
- 支持文件被移走、删除后状态感知，并在原路径恢复时继续监听
- 支持窗口置顶、在资源管理器中快速定位当前文件
- 支持中英文界面切换（`zh-CN` / `en-US`）

## 界面截图

| 编辑 | 预览 |
| --- | --- |
| ![编辑界面](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/edit_done_dKVmHx.png) | ![预览界面](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/preview_done_Lu_VHD.png) |

| 设置 | 示例 |
| --- | --- |
| ![设置界面](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/setting_done_mk6OCb.png) | ![示例界面](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/guide_done_rhttdX.png) |

## 快速开始

### 下载安装

1. 进入 [Releases](https://github.com/nlbwqmz/wj-markdown-editor/releases) 下载对应系统安装包
2. 安装版支持自动升级；便携版（ZIP）需手动替换程序文件

### 开发运行

```bash
# 1) 克隆项目
git clone https://github.com/nlbwqmz/wj-markdown-editor.git
cd wj-markdown-editor

# 2) 启动前端开发
cd wj-markdown-editor-web
npm install
npm run dev

# 3) 启动 Electron
cd ../wj-markdown-editor-electron
npm install
npm run start
```

## 构建发布

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

## 注意事项

- 便携版不支持自动升级，需手动下载并替换
- 构建 Electron 前需先构建 Web（`make` 已包含完整流程）
- 若新增系统字体，建议重启应用以刷新字体列表

## 许可证

[MIT](./LICENSE)
