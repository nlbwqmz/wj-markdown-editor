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
import sendUtil from './sendUtil.js'

function executeRuntimeUiCommand(windowContext, command, payload) {
  return getDocumentSessionRuntime().executeUiCommand(windowContext?.windowId || null, command, payload)
}

function executeRuntimeSyncQuery(windowContext, command, payload) {
  const windowId = windowContext?.windowId || null
  if (windowId == null) {
    // 兼容旧同步查询语义：窗口上下文缺失时平稳返回空值，
    // 让 renderer 继续回退到 rawPath，而不是把异常抛回同步 IPC 调用栈。
    return null
  }
  return getDocumentSessionRuntime().executeSyncQuery(windowId, command, payload)
}

function getCurrentDocumentPath(windowContext) {
  return windowLifecycleService.getDocumentContext(windowContext?.windowId || null)?.path || null
}

function resolveWindowContextByBrowserWindow(win) {
  const windowId = windowLifecycleService.getWindowIdByWin(win)
  if (windowId) {
    return {
      windowId,
      win: windowLifecycleService.getWindowById(windowId) || win,
    }
  }

  const parentWin = win?.getParentWindow?.() || null
  const parentWindowId = windowLifecycleService.getWindowIdByWin(parentWin)
  if (parentWindowId) {
    return {
      windowId: parentWindowId,
      win: windowLifecycleService.getWindowById(parentWindowId) || parentWin,
    }
  }

  return {
    windowId: null,
    win: null,
  }
}

function resolveWindowContextFromSender(sender) {
  const win = BrowserWindow.fromWebContents(sender)
  return resolveWindowContextByBrowserWindow(win)
}

function createWindowMessageNotifier(win) {
  return (message) => {
    sendUtil.send(win, { event: 'message', data: message })
  }
}

async function uploadImage(windowContext, data) {
  const config = configUtil.getConfig()
  const documentPath = getCurrentDocumentPath(windowContext)
  const notify = createWindowMessageNotifier(windowContext.win)
  if (!imgUtil.check({
    win: windowContext.win,
    documentPath,
    data,
    config,
    notify,
  })) {
    return
  }
  data.name = data.name ? data.name : 'image.png'
  if (!path.extname(data.name)) {
    data.name += '.png'
  }
  return imgUtil.save({
    win: windowContext.win,
    documentPath,
    data,
    config,
    notify,
  })
}

/**
 * 资源打开失败后，统一经由 session bridge 下发一次性提示。
 *
 * 路径解析、query/hash 回退和未保存文档判定都必须交给 documentResourceService，
 * IPC 层只负责把结构化结果翻译成当前 renderer 已收口的 `window.effect.message` 契约。
 */
async function handleResourceOpen(windowContext, data) {
  const openResult = await executeRuntimeUiCommand(windowContext, 'document.resource.open-in-folder', data)
  if (!openResult) {
    return openResult
  }

  if (openResult.ok !== true) {
    const messageKey = resourceFileUtil.getLocalResourceFailureMessageKey(openResult.reason)
    if (messageKey) {
      windowLifecycleService.publishWindowMessage(windowContext.windowId, {
        type: 'warning',
        content: messageKey,
      })
    }
    return openResult
  }

  if (openResult.opened !== true && openResult.reason === 'not-found') {
    windowLifecycleService.publishWindowMessage(windowContext.windowId, {
      type: 'warning',
      content: 'message.theFileDoesNotExist',
    })
  }
  return openResult
}

/**
 * 配置类更新 IPC 统一透传结构化结果。
 */
async function executeConfigUpdate(updateAction) {
  const result = await updateAction()
  if (result?.ok !== true) {
    return result
  }

  return { ok: true }
}

