import { createClient } from "webdav"
import globalData from "./globalData.js";
import path from "path";
let client
export default {
    login: data => {
        client = createClient(data.url, {
            username: data.username,
            password: data.password
        })
        client.getDirectoryContents('/').then(res => {
            globalData.webdavLoginState = { webdavLogin: true, loginErrorMessage: '' }
        }).catch(() => {
            client = null
            globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '登录失败' }
        })
    },
    getDirectoryContents: async currentPath => {
        try{
            return await client.getDirectoryContents(currentPath)
        } catch (err) {
            client = null
            globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '访问失败' }
        }
    },
    logout: () => {
        client = null
        globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '' }
    },
    getFileContents: async filename => {
        try {
            return await client.getFileContents(filename, { format: 'text' })
        } catch (err) {
            client = null
            globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '访问失败' }
        }
    },
    putFileContents: async (filename, content) => {
        try {
            filename = filename.replaceAll('\\', '/')
            if (await client.exists(path.dirname(filename)) === false) {
                await client.createDirectory(path.dirname(filename));
            }
            return await client.putFileContents(filename, content)
        } catch (err) {
            client = null
            globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '访问失败' }
        }
    },
    getFileBuffer: async filename => {
        try {
            return await client.getFileContents(filename, { format: 'binary' })
        } catch (err) {
            client = null
            globalData.webdavLoginState = { webdavLogin: false, loginErrorMessage: '访问失败' }
        }
    }
}
