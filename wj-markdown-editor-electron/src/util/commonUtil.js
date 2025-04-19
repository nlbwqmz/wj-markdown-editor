import path from 'node:path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'

const createId = () => `wj${nanoid()}`

function removePathSplit(value) {
  value = value.replace(/\//g, '\\')
  if (!value.startsWith('\\') && !value.endsWith('\\')) {
    return value
  }
  if (value.startsWith('\\')) {
    value = value.substring(1)
  }
  if (value.endsWith('\\')) {
    value = value.substring(0, value.length - 1)
  }
  return removePathSplit(value)
}

export default {
  createId,
  removePathSplit,
  getParentPathLevel: (path) => {
    if (path === '') {
      return 0
    }
    const temp = removePathSplit(path)
    const pathArr = temp.split('\\')
    return pathArr.filter(item => item !== '').length
  },
  base64ToImg: async (data, imgPath) => {
    await fs.ensureDir(path.dirname(imgPath))
    const base64 = data.startsWith('data:') ? data.replace(/^data:image\/\w+;base64,/, '') : data
    // eslint-disable-next-line node/prefer-global/buffer
    const dataBuffer = Buffer.from(base64, 'base64')
    await fs.ensureDir(path.dirname(imgPath))
    await fs.writeFile(imgPath, dataBuffer)
  },
}
