import { deriveDocumentSnapshot } from './documentSnapshotUtil.js'
import { createWatchCoordinator } from './watchCoordinator.js'

// 为旧会话结构补齐 closeRuntime。
// 这个服务会直接读写关闭流程状态，因此进入命令分发前必须保证字段完整。
function ensureCloseRuntime(session) {
  if (!session.closeRuntime) {
    session.closeRuntime = {
      intent: null,
      promptReason: null,
      waitingSaveJobId: null,
      awaitingPathSelection: false,
      forceClose: false,
    }
  }
}

// 为旧会话结构补齐 saveRuntime。
// 随着保存链路持续演进，store 中可能残留旧版 session，
// 命令层需要先把运行态字段补齐，再进入统一的保存状态机。
function ensureSaveRuntime(session) {
  if (!session.saveRuntime) {
    session.saveRuntime = {
      status: 'idle',
      inFlightJobId: null,
      inFlightRevision: null,
      inFlightBaseDiskVersionHash: null,
      requestedRevision: 0,
      trigger: null,
      lastError: null,
    }
  }
  if (!('pendingSelection' in session.saveRuntime)) {
    session.saveRuntime.pendingSelection = null
  }
  if (!('pendingSaveContext' in session.saveRuntime)) {
    session.saveRuntime.pendingSaveContext = null
  }
  if (!('inFlightBaseDiskVersionHash' in session.saveRuntime)) {
    // 命令层也要补齐这条字段，原因是 store 里可能还存在旧会话结构。
    // 这里不参与保存裁决，只负责保证任何命令进入前运行态字段完整，
    // 避免旧 session 在新保存逻辑里出现 undefined 分支。
    session.saveRuntime.inFlightBaseDiskVersionHash = null
  }
  if (!Number.isFinite(session.saveRuntime.manualRequestSequence)
    || session.saveRuntime.manualRequestSequence < 0) {
    session.saveRuntime.manualRequestSequence = 0
  }
  if (!Array.isArray(session.saveRuntime.activeManualRequestIds)) {
    session.saveRuntime.activeManualRequestIds = []
  }
  if (!session.saveRuntime.manualRequestTargets || typeof session.saveRuntime.manualRequestTargets !== 'object') {
    session.saveRuntime.manualRequestTargets = {}
  }
  if (!Array.isArray(session.saveRuntime.completedManualRequests)) {
    session.saveRuntime.completedManualRequests = []
  }
}

// 把关闭流程运行态恢复到初始值。
// 关闭请求被取消、完成，或因为中途某个分支放弃后，都应回到这份干净状态。
function resetCloseRuntime(session) {
  ensureCloseRuntime(session)
  session.closeRuntime.intent = null
  session.closeRuntime.promptReason = null
  session.closeRuntime.waitingSaveJobId = null
  session.closeRuntime.awaitingPathSelection = false
  session.closeRuntime.forceClose = false
}

// 判断当前触发器是否开启自动保存。
// 配置中允许多个触发源共存，例如 blur、close 可以分别独立开启。
function canAutoSave(config, trigger) {
  const autoSaveList = Array.isArray(config?.autoSave) ? config.autoSave : []
  return autoSaveList.includes(trigger)
}

// 当前命令层不直接自己推导脏状态，而是复用只读快照推导逻辑。
// 这样保存、关闭、自动保存等链路对 dirty 的理解就能保持一致。
function isDirty(session) {
  return deriveDocumentSnapshot(session).dirty
}

// 命令服务按窗口维度分发，因此每次进入都要先定位活动会话。
// 找不到会话说明窗口状态已经失联，这是必须中断的编程错误。
function getSessionByWindowIdOrThrow(store, windowId) {
  const session = store.getSessionByWindowId(windowId)
  if (!session) {
    throw new Error(`windowId 对应的 active session 不存在: ${windowId}`)
  }
  return session
}

/**
 * 创建文档命令服务。
 *
 * 这个服务本身不直接操作窗口、文件系统或 IPC，
 * 而是只做三件事：
 * 1. 基于命令推进 session 里的业务状态
 * 2. 委托 save/watch 协调器处理各自领域的状态机
 * 3. 返回 effects，由上层副作用执行器统一落地
 */
