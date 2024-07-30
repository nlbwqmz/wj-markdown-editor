import {BrowserWindow} from "electron";
import path from "path";
import constant from "../constant/constant.js";
import {fileURLToPath} from "url";
import config from "../local/config.js";
import util from "../util/util.js";
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
let exportWin
const obj = {
    open: (parent, id, type, exportSuccess, exportFail) => {
        exportWin = new BrowserWindow({
            width: 794,
            frame: false,
            modal: true,
            parent: parent,
            maximizable: false,
            resizable: false,
            show: false,
            webPreferences: {
                preload: path.resolve(__dirname, '../preload.js')
            }
        })
        exportWin.once('execute-export-pdf', () => {
            exportWin.webContents.printToPDF({
                pageSize: 'A4',
                printBackground: true,
                generateTaggedPDF: true,
                displayHeaderFooter: true,
                generateDocumentOutline: true,
                headerTemplate: '<span></span>',
                footerTemplate: '<div style="font-size: 12px; text-align: center; width: 100%">第<span class="pageNumber"></span>页 共<span class="totalPages"></span>页 文档由<a target="_blank" href="https://github.com/nlbwqmz/wj-markdown-editor">wj-markdown-editor</a>导出</div>'
            }).then(buffer => {
                exportWin.close()
                exportSuccess && exportSuccess(buffer)
            }).catch(() => {
                exportWin.close()
                exportFail && exportFail()
            })
        })
        exportWin.once('execute-export-img', base64 => {
            exportWin.close()
            exportSuccess && exportSuccess(Buffer.from(String(base64).split('base64,')[1], 'base64'))
        })
        if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
            exportWin.loadURL('http://localhost:8080/#/' + constant.router.export + '?id=' + id + '&type=' + type).then(() => {})
        } else {
            exportWin.loadFile(path.resolve(__dirname, '../../web-dist/index.html'), {
                hash: constant.router.export,
                search: 'id=' + id + '&type=' + type
            }).then(() => {})
        }
    },
    shouldUpdateConfig: config => {
        if(exportWin && !exportWin.isDestroyed()){
            exportWin.webContents.send('shouldUpdateConfig', config)
        }
    },
    emit: (eventName, ...args) => {
        if(exportWin && !exportWin.isDestroyed()) {
            exportWin.emit(eventName, ...args)
        }
    }
}

const init = () => {
    config.watch([], util.debounce(data => { obj.shouldUpdateConfig(data) }, 100) )
}

init()

export default obj
