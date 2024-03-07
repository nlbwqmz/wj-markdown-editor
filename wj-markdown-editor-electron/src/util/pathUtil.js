const {app} = require("electron");
const path = require("path");
const toolPath = app.isPackaged ? path.resolve(path.dirname(app.getPath('exe')), 'resources/app.asar.unpacked/tool') : path.resolve(__dirname, '../../tool');
const projectPath = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
const userDataPath = app.isPackaged ? app.getPath('userData') : app.getAppPath();

module.exports = {
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
    }
}
