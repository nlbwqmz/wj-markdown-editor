const { contextBridge, ipcRenderer, webUtils } = require('electron')

// 主进程调用渲染进程
const mainToShow = {
  sendToShow: callback => ipcRenderer.on('sendToShow', (_event, json) => callback(json)),
}

// 渲染进程调用主进程
const showToMain = {
  sendToMain: json => ipcRenderer.invoke('sendToMain', json),
  // 只能在渲染进程中使用 通过web端file对象获取绝对路径
  getWebFilePath: file => webUtils.getPathForFile(file),
}

contextBridge.exposeInMainWorld('node', {
  ...showToMain,
  ...mainToShow,
})
