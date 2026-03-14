import { watch } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, Notification, screen, shell } from 'electron'
import fs from 'fs-extra'
import configUtil from '../../data/configUtil.js'
import recent from '../../data/recent.js'
import sendUtil from '../channel/sendUtil.js'
import commonUtil from '../commonUtil.js'
import fileWatchUtil from '../fileWatchUtil.js'
import resourceFileUtil from '../resourceFileUtil.js'
import updateUtil from '../updateUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const winInfoList = []
const MISSING_PATH_REASON = {
  OPEN_TARGET_MISSING: 'open-target-missing',
}

function deleteEditorWin(id) {
  const index = winInfoList.findIndex(win => win.id === id)
  if (index < 0) {
    return false
  }
  winInfoList.splice(index, 1)
  return true
}

function checkWinList() {
  if (winInfoList.length === 0) {
    app.exit()
  }
}

function findByWin(win) {
  return winInfoList.find(item => item.win === win)
}

/**
 * `missingPath` 不是通用兜底路径。
 *
 * 它只用于一个非常具体的场景：
 * - 窗口启动时带了目标路径
 * - 但这个目标文件当时并不存在
 * - 我们仍然希望前端能拿到“缺的是哪一个路径”，用于提示用户移除最近文件
 *
 * 只有在显式标记了这个场景后，`missingPath` 才允许参与展示路径计算。
 * 这样可以避免后续有人误把它复用于“外部删除”“另存为中间态”等其他语义。
 */
function canUseMissingPathForDisplay(winInfo) {
  return Boolean(winInfo?.missingPath)
    && winInfo?.missingPathReason === MISSING_PATH_REASON.OPEN_TARGET_MISSING
}

function getDisplayPath(winInfo) {
  if (winInfo?.path) {
    return winInfo.path
  }
  return canUseMissingPathForDisplay(winInfo) ? winInfo.missingPath : null
}

function getDisplayFileName(winInfo) {
  // “展示路径”和“展示文件名”不是同一套语义。
  //
  // 这里必须只基于 `path` 来决定标题里的文件名：
  // 1. 已保存文件后来被外部删除/重命名移走时，我们会保留 `path`，
  //    所以这里仍然能正确显示原文件名
  // 2. 启动时如果尝试打开一个最近文件，但磁盘上已经不存在，
  //    这时 `path === null`，只有 `missingPath` 用于“提示用户哪个最近文件丢了”
  //    标题仍应回退为 `Unnamed`，保持历史行为不变
  //
  // 因此：`missingPath` 只参与“路径提示”，不参与“标题文件名”计算。
  return winInfo?.path ? path.basename(winInfo.path) : 'Unnamed'
}

function getFileInfoPayload(winInfo) {
  return {
    // 文件名的展示应基于“当前可展示的路径”，
    // 而不是基于 exists。
    // 这样文件被外部删除后，标题仍然保留原文件名，不会错误退回 Unnamed。
    fileName: getDisplayFileName(winInfo),
    // 渲染端页面真正展示和编辑的是 tempContent，
    // 因此这里返回给前端的 content 永远取 tempContent。
    content: winInfo.tempContent,
    saved: winInfo.content === winInfo.tempContent,
    path: getDisplayPath(winInfo),
    exists: winInfo.exists,
    isRecent: winInfo.isRecent,
  }
}

function createExternalWatchState() {
  return fileWatchUtil.createWatchState()
}

function markPathExists(winInfo) {
  winInfo.exists = true
  winInfo.missingPath = null
  winInfo.missingPathReason = null
}

function markPathMissing(winInfo) {
  winInfo.exists = false
}

function isSaved(winInfo) {
  return winInfo.content === winInfo.tempContent
}

function isWindowAlive(win) {
  return Boolean(win) && (typeof win.isDestroyed !== 'function' || win.isDestroyed() === false)
}

