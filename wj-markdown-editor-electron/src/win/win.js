import {fileURLToPath} from "url";
import path from "path";
import {BrowserWindow, screen} from "electron";
import winOnUtil from "../util/winOnUtil.js";
import constant from "../constant/constant.js";
import config from "../local/config.js";
import fileState from "../runtime/fileState.js";
import util from "../util/util.js";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let win
const execute = func => {
    if(win && !win.isDestroyed()){
        func && func()
    }
}

const obj = {
    get: () => win,
    open: (common, globalShortcutUtil, globalData) => {
        win = new BrowserWindow({
            frame: false,
            icon: path.resolve(__dirname, '../../icon/favicon.ico'),
            title: constant.title,
            width: config.data.winWidth > 0 ? config.data.winWidth : screen.getPrimaryDisplay().workArea.width / 2,
            height: config.data.winHeight > 0 ? config.data.winHeight : screen.getPrimaryDisplay().workArea.height / 2,
            show: false,
            maximizable: true,
            resizable: true,
            webPreferences: {
                preload: path.resolve(__dirname, '../preload.js')
            }
        })
        if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
            win.webContents.openDevTools()
        }
        winOnUtil.handle(win, common, globalShortcutUtil, globalData)
        const index = fileState.getLength() - 1
        if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
            win.loadURL('http://localhost:8080/#/' + (fileState.getByIndex(index).originFilePath ? config.data.initRoute : constant.router.edit) + '?id=' + fileState.getByIndex(index).id).then(() => {})
        } else {
            win.loadFile(path.resolve(__dirname, '../../web-dist/index.html'), { hash: fileState.getByIndex(index).originFilePath ? config.data.initRoute : constant.router.edit, search: 'id=' + fileState.getByIndex(index).id }).then(() => {})
        }
    },
    show: () => {
        execute(() => {
            if(win.isMinimized()){
                win.restore()
            } else if (win.isVisible() === false) {
                win.show()
            }
            if(win.isFocused() === false) {
                win.focus()
            }
        })
    },
    close: () => {
        execute(() => {
            win.close()
        })
    },
    changeTab: id => {
        execute(() => {
            win.webContents.send('changeTab', id)
        })
    },
    showMessage: (content, type, duration, destroyBefore) => {
        execute(() => {
            win.webContents.send('showMessage', content, type, duration, destroyBefore)
        })
    },
    shouldUpdateConfig: config => {
        execute(() => {
            win.webContents.send('shouldUpdateConfig', config)
        })
    },
    isFocused: () => {
        return win.isFocused()
    },
    hide: () => {
        execute(() => {
            win.hide()
        })
    },
    minimize: () => {
        execute(() => {
            win.minimize()
        })
    },
    instanceFuncName: funcName => {
        execute(() => {
            win[funcName]()
        })
    },
    findInPage: (searchContent, options) => {
        execute(() => {
            win.webContents.findInPage(searchContent, options)
        })
    },
    stopFindInPage: () => {
        execute(() => {
            win.webContents.stopFindInPage('clearSelection')
        })
    },
    closeMessage: () => {
        execute(() => {
            win.webContents.send('closeMessage')
        })
    },
    insertScreenshotResult: data => {
        execute(() => {
            win.webContents.send('insertScreenshotResult', data)
        })
    },
    openWebdavPath: webdavPath => {
        execute(() => {
            win.webContents.send('openWebdavPath', webdavPath)
        })
    },
    noticeToSave: data => {
        execute(() => {
            win.webContents.send('noticeToSave', data)
        })
    },
    hasNewVersion: () => {
        execute(() => {
            win.webContents.send('hasNewVersion')
        })
    },
    updateFileStateList: list => {
        execute(() => {
            win.webContents.send('updateFileStateList', list)
        })
    },
    loginState: webdavLoginState => {
        execute(() => {
            win.webContents.send('loginState', webdavLoginState)
        })
    },
    toggleView: () => {
        execute(() => {
            win.webContents.send('toggleView')
        })
    }
}

const init = () => {
    config.watch([], data => util.debounce(() => { obj.shouldUpdateConfig(data) }, 100)() )
}

init()
export default obj
