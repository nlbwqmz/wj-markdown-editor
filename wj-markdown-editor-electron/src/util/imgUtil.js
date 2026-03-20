import path from 'node:path'
import axios from 'axios'
import { app } from 'electron'
import fs from 'fs-extra'
import commonUtil from './commonUtil.js'
import imageBedUtil from './imageBedUtil.js'

function getDocumentPath(documentPath) {
  return documentPath || null
}

/**
 * 判断网络URL是否为图片
 */
async function checkUrlIsImg(imgUrl) {
  try {
    const response = await axios.head(imgUrl, {
      maxRedirects: 5, // 允许重定向
      timeout: 5000, // 5秒超时
      validateStatus: status => status < 400, // 只接受成功状态码
    })
    const contentType = response.headers['content-type']
    return contentType && contentType.startsWith('image/')
  } catch (error) {
    console.error('判断图片时出错:', error.message)
    return false
  }
}

/**
 * 保存网络图片到本地
 */
async function saveImgNetworkToLocal(imgUrl, imgPath) {
  try {
    await commonUtil.ensureDirSafe(path.dirname(imgPath))
    // 发送 GET 请求，设置 responseType 为 'stream' 以处理大文件
    const response = await axios({
      method: 'get',
      url: imgUrl,
      responseType: 'stream',
    })
    // 创建写入流
    const writer = fs.createWriteStream(imgPath)
    // 将响应数据管道传输到文件
    response.data.pipe(writer)
    return new Promise((resolve) => {
      writer.on('finish', () => resolve(true))
      writer.on('error', () => resolve(false))
    })
  } catch (error) {
    console.error('下载图片失败:', error.message)
    return false
  }
}

async function getRelativePath(documentPath, config, type) {
  const currentDocumentPath = getDocumentPath(documentPath)
  let relativePath
  if (type === '3') {
    relativePath = path.resolve(path.dirname(currentDocumentPath), path.basename(currentDocumentPath, path.extname(currentDocumentPath)))
  } else if (type === '4') {
    const normalizedRelativePath = commonUtil.removePathSplit((config.imgRelativePath || '').trim())
    if (!normalizedRelativePath || normalizedRelativePath === '.') {
      relativePath = path.dirname(currentDocumentPath)
    } else {
      relativePath = path.resolve(path.dirname(currentDocumentPath), normalizedRelativePath)
    }
  }
  await commonUtil.ensureDirSafe(relativePath)
  return relativePath
}

/**
 * 生成图片本地保存路径
 * @param documentPath
 * @param data
 * @param config
 */
async function createLocalSavePath(documentPath, data, config) {
  const imageSaveType = data.mode === 'local' ? config.imgLocal : config.imgNetwork
  // 绝对路径
  if (imageSaveType === '2') {
    return path.resolve(config.imgAbsolutePath, `${commonUtil.createUniqueFileName(data.name)}`)
  }
  // 上传到图床
  if (imageSaveType === '5') {
    return path.resolve(app.getPath('temp'), 'wj-markdown-editor', `${commonUtil.createUniqueFileName(data.name)}`)
  }

  const relativePath = await getRelativePath(documentPath, config, imageSaveType)
  return path.resolve(relativePath, `${commonUtil.createUniqueFileName(data.name)}`)
}

// 1：无操作（只有网络图片支持） 2: 保存到绝对路径 3：保存到 ./%{filename} 文件夹 4：保存到相对路径 5：上传到图床
export default {
  /**
   * 检查图片保存配置是否正确
   */
  check: ({ documentPath, data, config, notify }) => {
    const currentDocumentPath = getDocumentPath(documentPath)
    const type = data.mode === 'local' ? config.imgLocal : config.imgNetwork
    if (type === '2' && !config.imgAbsolutePath) {
      notify({ type: 'warning', content: 'message.theAbsolutePathToSaveIsNotSet' })
      return false
    }
    if (type === '4' && !(config.imgRelativePath || '').trim()) {
      notify({ type: 'warning', content: 'message.theRelativePathToSaveIsNotSet' })
      return false
    }
    if ((type === '3' || type === '4') && !currentDocumentPath) {
      notify({ type: 'warning', content: 'message.cannotBeSavedToARelativePath' })
      return false
    }
    return true
  },
  /**
   * 保存图片
   */
  save: async ({ documentPath, data, config, notify }) => {
    const currentDocumentPath = getDocumentPath(documentPath)
    const type = data.mode === 'local' ? config.imgLocal : config.imgNetwork
    // 无操作 只支持网络图片
    if (type === '1') {
      return { name: data.name, path: data.url }
    }
    // 消息Key
    const loadingKey = commonUtil.createId()

    // 生成图片本地保存路径
    const imgSavePath = await createLocalSavePath(currentDocumentPath, data, config)

    // 保存图片
    if (data.mode === 'local') {
      await commonUtil.base64ToImg(data.base64, imgSavePath)
    } else {
      notify({ type: 'loading', content: 'message.checkingLink', duration: 0, key: loadingKey })
      if (!await checkUrlIsImg(data.url)) {
        notify({ type: 'warning', content: 'message.theLinkIsNotValid', duration: 3, key: loadingKey })
        return null
      }
      notify({ type: 'loading', content: 'message.downloadingImage', duration: 0, key: loadingKey })
      if (!await saveImgNetworkToLocal(data.url, imgSavePath)) {
        notify({ type: 'error', content: 'message.imageDownloadFailed', duration: 3, key: loadingKey })
        return null
      }
    }

    notify({ type: 'success', content: 'message.imageSavedSuccessfully', duration: 3, key: loadingKey })

    // 保存带绝对路径
    if (type === '2') {
      return { name: data.name, path: imgSavePath }
    }

    // 保存到文件名路径
    if (type === '3') {
      return { name: data.name, path: `${path.basename(currentDocumentPath, path.extname(currentDocumentPath))}/${path.basename(imgSavePath)}` }
    }

    // 保存到相对路径
    if (type === '4') {
      const normalizedRelativePath = commonUtil.removePathSplit((config.imgRelativePath || '').trim())
      if (normalizedRelativePath && normalizedRelativePath !== '.') {
        return { name: data.name, path: `${normalizedRelativePath}/${path.basename(imgSavePath)}` }
      }
      return { name: data.name, path: path.basename(imgSavePath) }
    }

    // 上传到图床
    if (type === '5') {
      try {
        notify({ type: 'loading', content: 'message.uploadingImage', duration: 0, key: loadingKey })
        const imgUrl = await imageBedUtil.upload(config.imageBed, imgSavePath)
        notify({ type: 'success', content: 'message.imageUploadedSuccessfully', duration: 3, key: loadingKey })
        return { name: data.name, path: imgUrl }
      } catch (e) {
        notify({ type: 'error', content: `The image upload failed, please check the configuration of the picture bed, error message: ${e}`, duration: 3, key: loadingKey })
        return null
      } finally {
        await fs.unlink(imgSavePath)
      }
    }
  },
}
