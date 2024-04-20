import pathUtil from './pathUtil.js'
import fsUtil from './fsUtil.js'
import path from "path"
import idUtil from "./idUtil.js";
import win from "../win/win.js";
import lastOpened from "../local/lastOpened.js";

const openOnFile = () => {
    return Boolean(process.argv && process.argv.length > 0 && /.*\.md$/.test(process.argv[process.argv.length - 1]))
}
fsUtil.mkdirSyncWithRecursion(pathUtil.getUserDataPath())
const isOpenOnFile = openOnFile()
const originFilePath = isOpenOnFile ? process.argv[process.argv.length - 1] : undefined
// const firstContent = isOpenOnFile ? fs.readFileSync(originFilePath).toString() : ''


const initFileStateList = async () => {
    const list = [...await lastOpened.read()]
    if(isOpenOnFile){
        const index = list.findIndex(item => item.originFilePath === originFilePath && item.type === 'local')
        if(index > -1){
            list.splice(index, 1)
        }
        list.push({
            id: idUtil.createId(),
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
            id: idUtil.createId(),
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

const writeLastOpenedFile = () => {
    lastOpened.write(data.fileStateList.filter(item => (data.autoLogin === true && item.type) || (!data.autoLogin && item.type === 'local')).map(item => {
        return {
            id: item.id,
            originFilePath: item.originFilePath,
            fileName: item.fileName,
            type: item.type
        }
    }))
}

const data = {
    activeFileId: '',
    webdavLoginState: false,
    fileStateList: await initFileStateList(),
    downloadUpdateToken: undefined,
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
    if(name === 'fileStateList'){
        win.updateFileStateList(data.fileStateList.map(item => {
            return {
                id: item.id,
                saved: item.saved,
                originFilePath: item.originFilePath,
                fileName: item.fileName,
                type: item.type
            }
        }))
        writeLastOpenedFile()
    } else if (name === 'webdavLoginState'){
        win.loginState(data.webdavLoginState)
    } else if (name === 'autoLogin') {
        writeLastOpenedFile()
    }
}

writeLastOpenedFile()

export default proxyData
