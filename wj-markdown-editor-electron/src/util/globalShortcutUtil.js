import { globalShortcut } from 'electron'
import common from "./common.js"
import globalData from './globalData.js'
import settingWin from "../win/settingWin.js";
import win from "../win/win.js";

const shortcutList = [
    {
        accelerator: 'Ctrl+s',
        callback: () => {
            if(win.isFocused()){
                common.saveFile({ id: globalData.activeFileId })
            }
        }
    },
    {
        accelerator: 'Ctrl+Alt+s',
        callback: () => {
            if(win.isFocused()){
                settingWin.open()
            }
        }
    },
    {
        accelerator: 'Ctrl+Shift+s',
        callback: () => {
            if(win.isFocused()){
                common.saveToOther(globalData.activeFileId)
            }
        }
    },
    {
        accelerator: 'Ctrl+Shift+/',
        callback: () => {
            if(win.isFocused()){
                win.toggleView()
            }
        }
    },
    {
        accelerator: 'Ctrl+n',
        callback: () => {
            if(win.isFocused()){
                common.newFile()
            }
        }
    }
]

export default {
    register: () => {
        shortcutList.forEach(item => {
            globalShortcut.register(item.accelerator, item.callback)
        })
    },
    unregister: () => {
        shortcutList.forEach(item => {
            globalShortcut.unregister(item.accelerator)
        })
    }
}

