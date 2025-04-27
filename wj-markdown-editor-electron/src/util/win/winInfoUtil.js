import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, screen, shell } from 'electron'
import fs from 'fs-extra'
import configUtil from '../../data/configUtil.js'
import recent from '../../data/recent.js'
import sendUtil from '../channel/sendUtil.js'
import commonUtil from '../commonUtil.js'
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

export default {
  createNew: async (filePath) => {
    if (filePath) {
      if (await fs.pathExists(filePath)) {
        await recent.add(filePath)
      }
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
      minWidth: 400,
      minHeight: 600,
      webPreferences: {
        preload: path.resolve(__dirname, '../../preload.js'),
      },
    })
    const content = filePath && await fs.pathExists(filePath) ? await fs.readFile(filePath, 'utf-8') : ''
    winInfoList.push({
      id,
      win,
      content,
      tempContent: content,
      path: filePath || null,
    })
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
      shell.openExternal(details.url).then(() => {})
      return { action: 'deny' }
    })
    win.on('close', (e) => {
      const winInfo = findByWin(win)
      if (winInfo.forceClose !== true) {
        if (winInfo.content !== winInfo.tempContent) {
          sendUtil.send(win, { event: 'unsaved' })
          e.preventDefault()
          return false
        }
      }
      deleteEditorWin(id)
      checkWinList()
    })
    // 在请求自定义协议（wj）时，添加自定义请求头（X-Window-ID）标识窗口ID，用于获取相对路径的图片、文件等
    win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
      if (details.url.startsWith('wj:///')) {
        details.requestHeaders['X-Window-ID'] = id
      }
      callback({ requestHeaders: details.requestHeaders })
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
}
