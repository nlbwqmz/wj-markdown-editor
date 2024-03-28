import fs from "fs"
import defaultConfig from './defaultConfig.js'
import pathUtil from './pathUtil.js'
import fsUtil from './fsUtil.js'
import path from "path"
import { Notification} from "electron"
import {Cron} from "croner"
import {nanoid} from "nanoid";
import webdavUtil from "./webdavUtil.js";

const openOnFile = () => {
    return Boolean(process.argv && process.argv.length > 0 && process.argv[process.argv.length - 1].match(/^[a-zA-Z]:(\\.*)+\.md$/))
}
fsUtil.mkdirSyncWithRecursion(pathUtil.getUserDataPath())
const isOpenOnFile = openOnFile()
const originFilePath = isOpenOnFile ? process.argv[process.argv.length - 1] : undefined
const firstContent = isOpenOnFile ? fs.readFileSync(originFilePath).toString() : ''
const configPath = path.resolve(pathUtil.getUserDataPath(), 'config.json')
const configIsExist = fs.existsSync(configPath)
const config = configIsExist ? JSON.parse(fs.readFileSync(configPath).toString()) : defaultConfig
if(configIsExist){
    let flag = false
    for(const key in defaultConfig){
        if(!config.hasOwnProperty(key)){
            flag = true
            config[key] = defaultConfig[key]
        }
    }
    if(flag){
        fs.writeFileSync(configPath, JSON.stringify(config))
    }
}
if(!configIsExist) {
    fs.writeFileSync(configPath, JSON.stringify(config))
}

let job
let jobRecentMinute = 0
const updateFileStateList = () => {
    data.win.webContents.send('updateFileStateList', data.fileStateList.map(item => {
        return {
            id: item.id,
            saved: item.saved,
            originFilePath: item.originFilePath,
            fileName: item.fileName,
            type: item.type
        }
    }))
}
const data = {
    win: null,
    initTitle: 'wj-markdown-editor',
    activeFileId: '',
    webdavLoginState: { webdavLogin: false, loginErrorMessage: '' },
    fileStateList: [{
        id: 'a' + nanoid(),
        saved: true,
        content: firstContent,
        tempContent: firstContent,
        originFilePath: originFilePath,
        fileName: originFilePath ? path.basename(originFilePath) : 'untitled',
        type: originFilePath ? 'local' : ''
    }],
    settingWin: undefined,
    exportWin: undefined,
    aboutWin: undefined,
    searchBar: undefined,
    downloadUpdateToken: undefined,
    config,
    configPath,
    updateFileStateList,
    webdavClient: null
}

const proxyData = new Proxy(data, {
    get : (target, name) => {
        return target[name]
    },
    set(target, name, newValue, receiver) {
        target[name] = newValue
        handleDataChange(name, newValue)
        return true
    }
})
const handleDataChange = (name, newValue) => {
    if (name === 'config') {
        fs.writeFileSync(configPath, JSON.stringify(data.config))
        handleJob(data.config.autoSave.minute)
        data.win.webContents.send('shouldUpdateConfig', data.config)
        if(data.exportWin && !data.exportWin.isDestroyed()){
            data.exportWin.webContents.send('shouldUpdateConfig', data.config)
        }
    } else if(name === 'fileStateList'){
        updateFileStateList()
    } else if (name === 'webdavLoginState'){
        data.win.webContents.send('loginState', data.webdavLoginState)
    }
}
const handleJob = minute => {
    if(jobRecentMinute !== minute){
        jobRecentMinute = minute
        if(job && !job.isStopped()) {
            job.stop()
        }
        if(minute > 0){
            job = Cron(`*/${minute} * * * *`, { paused: true, protect: true }, async () => {
                // 不立即执行
                const fileStateList = data.fileStateList
                let has = false
                for (const item of fileStateList) {
                    if(item.originFilePath && !item.saved){
                        if(item.type === 'local') {
                            fs.writeFileSync(item.originFilePath, item.tempContent)
                        } else if (item.type === 'webdav') {
                            await data.webdavClient.putFileContents(item.originFilePath, item.tempContent)
                        }
                        item.saved = true
                        item.content = item.tempContent
                        has = true
                    }
                }
                if(has){
                    new Notification({
                        title: '自动保存成功'
                    }).show()
                    proxyData.fileStateList = fileStateList
                }
            })
            job.resume()
        }
    }
}
handleJob(data.config.autoSave.minute)
export default proxyData
