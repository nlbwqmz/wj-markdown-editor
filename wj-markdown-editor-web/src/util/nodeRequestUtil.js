import store from '@/store'

export default {
  getFileContent: id => {
    return window.node.getFileContent(id)
  },
  onContentChange: (content, id) => {
    window.node.onContentChange(content, id)
  },
  uploadImage: obj => {
    return window.node.uploadImage(obj)
  },
  saveToOther: () => {
    window.node.saveToOther(store.state.id)
  },
  getConfig: () => {
    return window.node.getConfig()
  },
  openSettingWin: () => {
    window.node.openSettingWin()
  },
  settingWinMinimize: () => {
    window.node.settingWinMinimize()
  },
  closeSettingWin: () => {
    window.node.closeSettingWin()
  },
  updateConfig: config => {
    window.node.updateConfig(config)
  },
  openDirSelect: () => {
    return window.node.openDirSelect()
  },
  exportPdf: () => {
    window.node.exportPdf()
  },
  closeExportWin: () => {
    window.node.closeExportWin()
  },
  findInPage: (searchContent) => {
    window.node.findInPage(searchContent)
  },
  findInPageNext: (searchContent, forward) => {
    window.node.findInPageNext(searchContent, forward)
  },
  stopFindInPage: () => {
    window.node.stopFindInPage()
  },
  toggleSearchBar: () => {
    window.node.toggleSearchBar()
  },
  screenshot: (id, hide) => {
    window.node.screenshot(id, hide)
  },
  action: type => {
    window.node.action(type)
  },
  restoreDefaultSetting: () => {
    window.node.restoreDefaultSetting()
  },
  openAboutWin: () => {
    window.node.openAboutWin()
  },
  closeAboutWin: () => {
    window.node.closeAboutWin()
  },
  checkUpdate: () => {
    window.node.checkUpdate()
  },
  executeDownload: () => {
    window.node.executeDownload()
  },
  cancelDownload: () => {
    window.node.cancelDownload()
  },
  executeUpdate: () => {
    window.node.executeUpdate()
  },
  exportSetting: () => {
    window.node.exportSetting()
  },
  importSetting: () => {
    window.node.importSetting()
  },
  newFile: () => {
    window.node.newFile()
  },
  closeFile: id => {
    return window.node.closeFile(id)
  },
  closeFileAndSave: id => {
    return window.node.closeFileAndSave(id)
  },
  saveFile: (type, currentWebdavPath) => {
    window.node.saveFile(type, currentWebdavPath)
  },
  updateActiveFileId: id => {
    window.node.updateActiveFileId(id)
  },
  openFolder: id => {
    window.node.openFolder(id)
  },
  loginWebdav: data => {
    window.node.loginWebdav(data)
  },
  webdavGetDirectoryContents: path => {
    return window.node.webdavGetDirectoryContents(path)
  },
  webdavLogout: () => {
    window.node.webdavLogout()
  },
  openWebdavMd: (filename, basename) => {
    window.node.openWebdavMd(filename, basename)
  },
  getLoginInfo: () => {
    return window.node.getLoginInfo()
  },
  getFileStateList: () => {
    return window.node.getFileStateList()
  },
  checkAutoLogin: () => {
    window.node.checkAutoLogin()
  }
}
