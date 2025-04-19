import * as fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import configUtil from '../../data/configUtil.js'
import imgUtil from '../imgUtil.js'
import updateUtil from '../updateUtil.js'
import aboutUtil from '../win/aboutUtil.js'
import exportUtil from '../win/exportUtil.js'
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

const handlerList = {
  ...settingUtil.channel,
  ...exportUtil.channel,
  ...aboutUtil.channel,
  'open-dir-select': () => {
    const dirList = dialog.showOpenDialogSync({
      title: '选择文件夹',
      buttonLabel: '确认',
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
  'close': (winInfo) => {
    winInfo.win.close()
  },
  'force-close': (winInfo) => {
    winInfo.forceClose = true
    winInfo.win.close()
  },
  'open-folder': (winInfo, data) => {
    if (data && typeof data === 'string') {
      if (!data.startsWith('wj:///')) {
        return
      }
      const filePath = data.replace('wj:///', '')
      const isAbsolute = path.isAbsolute(filePath)
      if (!isAbsolute && !winInfo.path) {
        return // 如果是相对路径且 winInfo.path 为空，直接返回
      }
      const resolvedPath = isAbsolute ? filePath : path.resolve(path.dirname(winInfo.path), filePath)
      shell.showItemInFolder(resolvedPath)
      return
    }
    if (!winInfo.path) {
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '当前文件未保存' } })
      return
    }
    shell.showItemInFolder(winInfo.path)
  },
  'save-other': async (winInfo) => {
    const otherPath = dialog.showSaveDialogSync({
      title: '另存为',
      buttonLabel: '另存为',
      filters: [
        { name: 'markdown文件', extensions: ['md'] },
      ],
    })
    if (otherPath) {
      await fs.promises.writeFile(otherPath, winInfo.tempContent)
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'success', content: '另存为成功' } })
    } else {
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '已取消另存为' } })
    }
  },
  'save': async (winInfo) => {
    if (!winInfo.path) {
      winInfo.path = dialog.showSaveDialogSync({
        title: '保存',
        buttonLabel: '保存',
        filters: [
          { name: 'markdown文件', extensions: ['md'] },
        ],
      })
    }
    if (winInfo.path) {
      await fs.promises.writeFile(winInfo.path, winInfo.tempContent)
      winInfo.content = winInfo.tempContent
      sendUtil.send(winInfo.win, { event: 'save-success', data: {
        fileName: path.basename(winInfo.path),
        content: winInfo.content,
        saved: true,
      } })
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'success', content: '保存成功' } })
    } else {
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '已取消保存' } })
    }
  },
  'get-file-info': (winInfo) => {
    return {
      fileName: winInfo.path ? path.basename(winInfo.path) : 'Unnamed',
      content: winInfo.content,
      saved: winInfo.content === winInfo.tempContent,
    }
  },
  'file-content-update': (winInfo, content) => {
    winInfo.tempContent = content
    sendUtil.send(winInfo.win, { event: 'file-is-saved', data: winInfo.tempContent === winInfo.content })
  },
  'get-temp-content': (winInfo) => {
    return winInfo.tempContent
  },
  'create-new': () => {
    winInfoUtil.createNew().then(() => {})
  },
  'get-config': () => {
    return configUtil.getConfig()
  },
  'upload-image': async (winInfo, data) => {
    return await uploadImage(winInfo, data)
  },
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
}

ipcMain.handle('sendToMain', async (event, json) => {
  if (handlerList[json.event]) {
    const win = BrowserWindow.fromWebContents(event.sender)
    return await handlerList[json.event](winInfoUtil.getWinInfo(win) || winInfoUtil.getWinInfo(win.getParentWindow()), json.data)
  }
  return false
})
