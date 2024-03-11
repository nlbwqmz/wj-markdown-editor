const {protocol, net} = require("electron")
const path = require('path')
const globalData = require('./globalData')
module.exports = {
    handleProtocol: () => {
        protocol.handle('wj', (request) => {
            const url = decodeURIComponent(request.url.slice('wj:///'.length));
            if (path.isAbsolute(url)) {
                return net.fetch('file:///' + url)
            } else {
                const fileState = globalData.fileStateList.find(item => item.id === globalData.activeFileId)
                if(fileState && fileState.originFilePath){
                    return net.fetch('file:///' + path.resolve(path.dirname(fileState.originFilePath), url))
                }
            }
        })
    }
}
