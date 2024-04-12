import Screenshots  from "electron-screenshots"
import {globalShortcut} from "electron"
let screenshots
let onOk
let onAlways

const finish = () => {
    globalShortcut.unregister('esc')
    onAlways && onAlways()
}

export default {
    init: () => {
        screenshots = new Screenshots({ singleWindow: true});
        screenshots.on("cancel", (e) => {
            e.preventDefault();
        });
        screenshots.on("ok", (e, buffer, bounds) => {
            onOk && onOk(Buffer.from(buffer).toString('base64'), bounds);
            finish()
        });
        screenshots.on('afterSave', () => {
            finish()
        })
    },
    startCapture: (ok, always) => {
        onOk = ok
        onAlways = always
        screenshots.startCapture().then(() => {
            globalShortcut.register("esc", () => {
                if (screenshots.$win?.isFocused()) {
                    screenshots.endCapture().then(() => { finish() });
                }
            });
        })
    }
}
