import { useCommonStore } from '@/stores/counter.js'
import { requestCurrentWindowOpenPreparation } from './currentWindowOpenPreparationService.js'
import {
  requestDocumentActivateTab,
  requestDocumentCloseTab,
  requestDocumentSessionSnapshot,
} from './rendererDocumentCommandUtil.js'
import { pickTabBaseline, resolveTargetTabBySteps } from './tabNavigationUtil.js'

/**
 * 标签页动作的 renderer 侧收口。
 *
 * 分两层，边界必须守住：
 *
 * 1. 原语层（无队列、无状态累积）
 *    - resolveSwitchAutoSaveReady / activateTabById / closeTabById
 *    - 标签栏点击、快捷键链路都走这一层，保证“切换前收敛正文”只有一份实现
 *
 * 2. 键盘入口层（有队列、有意图累积）
 *    - requestSwitchStep / requestCloseTab
 *    - 只有快捷键需要它：点击的目标由用户直接指定，不存在“算错目标”的竞态，
 *      而且点击必须立即响应，不能被键盘队列挡住
 *
 * 三个关键不变量：
 *
 * A. 基线只认主进程回包/查询，不读广播。
 *    主进程 publishSnapshotChanged 与 invoke 回复走的是不同管道（Electron 官方
 *    从未保证两者的先后），把“连按算对目标”押在广播时序上等于押运气。
 *    因此：activate 用命令返回的 snapshot（dispatch 是同步改 store 的，回包即切换后状态），
 *    close 用一次显式查询（close 的销毁发生在 effect 里，回包还是销毁前的快照）。
 *
 * B. 切换按“位移”累积，永不丢按键；关闭按“次数”累积，最多积压 MAX_PENDING_CLOSE 次。
 *    位移是可合并的标量：按 5 次 = 1 条命令走到终点，既不丢意图也不会延迟累积。
 *    关闭是破坏性动作，超出上限直接丢弃，避免慢盘上松手后标签继续自己关。
 *
 * C. 待决弹窗期间清空意图，而不是暂停。
 *    closePrompt / externalPrompt 的可见态来自“活动会话”快照，切换标签会让它消失
 *    但主进程 closeRuntime 仍然残留（还会挡住“移动到新窗口”）。所以这里不是“等用户处理完
 *    再继续”，而是直接丢弃尚未执行的动作，避免用户关掉弹窗后动作突然生效。
 */
const MAX_PENDING_CLOSE = 2

// 单飞队列：同一时刻只有一步在飞，切换与关闭共用同一条链。
let tail = Promise.resolve()
let workerQueued = false

// 意图累积器
let pendingSteps = 0
let pendingCloseCount = 0

// 最近一次 activate 回包给出的权威基线；close 后必须作废。
let lastActivateBaseline = null
// 关闭幂等护栏：同一个 sessionId 连续两次出现，说明上一次关闭没有真正完成。
let lastClosedSessionId = null

function readSnapshot() {
  return useCommonStore().documentSessionSnapshot || null
}

function isPromptBlocked(snapshot = readSnapshot()) {
  return snapshot?.closePrompt?.visible === true || snapshot?.externalPrompt?.visible === true
}

function hasPendingIntent() {
  return pendingSteps !== 0 || pendingCloseCount > 0
}

function clearPendingIntent() {
  pendingSteps = 0
  pendingCloseCount = 0
  lastActivateBaseline = null
  // 本轮按压到此结束，下一次按关闭必须允许重新尝试（例如用户取消了确认框）。
  lastClosedSessionId = null
}

/**
 * 判断本次切换是否需要先收敛正文，返回值为 requestDocumentActivateTab 的 autoSave 参数。
 *
 * 主进程的“切换时自动保存”读的是它手上的 session 正文，而编辑器内容经异步 IPC 回流；
 * 不先 flush 就让刚输入的内容以旧版本写盘并被标记为已保存。
 * 收敛失败时返回 false：宁可不保存，也不能拿旧内容写盘。
 */
export async function resolveSwitchAutoSaveReady() {
  const autoSaveList = useCommonStore().config?.autoSave
  if (!Array.isArray(autoSaveList) || !autoSaveList.includes('switch')) {
    return true
  }

  try {
    const preparation = await requestCurrentWindowOpenPreparation()
    return preparation?.ok !== false
  }
  catch {
    return false
  }
}

/**
 * 切换到指定标签页（原语，不排队）。
 *
 * @param {string} sessionId
 * @returns {Promise<boolean>} 是否确认切换成功
 */
export async function activateTabById(sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') {
    return false
  }

  const autoSave = await resolveSwitchAutoSaveReady()

  try {
    const result = await requestDocumentActivateTab(sessionId, { autoSave })
    const baseline = pickTabBaseline(result?.snapshot)

    // 只有回包确认活动标签就是目标时，才把它当成下一步的基线。
    // 这样“命令被主进程判成 no-op / 目标不存在”时不会留下错误基线。
    if (baseline && baseline.activeSessionId === sessionId) {
      lastActivateBaseline = baseline
      return true
    }

    lastActivateBaseline = null
    return false
  }
  catch {
    lastActivateBaseline = null
    return false
  }
}

