import path from 'node:path'
import { normalizeDocumentSessionKind } from './documentSessionKind.js'

/**
 * 判断输入是否更像 Windows 本地路径。
 *
 * 这里不用运行平台来决定路径语义，原因是：
 * 1. 设计里已经明确要求为 Windows 大小写不敏感比较预留逻辑
 * 2. 测试和未来的纯函数调用，不应该被“当前 Node 运行在哪个系统”绑死
 */
function isWindowsLikePath(targetPath) {
  return /^[a-z]:[\\/]/i.test(targetPath) || targetPath.startsWith('\\\\')
}

/**
 * 取当前路径的展示文件名。
 *
 * `missingPath` 只用于 recent-missing 的提示路径，
 * 不能把它当成当前已经绑定的文档身份来参与标题计算。
 * 因此只要 `documentSource.path` 为空，就统一回退为 `Untitled`。
 */
function getDisplayFileName(documentPath) {
  if (!documentPath) {
    return 'Untitled'
  }

  if (isWindowsLikePath(documentPath)) {
    return path.win32.basename(documentPath.replaceAll('/', '\\'))
  }

  return path.posix.basename(documentPath.replaceAll('\\', '/'))
}

/**
 * 纯推导当前会话是否属于 recent-missing。
 *
 * recent-missing 的核心判定不是“有没有 missingPath”，
 * 而是“当前没有正式文档路径，并且缺失原因就是 recent-missing”。
 * 这样可以避免把后续外部删除、恢复前中间态误认成 recent-missing。
 */
function isRecentMissingSession(session) {
  return session?.documentSource?.path === null
    && session?.documentSource?.missingReason === 'recent-missing'
}

/**
 * 生成渲染层需要消费的只读文档快照。
 *
 * 这里必须保持纯函数，不持有任何可变状态。
 * 命令层、窗口桥、测试都可以随时基于当前 session 重新推导，
 * 从而避免“某处忘记同步 saved / dirty / title”这类派生字段漂移。
 */
export function deriveDocumentSnapshot(session) {
  const documentSource = session?.documentSource || {}
  const editorSnapshot = session?.editorSnapshot || {}
  const diskSnapshot = session?.diskSnapshot || {}
  const closeRuntime = session?.closeRuntime || {}
  const externalRuntime = session?.externalRuntime || {}
  const pendingExternalChange = externalRuntime.pendingExternalChange
  const recentMissing = isRecentMissingSession(session)
  const displayPath = documentSource.path || (recentMissing ? documentSource.missingPath : null)
  const fileName = getDisplayFileName(documentSource.path || null)
  const exists = Boolean(documentSource.exists)
  const saved = editorSnapshot.content === diskSnapshot.content
    && exists === Boolean(diskSnapshot.exists)
  const dirty = !saved
  const revision = Number.isInteger(editorSnapshot.revision) && editorSnapshot.revision >= 0
    ? editorSnapshot.revision
    : 0

  return {
    revision,
    // 当前文档快照所属的会话 id。
    // 渲染层通过它判断收到的快照是否仍对应当前打开的那一个文档会话。
    sessionId: session?.sessionId || null,
    // 当前会话的类型。
    // 渲染层据此决定用哪种方式展示这份文档；类型属于会话，不属于标签页。
    kind: normalizeDocumentSessionKind(session?.kind),
    // 当前编辑器应展示的正文内容。
    // 这里直接来自 editorSnapshot，代表“用户眼下正在编辑的版本”。
    content: editorSnapshot.content || '',
    // 当前文档用于标题栏、标签页等位置展示的文件名。
    // 当没有正式文档路径时，统一回退为 Untitled。
    fileName,
    // 当前文档对外展示的路径。
    // 正常文件优先展示正式 documentPath；recent-missing 场景下退回显示缺失路径，便于用户识别是哪条 recent 失效了。
    displayPath,
    // 仅在 recent-missing 场景下暴露原始缺失路径。
    // 普通文档或草稿返回 null，避免渲染层误把它当成当前正式文档身份。
    recentMissingPath: recentMissing ? documentSource.missingPath : null,
    // 窗口标题使用的最终文案。
    // 未命名草稿统一显示应用名，其余情况显示文件名，保持桌面端标题行为稳定。
    windowTitle: fileName === 'Untitled' ? 'wj-markdown-editor' : fileName,
    // 当前编辑内容是否已经与磁盘基线一致。
    // 只有正文内容一致，且“文件存在性”也一致时，才认为这份快照处于已保存状态。
    saved,
    // 当前文档是否为脏状态。
    // 它始终是 saved 的逻辑取反，便于渲染层按现成字段直接驱动 UI。
    dirty,
    // 当前文档路径在主进程视角下是否存在。
    // 对草稿、recent-missing 或外部被删除文件的场景，这里通常为 false。
    exists,
    // 当前会话是否属于 recent-missing。
    // 渲染层可以基于这个字段决定是否展示“最近文件缺失”相关提示和操作入口。
    isRecentMissing: recentMissing,
    // 关闭前确认弹窗所需的只读快照。
    // 没有关闭阻塞原因时返回 null，渲染层据此直接隐藏相关提示。
    closePrompt: closeRuntime.promptReason
      ? {
          // 是否显示关闭提示。
          // 这里在生成对象时固定为 true，让渲染层只关心“对象是否存在”与“需要展示什么”。
          visible: true,
          // 当前关闭流程的作用域。
          // tab 表示只关当前标签页，window 表示关整个窗口；
          // 两个作用域共用同一个弹窗，但“保存并退出 / 直接退出”的落地动作不同。
          scope: closeRuntime.intent === 'close-tab' ? 'tab' : 'window',
          // 当前触发关闭拦截的原因。
          // 例如存在未保存内容，渲染层会用它匹配对应提示文案。
          reason: closeRuntime.promptReason,
          // 这里先把“是否允许强制关闭”收敛成一个稳定布尔值，
          // 后续关闭命令矩阵只需要改 session 状态，不需要让渲染端猜测条件。
          // 表示当前关闭流程是否已经有明确关闭意图，从而允许用户执行强制关闭动作。
          allowForceClose: Boolean(closeRuntime.intent),
        }
      : null,
    // 外部文件变更提示所需的只读快照。
    // 当 watcher 没有待处理的外部变化时返回 null。
    externalPrompt: pendingExternalChange
      ? {
          // 是否显示外部变更提示。
          // 与 closePrompt 一样，进入这个分支即代表提示应当展示。
          visible: true,
          // 当前外部变更的版本号。
          // 渲染层回传用户决策时，可以用它和主进程确认处理的是同一轮外部变化。
          version: pendingExternalChange.version,
          // 发生提示时，编辑器本地尚未落盘的内容。
          // 用于在比较视图或冲突提示中展示“本地版本”。
          localContent: editorSnapshot.content || '',
          // 来自磁盘或外部事件的新内容。
          // 优先读取 diskContent，兼容旧结构时再回退到 content。
          externalContent: pendingExternalChange.diskContent ?? pendingExternalChange.content ?? '',
          // 发生外部变化的目标文件名。
          // 直接复用当前快照文件名，避免渲染层重复推导。
          fileName,
        }
      : null,
    // 资源能力只需要知道“当前正式文档路径是谁、当前是否已保存、目标文件是否存在”，
    // 不应该让资源层直接碰整份 session，避免未来扩散出新的共享可变状态。
    resourceContext: {
      // 当前正式文档路径。
      // 仅正式绑定文件时有效，草稿和 recent-missing 返回 null。
      documentPath: documentSource.path || null,
      // 当前文档是否已保存。
      // 资源相关能力会据此决定是否允许执行依赖“已落盘文档身份”的操作。
      saved,
      // 当前文档目标文件是否存在。
      // 资源层可以借此快速识别文件是否处于缺失或失效状态。
      exists,
    },
  }
}

