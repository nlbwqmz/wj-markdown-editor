import globalData from "./globalData.js"
import {dialog, app } from "electron"
import fs from "fs"
import path from "path"
import fsUtil from "./fsUtil.js"
import electronUpdater from 'electron-updater';
import axios from "axios"
const {autoUpdater, CancellationToken} = electronUpdater;
import pathUtil from "./pathUtil.js";
import webdavUtil from "./webdavUtil.js";
import aboutWin from "../win/aboutWin.js";
import win from "../win/win.js";
import config from "../local/config.js";
import fileState from "../runtime/fileState.js";
import util from "./util.js";

const exit = () => {
    fsUtil.deleteFolder(pathUtil.getTempPath())
    app.exit()
}

const closeAndChangeTab = id => {
    const list = fileState.get(item => item.id !== id)
    if (list.length === 0) {
        fileState.clearAndPushNew()
    } else {
        fileState.set(list)
    }
    if (id === globalData.activeFileId) {
        const fileStateItem = fileState.getByIndex(0)
        win.changeTab(fileStateItem.id)
    }
}
export default {
    saveToOther: id => {
        const fileStateItem = fileState.getById(id)
        if(fileStateItem.exists === false){
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
            fs.writeFile(currentPath, fileStateItem.tempContent, () => {
                win.showMessage('另存成功', 'success')
            })
        }
    },
    exit,
    winShow: () => {
        win.show()
    },
    getImgParentPath: (fileStateItem, insertImgType) => {
        const originFilePath = fileStateItem.originFilePath
        let savePath
        if (insertImgType === '2') {
            savePath = path.join(path.dirname(originFilePath), path.parse(originFilePath).name)
        } else if (insertImgType === '3') {
            savePath = path.join(path.dirname(originFilePath), 'assets')
        } else {
            savePath = config.imgSavePath
        }
        if (fileStateItem.type === 'local' || (insertImgType !== '2' && insertImgType !== '3')) {
            fsUtil.mkdirSyncWithRecursion(savePath)
        }
        return savePath
    },
    getImgInsertType: (file) => {
        if (file.url) { // 通过URL 插入网络图片
            return config.insertNetworkImgType
        } else if (file.path && file.isSelect) { // 通过文件选择 插入本地图片
            return config.insertLocalImgType
        } else if (file.path && !file.isSelect) { // 通过粘贴板 插入本地图片
            return config.insertPasteboardLocalImgType
        } else if (file.base64 && file.isScreenshot) { // 通过屏幕截图 插入图片
            return config.insertScreenshotImgType
        } else if (file.base64 && !file.isScreenshot) { // 通过粘贴板 插入网络图片
            return config.insertPasteboardNetworkImgType
        }
    },
    checkUpdate: () => {
        if (app.isPackaged) {
            axios.get('https://api.github.com/repos/nlbwqmz/wj-markdown-editor/releases/latest').then((res) => {
                const versionLatest = res.data.tag_name
                autoUpdater.setFeedURL(`https://github.com/nlbwqmz/wj-markdown-editor/releases/download/${versionLatest}`)
                autoUpdater.checkForUpdates().then(res => {
                    if(res && res.updateInfo && res.updateInfo.version && util.compareVersion(res.updateInfo.version, app.getVersion()) === 1){
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
    newFile: () => {
        const create = fileState.pushNew()
        win.changeTab(create.id)
    },
    saveFile: data => {
        const fileStateItem = fileState.getById(data.id)
        if(fileStateItem.exists === false){
            win.showMessage('未找到当前文件', 'warning')
            return;
        }
        if (fileStateItem.type === 'webdav' && globalData.webdavLoginState === false) {
            win.showMessage('请先登录webdav', 'error')
            return
        }
        if (fileStateItem.type) {
            if (fileStateItem.type === 'local') {
                let currentPath
                if (fileStateItem.originFilePath) {
                    currentPath = fileStateItem.originFilePath
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
                    fs.writeFile(currentPath, fileStateItem.tempContent, () => {
                        if (data.close !== true) {
                            fileStateItem.content = fileStateItem.tempContent
                            fileStateItem.saved = true
                            fileStateItem.originFilePath = currentPath
                            fileStateItem.fileName = path.basename(currentPath)
                        } else {
                            closeAndChangeTab(data.id)
                        }
                        win.showMessage('保存成功', 'success')
                    })
                }
            } else if (fileStateItem.type === 'webdav') {
                webdavUtil.putFileContents(fileStateItem.originFilePath, fileStateItem.tempContent).then(res => {
                    if (res === true) {
                        if (data.close !== true) {
                            fileStateItem.content = fileStateItem.tempContent
                            fileStateItem.saved = true
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
            if (fileStateItem.originFilePath) {
                currentPath = fileStateItem.originFilePath
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
                fs.writeFile(currentPath, fileStateItem.tempContent, () => {
                    if (data.close !== true) {
                        fileStateItem.content = fileStateItem.tempContent
                        fileStateItem.saved = true
                        fileStateItem.originFilePath = currentPath
                        fileStateItem.fileName = path.basename(currentPath)
                        fileStateItem.type = 'local'
                    } else {
                        closeAndChangeTab(data.id)
                    }
                    win.showMessage('保存成功', 'success')
                })
            }
        } else if (data.type === 'webdav') {
            webdavUtil.putFileContents(data.currentWebdavPath, fileStateItem.tempContent).then(res => {
                if (res === true) {
                    if (data.close !== true) {
                        fileStateItem.content = fileStateItem.tempContent
                        fileStateItem.saved = true
                        fileStateItem.fileName = path.basename(data.currentWebdavPath)
                        fileStateItem.type = 'webdav'
                        fileStateItem.originFilePath = data.currentWebdavPath
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
                    if(res && res.updateInfo && res.updateInfo.version && util.compareVersion(res.updateInfo.version, app.getVersion()) === 1){
                        win.hasNewVersion()
                    }
                }).catch(() => {})
            }).catch(() => {})
        }
    }
}
