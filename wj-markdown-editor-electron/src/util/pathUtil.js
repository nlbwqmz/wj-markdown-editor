import {app} from "electron"
import path from "path"
import fsUtil from "./fsUtil.js";

// import { fileURLToPath } from 'url'
// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)
// const toolPath = app.isPackaged ? path.resolve(path.dirname(app.getPath('exe')), 'resources/app.asar.unpacked/tool') : path.resolve(__dirname, '../../tool');
// const projectPath = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
const documentsPath = app.isPackaged ? path.resolve(app.getPath('documents'), 'wj-markdown-editor') : app.getAppPath();
fsUtil.mkdirSyncWithRecursion(documentsPath)
export default {
    getDefaultImgSavePath: () => {
        return path.resolve(documentsPath, 'img')
    },
    getTempPath: () => {
        const tempPath = path.resolve(app.getPath('temp'), 'wj-markdown-editor')
        fsUtil.mkdirSyncWithRecursion(tempPath)
        return tempPath
    },
    getLoginInfoPath: () => {
        return path.resolve(documentsPath, 'login_info')
    },
    getLastOpenedFilePath: () => {
        return path.resolve(documentsPath, 'last_opened.json')
    },
    getDbPath: () => {
        return path.resolve(documentsPath, 'wj-markdown-editor.db')
    }
}
