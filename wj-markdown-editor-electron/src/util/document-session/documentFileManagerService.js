import path from 'node:path'
import fs from 'fs-extra'
import { appendMarkdownExtension } from './documentOpenTargetUtil.js'

function normalizeWindowId(windowId) {
  if (typeof windowId === 'number' && Number.isFinite(windowId)) {
    return windowId
  }

  if (typeof windowId === 'string' && windowId.trim() !== '') {
    return windowId.trim()
  }

  return null
}

function createEmptyDirectoryState() {
  return {
    mode: 'empty',
    directoryPath: null,
    activePath: null,
    entryList: [],
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function normalizeFileManagerEntryName(name) {
  return typeof name === 'string' ? name.trim() : ''
}

function isInvalidFileManagerEntryName(name) {
  const normalizedName = normalizeFileManagerEntryName(name)

  return !normalizedName
    || normalizedName === '.'
    || normalizedName === '..'
    || /[\\/]/u.test(normalizedName)
}

function createInvalidFileManagerEntryNameResult() {
  return {
    ok: false,
    reason: 'invalid-file-manager-entry-name',
  }
}

function createFileManagerEntryAlreadyExistsResult(targetPath) {
  return {
    ok: false,
    reason: 'file-manager-entry-already-exists',
    path: targetPath || null,
  }
}

function getEntryExtension(entryName, isDirectory) {
  if (isDirectory) {
    return null
  }

  const extension = path.extname(entryName || '')
  return extension ? extension.toLowerCase() : null
}

function compareEntry(leftEntry, rightEntry) {
  if (leftEntry.kind !== rightEntry.kind) {
    return leftEntry.kind === 'directory' ? -1 : 1
  }

  return leftEntry.name.localeCompare(rightEntry.name, 'zh-CN', {
    sensitivity: 'base',
  })
}

const SKIPPABLE_DIRECTORY_ENTRY_STAT_ERROR_CODE_SET = new Set(['ENOENT', 'EPERM', 'EACCES'])
const DIRECTORY_ENTRY_STAT_BATCH_SIZE = 32

function shouldSkipDirectoryEntryStatError(error) {
  return SKIPPABLE_DIRECTORY_ENTRY_STAT_ERROR_CODE_SET.has(error?.code)
}

function normalizeIncludeModifiedTime(value) {
  return value === true
}

function isIncludeModifiedTimeOptionSpecified(value) {
  return value === true || value === false
}

async function isExistingDirectory(fsModule, directoryPath) {
  if (!isNonEmptyString(directoryPath)) {
    return false
  }

  if (!await fsModule.pathExists(directoryPath)) {
    return false
  }

  const stat = await fsModule.stat(directoryPath)
  return stat?.isDirectory?.() === true
}

async function normalizeDirectoryEntry(fsModule, directoryPath, directoryEntry, options = {}) {
  const entryPath = path.join(directoryPath, directoryEntry.name)
  let stat = null
  const includeModifiedTime = normalizeIncludeModifiedTime(options.includeModifiedTime)
  const getStat = async () => {
    if (!stat) {
      stat = await fsModule.stat(entryPath)
    }
    return stat
  }
  const isDirectory = typeof directoryEntry.isDirectory === 'function'
    ? directoryEntry.isDirectory()
    : (await getStat()).isDirectory()

  const normalizedEntry = {
    path: entryPath,
    name: directoryEntry.name,
    kind: isDirectory ? 'directory' : 'file',
    extension: getEntryExtension(directoryEntry.name, isDirectory),
  }

  if (includeModifiedTime) {
    const nextStat = await getStat()
    normalizedEntry.modifiedTimeMs = Number.isFinite(nextStat?.mtimeMs) ? nextStat.mtimeMs : 0
  }

  return normalizedEntry
}

async function safeNormalizeDirectoryEntry(fsModule, directoryPath, directoryEntry, options = {}) {
  try {
    return await normalizeDirectoryEntry(fsModule, directoryPath, directoryEntry, options)
  } catch (error) {
    if (shouldSkipDirectoryEntryStatError(error)) {
      // 扫描期间条目可能已删除或暂时无权限，跳过单项以避免整次目录刷新失效。
      return null
    }

    throw error
  }
}

async function collectDirectoryEntryList(fsModule, directoryPath, rawEntryList, options = {}) {
  const entryList = []

  for (let index = 0; index < rawEntryList.length; index += DIRECTORY_ENTRY_STAT_BATCH_SIZE) {
    const normalizedBatch = await Promise.all(rawEntryList
      .slice(index, index + DIRECTORY_ENTRY_STAT_BATCH_SIZE)
      .map(directoryEntry => safeNormalizeDirectoryEntry(fsModule, directoryPath, directoryEntry, options)))

    normalizedBatch.forEach((normalizedEntry) => {
      if (normalizedEntry) {
        entryList.push(normalizedEntry)
      }
    })
  }

  return entryList
}

export async function readDirectoryStateAtPath({
  fsModule = fs,
  directoryPath,
  activePath = null,
  includeModifiedTime = false,
}) {
  if (!await isExistingDirectory(fsModule, directoryPath)) {
    return createEmptyDirectoryState()
  }

  const rawEntryList = await fsModule.readdir(directoryPath, {
    withFileTypes: true,
  })
  const entryList = await collectDirectoryEntryList(fsModule, directoryPath, rawEntryList, {
    includeModifiedTime,
  })

  entryList.sort(compareEntry)

  return {
    mode: 'directory',
    directoryPath,
    activePath: isNonEmptyString(activePath) ? activePath : null,
    entryList,
  }
}

export async function resolveDirectoryStateFromSession({
  fsModule = fs,
  session,
  includeModifiedTime = false,
}) {
  const currentDocumentPath = session?.documentSource?.path || null
  if (isNonEmptyString(currentDocumentPath)) {
    return await readDirectoryStateAtPath({
      fsModule,
      directoryPath: path.dirname(currentDocumentPath),
      activePath: currentDocumentPath,
      includeModifiedTime,
    })
  }

  if (session?.documentSource?.missingReason !== 'recent-missing') {
    return createEmptyDirectoryState()
  }

  const missingPath = session?.documentSource?.missingPath || null
  if (!isNonEmptyString(missingPath)) {
    return createEmptyDirectoryState()
  }

  const parentDirectoryPath = path.dirname(missingPath)
  if (!await isExistingDirectory(fsModule, parentDirectoryPath)) {
    return createEmptyDirectoryState()
  }

  return await readDirectoryStateAtPath({
    fsModule,
    directoryPath: parentDirectoryPath,
    activePath: null,
    includeModifiedTime,
  })
}

function resolveWindowDirectoryBinding(directoryWatchService, windowId) {
  return directoryWatchService?.getWindowDirectoryBinding?.(windowId) || null
}

function resolveWindowDirectoryReadContext(directoryWatchService, windowId) {
  return directoryWatchService?.getWindowDirectoryReadContext?.(windowId)
    || resolveWindowDirectoryBinding(directoryWatchService, windowId)
}

function resolveDirectoryClearer(directoryWatchService) {
  if (typeof directoryWatchService?.clearWindowDirectory === 'function') {
    return directoryWatchService.clearWindowDirectory.bind(directoryWatchService)
  }

  if (typeof directoryWatchService?.stopWindowDirectory === 'function') {
    return directoryWatchService.stopWindowDirectory.bind(directoryWatchService)
  }

  return null
}

function isDirectoryBindingMatched(bindingResult, {
  directoryPath,
  activePath = null,
}) {
  if (bindingResult?.ok !== true) {
    return false
  }

  return bindingResult.directoryPath === directoryPath
    && (bindingResult.activePath || null) === (activePath || null)
}

function createOpenDirectoryWatchFailedResult() {
  return {
    ok: false,
    reason: 'open-directory-watch-failed',
  }
}

function isFileManagerFailureResult(result) {
  return result?.ok === false
}

export function createDocumentFileManagerService({
  store,
  fsModule = fs,
  directoryWatchService = null,
} = {}) {
  const clearWindowDirectory = resolveDirectoryClearer(directoryWatchService)

  function getCurrentSession(windowId) {
    const normalizedWindowId = normalizeWindowId(windowId)
    if (normalizedWindowId == null || !store) {
      return null
    }

    return store.getSessionByWindowId(normalizedWindowId)
  }

  async function resolveWindowDirectoryState(windowId, includeModifiedTimeOverride = null) {
    const currentBinding = resolveWindowDirectoryReadContext(directoryWatchService, windowId)
    const includeModifiedTime = isIncludeModifiedTimeOptionSpecified(includeModifiedTimeOverride)
      ? includeModifiedTimeOverride
      : normalizeIncludeModifiedTime(currentBinding?.includeModifiedTime)
    if (currentBinding?.directoryPath) {
      return await readDirectoryStateAtPath({
        fsModule,
        directoryPath: currentBinding.directoryPath,
        activePath: currentBinding.activePath || null,
        includeModifiedTime,
      })
    }

    return await resolveDirectoryStateFromSession({
      fsModule,
      session: getCurrentSession(windowId),
      includeModifiedTime,
    })
  }

  async function resolveExplicitDirectoryState(windowId, directoryPath, includeModifiedTime = false) {
    const currentSession = getCurrentSession(windowId)
    const currentDocumentPath = currentSession?.documentSource?.path || null
    const activePath = isNonEmptyString(currentDocumentPath)
      && path.dirname(currentDocumentPath) === directoryPath
      ? currentDocumentPath
      : null

    return await readDirectoryStateAtPath({
      fsModule,
      directoryPath,
      activePath,
      includeModifiedTime,
    })
  }

  async function getDirectoryState({
    windowId,
    directoryPath = null,
    includeModifiedTime = undefined,
  }) {
    const hasRequestedIncludeModifiedTime = isIncludeModifiedTimeOptionSpecified(includeModifiedTime)
    const requestedIncludeModifiedTime = normalizeIncludeModifiedTime(includeModifiedTime)
    // renderer 显式指定目录时，必须以该目录为准，不能继续沿用旧 binding。
    const directoryState = isNonEmptyString(directoryPath)
      ? await resolveExplicitDirectoryState(windowId, directoryPath, requestedIncludeModifiedTime)
      : await resolveWindowDirectoryState(
          windowId,
          hasRequestedIncludeModifiedTime ? requestedIncludeModifiedTime : null,
        )

    if (!directoryState.directoryPath) {
      await clearWindowDirectory?.(windowId)
      return directoryState
    }

    const ensureWindowDirectory = directoryWatchService?.ensureWindowDirectory
    if (typeof ensureWindowDirectory === 'function') {
      const bindingResult = await ensureWindowDirectory(windowId, directoryState.directoryPath, {
        activePath: directoryState.activePath,
        includeModifiedTime: isNonEmptyString(directoryPath)
          ? requestedIncludeModifiedTime
          : hasRequestedIncludeModifiedTime
            ? requestedIncludeModifiedTime
            : normalizeIncludeModifiedTime(resolveWindowDirectoryReadContext(directoryWatchService, windowId)?.includeModifiedTime),
      })
      if (!isDirectoryBindingMatched(bindingResult, {
        directoryPath: directoryState.directoryPath,
        activePath: directoryState.activePath,
      })) {
        return createOpenDirectoryWatchFailedResult()
      }
    }

    return directoryState
  }

  async function resolveCurrentDirectoryPath(windowId) {
    const directoryState = await getDirectoryState({ windowId })
    if (isFileManagerFailureResult(directoryState)) {
      return directoryState
    }

    return {
      ok: true,
      directoryPath: directoryState.directoryPath || null,
    }
  }

  async function openDirectory({
    windowId,
    directoryPath,
    includeModifiedTime = false,
  }) {
    const currentSession = getCurrentSession(windowId)
    const currentDocumentPath = currentSession?.documentSource?.path || null
    const activePath = isNonEmptyString(currentDocumentPath)
      && path.dirname(currentDocumentPath) === directoryPath
      ? currentDocumentPath
      : null

    const bindingResult = await directoryWatchService?.rebindWindowDirectory?.(windowId, directoryPath, {
      activePath,
      includeModifiedTime,
    })
    if (!isDirectoryBindingMatched(bindingResult, {
      directoryPath,
      activePath,
    })) {
      return createOpenDirectoryWatchFailedResult()
    }

    return await getDirectoryState({
      windowId,
      includeModifiedTime,
    })
  }

  async function createFolder({ windowId, name }) {
    const nextName = normalizeFileManagerEntryName(name)
    if (isInvalidFileManagerEntryName(nextName)) {
      return createInvalidFileManagerEntryNameResult()
    }

    const directoryPathResult = await resolveCurrentDirectoryPath(windowId)
    if (isFileManagerFailureResult(directoryPathResult)) {
      return directoryPathResult
    }

    const directoryPath = directoryPathResult.directoryPath || null
    if (!directoryPath) {
      return createEmptyDirectoryState()
    }

    const nextPath = path.join(directoryPath, nextName)
    if (await fsModule.pathExists(nextPath)) {
      return createFileManagerEntryAlreadyExistsResult(nextPath)
    }

    try {
      await fsModule.mkdir(nextPath)
    } catch (error) {
      if (error?.code === 'EEXIST') {
        return createFileManagerEntryAlreadyExistsResult(nextPath)
      }
      throw error
    }

    return await getDirectoryState({ windowId })
  }

  async function createMarkdown({ windowId, name }) {
    const nextName = normalizeFileManagerEntryName(name)
    if (isInvalidFileManagerEntryName(nextName)) {
      return createInvalidFileManagerEntryNameResult()
    }

    const directoryPathResult = await resolveCurrentDirectoryPath(windowId)
    if (isFileManagerFailureResult(directoryPathResult)) {
      return directoryPathResult
    }

    const directoryPath = directoryPathResult.directoryPath || null
    if (!directoryPath) {
      return {
        path: null,
        directoryState: createEmptyDirectoryState(),
      }
    }

    const nextPath = appendMarkdownExtension(path.join(directoryPath, nextName))
    if (await fsModule.pathExists(nextPath)) {
      return createFileManagerEntryAlreadyExistsResult(nextPath)
    }

    try {
      await fsModule.writeFile(nextPath, '', {
        encoding: 'utf8',
        flag: 'wx',
      })
    } catch (error) {
      if (error?.code === 'EEXIST') {
        return createFileManagerEntryAlreadyExistsResult(nextPath)
      }
      throw error
    }

    return {
      path: nextPath,
      directoryState: await getDirectoryState({ windowId }),
    }
  }

  return {
    createFolder,
    createMarkdown,
    getDirectoryState,
    openDirectory,
    readDirectoryState: async ({
      directoryPath,
      activePath = null,
      includeModifiedTime = false,
    }) => {
      return await readDirectoryStateAtPath({
        fsModule,
        directoryPath,
        activePath,
        includeModifiedTime,
      })
    },
    resolveDirectoryStateFromSession: async (session, options = {}) => {
      return await resolveDirectoryStateFromSession({
        fsModule,
        session,
        includeModifiedTime: options?.includeModifiedTime === true,
      })
    },
  }
}

export default {
  createDocumentFileManagerService,
  createEmptyDirectoryState,
  readDirectoryStateAtPath,
  resolveDirectoryStateFromSession,
}
