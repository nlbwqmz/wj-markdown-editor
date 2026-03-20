import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, dialog } from 'electron'
import fs from 'fs-extra'
import configUtil from '../../data/configUtil.js'
import commonUtil from '../commonUtil.js'
import { captureExportImageBuffer } from './exportImageCaptureUtil.js'
import { createExportWindowOptions } from './exportWindowOptionsUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let exportWin
let loadingKey
function createExportWin({ parentWindow, documentContext, type, notify }) {
  if (exportWin) {
    notify({ type: 'warning', content: 'message.exportingPleaseWait' })
    return
  }
  if (!documentContext.content) {
    notify({ type: 'warning', content: 'message.contentIsEmpty' })
    return
  }
  const filePath = dialog.showSaveDialogSync({
    title: `Export as ${type.toLowerCase()}`,
    defaultPath: documentContext.path ? path.basename(documentContext.path, path.extname(documentContext.path)) : '',
    filters: [
      { name: `${type.toLowerCase()} file`, extensions: [type.toLowerCase()] },
    ],
  })
  if (filePath) {
    loadingKey = commonUtil.createId()
    notify({ type: 'loading', content: 'message.exporting', duration: 0, key: loadingKey })
    exportWin = new BrowserWindow(createExportWindowOptions({
      parentWindow,
      preloadPath: path.resolve(__dirname, '../../preload.js'),
    }))
    if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
      exportWin.loadURL(`http://localhost:8080/#/export?type=${type}&filePath=${filePath}`).then(() => {
        // exportWin.webContents.openDevTools({ mode: 'undocked' })
      })
    } else {
      exportWin.loadFile(path.resolve(__dirname, '../../../web-dist/index.html'), { hash: 'export', search: `type=${type}&filePath=${filePath}` }).then(() => {})
    }
  }
}

async function doExport({ data, notify }) {
  try {
    let buffer
    if (data.type === 'PNG' || data.type === 'JPEG') {
      const height = await exportWin.webContents.executeJavaScript(`document.documentElement.scrollHeight`)
      buffer = await captureExportImageBuffer({
        win: exportWin,
        type: data.type,
        contentHeight: height,
      })
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
    notify({ type: 'success', content: 'message.exportSuccessfully', duration: 3, key: loadingKey })
  } catch (e) {
    console.error('导出失败', e)
    notify({ type: 'error', content: 'message.exportFailed', duration: 3, key: loadingKey })
  } finally {
    exportWin?.close()
    exportWin = undefined
    loadingKey = undefined
  }
}

export default {
  get: () => exportWin,
  createExportWin,
  doExport,
}
