const {app, BrowserWindow, screen, Menu} = require('electron')
const path = require("path");
const globalData = require("./util/globalData")
const protocolUtil = require('./util/protocolUtil')
require('./util/ipcMainUtil')
const winOnUtil = require('./util/winOnUtil');
const constant = require('./util/constant')
const common = require('./util/common')
const lock = app.requestSingleInstanceLock({ fileInfo: globalData.fileStateList[0] })
if(!lock){
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    if(additionalData.fileInfo && additionalData.fileInfo.originFilePath){
      const origin = globalData.fileStateList.find(item => item.originFilePath === additionalData.fileInfo.originFilePath)
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
  app.whenReady().then(() => {
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
    win.webContents.openDevTools()
    globalData.win = win
    win.webContents.on('found-in-page', (event, result) => {
      globalData.searchBar.webContents.send('findInPageResult', result)
    })
    winOnUtil.handle()
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })
    Menu.setApplicationMenu(null)
    if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
      win.loadURL('http://localhost:8080/#/' + (globalData.fileStateList[0].originFilePath ? globalData.config.initRoute : constant.router.edit) + '?id=' + globalData.fileStateList[0].id).then(() => {})
    } else {
      win.loadFile(path.resolve(__dirname, '../web-dist/index.html'), { hash: globalData.fileStateList[0].originFilePath ? globalData.config.initRoute : constant.router.edit, search: 'id=' + globalData.fileStateList[0].id }).then(() => {})
    }
  })
}



