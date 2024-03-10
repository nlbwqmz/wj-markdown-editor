const { globalShortcut } = require('electron')
const common = require("./common");
const globalData = require('./globalData')

const shortcutList = [
    {
        accelerator: 'Ctrl+s',
        callback: () => {
            if(globalData.win.isFocused()){
                common.save(globalData.tempContent, false)
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
                common.saveToOther(globalData.tempContent)
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

module.exports = {
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

