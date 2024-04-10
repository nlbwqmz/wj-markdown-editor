import fs from "fs"
import defaultConfig from './defaultConfig.js'
import pathUtil from './pathUtil.js'
import fsUtil from './fsUtil.js'
import path from "path"
import { Notification} from "electron"
import {Cron} from "croner"
import {nanoid} from "nanoid";

const openOnFile = () => {
    return Boolean(process.argv && process.argv.length > 0 && process.argv[process.argv.length - 1].match(/^[a-zA-Z]:(\\.*)+\.md$/))
}
fsUtil.mkdirSyncWithRecursion(pathUtil.getUserDataPath())
const isOpenOnFile = openOnFile()
const originFilePath = isOpenOnFile ? process.argv[process.argv.length - 1] : undefined
// const firstContent = isOpenOnFile ? fs.readFileSync(originFilePath).toString() : ''
const configPath = pathUtil.getConfigPath()
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
        fs.writeFile(configPath, JSON.stringify(config), () => {})
    }
}
if(!configIsExist) {
    fs.writeFile(configPath, JSON.stringify(config), () => {})
}

const initFileStateList = () => {
    const list = []
    if(fsUtil.exists(pathUtil.getLastOpenedFilePath())){
        list.push(...JSON.parse(fs.readFileSync(pathUtil.getLastOpenedFilePath()).toString()).map(item => {
            return {
                ...item,
                saved: true,
                content: '',
                tempContent: '',
                loaded: false
            }
        }))
    }
    if(isOpenOnFile){
        const index = list.findIndex(item => item.originFilePath === originFilePath && item.type === 'local')
        if(index > -1){
            list.splice(index, 1)
        }
        list.push({
            id: 'a' + nanoid(),
            saved: true,
            content: '',
            tempContent: '',
            originFilePath: originFilePath,
            fileName: path.basename(originFilePath),
            type: 'local',
            loaded: false
        })
    }
    if(list.length === 0){
        list.push({
            id: 'a' + nanoid(),
            saved: true,
            content: '',
            tempContent: '',
            originFilePath: undefined,
            fileName: 'untitled',
            type: '',
            loaded: false
        })
    }
    return list
}

let job
let jobRecentMinute = 0

const writeLastOpenedFile = () => {
    fs.writeFile(pathUtil.getLastOpenedFilePath(), JSON.stringify(data.fileStateList.filter(item => (data.autoLogin === true && item.type) || (!data.autoLogin && item.type === 'local')).map(item => {
        return {
            id: item.id,
            originFilePath: item.originFilePath,
            fileName: item.fileName,
            type: item.type
        }
    })), () => {})
}
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
    writeLastOpenedFile()
}
const data = {
    win: null,
    initTitle: 'wj-markdown-editor',
    activeFileId: '',
    webdavLoginState: false,
    fileStateList: initFileStateList(),
    settingWin: undefined,
    exportWin: undefined,
    aboutWin: undefined,
    searchBar: undefined,
    downloadUpdateToken: undefined,
    config,
    configPath,
    updateFileStateList,
    webdavClient: null,
    autoLogin: false
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
    } else if (name === 'autoLogin') {
        writeLastOpenedFile()
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
writeLastOpenedFile()
handleJob(data.config.autoSave.minute)
export default proxyData
