import {app, Menu, Tray} from 'electron'
import path from "path"
import globalData from "./util/globalData.js"
import protocolUtil from './util/protocolUtil.js'
import './util/ipcMainUtil.js'
import common from './util/common.js'
import screenshotsUtil from "./util/screenshotsUtil.js";
import { fileURLToPath } from 'url'
import win from "./win/win.js";
import searchBarWin from "./win/searchBarWin.js";
import globalShortcutUtil from "./util/globalShortcutUtil.js";
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
        win.changeTab(origin.id)
      } else {
        globalData.fileStateList = [...globalData.fileStateList, additionalData.fileInfo]
        win.changeTab(additionalData.fileInfo.id)
      }
    }
    common.winShow()
  })

  const createTray = () => {
    const tray = new Tray(path.resolve(__dirname, '../icon/256x256.png'))
    const contextMenu = Menu.buildFromTemplate([
      { label: '打开', type: 'normal', click: win.show },
      { label: '退出', type: 'normal', click: win.close }
    ])
    tray.setContextMenu(contextMenu)
    tray.on('click', win.show)
    tray.on('double-click', win.show)
  }

  app.whenReady().then(() => {
    screenshotsUtil.init()
    common.initUpdater()
    protocolUtil.handleProtocol()
    createTray()
    Menu.setApplicationMenu(null)
    win.open(searchBarWin, common, globalShortcutUtil, globalData)
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })
  })
}



