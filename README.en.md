# wj-markdown-editor

<div align="center">

An open-source desktop Markdown editor for Windows and Linux.

[中文](./README.md) | [English](./README.en.md)

[![release](https://img.shields.io/github/v/release/nlbwqmz/wj-markdown-editor?label=release)](https://github.com/nlbwqmz/wj-markdown-editor/releases)
[![license](https://img.shields.io/badge/license-MIT-1677ff.svg)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-2ea44f.svg)](https://github.com/nlbwqmz/wj-markdown-editor/releases)

[Download](https://github.com/nlbwqmz/wj-markdown-editor/releases) · [Issues](https://github.com/nlbwqmz/wj-markdown-editor/issues) · [Repository](https://github.com/nlbwqmz/wj-markdown-editor)

</div>

## Overview

`wj-markdown-editor` is an open-source Markdown editor built for desktop usage.  
Powered by `Electron + Vue 3`, it provides a complete writing workflow covering editing, previewing, exporting, asset management, and theme customization.

## Features

### Editing Experience

- Open, create, save, and save as local `Markdown (.md)` files
- Recent files list and "open last file on startup"
- Auto-save support (on window blur / on window close)
- Built-in file watching detects external changes made by other programs to the current Markdown file
- External change handling modes: auto-apply the latest disk content or open a diff prompt to choose apply / ignore manually
- 30 configurable shortcuts (enable/disable and remap)
- Quick toolbar insertion: headings, lists, task lists, quotes, code blocks, links, mark text, tables, alerts, containers, images, videos, audio, screenshots, and text colors
- `/`-triggered auto-completion (headings, tables, code blocks, containers, alerts, media, etc.)
- In-editor find/replace (case-sensitive, whole word, regex)
- One-click Markdown formatting (Prettier)
- Typographer toggle
- Editor enhancement toggles: line numbers, line wrapping, matching text highlight, bracket matching, auto close brackets, and association highlight

### Markdown Extensions

- KaTeX math support
- Mermaid diagram support
- GitHub Alerts support
- Custom Container support
- Footnotes, definition lists, task lists, superscript/subscript, inserted text, and marked text
- Image size syntax support
- Custom text color and gradient text syntax

### Asset and Media

- Local and remote image insertion
- Paste, drag-and-drop, and screenshot image upload
- File, video, and audio insertion (including local assets)
- In the editor preview pane, local images, videos, audio, and file links support a context menu to open the asset in explorer or delete the local file with precise cleanup of the current Markdown fragment
- Asset save strategies: absolute path / relative path / file-name-based directory
- Image bed upload support (GitHub, SM.MS)

### Preview and Export

- Accurate synchronized scrolling between editor and preview
- Automatic outline extraction and navigation
- Heading anchors and in-document hash link jumping with smooth scrolling in preview
- Image preview with zoom, pagination, and rotation
- Global theme switching (light / dark)
- Multiple code highlighting themes and preview themes
- Preview width, font size, and per-area font settings (editor / preview / code / others)
- Watermark customization (content, time, angle, spacing, font style)
- Export to `PDF / PNG / JPEG`
- Custom PDF header, footer, and page number

### Desktop Capabilities

- Windows / Linux packaging and distribution
- `.md` file association and open-by-double-click
- Single instance lock (prevents duplicate launches)
- Automatic update checks (installer edition)
- System notifications for external file changes, even when the window is unfocused
- Missing/restored file state awareness when the original file is moved or removed, with listening resumed after the path returns
- Always-on-top window and quick file locating in explorer
- Bilingual interface (`zh-CN` / `en-US`)

## Screenshots

| Editor | Preview |
| --- | --- |
| ![Editor](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/edit_done_dKVmHx.png) | ![Preview](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/preview_done_Lu_VHD.png) |

| Settings | Guide |
| --- | --- |
| ![Settings](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/setting_done_mk6OCb.png) | ![Guide](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/guide_done_rhttdX.png) |

## Quick Start

### Download and Install

1. Go to [Releases](https://github.com/nlbwqmz/wj-markdown-editor/releases) and download the package for your OS.
2. The installer edition supports auto-updates; the portable edition (ZIP) needs manual replacement.

### Development

```bash
# 1) Clone
git clone https://github.com/nlbwqmz/wj-markdown-editor.git
cd wj-markdown-editor

# 2) Start web development server
cd wj-markdown-editor-web
npm install
npm run dev

# 3) Start Electron
cd ../wj-markdown-editor-electron
npm install
npm run start
```

## Build and Package

```bash
# Build Electron package only
cd wj-markdown-editor-electron
npm run build

# Full build (Web + Electron)
npm run make
```

Build artifacts:

- Windows: `NSIS` installer + `ZIP` portable package
- Linux: `DEB` + `RPM`

## Notes

- The portable edition does not support auto-update. Please download and replace files manually.
- Build the Web app before building Electron (`make` already includes the full flow).
- If you add new system fonts, restart the app to refresh the font list.

## License

[MIT](./LICENSE)
