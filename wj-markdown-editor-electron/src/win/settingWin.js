import {fileURLToPath} from "url";
import path from "path";
import {BrowserWindow, dialog, shell} from "electron";
import constant from "../util/constant.js";
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let settingWin
const execute = func => {
    if (settingWin && !settingWin.isDestroyed()) {
        func && func()
    }
}
export default {
    open: () => {
        if (!settingWin || settingWin.isDestroyed()) {
            settingWin = new BrowserWindow({
                icon: path.resolve(__dirname, '../../icon/favicon.ico'),
                frame: false,
                width: 600,
                height: 500,
                show: false,
                maximizable: false,
                resizable: false,
                webPreferences: {
                    preload: path.resolve(__dirname, '../preload.js')
                }
            });
            settingWin.webContents.setWindowOpenHandler(details => {
                shell.openExternal(details.url).then(() => {})
                return {action: 'deny'}
            })
            settingWin.once('ready-to-show', () => {
                settingWin.show()
            })
            if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
                settingWin.loadURL('http://localhost:8080/#/' + constant.router.setting).then(() => {
                })
            } else {
                settingWin.loadFile(path.resolve(__dirname, '../../web-dist/index.html'), {hash: constant.router.setting}).then(() => {
                })
            }
        } else if (settingWin.isMinimized()) {
            settingWin.restore()
        } else if (!settingWin.isVisible()) {
            settingWin.center()
            settingWin.show()
        } else if (!settingWin.isFocused()) {
            settingWin.focus()
        }
    },
    minimize: () => {
      execute(() => {
          settingWin.minimize()
      })
    },
    hide: () => {
        execute(() => {
            settingWin.hide()
        })
    },
    dirSelect: () => {
        const dirList = dialog.showOpenDialogSync(settingWin, {
            title: '选择文件夹',
            buttonLabel: '确认',
            properties: ['openDirectory']
        })
        return dirList && dirList.length > 0 ? dirList[0] : undefined
    },
    shouldUpdateConfig: config => {
        execute(() => {
            settingWin.webContents.send('shouldUpdateConfig', config)
        })
    }

}
