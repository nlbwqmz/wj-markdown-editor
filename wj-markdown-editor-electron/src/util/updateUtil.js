import axios from 'axios'
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import semver from 'semver'
import sendUtil from './channel/sendUtil.js'

const { autoUpdater, CancellationToken } = electronUpdater

let downloadUpdateToken
let aboutWinTemp

let newVersion

function broadcastVersionMessage(winAllList, has) {
  winAllList.forEach((winInfo) => {
    sendUtil.send(winInfo.win, { event: 'has-new-version', data: has })
  })
}

async function checkUpdate(winAllList) {
  if (!app.isPackaged) {
    return null
  }
  if (newVersion) {
    broadcastVersionMessage(winAllList, true)
    return { finish: true, success: true, version: newVersion }
  }
  return new Promise((resolve) => {
    axios.get('https://api.github.com/repos/nlbwqmz/wj-markdown-editor/releases/latest').then((res) => {
      const versionLatest = res.data.tag_name
      autoUpdater.setFeedURL(`https://github.com/nlbwqmz/wj-markdown-editor/releases/download/${versionLatest}`)
      autoUpdater.checkForUpdates().then((res) => {
        if (res && res.updateInfo && res.updateInfo.version && semver.gt(res.updateInfo.version, app.getVersion())) {
          console.info(`New version ${res.updateInfo.version}`)
          newVersion = res.updateInfo.version
          broadcastVersionMessage(winAllList, true)
          resolve({ finish: true, success: true, version: res.updateInfo.version })
        } else {
          broadcastVersionMessage(winAllList, false)
          resolve({ finish: true, success: true, version: app.getVersion() })
        }
      }).catch((e) => {
        console.error('Check update error', e)
        broadcastVersionMessage(winAllList, false)
        resolve({ finish: true, success: false, message: '处理失败，请检查网络。' })
      })
    }).catch((e) => {
      console.error('Check latest error', e)
      broadcastVersionMessage(winAllList, false)
      resolve({ finish: true, success: false, message: '处理失败，请检查网络。' })
    })
  })
}

function initUpdater() {
  if (app.isPackaged) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('checking-for-update', () => {})
    autoUpdater.on('download-progress', (progressInfo) => {
      console.info('progressInfo', progressInfo)
      if (aboutWinTemp) {
        sendUtil.send(aboutWinTemp, { event: 'download-update-progress', data: { percent: progressInfo.percent, bytesPerSecond: progressInfo.bytesPerSecond } })
      }
    })
    autoUpdater.on('error', () => {
      if (aboutWinTemp) {
        sendUtil.send(aboutWinTemp, { event: 'update-error', data: { finish: true, success: false, message: '处理失败，请检查网络。' } })
      }
    })
  }
}

function downloadUpdate(aboutWin) {
  aboutWinTemp = aboutWin
  const cancellationToken = new CancellationToken()
  autoUpdater.downloadUpdate(cancellationToken).then(() => {
    console.info('Download done')
    sendUtil.send(aboutWin, { event: 'download-update-finish' })
  })
  downloadUpdateToken = cancellationToken
}

function cancelDownloadUpdate() {
  if (downloadUpdateToken) {
    downloadUpdateToken.cancel()
    downloadUpdateToken = null
  }
}

function executeUpdate() {
  autoUpdater.quitAndInstall(true, true)
}

export default {
  initUpdater,
  checkUpdate,
  downloadUpdate,
  cancelDownloadUpdate,
  executeUpdate,
}