/**
 * 标记窗口是否已经完成关闭收尾。
 *
 * 这里不用 `win.isDestroyed()` 作为唯一依据，原因有两个：
 * 1. 保存队列和 watcher 逻辑拿到的是 `winInfo`，它们需要一个稳定的业务态判断
 * 2. 强制关闭时，我们在窗口对象真正销毁前就会先做清理，因此需要一个更早可见的终止信号
 *
 * 一旦这里返回 true，就表示：
 * - 当前窗口后续不应再继续保存队列
 * - 不应再重绑 watcher
 * - 不应再尝试向渲染端发送 IPC
 */
function isWindowFinalized(winInfo) {
  return winInfo?.closed === true
}

/**
 * 同步“是否已保存”状态到渲染端。
 *
 * 这里有两个关键约束：
 * 1. 保存状态永远由 `content === tempContent` 决定
 * 2. 只有状态真的变化时才发送事件，避免重复通知前端
 *
 * `lastNotifiedSavedState` 不是业务真相，
 * 它只是“上一次已经同步给渲染端的保存状态缓存”。
 */
function syncSavedState(winInfo) {
  const saved = isSaved(winInfo)
  const changed = winInfo.lastNotifiedSavedState !== saved
  winInfo.lastNotifiedSavedState = saved
  if (!winInfo?.win || !changed) {
    return saved
  }
  sendUtil.send(winInfo.win, { event: 'file-is-saved', data: saved })
  return saved
}

function shouldAutoSave(winInfo, trigger) {
  return Boolean(winInfo?.path)
    && configUtil.getConfig().autoSave.includes(trigger)
    && isSaved(winInfo) === false
}

function getAutoSaveFailedMessage(error) {
  const detail = typeof error?.message === 'string' && error.message
    ? ` ${error.message}`
    : ''
  if (configUtil.getConfig().language === 'en-US') {
    return `Auto save failed.${detail}`
  }
  return `自动保存失败。${detail}`
}

function notifyAutoSaveFailed(winInfo, error) {
  if (isWindowAlive(winInfo?.win) === false || isWindowFinalized(winInfo)) {
    return
  }
  sendUtil.send(winInfo.win, {
    event: 'message',
    data: {
      type: 'error',
      content: getAutoSaveFailedMessage(error),
    },
  })
}

/**
 * 同一轮自动保存可能会被 blur / close 多次复用同一个 `saveTask`。
 *
 * 如果每次复用都重新挂一个 `.catch()`，那么一旦这轮写盘失败，
 * 所有 catch 都会被依次触发，最终把同一条错误消息弹出多次。
 *
 * 这里按“失败所属的 saveTask Promise”去重：
 * - 同一个 saveTask 失败，只允许通知一次
 * - 下一轮新的 saveTask 失败时，仍然会正常再通知一次
 */
function notifyAutoSaveFailedOnce(winInfo, saveTask, error) {
  if (!winInfo || winInfo.lastAutoSaveFailedTask === saveTask) {
    return
  }
  winInfo.lastAutoSaveFailedTask = saveTask
  notifyAutoSaveFailed(winInfo, error)
}

function finalizeWindowClose(winInfo, id) {
  // 一旦进入最终关闭收尾，就必须先向所有异步链路广播“窗口已终止”。
  // 这样保存队列、写盘后的 watcher 重建、以及后续 IPC 发送都能及时停下。
  winInfo.closed = true
  stopExternalWatch(winInfo)
  deleteEditorWin(id)
  checkWinList()
}

function continueWindowClose(winInfo) {
  if (!isWindowAlive(winInfo?.win)) {
    return false
  }
  winInfo.allowImmediateClose = true
  winInfo.win.close()
  return true
}

function handlePendingCloseAfterSave(winInfo) {
  if (winInfo.pendingCloseAfterSave !== true) {
    return
  }
  winInfo.pendingCloseAfterSave = false

  if (isSaved(winInfo)) {
    continueWindowClose(winInfo)
    return
  }

  if (winInfo.forceClose !== true && isWindowAlive(winInfo.win)) {
    sendUtil.send(winInfo.win, { event: 'unsaved' })
  }
}

async function flushSaveQueue(winInfo) {
  while (winInfo?.path && isWindowFinalized(winInfo) === false) {
    const contentToSave = winInfo.tempContent
    const writeCompleted = await writeSnapshot(winInfo, contentToSave)
    if (writeCompleted === false && isWindowFinalized(winInfo)) {
      return false
    }
    if (winInfo.tempContent === contentToSave) {
      return true
    }
  }
  return false
}

