import { globalShortcut } from 'electron'

let screenshots
let initPromise
let onOk
let onAlways

function finish() {
  globalShortcut.unregister('esc')
  onAlways && onAlways()
}

/**
 * 懒加载截图模块：该依赖初始化成本较高（约 57ms），
 * 且只在用户触发截图时才需要，因此移出启动路径。
 */
function ensureScreenshots() {
  if (screenshots)
    return Promise.resolve(screenshots)
  if (!initPromise) {
    initPromise = import('electron-screenshots').then(({ default: Screenshots }) => {
      const instance = new Screenshots({ singleWindow: true })
      instance.on('cancel', (e) => {
        e.preventDefault()
      })
      instance.on('ok', (e, buffer, bounds) => {
        onOk && onOk(Buffer.from(buffer).toString('base64'), bounds)
        finish()
      })
      instance.on('afterSave', () => {
        finish()
      })
      screenshots = instance
      return instance
    })
  }
  return initPromise
}

export default {
  startCapture: async (ok, always) => {
    onOk = ok
    onAlways = always
    const instance = await ensureScreenshots()
    await instance.startCapture()
    globalShortcut.register('esc', () => {
      if (instance.$win?.isFocused()) {
        instance.endCapture().then(() => {
          finish()
        })
      }
    })
  },
}
