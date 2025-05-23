import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs-extra'
import configUtil from '../../data/configUtil.js'
import recent from '../../data/recent.js'
import commonUtil from '../commonUtil.js'
import fileUploadUtil from '../fileUploadUtil.js'
import imgUtil from '../imgUtil.js'
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

const handlerList = {
  ...settingUtil.channel,
  ...exportUtil.channel,
  ...aboutUtil.channel,
  ...guideUtil.channel,
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
  'open-folder': (winInfo, data) => {
    if (data && typeof data === 'string') {
      if (!data.startsWith('wj:///')) {
        return
      }
      const filePath = decodeURIComponent(commonUtil.hexToString(data.replace('wj:///', '')))
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
    let otherPath = dialog.showSaveDialogSync({
      title: '另存为',
      buttonLabel: '另存为',
      filters: [
        { name: 'markdown文件', extensions: ['md'] },
      ],
    })
    if (otherPath) {
      // 自动添加后缀
      const extname = path.extname(otherPath)
      if (!extname || extname.toLowerCase() !== '.md') {
        otherPath += '.md'
      }
      await fs.writeFile(otherPath, winInfo.tempContent)
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
      // 自动添加后缀
      const extname = path.extname(winInfo.path)
      if (!extname || extname.toLowerCase() !== '.md') {
        winInfo.path += '.md'
      }
      await recent.add(winInfo.path)
      await fs.writeFile(winInfo.path, winInfo.tempContent)
      winInfo.content = winInfo.tempContent
      sendUtil.send(winInfo.win, { event: 'save-success', data: {
        fileName: path.basename(winInfo.path),
        saved: true,
      } })
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'success', content: '保存成功' } })
    } else {
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '已取消保存' } })
    }
  },
  'get-file-info': (winInfo) => {
    return {
      fileName: winInfo.path && winInfo.exists ? path.basename(winInfo.path) : 'Unnamed',
      content: winInfo.tempContent,
      saved: winInfo.content === winInfo.tempContent,
      path: winInfo.path,
      exists: winInfo.exists,
      isRecent: winInfo.isRecent,
    }
  },
  'file-content-update': (winInfo, content) => {
    winInfo.tempContent = content
    sendUtil.send(winInfo.win, { event: 'file-is-saved', data: winInfo.tempContent === winInfo.content })
  },
  'create-new': () => {
    winInfoUtil.createNew().then(() => {})
  },
  'open-file': async (winInfo, targetPath) => {
    if (targetPath) {
      if (await fs.pathExists(targetPath)) {
        winInfoUtil.createNew(targetPath).then(() => {
          if (!winInfo.path && winInfo.content === winInfo.tempContent) {
            winInfo.win.close()
          }
        })
        return true
      }
      return false
    } else {
      const filePath = dialog.showOpenDialogSync({
        title: '打开markdown文件',
        buttonLabel: '选择',
        properties: ['openFile'],
        filters: [
          { name: 'markdown文件', extensions: ['md'] },
        ],
      })
      if (filePath && filePath.length > 0) {
        if (path.extname(filePath[0]) === '.md') {
          winInfoUtil.createNew(filePath[0]).then(() => {
            if (!winInfo.path && winInfo.content === winInfo.tempContent) {
              winInfo.win.close()
            }
          })
        } else {
          sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '请选择markdown文件' } })
        }
      }
    }
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
    await recent.setMax(data.recentMax)
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
  'recent-clear': () => {
    recent.clear().then(() => {})
  },
  'recent-remove': (winInfo, data) => {
    recent.remove(data).then(() => {})
  },
  'get-recent-list': () => {
    return recent.get()
  },
  'file-upload': (winInfo, filePath) => {
    return fileUploadUtil.save(winInfo, filePath, configUtil.getConfig())
  },
}

ipcMain.handle('sendToMain', async (event, json) => {
  if (handlerList[json.event]) {
    const win = BrowserWindow.fromWebContents(event.sender)
    return await handlerList[json.event](winInfoUtil.getWinInfo(win) || winInfoUtil.getWinInfo(win.getParentWindow()), json.data)
  }
  return false
})