function save(winInfo) {
  if (!winInfo?.path) {
    return Promise.resolve(false)
  }
  if (winInfo.saveTask) {
    return winInfo.saveTask
  }
  // `content === tempContent` 只代表“内存内容一致”，
  // 不代表目标路径已经存在并且完成过落盘。
  // 空白新文件首次保存、或文件缺失后空内容恢复时，
  // 仍然必须实际写盘来创建/恢复文件并重建 watcher。
  if (isSaved(winInfo) && winInfo.exists !== false) {
    return Promise.resolve(true)
  }

  // 新一轮 saveTask 开始前先清掉上一次失败去重标记。
  // 这样后续如果又发生新的自动保存失败，仍然会正常提示一次。
  winInfo.lastAutoSaveFailedTask = null
  winInfo.saveTask = flushSaveQueue(winInfo)
    .finally(() => {
      winInfo.saveTask = null
      handlePendingCloseAfterSave(winInfo)
    })

  return winInfo.saveTask
}

function queueWindowSave(winInfo, options = {}) {
  if (!winInfo?.path) {
    return Promise.resolve(false)
  }
  if (options.closeAfterSave === true) {
    winInfo.pendingCloseAfterSave = true
  }
  const saveTask = save(winInfo)
  return saveTask
    .catch((error) => {
      notifyAutoSaveFailedOnce(winInfo, saveTask, error)
      return false
    })
}

// 当前这次外部变更已经被“收敛处理完成”时，统一走这里清理 watcher 状态。
function settleExternalChange(winInfo, versionHash) {
  if (!winInfo?.externalWatch) {
    return null
  }
  return fileWatchUtil.settlePendingChange(winInfo.externalWatch, versionHash)
}

function getExternalChangeNotificationContent(winInfo, mode = 'applied') {
  const filePath = getDisplayPath(winInfo) || ''
  const fileName = filePath ? path.basename(filePath) : ''
  const isPromptMode = mode === 'prompt'
  if (configUtil.getConfig().language === 'en-US') {
    return {
      title: fileName ? `File content updated - ${fileName}` : 'File content updated',
      body: filePath
        ? `${isPromptMode
          ? 'The file was modified externally. Please return to the editor to review and handle it.'
          : 'The file was modified externally and the latest content has been applied automatically.'}\nPath: ${filePath}`
        : isPromptMode
          ? 'The file was modified externally. Please return to the editor to review and handle it.'
          : 'The file was modified externally and the latest content has been applied automatically.',
    }
  }
  return {
    title: fileName ? `文件内容已更新 - ${fileName}` : '文件内容已更新',
    body: filePath
      ? `${isPromptMode
        ? '检测到文件被外部修改，请返回编辑器查看并处理。'
        : '检测到文件被外部修改，已自动应用最新内容。'}\n路径：${filePath}`
      : isPromptMode
        ? '检测到文件被外部修改，请返回编辑器查看并处理。'
        : '检测到文件被外部修改，已自动应用最新内容。',
  }
}

function getFileMissingNotificationContent(winInfo) {
  const filePath = getDisplayPath(winInfo) || ''
  const fileName = getDisplayFileName(winInfo)
  if (configUtil.getConfig().language === 'en-US') {
    return {
      title: fileName !== 'Unnamed' ? `File deleted - ${fileName}` : 'File deleted',
      body: filePath
        ? `The file has been deleted.\nPath: ${filePath}`
        : 'The file has been deleted.',
    }
  }
  return {
    title: fileName !== 'Unnamed' ? `文件被删除 - ${fileName}` : '文件被删除',
    body: filePath
      ? `检测到文件已被删除。\n路径：${filePath}`
      : '检测到文件已被删除。',
  }
}