export function createDocumentCommandService({
  store,
  saveCoordinator,
  getConfig = () => ({}),
}) {
  // 文件监听相关命令统一交给 watchCoordinator 处理，
  // documentCommandService 只负责把它接入整体命令分发。
  const watchCoordinator = createWatchCoordinator()

  /**
   * 分发单条文档命令。
   *
   * 返回值中的 `snapshot` 提供给渲染层同步 UI，
   * `effects` 交给副作用层执行，
   * 两者都从同一份 session 真相推导，避免状态分叉。
   */
  function dispatch({ windowId, command, payload }) {
    const session = getSessionByWindowIdOrThrow(store, windowId)
    // 先为可能来自旧 store 的 session 做结构修补，避免后续命令走到 undefined 分支。
    ensureSaveRuntime(session)
    ensureCloseRuntime(session)
    // watcher 运行态也需要在命令入口统一补齐，保证所有命令都面对同一份完整会话结构。
    watchCoordinator.prepareSession(session)
    // effects 只描述“接下来要做什么”，不在命令层直接执行。
    const effects = []
    // 手动保存请求 id 仅在 document.save 时产生，用于让调用方跟踪这次保存请求。
    let manualRequestId = null
    // 另存副本请求 id 仅在 document.save-copy 时产生，用于让选择路径弹窗与结果回写正确关联。
    let copySaveRequestId = null
    // 单次 dispatch 内固定读取一次配置，避免分支里反复访问外部依赖。
    const config = getConfig()

    switch (command) {
      case 'document.edit':
        // 编辑命令只推进“编辑器事实”，不触碰磁盘事实。
        // 保存链路后续会基于 revision 和 requestedRevision 判断是否需要落盘。
        // 编辑命令只负责推进编辑快照与 revision，
        // 不允许直接把磁盘基线或 persistedSnapshot 一起改掉。
        session.editorSnapshot.content = payload?.content ?? ''
        session.editorSnapshot.revision = (session.editorSnapshot.revision || 0) + 1
        session.editorSnapshot.updatedAt = Date.now()
        session.saveRuntime.requestedRevision = Math.max(
          session.saveRuntime.requestedRevision || 0,
          session.editorSnapshot.revision,
        )
        break

      case 'document.save':
        {
          // 手动保存一定走 saveCoordinator，由它决定是直接发起保存，
          // 还是先进入选路径、等待 in-flight 等分支。
          const saveRequested = saveCoordinator.requestSave(session, {
            trigger: 'manual-save',
          })
          manualRequestId = saveRequested.manualRequestId || null
          effects.push(...saveRequested.effects)
        }
        break

      case 'document.save-copy':
        {
          // “另存副本”与常规保存分离处理：
          // 它不应该覆盖当前文档身份，而是生成独立的复制保存流程。
          const copySaveRequested = saveCoordinator.requestCopySave(session)
          copySaveRequestId = copySaveRequested.copySaveRequestId || null
          effects.push(...copySaveRequested.effects)
        }
        break

      case 'window.blur':
        // 失焦自动保存只对已经绑定正式路径的脏文档生效。
        // 未命名草稿如果在这里触发弹路径选择，会严重打断用户，因此这里明确排除。
        if (session.documentSource.path && isDirty(session) && canAutoSave(config, 'blur')) {
          effects.push(...saveCoordinator.requestSave(session, {
            trigger: 'blur-auto-save',
          }).effects)
        }
        break

      case 'document.request-close':
        // forceClose 表示关闭流程已经明确拿到“可直接关闭”的结论，
        // 此时不再做任何额外拦截，直接给出关闭窗口 effect。
        if (session.closeRuntime.forceClose === true) {
          effects.push({
            type: 'close-window',
          })
          break
        }

        // 只要当前已有保存中的 document 本体任务，关闭流程就必须先等待它结束。
        // 这样可以保证关闭路径不会绕过保存完成后的状态收敛。
        if (session.saveRuntime.inFlightJobId) {
          // 只要当前已经存在 document 本体保存任务，关闭链路就必须先走等待矩阵。
          // 这里故意放在 dirty 判断之前，避免 reviewer 指出的“当前看起来已保存就直接关闭，
          // 实际却绕过了 in-flight save 的等待/补写逻辑”。
          session.closeRuntime.intent = 'close'
          session.closeRuntime.promptReason = null
          session.closeRuntime.waitingSaveJobId = session.saveRuntime.inFlightJobId
          effects.push({
            type: 'hold-window-close',
          })
          break
        }

        // 没有脏内容时，关闭链路直接放行，同时把 closeRuntime 清空，避免残留旧状态。
        if (!isDirty(session)) {
          resetCloseRuntime(session)
          effects.push({
            type: 'close-window',
          })
          break
        }

        // 进入关闭链路后先记住关闭意图。
        // 后续无论是自动保存、选路径，还是等待 in-flight 保存，都依赖这份语义上下文。
        session.closeRuntime.intent = 'close'
        session.closeRuntime.promptReason = null
        if (canAutoSave(config, 'close')) {
          // 未命名文档在关闭自动保存时，需要先补齐保存路径。
          // 这里先把 awaitingPathSelection 置为 true，后续对话框回调才能继续关闭链路。
          if (!session.documentSource.path) {
            session.closeRuntime.awaitingPathSelection = true
          }

          // close-auto-save 仍然完全复用统一保存状态机，
          // 命令层只负责把“这是关闭触发的保存”这一意图传下去。
          const saveRequested = saveCoordinator.requestSave(session, {
            trigger: 'close-auto-save',
          })
          // 如果保存请求已经成功进入 in-flight，就把关闭链路挂到该任务上等待完成。
          if (session.saveRuntime.inFlightJobId) {
            session.closeRuntime.waitingSaveJobId = session.saveRuntime.inFlightJobId
          }
          effects.push(
            {
              type: 'hold-window-close',
            },
            ...saveRequested.effects,
          )
          break
        }

        // 未开启 close 自动保存时，关闭请求需要进入“未保存确认”分支。
        // 这里不直接关闭，而是先阻止窗口关闭并要求渲染层展示提示。
        session.closeRuntime.promptReason = 'unsaved-changes'
        effects.push(
          {
            type: 'hold-window-close',
          },
          {
            type: 'show-unsaved-prompt',
          },
        )
        break

      case 'document.cancel-close':
        // 用户取消关闭后，整个关闭状态机应完全回退，不保留任何等待态。
        resetCloseRuntime(session)
        break

      case 'document.confirm-force-close':
        // 用户明确要求强制关闭后，后续 document.request-close 可以直接放行。
        // 这里同时立即返回 close-window effect，避免还要再走一轮确认链路。
        session.closeRuntime.intent = 'close'
        session.closeRuntime.forceClose = true
        effects.push({
          type: 'close-window',
        })
        break

      case 'dialog.save-target-selected': {
        // 这是“保存路径已选中”的统一回流入口，
        // 可能来自手动保存、关闭自动保存等多种保存前置场景。
        session.closeRuntime.awaitingPathSelection = false
        const saveRequested = saveCoordinator.resolveSaveTarget(session, {
          path: payload?.path,
        })
        // 如果当前仍处于关闭链路，并且 resolve 后已经生成 in-flight 保存任务，
        // 就继续让关闭流程等待这次保存完成。
        if (session.closeRuntime.intent === 'close' && session.saveRuntime.inFlightJobId) {
          session.closeRuntime.waitingSaveJobId = session.saveRuntime.inFlightJobId
        }
        effects.push(...saveRequested.effects)
        break
      }

      case 'dialog.save-target-cancelled':
        {
          // 记录取消前是否处于“关闭触发的首次保存选路径”阶段。
          // 这个分支与普通手动保存取消不同，需要直接终止整个关闭链路。
          const wasCloseFirstSave = session.closeRuntime.intent === 'close'
            && session.closeRuntime.awaitingPathSelection === true
          effects.push(...saveCoordinator.cancelPendingSaveTarget(session).effects)
          if (wasCloseFirstSave) {
            // 关闭链路里的“首次保存选路径”属于 close-auto-save 的前置步骤。
            // 设计明确要求：如果用户在这里取消，表示整个关闭请求被取消，
            // 应当直接退出关闭链路并继续编辑，而不是再额外弹一次未保存确认。
            resetCloseRuntime(session)
          }
        }
        break

      case 'dialog.copy-target-selected':
        // 另存副本的目标路径已选中，交给 copy-save 状态机继续推进。
        effects.push(...saveCoordinator.resolveCopyTarget(session, {
          path: payload?.path,
          requestId: payload?.requestId,
        }).effects)
        break

      case 'dialog.copy-target-cancelled':
        // 用户取消另存副本时，只清理 copy-save 自己的请求态，
        // 不应污染普通保存或关闭链路。
        effects.push(...saveCoordinator.cancelCopyTarget(session, {
          requestId: payload?.requestId,
        }).effects)
        break

      case 'save.started':
        // 保存真正开始执行后，把运行态推进到 in-flight。
        // 这里通常由副作用层在实际开始写盘后回流通知。
        effects.push(...saveCoordinator.handleSaveStarted(session, payload).effects)
        break

      case 'save.succeeded':
      {
        // 保存成功后，先让 saveCoordinator 收敛保存状态，
        // 再让 watchCoordinator 更新监听基线，避免 watcher 继续把这次内部写入误判为外部变化。
        const saveSucceededResult = saveCoordinator.handleSaveSucceeded(session, payload)
        effects.push(...saveSucceededResult.effects)
        effects.push(...watchCoordinator.reconcileAfterSave(session).effects)
        // 手动保存请求需要单独记录完成结果，便于渲染层按 request id 反馈给用户。
        if (Array.isArray(saveSucceededResult.completedManualRequestIds)
          && saveSucceededResult.completedManualRequestIds.length > 0) {
          saveCoordinator.refreshCompletedManualSaveRequests(session, {
            requestIds: saveSucceededResult.completedManualRequestIds,
          })
        }
        break
      }

      case 'save.failed':
        // 保存失败只收敛保存状态和错误信息，不在这里额外补做关闭或 watcher 决策。
        effects.push(...saveCoordinator.handleSaveFailed(session, payload).effects)
        break

      case 'copy-save.succeeded':
        // 另存副本成功不会改写当前文档的主保存状态，
        // 只由 copy-save 自己的状态机清理请求并产出反馈。
        effects.push(...saveCoordinator.handleCopySaveSucceeded(session, payload).effects)
        break

      case 'copy-save.failed':
        // 另存副本失败同理，只处理副本保存链路自己的错误收敛。
        effects.push(...saveCoordinator.handleCopySaveFailed(session, payload).effects)
        break

      case 'watch.file-changed':
      case 'watch.file-missing':
      case 'watch.file-restored':
      case 'watch.error':
      case 'watch.bound':
      case 'watch.unbound':
      case 'watch.rebind-failed':
      case 'document.external.apply':
      case 'document.external.ignore':
        // 所有 watcher / 外部变更相关命令统一路由给 watchCoordinator。
        // 命令服务只负责提供 session、payload 和当前外部变更策略配置。
        effects.push(...watchCoordinator.dispatch(session, {
          command,
          payload,
          externalChangeStrategy: config.externalFileChangeStrategy || 'prompt',
        }).effects)
        break

      default:
        throw new Error(`未知命令: ${command}`)
    }

    // session 经过命令层和协调器更新后，统一回写 store。
    store.replaceSession(session)

    return {
      session,
      // snapshot 是渲染层消费的只读派生结果，始终基于最新 session 现场重新推导。
      snapshot: deriveDocumentSnapshot(session),
      // effects 交给上层副作用执行器处理，例如写盘、弹窗、关闭窗口、绑定 watcher 等。
      effects,
      // 仅在本次命令触发了手动保存时返回 request id，否则为 null。
      manualRequestId,
      // 仅在本次命令触发了另存副本时返回 request id，否则为 null。
      copySaveRequestId,
    }
  }

  return {
    dispatch,
  }
}

export default {
  createDocumentCommandService,
}
