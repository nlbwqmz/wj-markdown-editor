import { globalShortcut } from 'electron'
import common from "./common.js"
import globalData from './globalData.js'

const shortcutList = [
    {
        accelerator: 'Ctrl+s',
        callback: () => {
            if(globalData.win.isFocused()){
                globalData.win.webContents.send('noticeToSave')
            }
        }
    },
    {
        accelerator: 'Ctrl+Alt+s',
        callback: () => {
            if(globalData.win.isFocused()){
                common.openSettingWin()
            }
        }
    },
    {
        accelerator: 'Ctrl+Shift+s',
        callback: () => {
            if(globalData.win.isFocused()){
                common.saveToOther(globalData.activeFileId)
            }
        }
    },
    {
        accelerator: 'Ctrl+Shift+/',
        callback: () => {
            if(globalData.win.isFocused()){
                globalData.win.webContents.send('toggleView')
            }
        }
    },
    {
        accelerator: 'Ctrl+f',
        callback: () => {
            if(globalData.win.isFocused()){
                common.toggleSearchBar()
            }
        }
    },
    {
        accelerator: 'Ctrl+n',
        callback: () => {
            if(globalData.win.isFocused()){
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

