import { deriveDocumentSnapshot } from './documentSnapshotUtil.js'
import { deriveWindowDocumentSnapshot } from './documentWindowSnapshotUtil.js'
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

// 命令服务按窗口维度分发，默认定位窗口的活动会话。
//
// 多标签之后，命令也可以定向到指定会话（例如后台标签的外部变更回流），
// 此时必须校验该会话确实属于这个窗口，避免跨窗口误改。
function resolveSessionOrThrow(store, windowId, sessionId) {
  if (sessionId) {
    const session = store.getSession(sessionId)
    if (!session) {
      throw new Error(`sessionId 对应的会话不存在: ${sessionId}`)
    }
    const ownerWindowId = store.getWindowIdBySessionId?.(sessionId)
    if (ownerWindowId != null && ownerWindowId !== windowId) {
      throw new Error(`sessionId 不属于该窗口: ${sessionId}`)
    }
    return session
  }

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
  function dispatch({ windowId, sessionId = null, command, payload }) {
    const session = resolveSessionOrThrow(store, windowId, sessionId)
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
      {
        const nextContent = payload?.content ?? ''
        // document.edit 现在既被正常输入链路使用，也会被 route leave 当成
        // “确保最终正文已经进入 session”的屏障；因此相同正文必须严格 no-op，
        // 不能再把同一份内容重复推进成新 revision。
        if (session.editorSnapshot.content === nextContent) {
          break
        }
        // 编辑命令只推进“编辑器事实”，不触碰磁盘事实。
        // 保存链路后续会基于 revision 和 requestedRevision 判断是否需要落盘。
        // 编辑命令只负责推进编辑快照与 revision，
        // 不允许直接把磁盘基线或 persistedSnapshot 一起改掉。
        session.editorSnapshot.content = nextContent
        session.editorSnapshot.revision = (session.editorSnapshot.revision || 0) + 1
        session.editorSnapshot.updatedAt = Date.now()
        session.saveRuntime.requestedRevision = Math.max(
          session.saveRuntime.requestedRevision || 0,
          session.editorSnapshot.revision,
        )
        break
      }

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

      case 'document.save-and-close':
        {
          // 保存并退出必须把“保存”与“关闭意图”绑定在同一条状态机里，
          // 不能由 renderer 先保存、再单独发送 close，否则保存期间取消会留下迟到关窗竞态。
          const closeScope = payload?.scope === 'tab' ? 'tab' : 'window'
          const isTabScope = closeScope === 'tab'

          // 关窗口时如果还有多个脏标签，不能只保存活动会话就关窗，
          // 这里改成逐个会话保存完再关，任一失败就中止。
          if (!isTabScope) {
            const windowSessionList = store.getSessionsByWindowId?.(windowId) || [session]
            const dirtyTabCount = windowSessionList.filter(candidate => isDirty(candidate)).length
            if (dirtyTabCount > 1) {
              effects.push({
                type: 'save-all-and-close',
              })
              break
            }
          }

          if (!session.saveRuntime.inFlightJobId && !isDirty(session)) {
            resetCloseRuntime(session)
            effects.push(isTabScope
              ? { type: 'close-tab', sessionId: session.sessionId }
              : { type: 'close-window' })
            break
          }

          session.closeRuntime.intent = isTabScope ? 'close-tab' : 'close'
          session.closeRuntime.promptReason = 'unsaved-changes'
          session.closeRuntime.forceClose = false
          session.closeRuntime.awaitingPathSelection = false
          session.closeRuntime.waitingSaveJobId = null

          const saveRequested = saveCoordinator.requestSave(session, {
            trigger: 'save-and-close',
          })
          if (session.saveRuntime.status === 'awaiting-path-selection'
            && !session.documentSource.path) {
            session.closeRuntime.awaitingPathSelection = true
          }
          if (session.saveRuntime.inFlightJobId) {
            session.closeRuntime.awaitingPathSelection = false
            session.closeRuntime.waitingSaveJobId = session.saveRuntime.inFlightJobId
          }

          effects.push(
            // 关标签不需要拦住窗口关闭，只有关窗口才需要 hold。
            ...(isTabScope ? [] : [{ type: 'hold-window-close' }]),
            ...saveRequested.effects,
          )

          if (isTabScope) {
            // 保存链路跑完后才收尾关标签；effect 层会先确认会话确实已经不脏。
            effects.push({
              type: 'close-tab-after-save',
              sessionId: session.sessionId,
            })
          }
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

      case 'document.activate-tab':
        {
          // 切换标签是窗口级动作：只改变活动会话指针，
          // 真正的窗口注册、目录监听重绑和快照广播交给 activate-tab effect 完成。
          const targetSessionId = payload?.sessionId || null
          const windowSessionIds = store.getSessionIdsByWindowId?.(windowId) || []
          if (!targetSessionId || !windowSessionIds.includes(targetSessionId)) {
            throw new Error(`activate-tab 目标会话不属于该窗口: ${targetSessionId}`)
          }
          if (store.getActiveSessionIdByWindowId?.(windowId) !== targetSessionId) {
            store.activateSession({ windowId, sessionId: targetSessionId })
            effects.push({
              type: 'activate-tab',
              sessionId: targetSessionId,
            })
          }
        }
        break

      case 'document.reorder-tabs':
        {
          // 标签顺序本身就是持久化对象，所以排序直接落在 store 里，
          // 不需要额外 effect；广播快照时标签栏自然拿到新顺序。
          const nextSessionIds = Array.isArray(payload?.sessionIds) ? payload.sessionIds : null
          if (!nextSessionIds) {
            throw new Error('reorder-tabs 需要 sessionIds 数组')
          }
          store.reorderWindowSessions({
            windowId,
            sessionIds: nextSessionIds,
          })
        }
        break

      case 'document.close-tab':
        {
          const targetSessionId = payload?.sessionId || null
          const windowSessionIds = store.getSessionIdsByWindowId?.(windowId) || []
          if (!targetSessionId || !windowSessionIds.includes(targetSessionId)) {
            throw new Error(`close-tab 目标会话不属于该窗口: ${targetSessionId}`)
          }

          const targetSession = store.getSession(targetSessionId)
          if (!targetSession) {
            throw new Error(`close-tab 目标会话不存在: ${targetSessionId}`)
          }
          ensureSaveRuntime(targetSession)
          ensureCloseRuntime(targetSession)
          watchCoordinator.prepareSession(targetSession)

          // 干净标签直接关掉，不切换活动标签：
          // 用户点的是关闭按钮，不是“打开这个标签”，没必要先跳过去再关。
          if (!isDirty(targetSession)) {
            resetCloseRuntime(targetSession)
            effects.push({
              type: 'close-tab',
              sessionId: targetSessionId,
            })
            break
          }

          // 只有脏标签才需要先激活：
          // 脏判断、保存链路、关闭确认弹窗全部按“当前活动会话”工作，
          // 这样用户看到弹窗时看到的就是要关掉的那份文档。
          if (store.getActiveSessionIdByWindowId?.(windowId) !== targetSessionId) {
            store.activateSession({ windowId, sessionId: targetSessionId })
            effects.push({
              type: 'activate-tab',
              sessionId: targetSessionId,
            })
          }

          // 关标签故意不做“关闭自动保存”：
          // 关掉一个后台标签时静默写盘比弹一次确认更危险，
          // 所以脏标签一律走确认弹窗，由用户选“保存并关闭”或“直接关闭”。
          targetSession.closeRuntime.intent = 'close-tab'
          targetSession.closeRuntime.promptReason = 'unsaved-changes'
          targetSession.closeRuntime.forceClose = false
          targetSession.closeRuntime.awaitingPathSelection = false
          targetSession.closeRuntime.waitingSaveJobId = null
          effects.push({
            type: 'show-unsaved-prompt',
          })
        }
        break

      case 'document.close-tabs':
        {
          // 批量关闭（“关闭其他 / 关闭右侧”）一次裁决、一次广播。
          //
          // 不能把多个 close-tab 串起来用：单个命令为了脏判断会“先激活目标”，
          // 批量时会把活动标签一路拖过去，用户看到的就是标签循环切换。
          const sessionIds = Array.isArray(payload?.sessionIds) ? payload.sessionIds : []
          const windowSessionIds = store.getSessionIdsByWindowId?.(windowId) || []
          const targetSessionIds = sessionIds.filter(sessionId =>
            typeof sessionId === 'string' && windowSessionIds.includes(sessionId),
          )
          if (targetSessionIds.length === 0) {
            break
          }

          // 批量关闭只处理干净标签：脏标签留下来交给用户单独处理，
          // 这里不弹确认框（多个弹窗用户分不清在确认哪一个）。
          const closableSessionIds = []
          for (const sessionId of targetSessionIds) {
            const session = store.getSession(sessionId)
            if (!session) {
              continue
            }
            ensureSaveRuntime(session)
            ensureCloseRuntime(session)
            watchCoordinator.prepareSession(session)
            if (isDirty(session) || session.saveRuntime.inFlightJobId) {
              continue
            }
            closableSessionIds.push(sessionId)
          }

          if (closableSessionIds.length === 0) {
            break
          }

          effects.push({
            type: 'close-tabs',
            sessionIds: closableSessionIds,
          })
        }
        break

      case 'document.move-tab-to-new-window':
        {
          // 把标签整体迁移到新窗口。
          //
          // 正文真相本来就存在 session 里（editorSnapshot.content），
          // 所以这里不做任何内容搬运，只裁决“能不能移”；
          // 解绑旧窗口、建新窗口、重新绑定同一份 session 交给 effect 落地。
          const targetSessionId = payload?.sessionId || null
          const windowSessionIds = store.getSessionIdsByWindowId?.(windowId) || []
          if (!targetSessionId || !windowSessionIds.includes(targetSessionId)) {
            throw new Error(`move-tab-to-new-window 目标会话不属于该窗口: ${targetSessionId}`)
          }

          // 单标签窗口不允许迁移：结果等价于“关窗口 + 开新窗口”，
          // 只会平白丢掉撤销历史，渲染层也按同一规则置灰。
          if (windowSessionIds.length <= 1) {
            break
          }

          const targetSession = store.getSession(targetSessionId)
          if (!targetSession) {
            throw new Error(`move-tab-to-new-window 目标会话不存在: ${targetSessionId}`)
          }

          // 迁移前确保外部监听是就绪的：
          // 新窗口接手后会立刻用这份 watchRuntime 重新绑定，缺了它新窗口就没有监听。
          watchCoordinator.prepareSession(targetSession)

          // 保存或关闭流程进行中的标签不允许迁移：
          // 那两个流程持有 in-flight jobId，换窗口会让回写结果落到错误的窗口上。
          if (targetSession.saveRuntime?.inFlightJobId || targetSession.closeRuntime?.intent) {
            break
          }

          effects.push({
            type: 'move-tab-to-new-window',
            sessionId: targetSessionId,
          })
        }
        break

      case 'document.request-close':
      {
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

        // 多标签：窗口关闭必须看到全部标签的脏状态，不能只看活动会话。
        const windowSessionList = store.getSessionsByWindowId?.(windowId) || [session]
        const dirtySessionList = windowSessionList.filter(candidate => isDirty(candidate))

        // 没有脏内容时，关闭链路直接放行，同时把 closeRuntime 清空，避免残留旧状态。
        if (dirtySessionList.length === 0) {
          resetCloseRuntime(session)
          effects.push({
            type: 'close-window',
          })
          break
        }

        // 多个标签都脏，或唯一脏的不是活动标签时，不做自动保存：
        // 逐个静默写盘风险太高，交给用户在确认弹窗里明确选择。
        if (dirtySessionList.length > 1 || dirtySessionList[0] !== session) {
          session.closeRuntime.intent = 'close'
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
      }

      case 'document.cancel-close':
        // 用户取消关闭后，整个关闭状态机应完全回退，不保留任何等待态。
        resetCloseRuntime(session)
        break

      case 'document.confirm-force-close':
        // 用户明确要求强制关闭后，后续 document.request-close 可以直接放行。
        // 这里同时立即返回 close-window / close-tab effect，避免还要再走一轮确认链路。
        session.closeRuntime.intent = session.closeRuntime.intent === 'close-tab' ? 'close-tab' : 'close'
        session.closeRuntime.forceClose = true
        effects.push(session.closeRuntime.intent === 'close-tab'
          ? {
              type: 'close-tab',
              sessionId: session.sessionId,
            }
          : {
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
      // snapshot 是渲染层消费的只读派生结果，始终基于窗口当前活动会话重新推导。
      // 后台会话的命令也会返回窗口快照（活动会话 + 最新标签列表），
      // 因为渲染层只认“这个窗口现在该显示什么”，不认“刚才是哪个后台会话变了”。
      snapshot: deriveWindowDocumentSnapshot({
        store,
        windowId,
      }),
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
