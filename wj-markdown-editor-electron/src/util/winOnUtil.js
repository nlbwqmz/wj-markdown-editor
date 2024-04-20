import {shell, screen, BrowserWindow} from 'electron'
import config from "../local/config.js";

export default {
    handle: (browserWindow, searchBarWin, common, globalShortcutUtil, globalData) => {
        browserWindow.webContents.on('found-in-page', (event, result) => {
            searchBarWin.findInPageResult(result)
        })
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
            if(globalData.fileStateList.some(item => item.saved === false)){
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
            searchBarWin.moveSearchBar()
            if(size[0] <= screen.getPrimaryDisplay().workArea.width && size[1] <= screen.getPrimaryDisplay().workArea.height) {
                config.winWidth = size[0]
                config.winHeight = size[1]
            }
        })
        browserWindow.on('maximize', () => {
            browserWindow.webContents.send('showMaximizeAction', false)
            searchBarWin.moveSearchBar()
        })
        browserWindow.on('unmaximize', () => {
            browserWindow.webContents.send('showMaximizeAction', true)
            searchBarWin.moveSearchBar()
        })
        browserWindow.on('minimize', () => {
            searchBarWin.moveSearchBar()
        })
        browserWindow.on('blur', () => {
            globalShortcutUtil.unregister()
        })
        browserWindow.on('focus', () => {
            globalShortcutUtil.register()
        })
        browserWindow.on('move', () => {
            searchBarWin.moveSearchBar()
        })
        browserWindow.on('show', searchBarWin.show)
        browserWindow.on('hide', searchBarWin.hide)
    }
}


