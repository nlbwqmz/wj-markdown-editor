import globalData from "./globalData.js"
import {dialog, app, BrowserWindow, shell} from "electron"
import fs from "fs"
import path from "path"
import constant from './constant.js'
import fsUtil from "./fsUtil.js"
import electronUpdater from 'electron-updater';
import axios from "axios"
const {autoUpdater, CancellationToken} = electronUpdater;
import {fileURLToPath} from 'url'
import pathUtil from "./pathUtil.js";
import webdavUtil from "./webdavUtil.js";
import idUtil from "./idUtil.js";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const exit = () => {
    fsUtil.deleteFolder(pathUtil.getTempPath())
    app.exit()
}
const sendMessageToAbout = (channel, args) => {
    if (globalData.aboutWin && !globalData.aboutWin.isDestroyed()) {
        globalData.aboutWin.webContents.send(channel, args)
    }
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
        globalData.win.webContents.send('changeTab', fileState.id)
    }
}
export default {
    saveToOther: id => {
        const fileState = globalData.fileStateList.find(item => item.id === id)
        if(fileState.exists === false){
            globalData.win.webContents.send('showMessage', '未找到当前文件', 'warning')
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
                globalData.win.webContents.send('showMessage', '另存成功', 'success')
            })
        }
    },
    exit,
    winShow: () => {
        if(globalData.win.isMinimized()){
            globalData.win.restore()
        } else if (globalData.win.isVisible() === false) {
            globalData.win.show()
        }
        if(globalData.win.isFocused() === false) {
            globalData.win.focus()
        }
    },
    openSettingWin: () => {
        if (!globalData.settingWin || globalData.settingWin.isDestroyed()) {
            globalData.settingWin = new BrowserWindow({
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
            globalData.settingWin.webContents.setWindowOpenHandler(details => {
                shell.openExternal(details.url).then(() => {
                })
                return {action: 'deny'}
            })
            globalData.settingWin.once('ready-to-show', () => {
                globalData.settingWin.show()
            })
            if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
                globalData.settingWin.loadURL('http://localhost:8080/#/' + constant.router.setting).then(() => {
                })
            } else {
                globalData.settingWin.loadFile(path.resolve(__dirname, '../../web-dist/index.html'), {hash: constant.router.setting}).then(() => {
                })
            }
        } else if (globalData.settingWin.isMinimized()) {
            globalData.settingWin.show()
        } else if (!globalData.settingWin.isVisible()) {
            globalData.settingWin.center()
            globalData.settingWin.show()
        } else if (!globalData.settingWin.isFocused()) {
            globalData.settingWin.focus()
        }
    },
    openExportPdfWin: () => {
        const fileState = globalData.fileStateList.find(item => item.id === globalData.activeFileId)
        if(!fileState ||fileState.exists === false){
            globalData.win.webContents.send('showMessage', '未找到当前文件', 'warning')
            return;
        }
        const pdfPath = dialog.showSaveDialogSync({
            title: "导出PDF",
            buttonLabel: "导出",
            defaultPath: path.parse(fileState.fileName).name,
            filters: [
                {name: 'pdf文件', extensions: ['pdf']}
            ]
        })
        if (pdfPath) {
            globalData.win.webContents.send('showMessage', '导出中...', 'loading', 0)
            globalData.exportWin = new BrowserWindow({
                frame: false,
                modal: true,
                parent: globalData.win,
                maximizable: false,
                resizable: false,
                show: false,
                webPreferences: {
                    preload: path.resolve(__dirname, '../preload.js')
                }
            })
            globalData.exportWin.once('execute-export-pdf', () => {
                globalData.exportWin.webContents.printToPDF({
                    pageSize: 'A4',
                    printBackground: true,
                    generateTaggedPDF: true,
                    displayHeaderFooter: true,
                    headerTemplate: '<span></span>',
                    footerTemplate: '<div style="font-size: 12px; text-align: center; width: 100%">第<span class="pageNumber"></span>页 共<span class="totalPages"></span>页 文档由<a target="_blank" href="https://github.com/nlbwqmz/wj-markdown-editor">wj-markdown-editor</a>导出</div>'
                }).then(buffer => {
                    fs.writeFile(pdfPath, Buffer.from(buffer), () => {
                        globalData.win.webContents.send('showMessage', '导出成功', 'success', 2, true)
                        globalData.exportWin.close()
                    })
                }).catch(() => {
                    globalData.win.webContents.send('showMessage', '导出失败', 'error', 2, true)
                    globalData.exportWin.close()
                })
            })
            if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
                globalData.exportWin.loadURL('http://localhost:8080/#/' + constant.router.export + '?id=' + globalData.activeFileId).then(() => {
                })
            } else {
                globalData.exportWin.loadFile(path.resolve(__dirname, '../../web-dist/index.html'), {
                    hash: constant.router.export,
                    search: 'id=' + globalData.activeFileId
                }).then(() => {})
            }
        }
    },
    openAboutWin: () => {
        if (!globalData.aboutWin || globalData.aboutWin.isDestroyed()) {
            globalData.aboutWin = new BrowserWindow({
                frame: false,
                width: 500,
                height: 272,
                show: false,
                parent: globalData.win,
                maximizable: false,
                resizable: false,
                webPreferences: {
                    preload: path.resolve(__dirname, '../preload.js')
                }
            });
            globalData.aboutWin.webContents.setWindowOpenHandler(details => {
                shell.openExternal(details.url).then(() => {
                })
                return {action: 'deny'}
            })
            globalData.aboutWin.once('ready-to-show', () => {
                globalData.aboutWin.show()
            })
            if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
                globalData.aboutWin.loadURL('http://localhost:8080/#/' + constant.router.about + '?version=' + app.getVersion() + '&name=' + app.getName()).then(() => {
                })
            } else {
                globalData.aboutWin.loadFile(path.resolve(__dirname, '../../web-dist/index.html'), {
                    hash: constant.router.about,
                    search: 'version=' + app.getVersion() + '&name=' + app.getName()
                }).then(() => {
                })
            }
        } else {
            globalData.aboutWin.center()
            globalData.aboutWin.show()
        }
    },
    closeAboutWin: () => {
        if (globalData.aboutWin && !globalData.aboutWin.isDestroyed()) {
            globalData.aboutWin.hide()
        }
    },
    toggleSearchBar: () => {
        if (globalData.searchBar && !globalData.searchBar.isDestroyed() && globalData.searchBar.isVisible()) {
            globalData.win.webContents.stopFindInPage('clearSelection')
            globalData.searchBar.close()
            return
        }
        globalData.searchBar = new BrowserWindow({
            width: 350,
            height: 60,
            parent: globalData.win,
            frame: false,
            modal: false,
            maximizable: false,
            resizable: false,
            show: false,
            webPreferences: {
                preload: path.resolve(__dirname, '../preload.js')
            }
        })
        globalData.searchBar.once('ready-to-show', () => {
            const size = globalData.win.getSize();
            const position = globalData.win.getPosition();
            globalData.searchBar.setPosition(position[0] + size[0] - globalData.searchBar.getSize()[0] - 80, position[1] + 80)
            globalData.searchBar.show()
        })
        if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
            globalData.searchBar.loadURL('http://localhost:8080/#/' + constant.router.searchBar).then(() => {
            })
        } else {
            globalData.searchBar.loadFile(path.resolve(__dirname, '../../web-dist/index.html'), {hash: constant.router.searchBar}).then(() => {})
        }
    },
    moveSearchBar: () => {
        if (globalData.searchBar && !globalData.searchBar.isDestroyed()) {
            const size = globalData.win.getSize();
            const position = globalData.win.getPosition();
            globalData.searchBar.setPosition(position[0] + size[0] - globalData.searchBar.getSize()[0] - 80, position[1] + 80)
        }
    },
    hideSearchBar: () => {
        if (globalData.searchBar && !globalData.searchBar.isDestroyed()) {
            globalData.searchBar.hide()
        }
    },
    showSearchBar: () => {
        if(globalData.searchBar && !globalData.searchBar.isDestroyed() && globalData.searchBar.isVisible() === false){
            globalData.searchBar.show()
        }
    },
    settingWinMinimize: () => {
        if (globalData.settingWin && !globalData.settingWin.isDestroyed()) {
            globalData.settingWin.minimize()
        }
    },
    shouldUpdateConfig: () => {
        globalData.win.webContents.send('shouldUpdateConfig', globalData.config)
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
    sendMessageToAbout,
    checkUpdate: () => {
        if (app.isPackaged) {
            axios.get('https://api.github.com/repos/nlbwqmz/wj-markdown-editor/releases/latest').then((res) => {
                const versionLatest = res.data.tag_name
                autoUpdater.setFeedURL(`https://github.com/nlbwqmz/wj-markdown-editor/releases/download/${versionLatest}`)
                autoUpdater.checkForUpdates().then(res => {
                    if(res && res.updateInfo && res.updateInfo.version && compareVersion(res.updateInfo.version, app.getVersion()) === 1){
                        sendMessageToAbout('messageToAbout', {finish: true, success: true, version: res.updateInfo.version})
                    } else {
                        sendMessageToAbout('messageToAbout', {finish: true, success: true, version: app.getVersion()})
                    }
                }).catch(() => {
                    sendMessageToAbout('messageToAbout', {finish: true, success: false, message: '处理失败，请检查网络。'})
                })
            }).catch(() => {
                sendMessageToAbout('messageToAbout', {finish: true, success: false, message: '处理失败，请检查网络。'})
            })
        }
    },
    initUpdater: () => {
        if (app.isPackaged) {
            autoUpdater.autoDownload = false
            autoUpdater.autoInstallOnAppQuit = false
            autoUpdater.on('checking-for-update', () => {})
            autoUpdater.on('download-progress', progressInfo => {
                sendMessageToAbout('updaterDownloadProgress', {
                    percent: progressInfo.percent,
                    bytesPerSecond: progressInfo.bytesPerSecond
                })
            })
            autoUpdater.on('error', (error) => {
                sendMessageToAbout('messageToAbout', {finish: true, success: false, message: '处理失败，请检查网络。'})
            })
        }
    },
    executeDownload: () => {
        const cancellationToken = new CancellationToken()
        autoUpdater.downloadUpdate(cancellationToken).then(filePathList => {
            sendMessageToAbout('downloadFinish')
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
        globalData.win.webContents.send('changeTab', create.id)
    },
    saveFile: data => {
        // type, currentWebdavPath
        const fileStateList = globalData.fileStateList
        const fileState = globalData.fileStateList.find(item => item.id === data.id)
        if(fileState.exists === false){
            globalData.win.webContents.send('showMessage', '未找到当前文件', 'warning')
            return;
        }
        if (fileState.type === 'webdav' && globalData.webdavLoginState === false) {
            globalData.win.webContents.send('showMessage', '请先登录webdav', 'error')
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
                        globalData.win.webContents.send('showMessage', '保存成功', 'success')
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
                        globalData.win.webContents.send('showMessage', '保存成功', 'success')
                    } else {
                        globalData.win.webContents.send('showMessage', '保存失败', 'error')
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
                    globalData.win.webContents.send('showMessage', '保存成功', 'success')
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
                    globalData.win.webContents.send('showMessage', '保存成功', 'success')
                    globalData.win.webContents.send('openWebdavPath', data.currentWebdavPath)
                } else {
                    globalData.win.webContents.send('showMessage', '保存失败', 'error')
                }
            })
        } else {
            globalData.win.webContents.send('noticeToSave', data)
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
                        globalData.win.webContents.send('hasNewVersion')
                    }
                }).catch(() => {})
            }).catch(() => {})
        }
    }
}