/**
 * 生成标签栏需要的精简快照。
 *
 * 标签页只是文档会话的视图外壳，所以标签栏只需要“它是谁、叫什么、是否脏、是否缺失”，
 * 不需要携带正文内容。把正文留给活动会话的完整快照，避免每次推送都把 N 份正文传进渲染层。
 */
export function deriveDocumentTabSnapshot(session) {
  const snapshot = deriveDocumentSnapshot(session)

  return {
    sessionId: snapshot.sessionId,
    kind: snapshot.kind,
    fileName: snapshot.fileName,
    displayPath: snapshot.displayPath,
    dirty: snapshot.dirty,
    // 标签对应文件在磁盘上是否仍然存在。
    // 文件被外部删除/移动后这里是 false，渲染层据此给标签加删除线。
    // 注意未命名草稿同样是 false：草稿本来就没有磁盘文件，
    // 渲染层必须再用 displayPath 是否为空区分“草稿”与“文件被删”，不能只看这个字段。
    exists: snapshot.exists,
    isRecentMissing: snapshot.isRecentMissing,
  }
}

/**
 * 把窗口级标签信息挂到文档快照上。
 *
 * 渲染层只消费 `document.snapshot.changed` 一个真相源，所以标签列表与活动标签
 * 必须跟着同一份快照下发，不能另开一条“标签列表事件”形成第二套状态出口。
 */
export function attachWindowTabsSnapshot({
  snapshot,
  tabs = [],
  activeSessionId = null,
}) {
  if (!snapshot) {
    return snapshot
  }

  // 关闭确认弹窗要能“笼统地”说清楚有多少个标签页没保存，
  // 所以脏标签数量由标签列出现场统计，而不是让渲染层自己算。
  const closePrompt = snapshot.closePrompt
    ? {
        ...snapshot.closePrompt,
        unsavedTabCount: tabs.filter(tab => tab.dirty).length,
      }
    : null

  return {
    ...snapshot,
    closePrompt,
    activeSessionId: activeSessionId || snapshot.sessionId || null,
    tabs,
  }
}

export default {
  attachWindowTabsSnapshot,
  deriveDocumentSnapshot,
  deriveDocumentTabSnapshot,
}
