import { app, Menu, protocol, shell } from 'electron'
import configUtil from './data/configUtil.js'
import recent from './data/recent.js'
import { handleSecondInstanceOpenRequest, handleStartupOpenRequest } from './util/appOpenRequestUtil.js'
import sendUtil from './util/channel/sendUtil.js'
import { isMarkdownFilePath } from './util/document-session/documentOpenTargetUtil.js'
import { initializeDocumentSessionRuntime } from './util/document-session/documentSessionRuntime.js'
import { createDocumentSessionRuntimeComposition } from './util/document-session/documentSessionRuntimeComposition.js'
import windowLifecycleService from './util/document-session/windowLifecycleService.js'
import { createWindowRegistry } from './util/document-session/windowRegistry.js'
import logUtil from './util/logUtil.js'
import protocolUtil from './util/protocolUtil.js'
import updateUtil from './util/updateUtil.js'
import aboutUtil from './util/win/aboutUtil.js'
import exportUtil from './util/win/exportUtil.js'
import guideUtil from './util/win/guideUtil.js'
import screenshotsUtil from './util/win/screenshotsUtil.js'
import settingUtil from './util/win/settingUtil.js'
import './util/channel/ipcMainUtil.js'

app.commandLine.appendSwitch('--disable-http-cache')
/**
 * 配置应用级 GPU 行为。
 *
 * 如果 windows 系统开启了 GPU渲染，当导出为图片时，在 Windows 机器上会触发 GPU 子进程崩溃，通过关闭硬件加速回退到软件渲染链路
 */
// app.disableHardwareAcceleration()

// 注册自定义协议特权（必须在 app.whenReady() 之前调用）
try {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'wj',
      privileges: {
        standard: true, // 标准 URL 行为
        secure: true, // HTTPS 级别安全
        supportFetchAPI: true, // 支持 Fetch API
        corsEnabled: false, // 禁用 CORS
        bypassCSP: false, // 不绕过 CSP
        stream: true, // 支持流式传输（Range 请求）
      },
    },
  ])
} catch (error) {
  console.error('[Protocol] CRITICAL: Failed to register wj:// protocol privileges')
  console.error('[Protocol] Error details:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
  })
  console.error('[Protocol] Application may not function correctly without protocol registration')
  // 不阻止应用启动，但记录严重错误
}

/**
 * 是否通过文件打开
 */
function isOpenOnFile() {
  return Boolean(process.argv && process.argv.length > 0 && isMarkdownFilePath(process.argv[process.argv.length - 1]))
}

/**
 * 如果通过打开 获取文件路径
 */
function getOpenOnFilePath() {
  return isOpenOnFile() ? process.argv[process.argv.length - 1] : null
}

let documentSessionRuntime = null
const windowRegistry = createWindowRegistry()

windowLifecycleService.configure({
  registry: windowRegistry,
})

function initializeAppDocumentSessionRuntime() {
  if (documentSessionRuntime) {
    return documentSessionRuntime
  }

  documentSessionRuntime = initializeDocumentSessionRuntime({
    ...createDocumentSessionRuntimeComposition({
      registry: windowRegistry,
      getConfig: () => configUtil.getConfig(),
      recentStore: recent,
      sendToRenderer: (win, payload) => {
        sendUtil.send(win, payload)
      },
      showItemInFolder: shell.showItemInFolder,
    }),
    ...windowLifecycleService.getDocumentSessionRuntimeHostDeps(),
  })

  return documentSessionRuntime
}

const lock = app.requestSingleInstanceLock({
  filePath: getOpenOnFilePath(),
  // second-instance 打开相对路径时，首实例必须拿到发起实例自己的工作目录，
  // 才能把 `docs/demo.md` 这类路径解析到正确的绝对目标上。
  baseDir: process.cwd(),
})

if (!lock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    if (additionalData.filePath) {
      app.whenReady().then(async () => {
        const runtime = initializeAppDocumentSessionRuntime()
        await handleSecondInstanceOpenRequest({
          targetPath: additionalData.filePath,
          baseDir: additionalData.baseDir || workingDirectory || process.cwd(),
          openDocumentPath: (targetPath, options) => runtime.openDocumentPath(targetPath, options),
        })
      }).then(() => {})
      return
    }
    const activeWindow = windowLifecycleService.listWindows()[0] || null
    activeWindow?.show?.()
  })
  logUtil.init()
  app.whenReady().then(async () => {
    const runtime = initializeAppDocumentSessionRuntime()
    Menu.setApplicationMenu(null)
    await configUtil.initConfig((config) => {
      windowLifecycleService.listWindows().forEach((win) => {
        sendUtil.send(win, { event: 'update-config', data: config })
      })
      if (aboutUtil.get()) {
        sendUtil.send(aboutUtil.get(), { event: 'update-config', data: config })
      }
      if (exportUtil.get()) {
        sendUtil.send(exportUtil.get(), { event: 'update-config', data: config })
      }
      if (guideUtil.get()) {
        sendUtil.send(guideUtil.get(), { event: 'update-config', data: config })
      }
      if (settingUtil.get()) {
        sendUtil.send(settingUtil.get(), { event: 'update-config', data: config })
      }
    })
    await recent.initRecent(configUtil.getConfig().recentMax, (recentList) => {
      runtime.publishRecentListChanged(recentList)
    })

    // 初始化协议处理器，捕获可能的错误
    try {
      protocolUtil.handleProtocol()
    } catch (protocolError) {
      console.error('[Main] CRITICAL: Protocol handler initialization failed')
      console.error('[Main] Error:', protocolError)
      console.error('[Main] Local file access (images, videos, audio) will not work')
      console.error('[Main] Application will continue but with limited functionality')
      // 应用继续运行，但本地资源加载功能将不可用
    }

    const openOnFilePath = getOpenOnFilePath()
    if (openOnFilePath) {
      await handleStartupOpenRequest({
        targetPath: openOnFilePath,
        baseDir: process.cwd(),
        openDocumentPath: (targetPath, options) => runtime.openDocumentPath(targetPath, options),
        createDraftWindow: () => windowLifecycleService.createNew(null),
      })
    } else if (configUtil.getConfig().openRecent) {
      const recentList = recent.get()
      if (recentList && recentList.length > 0) {
        const openRecentResult = await runtime.openRecent(recentList[0].path, {
          trigger: 'startup',
        })
        if (openRecentResult?.ok !== true) {
          await windowLifecycleService.createNew(null)
        }
      } else {
        await windowLifecycleService.createNew(null)
      }
    } else {
      await windowLifecycleService.createNew(null)
    }
    screenshotsUtil.init()
    updateUtil.initUpdater(() => windowLifecycleService.listWindows())
  })
}
