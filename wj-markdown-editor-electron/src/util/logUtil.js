import path from 'node:path'
import dayjs from 'dayjs'
import { app } from 'electron'
import log from 'electron-log'

export default {
  init: () => {
    // 日志文件大小 5MB
    log.transports.file.maxSize = 1048576 * 5
    Object.assign(console, log.functions)
    log.transports.file.resolvePathFn = () => path.join(app.getPath('documents'), `wj-markdown-editor/logs/${dayjs().format('YYYY-MM-DD')}/main.log`)
  },
}
