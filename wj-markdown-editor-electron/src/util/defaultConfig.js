const pathUtil = require("./pathUtil")
module.exports = {
  // 初次进入的路由
  initRoute: 'edit',
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
  insertLocalImgType: '4',
  insertNetworkImgType: '4',
  insertPasteboardLocalImgType: '4',
  insertPasteboardNetworkImgType: '4',
  insertScreenshotImgType: '4',
  // 图片复制到指定路径
  imgSavePath: pathUtil.getDefaultImgSavePath(),
  // 是否最大化
  maximize: false,
  theme: 'default',
  previewTheme: 'default',
  codeTheme: 'atom',
  picGo: {
    host: '127.0.0.1',
    port: 36677
  },
  autoSave: {
    minute: 0
  }
}
