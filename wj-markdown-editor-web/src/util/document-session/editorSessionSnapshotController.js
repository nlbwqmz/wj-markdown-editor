import { createDocumentSessionBootstrapGuard } from './documentSessionEventUtil.js'
import { createRecentMissingPromptController } from './recentMissingPromptController.js'

function createEditorSessionSnapshotController({
  applySnapshot,
  promptRecentMissing,
  normalizeBootstrapSnapshot,
  setDocumentTitle,
} = {}) {
  const bootstrapGuard = createDocumentSessionBootstrapGuard()
  const recentMissingPromptController = createRecentMissingPromptController({
    prompt: promptRecentMissing,
  })

  // 所有“已确认可落地”的 snapshot 最终都统一走这里：
  // 先处理 recent-missing 提示，再把内容投影到编辑器。
  // 这样 push / bootstrap 两条路径不会各自维护一份提示判定。
  function applyAcceptedSnapshot(snapshot) {
    recentMissingPromptController.sync(snapshot)
    applySnapshot?.(snapshot)
  }

  return {
    beginBootstrapRequest() {
      return bootstrapGuard.beginRequest()
    },
    // bootstrap 结果必须在 guard 通过后，才能做三件事：
    // 1. 归一化并写入 store
    // 2. 更新窗口标题
    // 3. 把最终 snapshot 应用到编辑器内容
    //
    // 把这三步收敛进同一个 guarded 分支后，就不会再出现
    // “虽然正文没回滚，但 store / title 已被旧 bootstrap 响应提前改写”的问题。
    applyBootstrapSnapshot(requestContext, snapshot) {
      if (bootstrapGuard.shouldApplyRequestResult(requestContext) !== true) {
        return false
      }

      const normalizedSnapshot = normalizeBootstrapSnapshot?.(snapshot) || snapshot
      setDocumentTitle?.(normalizedSnapshot?.windowTitle || 'wj-markdown-editor')
      applyAcceptedSnapshot(normalizedSnapshot)
      return true
    },
    // push snapshot 永远代表“主进程已经认定这是当前最新真相”，
    // 因此先推进 bootstrap guard，再按统一入口应用。
    applyPushedSnapshot(snapshot) {
      bootstrapGuard.markSnapshotApplied()
      applyAcceptedSnapshot(snapshot)
    },
  }
}

export {
  createEditorSessionSnapshotController,
}

export default {
  createEditorSessionSnapshotController,
}
