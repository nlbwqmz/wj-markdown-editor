# 主编辑窗口原生全屏设计

## 1. 背景

当前主编辑窗口已经具备一套稳定的窗口宿主控制链路：

- Web 顶部栏 `wj-markdown-editor-web/src/components/layout/LayoutTop.vue`
  - 已提供最小化、最大化 / 还原、置顶、打开所在目录等入口
- Web 顶部菜单 `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`
  - 已提供 `文件 / 视图 / 帮助` 菜单结构
- Renderer 事件接线 `wj-markdown-editor-web/src/util/channel/eventUtil.js`
  - 已负责把 Electron 宿主事件同步到 Pinia store
- 主进程 IPC `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`
  - 已收口窗口控制事件，例如 `minimize`、`maximize`、`restore`、`always-on-top`
- 窗口生命周期 `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`
  - 已监听 `maximize` / `unmaximize`、`always-on-top-changed` 等窗口原生事件，并把状态推回 renderer

但当前主窗口还缺少“原生全屏”能力。用户希望新增一个 Electron 全屏功能，并提供两个统一入口：

1. Web 顶部 `视图` 菜单
2. Web 顶部右上角功能图标区域最左侧的切换图标

这里的“全屏”已明确为 Electron 原生全屏，而不是简单最大化。也就是说：

- 进入全屏后应隐藏系统标题栏和任务栏
- 退出全屏后恢复为原窗口模式
- 用户通过 `Esc` 或系统手段退出全屏时，Web 端状态也必须自动同步

## 2. 目标

### 2.1 功能目标

1. 仅为主编辑窗口增加 Electron 原生全屏能力。
2. 顶部 `视图` 菜单新增全屏切换入口。
3. 顶部右上角功能图标区最左侧新增全屏切换图标入口。
4. 全屏与非全屏状态下，右上角图标必须不同。
5. 顶部菜单文案、右上角图标、tooltip 都必须跟随窗口真实全屏状态切换。
6. 当用户通过 `Esc` 或系统方式退出全屏时，renderer 侧状态必须自动回灌，不允许图标和菜单状态漂移。

### 2.2 交互目标

1. 两个入口都只触发同一条全屏控制链路，不允许各自维护一套逻辑。
2. 原生全屏与当前“最大化 / 还原”是两套不同能力，界面上必须保持区分。
3. 右上角新增按钮的位置固定为功能图标区最左侧，不改变最小化 / 最大化 / 关闭按钮的现有顺序语义。

## 3. 非目标

以下内容不在本次范围内：

- 为 `设置 / 关于 / 导出 / 引导` 等其他 Electron 窗口增加全屏能力
- 重构现有最大化 / 还原行为
- 新增全屏快捷键
- 调整系统原生菜单栏或托盘行为
- 重构整个顶部栏布局样式

## 4. 方案选择

### 4.1 方案 A：新增独立全屏 IPC 与独立全屏状态

做法：

- Web 端新增 `isFullScreen` store 字段
- 顶部菜单和右上角图标都调用同一个全屏切换动作
- 主进程新增独立全屏 IPC
- `windowLifecycleService.js` 监听 `enter-full-screen` / `leave-full-screen`
- renderer 通过独立事件接收全屏状态变更

优点：

- 语义清晰，和 `isMaximize`、`isAlwaysOnTop` 一致，都是宿主状态
- 能正确处理 `Esc` 退出全屏等非按钮触发场景
- 后续扩展全屏相关交互时边界更清楚

缺点：

- 会新增一组状态字段和事件名

### 4.2 方案 B：把全屏状态塞进现有 `window-size`

做法：

- 继续复用 `window-size` 事件
- 扩为同时携带 `isMaximize` 与 `isFullScreen`

优点：

- 改动面略小

缺点：

- “最大化”和“原生全屏”语义不同，混在同一个事件里会降低可维护性
- 容易让后续调用方误把两者当成同一种窗口状态

### 4.3 方案 C：renderer 本地切换图标，不做主进程状态回灌

做法：

- 点击按钮后只更新 renderer 本地状态
- 不监听窗口原生全屏事件

优点：

- 代码最少

缺点：

- 用户通过 `Esc` 或系统行为退出全屏后，Web 图标和菜单状态会漂移
- 不符合当前项目“宿主掌握窗口真相，renderer 只消费状态”的架构方向

### 4.4 推荐结论

采用方案 A。

理由如下：

1. 当前项目已经把最大化、置顶等窗口能力建成“主进程掌握真相，renderer 同步状态”的模式，全屏应沿用同一条主线。
2. 原生全屏天然存在来自系统层面的状态变化，仅靠 renderer 本地切换无法保证状态一致。
3. 独立事件与独立 store 字段能避免把全屏和最大化错误耦合。

## 5. 总体设计

### 5.1 状态模型

Web 端 Pinia store 新增一个独立字段：

- `isFullScreen: boolean`

