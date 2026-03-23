import path from 'node:path'
import { app } from 'electron'
import fs from 'fs-extra'
import { toComparableDocumentPath } from '../util/document-session/documentOpenTargetUtil.js'

let recent = []
let maxSize = 10
let callback = null
let exclusiveQueue = Promise.resolve()

const documentsPath = app.isPackaged ? path.resolve(app.getPath('documents'), 'wj-markdown-editor') : app.getAppPath()
const recentPath = path.resolve(documentsPath, 'recent.json')

function runExclusive(task) {
  const nextTask = exclusiveQueue.then(task, task)
  exclusiveQueue = nextTask.catch(() => {})
  return nextTask
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

function notifyCallbackSafely() {
  if (!callback) {
    return
  }

  try {
    callback(parseRecent())
  }
  catch (error) {
    console.error('[recent] callback failed:', error)
  }
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
  await runExclusive(async () => {
    await clearInternal()
  })
}

async function add(filePath) {
  await runExclusive(async () => {
    await addInternal(filePath)
  })
}

async function remove(filePath) {
  await runExclusive(async () => {
    await removeInternal(filePath)
  })
}

async function clearInternal({ notify = true } = {}) {
  const nextRecent = []
  await fs.writeFile(recentPath, JSON.stringify(nextRecent), 'utf-8')
  recent = nextRecent
  if (notify) {
    notifyCallbackSafely()
  }
}

async function addInternal(filePath, { notify = true } = {}) {
  const normalizedFilePath = normalizeRecentPath(filePath)
  const comparableKey = getRecentComparableKey(normalizedFilePath)
  if (!maxSize || maxSize <= 0 || !normalizedFilePath || !comparableKey) {
    return
  }

  const nextRecent = recent.filter(item => getRecentComparableKey(item) !== comparableKey)
  nextRecent.unshift(normalizedFilePath)
  const normalizedRecent = normalizeRecentList(nextRecent)
  if (normalizedRecent.length > maxSize) {
    normalizedRecent.pop()
  }

  await fs.writeFile(recentPath, JSON.stringify(normalizedRecent), 'utf-8')
  recent = normalizedRecent
  if (notify) {
    notifyCallbackSafely()
  }
}

async function removeInternal(filePath, { notify = true } = {}) {
  const comparableKey = getRecentComparableKey(filePath)
  if (!comparableKey) {
    return
  }

  const nextRecent = recent.filter(item => getRecentComparableKey(item) !== comparableKey)
  if (nextRecent.length === recent.length) {
    return
  }

  await fs.writeFile(recentPath, JSON.stringify(nextRecent), 'utf-8')
  recent = nextRecent
  if (notify) {
    notifyCallbackSafely()
  }
}

async function setMaxInternal(max, { notify = true } = {}) {
  const nextMaxSize = max || 0
  const nextRecent = normalizeRecentList(recent)
  while (nextRecent.length > nextMaxSize && nextRecent.length !== 0) {
    nextRecent.pop()
  }

  // setMax 失败时不能让 recent 的内存态先于持久化态前移。
  await fs.writeFile(recentPath, JSON.stringify(nextRecent), 'utf-8')

  maxSize = nextMaxSize
  recent = nextRecent
  if (notify) {
    notifyCallbackSafely()
  }
}

async function restoreStateInternal(snapshot, { notify = false } = {}) {
  if (!snapshot || !Array.isArray(snapshot.recent)) {
    return
  }

  const restoredRecent = normalizeRecentList(snapshot.recent)
  const restoredMaxSize = snapshot.maxSize || 0

  recent = restoredRecent
  maxSize = restoredMaxSize

  await fs.writeFile(recentPath, JSON.stringify(restoredRecent), 'utf-8')

  if (notify) {
    notifyCallbackSafely()
  }
}

function createTransactionApi() {
  return {
    createStateSnapshot: () => {
      return {
        recent: [...recent],
        maxSize,
      }
    },
    notifyCurrentState: () => {
      notifyCallbackSafely()
    },
    restoreState: async (snapshot, options) => {
      await restoreStateInternal(snapshot, options)
    },
    setMax: async (max, options) => {
      await setMaxInternal(max, options)
    },
  }
}

export default {
  initRecent,
  clear,
  add,
  remove,
  get: () => parseRecent(),
  runExclusive,
  transaction: async (task) => {
    return await runExclusive(async () => {
      return await task(createTransactionApi())
    })
  },
  notifyCurrentState: () => {
    notifyCallbackSafely()
  },
  createStateSnapshot: () => {
    return {
      recent: [...recent],
      maxSize,
    }
  },
  restoreState: async (snapshot, { notify = false } = {}) => {
    await runExclusive(async () => {
      await restoreStateInternal(snapshot, { notify })
    })
  },
  setMax: async (max, { notify = true } = {}) => {
    await runExclusive(async () => {
      await setMaxInternal(max, { notify })
    })
  },
}