// 外部文件变更通知分为两类：
// 1. applied: Electron 已经自动应用了最新内容
// 2. prompt: Electron 发现外部修改，正在等用户回到编辑器处理
// 两种场景都需要系统通知，但文案必须区分，避免把“待处理”误提示成“已自动应用”。
function notifyExternalChange(winInfo, mode = 'applied') {
  const content = getExternalChangeNotificationContent(winInfo, mode)
  const icon = path.resolve(__dirname, '../../../icon/256x256.png')
  if (Notification.isSupported()) {
    const notification = new Notification({
      ...content,
      icon,
    })
    notification.on('click', () => {
      if (winInfo?.win?.isDestroyed() === false) {
        if (winInfo.win.isMinimized()) {
          winInfo.win.restore()
        }
        winInfo.win.show()
        winInfo.win.focus()
      }
    })
    notification.show()
    return
  }
  sendUtil.send(winInfo.win, {
    event: 'message',
    data: {
      type: 'info',
      content: content.body,
    },
  })
}

function notifyFileMissing(winInfo) {
  const content = getFileMissingNotificationContent(winInfo)
  const icon = path.resolve(__dirname, '../../../icon/256x256.png')
  if (Notification.isSupported()) {
    const notification = new Notification({
      ...content,
      icon,
    })
    notification.on('click', () => {
      if (winInfo?.win?.isDestroyed() === false) {
        if (winInfo.win.isMinimized()) {
          winInfo.win.restore()
        }
        winInfo.win.show()
        winInfo.win.focus()
      }
    })
    notification.show()
    return
  }
  sendUtil.send(winInfo.win, {
    event: 'message',
    data: {
      type: 'info',
      content: content.body,
    },
  })
}

function sendExternalChange(winInfo, change) {
  if (!winInfo?.win || !change) {
    return
  }

  // 这里只负责把 diff 所需的信息发给渲染端，
  // 不再在前端判断策略，也不在这里更新 content/tempContent。
  sendUtil.send(winInfo.win, {
    event: 'file-external-changed',
    data: {
      fileName: getFileInfoPayload(winInfo).fileName,
      version: change.version,
      localContent: winInfo.tempContent,
      externalContent: change.content,
    },
  })
}

async function handleLocalResourceLinkOpen(win, winInfo, resourceUrl) {
  const openResult = await resourceFileUtil.openLocalResourceInFolder(winInfo, resourceUrl, shell.showItemInFolder)
  if (openResult.ok !== true) {
    const messageKey = resourceFileUtil.getLocalResourceFailureMessageKey(openResult.reason)
    if (messageKey) {
      sendUtil.send(win, {
        event: 'message',
        data: {
          type: 'warning',
          content: messageKey,
        },
      })
    }
    return openResult
  }

  if (openResult.opened !== true) {
    const messageKey = resourceFileUtil.getLocalResourceFailureMessageKey(openResult.reason)
    if (messageKey) {
      sendUtil.send(win, {
        event: 'message',
        data: {
          type: 'warning',
          content: messageKey,
        },
      })
    }
  }

  return openResult
}

/**
 * 渲染端编辑内容变化时，统一通过这个入口更新 tempContent，
 * 并根据最新的 `content === tempContent` 结果同步保存状态。
 */
function updateTempContent(winInfo, content) {
  winInfo.tempContent = content
  syncSavedState(winInfo)
}

/**
 * 文件被外部删除，或者被外部重命名移走时，统一走这里。
 *
 * 这里的产品语义是：
 * 1. 原路径已经不存在，所以真实磁盘内容 `content` 需要清空
 * 2. 用户正在编辑的 `tempContent` 必须保留，避免编辑内容丢失
 * 3. `path` 继续保留，用户直接保存时仍然写回原路径，不弹保存框
 * 4. 保存状态重新由 `content === tempContent` 决定
 * 5. 通知渲染端刷新标题/保存态，并关闭可能存在的外部 diff 弹窗
 */
function handleFileMissing(winInfo) {
  if (!winInfo) {
    return 'ignored'
  }

  winInfo.content = ''
  markPathMissing(winInfo)

  if (winInfo.externalWatch) {
    winInfo.externalWatch.pendingChange = null
  }

  const payload = getFileInfoPayload(winInfo)
  syncSavedState(winInfo)
  sendUtil.send(winInfo.win, {
    event: 'file-missing',
    data: payload,
  })
  notifyFileMissing(winInfo)
  return 'missing'
}

