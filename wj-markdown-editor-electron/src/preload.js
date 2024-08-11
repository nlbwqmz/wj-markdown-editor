const { contextBridge, ipcRenderer } = require('electron')

// 主进程调用渲染进程
const mainToShow = {
  // 控制工具栏显示
  showPin: (callback) => ipcRenderer.on('showPin', (_event, value) => callback(value)),
  // 获取内容
  getContent: (callback) => ipcRenderer.on('getContent', (_event, isExit) => callback(isExit)),
  showMessage: (callback) => ipcRenderer.on('showMessage', (_event, content, type, duration, destroyBefore) => callback(content, type, duration, destroyBefore)),
  toggleView: (callback) => ipcRenderer.on('toggleView', (_event) => callback()),
  shouldUpdateConfig: (callback) => ipcRenderer.on('shouldUpdateConfig', (_event, config) => callback(config)),
  insertScreenshotResult: callback => ipcRenderer.on('insertScreenshotResult', (_event, result) => callback(result)),
  showMaximizeAction: callback => ipcRenderer.on('showMaximizeAction', (_event, bool) => callback(bool)),
  closeMessage: callback => ipcRenderer.on('closeMessage', _event => callback()),
  messageToAbout: callback => ipcRenderer.on('messageToAbout', (_event, result) => callback(result)),
  updaterDownloadProgress: callback => ipcRenderer.on('updaterDownloadProgress', (_event, progress) => callback(progress)),
  downloadFinish: callback => ipcRenderer.on('downloadFinish', (_event) => callback()),
  updateFileStateList: callback => ipcRenderer.on('updateFileStateList', (_event, fileStateList) => callback(fileStateList)),
  changeTab: callback => ipcRenderer.on('changeTab', (_event, id) => callback(id)),
  noticeToSave: callback => ipcRenderer.on('noticeToSave', (_event, data) => callback(data)),
  loginState: callback => ipcRenderer.on('loginState', (_event, webdavLoginState) => callback(webdavLoginState)),
  hasNewVersion: callback => ipcRenderer.on('hasNewVersion', (_event) => callback()),
  openWebdavPath: callback => ipcRenderer.on('openWebdavPath', (_event, p) => callback(p)),
  confirmExit: callback => ipcRenderer.on('confirmExit', (_event) => callback())
}

// 渲染进程调用主进程
const showToMain = {
  // 获取文件信息
  getFileContent: id => ipcRenderer.invoke('getFileContent', id),
  uploadImage: files => ipcRenderer.send('uploadImage', files),
  // 检查是否保存
  onContentChange: (content, id) => ipcRenderer.send('onContentChange', content, id),
  saveToOther: id => ipcRenderer.send('saveToOther', id),
  getConfig: () => ipcRenderer.invoke('getConfig'),
  openSettingWin: () => ipcRenderer.send('openSettingWin'),
  settingWinMinimize: () => ipcRenderer.send('settingWinMinimize'),
  closeSettingWin: () => ipcRenderer.send('closeSettingWin'),
  updateConfig: config => ipcRenderer.send('updateConfig', config),
  openDirSelect: () => ipcRenderer.invoke('openDirSelect'),
  generateDocxTemplate: () => ipcRenderer.send('generateDocxTemplate'),
  findInPage: (searchContent) => ipcRenderer.send('findInPage', searchContent),
  findInPageNext: (searchContent, forward) => ipcRenderer.send('findInPageNext', searchContent, forward),
  stopFindInPage: () => ipcRenderer.send('stopFindInPage'),
  screenshot: (id, hide) => ipcRenderer.send('screenshot', id, hide),
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
  closeFile: id => ipcRenderer.send('closeFile', id),
  saveFile: data => ipcRenderer.send('saveFile', data),
  updateActiveFileId: id => ipcRenderer.send('updateActiveFileId', id),
  openFolder: id => ipcRenderer.send('openFolder', id),
  loginWebdav: data => ipcRenderer.send('loginWebdav', data),
  webdavGetDirectoryContents: currentPath => ipcRenderer.invoke('webdavGetDirectoryContents', currentPath),
  webdavLogout: () => ipcRenderer.send('webdavLogout'),
  openWebdavMd: (filename, basename) => ipcRenderer.send('openWebdavMd', filename, basename),
  getFileStateList: () => ipcRenderer.invoke('getFileStateList'),
  checkAutoLogin: () => ipcRenderer.send('checkAutoLogin'),
  exit: () => ipcRenderer.send('exit'),
  getCurrentVersion: () => ipcRenderer.invoke('getCurrentVersion'),
  openExportWin: type => ipcRenderer.send('openExportWin', type),
  executeConvertFile: (type, base64) => ipcRenderer.send('executeConvertFile', type, base64)
}

contextBridge.exposeInMainWorld('node', {
  ...showToMain,
  ...mainToShow
})
