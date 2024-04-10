import {app, clipboard, shell} from 'electron'
import {ipcMain, dialog} from 'electron'
import fs from 'fs'
import globalData from './globalData.js'
import common from './common.js'
import path from 'path'
import { execFile } from 'child_process'
import pathUtil from './pathUtil.js'
import fsUtil from './fsUtil.js'
import axios from 'axios'
import mime from 'mime-types'
import defaultConfig from './defaultConfig.js'
import webdavUtil from "./webdavUtil.js";
import {nanoid} from "nanoid";

const isBase64Img = files => {
    return files.find(item => item.base64) !== undefined
}

const uploadImage = async obj => {
    const files = obj.fileList
    const fileState = globalData.fileStateList.find(item => item.id === obj.id)
    let list
    globalData.win.webContents.send('showMessage', '图片处理中', 'loading', 0)
    const insertImgType = common.getImgInsertType(files[0])
    if(insertImgType === '1'){ // 无操作
        if(isBase64Img(files)){
            globalData.win.webContents.send('showMessage', '无法在当前图片模式下粘贴网络图片或截图', 'error', 2, true)
            return undefined
        } else {
            list = files.map(file => file.path || file.url)
        }
    } else if (insertImgType === '2' || insertImgType === '3' || insertImgType === '4') { // // 2: 复制到 ./%{filename} 文件夹 3: 复制到 ./assets 文件夹 4:复制到指定文件夹
        if((insertImgType === '2' || insertImgType === '3') && !fileState.originFilePath){
            globalData.win.webContents.send('showMessage', '当前文件未保存，不能将图片保存到相对位置', 'error', 2, true)
            return undefined
        }
        let savePath
        try {
            savePath = common.getImgParentPath(fileState, insertImgType)
        } catch (e) {
            globalData.win.webContents.send('showMessage', '图片保存路径创建失败,请检查相关设置是否正确', 'error', 2, true)
            return undefined
        }
        list = await Promise.all(files.map(async file => {
            if(file.path){
                const newFilePath = path.join(savePath, common.getUUID() + '.' + mime.extension(file.type));
                if(fileState.type === 'local' || insertImgType === '4'){
                    fs.copyFileSync(file.path, newFilePath)
                } else {
                    const flag = await webdavUtil.putFileContents(newFilePath, fs.readFileSync(file.path))
                    if(!flag){
                        return undefined
                    }
                }
                if(insertImgType === '2' || insertImgType === '3'){
                    return path.relative(path.join(savePath, '../'), newFilePath)
                }
                return newFilePath
            } else if(file.base64){
                const newFilePath = path.join(savePath, common.getUUID() + '.' + mime.extension(file.type));
                const buffer = new Buffer.from(file.base64, 'base64');
                if(fileState.type === 'local' || insertImgType === '4'){
                    fs.writeFileSync(newFilePath,  buffer)
                } else {
                    const flag = await webdavUtil.putFileContents(newFilePath, buffer)
                    if(!flag){
                        return undefined
                    }
                }
                if(insertImgType === '2' || insertImgType === '3'){
                    return path.relative(path.join(savePath, '../'), newFilePath)
                }
                return newFilePath
            } else if(file.url) {
                try{
                    const result = await axios.get(file.url, {
                        responseType: 'arraybuffer', // 特别注意，需要加上此参数
                    });
                    const newFilePath = path.join(savePath, common.getUUID() + '.' + mime.extension(result.headers.get("Content-Type")));
                    if(fileState.type === 'local' || insertImgType === '4'){
                        fs.writeFileSync(newFilePath,  result.data)
                    } else {
                        const flag = await webdavUtil.putFileContents(newFilePath, result.data)
                        if(!flag){
                            return undefined
                        }
                    }
                    if(insertImgType === '2' || insertImgType === '3'){
                        return path.relative(path.join(savePath, '../'), newFilePath)
                    }
                    return newFilePath
                } catch (e) {
                    globalData.win.webContents.send('showMessage', '图片下载失败', 'error', 2, true)
                    return undefined
                }
            }
        }))
    } else if (insertImgType === '5') { // 上传
        if(!globalData.config.picGo.host || !globalData.config.picGo.port) {
            globalData.win.webContents.send('showMessage', '请配置PicGo服务信息', 'error', 2, true)
            return undefined
        }
        const tempPath = pathUtil.getTempPath()
        let tempList = await Promise.all(files.map(async file => {
            if(file.path){
                const newFilePath = path.resolve(tempPath, common.getUUID() + '.' + mime.extension(file.type));
                fs.copyFileSync(file.path, newFilePath)
                return newFilePath
            } else if(file.base64){
                const newFilePath = path.resolve(tempPath, common.getUUID() + '.' + mime.extension(file.type));
                const buffer = new Buffer.from(file.base64, 'base64');
                fs.writeFileSync(newFilePath,  buffer)
                return newFilePath
            } else if(file.url) {
                try{
                    const result = await axios.get(file.url, {
                        responseType: 'arraybuffer', // 特别注意，需要加上此参数
                    });
                    const newFilePath = path.resolve(tempPath, common.getUUID() + '.' + mime.extension(result.headers.get("Content-Type")));
                    fs.writeFileSync(newFilePath,  result.data)
                    return newFilePath
                } catch (e) {
                    globalData.win.webContents.send('showMessage', '图片下载失败', 'error', 2, true)
                    return undefined
                }
            }
        }))
        tempList = tempList && tempList.length > 0 ? tempList.filter(item => item !== undefined) : []
        if(tempList && tempList.length > 0) {
            let error = false
            axios.post(`http://${globalData.config.picGo.host}:${globalData.config.picGo.port}/upload`, { list: tempList }).then(res => {
                if(res.data.success === true){
                    globalData.win.webContents.send('insertScreenshotResult', { id: obj.id, list: res.data.result })
                } else {
                    globalData.win.webContents.send('showMessage', `图片上传失败，请检查PicGo服务。(错误信息：${res.data.message})`, 'error', 2, true)
                }
            }).catch(err => {
                error = true
                globalData.win.webContents.send('showMessage', `图片上传失败，请检查PicGo服务。(错误信息：${err.message})`, 'error', 2 ,true)
            }).finally(() => {
                if(!error){
                    globalData.win.webContents.send('closeMessage')
                }
                if(tempList && tempList.length){
                    fsUtil.deleteFileList(tempList)
                }
            })
        }
        return undefined
    }
    if(list && list.length > 0) {
        globalData.win.webContents.send('insertScreenshotResult', { id: obj.id, list })
        if(!list.find(item => item === undefined)){
            globalData.win.webContents.send('closeMessage')
        }
    }
}