/**
 * 外部文件变化的统一入口。
 *
 * 这是这次改造里最核心的状态机，处理顺序固定为：
 * 1. 先把磁盘真实值写入 `winInfo.content`
 * 2. 立即重新计算并同步保存状态
 * 3. 如果这时 `content === tempContent`，说明差异已经消失，直接收敛结束
 * 4. 如果仍不相等，再根据策略决定是自动应用还是通知渲染端弹 diff
 */
function handleExternalChange(winInfo, change, options = {}) {
  if (!winInfo || !change) {
    return 'ignored'
  }

  // 第一步：无论后续策略是什么，先保证 content 始终代表磁盘真实值。
  winInfo.content = change.content

  if (syncSavedState(winInfo)) {
    // 真实值更新后已经和当前编辑值一致了，
    // 此时只需要同步保存状态并清理本次 pending，不需要再弹窗。
    settleExternalChange(winInfo, change.versionHash)
    return 'resolved'
  }

  const strategy = options.strategy || configUtil.getConfig().externalFileChangeStrategy || 'prompt'
  if (strategy === 'apply') {
    // 自动应用：Electron 直接把 tempContent 改成真实值，
    // 然后通知渲染端刷新页面即可。
    // 按当前产品语义，只要是“直接应用”策略触发的自动应用，都要发送系统通知。
    winInfo.tempContent = change.content
    settleExternalChange(winInfo, change.versionHash)
    winInfo.lastNotifiedSavedState = true
    sendUtil.send(winInfo.win, {
      event: 'file-content-reloaded',
      data: getFileInfoPayload(winInfo),
    })
    notifyExternalChange(winInfo, 'applied')
    return 'applied'
  }

  // 提醒策略：Electron 保持真实值已更新，但不改 tempContent，
  // 只把 diff 数据发给前端，让用户决定“应用”还是“忽略”。
  // 这里也要立刻发送系统通知，确保窗口未聚焦时用户仍能感知到“有外部修改待处理”。
  sendExternalChange(winInfo, change)
  notifyExternalChange(winInfo, 'prompt')
  return 'prompted'
}

function stopExternalWatch(winInfo) {
  if (!winInfo?.externalWatch) {
    return true
  }
  fileWatchUtil.stopWatching(winInfo.externalWatch)
  return winInfo.externalWatch.watcher === null && winInfo.externalWatch.subscription === null
}

function startExternalWatch(winInfo) {
  if (!winInfo?.path) {
    return false
  }
  if (!winInfo.externalWatch) {
    winInfo.externalWatch = createExternalWatchState()
  }
  if (winInfo.externalWatch.watchingPath === winInfo.path && winInfo.externalWatch.watcher) {
    return true
  }

  stopExternalWatch(winInfo)
  fileWatchUtil.startWatching({
    state: winInfo.externalWatch,
    filePath: winInfo.path,
    watch,
    onExternalChange: (change) => {
      // watcher 只产出“新的外部变化”，
      // 真正的业务处理全部统一收口到 handleExternalChange。
      handleExternalChange(winInfo, change)
    },
    // 目录监听模型下，外部 rename / 删除会表现为“原路径文件暂时不存在”。
    // 这里统一按“文件被删除”处理：
    // - 清空真实磁盘内容
    // - 保留当前编辑内容
    // - 保留原路径，后续保存仍直接写回去
    // - 同步通知前端更新标题/保存状态
    onMissing: () => {
      handleFileMissing(winInfo)
    },
    // 当原路径重新出现时，恢复为正常已存在状态。
    // 后续若内容真的变化，再由 onExternalChange 继续走外部内容处理链路。
    onRestored: () => {
      markPathExists(winInfo)
    },
    onError: () => {
      sendUtil.send(winInfo.win, {
        event: 'message',
        data: {
          type: 'warning',
          content: 'message.fileExternalChangeReadFailed',
        },
      })
    },
  })
  return true
}