该字段只表达“当前主编辑窗口是否处于 Electron 原生全屏”，不参与以下语义：

- 是否最大化
- 是否置顶
- 当前编辑文档状态

### 5.2 控制原则

两个 UI 入口必须指向同一个动作入口：

- 菜单点击
- 顶部图标点击

该动作入口不自行推测最终状态，而是基于当前 `store.isFullScreen` 计算目标值，并把目标值发送给主进程，例如：

- 当前非全屏，则请求切到 `true`
- 当前已全屏，则请求切到 `false`

主进程执行后，最终仍以窗口原生事件回推状态为准。

### 5.3 状态回灌原则

状态回灌必须满足两条要求：

1. 不是只有点击按钮后才更新，而是任何原生全屏状态变化都要更新
2. renderer 只消费主进程推来的全屏状态，不依赖本地乐观更新

这样才能保证：

- 用户点击右上角按钮进入全屏时，状态正确
- 用户从菜单退出全屏时，状态正确
- 用户按 `Esc` 退出全屏时，状态仍正确

## 6. 模块职责

### 6.1 Web 顶部栏

文件：

- `wj-markdown-editor-web/src/components/layout/LayoutTop.vue`

职责调整：

1. 在右上角功能图标区最左侧新增全屏按钮。
2. 按 `store.isFullScreen` 切换 tooltip、图标与点击行为。
3. 继续保留现有最小化、最大化 / 还原、关闭按钮，不与全屏合并。

图标建议：

- 非全屏：`i-tabler:arrows-maximize`
- 全屏：`i-tabler:arrows-minimize`

tooltip 文案：

- 非全屏：`进入全屏`
- 全屏：`退出全屏`

### 6.2 Web 顶部菜单

文件：

- `wj-markdown-editor-web/src/components/layout/LayoutMenu.vue`

职责调整：

1. 在 `视图` 菜单中保留现有 `切换` 项。
2. 在其后新增一个全屏菜单项。
3. 菜单项文案按 `store.isFullScreen` 切换：
   - 非全屏：`进入全屏`
   - 全屏：`退出全屏`
4. 菜单点击与顶部栏按钮点击共用同一个全屏动作入口。

### 6.3 Web store

文件：

- `wj-markdown-editor-web/src/stores/counter.js`

职责调整：

1. 新增 `isFullScreen` 默认状态。
2. 作为顶部栏、顶部菜单的唯一状态来源。

### 6.4 Renderer 事件接线

文件：

- `wj-markdown-editor-web/src/util/channel/eventUtil.js`

职责调整：

1. 新增全屏状态事件监听。
2. 收到主进程回推后，更新 `store.isFullScreen`。
3. 不在这里自行推导全屏状态，只做事件到 store 的同步。

### 6.5 主进程 IPC

文件：

- `wj-markdown-editor-electron/src/util/channel/ipcMainUtil.js`

职责调整：

1. 新增独立全屏 IPC 入口。
2. IPC 接收显式布尔值，而不是无参数 `toggle`。
3. 主进程通过 `BrowserWindow.setFullScreen(flag)` 执行原生全屏切换。

这里不建议直接复用 `maximize` / `restore`：

- `maximize` 只影响工作区尺寸
- `setFullScreen` 才是 Electron 原生全屏

### 6.6 窗口生命周期

文件：

- `wj-markdown-editor-electron/src/util/document-session/windowLifecycleService.js`

职责调整：

1. 新增对 `enter-full-screen` 和 `leave-full-screen` 的监听。
2. 在事件中向 renderer 发送独立的全屏状态事件。
3. 窗口创建完成后应向 renderer 主动推送一次当前全屏状态，避免初始状态漂移。
4. 初始状态推送的触发时机必须晚于窗口 shell 加载完成，并复用 renderer 已可接收宿主事件的安全时机，例如 `did-finish-load` 之后；不额外引入新的握手协议。

这里的“初始状态推送”主要用于保持 renderer store 与宿主窗口一致，哪怕默认情况下窗口通常并非全屏。

## 7. 数据流

### 7.1 进入全屏

1. 用户点击顶部菜单或顶部栏图标。
2. Web 端根据 `store.isFullScreen === false` 计算目标值 `true`。
3. Renderer 发送全屏 IPC。
4. 主进程调用 `win.setFullScreen(true)`。
5. Electron 触发 `enter-full-screen`。
6. `windowLifecycleService.js` 向 renderer 推送“当前已全屏”事件。
7. `eventUtil.js` 更新 `store.isFullScreen = true`。
8. 菜单文案、tooltip、图标自动切换为“退出全屏”状态。

### 7.2 退出全屏

1. 用户点击菜单 / 图标，或按 `Esc`，或通过系统方式退出。
2. Electron 触发 `leave-full-screen`。
3. `windowLifecycleService.js` 向 renderer 推送“当前非全屏”事件。
4. `eventUtil.js` 更新 `store.isFullScreen = false`。
5. 菜单文案、tooltip、图标自动切回“进入全屏”状态。

