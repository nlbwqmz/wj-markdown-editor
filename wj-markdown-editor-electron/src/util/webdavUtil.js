import { createClient } from "webdav"
import path from "path";
import aesUtil from "./aesUtil.js";
import win from "../win/win.js";
import fileState from "../runtime/fileState.js";
import webdavDb from "../db/webdavDb.js";

let webdavClient

const proxyData = new Proxy({
    webdavLoginState: false,
    autoLogin: false
}, {
    set(target, p, newValue, receiver) {
        target[p] = newValue;
        if(p === 'webdavLoginState') {
            win.loginState(newValue)
        } else if (p === 'autoLogin'){
            fileState.updateAutoLogin(newValue)
        }
        return true
    }
})

const func = {
    login: (data, write) => {
        webdavClient = createClient(data.url, {
            username: data.username,
            password: data.password
        })
        webdavClient.getDirectoryContents('/').then(() => {
            proxyData.webdavLoginState = true
            proxyData.autoLogin = data.autoLogin
            if(write === true){
                if(data.autoLogin === true) {
                    webdavDb.insertWebdav({ url: data.url, username: data.username, password: aesUtil.encrypt(data.password) }).then(() => {})
                } else {
                    webdavDb.removeWebdav().then(() => {})
                }
            }
        }).catch(() => {
            win.showMessage('登录失败', 'error')
            func.logout()
        })
    },
    getDirectoryContents: async currentPath => {
        try{
            return await webdavClient.getDirectoryContents(currentPath)
        } catch (err) {
            win.showMessage('访问失败', 'error')
        }
    },
    logout: () => {
        proxyData.autoLogin = false
        webdavClient = null
        proxyData.webdavLoginState = false
        webdavDb.removeWebdav().then(() => {})
    },
    getFileContents: async filename => {
        try {
            return await webdavClient.getFileContents(filename, { format: 'text' })
        } catch (err) {
            win.showMessage('访问失败', 'error')
        }
    },
    putFileContents: async (filename, content) => {
        try {
            filename = filename.replaceAll('\\', '/')
            if (await webdavClient.exists(path.dirname(filename)) === false) {
                await webdavClient.createDirectory(path.dirname(filename));
            }
            return await webdavClient.putFileContents(filename, content)
        } catch (err) {
            win.showMessage('访问失败', 'error')
        }
    },
    getFileBuffer: async filename => {
        try {
            return await webdavClient.getFileContents(filename, { format: 'binary' })
        } catch (err) {
            win.showMessage('访问失败', 'error')
        }
    },
    autoLogin: () => {
        webdavDb.selectWebdav().then(webdav => {
            if(webdav){
                try {
                    webdav.password = aesUtil.decrypt(webdav.password)
                } catch (e) {
                    webdavDb.removeWebdav().then(() => {})
                    return
                }
                func.login(webdav, false)
            }
        })
    },
    exists: async path => {
        try{
            return await webdavClient.exists(path)
        } catch (e) {
            return false
        }
    },
    getWebdavLoginState: () => {
        return proxyData.webdavLoginState
    }
}


export default func
