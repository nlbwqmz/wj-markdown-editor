import { createClient } from "webdav"
import globalData from "./globalData.js";
import path from "path";
import pathUtil from "./pathUtil.js";
import fs from "fs";
import fsUtil from "./fsUtil.js";
import aesUtil from "./aesUtil.js";

const func = {
    login: (data, write) => {
        globalData.webdavClient = createClient(data.url, {
            username: data.username,
            password: data.password
        })
        globalData.webdavClient.getDirectoryContents('/').then(() => {
            globalData.webdavLoginState = true
            if(write === true){
                if(data.autoLogin === true) {
                    fs.writeFile(pathUtil.getLoginInfoPath(), aesUtil.encrypt(JSON.stringify(data)), () => {})
                } else {
                    fs.writeFile(pathUtil.getLoginInfoPath(), aesUtil.encrypt(JSON.stringify({username: data.username, url: data.url})), () => {})
                }
            }
        }).catch(() => {
            globalData.win.webContents.send('showMessage', '登录失败', 'error')
            func.logout()
        })
    },
    getDirectoryContents: async currentPath => {
        try{
            return await globalData.webdavClient.getDirectoryContents(currentPath)
        } catch (err) {
            globalData.win.webContents.send('showMessage', '访问失败', 'error')
        }
    },
    logout: () => {
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
            globalData.win.webContents.send('showMessage', '访问失败', 'error')
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
            globalData.win.webContents.send('showMessage', '访问失败', 'error')
        }
    },
    getFileBuffer: async filename => {
        try {
            return await globalData.webdavClient.getFileContents(filename, { format: 'binary' })
        } catch (err) {
            globalData.win.webContents.send('showMessage', '访问失败', 'error')
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
    }
}


export default func
