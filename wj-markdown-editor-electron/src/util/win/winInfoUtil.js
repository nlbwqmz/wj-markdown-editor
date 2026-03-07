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
import updateUtil from '../updateUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const winInfoList = []

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

function getFileInfoPayload(winInfo) {
  return {
    fileName: winInfo.path && winInfo.exists ? path.basename(winInfo.path) : 'Unnamed',
    // 渲染端页面真正展示和编辑的是 tempContent，
    // 因此这里返回给前端的 content 永远取 tempContent。
    content: winInfo.tempContent,
    saved: winInfo.content === winInfo.tempContent,
    path: winInfo.path || winInfo.missingPath || null,
    exists: winInfo.exists,
    isRecent: winInfo.isRecent,
  }
}

function createExternalWatchState() {
  return fileWatchUtil.createWatchState()
}

function isSaved(winInfo) {
  return winInfo.content === winInfo.tempContent
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

// 当前这次外部变更已经被“收敛处理完成”时，统一走这里清理 watcher 状态。
function settleExternalChange(winInfo, versionHash) {
  if (!winInfo?.externalWatch) {
    return null
  }
  return fileWatchUtil.settlePendingChange(winInfo.externalWatch, versionHash)
}

function getExternalChangeNotificationContent(winInfo) {
  const filePath = winInfo?.path || ''
  const fileName = filePath ? path.basename(filePath) : ''
  if (configUtil.getConfig().language === 'en-US') {
    return {
      title: fileName ? `File content updated - ${fileName}` : 'File content updated',
      body: filePath
        ? `The file was modified externally and the latest content has been applied automatically.\nPath: ${filePath}`
        : 'The file was modified externally and the latest content has been applied automatically.',
    }
  }
  return {
    title: fileName ? `文件内容已更新 - ${fileName}` : '文件内容已更新',
    body: filePath
      ? `检测到文件被外部修改，已自动应用最新内容。\n路径：${filePath}`
      : '检测到文件被外部修改，已自动应用最新内容。',
  }
}

function notifyExternalChangeApplied(winInfo) {
  const content = getExternalChangeNotificationContent(winInfo)
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

/**
 * 渲染端编辑内容变化时，统一通过这个入口更新 tempContent，
 * 并根据最新的 `content === tempContent` 结果同步保存状态。
 */
function updateTempContent(winInfo, content) {
  winInfo.tempContent = content
  syncSavedState(winInfo)
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
    notifyExternalChangeApplied(winInfo)
    return 'applied'
  }

  // 提醒策略：Electron 保持真实值已更新，但不改 tempContent，
  // 只把 diff 数据发给前端，让用户决定“应用”还是“忽略”。
  sendExternalChange(winInfo, change)
  return 'prompted'
}

function stopExternalWatch(winInfo) {
  if (!winInfo?.externalWatch) {
    return true
  }
  fileWatchUtil.stopWatching(winInfo.externalWatch)
  return winInfo.externalWatch.watcher === null && winInfo.externalWatch.debounceTimer === null
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
  winInfo.externalWatch = createExternalWatchState()
  fileWatchUtil.startWatching({
    state: winInfo.externalWatch,
    filePath: winInfo.path,
    watch,
    onExternalChange: (change) => {
      // watcher 只产出“新的外部变化”，
      // 真正的业务处理全部统一收口到 handleExternalChange。
      handleExternalChange(winInfo, change)
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

async function save(winInfo) {
  if (winInfo.path && winInfo.externalWatch?.watcher) {
    // 先标记内部保存，再写盘，避免本次写盘被 watcher 误判成外部修改。
    fileWatchUtil.markInternalSave(winInfo.externalWatch, winInfo.tempContent)
  }
  await fs.writeFile(winInfo.path, winInfo.tempContent)
  winInfo.exists = true
  winInfo.missingPath = null
  // 保存完成后，真实值与编辑值完全一致。
  winInfo.content = winInfo.tempContent
  if (!winInfo.externalWatch) {
    winInfo.externalWatch = createExternalWatchState()
  }
  startExternalWatch(winInfo)
  // 这里再补一次标记，确保 watcher 在保存完成后的第一轮事件里也能识别这次写盘。
  fileWatchUtil.markInternalSave(winInfo.externalWatch, winInfo.tempContent)
  winInfo.lastNotifiedSavedState = true
  sendUtil.send(winInfo.win, { event: 'save-success', data: {
    fileName: path.basename(winInfo.path),
    saved: true,
  } })
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
      exists,
      isRecent,
      externalWatch: createExternalWatchState(),
      lastNotifiedSavedState: true,
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
        const filePath = commonUtil.decodeWjUrl(url)
        if (path.isAbsolute(filePath)) {
          shell.showItemInFolder(filePath)
        } else {
          const winInfo = winInfoList.find(item => item.id === id)
          if (winInfo.path) {
            const fullPath = path.resolve(path.dirname(winInfo.path), filePath)
            fs.pathExists(fullPath).then((exists) => {
              if (exists) {
                shell.showItemInFolder(fullPath)
              } else {
                sendUtil.send(win, { event: 'message', data: { type: 'warning', content: 'message.theFileDoesNotExist' } })
              }
            }).catch(() => {})
          }
        }
      }

      return { action: 'deny' }
    })
    win.on('close', async (e) => {
      const winInfo = findByWin(win)
      if (winInfo.path && configUtil.getConfig().autoSave.includes('close') && winInfo.content !== winInfo.tempContent) {
        await save(winInfo)
      }
      if (winInfo.forceClose !== true) {
        if (winInfo.content !== winInfo.tempContent) {
          sendUtil.send(win, { event: 'unsaved' })
          e.preventDefault()
          return false
        }
      }
      stopExternalWatch(winInfo)
      deleteEditorWin(id)
      checkWinList()
    })
    win.on('blur', () => {
      const winInfo = findByWin(win)
      if (winInfo.path && configUtil.getConfig().autoSave.includes('blur') && winInfo.content !== winInfo.tempContent) {
        save(winInfo)
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
  updateTempContent,
  handleExternalChange,
  startExternalWatch,
  stopExternalWatch,
  applyExternalPendingChange,
  ignoreExternalPendingChange,
  save,
}
