function getSnapshotSignature(snapshot) {
  return JSON.stringify(snapshot ?? null)
}

/**
 * 统一编排“命令分发 -> snapshot 广播 -> effect 执行”。
 *
 * runner 只负责执行顺序，不自己做业务裁决：
 * - 状态推进交给 commandService
 * - snapshot 推送交给 windowBridge
 * - 外部副作用交给 effectService
 */
export function createDocumentCommandRunner({
  commandService,
  getSessionSnapshot = () => null,
  publishSnapshotChanged = () => null,
  applyEffect = async () => null,
}) {
  if (!commandService?.dispatch || typeof commandService.dispatch !== 'function') {
    throw new TypeError('commandService.dispatch 必须存在')
  }

  async function run({
    windowId,
    command,
    payload,
    publishSnapshotMode = 'always',
    effectContext = {},
  }) {
    const previousSnapshot = publishSnapshotMode === 'if-changed'
      ? getSessionSnapshot(windowId)
      : null
    const result = await commandService.dispatch({
      windowId,
      command,
      payload,
    })
    const nextSnapshot = result?.snapshot ?? getSessionSnapshot(windowId)

    if (publishSnapshotMode === 'always'
      || getSnapshotSignature(previousSnapshot) !== getSnapshotSignature(nextSnapshot)) {
      publishSnapshotChanged({
        windowId,
        snapshot: nextSnapshot,
      })
    }

    const effectList = Array.isArray(result?.effects) ? result.effects : []
    for (const effect of effectList) {
      await applyEffect({
        windowId,
        effect,
        dispatchCommand: (nextCommand, nextPayload, options = {}) => {
          return run({
            windowId,
            command: nextCommand,
            payload: nextPayload,
            publishSnapshotMode: options.publishSnapshotMode || 'always',
            effectContext,
          })
        },
        ...effectContext,
      })
    }

    return result
  }

  return {
    run,
  }
}

export default {
  createDocumentCommandRunner,
}
