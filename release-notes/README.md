# 发布说明目录

该目录用于存放每个版本对应的 GitHub Release 说明文件。

## 命名规则

- 文件名必须与 `wj-markdown-editor-electron/package.json` 中的 `version` 完全一致
- 文件扩展名统一使用 `.md`
- 示例：当前版本为 `2.15.0`，则说明文件应为 `release-notes/2.15.0.md`

## 使用方式

### 手动发布

1. 修改 Electron 包版本号
2. 新增或更新对应版本的说明文件
3. 手动触发 `Build And Release Desktop` workflow

### 推送 tag 自动发布

1. 修改 Electron 包版本号
2. 新增或更新对应版本的说明文件
3. 创建与版本号完全一致的 tag，例如 `2.15.0`
4. 推送该 tag 到远程仓库，workflow 会自动触发发布

## 注意事项

- 如果 tag 名与包版本不一致，workflow 会直接失败
- 如果对应版本的说明文件不存在或内容为空，workflow 会直接失败
- 发布说明支持 GitHub Release 的 Markdown 渲染
