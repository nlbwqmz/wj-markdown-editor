import path from 'node:path'
import dayjs from 'dayjs'
import { app } from 'electron'
import log from 'electron-log'
import fs from 'fs-extra'

const logPath = path.join(app.getPath('documents'), 'wj-markdown-editor/logs')

/**
 * 清理日志
 */
async function cleanupOldLog(targetPath) {
  // 1. 检查路径是否存在
  if (!await fs.pathExists(targetPath)) {
    return
  }

  // 2. 读取目录内容
  const items = await fs.readdir(targetPath)

  for (const item of items) {
    const fullPath = path.join(targetPath, item)
    const stat = await fs.stat(fullPath)

    // 只处理目录
    if (!stat.isDirectory()) {
      continue
    }

    // 3. 检查目录名是否符合YYYY-MM-DD格式
    const isDateFolder = /^\d{4}-\d{2}-\d{2}$/.test(item)
    if (!isDateFolder) {
      continue
    }

    try {
      // 4. 验证是否为有效日期
      const folderDate = dayjs(item, 'YYYY-MM-DD')
      if (!folderDate.isValid()) {
        continue
      }

      // 5. 计算7天前的日期
      const sevenDaysAgo = dayjs().subtract(7, 'day').startOf('day')

      // 6. 删除超过7天的目录
      if (folderDate.isBefore(sevenDaysAgo)) {
        await fs.rm(fullPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 })
      }
    } catch (error) {
      console.error(`处理日志 ${fullPath} 时出错:`, error.message)
    }
  }
}

export default {
  init: () => {
    // 日志文件大小 5MB
    log.transports.file.maxSize = 1048576 * 5
    Object.assign(console, log.functions)
    log.transports.file.resolvePathFn = () => path.join(logPath, `${dayjs().format('YYYY-MM-DD')}/main.log`)
    // 清理日志
    cleanupOldLog(logPath).then(() => {})
  },
}
