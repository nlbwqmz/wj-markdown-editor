import {app} from "electron"
import path from "path"
import { fileURLToPath } from 'url'
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
    getProjectPath: () => {
        return projectPath
    },
    getUserDataPath: () => {
        return userDataPath
    },
    getBaseName: filePath => {
        return path.basename(filePath)
    },
    relative: (from, to) => {
        return path.relative(from, to)
    },
    resolve: (...paths) => {
        return path.resolve(...paths)
    }
}