/**
 * 提醒策略下，用户在 diff 弹窗里点击“应用”。
 *
 * 这里采用 Electron 主导的应用方式：
 * - 直接更新 content 和 tempContent
 * - 清理本次 pending 状态
 * - 通知渲染端刷新页面
 *
 * 注意：手动应用只刷新渲染端内容，不发送系统通知。
 * 系统通知只属于“直接应用”策略下的自动应用场景。
 *
 * 这样可以保证“谁负责状态，谁负责最终收敛”，避免前后端各改一半。
 */
function applyExternalPendingChange(winInfo, version) {
  const pendingChange = winInfo?.externalWatch?.pendingChange
  if (!pendingChange || pendingChange.version !== version) {
    return false
  }
  winInfo.content = pendingChange.content
  winInfo.tempContent = pendingChange.content
  settleExternalChange(winInfo, pendingChange.versionHash)
  winInfo.lastNotifiedSavedState = true
  sendUtil.send(winInfo.win, {
    event: 'file-content-reloaded',
    data: getFileInfoPayload(winInfo),
  })
  return true
}

/**
 * 提醒策略下，用户在 diff 弹窗里点击“忽略”。
 *
 * 注意这里故意不再修改 content：
 * 因为在外部变更刚进来时，真实磁盘值已经提前写进 `winInfo.content` 了。
 * 忽略的含义只是“保留当前编辑态 tempContent，不采用这次外部内容”，
 * 所以这里只需要清理 pending 状态即可。
 */
function ignoreExternalPendingChange(winInfo, version) {
  const pendingChange = winInfo?.externalWatch?.pendingChange
  if (!pendingChange || pendingChange.version !== version) {
    return false
  }
  fileWatchUtil.ignorePendingChange(winInfo.externalWatch)
  return true
}

async function writeSnapshot(winInfo, contentToSave = winInfo.tempContent) {
  // 强制关闭后的保存语义是“放弃后续编辑”，因此只要窗口已经完成关闭，
  // 后续排队到这里的写盘就必须直接终止，不能继续把新内容补写到磁盘。
  if (!winInfo?.path || isWindowFinalized(winInfo)) {
    return false
  }
  if (winInfo.path && winInfo.externalWatch?.watcher) {
    // 先标记内部保存，再写盘，避免本次写盘被 watcher 误判成外部修改。
    fileWatchUtil.markInternalSave(winInfo.externalWatch, contentToSave)
  }
  await fs.writeFile(winInfo.path, contentToSave)
  if (isWindowFinalized(winInfo)) {
    return false
  }
  markPathExists(winInfo)
  // 真实值必须以“本次实际写盘的快照”作为准绳，
  // 不能被保存过程中的后续编辑覆盖。
  winInfo.content = contentToSave
  if (!winInfo.externalWatch) {
    winInfo.externalWatch = createExternalWatchState()
  }
  startExternalWatch(winInfo)
  // 这里再补一次标记，确保 watcher 在保存完成后的第一轮事件里也能识别这次写盘。
  fileWatchUtil.markInternalSave(winInfo.externalWatch, contentToSave)
  const saved = isSaved(winInfo)
  winInfo.lastNotifiedSavedState = saved
  if (isWindowAlive(winInfo.win)) {
    sendUtil.send(winInfo.win, { event: 'save-success', data: {
      fileName: path.basename(winInfo.path),
      saved,
    } })
  }
  return saved
}

