import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import configUtil from '../../data/configUtil.js'
import recent from '../../data/recent.js'
import { getDocumentSessionRuntime } from '../document-session/documentSessionRuntime.js'
import windowLifecycleService from '../document-session/windowLifecycleService.js'
import fileUploadUtil from '../fileUploadUtil.js'
import imgUtil from '../imgUtil.js'
import resourceFileUtil from '../resourceFileUtil.js'
import updateUtil from '../updateUtil.js'
import aboutUtil from '../win/aboutUtil.js'
import exportUtil from '../win/exportUtil.js'
import guideUtil from '../win/guideUtil.js'
import screenshotsUtil from '../win/screenshotsUtil.js'
import settingUtil from '../win/settingUtil.js'

function executeRuntimeUiCommand(winInfo, command, payload) {
  return getDocumentSessionRuntime().executeUiCommand(winInfo?.id || winInfo?.win?.id || null, command, payload)
}

function executeRuntimeSyncQuery(winInfo, command, payload) {
  const windowId = winInfo?.id || winInfo?.win?.id || null
  if (windowId == null) {
    // 兼容旧同步查询语义：窗口上下文缺失时平稳返回空值，
    // 让 renderer 继续回退到 rawPath，而不是把异常抛回同步 IPC 调用栈。
    return null
  }
  return getDocumentSessionRuntime().executeSyncQuery(windowId, command, payload)
}

async function uploadImage(winInfo, data) {
  const config = configUtil.getConfig()
  if (!imgUtil.check(winInfo, data, config)) {
    return
  }
  data.name = data.name ? data.name : 'image.png'
  if (!path.extname(data.name)) {
    data.name += '.png'
  }
  return imgUtil.save(winInfo, data, config)
}

/**
 * 资源打开失败后，统一经由 session bridge 下发一次性提示。
 *
 * 路径解析、query/hash 回退和未保存文档判定都必须交给 documentResourceService，
 * IPC 层只负责把结构化结果翻译成当前 renderer 已收口的 `window.effect.message` 契约。
 */
async function handleResourceOpen(winInfo, data) {
  const openResult = await executeRuntimeUiCommand(winInfo, 'document.resource.open-in-folder', data)
  if (!openResult) {
    return openResult
  }

  if (openResult.ok !== true) {
    const messageKey = resourceFileUtil.getLocalResourceFailureMessageKey(openResult.reason)
    if (messageKey) {
      windowLifecycleService.publishWindowMessage(winInfo, {
        type: 'warning',
        content: messageKey,
      })
    }
    return openResult
  }

  if (openResult.opened !== true && openResult.reason === 'not-found') {
    windowLifecycleService.publishWindowMessage(winInfo, {
      type: 'warning',
      content: 'message.theFileDoesNotExist',
    })
  }
  return openResult
}

