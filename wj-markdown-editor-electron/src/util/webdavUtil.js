import { createClient } from "webdav"
import path from "path";
import pathUtil from "./pathUtil.js";
import fs from "fs";
import fsUtil from "./fsUtil.js";
import aesUtil from "./aesUtil.js";
import win from "../win/win.js";
import fileState from "../runtime/fileState.js";

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
                    fs.writeFile(pathUtil.getLoginInfoPath(), aesUtil.encrypt(JSON.stringify(data)), () => {})
                } else {
                    fs.writeFile(pathUtil.getLoginInfoPath(), aesUtil.encrypt(JSON.stringify({username: data.username, url: data.url})), () => {})
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
        const loginInfoPath = pathUtil.getLoginInfoPath();
        if(fsUtil.exists(loginInfoPath)){
            fs.readFile(loginInfoPath, (err, data) => {
                if(!err) {
                    const str = data.toString();
                    if(str) {
                        const loginInfo = JSON.parse(aesUtil.decrypt(str))
                        fs.writeFile(loginInfoPath, aesUtil.encrypt(JSON.stringify({username: loginInfo.username, url: loginInfo.url})), () => {})
                    }
                }
            })
        }
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
        const loginInfoPath = pathUtil.getLoginInfoPath()
        if(fsUtil.exists(loginInfoPath)) {
            fs.readFile(loginInfoPath, (err, data) => {
                if(!err) {
                    const str = data.toString();
                    if(str) {
                        const loginInfo = JSON.parse(aesUtil.decrypt(str))
                        if(loginInfo.autoLogin === true){
                            func.login(loginInfo, false)
                        }
                    }
                }
            })
        }
    },
    getLoginInfo: () => {
        return new Promise((resolve, reject) => {
            const loginInfoPath = pathUtil.getLoginInfoPath()
            if(fsUtil.exists(loginInfoPath)) {
                fs.readFile(loginInfoPath, (err, data) => {
                    if(!err) {
                        const str = data.toString();
                        if(str) {
                            const loginInfo = JSON.parse(aesUtil.decrypt(str))
                            resolve({ username: loginInfo.username, url: loginInfo.url})
                        }
                    }
                })
            } else {
                resolve()
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