const handlerList = {
  ...settingUtil.channel,
  ...aboutUtil.channel,
  ...guideUtil.channel,
  'export-start': (windowContext, type) => {
    return exportUtil.createExportWin({
      parentWindow: windowContext.win,
      documentContext: windowLifecycleService.getDocumentContext(windowContext.windowId),
      type,
      notify: createWindowMessageNotifier(windowContext.win),
    })
  },
  'export-end': (windowContext, data) => {
    return exportUtil.doExport({
      data,
      notify: createWindowMessageNotifier(windowContext.win),
    })
  },
  'open-dir-select': () => {
    const dirList = dialog.showOpenDialogSync({
      title: 'Select Folder',
      properties: ['openDirectory'],
    })
    return dirList && dirList.length > 0 ? dirList[0] : undefined
  },
  'minimize': (windowContext) => {
    windowContext.win.minimize()
  },
  'maximize': (windowContext) => {
    windowContext.win.maximize()
  },
  'restore': (windowContext) => {
    windowContext.win.restore()
  },
  'full-screen': (windowContext, flag) => {
    if (typeof flag !== 'boolean') {
      return
    }
    windowContext.win.setFullScreen(flag)
  },
  'always-on-top': (windowContext, isAlwaysOnTop) => {
    windowContext.win.setAlwaysOnTop(isAlwaysOnTop)
  },
  'close': (windowContext) => {
    windowContext.win.close()
  },
  'force-close': (windowContext) => {
    windowLifecycleService.requestForceClose(windowContext.windowId)
    windowContext.win.close()
  },
  'document.open-in-folder': async (windowContext) => {
    const documentContext = windowLifecycleService.getDocumentContext(windowContext.windowId)
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
  'document.resource.open-in-folder': async (windowContext, data) => await handleResourceOpen(windowContext, data),
  'document.resource.copy-absolute-path': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'document.resource.copy-absolute-path', data),
  'document.resource.copy-link': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'document.resource.copy-link', data),
  'document.resource.copy-image': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'document.resource.copy-image', data),
  'document.resource.save-as': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'document.resource.save-as', data),
  // renderer 已经切到新的 session 命令名，这里只保留直连入口。
  'document.save-copy': async windowContext => await executeRuntimeUiCommand(windowContext, 'document.save-copy', null),
  'document.save': async windowContext => await executeRuntimeUiCommand(windowContext, 'document.save', null),
  'document.get-session-snapshot': async (windowContext) => {
    return await executeRuntimeUiCommand(windowContext, 'document.get-session-snapshot', null)
  },
  'document.edit': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'document.edit', data),
  'document.cancel-close': async windowContext => await executeRuntimeUiCommand(windowContext, 'document.cancel-close', null),
  'document.confirm-force-close': async windowContext => await executeRuntimeUiCommand(windowContext, 'document.confirm-force-close', null),
  'document.external.apply': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'document.external.apply', data),
  'document.external.ignore': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'document.external.ignore', data),
  'create-new': () => {
    windowLifecycleService.createNew().then(() => {})
  },
  'document.request-open-dialog': async (windowContext) => {
    return await executeRuntimeUiCommand(windowContext, 'document.request-open-dialog', null)
  },
  'document.open-path': async (windowContext, data) => {
    return await executeRuntimeUiCommand(windowContext, 'document.open-path', data)
  },
  'get-config': () => {
    return configUtil.getConfig()
  },
  'upload-image': async (windowContext, data) => {
    return await uploadImage(windowContext, data)
  },
  'document.resource.delete-local': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'document.resource.delete-local', data),
  'resource.get-info': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'resource.get-info', data),
  'screenshot': (windowContext, data) => {
    return new Promise((resolve) => {
      const startCapture = () => {
        return new Promise((resolveInner) => {
          screenshotsUtil.startCapture((base64) => {
            uploadImage(windowContext, { mode: 'local', base64, name: 'image.png' }).then((res) => {
              resolveInner(res)
            })
          }, () => {
            if (data.hide === true) {
              windowContext.win.show()
            }
          })
        })
      }
      if (data.hide === true) {
        windowContext.win.minimize()
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
  'user-update-config': async (_windowContext, data) => {
    return await executeConfigUpdate(async () => await configUtil.setConfigWithRecentMax(data, recent))
  },
  'user-update-theme-global': async (_windowContext, data) => {
    return await executeConfigUpdate(async () => await configUtil.setThemeGlobal(data))
  },
  'user-update-language': async (_windowContext, data) => {
    return await executeConfigUpdate(async () => await configUtil.setLanguage(data))
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
    return await updateUtil.checkUpdate(windowLifecycleService.listWindows())
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
  'recent.clear': async windowContext => await executeRuntimeUiCommand(windowContext, 'recent.clear', null),
  'recent.remove': async (windowContext, data) => await executeRuntimeUiCommand(windowContext, 'recent.remove', data),
  'recent.get-list': async windowContext => await executeRuntimeUiCommand(windowContext, 'recent.get-list', null),
  'file-upload': (windowContext, filePath) => {
    return fileUploadUtil.save({
      win: windowContext.win,
      documentPath: getCurrentDocumentPath(windowContext),
      filePath,
      config: configUtil.getConfig(),
      notify: createWindowMessageNotifier(windowContext.win),
    })
  },
  'get-global-theme': () => {
    return configUtil.getConfig().theme.global
  },
}

const handlerListSync = {
  'convert-to-absolute-path': (windowContext, filePath) => {
    if (path.isAbsolute(filePath)) {
      return filePath
    }
    const documentContext = windowLifecycleService.getDocumentContext(windowContext.windowId)
    if (documentContext.path) {
      return path.resolve(path.dirname(documentContext.path), filePath)
    }
    return null
  },
  'resource.get-comparable-key': (windowContext, rawPath) => {
    return executeRuntimeSyncQuery(windowContext, 'resource.get-comparable-key', rawPath)
  },
}

ipcMain.handle('sendToMain', async (event, json) => {
  if (handlerList[json.event]) {
    return await handlerList[json.event](resolveWindowContextFromSender(event.sender), json.data)
  }
  return false
})

ipcMain.on('sendToMainSync', (event, json) => {
  if (handlerListSync[json.event]) {
    event.returnValue = handlerListSync[json.event](resolveWindowContextFromSender(event.sender), json.data)
    return
  }
  event.returnValue = null
})
