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

function resolveRecentMaxSize(max, fallback) {
  if (typeof max !== 'number' || Number.isNaN(max)) {
    return fallback
  }

  return max >= 0 ? max : fallback
}

function trimRecentListToMax(recentList, max) {
  const normalizedRecent = normalizeRecentList(recentList)
  if (max <= 0) {
    return []
  }

  return normalizedRecent.slice(0, max)
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
  maxSize = resolveRecentMaxSize(max, 10)
  callback = callbackFunction
  try {
    await fs.ensureDir(documentsPath)
    if (await fs.pathExists(recentPath)) {
      const recentContent = JSON.parse(await fs.readFile(recentPath, 'utf-8'))
      const normalizedRecent = trimRecentListToMax(recentContent, maxSize)
      recent = normalizedRecent
      if (JSON.stringify(recentContent) !== JSON.stringify(normalizedRecent)) {
        await fs.writeFile(recentPath, JSON.stringify(normalizedRecent), 'utf-8')
      }
    } else {
      recent = []
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
  if (!normalizedFilePath || !comparableKey) {
    return
  }

  const nextRecent = recent.filter(item => getRecentComparableKey(item) !== comparableKey)
  nextRecent.unshift(normalizedFilePath)
  const normalizedRecent = trimRecentListToMax(nextRecent, maxSize)

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
  // recentMax 更新时只同步运行期上限；列表收敛延迟到下次启动或后续 recent 真实更新时处理。
  maxSize = resolveRecentMaxSize(max, 0)

  // 兼容旧接口签名，notify 参数保留但这里不广播，因为 recent 列表本身未发生变化。
  void notify
}

async function restoreStateInternal(snapshot, { notify = false } = {}) {
  if (!snapshot || !Array.isArray(snapshot.recent)) {
    return
  }

  const restoredRecent = normalizeRecentList(snapshot.recent)
  const restoredMaxSize = resolveRecentMaxSize(snapshot.maxSize, 0)

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
