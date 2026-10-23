import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, shell } from 'electron'
import configUtil from '../../data/configUtil.js'
import { WINDOW_ICON_PATH } from '../appIconUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let settingWin

export default {
  get: () => settingWin,
  close: () => {
    if (settingWin) {
      settingWin.close()
    }
  },
  channel: {
    'open-setting': () => {
      if (settingWin) {
        settingWin.show()
        return
      }
      const globalTheme = configUtil.getConfig()?.theme?.global === 'dark' ? 'dark' : 'light'
      settingWin = new BrowserWindow({
        frame: false,
        icon: WINDOW_ICON_PATH,
        title: '设置',
        width: 900,
        height: 800,
        show: false,
        maximizable: false,
        resizable: false,
        backgroundColor: globalTheme === 'dark' ? '#282c34' : '#ffffff',
        webPreferences: {
          preload: path.resolve(__dirname, '../../preload.js'),
          additionalArguments: [`--wj-initial-theme=${globalTheme}`],
        },
      })
      settingWin.once('closed', () => {
        settingWin = null
      })
      // 通过默认浏览器打开链接
      settingWin.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url).then(() => {})
        return { action: 'deny' }
      })
      settingWin.once('ready-to-show', () => {
        settingWin.show()
      })
      if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
        settingWin.loadURL('http://localhost:8080/#/setting').then(() => {
          settingWin.webContents.openDevTools({ mode: 'undocked' })
        })
      } else {
        settingWin.loadFile(path.resolve(__dirname, '../../../web-dist/index.html'), { hash: 'setting' }).then(() => {})
      }
    },
    'setting-minimize': () => {
      settingWin.minimize()
    },
    'setting-close': () => {
      // 先释放前台激活状态，避免隐藏后系统焦点残留在隐藏窗口上（electron#52124）
      settingWin.blur()
      settingWin.hide()
    },
  },
}
