import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, shell } from 'electron'

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
        webPreferences: {
          preload: path.resolve(__dirname, '../../preload.js'),
        },
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
          guideWin.webContents.openDevTools({ mode: 'undocked' })
        })
      } else {
        guideWin.loadFile(path.resolve(__dirname, '../../../web-dist/index.html'), { hash: 'guide' }).then(() => {})
      }
    },
    'guide-minimize': () => {
      guideWin.minimize()
    },
    'guide-close': () => {
      guideWin.hide()
    },
  },
}
