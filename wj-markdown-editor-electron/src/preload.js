const { contextBridge, ipcRenderer } = require('electron')

// 主进程调用渲染进程
const mainToShow = {
  sendToShow: callback => ipcRenderer.on('sendToShow', (_event, json) => callback(json)),
}

// 渲染进程调用主进程
const showToMain = {
  sendToMain: json => ipcRenderer.invoke('sendToMain', json),
}

contextBridge.exposeInMainWorld('node', {
  ...showToMain,
  ...mainToShow,
})
