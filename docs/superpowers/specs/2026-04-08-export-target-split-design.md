# 导出菜单拆分与剪切板导出设计

## 背景

当前顶部菜单中的“导出”入口统一指向文件导出流程，支持 `PDF`、`PNG`、`JPEG` 三种类型。现有实现链路已经收口为：

1. Renderer 顶部菜单发送 `export-start`
2. Main 进程创建导出窗口
3. 导出窗口进入 `/#/export`
4. `ExportView.vue` 等待预览渲染稳定后发送 `export-end`
5. Main 进程根据导出类型生成 buffer，并最终写入目标文件

本次需求需要在不破坏现有文件导出体验的前提下，将导出入口拆分为“导出到文件”和“导出到剪切板”两条明确路径。

## 目标

### 用户可见目标

1. 顶部菜单原“导出”文案改为“导出到文件”
2. 新增“导出到剪切板”菜单
3. “导出到文件”继续支持 `PDF`、`PNG`、`JPEG`
4. “导出到剪切板”只支持 `PNG`、`JPEG`
5. 剪切板导出直接写入系统剪切板，不弹出保存对话框，不生成文件
6. 中英文国际化文案同步更新

### 非目标

1. 不新增 PDF 导出到剪切板能力
2. 不改动导出页面的预览布局和渲染样式
3. 不改动文档会话主线、窗口生命周期主线和设置结构
4. 不为导出到剪切板新增独立窗口或独立渲染页面

## 现状约束

### 现有主线

