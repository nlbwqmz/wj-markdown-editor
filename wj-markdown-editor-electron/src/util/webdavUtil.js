import { createClient } from "webdav"
import globalData from "./globalData.js";
import path from "path";
export default {
    login: data => {
        globalData.webdavClient = createClient(data.url, {
            username: data.username,
            password: data.password
        })
        globalData.webdavClient.getDirectoryContents('/').then(() => {
            globalData.webdavLoginState = { webdavLogin: true, loginErrorMessage: '' }
        }).catch(() => {
            globalData.webdavClient = null
            globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '登录失败' }
        })
    },
    getDirectoryContents: async currentPath => {
        try{
            return await globalData.webdavClient.getDirectoryContents(currentPath)
        } catch (err) {
            globalData.webdavClient = null
            globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '访问失败' }
        }
    },
    logout: () => {
        globalData.webdavClient = null
        globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '' }
    },
    getFileContents: async filename => {
        try {
            return await globalData.webdavClient.getFileContents(filename, { format: 'text' })
        } catch (err) {
            globalData.webdavClient = null
            globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '访问失败' }
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
            globalData.webdavClient = null
            globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '访问失败' }
        }
    },
    getFileBuffer: async filename => {
        try {
            return await globalData.webdavClient.getFileContents(filename, { format: 'binary' })
        } catch (err) {
            globalData.webdavClient = null
            globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '访问失败' }
        }
    }
}
