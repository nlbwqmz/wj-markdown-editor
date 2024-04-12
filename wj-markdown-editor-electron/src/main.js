import {app, BrowserWindow, screen, Menu, Tray} from 'electron'
import path from "path"
import globalData from "./util/globalData.js"
import protocolUtil from './util/protocolUtil.js'
import './util/ipcMainUtil.js'
import winOnUtil from './util/winOnUtil.js'
import constant from './util/constant.js'
import common from './util/common.js'
import screenshotsUtil from "./util/screenshotsUtil.js";
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const lock = app.requestSingleInstanceLock({ fileInfo: globalData.fileStateList[globalData.fileStateList.length - 1] })

if(!lock){
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    if(additionalData.fileInfo && additionalData.fileInfo.originFilePath){
      const origin = globalData.fileStateList.find(item => item.originFilePath === additionalData.fileInfo.originFilePath && item.type === additionalData.fileInfo.type)
      if(origin){
        globalData.win.webContents.send('changeTab', origin.id)
      } else {
        globalData.fileStateList = [...globalData.fileStateList, additionalData.fileInfo]
        globalData.win.webContents.send('changeTab', additionalData.fileInfo.id)
      }
    }
    if (globalData.win && !globalData.win.isDestroyed()) {
      if (globalData.win.isMinimized()) {
        globalData.win.restore()
      }
      globalData.win.focus()
    }
  })

  const createTray = () => {
    const tray = new Tray(path.resolve(__dirname, '../icon/favicon.png'))
    const contextMenu = Menu.buildFromTemplate([
      { label: '退出', type: 'normal', click: () => { globalData.win?.close() } },
    ])
    tray.setContextMenu(contextMenu)
    tray.on('click', common.winShow)
    tray.on('double-click', common.winShow)
  }
  app.whenReady().then(() => {
    screenshotsUtil.init()
    common.initUpdater()
    protocolUtil.handleProtocol()
    const win = new BrowserWindow({
      frame: false,
      icon: path.resolve(__dirname, '../icon/favicon.ico'),
      title: globalData.initTitle,
      width: globalData.config.winWidth > 0 ? globalData.config.winWidth : screen.getPrimaryDisplay().workArea.width / 2,
      height: globalData.config.winHeight > 0 ? globalData.config.winHeight : screen.getPrimaryDisplay().workArea.height / 2,
      show: false,
      maximizable: true,
      resizable: true,
      webPreferences: {
        preload: path.resolve(__dirname, 'preload.js')
      }
    })
    if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
      win.webContents.openDevTools()
    }
    globalData.win = win
    winOnUtil.handle()
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })
    createTray()
    Menu.setApplicationMenu(null)
    const index = globalData.fileStateList.length - 1
    if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
      win.loadURL('http://localhost:8080/#/' + (globalData.fileStateList[index].originFilePath ? globalData.config.initRoute : constant.router.edit) + '?id=' + globalData.fileStateList[index].id).then(() => {})
    } else {
      win.loadFile(path.resolve(__dirname, '../web-dist/index.html'), { hash: globalData.fileStateList[index].originFilePath ? globalData.config.initRoute : constant.router.edit, search: 'id=' + globalData.fileStateList[index].id }).then(() => {})
    }
  })
}