/**
 * 关闭指定标签页（原语，不排队）。
 *
 * 脏标签由主进程进入确认流程，renderer 不做脏判断。
 *
 * @param {string} sessionId
 * @returns {Promise<boolean>} 命令是否被接受（关闭是否真正完成由主进程决定）
 */
export async function closeTabById(sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') {
    return false
  }

  try {
    await requestDocumentCloseTab(sessionId)
    // close 的销毁发生在主进程 effect 之后，命令回包仍是销毁前的快照，
    // 所以这里只能作废基线，不能拿回包当下一步的起点。
    lastActivateBaseline = null
    return true
  }
  catch {
    return false
  }
}

/**
 * 按位移执行一次切换（位移已由调用方合并好）。
 */
async function activateBySteps(steps) {
  // 第一步用“用户当前看到的”（对齐他的认知），后续步骤用上一次回包（对齐真相）。
  const baseline = lastActivateBaseline ?? pickTabBaseline(readSnapshot())
  const targetSessionId = resolveTargetTabBySteps({
    sessionIdList: baseline?.sessionIdList,
    activeSessionId: baseline?.activeSessionId,
    steps,
  })

  if (!targetSessionId) {
    lastActivateBaseline = null
    return
  }

  await activateTabById(targetSessionId)
}

/**
 * 关闭“此刻真正活动”的标签页。
 *
 * 关闭目标必须现查，不能用渲染层算出来的 sessionId：
 * 快照滞后时按旧 id 关闭会关到用户没想关的标签（Firefox bug 1236185 就是这类问题）。
 */
async function closeActiveByFreshSnapshot() {
  let snapshot
  try {
    snapshot = await requestDocumentSessionSnapshot()
  }
  catch {
    clearPendingIntent()
    return
  }

  const baseline = pickTabBaseline(snapshot)
  const sessionId = baseline?.activeSessionId
  if (!sessionId) {
    clearPendingIntent()
    return
  }

  // 同一轮连按里又一次落到同一个标签上，说明上一次关闭没有真正完成
  // （脏标签进入了确认流程，或主进程否决了这次关闭）。
  // 此时必须丢弃本轮剩余意图，否则用户处理完确认框后，剩下那几次关闭会把下一个标签也关掉。
  // 注意这只是“本轮”的判断：clearPendingIntent 会把它一起清掉，
  // 所以用户取消确认框之后再按一次仍会重新尝试。
  if (sessionId === lastClosedSessionId) {
    clearPendingIntent()
    return
  }
  lastClosedSessionId = sessionId

  const closed = await closeTabById(sessionId)
  if (!closed) {
    clearPendingIntent()
  }
}

/**
 * 执行一步（切换优先）。
 *
 * 切换没有积压上限，先把它消化掉可以避免“按住关闭时切换被饿死”；
 * 关闭有上限，天然不会长期霸占队列。
 */
async function runOneStep() {
  if (isPromptBlocked()) {
    clearPendingIntent()
    return
  }

  if (pendingSteps !== 0) {
    const steps = pendingSteps
    pendingSteps = 0
    await activateBySteps(steps)
    return
  }

  if (pendingCloseCount > 0) {
    pendingCloseCount -= 1
    await closeActiveByFreshSnapshot()
  }
}

function scheduleWork() {
  if (workerQueued) {
    return
  }
  workerQueued = true

  const next = tail.then(runOneStep, runOneStep)
  tail = next.then(() => {}, () => {})

  const onSettled = () => {
    workerQueued = false
    // 结算瞬间到达的按键不能丢：它们此刻只能累积，等这里重新调度。
    if (hasPendingIntent()) {
      scheduleWork()
    }
  }

  next.then(onSettled, onSettled)
}

/**
 * 快捷键入口：切换一个标签（相对位移累积）。
 *
 * 不做 debounce、不拦键盘自动重复：
 * 连按与长按都是用户在表达“往前几格”，累积后一次算到终点即可。
 *
 * @param {'next'|'previous'} direction
 */
export function requestSwitchStep(direction) {
  if (direction !== 'next' && direction !== 'previous') {
    return
  }

  pendingSteps += direction === 'next' ? 1 : -1
  scheduleWork()
}

/**
 * 快捷键入口：关闭当前标签页。
 *
 * 关闭是破坏性动作：忙时直接丢弃，只有积压未满时才接受新的关闭意图。
 */
export function requestCloseTab() {
  if (isPromptBlocked()) {
    clearPendingIntent()
    return
  }

  // 新一轮按压：把上一轮“关闭没完成”的记忆清掉，
  // 否则用户取消确认框之后再按 Ctrl+w 会静默无效。
  if (pendingCloseCount === 0 && !workerQueued) {
    lastClosedSessionId = null
  }

  if (pendingCloseCount >= MAX_PENDING_CLOSE) {
    return
  }

  pendingCloseCount += 1
  scheduleWork()
}

export default {
  resolveSwitchAutoSaveReady,
  activateTabById,
  closeTabById,
  requestSwitchStep,
  requestCloseTab,
}
