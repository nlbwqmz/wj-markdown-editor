import {Cron} from "croner";
import fs from "fs";
import {Notification} from "electron";
import config, {configWatch} from "../local/config.js";
import globalData from "./globalData.js";
import path from "path";
import {fileURLToPath} from "url";
import fileState from "../runtime/fileState.js";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let job
let jobRecentMinute = 0

const handleJob = minute => {
  if(jobRecentMinute !== minute){
    jobRecentMinute = minute
    if(job && !job.isStopped()) {
      job.stop()
    }
    if(minute > 0){
      job = Cron(`*/${minute} * * * *`, { paused: true, protect: true }, () => {
        // 不立即执行
        let has = false
        for (const item of fileState.get()) {
          if(item.originFilePath && !item.saved){
            if(item.type === 'local') {
              fs.writeFile(item.originFilePath, item.tempContent, () => {
                item.saved = true
                item.content = item.tempContent
              })
            } else if (item.type === 'webdav') {
              globalData.webdavClient.putFileContents(item.originFilePath, item.tempContent).then(() => {
                item.saved = true
                item.content = item.tempContent
              })
            }
            has = true
          }
        }
        if(has){
          new Notification({
            title: '消息',
            body: '自动保存成功',
            icon: path.resolve(__dirname, '../../icon/256x256.png'),
          }).show()
        }
      })
      job.resume()
    }
  }
}

const init = ()=> {
  handleJob(config.autoSave.minute)
  configWatch({
    nameList: ['autoSave'],
    handle: config => {
      handleJob(config.autoSave.minute)
    }
  })
}

init()
