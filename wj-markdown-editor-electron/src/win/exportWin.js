import {BrowserWindow} from "electron";
import path from "path";
import constant from "../util/constant.js";
import {fileURLToPath} from "url";
import {configWatch} from "../local/config.js";
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
let exportWin
const obj = {
    open: (parent, pdfPath, id, exportSuccess, exportFail) => {
        exportWin = new BrowserWindow({
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
        if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
            exportWin.loadURL('http://localhost:8080/#/' + constant.router.export + '?id=' + id).then(() => {})
        } else {
            exportWin.loadFile(path.resolve(__dirname, '../../web-dist/index.html'), {
                hash: constant.router.export,
                search: 'id=' + id
            }).then(() => {})
        }
    },
    shouldUpdateConfig: config => {
        if(exportWin && !exportWin.isDestroyed()){
            exportWin.webContents.send('shouldUpdateConfig', config)
        }
    },
    emit: eventName => {
        if(exportWin && !exportWin.isDestroyed()) {
            exportWin.emit(eventName)
        }
    }
}

const init = () => {
    configWatch({
        nameList: [],
        handle: config => {
            obj.shouldUpdateConfig(config)
        }
    })
}

init()

export default obj