ipcMain.handle('getFileContent', async (event, id) => {
    const fileStateList = globalData.fileStateList
    const fileState = fileStateList.find(item => item.id === id);
    if(!fileState.loaded){
        if(fileState.type === 'local') {
            if(fsUtil.exists(fileState.originFilePath)){
                const content = fs.readFileSync(fileState.originFilePath).toString()
                fileState.content = content
                fileState.tempContent = content
            } else {
                fileState.type = ''
                fileState.originFilePath = ''
                fileState.exists = false
                globalData.fileStateList = fileStateList
                return { exists: false }
            }
        } else if(fileState.type === 'webdav'){
            if(await webdavUtil.exists(fileState.originFilePath)){
                const content = await webdavUtil.getFileContents(fileState.originFilePath)
                fileState.content = content
                fileState.tempContent = content
            } else {
                fileState.type = ''
                fileState.originFilePath = ''
                fileState.exists = false
                globalData.fileStateList = fileStateList
                return { exists: false }
            }
        }
    }
    return { exists: true, content: globalData.fileStateList.find(item => item.id === id).tempContent }
})

ipcMain.handle('openDirSelect', event => {
    const dirList = dialog.showOpenDialogSync(globalData.settingWin, {
        title: '选择文件夹',
        buttonLabel: '确认',
        properties: ['openDirectory']
    })
    return dirList && dirList.length > 0 ? dirList[0] : undefined
})

ipcMain.on('uploadImage', (event, obj) => {
    uploadImage(obj)
})

ipcMain.handle('getConfig', event => {
    return globalData.config
})

ipcMain.on('saveToOther', (event, id) => {
    common.saveToOther(id)
})

ipcMain.on('onContentChange', (event, content, id) => {
    const fileStateList = globalData.fileStateList
    const fileState = fileStateList.find(item => item.id === id)
    fileState.tempContent = content
    fileState.saved = fileState.content.length === content.length && fileState.content === content
    globalData.fileStateList = fileStateList
})

ipcMain.on('openSettingWin', event => {
    common.openSettingWin()
})


ipcMain.on('settingWinMinimize', () => {
    common.settingWinMinimize()
})
ipcMain.on('closeSettingWin', () => {
    if(globalData.settingWin){
        globalData.settingWin.hide()
    }
})

ipcMain.on('updateConfig', (event, config) => {
    globalData.config = config
})

ipcMain.on('exportPdf', event => {
    common.openExportPdfWin()
})

ipcMain.on('closeExportWin', event => {
    if(globalData.exportWin){
        globalData.exportWin.close()
    }
})

ipcMain.on('toggleSearchBar', event => {
    common.toggleSearchBar()
})

ipcMain.on('findInPage', (event, searchContent) => {
    globalData.win.webContents.findInPage(searchContent, { findNext: true })
})

ipcMain.on('findInPageNext', (event, searchContent, forward) => {
    globalData.win.webContents.findInPage(searchContent, { forward, findNext: false })
})

ipcMain.on('stopFindInPage', event => {
    globalData.win.webContents.stopFindInPage('clearSelection')
})

