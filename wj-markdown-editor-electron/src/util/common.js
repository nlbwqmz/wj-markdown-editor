import globalData from "./globalData.js"
import {dialog, app, BrowserWindow, shell} from "electron"
import fs from "fs"
import path from "path"
import fsUtil from "./fsUtil.js"
import electronUpdater from 'electron-updater';
import axios from "axios"
const {autoUpdater, CancellationToken} = electronUpdater;
import {fileURLToPath} from 'url'
import pathUtil from "./pathUtil.js";
import webdavUtil from "./webdavUtil.js";
import idUtil from "./idUtil.js";
import aboutWin from "../win/aboutWin.js";
import win from "../win/win.js";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const exit = () => {
    fsUtil.deleteFolder(pathUtil.getTempPath())
    app.exit()
}
const getNewFileData = () => {
    return {
        id: idUtil.createId(),
        saved: true,
        content: '',
        tempContent: '',
        originFilePath: '',
        fileName: 'untitled',
        type: ''
    }
}
const compareVersion = function (version1, version2) {
    const v1 = version1.split('.');
    const v2 = version2.split('.');
    for (let i = 0; i < v1.length || i < v2.length; ++i) {
        let x = 0, y = 0;
        if (i < v1.length) {
            x = parseInt(v1[i]);
        }
        if (i < v2.length) {
            y = parseInt(v2[i]);
        }
        if (x > y) {
            return 1;
        }
        if (x < y) {
            return -1;
        }
    }
    return 0;
};
const closeAndChangeTab = id => {
    const list = globalData.fileStateList.filter(item => item.id !== id)
    if (list.length === 0) {
        globalData.fileStateList = [getNewFileData()]
    } else {
        globalData.fileStateList = list
    }
    if (id === globalData.activeFileId) {
        const fileState = globalData.fileStateList[0]
        win.changeTab(fileState.id)
    }
}
export default {
    saveToOther: id => {
        const fileState = globalData.fileStateList.find(item => item.id === id)
        if(fileState.exists === false){
            win.showMessage('未找到当前文件', 'warning')
            return;
        }
        const currentPath = dialog.showSaveDialogSync({
            title: "另存为",
            buttonLabel: "保存",
            filters: [
                {name: 'markdown文件', extensions: ['md']},
            ]
        })
        if (currentPath) {
            fs.writeFile(currentPath, fileState.tempContent, () => {
                win.showMessage('另存成功', 'success')
            })
        }
    },
    exit,
    winShow: () => {
        win.show()
    },
    shouldUpdateConfig: () => {
        win.shouldUpdateConfig(globalData.config)
    },
    getImgParentPath: (fileState, insertImgType) => {
        const originFilePath = fileState.originFilePath
        let savePath
        if (insertImgType === '2') {
            savePath = path.join(path.dirname(originFilePath), path.parse(originFilePath).name)
        } else if (insertImgType === '3') {
            savePath = path.join(path.dirname(originFilePath), 'assets')
        } else {
            savePath = globalData.config.imgSavePath
        }
        if (fileState.type === 'local' || (insertImgType !== '2' && insertImgType !== '3')) {
            fsUtil.mkdirSyncWithRecursion(savePath)
        }
        return savePath
    },
    getImgInsertType: (file) => {
        if (file.url) { // 通过URL 插入网络图片
            return globalData.config.insertNetworkImgType
        } else if (file.path && file.isSelect) { // 通过文件选择 插入本地图片
            return globalData.config.insertLocalImgType
        } else if (file.path && !file.isSelect) { // 通过粘贴板 插入本地图片
            return globalData.config.insertPasteboardLocalImgType
        } else if (file.base64 && file.isScreenshot) { // 通过屏幕截图 插入图片
            return globalData.config.insertScreenshotImgType
        } else if (file.base64 && !file.isScreenshot) { // 通过粘贴板 插入网络图片
            return globalData.config.insertPasteboardNetworkImgType
        }
    },
    checkUpdate: () => {
        if (app.isPackaged) {
            axios.get('https://api.github.com/repos/nlbwqmz/wj-markdown-editor/releases/latest').then((res) => {
                const versionLatest = res.data.tag_name
                autoUpdater.setFeedURL(`https://github.com/nlbwqmz/wj-markdown-editor/releases/download/${versionLatest}`)
                autoUpdater.checkForUpdates().then(res => {
                    if(res && res.updateInfo && res.updateInfo.version && compareVersion(res.updateInfo.version, app.getVersion()) === 1){
                        aboutWin.sendMessageToAbout('messageToAbout', {finish: true, success: true, version: res.updateInfo.version})
                    } else {
                        aboutWin.sendMessageToAbout('messageToAbout', {finish: true, success: true, version: app.getVersion()})
                    }
                }).catch(() => {
                    aboutWin.sendMessageToAbout('messageToAbout', {finish: true, success: false, message: '处理失败，请检查网络。'})
                })
            }).catch(() => {
                aboutWin.sendMessageToAbout('messageToAbout', {finish: true, success: false, message: '处理失败，请检查网络。'})
            })
        }
    },
    initUpdater: () => {
        if (app.isPackaged) {
            autoUpdater.autoDownload = false
            autoUpdater.autoInstallOnAppQuit = false
            autoUpdater.on('checking-for-update', () => {})
            autoUpdater.on('download-progress', progressInfo => {
                aboutWin.sendMessageToAbout('updaterDownloadProgress', {
                    percent: progressInfo.percent,
                    bytesPerSecond: progressInfo.bytesPerSecond
                })
            })
            autoUpdater.on('error', (error) => {
                aboutWin.sendMessageToAbout('messageToAbout', {finish: true, success: false, message: '处理失败，请检查网络。'})
            })
        }
    },
    executeDownload: () => {
        const cancellationToken = new CancellationToken()
        autoUpdater.downloadUpdate(cancellationToken).then(filePathList => {
            aboutWin.sendMessageToAbout('downloadFinish')
        })
        globalData.downloadUpdateToken = cancellationToken
    },
    cancelDownload: () => {
        if (globalData.downloadUpdateToken) {
            globalData.downloadUpdateToken.cancel()
            globalData.downloadUpdateToken = undefined
        }
    },
    executeUpdate: () => {
        autoUpdater.quitAndInstall(true, true)
    },
    getNewFileData,
    newFile: () => {
        const create = getNewFileData()
        globalData.fileStateList = [...globalData.fileStateList, create]
        win.changeTab(create.id)
    },
    saveFile: data => {
        // type, currentWebdavPath
        const fileStateList = globalData.fileStateList
        const fileState = globalData.fileStateList.find(item => item.id === data.id)
        if(fileState.exists === false){
            win.showMessage('未找到当前文件', 'warning')
            return;
        }
        if (fileState.type === 'webdav' && globalData.webdavLoginState === false) {
            win.showMessage('请先登录webdav', 'error')
            return
        }
        if (fileState.type) {
            if (fileState.type === 'local') {
                let currentPath
                if (fileState.originFilePath) {
                    currentPath = fileState.originFilePath
                } else {
                    currentPath = dialog.showSaveDialogSync({
                        title: "保存",
                        buttonLabel: "保存",
                        filters: [
                            {name: 'markdown文件', extensions: ['md']},
                        ]
                    })
                }
                if (currentPath) {
                    fs.writeFile(currentPath, fileState.tempContent, () => {
                        if (data.close !== true) {
                            fileState.content = fileState.tempContent
                            fileState.saved = true
                            fileState.originFilePath = currentPath
                            fileState.fileName = path.basename(currentPath)
                            globalData.fileStateList = fileStateList
                        } else {
                            closeAndChangeTab(data.id)
                        }
                        win.showMessage('保存成功', 'success')
                    })
                }
            } else if (fileState.type === 'webdav') {
                webdavUtil.putFileContents(fileState.originFilePath, fileState.tempContent).then(res => {
                    if (res === true) {
                        if (data.close !== true) {
                            fileState.content = fileState.tempContent
                            fileState.saved = true
                            globalData.fileStateList = fileStateList
                        } else {
                            closeAndChangeTab(data.id)
                        }
                        win.showMessage('保存成功', 'success')
                    } else {
                        win.showMessage('保存失败', 'error')
                    }
                })
            }
        } else if (globalData.webdavLoginState === false || data.type === 'local') {
            let currentPath
            if (fileState.originFilePath) {
                currentPath = fileState.originFilePath
            } else {
                currentPath = dialog.showSaveDialogSync({
                    title: "保存",
                    buttonLabel: "保存",
                    filters: [
                        {name: 'markdown文件', extensions: ['md']},
                    ]
                })
            }
            if (currentPath) {
                fs.writeFile(currentPath, fileState.tempContent, () => {
                    if (data.close !== true) {
                        fileState.content = fileState.tempContent
                        fileState.saved = true
                        fileState.originFilePath = currentPath
                        fileState.fileName = path.basename(currentPath)
                        fileState.type = 'local'
                        globalData.fileStateList = fileStateList
                    } else {
                        closeAndChangeTab(data.id)
                    }
                    win.showMessage('保存成功', 'success')
                })
            }
        } else if (data.type === 'webdav') {
            webdavUtil.putFileContents(data.currentWebdavPath, fileState.tempContent).then(res => {
                if (res === true) {
                    if (data.close !== true) {
                        fileState.content = fileState.tempContent
                        fileState.saved = true
                        fileState.fileName = path.basename(data.currentWebdavPath)
                        fileState.type = 'webdav'
                        fileState.originFilePath = data.currentWebdavPath
                        globalData.fileStateList = fileStateList
                    } else {
                        closeAndChangeTab(data.id)
                    }
                    win.showMessage('保存成功', 'success')
                    win.openWebdavPath(data.currentWebdavPath)
                } else {
                    win.showMessage('保存失败', 'error')
                }
            })
        } else {
            win.noticeToSave(data)
        }
    },
    closeAndChangeTab,
    autoCheckAppUpdate: () => {
        if (app.isPackaged) {
            axios.get('https://api.github.com/repos/nlbwqmz/wj-markdown-editor/releases/latest').then((res) => {
                const versionLatest = res.data.tag_name
                autoUpdater.setFeedURL(`https://github.com/nlbwqmz/wj-markdown-editor/releases/download/${versionLatest}`)
                autoUpdater.checkForUpdates().then(res => {
                    if(res && res.updateInfo && res.updateInfo.version && compareVersion(res.updateInfo.version, app.getVersion()) === 1){
                        win.hasNewVersion()
                    }
                }).catch(() => {})
            }).catch(() => {})
        }
    }
}
