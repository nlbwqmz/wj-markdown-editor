import { createEditorSessionSnapshotController } from './editorSessionSnapshotController.js'
import { createRecentMissingPromptController } from './recentMissingPromptController.js'

const sharedRecentMissingPromptSyncMap = new WeakMap()

function getSharedRecentMissingSnapshotSync(promptRecentMissing) {
  const cachedSync = sharedRecentMissingPromptSyncMap.get(promptRecentMissing)
  if (cachedSync) {
    return cachedSync
  }

  const sharedPromptController = createRecentMissingPromptController({
    prompt: promptRecentMissing,
  })
  const syncRecentMissing = snapshot => sharedPromptController.sync(snapshot)

  sharedRecentMissingPromptSyncMap.set(promptRecentMissing, syncRecentMissing)
  return syncRecentMissing
}

/**
 * 创建渲染层通用的 session snapshot 协调器。
 *
 * EditorView / PreviewView 都需要同一套约束：
 * 1. bootstrap 结果先写入 store，再投影到页面
 * 2. recent-missing 提示必须在所有视图一致触发
 * 3. closePrompt / title 不能因为页面不同而分叉
 *
 * 把这些公共接线收敛到这里后，后续新增页面时就不会再漏掉某一条链路。
 */
function createRendererSessionSnapshotController({
  applySnapshot,
  store,
  promptRecentMissing,
  syncClosePrompt,
  setDocumentTitle = (title) => {
    window.document.title = title
  },
} = {}) {
  if (typeof promptRecentMissing !== 'function') {
    throw new TypeError('promptRecentMissing 必须显式提供，避免视图遗漏 recent-missing 提示链路')
  }
  if (typeof syncClosePrompt !== 'function') {
    throw new TypeError('syncClosePrompt 必须显式提供，避免视图遗漏 closePrompt 同步链路')
  }

  const editorSessionSnapshotController = createEditorSessionSnapshotController({
    applySnapshot,
    // Editor / Preview 会各自持有一份 view 级 controller；
    // 如果 recent-missing 提示状态也跟着各自维护，keep-alive 下同一路径会各弹一次确认框。
    // 这里把“最终提示去重”提升到 renderer 共享层，但共享层仍然接收完整 snapshot，
    // 这样在离开 missing 态后，后续再次进入同一路径缺失时仍能重新提示。
    syncRecentMissing: getSharedRecentMissingSnapshotSync(promptRecentMissing),
    normalizeBootstrapSnapshot: (snapshot) => {
      return store?.applyDocumentSessionSnapshot?.(snapshot) || snapshot
    },
    syncClosePrompt,
    setDocumentTitle,
  })

  return {
    ...editorSessionSnapshotController,
    // keep-alive 恢复时如果直接重放 store 快照，也必须复用统一副作用链，
    // 否则 recent-missing / closePrompt 会被绕开，直到下一次真实 push 才补弹。
    replaySnapshot(snapshot) {
      return editorSessionSnapshotController.applyPushedSnapshot(snapshot)
    },
  }
}

export {
  createRendererSessionSnapshotController,
}

export default {
  createRendererSessionSnapshotController,
}
