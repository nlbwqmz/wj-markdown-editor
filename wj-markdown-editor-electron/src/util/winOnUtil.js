import {shell, screen, BrowserWindow} from 'electron'
import config from "../local/config.js";
import fileState from "../runtime/fileState.js";

export default {
    handle: (browserWindow, common, globalShortcutUtil, globalData) => {
        // 通过默认浏览器打开链接
        browserWindow.webContents.setWindowOpenHandler(details => {
            shell.openExternal(details.url).then(() => {})
            return {action: 'deny'}
        })
        browserWindow.once('ready-to-show', () => {
            browserWindow.show()
            setTimeout(() => {
                common.autoCheckAppUpdate()
            }, 5000)
        })
        browserWindow.on('close', e => {
            e.preventDefault()
            if(fileState.some(item => item.saved === false)){
                common.winShow()
                browserWindow.webContents.send('confirmExit')
            } else {
                globalShortcutUtil.unregister()
                common.exit()
            }
        })
        browserWindow.on('will-resize', (event, newBounds ) => {
            if(newBounds.width < 850 || newBounds.height < 280){
                event.preventDefault()
            }
        })
        browserWindow.on('resize', () => {
            const size = browserWindow.getSize();
            config.data.win_width = size[0]
            config.data.win_height = size[1]

        })
        browserWindow.on('maximize', () => {
            browserWindow.webContents.send('showMaximizeAction', false)
        })
        browserWindow.on('unmaximize', () => {
            browserWindow.webContents.send('showMaximizeAction', true)
        })
        browserWindow.on('blur', () => {
            globalShortcutUtil.unregister()
        })
        browserWindow.on('focus', () => {
            globalShortcutUtil.register()
        })
    }
}


