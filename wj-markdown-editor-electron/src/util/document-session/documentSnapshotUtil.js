import path from 'node:path'

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
 * 因此只要 `documentSource.path` 为空，就统一回退为 `Unnamed`。
 */
function getDisplayFileName(documentPath) {
  if (!documentPath) {
    return 'Unnamed'
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

  return {
    sessionId: session?.sessionId || null,
    content: editorSnapshot.content || '',
    fileName,
    displayPath,
    recentMissingPath: recentMissing ? documentSource.missingPath : null,
    windowTitle: fileName === 'Unnamed' ? 'wj-markdown-editor' : fileName,
    saved,
    dirty,
    exists,
    isRecentMissing: recentMissing,
    closePrompt: closeRuntime.promptReason
      ? {
          visible: true,
          reason: closeRuntime.promptReason,
          // 这里先把“是否允许强制关闭”收敛成一个稳定布尔值，
          // 后续关闭命令矩阵只需要改 session 状态，不需要让渲染端猜测条件。
          allowForceClose: Boolean(closeRuntime.intent),
        }
      : null,
    externalPrompt: pendingExternalChange
      ? {
          visible: true,
          version: pendingExternalChange.version,
          localContent: editorSnapshot.content || '',
          externalContent: pendingExternalChange.diskContent ?? pendingExternalChange.content ?? '',
          fileName,
        }
      : null,
    // 资源能力只需要知道“当前正式文档路径是谁、当前是否已保存、目标文件是否存在”，
    // 不应该让资源层直接碰整份 session，避免未来扩散出新的共享可变状态。
    resourceContext: {
      documentPath: documentSource.path || null,
      saved,
      exists,
    },
  }
}

export default {
  deriveDocumentSnapshot,
}
