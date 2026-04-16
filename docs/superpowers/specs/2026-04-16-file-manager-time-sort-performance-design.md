# 文件管理栏时间排序性能优化设计

## 1. 背景

文件管理栏排序入口位于 `wj-markdown-editor-web/src/components/layout/FileManagerPanel.vue`，排序状态由 `wj-markdown-editor-web/src/util/file-manager/fileManagerPanelController.js` 写入配置并驱动目录状态重算。按修改时间排序时，Electron 端 `wj-markdown-editor-electron/src/util/document-session/documentFileManagerService.js` 会根据 `includeModifiedTime` 为目录条目补充 `modifiedTimeMs`。

现有链路有三个明确问题：

- Renderer 排序比较器在每次比较时重复解析条目类型、名称与类型权重，目录较大时比较成本明显放大。
- 切换排序配置后，控制器会立即重算一次，随后配置监听器再次重算；切入修改时间排序时还会再请求一次目录状态，存在可避免的中间重排。
- 目录监听服务重扫时已经传出 `includeModifiedTime`，但运行时组合层没有继续透传给文件管理服务，可能导致按时间排序后的目录变更刷新结果缺少 `modifiedTimeMs`。

## 2. 目标

- 保持现有排序语义不变：目录始终在前，支持名称、修改时间、类型排序，修改时间相同时按名称稳定兜底。
- 降低 Renderer 侧排序比较器的重复计算成本。
- 避免排序配置切换时的重复重算。
- 修复目录 watch 重扫时 `includeModifiedTime` 的透传缺口。
- 为上述行为补充自动化测试。

## 3. 非目标

- 不新增排序字段。
- 不改变配置结构。
- 不改变文件管理栏 UI。
- 不引入目录树、分页或虚拟列表。
- 不改变 Electron 端读取目录时按需 `stat` 的产品策略。

## 4. 设计

### 4.1 Renderer 排序键预计算

在 `sortFileManagerEntryList()` 内部先把条目映射为排序项，排序项包含原始条目、原始索引、名称、类型、是否非目录、类型权重和修改时间。比较器只读取排序项字段，避免在 `Array.prototype.sort()` 的每次比较中重复调用 `resolveFileManagerEntryType()`、`resolveFileManagerEntryName()` 和 `resolveFileManagerEntryTypeWeight()`。

名称比较改为复用模块级 `Intl.Collator('zh-CN', { sensitivity: 'base', numeric: true })`。排序结果仍返回原始条目列表，不改变外部 API。

### 4.2 排序配置切换去重

`updateFileManagerSortConfig()` 只负责写配置与推进 `store.config`，不再主动调用 `recomputeDirectoryStateFromLatestSource()`。排序重算统一交给已有的 `store.config.fileManagerSort` 监听器处理。这样可以避免一次显式重算和一次 watch 重算重复执行。

### 4.3 目录 watch 重扫透传修改时间标记

运行时组合层的 `readDirectoryState` 回调接收并传递 `includeModifiedTime`，使 `documentDirectoryWatchService` 在当前窗口绑定为时间排序模式时，重扫结果继续包含 `modifiedTimeMs`。

## 5. 测试策略

- Web 侧补充排序工具测试，验证修改时间排序语义不变，并用调用计数证明类型解析不再在比较器中重复放大。
- Web 侧补充控制器测试，验证排序配置更新后只通过配置监听器触发一次目录状态重算。
- Electron 侧补充运行时组合测试，验证目录 watch 重扫的 `includeModifiedTime` 能透传到 `fileManagerService.readDirectoryState()`。

## 6. 风险与控制

- 排序稳定性风险：通过原始索引作为最终兜底，确保完全相等时顺序稳定。
- 现有测试依赖风险：保持 `sortFileManagerEntryList(entryList, sortConfig)` API 不变，减少调用方影响。
- 文件系统性能风险：本轮不改变 `stat` 策略，只修复透传与 Renderer 计算热点，避免扩大主进程行为改动范围。
