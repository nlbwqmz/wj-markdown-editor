import path from 'node:path'
import fs from 'fs-extra'
import sendUtil from './channel/sendUtil.js'
import commonUtil from './commonUtil.js'
import winInfoUtil from './win/winInfoUtil.js'

function getDocumentPath(winInfo) {
  return winInfoUtil.getDocumentContext(winInfo).path
}

function createLocalSavePath(winInfo, filePath, config) {
  const documentPath = getDocumentPath(winInfo)
  const uniqueFileName = commonUtil.createUniqueFileName(filePath)
  if (config.fileMode === '2') { // 绝对路径
    return path.resolve(config.fileAbsolutePath, uniqueFileName)
  }
  if (config.fileMode === '3') {
    return path.resolve(path.dirname(documentPath), path.basename(documentPath, path.extname(documentPath)), uniqueFileName)
  }
  if (config.fileMode === '4') {
    if (!config.fileRelativePath) {
      return path.resolve(path.dirname(documentPath), uniqueFileName)
    } else {
      return path.resolve(path.dirname(documentPath), commonUtil.removePathSplit(config.fileRelativePath), uniqueFileName)
    }
  }
  throw new Error('文件存储模式未知')
}

function check(winInfo, config) {
  const documentPath = getDocumentPath(winInfo)
  if (config.fileMode === '2' && !config.fileAbsolutePath) {
    sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: 'message.theAbsolutePathToSaveIsNotSet' } })
    return false
  }
  if (config.fileMode === '4' && !(config.fileRelativePath || '').trim()) {
    sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: 'message.theRelativePathToSaveIsNotSet' } })
    return false
  }
  if ((config.fileMode === '3' || config.fileMode === '4') && !documentPath) {
    sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: 'message.cannotBeSavedToARelativePath' } })
    return false
  }
  return true
}

export default {
  save: async (winInfo, filePath, config) => {
    if (check(winInfo, config)) {
      if (!await fs.pathExists(filePath)) {
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: 'message.theFileDoesNotExist' } })
        return null
      }
      const loadingKey = commonUtil.createId()
      try {
        const documentPath = getDocumentPath(winInfo)
        const savePath = createLocalSavePath(winInfo, filePath, config)
        await commonUtil.ensureDirSafe(path.dirname(savePath))
        // 消息Key
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'loading', content: 'message.theFileIsBeingSaved', duration: 0, key: loadingKey } })
        await fs.copyFile(filePath, savePath)
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'success', content: 'message.theFileIsSavedSuccessfully', duration: 3, key: loadingKey } })
        // 保存带绝对路径
        if (config.fileMode === '2') {
          return { name: path.basename(filePath), path: savePath }
        }

        // 保存到文件名路径
        if (config.fileMode === '3') {
          return { name: path.basename(filePath), path: `${path.basename(documentPath, path.extname(documentPath))}/${path.basename(savePath)}` }
        }

        // 保存到相对路径
        if (config.fileMode === '4') {
          const normalizedRelativePath = commonUtil.removePathSplit(config.fileRelativePath || '')
          if (normalizedRelativePath) {
            return { name: path.basename(filePath), path: `${normalizedRelativePath}/${path.basename(savePath)}` }
          }
          return { name: path.basename(filePath), path: path.basename(savePath) }
        }
      } catch (e) {
        console.error(e)
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'error', content: `File save failed, error message: ${e.message}`, duration: 3, key: loadingKey } })
      }
    }
  },
}
