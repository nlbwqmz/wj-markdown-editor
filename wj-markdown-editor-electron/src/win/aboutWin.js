import {fileURLToPath} from "url";
import path from "path";
import {app, BrowserWindow, shell} from "electron";
import constant from "../constant/constant.js";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let aboutWin
const execute = func => {
    if (aboutWin && !aboutWin.isDestroyed()) {
        func && func()
    }
}
export default {
    open: parent => {
        if (!aboutWin || aboutWin.isDestroyed()) {
            aboutWin = new BrowserWindow({
                frame: false,
                width: 500,
                height: 272,
                show: false,
                parent: parent,
                maximizable: false,
                resizable: false,
                webPreferences: {
                    preload: path.resolve(__dirname, '../preload.js')
                }
            });
            aboutWin.webContents.setWindowOpenHandler(details => {
                shell.openExternal(details.url).then(() => {})
                return {action: 'deny'}
            })
            aboutWin.once('ready-to-show', () => {
                aboutWin.show()
            })
            if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
                aboutWin.loadURL('http://localhost:8080/#/' + constant.router.about + '?version=' + app.getVersion() + '&name=' + app.getName()).then(() => {
                })
            } else {
                aboutWin.loadFile(path.resolve(__dirname, '../../web-dist/index.html'), {
                    hash: constant.router.about,
                    search: 'version=' + app.getVersion() + '&name=' + app.getName()
                }).then(() => {
                })
            }
        } else {
            aboutWin.center()
            aboutWin.show()
        }
    },
    hide: () => {
        execute(() => {
            aboutWin.hide()
        })
    },
    sendMessageToAbout: (channel, args) => {
        execute(() => {
            aboutWin.webContents.send(channel, args)
        })
    }
}
