const { contextBridge, ipcRenderer  } = require('electron')

// 主进程调用渲染进程
const mainToShow = {
  // 控制工具栏显示
  showPin: (callback) => ipcRenderer.on('showPin', (_event, value) => callback(value)),
  // 获取内容
  getContent: (callback) => ipcRenderer.on('getContent', (_event, isExit) => callback(isExit)),
  showMessage: (callback) => ipcRenderer.on('showMessage', (_event, content, type, duration, destroyBefore) => callback(content, type, duration, destroyBefore)),
  toggleView: (callback) => ipcRenderer.on('toggleView', (_event) => callback()),
  shouldUpdateConfig: (callback) => ipcRenderer.on('shouldUpdateConfig', (_event, config) => callback(config)),
  findInPageResult: (callback) => ipcRenderer.on('findInPageResult', (_event, result) => callback(result)),
  insertScreenshotResult: callback => ipcRenderer.on('insertScreenshotResult', (_event, result) => callback(result)),
  showMaximizeAction: callback => ipcRenderer.on('showMaximizeAction', (_event, bool) => callback(bool)),
  refreshTitle: callback => ipcRenderer.on('refreshTitle', (_event, title) => callback(title)),
  closeMessage: callback => ipcRenderer.on('closeMessage', _event => callback()),
  messageToAbout: callback => ipcRenderer.on('messageToAbout', (_event, result) => callback(result)),
  updaterDownloadProgress: callback => ipcRenderer.on('updaterDownloadProgress', (_event, progress) => callback(progress)),
  downloadFinish: callback => ipcRenderer.on('downloadFinish', (_event) => callback()),
  updateFileStateList: callback => ipcRenderer.on('updateFileStateList', (_event, fileStateList) => callback(fileStateList)),
  changeTab: callback => ipcRenderer.on('changeTab', (_event, id) => callback(id))
}

//渲染进程调用主进程
const showToMain = {
  // 获取文件信息
  getFileContent: id => ipcRenderer.invoke('getFileContent', id),
  uploadImage: files => ipcRenderer.send('uploadImage', files),
  // 保存
  save: isExit => ipcRenderer.send('save', isExit),
  // 检查是否保存
  onContentChange: (content, id) => ipcRenderer.send('onContentChange', content, id),
  exit: () => ipcRenderer.send('exit'),
  saveToOther: () => ipcRenderer.send('saveToOther'),
  closeExitModal: () => ipcRenderer.send('closeExitModal'),
  getConfig: () => ipcRenderer.invoke('getConfig'),
  openSettingWin: () => ipcRenderer.send('openSettingWin'),
  settingWinMinimize: () => ipcRenderer.send('settingWinMinimize'),
  closeSettingWin: () => ipcRenderer.send('closeSettingWin'),
  updateConfig: config => ipcRenderer.send('updateConfig', config),
  openDirSelect: () => ipcRenderer.invoke('openDirSelect'),
  exportPdf: () => ipcRenderer.send('exportPdf'),
  closeExportWin: () => ipcRenderer.send('closeExportWin'),
  findInPage: (searchContent) => ipcRenderer.send('findInPage', searchContent),
  findInPageNext: (searchContent, forward) => ipcRenderer.send('findInPageNext', searchContent, forward),
  stopFindInPage: () => ipcRenderer.send('stopFindInPage'),
  toggleSearchBar: () => ipcRenderer.send('toggleSearchBar'),
  screenshot: hide => ipcRenderer.send('screenshot', hide),
  action: type => ipcRenderer.send('action', type),
  restoreDefaultSetting: () => ipcRenderer.send('restoreDefaultSetting'),
  openAboutWin: () => ipcRenderer.send('openAboutWin'),
  closeAboutWin: () => ipcRenderer.send('closeAboutWin'),
  checkUpdate: () => ipcRenderer.send('checkUpdate'),
  executeDownload: () => ipcRenderer.send('executeDownload'),
  cancelDownload: () => ipcRenderer.send('cancelDownload'),
  executeUpdate: () => ipcRenderer.send('executeUpdate'),
  exportSetting: () => ipcRenderer.send('exportSetting'),
  importSetting: () => ipcRenderer.send('importSetting'),
  newFile: () => ipcRenderer.send('newFile'),
  closeFile: id => ipcRenderer.invoke('closeFile', id),
  closeFileAndSave: id => ipcRenderer.invoke('closeFileAndSave', id)
}

contextBridge.exposeInMainWorld('node', {
  ...showToMain,
  ...mainToShow
})
