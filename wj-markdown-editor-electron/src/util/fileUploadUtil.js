import path from 'node:path'
import fs from 'fs-extra'
import commonUtil from './commonUtil.js'

function getDocumentPath(documentPath) {
  return documentPath || null
}

function createLocalSavePath(documentPath, filePath, config) {
  const currentDocumentPath = getDocumentPath(documentPath)
  const uniqueFileName = commonUtil.createUniqueFileName(filePath)
  if (config.fileMode === '2') { // 绝对路径
    return path.resolve(config.fileAbsolutePath, uniqueFileName)
  }
  if (config.fileMode === '3') {
    return path.resolve(path.dirname(currentDocumentPath), path.basename(currentDocumentPath, path.extname(currentDocumentPath)), uniqueFileName)
  }
  if (config.fileMode === '4') {
    if (!config.fileRelativePath) {
      return path.resolve(path.dirname(currentDocumentPath), uniqueFileName)
    } else {
      return path.resolve(path.dirname(currentDocumentPath), commonUtil.removePathSplit(config.fileRelativePath), uniqueFileName)
    }
  }
  throw new Error('文件存储模式未知')
}

function check({ documentPath, config, notify }) {
  const currentDocumentPath = getDocumentPath(documentPath)
  if (config.fileMode === '2' && !config.fileAbsolutePath) {
    notify({ type: 'warning', content: 'message.theAbsolutePathToSaveIsNotSet' })
    return false
  }
  if (config.fileMode === '4' && !(config.fileRelativePath || '').trim()) {
    notify({ type: 'warning', content: 'message.theRelativePathToSaveIsNotSet' })
    return false
  }
  if ((config.fileMode === '3' || config.fileMode === '4') && !currentDocumentPath) {
    notify({ type: 'warning', content: 'message.cannotBeSavedToARelativePath' })
    return false
  }
  return true
}

export default {
  save: async ({ documentPath, filePath, config, notify }) => {
    if (check({ documentPath, config, notify })) {
      if (!await fs.pathExists(filePath)) {
        notify({ type: 'warning', content: 'message.theFileDoesNotExist' })
        return null
      }
      const loadingKey = commonUtil.createId()
      try {
        const currentDocumentPath = getDocumentPath(documentPath)
        const savePath = createLocalSavePath(currentDocumentPath, filePath, config)
        await commonUtil.ensureDirSafe(path.dirname(savePath))
        // 消息Key
        notify({ type: 'loading', content: 'message.theFileIsBeingSaved', duration: 0, key: loadingKey })
        await fs.copyFile(filePath, savePath)
        notify({ type: 'success', content: 'message.theFileIsSavedSuccessfully', duration: 3, key: loadingKey })
        // 保存带绝对路径
        if (config.fileMode === '2') {
          return { name: path.basename(filePath), path: savePath }
        }

        // 保存到文件名路径
        if (config.fileMode === '3') {
          return { name: path.basename(filePath), path: `${path.basename(currentDocumentPath, path.extname(currentDocumentPath))}/${path.basename(savePath)}` }
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
        notify({ type: 'error', content: `File save failed, error message: ${e.message}`, duration: 3, key: loadingKey })
      }
    }
  },
}
