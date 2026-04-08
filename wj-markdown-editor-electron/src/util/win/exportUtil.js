import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, clipboard, dialog, nativeImage } from 'electron'
import fs from 'fs-extra'
import configUtil from '../../data/configUtil.js'
import commonUtil from '../commonUtil.js'
import { captureExportImageBuffer } from './exportImageCaptureUtil.js'
import { createExportWindowOptions } from './exportWindowOptionsUtil.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let exportWin
let loadingKey
function createExportWin({ parentWindow, documentContext, type, target = 'file', notify }) {
  if (exportWin) {
    notify({ type: 'warning', content: 'message.exportingPleaseWait' })
    return
  }
  if (!documentContext.content) {
    notify({ type: 'warning', content: 'message.contentIsEmpty' })
    return
  }
  if (type === 'PDF' && target === 'clipboard') {
    notify({ type: 'error', content: 'message.exportFailed' })
    return
  }

  let filePath = null
  if (target === 'file') {
    filePath = dialog.showSaveDialogSync({
      title: `Export as ${type.toLowerCase()}`,
      defaultPath: documentContext.path ? path.basename(documentContext.path, path.extname(documentContext.path)) : '',
      filters: [
        { name: `${type.toLowerCase()} file`, extensions: [type.toLowerCase()] },
      ],
    })
    if (!filePath) {
      return
    }
  }

  loadingKey = commonUtil.createId()
  notify({ type: 'loading', content: 'message.exporting', duration: 0, key: loadingKey })
  exportWin = new BrowserWindow(createExportWindowOptions({
    parentWindow,
    preloadPath: path.resolve(__dirname, '../../preload.js'),
  }))

  const searchParams = new URLSearchParams({
    type,
    target,
  })
  if (filePath) {
    searchParams.set('filePath', filePath)
  }
  const search = searchParams.toString()

  if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
    exportWin.loadURL(`http://localhost:8080/#/export?${search}`).then(() => {
      // exportWin.webContents.openDevTools({ mode: 'undocked' })
    })
  } else {
    exportWin.loadFile(path.resolve(__dirname, '../../../web-dist/index.html'), { hash: 'export', search }).then(() => {})
  }
}

async function doExport({ data, notify }) {
  try {
    const target = data?.target || 'file'
    let buffer
    if (data.type === 'PNG' || data.type === 'JPEG') {
      const height = await exportWin.webContents.executeJavaScript(`document.documentElement.scrollHeight`)
      buffer = await captureExportImageBuffer({
        win: exportWin,
        type: data.type,
        contentHeight: height,
      })
      if (target === 'clipboard') {
        clipboard.writeImage(nativeImage.createFromBuffer(buffer))
      } else {
        await fs.writeFile(data.filePath, buffer)
      }
    } else if (data.type === 'PDF') {
      if (target !== 'file') {
        throw new Error(`Unsupported export target for PDF: ${target}`)
      }
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
      await fs.writeFile(data.filePath, buffer)
    } else {
      throw new Error(`Unsupported export type: ${data?.type}`)
    }
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
