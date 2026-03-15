# 文档会话化保存与监听重构总结报告

> 日期：2026-03-15
> 分支：`feature/document-session-save-refactor`
> 对应设计：`docs/superpowers/specs/2026-03-14-document-session-save-refactor-design.md`

## 1. 任务目标与最终结论

本次重构围绕“手动保存、自动保存、关闭前保存、外部文件监听、文件缺失/恢复、最近文件、资源相关动作”建立统一的 `DocumentSession` 会话模型，目标是把状态真相从分散的窗口镜像、watcher 回调和 renderer 局部事件中收口到主进程命令流。

当前分支已经完成本轮设计要求，并补齐了评审阶段陆续暴露出的竞态与兼容问题。到本报告更新时：

- 主保存链路、关闭链路、watcher 链路、保存成功后的 recent 持久化、资源相关上下文、renderer keep-alive 恢复策略都已经统一到新架构约束下。
- 另存为保持“保存副本，不切换当前文档”的既有产品语义，并补齐了请求级与写盘任务级隔离。
- 本轮最终只读复评结论为“未发现新的问题”。

本报告不再沿用旧阶段里已经过时的描述，以下内容全部以当前代码、当前设计文档和本轮最新验证结果为准。

## 2. 实际完成的架构收敛

### 2.1 主进程状态真相

主进程已经稳定为“命令收口 + 协调器裁决 + effect 执行 + 快照投影”的模型：

- `documentSessionStore` 负责会话注册、窗口绑定与路径复用查找。
- `documentCommandService` 成为用户命令、系统命令、effect 回流结果的统一入口。
- `saveCoordinator` 统一处理手动保存、失焦自动保存、关闭前自动保存、首次保存、保存副本。
- `watchCoordinator` 统一处理 watcher 事件去重、binding token、event floor、缺失/恢复、重绑状态机。
- `documentEffectService` 只负责执行写盘、对话框、副作用重绑，以及 `recent.remove` / `recent.clear` 和“保存成功”链路上的 recent 持久化等真实动作，不再直接定义业务真相。

当前实现里，`save.succeeded` 的主真相已经与 recent 持久化彻底解耦：

- 文件写盘成功后先回流 `save.succeeded`。
- `recent.add` 改为附属副作用异步补做，失败或卡住都不会拖住主保存完成态。
- 保存后如果需要 watcher 重绑，重绑失败会标准化回流 `watch.rebind-failed`，不会把“已写盘成功”误报成保存失败。

### 2.2 watcher 命令流统一

live watcher 的普通事件与错误事件现在都已经标准化接入命令流：

- `change` -> `watch.file-changed`
- `missing` -> `watch.file-missing`
- `restored` -> `watch.file-restored`
- `error` -> `watch.error`

兼容层当前只保留两类职责：

- 承接底层 `fileWatchUtil` 订阅与解绑
- 把底层去重状态与命令流收敛结果对齐，例如 pending settle、missing 后清理历史

也就是说，普通 live 事件已经不再旁路协调器直接改业务状态；真正的磁盘基线、外部冲突、缺失/恢复和重绑状态，都回到会话命令流里裁决。

### 2.3 renderer keep-alive 恢复策略

编辑页与预览页的 keep-alive 恢复链路也已经做了统一收敛：

- 新增公共模块 `rendererSessionActivationStrategy.js`
- 页面进入策略统一由 `onActivated` 决定
- `mounted` 在 keep-alive 下不再主动补拉 bootstrap，避免与 `activated` 双发
- 默认空快照不会被误重放
- 如果 store 中已经有真实快照，恢复时会优先直接重放
- 只有在当前生命周期没有可用真快照时，才补拉 `document.get-session-snapshot`
- 页面失活时会停掉快照监听，隐藏页不再继续后台消费正文和提示态
- bootstrap 响应加入生命周期裁决，迟到结果不会在页面失活或卸载后继续执行标题更新、关闭提示同步或 recent-missing 提示

### 2.4 业务兼容边界

本次重构没有改变以下既有产品语义：