ipcMain.on('screenshot', (event, id, hide) => {
    if(hide === true) {
        globalData.win.minimize()
    }
    setTimeout(() => {
        const childProcess =  execFile(pathUtil.getSnapShotExePath())
        childProcess.on('exit', (code) => {
            if (code === 0 || code === 1) {
                const buffer = clipboard.readImage().toPNG()
                if(buffer && buffer.length > 0){
                    const base64 = buffer.toString('base64')
                    uploadImage({ id, fileList: [{ base64, type: 'image/png', isScreenshot: true }] }).then(res => {})
                    clipboard.clear()
                }
            }
            if(hide === true) {
                globalData.win.restore()
            }
            childProcess.kill()
        })
    }, 200)
})

ipcMain.on('action', (event, type) => {
    globalData.win[type]()
})

ipcMain.on('restoreDefaultSetting', event => {
    globalData.config = defaultConfig
    if(globalData.settingWin && !globalData.settingWin.isDestroyed()){
        globalData.settingWin.webContents.send('shouldUpdateConfig', globalData.config)
    }
})

ipcMain.on('openAboutWin', event => {
    common.openAboutWin()
})
ipcMain.on('closeAboutWin', event => {
    common.closeAboutWin()
})
ipcMain.on('checkUpdate', event => {
    common.checkUpdate()
})

ipcMain.on('executeDownload', event => {
    common.executeDownload()
})
ipcMain.on('cancelDownload', event => {
    common.cancelDownload()
})

ipcMain.on('executeUpdate', event => {
    common.executeUpdate()
})

ipcMain.on('exportSetting', event => {
    const filePath = dialog.showSaveDialogSync({
        title: "导出设置",
        buttonLabel: "导出",
        defaultPath: 'config.json',
        filters: [
            {name: 'JSON文件', extensions: ['json']},
        ]
    })
    if(filePath){
        fsUtil.exportSetting(globalData.configPath, filePath, () => {
            globalData.win.webContents.send('showMessage', '导出成功', 'success')
        })
    }
})

ipcMain.on('importSetting', event => {
    const filePath = dialog.showOpenDialogSync({
        title: '导入设置',
        buttonLabel: '导入',
        filters: [
            {name: 'JSON文件', extensions: ['json']},
        ],
        properties: ['openFile']
    })
    if(filePath && filePath.length === 1 && fsUtil.exists(filePath[0])){
        try {
            const json = fsUtil.getJsonFileContent(filePath[0])
            for(const key in defaultConfig){
                if(!json.hasOwnProperty(key)){
                    json[key] = defaultConfig[key]
                }
            }
            globalData.config = json
            globalData.win.webContents.send('showMessage', '导入成功', 'success')
        } catch (e) {
            globalData.win.webContents.send('showMessage', '导入失败', 'error')
        }
    }
})

ipcMain.on('newFile', event => {
    common.newFile()
})

ipcMain.on('closeFile', (event, id) => {
    common.closeAndChangeTab(id)
})

ipcMain.on('saveFile', (event, data) => {
    common.saveFile(data)
})

ipcMain.on('updateActiveFileId', (event, id) => {
    globalData.activeFileId = id
})

ipcMain.on('openFolder', (event, id) => {
    const fileState = globalData.fileStateList.find(item => item.id === id)
    if(fileState.originFilePath){
        shell.showItemInFolder(fileState.originFilePath)
    }
})

ipcMain.on('loginWebdav', (event, data) => {
    webdavUtil.login(data, true)
})

ipcMain.handle('webdavGetDirectoryContents', async (event, currentPath) => {
    return await webdavUtil.getDirectoryContents(currentPath)
})

ipcMain.on('webdavLogout', event => {
    webdavUtil.logout()
})

ipcMain.on('openWebdavMd', async (event, filename, basename) => {
    const fileStateList = globalData.fileStateList
    const  find = fileStateList.find(item => item.type === 'webdav' && item.originFilePath === filename)
    if(find) {
        globalData.win.webContents.send('changeTab', find.id)
    } else {
        const content = await webdavUtil.getFileContents(filename)
        const create = {
            id: common.getUUID(),
            saved: true,
            content: content,
            tempContent: content,
            originFilePath: filename,
            fileName: basename,
            type: 'webdav'
        }
        fileStateList.push(create)
        globalData.fileStateList = fileStateList
        globalData.win.webContents.send('changeTab', create.id)
    }
})

ipcMain.handle('getLoginInfo', async () => {
    return await webdavUtil.getLoginInfo()
})

ipcMain.handle('getFileStateList', () => {
    return globalData.fileStateList.map(item => {
        return {
            id: item.id,
            saved: item.saved,
            originFilePath: item.originFilePath,
            fileName: item.fileName,
            type: item.type
        }
    })
})

ipcMain.on('checkAutoLogin', () => {
    webdavUtil.autoLogin()
})
