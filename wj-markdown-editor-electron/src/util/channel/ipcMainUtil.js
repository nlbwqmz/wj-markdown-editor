import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import configUtil from '../../data/configUtil.js'
import recent from '../../data/recent.js'
import fileUploadUtil from '../fileUploadUtil.js'
import imgUtil from '../imgUtil.js'
import resourceFileUtil from '../resourceFileUtil.js'
import updateUtil from '../updateUtil.js'
import aboutUtil from '../win/aboutUtil.js'
import exportUtil from '../win/exportUtil.js'
import guideUtil from '../win/guideUtil.js'
import screenshotsUtil from '../win/screenshotsUtil.js'
import settingUtil from '../win/settingUtil.js'
import winInfoUtil from '../win/winInfoUtil.js'
import sendUtil from './sendUtil.js'

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

function toLegacyOpenFileResult(result) {
  // `open-file` 是旧 renderer 仍在使用的兼容 IPC。
  // 对缺失路径这类历史上依赖 `=== false` 的场景，这里必须回退成旧布尔语义；
  // 但新命令层/副作用层内部仍保留结构化结果，避免污染新契约。
  if (result?.ok === false && result?.reason === 'open-target-missing') {
    return false
  }
  return result
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
  'open-folder': async (winInfo, data) => {
    if (typeof data === 'string' || (data && typeof data === 'object' && typeof data.resourceUrl === 'string')) {
      const openResult = await resourceFileUtil.openLocalResourceInFolder(winInfo, data, shell.showItemInFolder)
      if (openResult.ok !== true) {
        const messageKey = resourceFileUtil.getLocalResourceFailureMessageKey(openResult.reason)
        if (messageKey) {
          sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: messageKey } })
        }
        return
      }
      if (openResult.opened !== true && openResult.reason === 'not-found') {
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: 'message.theFileDoesNotExist' } })
      }
      return
    }
    if (!winInfo.path || !winInfo.exists) {
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: 'message.theCurrentFileIsNotSaved' } })
      return
    }
    shell.showItemInFolder(winInfo.path)
  },
  'save-other': async winInfo => await winInfoUtil.executeCommand(winInfo, 'document.save-copy', null),
  'save': async winInfo => await winInfoUtil.executeCommand(winInfo, 'document.save', null),
  'get-file-info': (winInfo) => {
    return winInfoUtil.getFileInfoPayload(winInfo)
  },
  'document.get-session-snapshot': async (winInfo) => {
    return await winInfoUtil.executeCommand(winInfo, 'document.get-session-snapshot', null)
  },
  'file-content-update': (winInfo, content) => {
    // 渲染端所有编辑动作最终都收口到这里，
    // Electron 只认这一个入口来更新 tempContent。
    winInfoUtil.updateTempContent(winInfo, content)
  },
  'file-external-change-apply': (winInfo, data) => {
    // 提醒策略下，用户在 diff 弹窗中选择“应用”时走这里。
    // 具体应用动作由 Electron 主导完成，再通知渲染端刷新。
    return winInfoUtil.applyExternalPendingChange(winInfo, data?.version)
  },
  'file-external-change-ignore': (winInfo, data) => {
    // 提醒策略下，用户在 diff 弹窗中选择“忽略”时走这里。
    return winInfoUtil.ignoreExternalPendingChange(winInfo, data?.version)
  },
  'create-new': () => {
    winInfoUtil.createNew().then(() => {})
  },
  'open-file': async (winInfo, targetPath) => {
    if (targetPath) {
      const result = await winInfoUtil.executeCommand(winInfo, 'dialog.open-target-selected', {
        path: targetPath,
      })
      return toLegacyOpenFileResult(result)
    }
    return await winInfoUtil.executeCommand(winInfo, 'document.request-open-dialog', null)
  },
  'get-config': () => {
    return configUtil.getConfig()
  },
  'upload-image': async (winInfo, data) => {
    return await uploadImage(winInfo, data)
  },
  'delete-local-resource': async (winInfo, data) => {
    return await resourceFileUtil.deleteLocalResource(winInfo, data)
  },
  'get-local-resource-info': async (winInfo, data) => await winInfoUtil.executeCommand(winInfo, 'resource.get-info', data),
  'resource.get-info': async (winInfo, data) => await winInfoUtil.executeCommand(winInfo, 'resource.get-info', data),
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
    return await updateUtil.checkUpdate(winInfoUtil.getAll())
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
  'recent-clear': async winInfo => await winInfoUtil.executeCommand(winInfo, 'recent.clear', null),
  'recent.clear': async winInfo => await winInfoUtil.executeCommand(winInfo, 'recent.clear', null),
  'recent-remove': async (winInfo, data) => await winInfoUtil.executeCommand(winInfo, 'recent.remove', data),
  'recent.remove': async (winInfo, data) => await winInfoUtil.executeCommand(winInfo, 'recent.remove', data),
  'get-recent-list': async winInfo => await winInfoUtil.executeCommand(winInfo, 'recent.get-list', null),
  'recent.get-list': async winInfo => await winInfoUtil.executeCommand(winInfo, 'recent.get-list', null),
  'file-upload': (winInfo, filePath) => {
    return fileUploadUtil.save(winInfo, filePath, configUtil.getConfig())
  },
  'get-global-theme': () => {
    return configUtil.getConfig().theme.global
  },
  'resource.get-comparable-key': async (winInfo, rawPath) => {
    return await winInfoUtil.executeCommand(winInfo, 'resource.get-comparable-key', rawPath)
  },
}

const handlerListSync = {
  'convert-to-absolute-path': (winInfo, filePath) => {
    if (path.isAbsolute(filePath)) {
      return filePath
    }
    if (winInfo.path) {
      return path.resolve(path.dirname(winInfo.path), filePath)
    }
    return null
  },
  'get-local-resource-comparable-key': (winInfo, rawPath) => {
    return resourceFileUtil.getLocalResourceComparableKey(winInfo, rawPath)
  },
  // 新旧契约在 Task 4 期间并存：
  // 旧 renderer 仍然通过 `get-local-resource-comparable-key` 走同步查询，
  // 新契约 `resource.get-comparable-key` 也必须继续保持同步语义，
  // 否则后续 renderer 迁移时会把当前依赖同步比较 key 的资源逻辑整体拖成异步。
  'resource.get-comparable-key': (winInfo, rawPath) => {
    return resourceFileUtil.getLocalResourceComparableKey(winInfo, rawPath)
  },
}

ipcMain.handle('sendToMain', async (event, json) => {
  if (handlerList[json.event]) {
    const win = BrowserWindow.fromWebContents(event.sender)
    return await handlerList[json.event](winInfoUtil.getWinInfo(win) || winInfoUtil.getWinInfo(win.getParentWindow()), json.data)
  }
  return false
})

ipcMain.on('sendToMainSync', (event, json) => {
  if (handlerListSync[json.event]) {
    const win = BrowserWindow.fromWebContents(event.sender)
    event.returnValue = handlerListSync[json.event](winInfoUtil.getWinInfo(win) || winInfoUtil.getWinInfo(win.getParentWindow()), json.data)
    return
  }
  event.returnValue = null
})