- `save-copy` 仍然只是保存副本，不切换当前文档
- 最近文件缺失仍区分 startup 与 user 两类触发
- 本地资源“在资源管理器中打开”、删除、删除后的 Markdown 清理仍以当前会话上下文为准
- 同一物理文档在相对路径 / 绝对路径 / Windows 大小写变体之间会被识别为同一会话，保持复用 / 聚焦语义
- 打开文件对话框仍只接受 Markdown 文档，不能因为切到“所有文件”就绕过 `.md` 校验

## 3. 本轮补齐并关闭的关键问题

本次重构不是一次性完成后没有返工，而是经过多轮“实现 -> 验证 -> 评审 -> 修复 -> 再验证”的闭环。最终关闭的重点问题如下：

### 3.1 保存链路

- 修复了 `save.succeeded` 可能把 watcher 已观测到的新磁盘版本回写成本次保存版本的问题，避免外部冲突下误标成“已保存”。
- 修复了显式手动保存会被进行中的自动保存吞掉的问题，手动保存意图现在会独立记录并按手动语义结算。
- 修复了关闭脏未命名草稿时，取消首次保存选路会错误退回未保存确认框的问题；现在会直接清空关闭运行态并保持窗口打开。
- 修复了保存成功后 watcher 重绑失败会被升级成主保存异常的问题；现在标准化为 `watch.rebind-failed`，失败结果会收敛回 watcher 异常状态，不再把主保存结果误判成失败。

### 3.2 `save-copy` 与 recent

- 修复了多个 `save-copy` 请求交错时的串线问题，当前实现按 `requestId` 和 `jobId` 双隔离。
- 补齐了 `same-path` 失败、无 `jobId` 失败结果、旧请求先完成等边界，旧请求结果不会再覆盖新请求提示或运行态。
- 修复了 `recent.add` 同步阻塞主保存完成的问题，recent 写入现在是附属副作用，不再决定主保存真相。

### 3.3 watcher 与路径身份

- 修复了 `watch.error` 自动重绑链路曾经存在的死链问题，warning / 新 token / 自动重绑 / `watch.rebind-failed` 已全部接通。
- 补齐了普通 live watcher 事件统一进命令流的问题，不再保留“普通事件旁路协调器、错误事件才走协调器”的分叉。
- 修复了 Windows 下目录级 watcher 路由按大小写敏感匹配的问题，避免同一文件名大小写变化时静默丢事件。
- 修复了相对路径与绝对路径不会识别成同一文档的问题，避免同一文件被重复开窗。

### 3.4 renderer 与 UI 同步

- 修复了 `closePrompt` 弹窗打开后不再跟随 snapshot 更新的问题。
- 修复了 startup `recent-missing` 提示受 bootstrap guard 竞态影响而丢失的问题。
- 修复了 closePrompt 在 bootstrap 首屏恢复为可见态时，store 已进入关闭确认态但界面没有弹窗的问题。
- 修复了 keep-alive 下失活页面仍继续监听快照、后台刷新正文的问题。
- 修复了 keep-alive 恢复时默认空快照误重放、首轮 bootstrap 失效后不再补拉、store 已有真快照却仍空白等待 IPC、`mounted + activated` 双发 bootstrap 等问题。
- 修复了预览页未接 recent-missing 提示链路的问题，现在编辑页与预览页都按同一策略处理。

### 3.5 本地资源链路

- 修复了资源删除请求与当前快照/文档状态脱钩的问题，避免异步返回后把旧正文覆盖回当前正文。
- 修复了删除确认 UI 在 keep-alive 路由切换后仍可继续执行的问题，隐藏的编辑页不再保留可误删本地资源的旧 action context。
- 补齐了资源菜单、删除确认弹窗、Markdown 清理与当前会话上下文的绑定，避免上下文变化后继续沿用旧 `assetInfo`。

## 4. 设计文档同步结果

本轮已经同步更新设计文档，新增或明确了以下约束：

