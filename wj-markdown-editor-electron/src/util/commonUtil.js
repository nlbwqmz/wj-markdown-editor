import path from 'node:path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'

const createId = () => `wj${nanoid()}`

function removePathSplit(value) {
  value = value.replace(/\\/g, '/')
  if (!value.startsWith('/') && !value.endsWith('/')) {
    return value
  }
  if (value.startsWith('/')) {
    value = value.substring(1)
  }
  if (value.endsWith('/')) {
    value = value.substring(0, value.length - 1)
  }
  return removePathSplit(value)
}

function hexToString(hex) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

function createUniqueFileName(name) {
  const extname = path.extname(name)
  return `${path.basename(name, extname)}_${nanoid(6)}${extname}`
}

export default {
  createId,
  createUniqueFileName,
  removePathSplit,
  base64ToImg: async (data, imgPath) => {
    await fs.ensureDir(path.dirname(imgPath))
    const base64 = data.startsWith('data:') ? data.replace(/^data:image\/\w+;base64,/, '') : data
    const dataBuffer = Buffer.from(base64, 'base64')
    await fs.ensureDir(path.dirname(imgPath))
    await fs.writeFile(imgPath, dataBuffer)
  },
  hexToString,
}
