import {protocol, net} from "electron"
import path from 'path'
import globalData from './globalData.js'
import webdavUtil from "./webdavUtil.js";
import common from "./common.js";
import fs from "fs";
import pathUtil from "./pathUtil.js";
export default {
    handleProtocol: () => {
        protocol.handle('wj', async (request) => {
            const url = decodeURIComponent(request.url.slice('wj:///'.length));
            if (path.isAbsolute(url)) {
                return net.fetch('file:///' + url)
            } else {
                const fileState = globalData.fileStateList.find(item => item.id === globalData.activeFileId)
                if(fileState.type === 'local') {
                    if(fileState && fileState.originFilePath){
                        return net.fetch('file:///' + path.resolve(path.dirname(fileState.originFilePath), url))
                    }
                } else if (fileState.type === 'webdav') {
                    const tempPath = pathUtil.getTempPath()
                    const newFilePath = path.resolve(tempPath, common.getUUID() + path.extname(url));
                    const buffer = await webdavUtil.getFileBuffer(path.join(path.dirname(fileState.originFilePath), url).replaceAll('\\', '/'));
                    fs.writeFileSync(newFilePath,  buffer)
                    return net.fetch('file:///' + newFilePath)
                }
            }
        })
    }
}
