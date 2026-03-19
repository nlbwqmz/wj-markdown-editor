import path from 'node:path'
import { app } from 'electron'
import fs from 'fs-extra'
import { toComparableDocumentPath } from '../util/document-session/documentOpenTargetUtil.js'

let recent = []
let maxSize = 10
let callback = null

const documentsPath = app.isPackaged ? path.resolve(app.getPath('documents'), 'wj-markdown-editor') : app.getAppPath()
const recentPath = path.resolve(documentsPath, 'recent.json')

async function write() {
  await fs.writeFile(recentPath, JSON.stringify(recent), 'utf-8')
  callback && callback(parseRecent())
}

function normalizeRecentPath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    return null
  }

  return filePath.trim()
}

function getRecentComparableKey(filePath) {
  const normalizedFilePath = normalizeRecentPath(filePath)
  if (!normalizedFilePath) {
    return null
  }

  return toComparableDocumentPath(normalizedFilePath) || normalizedFilePath
}

function normalizeRecentList(recentList) {
  if (!Array.isArray(recentList)) {
    return []
  }

  const seenPathKey = new Set()
  return recentList.reduce((result, item) => {
    const normalizedFilePath = normalizeRecentPath(item)
    const comparableKey = getRecentComparableKey(normalizedFilePath)
    if (!normalizedFilePath || !comparableKey || seenPathKey.has(comparableKey)) {
      return result
    }

    seenPathKey.add(comparableKey)
    result.push(normalizedFilePath)
    return result
  }, [])
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
      const recentContent = JSON.parse(await fs.readFile(recentPath, 'utf-8'))
      recent = normalizeRecentList(recentContent)
      if (JSON.stringify(recentContent) !== JSON.stringify(recent)) {
        await fs.writeFile(recentPath, JSON.stringify(recent), 'utf-8')
      }
    } else {
      await fs.writeFile(recentPath, JSON.stringify([]), 'utf-8')
    }
  } catch {
    recent = []
    await fs.writeFile(recentPath, JSON.stringify([]), 'utf-8')
  }
}

async function clear() {
  recent = []
  await write()
}

async function add(filePath) {
  const normalizedFilePath = normalizeRecentPath(filePath)
  const comparableKey = getRecentComparableKey(normalizedFilePath)
  if (!maxSize || maxSize <= 0 || !normalizedFilePath || !comparableKey) {
    return
  }

  recent = recent.filter(item => getRecentComparableKey(item) !== comparableKey)
  recent.unshift(normalizedFilePath)
  recent = normalizeRecentList(recent)
  if (recent.length > maxSize) {
    recent.pop()
  }
  await write()
}

async function remove(filePath) {
  const comparableKey = getRecentComparableKey(filePath)
  if (!comparableKey) {
    return
  }

  const nextRecent = recent.filter(item => getRecentComparableKey(item) !== comparableKey)
  if (nextRecent.length !== recent.length) {
    recent = nextRecent
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
    recent = normalizeRecentList(recent)
    while (recent.length > maxSize && recent.length !== 0) {
      recent.pop()
    }
    await write()
  },
}