const handlerList = {
  ...settingUtil.channel,
  ...exportUtil.channel,
  ...aboutUtil.channel,
  ...guideUtil.channel,
  'open-dir-select': () => {
    const dirList = dialog.showOpenDialogSync({
      title: 'Select Folder',
      properties: ['openDirectory'],
    })
    return dirList && dirList.length > 0 ? dirList[0] : undefined
  },
  'minimize': (winInfo) => {
    winInfo.win.minimize()
  },
  'maximize': (winInfo) => {
    winInfo.win.maximize()
  },
  'restore': (winInfo) => {
    winInfo.win.restore()
  },
  'always-on-top': (winInfo, isAlwaysOnTop) => {
    winInfo.win.setAlwaysOnTop(isAlwaysOnTop)
  },
  'close': (winInfo) => {
    winInfo.win.close()
  },
  'force-close': (winInfo) => {
    winInfo.forceClose = true
    winInfo.win.close()
  },
  'document.open-in-folder': async (winInfo) => {
    const documentContext = windowLifecycleService.getDocumentContext(winInfo)
    if (!documentContext.path || !documentContext.exists) {
      return {
        ok: false,
        opened: false,
        reason: 'document-not-saved',
        path: null,
      }
    }
    shell.showItemInFolder(documentContext.path)
    return {
      ok: true,
      opened: true,
      reason: 'opened',
      path: documentContext.path,
    }
  },
  'document.resource.open-in-folder': async (winInfo, data) => await handleResourceOpen(winInfo, data),
  // renderer 已经切到新的 session 命令名，这里只保留直连入口。
  'document.save-copy': async winInfo => await executeRuntimeUiCommand(winInfo, 'document.save-copy', null),
  'document.save': async winInfo => await executeRuntimeUiCommand(winInfo, 'document.save', null),
  'document.get-session-snapshot': async (winInfo) => {
    return await executeRuntimeUiCommand(winInfo, 'document.get-session-snapshot', null)
  },
  'document.edit': async (winInfo, data) => await executeRuntimeUiCommand(winInfo, 'document.edit', data),
  'document.cancel-close': async winInfo => await executeRuntimeUiCommand(winInfo, 'document.cancel-close', null),
  'document.confirm-force-close': async winInfo => await executeRuntimeUiCommand(winInfo, 'document.confirm-force-close', null),
  'document.external.apply': async (winInfo, data) => await executeRuntimeUiCommand(winInfo, 'document.external.apply', data),
  'document.external.ignore': async (winInfo, data) => await executeRuntimeUiCommand(winInfo, 'document.external.ignore', data),
  'create-new': () => {
    windowLifecycleService.createNew().then(() => {})
  },
  'document.request-open-dialog': async (winInfo) => {
    return await executeRuntimeUiCommand(winInfo, 'document.request-open-dialog', null)
  },
  'document.open-path': async (winInfo, data) => {
    return await executeRuntimeUiCommand(winInfo, 'document.open-path', data)
  },
  'get-config': () => {
    return configUtil.getConfig()
  },
  'upload-image': async (winInfo, data) => {
    return await uploadImage(winInfo, data)
  },
  'document.resource.delete-local': async (winInfo, data) => await executeRuntimeUiCommand(winInfo, 'document.resource.delete-local', data),
  'resource.get-info': async (winInfo, data) => await executeRuntimeUiCommand(winInfo, 'resource.get-info', data),
  'screenshot': (winInfo, data) => {
    return new Promise((resolve) => {
      const startCapture = () => {
        return new Promise((resolveInner) => {
          screenshotsUtil.startCapture((base64) => {
            uploadImage(winInfo, { mode: 'local', base64, name: 'image.png' }).then((res) => {
              resolveInner(res)
            })
          }, () => {
            if (data.hide === true) {
              winInfo.win.show()
            }
          })
        })
      }
      if (data.hide === true) {
        winInfo.win.minimize()
        setTimeout(() => {
          startCapture().then((res) => {
            resolve(res)
          })
        }, 200)
      } else {
        startCapture().then((res) => {
          resolve(res)
        })
      }
    })
  },
  'user-update-config': async (winInfo, data) => {
    await configUtil.setConfig(data)
    await recent.setMax(data.recentMax)
  },
  'user-update-theme-global': async (winInfo, data) => {
    await configUtil.setThemeGlobal(data)
  },
  'user-update-language': async (winInfo, data) => {
    await configUtil.setLanguage(data)
  },
  'app-info': () => {
    return { name: 'wj-markdown-editor', version: app.getVersion() }
  },
  'get-default-config': () => {
    return configUtil.getDefaultConfig()
  },
  'get-app-info': () => {
    return { name: 'wj-markdown-editor', version: app.getVersion() }
  },
  'check-update': async () => {
    return await updateUtil.checkUpdate(windowLifecycleService.getAll())
  },
  'download-update': () => {
    updateUtil.downloadUpdate(aboutUtil.get())
  },
  'cancel-download-update': () => {
    updateUtil.cancelDownloadUpdate()
  },
  'execute-update': () => {
    updateUtil.executeUpdate()
  },
  'recent.clear': async winInfo => await executeRuntimeUiCommand(winInfo, 'recent.clear', null),
  'recent.remove': async (winInfo, data) => await executeRuntimeUiCommand(winInfo, 'recent.remove', data),
  'recent.get-list': async winInfo => await executeRuntimeUiCommand(winInfo, 'recent.get-list', null),
  'file-upload': (winInfo, filePath) => {
    return fileUploadUtil.save(winInfo, filePath, configUtil.getConfig())
  },
  'get-global-theme': () => {
    return configUtil.getConfig().theme.global
  },
}

const handlerListSync = {
  'convert-to-absolute-path': (winInfo, filePath) => {
    if (path.isAbsolute(filePath)) {
      return filePath
    }
    const documentContext = windowLifecycleService.getDocumentContext(winInfo)
    if (documentContext.path) {
      return path.resolve(path.dirname(documentContext.path), filePath)
    }
    return null
  },
  'resource.get-comparable-key': (winInfo, rawPath) => {
    return executeRuntimeSyncQuery(winInfo, 'resource.get-comparable-key', rawPath)
  },
}

ipcMain.handle('sendToMain', async (event, json) => {
  if (handlerList[json.event]) {
    const win = BrowserWindow.fromWebContents(event.sender)
    return await handlerList[json.event](windowLifecycleService.getWinInfo(win) || windowLifecycleService.getWinInfo(win.getParentWindow()), json.data)
  }
  return false
})

ipcMain.on('sendToMainSync', (event, json) => {
  if (handlerListSync[json.event]) {
    const win = BrowserWindow.fromWebContents(event.sender)
    event.returnValue = handlerListSync[json.event](windowLifecycleService.getWinInfo(win) || windowLifecycleService.getWinInfo(win.getParentWindow()), json.data)
    return
  }
  event.returnValue = null
})
