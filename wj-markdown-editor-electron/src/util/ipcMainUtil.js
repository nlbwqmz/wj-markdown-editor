import {app, shell} from 'electron'
import {ipcMain, dialog} from 'electron'
import { exec } from 'child_process'
import fs from 'fs'
import globalData from './globalData.js'
import common from './common.js'
import path from 'path'
import pathUtil from './pathUtil.js'
import fsUtil from './fsUtil.js'
import axios from 'axios'
import mime from 'mime-types'
import webdavUtil from "./webdavUtil.js";
import screenshotsUtil from "./screenshotsUtil.js";
import globalShortcutUtil from "./globalShortcutUtil.js";
import exportWin from "../win/exportWin.js";
import settingWin from "../win/settingWin.js";
import aboutWin from "../win/aboutWin.js";
import win from "../win/win.js";
import config from "../local/config.js";
import util from "./util.js";
import fileState from "../runtime/fileState.js";
import convertUtil from "./convertUtil.js";
import defaultConfig from "../constant/defaultConfig.js";
import configDb from "../db/configDb.js";

const isBase64Img = files => {
    return files.find(item => item.base64) !== undefined
}

const uploadImage = async obj => {
    const files = obj.fileList
    const fileStateItem = fileState.getById(obj.id)
    let list
    win.showMessage('图片处理中', 'loading', 0)
    const insertImgType = common.getImgInsertType(files[0])
    if(insertImgType === '1'){ // 无操作
        if(isBase64Img(files)){
            win.showMessage('无法在当前图片模式下粘贴网络图片或截图', 'error', 2, true)
            return undefined
        } else {
            list = files.map(file => file.path || file.url)
        }
    } else if (insertImgType === '2' || insertImgType === '3' || insertImgType === '4') { // // 2: 复制到 ./%{filename} 文件夹 3: 复制到 ./assets 文件夹 4:复制到指定文件夹
        if((insertImgType === '2' || insertImgType === '3') && !fileStateItem.originFilePath){
            win.showMessage('当前文件未保存，不能将图片保存到相对位置', 'error', 2, true)
            return undefined
        }
        let savePath
        try {
            savePath = common.getImgParentPath(fileStateItem, insertImgType)
        } catch (e) {
            win.showMessage('图片保存路径创建失败,请检查相关设置是否正确', 'error', 2, true)
            return undefined
        }
        list = await Promise.all(files.map(async file => {
            if(file.path){
                const newFilePath = path.join(savePath, util.createId() + '.' + mime.extension(file.type));
                if(fileStateItem.type === 'local' || insertImgType === '4'){
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
                const newFilePath = path.join(savePath, util.createId() + '.' + mime.extension(file.type));
                const buffer = new Buffer.from(file.base64, 'base64');
                if(fileStateItem.type === 'local' || insertImgType === '4'){
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
                    const newFilePath = path.join(savePath, util.createId() + '.' + mime.extension(result.headers.get("Content-Type")));
                    if(fileStateItem.type === 'local' || insertImgType === '4'){
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
                    win.showMessage('图片下载失败', 'error', 2, true)
                    return undefined
                }
            }
        }))
    } else if (insertImgType === '5') { // 上传
        if(!config.data.pic_go_host || !config.data.pic_go_port) {
            win.showMessage('请配置PicGo服务信息', 'error', 2, true)
            return undefined
        }
        const tempPath = pathUtil.getTempPath()
        let tempList = await Promise.all(files.map(async file => {
            if(file.path){
                const newFilePath = path.resolve(tempPath, util.createId() + '.' + mime.extension(file.type));
                fs.copyFileSync(file.path, newFilePath)
                return newFilePath
            } else if(file.base64){
                const newFilePath = path.resolve(tempPath, util.createId() + '.' + mime.extension(file.type));
                const buffer = new Buffer.from(file.base64, 'base64');
                fs.writeFileSync(newFilePath,  buffer)
                return newFilePath
            } else if(file.url) {
                try{
                    const result = await axios.get(file.url, {
                        responseType: 'arraybuffer', // 特别注意，需要加上此参数
                    });
                    const newFilePath = path.resolve(tempPath, util.createId() + '.' + mime.extension(result.headers.get("Content-Type")));
                    fs.writeFileSync(newFilePath,  result.data)
                    return newFilePath
                } catch (e) {
                    win.showMessage('图片下载失败', 'error', 2, true)
                    return undefined
                }
            }
        }))
        tempList = tempList && tempList.length > 0 ? tempList.filter(item => item !== undefined) : []
        if(tempList && tempList.length > 0) {
            let error = false
            axios.post(`http://${config.data.pic_go_host}:${config.data.pic_go_port}/upload`, { list: tempList }).then(res => {
                if(res.data.success === true){
                    win.insertScreenshotResult({ id: obj.id, list: res.data.result })
                } else {
                    win.showMessage(`图片上传失败，请检查PicGo服务。(错误信息：${res.data.message})`, 'error', 2, true)
                }
            }).catch(err => {
                error = true
                win.showMessage(`图片上传失败，请检查PicGo服务。(错误信息：${err.message})`, 'error', 2 ,true)
            }).finally(() => {
                if(!error){
                    win.closeMessage()
                }
                if(tempList && tempList.length){
                    fsUtil.deleteFileList(tempList)
                }
            })
        }
        return undefined
    }
    if(list && list.length > 0) {
        win.insertScreenshotResult({ id: obj.id, list })
        if(!list.find(item => item === undefined)){
            win.closeMessage()
        }
    }
}

ipcMain.handle('getFileContent', async (event, id) => {
    const fileStateItem = fileState.getById(id)
    if(!fileStateItem.loaded){
        if(fileStateItem.type === 'local') {
            if(fsUtil.exists(fileStateItem.originFilePath)){
                const content = fs.readFileSync(fileStateItem.originFilePath).toString()
                fileStateItem.content = content
                fileStateItem.tempContent = content
                fileStateItem.loaded = true
            } else {
                fileStateItem.type = ''
                fileStateItem.originFilePath = ''
                fileStateItem.exists = false
                return { exists: false }
            }
        } else if(fileStateItem.type === 'webdav'){
            if(await webdavUtil.exists(fileStateItem.originFilePath)){
                const content = await webdavUtil.getFileContents(fileStateItem.originFilePath)
                fileStateItem.content = content
                fileStateItem.tempContent = content
                fileStateItem.loaded = true
            } else {
                fileStateItem.type = ''
                fileStateItem.originFilePath = ''
                fileStateItem.exists = false
                return { exists: false }
            }
        }
    }
    return { exists: true, content: fileStateItem.tempContent }
})

ipcMain.handle('openDirSelect', event => {
    return settingWin.dirSelect()
})

ipcMain.on('generateDocxTemplate', () => {
    if(config.data.pandoc_path){
        const templatePath = path.resolve(config.data.pandoc_path, 'wj-markdown-editor-reference.docx');
        fs.access(templatePath, fs.constants.F_OK, err => {
            if(err){
                const childProcess = exec('pandoc -o wj-markdown-editor-reference.docx --print-default-data-file reference.docx', { cwd: config.data.pandoc_path });
                childProcess.on('close', () => {
                    shell.showItemInFolder(templatePath)
                })
            } else {
                shell.showItemInFolder(templatePath)
            }
        })
    }
})

ipcMain.on('uploadImage', (event, obj) => {
    uploadImage(obj)
})

ipcMain.handle('getConfig', event => {
    return util.deepCopy(config.data)
})

ipcMain.on('saveToOther', (event, id) => {
    common.saveToOther(id)
})

ipcMain.on('onContentChange', (event, content, id) => {
    const fileStateItem = fileState.getById(id)
    fileStateItem.tempContent = content
    fileStateItem.saved = fileStateItem.content.length === content.length && fileStateItem.content === content
})

ipcMain.on('openSettingWin', event => {
    settingWin.open()
})


ipcMain.on('settingWinMinimize', () => {
    settingWin.minimize()
})
ipcMain.on('closeSettingWin', () => {
    settingWin.hide()
})

ipcMain.on('updateConfig', (event, newConfig) => {
    util.setByKey(newConfig, config.data)
})

ipcMain.on('findInPage', (event, searchContent) => {
    win.findInPage(searchContent, { findNext: true })
})

ipcMain.on('findInPageNext', (event, searchContent, forward) => {
    win.findInPage(searchContent, { forward, findNext: false })
})

ipcMain.on('stopFindInPage', event => {
    win.stopFindInPage()
})

ipcMain.on('screenshot', (event, id, hide) => {
    const startCapture = () => {
        screenshotsUtil.startCapture((base64, bounds) => {
            uploadImage({ id, fileList: [{ base64, type: 'image/png', isScreenshot: true }] }).then(() => {})
        }, () => {
            if(hide === true) {
                win.show()
            }
        })
    }
    if(hide === true) {
        win.minimize()
        setTimeout(() => {
            startCapture()
        }, 200)
    } else {
        startCapture()
    }
})

ipcMain.on('action', (event, type) => {
    if(type === 'minimize' && config.data.minimize_to_tray === true){
        win.hide()
    } else {
        win.instanceFuncName(type)
    }
})
ipcMain.on('exit', () => {
    globalShortcutUtil.unregister()
    common.exit()
})
ipcMain.on('restoreDefaultSetting', event => {
    for(const key in defaultConfig){
        config.data[key] = defaultConfig[key].value
    }
    settingWin.shouldUpdateConfig(util.deepCopy(config.data))
})

ipcMain.on('openAboutWin', event => {
    aboutWin.open(win.get())
})
ipcMain.on('closeAboutWin', event => {
    aboutWin.hide()
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
        configDb.selectConfig().then(config => {
            fs.writeFile(filePath, JSON.stringify(config), err => {
                if(err){
                    win.showMessage('导出失败', 'error')
                } else {
                    win.showMessage('导出成功', 'success')
                }
            })
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
            const json = fsUtil.getJsonFileContent(filePath[0], {})
            for(const key in defaultConfig){
                if(!json.hasOwnProperty(key)){
                    json[key] = defaultConfig[key].value
                }
            }
            util.setByKey(json, config.data)
            win.showMessage('导入成功', 'success')
        } catch (e) {
            win.showMessage('导入失败', 'error')
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
    const fileStateItem = fileState.getById(id)
    if(fileStateItem.originFilePath){
        shell.showItemInFolder(fileStateItem.originFilePath)
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
    const  find = fileState.find(item => item.type === 'webdav' && item.originFilePath === filename)
    if(find) {
        win.changeTab(find.id)
    } else {
        const content = await webdavUtil.getFileContents(filename)
        const create = {
            id: util.createId(),
            saved: true,
            content: content,
            tempContent: content,
            originFilePath: filename,
            fileName: basename,
            type: 'webdav'
        }
        fileState.push(create)
        win.changeTab(create.id)
    }
})

ipcMain.handle('getFileStateList', () => {
    return fileState.get().map(item => {
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

ipcMain.handle('getCurrentVersion', () => {
    return app.getVersion()
})

ipcMain.on('openExportWin', (event, type) => {
    const fileStateItem = fileState.getById(globalData.activeFileId)
    if(!fileStateItem || !fileStateItem.tempContent){
        win.showMessage('当前文档内容为空', 'warning')
        return;
    }
    const filePath = dialog.showSaveDialogSync({
        title: "导出为" + type,
        buttonLabel: "导出",
        defaultPath: path.parse(fileStateItem.fileName).name,
        filters: [
            {name: type + '文件', extensions: [type]}
        ]
    })
    if (filePath) {
        win.showMessage('导出中...', 'loading', 0)
        exportWin.open(win.get(),  globalData.activeFileId, type,buffer => {
            fs.writeFile(filePath, buffer, () => {
                win.showMessage('导出成功', 'success', 2, true)
            })
        }, () => {
            win.showMessage('导出失败', 'error', 2, true)
        })
    }
})

ipcMain.on('executeConvertFile', (event, type, base64) => {
    if(type === 'pdf'){
        exportWin.emit('execute-export-pdf')
    } else if (type === 'word'){
        convertUtil.convertWord()
    } else {
        exportWin.emit('execute-export-img', base64)
    }
})
