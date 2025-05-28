import path from 'node:path'
import fs from 'fs-extra'
import sendUtil from './channel/sendUtil.js'
import commonUtil from './commonUtil.js'

function createLocalSavePath(winInfo, filePath, config) {
  const uniqueFileName = commonUtil.createUniqueFileName(filePath)
  if (config.fileMode === '2') { // 绝对路径
    return path.resolve(config.fileAbsolutePath, uniqueFileName)
  }
  if (config.fileMode === '3') {
    return path.resolve(path.dirname(winInfo.path), path.basename(winInfo.path, path.extname(winInfo.path)), uniqueFileName)
  }
  if (config.fileMode === '4') {
    if (!config.fileRelativePath) {
      return path.resolve(path.dirname(winInfo.path), uniqueFileName)
    } else {
      return path.resolve(path.dirname(winInfo.path), commonUtil.removePathSplit(config.fileRelativePath), uniqueFileName)
    }
  }
  throw new Error('文件存储模式未知')
}

function check(winInfo, config) {
  if (config.fileMode === '2' && !config.fileAbsolutePath) {
    sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '未设置文件绝对路径' } })
    return false
  }
  if ((config.fileMode === '3' || config.fileMode === '4') && !winInfo.path) {
    sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '当前文件未保存，不能将文件保存到相对路径' } })
    return false
  }
  return true
}

export default {
  save: async (winInfo, filePath, config) => {
    if (check(winInfo, config)) {
      if (!await fs.pathExists(filePath)) {
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '文件不存在' } })
        return null
      }
      const loadingKey = commonUtil.createId()
      try {
        const savePath = createLocalSavePath(winInfo, filePath, config)
        await fs.ensureDir(path.dirname(savePath))
        // 消息Key
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'loading', content: '正在保存文件', duration: 0, key: loadingKey } })
        await fs.copyFile(filePath, savePath)
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'success', content: '文件保存成功', duration: 3, key: loadingKey } })
        // 保存带绝对路径
        if (config.fileMode === '2') {
          return { name: path.basename(filePath), path: savePath }
        }

        // 保存到文件名路径
        if (config.fileMode === '3') {
          return { name: path.basename(filePath), path: `${path.basename(winInfo.path, path.extname(winInfo.path))}/${path.basename(savePath)}` }
        }

        // 保存到相对路径
        if (config.fileMode === '4') {
          if (config.imgRelativePath) {
            return { name: path.basename(filePath), path: `${config.fileRelativePath}/${path.basename(savePath)}` }
          } else {
            return { name: path.basename(filePath), path: path.basename(savePath) }
          }
        }
      } catch (e) {
        console.error(e)
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'error', content: `文件保存失败，错误信息：${e.message}`, duration: 3, key: loadingKey } })
      }
    }
  },
}
