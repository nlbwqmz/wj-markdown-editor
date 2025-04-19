import { app, Menu } from 'electron'
import configUtil from './data/configUtil.js'
import sendUtil from './util/channel/sendUtil.js'
import logUtil from './util/logUtil.js'
import protocolUtil from './util/protocolUtil.js'
import updateUtil from './util/updateUtil.js'
import screenshotsUtil from './util/win/screenshotsUtil.js'
import winInfoUtil from './util/win/winInfoUtil.js'
import './util/channel/ipcMainUtil.js'

app.commandLine.appendSwitch('--disable-http-cache')

/**
 * 是否通过文件打开
 */
function isOpenOnFile() {
  return Boolean(process.argv && process.argv.length > 0 && /.*\.md$/.test(process.argv[process.argv.length - 1]))
}

/**
 * 如果通过打开 获取文件路径
 */
function getOpenOnFilePath() {
  return isOpenOnFile() ? process.argv[process.argv.length - 1] : null
}

const lock = app.requestSingleInstanceLock({ filePath: getOpenOnFilePath() })

if (!lock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    winInfoUtil.createNew(additionalData.filePath).then(() => {})
  })
  logUtil.init()
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    await configUtil.initConfig((config) => {
      winInfoUtil.getAll().forEach((item) => {
        sendUtil.send(item.win, { event: 'update-config', data: config })
      })
    })
    protocolUtil.handleProtocol()
    await winInfoUtil.createNew(getOpenOnFilePath())
    screenshotsUtil.init()
    updateUtil.initUpdater()
  })
}
