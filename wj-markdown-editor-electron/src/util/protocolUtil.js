import {protocol, net} from "electron"
import path from 'path'
import globalData from './globalData.js'
import webdavUtil from "./webdavUtil.js";
import fs from "fs";
import pathUtil from "./pathUtil.js";
import idUtil from "./idUtil.js";
import fileState from "../runtime/fileState.js";
export default {
    handleProtocol: () => {
        protocol.handle('wj', async (request) => {
            const url = decodeURIComponent(request.url.slice('wj:///'.length));
            if (path.isAbsolute(url)) {
                return net.fetch('file:///' + url)
            } else {
                const fileStateItem = fileState.getById(globalData.activeFileId)
                if(fileStateItem.type === 'local') {
                    if(fileStateItem && fileStateItem.originFilePath){
                        return net.fetch('file:///' + path.resolve(path.dirname(fileStateItem.originFilePath), url))
                    }
                } else if (fileStateItem.type === 'webdav') {
                    const tempPath = pathUtil.getTempPath()
                    const newFilePath = path.resolve(tempPath, idUtil.createId() + path.extname(url));
                    const buffer = await webdavUtil.getFileBuffer(path.join(path.dirname(fileStateItem.originFilePath), url).replaceAll('\\', '/'));
                    fs.writeFileSync(newFilePath,  buffer)
                    return net.fetch('file:///' + newFilePath)
                }
            }
        })
    }
}
