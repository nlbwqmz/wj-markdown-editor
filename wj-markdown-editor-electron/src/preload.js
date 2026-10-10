const { contextBridge, ipcRenderer, webUtils } = require('electron')

// 解析主进程通过 webPreferences.additionalArguments 传入的初始主题参数
// 仅识别 --wj-initial-theme=dark，其余情况一律回退为 light
const initialThemeArg = process.argv.find(arg => arg.startsWith('--wj-initial-theme='))
const initialTheme = initialThemeArg === '--wj-initial-theme=dark' ? 'dark' : 'light'

// 主进程调用渲染进程
const mainToShow = {
  sendToShow: callback => ipcRenderer.on('sendToShow', (_event, json) => callback(json)),
}

// 渲染进程调用主进程
const showToMain = {
  sendToMain: json => ipcRenderer.invoke('sendToMain', json),
  // 只能在渲染进程中使用 通过web端file对象获取绝对路径
  getWebFilePath: file => webUtils.getPathForFile(file),
  sendToMainSync: json => ipcRenderer.sendSync('sendToMainSync', json),
}

contextBridge.exposeInMainWorld('node', {
  ...showToMain,
  ...mainToShow,
  initialTheme,
})
