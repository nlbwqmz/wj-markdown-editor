# wj-markdown-editor

<div align="center">

### ✨ Open-Source Desktop Markdown Editor

A Markdown writing, preview, export, and asset management tool for Windows and Linux.

[中文](./README.md) | [English](./README.en.md)

[![release](https://img.shields.io/github/v/release/nlbwqmz/wj-markdown-editor?label=release)](https://github.com/nlbwqmz/wj-markdown-editor/releases)
[![license](https://img.shields.io/badge/license-MIT-1677ff.svg)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-2ea44f.svg)](https://github.com/nlbwqmz/wj-markdown-editor/releases)

[Download](https://github.com/nlbwqmz/wj-markdown-editor/releases) · [Issues](https://github.com/nlbwqmz/wj-markdown-editor/issues) · [Repository](https://github.com/nlbwqmz/wj-markdown-editor)

</div>

> `wj-markdown-editor` is built with `Electron 39 + Vue 3 + Vite 6` for desktop writing workflows, covering editing, previewing, searching, asset management, exporting, theming, and multi-window document sessions.

## ✨ Feature Snapshot

- 📝 All-in-one editing, preview, and export workflow for creating, opening, saving, saving copies of, and restoring local Markdown documents.
- 🗂️ Built-in file manager panel for browsing directories, creating folders, creating Markdown files, and opening files in the current or a new window.
- 👀 Precise editor-preview sync scrolling, scroll-anchor restore, left/right preview switching, standalone preview mode, and unified search targeting.
- 🖼️ Complete asset workflow with images, attachments, audio, video, screenshots, image-bed uploads, and preview-side context actions.
- 🎨 `72` code highlight themes, `8` preview themes, light/dark modes, watermarks, per-area font settings, and multiple export options.
- 🖥️ Desktop-focused capabilities including single-instance lock, `.md` file association, auto-update, system notifications, and external file change handling.

## 🚀 Features

### ✍️ Writing and Editing

- Open, create, save, and save copies of local `Markdown(.md / .markdown)` files
- Recent files history, recent-file restore, and missing recent-file prompts
- Configurable startup view, with editor or preview as the default landing page
- Auto-save support (on window blur / on window close)
- External file change watching with two handling modes: auto-apply latest disk content or review a diff before choosing apply / ignore
- `32` configurable shortcuts with enable / disable and remapping support
- Toolbar insertion for headings, lists, task lists, quotes, code blocks, links, mark text, tables, alerts, containers, images, videos, audio, screenshots, and text colors
- `/`-triggered auto-completion for headings, tables, code blocks, containers, alerts, media, and more
- In-editor find and replace with case-sensitive, whole-word, and regex modes
- One-click Markdown formatting with Prettier
- Typographer toggle
- Editor enhancement toggles for line numbers, wrapping, matching text highlight, bracket matching, auto close brackets, and association highlight

### 🗂️ Document and File Management

- Built-in file manager panel with directory picking, parent-directory navigation, and quick focus on the current file directory
- Create folders and Markdown files directly from the file manager
- Choose to open a file in the current window or a new window from the file manager
- Decide whether to save before switching files or discard changes and switch directly
- Single-instance protection to avoid duplicate launches, with window switching when the target file is already open elsewhere
- `.md` file association and open-by-double-click support

### 🔎 Preview, Navigation, and Search

- Accurate synchronized scrolling between editor and preview
- Scroll-anchor restore to return closer to the previous reading position after view switching, reactivation, or session recovery
- Left/right preview position switching in the editor layout
- Automatic outline extraction and navigation
- Smooth scrolling for heading anchors, footnotes, and in-document hash links
- Unified search and highlight targeting in preview, settings, and built-in guide pages
- Standalone preview window for presentation and read-only browsing
- Optional click-to-copy for inline code in preview
- Code blocks with language labels and one-click copy actions
- Image preview with zoom, pagination, and rotation

### 🧩 Markdown Extensions

- KaTeX math support
- Mermaid diagram support
- GitHub Alerts support
- Custom Container support
- Footnotes, definition lists, task lists, superscript / subscript, inserted text, and marked text
- Image size syntax support
- Custom text color and gradient text syntax

### 🖼️ Assets and Media

- Local and remote image insertion
- Paste upload, drag-and-drop upload, direct screenshot upload, and hidden-window screenshot upload
- File, video, and audio insertion, including local assets
- Asset save strategies: absolute path, relative path, and file-name-based directory archiving
- Image-bed uploads via GitHub and SM.MS
- Asset context menus in both the editor preview and standalone preview support:
  - Copy image
  - Copy image link or resource link
  - Copy absolute path
  - Copy Markdown reference
  - Save as
  - Open the asset folder in system explorer
  - Delete the local asset or only clean references from the current document

### 🎨 Themes, Export, and Personalization

- Global light / dark theme switching
- `72` code highlight themes and `8` preview themes
- Preview width, font size, and per-area font settings for editor / preview / code / other regions
- System font loading for direct local font selection
- Watermark customization with content, timestamp, angle, spacing, and font styling
- Export to `PDF / PNG / JPEG`
- Custom PDF header, footer, and page number

### 🖥️ Desktop Capabilities

- Windows and Linux packaging and distribution
- Automatic update checks for installer builds, with manual replacement for portable builds
- System notifications for external file changes, even when the window is unfocused
- System notifications when opening a Markdown file fails, useful for permission or file-locking issues
- File moved / deleted state awareness, with watch recovery when the original path becomes available again
- Always-on-top window support and quick location of the current file in system explorer
- Bilingual interface (`zh-CN` / `en-US`)
- Built-in guide, about page, settings page, and export page windows

## 🛠️ Tech Stack

| Category           | Technology                      |
| ------------------ | ------------------------------- |
| Desktop framework  | Electron 39                     |
| Frontend framework | Vue 3 + Vite 6                  |
| Editor             | CodeMirror 6                    |
| Markdown rendering | markdown-it + custom extensions |
| State management   | Pinia                           |
| UI library         | Ant Design Vue                  |
| Styling            | UnoCSS + SCSS                   |
| Testing            | Node Test + Vitest              |

## 📸 Screenshots

| Editor                                                                                         | Preview                                                                                            |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| ![Editor](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/edit_done_dKVmHx.png) | ![Preview](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/preview_done_Lu_VHD.png) |

| Settings                                                                                            | Guide                                                                                          |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ![Settings](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/setting_done_mk6OCb.png) | ![Guide](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/guide_done_rhttdX.png) |

## ⚡ Quick Start

### Download and Install

1. Go to [Releases](https://github.com/nlbwqmz/wj-markdown-editor/releases) and download the package for your platform.
2. Installer builds support auto-update. Portable ZIP builds need manual replacement.

### Development

```bash
# 1) Clone the project
git clone https://github.com/nlbwqmz/wj-markdown-editor.git
cd wj-markdown-editor

# 2) Start the web dev server
cd wj-markdown-editor-web
npm install
npm run dev

# 3) Start Electron
cd ../wj-markdown-editor-electron
npm install
npm run start
```

### Tests

```bash
# Web
cd wj-markdown-editor-web
npm run test

# Electron
cd ../wj-markdown-editor-electron
npm run test
```

## 📦 Build and Package

```bash
# Build Electron packages only
cd wj-markdown-editor-electron
npm run build

# Full build (Web + Electron)
npm run make
```

Build artifacts:

- Windows: `NSIS` installer + `ZIP` portable package
- Linux: `DEB` + `RPM`

## 📌 Notes

- Portable builds do not support auto-update and must be replaced manually.
- Build the Web app before packaging Electron (`make` already includes the full pipeline).
- Restart the app after installing new system fonts so the font list can refresh.
- Electron development mode depends on the web dev server running on port `8080`.

## 📄 License

[MIT](./LICENSE)