export default {
  deleteEditorWin,
  createNew: async (filePath, isRecent = false) => {
    const exists = Boolean(filePath && await fs.pathExists(filePath))
    if (exists) {
      await recent.add(filePath)
      const find = winInfoList.find(item => item.path === filePath)
      if (find) {
        find.win.show()
        return
      }
    }
    const id = commonUtil.createId()
    const workAreaSize = screen.getPrimaryDisplay().workAreaSize
    const win = new BrowserWindow({
      frame: false,
      icon: path.resolve(__dirname, '../../../icon/favicon.ico'),
      title: 'wj-markdown-editor',
      show: false,
      maximizable: true,
      resizable: true,
      width: workAreaSize.width / 4 * 3,
      height: workAreaSize.height / 4 * 3,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        webSecurity: true,
        preload: path.resolve(__dirname, '../../preload.js'),
      },
    })
    const content = exists ? await fs.readFile(filePath, 'utf-8') : ''
    winInfoList.push({
      id,
      win,
      content,
      tempContent: content,
      path: exists ? filePath : null,
      missingPath: exists ? null : (filePath || null),
      missingPathReason: exists || !filePath ? null : MISSING_PATH_REASON.OPEN_TARGET_MISSING,
      exists,
      isRecent,
      externalWatch: createExternalWatchState(),
      lastNotifiedSavedState: true,
      // 只用于“同一轮 saveTask 失败提示去重”，不是业务真相。
      // 每次创建新的 saveTask 时都会重置。
      lastAutoSaveFailedTask: null,
      closed: false,
    })
    const winInfo = winInfoList.find(item => item.id === id)
    if (exists) {
      startExternalWatch(winInfo)
    }
    win.once('ready-to-show', () => {
      win.show()
      setTimeout(() => {
        updateUtil.checkUpdate(winInfoList)
      }, 30000)
    })
    win.on('unmaximize', () => {
      sendUtil.send(win, { event: 'window-size', data: { isMaximize: false } })
    })
    win.on('maximize', () => {
      sendUtil.send(win, { event: 'window-size', data: { isMaximize: true } })
    })
    win.on('always-on-top-changed', (event, isAlwaysOnTop) => {
      sendUtil.send(win, { event: 'always-on-top-changed', data: isAlwaysOnTop })
    })
    // 通过默认浏览器打开链接
    win.webContents.setWindowOpenHandler((details) => {
      const url = details.url
      if (url.match('^http')) {
        shell.openExternal(url).then(() => {})
      } else if (url.match('^wj://')) {
        const currentWinInfo = winInfoList.find(item => item.id === id)
        handleLocalResourceLinkOpen(win, currentWinInfo, url).then(() => {}).catch(() => {})
      }

      return { action: 'deny' }
    })
    win.on('close', async (e) => {
      const winInfo = findByWin(win)
      if (!winInfo) {
        return
      }
      if (winInfo.allowImmediateClose === true) {
        winInfo.allowImmediateClose = false
        finalizeWindowClose(winInfo, id)
        return
      }
      if (winInfo.forceClose === true) {
        finalizeWindowClose(winInfo, id)
        return
      }
      if (shouldAutoSave(winInfo, 'close')) {
        e.preventDefault()
        queueWindowSave(winInfo, { closeAfterSave: true }).then(() => {})
        return false
      }
      if (winInfo.forceClose !== true) {
        if (isSaved(winInfo) === false) {
          sendUtil.send(win, { event: 'unsaved' })
          e.preventDefault()
          return false
        }
      }
      finalizeWindowClose(winInfo, id)
    })
    win.on('blur', () => {
      const winInfo = findByWin(win)
      if (shouldAutoSave(winInfo, 'blur')) {
        queueWindowSave(winInfo).then(() => {})
      }
    })
    if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
      win.loadURL(content ? `http://localhost:8080/#/${configUtil.getConfig().startPage}` : 'http://localhost:8080/#/editor').then(() => {
        win.webContents.openDevTools({ mode: 'undocked' })
      })
    } else {
      win.loadFile(path.resolve(__dirname, '../../../web-dist/index.html'), { hash: content ? configUtil.getConfig().startPage : 'editor' }).then(() => {})
    }
  },
  getWinInfo: (win) => {
    if (typeof win === 'string') {
      return winInfoList.find(item => item.id === win)
    }
    return winInfoList.find(item => item.win === win)
  },
  getAll: () => {
    return winInfoList
  },
  getByWebContentsId: (webContentsId) => {
    return winInfoList.find(item => item.win.webContents.id === webContentsId)
  },
  getFileInfoPayload,
  handleLocalResourceLinkOpen,
  updateTempContent,
  handleExternalChange,
  handleFileMissing,
  startExternalWatch,
  stopExternalWatch,
  applyExternalPendingChange,
  ignoreExternalPendingChange,
  save,
}
