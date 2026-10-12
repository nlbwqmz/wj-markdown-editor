import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, shell } from 'electron'
import configUtil from '../../data/configUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let guideWin

export default {
  get: () => guideWin,
  channel: {
    'open-guide': () => {
      if (guideWin) {
        guideWin.show()
        return
      }
      const globalTheme = configUtil.getConfig()?.theme?.global === 'dark' ? 'dark' : 'light'
      guideWin = new BrowserWindow({
        frame: false,
        icon: path.resolve(__dirname, '../../../icon/favicon.ico'),
        title: '示例',
        width: 1200,
        height: 800,
        minWidth: 480,
        minHeight: 480,
        show: false,
        maximizable: false,
        resizable: true,
        backgroundColor: globalTheme === 'dark' ? '#282c34' : '#ffffff',
        webPreferences: {
          preload: path.resolve(__dirname, '../../preload.js'),
          additionalArguments: [`--wj-initial-theme=${globalTheme}`],
        },
      })
      guideWin.on('closed', () => {
        guideWin = null
      })
      // 通过默认浏览器打开链接
      guideWin.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url).then(() => {})
        return { action: 'deny' }
      })
      guideWin.once('ready-to-show', () => {
        guideWin.show()
      })
      if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
        guideWin.loadURL('http://localhost:8080/#/guide').then(() => {
          // guideWin.webContents.openDevTools({ mode: 'undocked' })
        })
      } else {
        guideWin.loadFile(path.resolve(__dirname, '../../../web-dist/index.html'), { hash: 'guide' }).then(() => {})
      }
    },
    'guide-minimize': () => {
      guideWin.minimize()
    },
    'guide-close': () => {
      // 先释放前台激活状态，避免隐藏后系统焦点残留在隐藏窗口上（electron#52124）
      guideWin.blur()
      guideWin.hide()
    },
  },
}
