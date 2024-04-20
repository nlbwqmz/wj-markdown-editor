import { createClient } from "webdav"
import globalData from "./globalData.js";
import path from "path";
import pathUtil from "./pathUtil.js";
import fs from "fs";
import fsUtil from "./fsUtil.js";
import aesUtil from "./aesUtil.js";
import win from "../win/win.js";

const func = {
    login: (data, write) => {
        globalData.webdavClient = createClient(data.url, {
            username: data.username,
            password: data.password
        })
        globalData.webdavClient.getDirectoryContents('/').then(() => {
            globalData.webdavLoginState = true
            globalData.autoLogin = data.autoLogin
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
            return await globalData.webdavClient.getDirectoryContents(currentPath)
        } catch (err) {
            win.showMessage('访问失败', 'error')
        }
    },
    logout: () => {
        globalData.autoLogin = false
        globalData.webdavClient = null
        globalData.webdavLoginState = false
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
            return await globalData.webdavClient.getFileContents(filename, { format: 'text' })
        } catch (err) {
            win.showMessage('访问失败', 'error')
        }
    },
    putFileContents: async (filename, content) => {
        try {
            filename = filename.replaceAll('\\', '/')
            if (await globalData.webdavClient.exists(path.dirname(filename)) === false) {
                await globalData.webdavClient.createDirectory(path.dirname(filename));
            }
            return await globalData.webdavClient.putFileContents(filename, content)
        } catch (err) {
            win.showMessage('访问失败', 'error')
        }
    },
    getFileBuffer: async filename => {
        try {
            return await globalData.webdavClient.getFileContents(filename, { format: 'binary' })
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
            return await globalData.webdavClient.exists(path)
        } catch (e) {
            return false
        }
    }
}


export default func
