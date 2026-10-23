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

> `wj-markdown-editor` focuses on desktop writing workflows, covering editing, previewing, searching, asset management, exporting, theming, and multi-tab / multi-window document sessions.

## ✨ Feature Snapshot

- 📝 All-in-one editing, preview, and export workflow for creating, opening, saving, saving copies of, and tracking recent local Markdown documents.
- 📑 Multiple document tabs per window with drag reordering, batch close, move-to-new-window, and configurable tab-group restore.
- 🗂️ Built-in file manager panel for browsing directories, filtering visible files (all / supported only), creating folders, creating Markdown files, and opening files in the current or a new window.
- 👀 Precise editor-preview sync scrolling, scroll-anchor restore, left/right preview switching, standalone preview mode, and unified search targeting; the settings page provides its own settings search.
- 🖼️ Complete asset workflow with images, attachments, audio, video, screenshots, image-bed uploads, and preview-side context actions.
- 🎨 `72` code highlight themes, `8` preview themes, light/dark modes, watermarks, per-area font settings, and export to files or the system clipboard.
- ⚙️ Settings organized into 6 tabs (General / Appearance / Editor / Shortcuts / Files & Images / Export & Watermark) with search by name, keyword, and shortcut.
- 🖥️ Desktop-focused capabilities including single-instance lock, `.md` file association, auto-update, system notifications, and external file change handling.

## 🚀 Features

### ✍️ Writing and Editing

- Open, create, save, and save copies of local `Markdown(.md / .markdown)` files
- Recent files history and missing recent-file prompts
- Configurable tab-group restore on startup: never / on direct launch / always
- Configurable startup view, with editor or preview as the default landing page
- Auto-save support (on window blur / on window close / on tab switch)
- Per-tab undo history, cursor, and view mode, so tabs do not interfere with each other
- Closing a dirty tab lets you save and close or close directly; closing a window with multiple dirty tabs shows an aggregated prompt
- External file change watching with two handling modes: auto-apply latest disk content or review a diff before choosing apply / ignore
- `34` configurable shortcuts with enable / disable and remapping support
- Toolbar insertion for headings, lists, task lists, quotes, code blocks, links, mark text, tables, alerts, containers, images, videos, audio, screenshots, and text colors
- `/`-triggered auto-completion for headings, tables, code blocks, containers, alerts, media, dates/times, task lists, Mermaid charts, text colors, and more, with Chinese / pinyin aliases and grouped command sections
- In-editor find and replace with case-sensitive, whole-word, and regex modes
- One-click Markdown formatting with Prettier
- Typographer toggle
- Editor enhancement toggles for line numbers, wrapping, matching text highlight, bracket matching, auto close brackets, and association highlight

### 🗂️ Documents, Tabs, and File Management

- Multiple document tabs per window, with unsaved indicators; closing the last tab closes the window
- Horizontal tab scrolling when there are too many tabs (mouse wheel scrolls horizontally), with the active tab automatically revealed
- Drag-and-drop tab reordering, persisted and restored on the next launch
- Tab context menu: close, close others, close to the left, close to the right, move to new window, copy file name, copy path, and reveal in explorer
- Batch close only closes tabs without unsaved changes; dirty tabs must be handled individually
- Move a tab to a new window (the undo history is not preserved)
- Save the tab group when a window closes and restore tab order plus the previously active tab on the next launch; missing files are skipped and listed in a startup dialog
- Double-clicking a `.md` file or launching through a second instance opens it as a new tab in the most recently active editor window; if it is already open in another window, that window is focused
- Built-in file manager panel with directory picking, parent-directory navigation, and quick focus on the current file directory
- Visible file scope: all files / supported files only (folders are always shown)
- Create folders and Markdown files directly from the file manager
- Markdown file names automatically get a `.md` suffix
- Choose to open a file in the current window or a new window from the file manager
- When opening a new file in the current window, choose to save the current document before switching or discard changes and switch; files already open in the current window switch directly to their tab
- Single-instance protection to avoid duplicate launches, with window switching when the target file is already open elsewhere
- `.md` file association and open-by-double-click support

