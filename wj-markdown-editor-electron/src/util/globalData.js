const fs = require("fs");
const defaultConfig = require('./defaultConfig')
const pathUtil = require('./pathUtil')
const fsUtil = require('./fsUtil')
const path = require("path");
const { Notification} = require("electron");
const {Cron} = require("croner");

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


const refreshTitle = () => {
    if(data.originFilePath){
        if(data.saved){
            data.win.webContents.send('refreshTitle', { name: data.initTitle, content: data.originFilePath, saved: true, title: pathUtil.getBaseName(data.originFilePath)})
        } else {
            data.win.webContents.send('refreshTitle', { name: data.initTitle, content: data.originFilePath, saved: false, title: pathUtil.getBaseName(data.originFilePath)})
        }
    } else {
        if(data.saved){
            data.win.webContents.send('refreshTitle', { name: data.initTitle, content: 'untitled', saved: true, title: 'untitled'})
        } else {
            data.win.webContents.send('refreshTitle', { name: data.initTitle, content: 'untitled', saved: false, title: 'untitled'})
        }
    }
}
const data = {
    win: null,
    initTitle: 'wj-markdown-editor',
    saved: true,
    content: firstContent,
    tempContent: firstContent,
    isOpenOnFile,
    exitModal: undefined,
    settingWin: undefined,
    exportWin: undefined,
    aboutWin: undefined,
    searchBar: undefined,
    downloadUpdateToken: undefined,
    originFilePath: originFilePath,
    config,
    refreshTitle
}



const proxyData = new Proxy(data, {
    get : (target, name) => {
        return target[name]
    },
    set(target, name, newValue, receiver) {
        target[name] = newValue
        handleDataChange(name, newValue)
    }
})
const handleDataChange = (name, newValue) => {
    if(name === 'originFilePath' || name === 'saved'){
        refreshTitle()
    } else if (name === 'config') {
        fs.writeFileSync(configPath, JSON.stringify(data.config))
        handleJob(data.config.autoSave.minute)
        data.win.webContents.send('shouldUpdateConfig', data.config)
        if(data.settingWin && !data.settingWin.isDestroyed()){
            data.settingWin.webContents.send('shouldUpdateConfig', data.config)
        }
        if(data.exportWin && !data.exportWin.isDestroyed()){
            data.exportWin.webContents.send('shouldUpdateConfig', data.config)
        }
    }
}
const handleJob = minute => {
    if(jobRecentMinute !== minute){
        jobRecentMinute = minute
        if(job && !job.isStopped()) {
            job.stop()
        }
        if(minute > 0){
            job = Cron(`*/${minute} * * * *`, { paused: true, protect: true }, () => {
                // 不立即执行
                if(data.originFilePath && !data.saved){
                    fs.writeFileSync(data.originFilePath, data.tempContent)
                    proxyData.saved = true
                    proxyData.content = data.tempContent
                    new Notification({
                        title: '自动保存成功'
                    }).show()
                }
            })
            job.resume()
        }
    }
}
handleJob(data.config.autoSave.minute)
module.exports = proxyData
