# wj-markdown-editor 项目上下文

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
- Linux：`deb` + `rpm` + `AppImage`

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
10. **多标签不变量**：一个标签页恒等于一个文档会话，会话类型（`kind`）属于会话不属于标签页；不要在渲染层另存一份“标签状态”，标签列表与活动标签一律来自 `documentSessionSnapshot.tabs` / `activeSessionId`。
11. **外部监听按会话隔离**：`externalWatchMap` / `externalWatchBridgeMap` 以 `sessionId` 为键，后台标签的变更必须带 `sessionId` 回流；不要回退成“一个窗口一份监听”。
12. **缓存生命周期跟随标签**：滚动锚点缓存与编辑器 `EditorState` 都在关标签时清理，不要重新引入数量上限或全局单例。
13. **运行时状态文件不得进包**：`config.json` / `recent.json` / `tab-group.json` 是应用运行时写到工作目录的用户数据，必须在 `package.json` 的 `build.files` 里保持 `!` 排除。

## 代码评审豁免项

针对 2026-03-11 至 2026-03-12 引入的“预览区删除本地资源”相关逻辑，后续代码评审默认不要重复将以下行为识别为缺陷，除非当前需求或提交明确要求收紧这部分策略：

1. **允许删除任意被当前 Markdown 引用到的本地路径**：当前实现允许删除项目外文件、绝对路径文件、以及经相对路径解析后定位到的本地文件；这属于既定产品行为，不应默认以“删除范围过宽”“可能删除项目外文件”作为评审问题。
2. **允许仅按当前文档统计资源引用次数**：当前实现不会扫描其他 Markdown 文档中的引用；删除“全部引用并删除文件”时，只保证清理当前文档内的引用，不以“未做跨文档引用分析”作为默认评审问题。
3. **允许资源文件删除与 Markdown 落盘非原子**：当前实现允许先删除本地资源，再由用户决定是否保存文档；不以“删除后未立即保存可能导致文档仍保留旧引用”作为默认评审问题。

如果后续评审发现的是上述策略之外的新风险，例如实现偏离既定行为、误删目录、解析错误导致删错目标、或与本次需求冲突，再正常报告。

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, mapped 1:1 to the default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
