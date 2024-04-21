import pathUtil from './pathUtil.js'
import fsUtil from './fsUtil.js'
import win from "../win/win.js";
fsUtil.mkdirSyncWithRecursion(pathUtil.getUserDataPath())





const writeLastOpenedFile = () => {
}

const data = {
    activeFileId: '',
    webdavLoginState: false,
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
    if (name === 'webdavLoginState'){
        win.loginState(data.webdavLoginState)
    } else if (name === 'autoLogin') {
        writeLastOpenedFile()
    }
}


export default proxyData
