import globalData from './globalData.js'
import { shell, screen} from 'electron'
import common from "./common.js"
import globalShortcutUtil from './globalShortcutUtil.js'
import webdavUtil from "./webdavUtil.js";
const debounce = (func, timeout = 300) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}
export default {
    handle: () => {
        // 通过默认浏览器打开链接
        globalData.win.webContents.setWindowOpenHandler(details => {
            shell.openExternal(details.url).then(() => {})
            return {action: 'deny'}
        })
        globalData.win.once('ready-to-show', () => {
            globalData.win.show()
            setTimeout(() => {
                common.autoCheckAppUpdate()
            }, 5000)
        })
        globalData.win.on('close', e => {
            e.preventDefault()
            globalShortcutUtil.unregister()
            common.exit()
        })
        globalData.win.on('will-resize', (event, newBounds ) => {
            if(newBounds.width < 850 || newBounds.height < 280){
                event.preventDefault()
            }
        })
        globalData.win.on('resize', debounce(() => {
            const size = globalData.win.getSize();
            common.moveSearchBar()
            if(size[0] <= screen.getPrimaryDisplay().workArea.width && size[1] <= screen.getPrimaryDisplay().workArea.height) {
                globalData.config = {
                    ...globalData.config,
                    winWidth: size[0],
                    winHeight: size[1],
                }
            }
        }))
        globalData.win.on('maximize', debounce(() => {
            globalData.win.webContents.send('showMaximizeAction', false)
            common.moveSearchBar()
        }))
        globalData.win.on('unmaximize', debounce(() => {
            globalData.win.webContents.send('showMaximizeAction', true)
            common.moveSearchBar()
        }))
        globalData.win.on('minimize', debounce(() => {
            common.moveSearchBar()
        }))
        globalData.win.on('blur', () => {
            globalShortcutUtil.unregister()
            common.toggleSearchBarTop(false)
        })
        globalData.win.on('focus', () => {
            globalShortcutUtil.register()
            common.toggleSearchBarTop(true)
        })
        globalData.win.on('move', () => {
            common.moveSearchBar()
        })
        globalData.win.on('show', common.moveSearchBar)
        globalData.win.on('hide', common.moveSearchBar)
    }
}


