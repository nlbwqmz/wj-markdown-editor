import { app } from 'electron'
import semver from 'semver'
import sendUtil from './channel/sendUtil.js'

let autoUpdater
let CancellationToken
let schedule

/**
 * 懒加载更新相关依赖。
 * electron-updater / node-schedule 仅在打包环境参与更新检查，
 * 且最早在窗口创建之后才使用，因此移出启动路径。
 */
async function ensureUpdaterDeps() {
  if (autoUpdater) {
    return
  }
  const [electronUpdater, scheduleModule] = await Promise.all([
    import('electron-updater'),
    import('node-schedule'),
  ])
  autoUpdater = electronUpdater.default.autoUpdater
  CancellationToken = electronUpdater.default.CancellationToken
  schedule = scheduleModule.default
}

let downloadUpdateToken
let aboutWinTemp

let newVersion

function broadcastVersionMessage(windowList, has) {
  windowList.forEach((win) => {
    sendUtil.send(win, { event: 'has-new-version', data: has })
  })
}

async function checkUpdate(windowList) {
  if (!app.isPackaged) {
    return null
  }
  await ensureUpdaterDeps()
  if (newVersion) {
    broadcastVersionMessage(windowList, true)
    return { finish: true, success: true, version: newVersion }
  }
  const { default: axios } = await import('axios')
  return new Promise((resolve) => {
    axios.get('https://api.github.com/repos/nlbwqmz/wj-markdown-editor/releases/latest', { headers: { 'User-Agent': 'wj-markdown-editor' } }).then((res) => {
      const versionLatest = res.data.tag_name
      autoUpdater.setFeedURL(`https://github.com/nlbwqmz/wj-markdown-editor/releases/download/${versionLatest}`)
      autoUpdater.checkForUpdates().then((res) => {
        if (res && res.updateInfo && res.updateInfo.version && semver.gt(res.updateInfo.version, app.getVersion())) {
          console.info(`New version ${res.updateInfo.version}`)
          newVersion = res.updateInfo.version
          broadcastVersionMessage(windowList, true)
          resolve({ finish: true, success: true, version: res.updateInfo.version })
        } else {
          broadcastVersionMessage(windowList, false)
          resolve({ finish: true, success: true, version: app.getVersion() })
        }
      }).catch((e) => {
        console.error('Check update error', e)
        broadcastVersionMessage(windowList, false)
        resolve({ finish: true, success: false })
      })
    }).catch((e) => {
      console.error('Check latest error', e.message)
      broadcastVersionMessage(windowList, false)
      resolve({ finish: true, success: false })
    })
  })
}

async function initUpdater(getWindowList) {
  if (app.isPackaged) {
    await ensureUpdaterDeps()
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('checking-for-update', () => {})
    autoUpdater.on('download-progress', (progressInfo) => {
      if (aboutWinTemp) {
        sendUtil.send(aboutWinTemp, { event: 'download-update-progress', data: { percent: progressInfo.percent, bytesPerSecond: progressInfo.bytesPerSecond } })
      }
    })
    autoUpdater.on('error', () => {
      if (aboutWinTemp) {
        sendUtil.send(aboutWinTemp, { event: 'update-error', data: { finish: true, success: false, message: '处理失败，请检查网络。' } })
      }
    })
    schedule.scheduleJob('0 0,10,20,30,40,50 * * * *', async () => {
      await checkUpdate(getWindowList())
    })
  }
}

async function downloadUpdate(aboutWin) {
  aboutWinTemp = aboutWin
  await ensureUpdaterDeps()
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

async function executeUpdate() {
  await ensureUpdaterDeps()
  autoUpdater.quitAndInstall(true, true)
}

export default {
  initUpdater,
  checkUpdate,
  downloadUpdate,
  cancelDownloadUpdate,
  executeUpdate,
}
