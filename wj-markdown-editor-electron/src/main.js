const {app, BrowserWindow, screen, Menu} = require('electron')
const path = require("path");
const globalData = require("./util/globalData")
const protocolUtil = require('./util/protocolUtil')
require('./util/ipcMainUtil')
const winOnUtil = require('./util/winOnUtil');
const constant = require('./util/constant')
const common = require('./util/common')
const fs = require("fs");

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
    win.loadURL('http://localhost:8080/#/' + (globalData.content ? globalData.config.initRoute : constant.router.edit)).then(() => {})
  } else {
    win.loadFile(path.resolve(__dirname, '../web-dist/index.html'), { hash: globalData.content ? globalData.config.initRoute : constant.router.edit }).then(() => {})
  }
  fs.writeFileSync('C:\\Users\\cqing\\Desktop\\ttt.txt', `环境：${process.env.PORTABLE_EXECUTABLE_FILE}`)
})