### 🔎 Preview, Navigation, and Search

- Accurate synchronized scrolling between editor and preview
- Scroll-anchor restore to return closer to the previous reading position after view switching, tab switching, reactivation, or session recovery
- Left/right preview position switching in the editor layout
- Automatic outline extraction and navigation
- Smooth scrolling for heading anchors, footnotes, and in-document hash links
- Unified search and highlight targeting in preview and built-in guide pages
- Settings-page search for setting names, keywords, and shortcuts in both languages, with cross-tab results and `Esc` to clear
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

- Settings organized into 6 tabs: General / Appearance / Editor / Shortcuts / Files & Images / Export & Watermark
- Shortcuts grouped into global shortcuts and editor shortcuts
- Global light / dark theme switching
- `72` code highlight themes and `8` preview themes
- Preview width, font size, and per-area font settings for editor / preview / code / other regions
- System font loading for direct local font selection
- Watermark customization with content, timestamp, angle, spacing, and font styling
- Export to files as `PDF / PNG / JPEG`
- Export the current document to the system clipboard as `PNG / JPEG` through `File > Export to Clipboard`
- Custom PDF header, footer, and page number

### 🖥️ Desktop Capabilities

- Windows and Linux packaging and distribution
- Automatic update checks for installer builds, with manual replacement for portable builds
- New window support for side-by-side document viewing
- Top bar sidebar toggle and source / split / preview button group with shortcut tooltips
- System notifications for external file changes, even when the window is unfocused
- System notifications when opening a Markdown file fails, useful for permission or file-locking issues
- File moved / deleted state awareness, with watch recovery when the original path becomes available again
- Startup tab-group restore skips missing files and lists them in a dialog
- Always-on-top window support and quick location of the current file in system explorer
- Bilingual interface (`zh-CN` / `en-US`)
- Built-in guide, about page, settings page, and export page windows

## 📸 Screenshots

![Editor](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/edit.png)

![Preview](https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/preview.png)

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
- Linux: `DEB` + `RPM` + `AppImage`

Running the AppImage (`wj-markdown-editor-x86_64-<version>.AppImage`):

- It is a portable single-file executable, so grant the execute permission first with `chmod +x wj-markdown-editor-x86_64-*.AppImage` and then run it directly
- Desktop integration is not applied automatically, so no application menu entry or icon is installed; use [Gear Lever](https://gearlever.mijorus.it) (available on Flathub; supports one-click integration into the application menu, drag and drop, and update management) or a tool such as AppImageLauncher if you want integration
- Alternatively, install and manage it via [AM](https://github.com/ivan-hc/AM) (AppImage Manager): use `appman -i wj-markdown-editor` for user-level or `am -i wj-markdown-editor` for system-level installation, with one-command install, desktop menu integration and automatic updates (community-maintained AM script that dynamically tracks this repository's releases).
- Ships a static runtime (from versions after 2.21.1), so the system `libfuse2` is no longer required; 2.21.1 and earlier use a dynamic runtime and need `libfuse2t64` on some distributions (e.g. Ubuntu 24.04+) or `libfuse2` on older releases, otherwise you may see `AppImages require FUSE to run` / `dlopen(): error loading libfuse.so.2`, and you can also run with `--appimage-extract-and-run` instead
- Embeds update information (from versions after 2.22.0), so [AppImageUpdate](https://github.com/AppImage/AppImageUpdate) or `appimageupdatetool` can perform delta updates (only the changed blocks are downloaded)

## 📌 Notes

- Portable builds do not support auto-update and must be replaced manually.
- Tab-group restore uses the last closed window; multiple windows are not restored at the same time.
- "Move to new window" does not preserve the original tab's undo history.
- With "On direct launch" selected, launching by double-clicking a file does not restore the tab group; with "Always", the tab group is restored first and the file is appended as a new tab.
- Build the Web app before packaging Electron (`make` already includes the full pipeline).
- Restart the app after installing new system fonts so the font list can refresh.
- Electron development mode depends on the web dev server running on port `8080`.

## 📄 License

[MIT](./LICENSE)
