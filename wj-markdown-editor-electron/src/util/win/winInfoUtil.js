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
  winInfoList.splice(index, 1)
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
  if (change.content === winInfo.tempContent) {
    winInfo.externalWatch.ignoredVersionHash = change.versionHash
    winInfo.externalWatch.pendingChange = null
    return
  }
  sendUtil.send(winInfo.win, {
    event: 'file-external-changed',
    data: {
      fileName: getFileInfoPayload(winInfo).fileName,
      filePath: winInfo.path,
      version: change.version,
      localContent: winInfo.tempContent,
      externalContent: change.content,
      saved: winInfo.content === winInfo.tempContent,
      exists: winInfo.exists,
    },
  })
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
      sendExternalChange(winInfo, change)
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

function applyExternalPendingChange(winInfo, version, options = {}) {
  const pendingChange = winInfo?.externalWatch?.pendingChange
  if (!pendingChange || pendingChange.version !== version) {
    return false
  }
  winInfo.content = pendingChange.content
  winInfo.tempContent = pendingChange.content
  winInfo.externalWatch.pendingChange = null
  winInfo.externalWatch.ignoredVersionHash = null
  sendUtil.send(winInfo.win, {
    event: 'file-content-reloaded',
    data: getFileInfoPayload(winInfo),
  })
  sendUtil.send(winInfo.win, { event: 'file-is-saved', data: true })
  if (options.notify === true) {
    notifyExternalChangeApplied(winInfo)
  }
  return true
}

function ignoreExternalPendingChange(winInfo, version) {
  const pendingChange = winInfo?.externalWatch?.pendingChange
  if (!pendingChange || pendingChange.version !== version) {
    return false
  }
  winInfo.content = pendingChange.content
  fileWatchUtil.ignorePendingChange(winInfo.externalWatch)
  sendUtil.send(winInfo.win, { event: 'file-is-saved', data: false })
  return true
}

async function save(winInfo) {
  if (winInfo.path && winInfo.externalWatch?.watcher) {
    fileWatchUtil.markInternalSave(winInfo.externalWatch, winInfo.tempContent)
  }
  await fs.writeFile(winInfo.path, winInfo.tempContent)
  winInfo.exists = true
  winInfo.missingPath = null
  winInfo.content = winInfo.tempContent
  if (!winInfo.externalWatch) {
    winInfo.externalWatch = createExternalWatchState()
  }
  startExternalWatch(winInfo)
  fileWatchUtil.markInternalSave(winInfo.externalWatch, winInfo.tempContent)
  sendUtil.send(winInfo.win, { event: 'save-success', data: {
    fileName: path.basename(winInfo.path),
    saved: true,
  } })
}

export default {
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
  startExternalWatch,
  stopExternalWatch,
  applyExternalPendingChange,
  ignoreExternalPendingChange,
  save,
}
