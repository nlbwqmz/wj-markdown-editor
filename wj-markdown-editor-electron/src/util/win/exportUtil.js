import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, dialog } from 'electron'
import fs from 'fs-extra'
import configUtil from '../../data/configUtil.js'
import sendUtil from '../channel/sendUtil.js'
import commonUtil from '../commonUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let exportWin
let loadingKey
function createExportWin(winInfo, type) {
  if (exportWin) {
    sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '正在导出请稍等' } })
    return
  }
  if (!winInfo.tempContent) {
    sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '内容为空' } })
    return
  }
  const filePath = dialog.showSaveDialogSync({
    title: `导出为${type.toLowerCase()}`,
    buttonLabel: '导出',
    defaultPath: winInfo.path ? path.basename(winInfo.path, path.extname(winInfo.path)) : '',
    filters: [
      { name: `${type.toLowerCase()}文件`, extensions: [type.toLowerCase()] },
    ],
  })
  if (filePath) {
    loadingKey = commonUtil.createId()
    sendUtil.send(winInfo.win, { event: 'message', data: { type: 'loading', content: '正在导出', duration: 0, key: loadingKey } })
    exportWin = new BrowserWindow({
      width: 794,
      frame: false,
      modal: false,
      maximizable: false,
      resizable: false,
      parent: winInfo.win,
      show: false,
      webPreferences: {
        preload: path.resolve(__dirname, '../../preload.js'),
      },
    })
    if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
      exportWin.loadURL(`http://localhost:8080/#/export?type=${type}&filePath=${filePath}`).then(() => {
        // exportWin.webContents.openDevTools({ mode: 'undocked' })
      })
    } else {
      exportWin.loadFile(path.resolve(__dirname, '../../../web-dist/index.html'), { hash: 'export', search: `type=${type}&filePath=${filePath}` }).then(() => {})
    }
  }
}

async function doExport(winInfo, data) {
  try {
    let buffer
    if (data.type === 'PNG' || data.type === 'JPEG') {
      const height = await exportWin.webContents.executeJavaScript(`document.documentElement.scrollHeight`)
      exportWin.setSize(exportWin.getSize()[0], height)
      // 等待调整布局
      await new Promise(resolve => setTimeout(resolve, 500))
      const image = await exportWin.webContents.capturePage()
      if (data.type === 'PNG') {
        buffer = image.toPNG()
      } else if (data.type === 'JPEG') {
        buffer = image.toJPEG(100)
      }
    } else if (data.type === 'PDF') {
      const config = configUtil.getConfig()
      const pageNumber = config.export.pdf.footer.pageNumber
      const footer = config.export.pdf.footer.content
      const header = config.export.pdf.header.content
      buffer = await exportWin.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        generateTaggedPDF: true,
        displayHeaderFooter: Boolean(pageNumber || footer || header),
        generateDocumentOutline: true,
        headerTemplate: `<div style="font-size: 12px; text-align: center; width: 100%">${header}</div>`,
        footerTemplate: `<div style="font-size: 12px; text-align: center; width: 100%">${pageNumber === true ? '第<span class="pageNumber"></span>页 共<span class="totalPages"></span>页 ' : ''}${footer}</div>`,
      })
    }
    await fs.writeFile(data.filePath, buffer)
    sendUtil.send(winInfo.win, { event: 'message', data: { type: 'success', content: '导出成功', duration: 3, key: loadingKey } })
  } catch (e) {
    console.error('导出失败', e)
    sendUtil.send(winInfo.win, { event: 'message', data: { type: 'error', content: '导出失败', duration: 3, key: loadingKey } })
  } finally {
    exportWin.close()
    exportWin = undefined
    loadingKey = undefined
  }
}

export default {
  get: () => exportWin,
  channel: {
    'export-start': createExportWin,
    'export-end': doExport,
  },
}