## 8. 文案与图标设计

### 8.1 中文文案

建议新增以下文案：

- `top.enterFullScreen`: `进入全屏`
- `top.exitFullScreen`: `退出全屏`
- `topMenu.view.children.enterFullScreen`: `进入全屏`
- `topMenu.view.children.exitFullScreen`: `退出全屏`

### 8.2 英文文案

建议新增以下文案：

- `top.enterFullScreen`: `Enter full screen`
- `top.exitFullScreen`: `Exit full screen`
- `topMenu.view.children.enterFullScreen`: `Enter Full Screen`
- `topMenu.view.children.exitFullScreen`: `Exit Full Screen`

### 8.3 图标约束

图标必须来自 `i-tabler` 图标集，并具备明确的状态区分。

建议采用：

- 进入全屏：`i-tabler:arrows-maximize`
- 退出全屏：`i-tabler:arrows-minimize`

选择理由：

- 与“进入 / 退出全屏”的视觉语义一致
- 能和现有最大化按钮的 `crop-1-1`、还原按钮的 `layers-subtract` 保持区分

## 9. 边界与兼容性

### 9.1 窗口范围边界

本次只对主编辑窗口生效，不要求改动以下窗口：

- 设置窗口
- 关于窗口
- 导出窗口
- 引导窗口

这些窗口继续保持现状，不新增全屏按钮，也不接入全屏状态同步。

### 9.2 与最大化状态并存

全屏与最大化可能在生命周期上连续出现，但在状态模型上必须分离：

- `isMaximize` 继续只表示最大化
- `isFullScreen` 继续只表示原生全屏

不允许出现以下错误设计：

- 进入全屏时强行把 `isMaximize` 当成 `true`
- 退出全屏时依赖 `restore()` 代替 `setFullScreen(false)`

从“已最大化”进入原生全屏，再退出原生全屏时，窗口是否回到最大化状态，允许直接依赖 Electron 原生窗口行为，不在本次规格中额外重写一套自定义恢复逻辑。对应测试也应验证“调用链与状态回推正确”，而不是强制覆盖 Electron 自身的窗口恢复语义。

### 9.3 状态漂移防护

以下场景必须保持状态正确：

1. 通过右上角图标进入全屏
2. 通过顶部菜单退出全屏
3. 通过 `Esc` 退出全屏
4. 通过系统方式离开全屏

换言之，renderer 不得把“按钮点击是否成功”当作最终状态依据，只能以主进程原生事件为准。

## 10. 测试策略

### 10.1 Web 端测试

建议至少补齐以下测试：

1. `eventUtil.js` 收到全屏状态事件后，必须正确同步 `store.isFullScreen`
2. `LayoutTop.vue` 在非全屏时，应渲染进入全屏图标与 tooltip，并发送“切到 true”的 IPC
3. `LayoutTop.vue` 在全屏时，应渲染退出全屏图标与 tooltip，并发送“切到 false”的 IPC
4. `LayoutMenu.vue` 在非全屏时，应生成“进入全屏”菜单项
5. `LayoutMenu.vue` 在全屏时，应生成“退出全屏”菜单项
6. 菜单与顶部栏必须共用同一条动作语义，不允许一个入口发 `toggle`，另一个发显式布尔值

### 10.2 Electron 端测试

建议至少补齐以下测试：

1. 新增的全屏 IPC 收到 `true` 时，必须调用 `win.setFullScreen(true)`
2. 新增的全屏 IPC 收到 `false` 时，必须调用 `win.setFullScreen(false)`
3. `windowLifecycleService.js` 收到 `enter-full-screen` 时，必须向 renderer 发送已全屏事件
4. `windowLifecycleService.js` 收到 `leave-full-screen` 时，必须向 renderer 发送未全屏事件
5. 窗口初始创建后，必须向 renderer 推送一次当前全屏状态，避免初始状态漂移

## 11. 实施约束

1. 必须沿用现有窗口宿主状态同步模式，不额外引入 renderer 本地状态机。
2. 顶部菜单和右上角按钮不得各自复制一份全屏逻辑，必须复用同一套动作入口。
3. 不修改现有文档会话主线，不绕过当前 `channelUtil -> ipcMainUtil -> windowLifecycleService` 的窗口控制链路。
4. 不调整其他窗口布局组件，例如 `OtherLayout.vue`。
5. 所有新增文案都必须补齐中英文国际化。

## 12. 计划入口

后续实现计划可按以下顺序推进：

1. 补充 store 与 renderer 事件接线的全屏状态字段
2. 在主进程 IPC 与窗口生命周期中接入原生全屏控制和状态广播
3. 为 `LayoutTop.vue` 与 `LayoutMenu.vue` 增加统一全屏入口
4. 补齐 Web 与 Electron 两侧测试
