import pathUtil from "../util/pathUtil.js"

const defaultConfig = {
  // 初次进入的路由
  initRoute: 'edit',
  minimizeToTray: false,
  // 预览页面内容宽度
  previewWidth: 80,
  // 窗口宽度
  winWidth: -1,
  // 窗口高度
  winHeight: -1,
  // 显示路由跳转按钮
  jumpRouterBtn: true,
  // 预览界面是否默认显示目录
  catalogShow: true,
  // 图片插入模式 1: 无操作 2: 复制到 ./%{filename} 文件夹 3: 复制到 ./assets 文件夹 4: 复制到指定文件夹 5: 上传
  insertLocalImgType: '2',
  insertNetworkImgType: '2',
  insertPasteboardLocalImgType: '2',
  insertPasteboardNetworkImgType: '2',
  insertScreenshotImgType: '2',
  // 图片复制到指定路径
  imgSavePath: pathUtil.getDefaultImgSavePath(),
  theme: 'default',
  previewTheme: 'default',
  codeTheme: 'atom',
  picGo: {
    host: '127.0.0.1',
    port: 36677
  },
  autoSave: {
    minute: 0
  },
  // 默认显示webdav
  showWebdav: true,
  watermark: {
    enabled: true,
    exportDate: true,
    exportDateFormat : 'YYYY-MM-DD',
    content: 'wj-markdown-editor',
    rotate: -22,
    gap: [100, 100],
    font: {
      color: '#5433334F',
      fontSize: 20,
      fontWeight: 800
    }
  },
  pandocPath: ''
}
export default {
  get: () => {
    return JSON.parse(JSON.stringify(defaultConfig))
  }
}
