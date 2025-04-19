import path from 'node:path'
import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs-extra'
import mime from 'mime-types'

const handler = {
  github: async (option, filePath) => {
    const fileName = path.basename(filePath)
    const buffer = await fs.readFile(filePath)
    const base64Image = Buffer.from(buffer).toString('base64')
    const data = {
      message: 'Upload by wj-markdown-editor.',
      branch: option.branch,
      content: base64Image,
      path: option.path + encodeURI(fileName),
    }
    const res = await axios.request({
      method: 'PUT',
      url: `https://api.github.com/repos/${option.repo}/contents/${encodeURI(option.path)}${encodeURIComponent(fileName)}`,
      headers: {
        'Authorization': `token ${option.token}`,
        'User-Agent': 'wj-markdown-editor',
        'Content-Type': mime.lookup(fileName),
      },
      data,
    })
    if (option.customUrl) {
      return `${option.customUrl}/${encodeURI(option.path)}${encodeURIComponent(fileName)}`
    } else {
      return res.data.content.download_url
    }
  },
  smms: async (option, filePath) => {
    const fileName = path.basename(filePath)
    const buffer = await fs.readFile(filePath)
    const formData = new FormData()
    formData.append('smfile', buffer, fileName)
    const res = await axios.request({
      method: 'POST',
      url: `https://${option.domain ? option.domain : 'sm.ms'}/api/v2/upload`,
      headers: {
        'Authorization': option.token,
        'User-Agent': 'wj-markdown-editor',
        'Content-Type': 'multipart/form-data',
      },
      data: formData,
    })
    if (res.data.code === 'success') {
      return res.data.data.url
    } else if (res.data.code === 'image_repeated') {
      return res.data.images
    }
    throw new Error(res.data.message)
  },
}

async function upload(imageBedConfig, filePath) {
  const uploader = imageBedConfig.uploader
  if (!handler[uploader]) {
    throw new Error('不支持当前图床类型。')
  }
  return await handler[uploader](imageBedConfig[uploader], filePath)
}

export default {
  upload,
}