- 顶部菜单位于 `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`
- 导出页位于 `wj-markdown-editor-web/src/views/ExportView.vue`
- IPC 分发位于 `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
- 导出窗口与 buffer 落盘逻辑位于 `wj-markdown-editor-electron/src/util/win/exportUtil.js`

### 保持不变的行为

- 内容为空时继续提示 `message.contentIsEmpty`
- 文件导出仍通过导出窗口等待渲染稳定后再生成结果
- PDF 仍沿用现有 `printToPDF` 流程
- PNG/JPEG 仍沿用现有 `captureExportImageBuffer` 截图逻辑

## 方案对比

### 方案一：在现有导出链路中引入导出目标分流

做法：

- 顶部菜单显式区分“导出到文件”和“导出到剪切板”
- `export-start` 和 `export-end` 从单纯的类型参数扩展为结构化 payload
- Main 进程根据 `target` 决定最终写文件还是写剪切板

优点：

- 完整复用现有导出窗口、导出页、渲染稳定等待和截图逻辑
- PNG/JPEG 生成逻辑只有一份，后续维护成本最低
- 改动集中，便于测试与回归

缺点：

- 需要调整现有 IPC payload 结构

### 方案二：为剪切板导出新增独立 IPC 事件

做法：

- 保留原文件导出不变
- 额外引入 `export-copy-start` / `export-copy-end`

缺点：

- 会重复维护导出链路
- PNG/JPEG 渲染与截图逻辑容易出现两套实现漂移
- 长期维护成本更高

### 结论

采用方案一。

## 详细设计

### 菜单结构调整

`LayoutMenu.vue` 中原有文件菜单下的导出分组调整为两个兄弟菜单：

1. `导出到文件`
   - `PDF`
   - `PNG`
   - `JPEG`
2. `导出到剪切板`
   - `PNG`
   - `JPEG`

点击行为统一改为发送结构化 payload：

```js
channelUtil.send({
  event: 'export-start',
  data: {
    type: 'PNG',
    target: 'clipboard',
  },
})
```

其中：

- `type` 取值为 `PDF`、`PNG`、`JPEG`
- `target` 取值为 `file`、`clipboard`

### 国际化调整

在 `zhCN.js` 和 `enUS.js` 中调整 `topMenu.file.children.export` 结构，至少包含：

- `exportToFile`
- `exportToClipboard`
- `pdfTip`

文案建议：

- 中文：
  - `导出到文件`
  - `导出到剪切板`
- 英文：
  - `Export to File`
  - `Export to Clipboard`

不新增与当前需求无关的 message key。

### IPC 结构调整

`ipcMainUtil.js` 中的 `export-start` 与 `export-end` 改为透传结构化对象：

- `export-start(windowContext, data)`
- `export-end(windowContext, data)`

其中 `data` 结构定义为：

```js
{
  type: 'PDF' | 'PNG' | 'JPEG',
  target: 'file' | 'clipboard',
}
```

导出页回传 `export-end` 时，对文件导出额外携带 `filePath`：

```js
{
  type: 'PNG',
  target: 'file',
  filePath: 'D:\\exports\\demo.png',
}
```

对于剪切板导出，不带 `filePath`：

```js
{
  type: 'PNG',
  target: 'clipboard',
}
```

### 导出窗口创建逻辑

`exportUtil.createExportWin` 增加 `target` 参数。

#### `target === 'file'`

- 保持当前保存对话框行为
- 用户取消保存时直接结束，不创建导出窗口
- 若选择了目标路径，则把 `type`、`target`、`filePath` 带入导出页查询参数

#### `target === 'clipboard'`

- 不弹保存对话框
- 直接创建导出窗口
- 只把 `type`、`target` 带入导出页查询参数

### 导出页行为

`ExportView.vue` 从 URL query 中读取：

- `type`
- `target`
- `filePath`（仅文件导出存在）

等待渲染稳定后，统一发送：

```js
channelUtil.send({
  event: 'export-end',
  data: {
    type,
    target,
    filePath,
  },
})
```

其中 `filePath` 在 `target === 'clipboard'` 时允许为空。

### Main 进程导出分流

`exportUtil.doExport` 继续负责真正的输出动作。

#### 图片类型

当 `type === 'PNG' || type === 'JPEG'` 时：

1. 读取导出页面高度
2. 调用 `captureExportImageBuffer`
3. 根据 `target` 分流

##### `target === 'file'`

- 继续 `fs.writeFile(data.filePath, buffer)`

##### `target === 'clipboard'`

- 使用 Electron 的 `nativeImage.createFromBuffer(buffer)`
- 使用 Electron 的 `clipboard.writeImage(image)`

对于 `JPEG`，虽然写入剪切板时系统最终接收的是 image 对象而不是文件扩展名，但仍保持源 buffer 由 JPEG 编码生成，避免与菜单选择语义不一致。

#### PDF 类型

仅允许 `target === 'file'`。

如果未来误传 `PDF + clipboard`，主进程应按失败处理并复用现有失败提示，不增加静默兜底。

### 提示策略

本次优先复用现有提示键：

- `message.exportingPleaseWait`
- `message.contentIsEmpty`
- `message.exporting`
- `message.exportSuccessfully`
- `message.exportFailed`

不区分“写文件成功”和“写入剪切板成功”的文案，避免无关扩散。

## 测试设计

### 主进程测试

在 `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.test.js` 中补充或调整以下覆盖：

1. `export-start` 收到 `{ type, target: 'file' }` 时，必须把 `target` 一并传给 `exportUtil.createExportWin`
2. `export-start` 收到 `{ type, target: 'clipboard' }` 时，仍调用 `exportUtil.createExportWin`
3. `export-end` 收到结构化导出 payload 时，必须把完整 `data` 和 `notify` 传给 `exportUtil.doExport`

在 `exportUtil` 对应测试中补充以下覆盖；如果当前项目尚无独立测试文件，则新增同目录测试文件：

1. 文件导出图片时，必须写入 `fs`
2. 剪切板导出图片时，必须调用 `clipboard.writeImage`
3. 剪切板导出图片时，不得调用 `fs.writeFile`
4. `target === 'clipboard'` 且 `type === 'PDF'` 时，必须走失败分支并关闭导出窗口

### Renderer 测试

优先补 `LayoutMenu.vue` 相关测试；如果当前无现成菜单测试，可增加轻量级行为测试，覆盖：

1. “导出到文件”菜单存在
2. “导出到剪切板”菜单存在
3. “导出到剪切板”只触发 `PNG` 与 `JPEG`
4. “导出到文件”仍保留 `PDF` 提示

### 国际化检查

至少确保：

1. `zhCN.js` 与 `enUS.js` 中新增键对齐
2. 旧 `topMenu.file.children.export.name` 调用点同步改完，不留下悬空 key

## 风险与规避

### 风险一：导出页 query 参数兼容性变化

规避：

- `ExportView.vue` 读取 query 时对 `filePath` 保持可空
- `type` 与 `target` 均显式读取，不依赖旧位置参数

### 风险二：图片 buffer 转剪切板格式不稳定

规避：

- 使用 Electron 原生 `nativeImage.createFromBuffer`
- 不在 renderer 中直接调用浏览器剪切板图片 API，避免权限与兼容性差异

### 风险三：旧测试仍假设 `export-start` 参数是字符串

规避：

- 一并更新 IPC 测试断言
- 搜索并替换所有旧调用点，避免局部升级导致契约漂移

## 实施边界

本次实现只覆盖：

1. 顶部菜单文案与结构调整
2. 导出链路增加 `target` 分流
3. 剪切板图片导出
4. 中英文国际化同步调整
5. 对应测试更新

不包含：

1. 右键菜单导出能力扩展
2. 快捷键新增
3. 导出成功提示细分
4. PDF 剪切板导出
