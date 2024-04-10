import {app} from "electron"
import path from "path"
import { fileURLToPath } from 'url'
import fsUtil from "./fsUtil.js";
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const toolPath = app.isPackaged ? path.resolve(path.dirname(app.getPath('exe')), 'resources/app.asar.unpacked/tool') : path.resolve(__dirname, '../../tool');
const projectPath = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
const userDataPath = app.isPackaged ? app.getPath('userData') : app.getAppPath();

export default {
    getDefaultImgSavePath: () => {
        return path.resolve(userDataPath, 'img')
    },
    getSnapShotExePath: () => {
        return path.resolve(toolPath, 'SnapShot.exe')
    },
    getTempPath: () => {
        const tempPath = path.resolve(app.getPath('temp'), 'wj-markdown-editor')
        fsUtil.mkdirSyncWithRecursion(tempPath)
        return tempPath
    },
    getUserDataPath: () => {
        return userDataPath
    },
    getConfigPath: () => {
        return path.resolve(userDataPath, 'config.json')
    },
    getLoginInfoPath: () => {
        return path.resolve(userDataPath, 'login_info')
    },
    getLastOpenedFilePath: () => {
        return path.resolve(userDataPath, 'last_opened.json')
    },
}
