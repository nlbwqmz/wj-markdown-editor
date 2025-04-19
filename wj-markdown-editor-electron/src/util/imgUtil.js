import path from 'node:path'
import axios from 'axios'
import { app } from 'electron'
import fs from 'fs-extra'
import sendUtil from './channel/sendUtil.js'
import commonUtil from './commonUtil.js'
import imageBedUtil from './imageBedUtil.js'

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
    await fs.ensureDir(path.dirname(imgPath))
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

async function getRelativePath(winInfo, config, type) {
  let relativePath
  if (type === '3') {
    relativePath = path.resolve(path.dirname(winInfo.path), path.basename(winInfo.path, path.extname(winInfo.path)))
  } else if (type === '4') {
    if (!config.imgRelativePath) {
      relativePath = path.dirname(winInfo.path)
    } else {
      const removePathSplit = commonUtil.removePathSplit(config.imgRelativePath)
      relativePath = path.resolve(path.dirname(winInfo.path), removePathSplit)
    }
  }
  await fs.ensureDir(relativePath)
  return relativePath
}

/**
 * 生成图片本地保存路径
 * @param config
 * @param data
 */
async function createLocalSavePath(winInfo, data, config) {
  const imageSaveType = data.mode === 'local' ? config.imgLocal : config.imgNetwork
  // 绝对路径
  if (imageSaveType === '2') {
    return path.resolve(config.imgAbsolutePath, `${commonUtil.createId()}${path.extname(data.name)}`)
  }
  // 上传到图床
  if (imageSaveType === '5') {
    return path.resolve(app.getPath('temp'), 'wj-markdown-editor', `${commonUtil.createId()}${path.extname(data.name)}`)
  }

  const relativePath = await getRelativePath(winInfo, config, imageSaveType)
  return path.resolve(relativePath, `${commonUtil.createId()}${path.extname(data.name)}`)
}

// 1：无操作（只有网络图片支持） 2: 保存到绝对路径 3：保存到 ./%{filename} 文件夹 4：保存到相对路径 5：上传到图床
export default {
  /**
   * 检查图片保存配置是否正确
   */
  check: (winInfo, data, config) => {
    const type = data.mode === 'local' ? config.imgLocal : config.imgNetwork
    if (type === '2' && !config.imgAbsolutePath) {
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '未设置图片绝对路径' } })
      return false
    }
    if ((type === '3' || type === '4') && !winInfo.path) {
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '当前文件未保存，不能将图片保存到相对路径' } })
      return false
    }
    return true
  },
  /**
   * 保存图片
   */
  save: async (winInfo, data, config) => {
    const type = data.mode === 'local' ? config.imgLocal : config.imgNetwork
    // 无操作 只支持网络图片
    if (type === '1') {
      return { name: data.name, path: data.url }
    }
    // 消息Key
    const loadingKey = commonUtil.createId()

    // 生成图片本地保存路径
    const imgSavePath = await createLocalSavePath(winInfo, data, config)

    // 保存图片
    if (data.mode === 'local') {
      await commonUtil.base64ToImg(data.base64, imgSavePath)
    } else {
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'loading', content: '正在检查链接', duration: 0, key: loadingKey } })
      if (!await checkUrlIsImg(data.url)) {
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'warning', content: '当前链接不是图片', duration: 3, key: loadingKey } })
        return null
      }
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'loading', content: '正在下载图片', duration: 0, key: loadingKey } })
      if (!await saveImgNetworkToLocal(data.url, imgSavePath)) {
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'error', content: '图片下载失败', duration: 3, key: loadingKey } })
        return null
      }
    }

    // 后续操作
    if (type === '2') {
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'success', content: '图片保存成功', duration: 3, key: loadingKey } })
      return { name: data.name, path: imgSavePath }
    }

    if (type === '3' || type === '4') {
      sendUtil.send(winInfo.win, { event: 'message', data: { type: 'success', content: '图片保存成功', duration: 3, key: loadingKey } })
      const relativePath = await getRelativePath(winInfo, config, config.imgLocal)
      if (config.imgRelativePath) {
        return { name: data.name, path: path.relative(path.resolve(relativePath, '../'.repeat(commonUtil.getParentPathLevel(config.imgRelativePath))), imgSavePath) }
      } else {
        return { name: data.name, path: path.relative(relativePath, imgSavePath) }
      }
    }

    if (type === '5') {
      try {
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'loading', content: '正在上传图片', duration: 0, key: loadingKey } })
        const imgUrl = await imageBedUtil.upload(config.imageBed, imgSavePath)
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'success', content: '图片上传成功', duration: 3, key: loadingKey } })
        return { name: data.name, path: imgUrl }
      } catch (e) {
        sendUtil.send(winInfo.win, { event: 'message', data: { type: 'error', content: `图片上传失败，请检查图床配置，错误信息：${e}`, duration: 3, key: loadingKey } })
        return null
      } finally {
        await fs.unlink(imgSavePath)
      }
    }
  },
}
