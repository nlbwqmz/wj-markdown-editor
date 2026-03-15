import { createDocumentSessionBootstrapGuard } from './documentSessionEventUtil.js'
import { createRecentMissingPromptController } from './recentMissingPromptController.js'

function createEditorSessionSnapshotController({
  applySnapshot,
  promptRecentMissing,
  syncRecentMissing,
  normalizeBootstrapSnapshot,
  syncClosePrompt,
  setDocumentTitle,
} = {}) {
  const bootstrapGuard = createDocumentSessionBootstrapGuard()
  const recentMissingPromptController = createRecentMissingPromptController({
    prompt: promptRecentMissing,
  })
  let active = true
  let disposed = false
  let lifecycleVersion = 0
  let hasAppliedSnapshot = false
  let lastBootstrapRequestLifecycleVersion = null

  function canApplySnapshot() {
    return disposed !== true && active === true
  }

  // 所有“已确认可落地”的 snapshot 最终都统一走这里：
  // 先处理 recent-missing 提示，再把内容投影到编辑器。
  // 这样 push / bootstrap 两条路径不会各自维护一份提示判定。
  function applyAcceptedSnapshot(snapshot) {
    if (typeof syncRecentMissing === 'function') {
      syncRecentMissing(snapshot)
    } else {
      recentMissingPromptController.sync(snapshot)
    }
    syncClosePrompt?.(snapshot)
    // keep-alive 页面恢复时只允许重放“已经被主流程真正接纳过”的 snapshot。
    // 如果这里还没有任何一次成功应用，说明页面仍处于首屏 bootstrap 之前，
    // 视图层绝不能拿 store 默认空快照提前把 ready 打开。
    hasAppliedSnapshot = true
    applySnapshot?.(snapshot)
  }

  return {
    hasAppliedSnapshot() {
      return hasAppliedSnapshot
    },
    needsBootstrapOnActivate() {
      // 只有在“当前生命周期里还没应用过任何 snapshot，且也没有为当前生命周期发起过 bootstrap”
      // 时，恢复激活才需要主动补拉。
      // 这样既能避免初次挂载时 onMounted/onActivated 双发请求，
      // 也能覆盖“首轮 bootstrap 在失活期间失效，恢复后必须重新补拉”的场景。
      return hasAppliedSnapshot !== true
        && lastBootstrapRequestLifecycleVersion !== lifecycleVersion
    },
    activate() {
      if (disposed === true || active === true) {
        return false
      }

      active = true
      return true
    },
    deactivate() {
      if (disposed === true || active === false) {
        return false
      }

      // 页面离开后，之前发起的 bootstrap 响应即使稍后回来，也必须失效。
      // 否则 keep-alive 切页后，旧 IPC 结果仍会在隐藏页或重新激活后继续执行副作用。
      active = false
      lifecycleVersion += 1
      return true
    },
    dispose() {
      if (disposed === true) {
        return false
      }

      active = false
      disposed = true
      lifecycleVersion += 1
      return true
    },
    beginBootstrapRequest() {
      lastBootstrapRequestLifecycleVersion = lifecycleVersion
      return {
        ...bootstrapGuard.beginRequest(),
        lifecycleVersion,
      }
    },
    // bootstrap 结果必须在 guard 通过后，才能做三件事：
    // 1. 归一化并写入 store
    // 2. 更新窗口标题
    // 3. 把最终 snapshot 应用到编辑器内容
    //
    // 把这三步收敛进同一个 guarded 分支后，就不会再出现
    // “虽然正文没回滚，但 store / title 已被旧 bootstrap 响应提前改写”的问题。
    applyBootstrapSnapshot(requestContext, snapshot) {
      if (canApplySnapshot() !== true) {
        return false
      }
      if (bootstrapGuard.shouldApplyRequestResult(requestContext) !== true) {
        return false
      }
      if (requestContext?.lifecycleVersion !== lifecycleVersion) {
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
      if (canApplySnapshot() !== true) {
        return false
      }
      bootstrapGuard.markSnapshotApplied()
      applyAcceptedSnapshot(snapshot)
      return true
    },
  }
}

export {
  createEditorSessionSnapshotController,
}

export default {
  createEditorSessionSnapshotController,
}
