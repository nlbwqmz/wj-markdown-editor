import path from 'node:path'
import { app } from 'electron'
import fs from 'fs-extra'

let recent = []
let maxSize = 10
let callback = null

const documentsPath = app.isPackaged ? path.resolve(app.getPath('documents'), 'wj-markdown-editor') : app.getAppPath()
const recentPath = path.resolve(documentsPath, 'recent.json')

async function write() {
  await fs.writeFile(recentPath, JSON.stringify(recent), 'utf-8')
  callback && callback(parseRecent())
}

function parseRecent() {
  return recent.map((item) => {
    return {
      name: path.basename(item),
      path: item,
    }
  })
}

async function initRecent(max, callbackFunction) {
  maxSize = max || 10
  callback = callbackFunction
  try {
    await fs.ensureDir(documentsPath)
    if (await fs.pathExists(recentPath)) {
      recent = JSON.parse(await fs.readFile(recentPath, 'utf-8'))
    } else {
      await fs.writeFile(recentPath, JSON.stringify([]), 'utf-8')
    }
  } catch {
    await fs.writeFile(recentPath, JSON.stringify([]), 'utf-8')
  }
}

async function clear() {
  recent = []
  await write()
}

async function add(filePath) {
  if (!maxSize || maxSize <= 0) {
    return
  }
  if (recent.includes(filePath)) {
    recent.splice(recent.indexOf(filePath), 1)
  }
  if (recent.unshift(filePath) > maxSize) {
    recent.pop()
  }
  await write()
}

async function remove(filePath) {
  if (recent.includes(filePath)) {
    recent.splice(recent.indexOf(filePath), 1)
    await write()
  }
}

export default {
  initRecent,
  clear,
  add,
  remove,
  get: () => parseRecent(),
  setMax: async (max) => {
    maxSize = max || 0
    while (recent.length > maxSize && recent.length !== 0) {
      recent.pop()
    }
    await write()
  },
}
