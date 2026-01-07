import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, shell } from 'electron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let aboutWin

export default {
  get: () => aboutWin,
  channel: {
    'open-about': () => {
      if (aboutWin) {
        aboutWin.show()
        return
      }
      aboutWin = new BrowserWindow({
        frame: false,
        icon: path.resolve(__dirname, '../../../icon/favicon.ico'),
        title: 'About',
        width: 600,
        height: 400,
        show: false,
        maximizable: false,
        resizable: false,
        webPreferences: {
          preload: path.resolve(__dirname, '../../preload.js'),
        },
      })
      aboutWin.on('closed', () => {
        aboutWin = null
      })
      // 通过默认浏览器打开链接
      aboutWin.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url).then(() => {})
        return { action: 'deny' }
      })
      aboutWin.once('ready-to-show', () => {
        aboutWin.show()
      })
      if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
        aboutWin.loadURL('http://localhost:8080/#/about').then(() => {
          aboutWin.webContents.openDevTools({ mode: 'undocked' })
        })
      } else {
        aboutWin.loadFile(path.resolve(__dirname, '../../../web-dist/index.html'), { hash: 'about' }).then(() => {})
      }
    },
    'about-minimize': () => {
      aboutWin.minimize()
    },
    'about-close': () => {
      aboutWin.hide()
    },
  },
}
