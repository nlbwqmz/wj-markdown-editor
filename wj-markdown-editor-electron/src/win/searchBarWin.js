import {fileURLToPath} from "url";
import path from "path";
import {BrowserWindow} from "electron";
import constant from "../constant/constant.js";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let searchBar
const execute = func => {
    if(searchBar && !searchBar.isDestroyed()){
        func && func()
    }
}
export default {
    toggleSearchBar: parent => {
        if (searchBar && !searchBar.isDestroyed() && searchBar.isVisible()) {
            parent.webContents.stopFindInPage('clearSelection')
            searchBar.close()
            return
        }
        searchBar = new BrowserWindow({
            width: 350,
            height: 60,
            parent: parent,
            frame: false,
            modal: false,
            maximizable: false,
            resizable: false,
            show: false,
            webPreferences: {
                preload: path.resolve(__dirname, '../preload.js')
            }
        })
        searchBar.once('ready-to-show', () => {
            const size = parent.getSize();
            const position = parent.getPosition();
            searchBar.setPosition(position[0] + size[0] - searchBar.getSize()[0] - 80, position[1] + 80)
            searchBar.show()
        })
        if (process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'dev') {
            searchBar.loadURL('http://localhost:8080/#/' + constant.router.searchBar).then(() => {
            })
        } else {
            searchBar.loadFile(path.resolve(__dirname, '../../web-dist/index.html'), {hash: constant.router.searchBar}).then(() => {})
        }
    },
    moveSearchBar: () => {
        execute(() => {
            const size = searchBar.getParentWindow().getSize();
            const position = searchBar.getParentWindow().getPosition();
            searchBar.setPosition(position[0] + size[0] - searchBar.getSize()[0] - 80, position[1] + 80)
        })
    },
    hide: () => {
        execute(() => {
            searchBar.hide()
        })
    },
    show: () => {
        execute(() => {
            if(searchBar.isVisible() === false){
                searchBar.show()
            }
        })
    },
    findInPageResult: result => {
        execute(() => {
            searchBar.webContents.send('findInPageResult', result)
        })
    }
}