- `save.succeeded` 不得等待 `recent.add`
- 保存成功后的 watcher 重绑失败必须标准化为 watcher 异常，而不是保存失败
- `save-copy` 必须按 `requestId` / `jobId` 双隔离
- renderer keep-alive 恢复必须采用统一激活策略
- 默认占位快照不能误重放
- store 已有真实快照时要优先重放
- 失活页面必须停掉快照监听
- 验收标准新增了资源删除上下文、manual-save vs auto-save、watcher 大小写、相对/绝对路径复用、`.md` 校验、`save-copy` 串线等硬性场景

## 5. 最终验证结果

### 5.1 本轮最新自动化验证

| 类型 | 命令 | 结果 |
|------|------|------|
| Electron 定向回归 | `cd wj-markdown-editor-electron && npx vitest run src/util/document-session/__tests__/saveCoordinator.test.js src/util/document-session/__tests__/documentCommandService.test.js src/util/document-session/__tests__/documentEffectService.test.js src/util/win/winInfoUtil.test.js` | `4 files, 106 passed` |
| Web 定向回归 | `cd wj-markdown-editor-web && node --test src/util/document-session/__tests__/editorSessionSnapshotController.test.js src/util/document-session/__tests__/rendererSessionSnapshotController.test.js src/util/document-session/__tests__/rendererSessionEventSubscription.test.js src/util/document-session/__tests__/rendererSessionActivationStrategy.test.js` | `19 passed` |
| Web 构建 | `cd wj-markdown-editor-web && npm run build` | 构建成功，仅有既有 chunk size warning |
| Electron 静态启动探测 | `cd wj-markdown-editor-electron && npm run static` | 25 秒后超时；命令作为常驻 GUI 进程未在超时时间内退出，本轮没有即时崩溃输出，不能记为“通过”，只能记为“未观察到即时失败” |

### 5.2 验证解读

- 本轮最新验证重点覆盖了当前最后几轮修复所涉及的保存协调、关闭链路、watcher 重绑、副作用规范化、renderer keep-alive 恢复、recent-missing 与 closePrompt 同步。
- `npm run build` 成功，说明 web 侧修改在当前依赖与构建配置下可正常产出。
- `npm run static` 的超时来自 Electron GUI 进程常驻这一运行形态，不表示静态入口失败；因此本报告不会把这条命令表述成“通过”，只如实记录为“未见即时崩溃输出”。

## 6. 代码评审记录

### 6.1 过程要求执行情况

本次开发遵守了设计文档中约定的流程：

- 在独立分支 `feature/document-session-save-refactor` 上持续开发
- 每个非只读任务后都进行了自动化验证
- 每轮评审发现的问题都在进入下一轮前修复并复测
- 当前文档更新后，又补做了一轮最小验证与只读复评

### 6.2 最终评审结论

最终一轮 reviewer 结论：

- reviewer：`019cf197-0c5c-78d1-998d-65fd300e43d1`
- 结论：未发现新的问题

该结论成立之前，本分支已经关闭了前述所有重要评审项；当前没有遗留的 blocker / important 级未关闭问题。

## 7. 当前状态与后续建议

### 7.1 当前状态

截至本报告更新时，可以确认：

- 当前实现与最新设计文档已经同步
- 关键竞态问题都已补齐对应测试与实现保护
- 本轮最新验证未发现回归
- 最终只读复评未发现新的问题

### 7.2 后续建议

当前没有已知必须阻塞交付的逻辑漏洞；后续如果还要继续提升发布前把关强度，优先建议补的是桌面端 UI 自动化，而不是再回退到散落式修修补补。重点可以覆盖：

- recent-missing 首屏交互
- 外部修改弹窗操作
- 资源管理器打开与资源删除确认
- 关闭前自动保存决策树

这属于把关能力增强项，不是当前已知缺陷。

## 8. 最终结论

本次“文档会话化保存与监听重构”已经完成既定目标：

- 保存、自动保存、关闭前保存、watcher、recent、资源相关上下文都已收敛到统一文档会话模型
- renderer 侧不再依赖分散的 legacy 文档状态事件拼装真相
- `save-copy`、recent、资源删除、keep-alive 恢复等高风险回归点都已补齐
- 在本轮最新自动化验证与最终代码评审范围内，未发现未关闭问题

当前分支可以作为本次重构任务的完成态基线继续使用。
