/**
 * 生成导出窗口的固定配置。
 *
 * 导出窗口会长期保持隐藏状态，因此需要显式关闭后台节流，
 * 避免隐藏页截图时拿到空白帧。
 *
 * @param {{
 *   parentWindow: Electron.BrowserWindow,
 *   preloadPath: string,
 * }} options
 * @returns {Electron.BrowserWindowConstructorOptions} 返回导出窗口构造参数
 */
export function createExportWindowOptions(options) {
  const {
    parentWindow,
    preloadPath,
  } = options

  return {
    width: 794,
    frame: false,
    modal: false,
    maximizable: false,
    resizable: false,
    parent: parentWindow,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: preloadPath,
      backgroundThrottling: false,
    },
  }
}

export default {
  createExportWindowOptions,
}
