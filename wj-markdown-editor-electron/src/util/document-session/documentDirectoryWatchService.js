import { watch as fsWatch } from 'node:fs'
import fs from 'fs-extra'
import { resolveDirectoryStateFromSession } from './documentFileManagerService.js'

function normalizeWindowId(windowId) {
  if (typeof windowId === 'number' && Number.isFinite(windowId)) {
    return String(windowId)
  }

  if (typeof windowId === 'string' && windowId.trim() !== '') {
    return windowId.trim()
  }

  return null
}

function normalizeIncludeModifiedTime(value) {
  return value === true
}

function clearWindowTimer(windowState) {
  if (windowState?.debounceTimer) {
    clearTimeout(windowState.debounceTimer)
    windowState.debounceTimer = null
  }
}

function stopWindowWatch(windowState) {
  clearWindowTimer(windowState)

  try {
    windowState?.watchHandle?.close?.()
  } catch {
    // 目录 watcher 的清理由宿主兜底，close 失败时只做静默收口。
  }
}

function createWindowDirectoryBindingSnapshot(windowState) {
  if (!windowState) {
    return {
      directoryPath: null,
      activePath: null,
    }
  }

  return {
    directoryPath: windowState.directoryPath,
    activePath: windowState.activePath,
  }
}

function createDirectoryRebindFailureResult(windowState, error) {
  return {
    ok: false,
    reason: 'directory-watch-rebind-failed',
    ...createWindowDirectoryBindingSnapshot(windowState),
    error: error || null,
  }
}

function createDirectoryRebindSuccessResult(binding) {
  return {
    ok: true,
    directoryPath: binding?.directoryPath || null,
    activePath: binding?.activePath || null,
  }
}

function isDirectoryBindingMatched(bindingResult, expectedBinding) {
  if (bindingResult?.ok !== true) {
    return false
  }

  return bindingResult.directoryPath === expectedBinding?.directoryPath
    && (bindingResult.activePath || null) === (expectedBinding?.activePath || null)
}

export function createDocumentDirectoryWatchService({
  fsModule = fs,
  fsWatch: directoryWatch = fsWatch,
  readDirectoryState = async () => null,
  publishDirectoryChanged = async () => null,
  debounceMs = 120,
} = {}) {
  const windowStateMap = new Map()
  let nextBindingToken = 0

  function getBoundWindowState(windowId, bindingToken) {
    const normalizedWindowId = normalizeWindowId(windowId)
    if (!normalizedWindowId) {
      return null
    }

    const windowState = windowStateMap.get(normalizedWindowId)
    if (!windowState || windowState.bindingToken !== bindingToken) {
      return null
    }

    return windowState
  }

  function getWindowDirectoryBinding(windowId) {
    const normalizedWindowId = normalizeWindowId(windowId)
    if (!normalizedWindowId) {
      return null
    }

    const windowState = windowStateMap.get(normalizedWindowId)
    if (!windowState) {
      return null
    }

    return {
      directoryPath: windowState.directoryPath,
      activePath: windowState.activePath,
    }
  }

  function getWindowDirectoryReadContext(windowId) {
    const normalizedWindowId = normalizeWindowId(windowId)
    if (!normalizedWindowId) {
      return null
    }

    const windowState = windowStateMap.get(normalizedWindowId)
    if (!windowState) {
      return null
    }

    return {
      directoryPath: windowState.directoryPath,
      activePath: windowState.activePath,
      includeModifiedTime: windowState.includeModifiedTime === true,
    }
  }

  function scheduleWindowRescan(windowId, bindingToken) {
    const normalizedWindowId = normalizeWindowId(windowId)
    const windowState = getBoundWindowState(normalizedWindowId, bindingToken)
    if (!windowState) {
      return
    }

    clearWindowTimer(windowState)
    windowState.debounceTimer = setTimeout(() => {
      const currentWindowState = getBoundWindowState(normalizedWindowId, bindingToken)
      if (!currentWindowState) {
        return
      }

      currentWindowState.debounceTimer = null

      // 重扫失败只保留当前绑定，不允许把异步错误抛成未处理失败。
      void Promise.resolve()
        .then(async () => {
          const directoryState = await readDirectoryState({
            directoryPath: currentWindowState.directoryPath,
            activePath: currentWindowState.activePath,
            includeModifiedTime: currentWindowState.includeModifiedTime === true,
          })
          if (!getBoundWindowState(normalizedWindowId, bindingToken)) {
            return
          }
          await publishDirectoryChanged({
            windowId: normalizedWindowId,
            directoryState,
          })
        })
        .catch(() => {})
    }, debounceMs)
  }

  function createWatchHandle(windowId, directoryPath, bindingToken) {
    return directoryWatch(directoryPath, () => {
      scheduleWindowRescan(windowId, bindingToken)
    })
  }

  async function stopWindowDirectory(windowId) {
    const normalizedWindowId = normalizeWindowId(windowId)
    if (!normalizedWindowId) {
      return true
    }

    const windowState = windowStateMap.get(normalizedWindowId)
    if (!windowState) {
      return true
    }

    stopWindowWatch(windowState)
    windowStateMap.delete(normalizedWindowId)
    return true
  }

  async function rebindWindowDirectory(windowId, directoryPath, options = {}) {
    const normalizedWindowId = normalizeWindowId(windowId)
    if (!normalizedWindowId || !directoryPath) {
      return null
    }

    const currentWindowState = windowStateMap.get(normalizedWindowId) || null
    const bindingToken = nextBindingToken + 1
    let watchHandle = null

    try {
      watchHandle = createWatchHandle(normalizedWindowId, directoryPath, bindingToken)
    } catch (error) {
      return createDirectoryRebindFailureResult(currentWindowState, error)
    }

    nextBindingToken = bindingToken
    if (currentWindowState) {
      stopWindowWatch(currentWindowState)
    }

    windowStateMap.set(normalizedWindowId, {
      directoryPath,
      activePath: options.activePath ?? null,
      includeModifiedTime: normalizeIncludeModifiedTime(options.includeModifiedTime),
      watchHandle,
      debounceTimer: null,
      bindingToken,
    })

    return createDirectoryRebindSuccessResult(getWindowDirectoryBinding(normalizedWindowId))
  }

  async function ensureWindowDirectory(windowId, directoryPath, options = {}) {
    const normalizedWindowId = normalizeWindowId(windowId)
    if (!normalizedWindowId || !directoryPath) {
      return null
    }

    const currentWindowState = windowStateMap.get(normalizedWindowId)
    if (currentWindowState?.directoryPath === directoryPath) {
      currentWindowState.activePath = options.activePath ?? null
      currentWindowState.includeModifiedTime = normalizeIncludeModifiedTime(options.includeModifiedTime)
      return createDirectoryRebindSuccessResult(getWindowDirectoryBinding(normalizedWindowId))
    }

    return await rebindWindowDirectory(normalizedWindowId, directoryPath, options)
  }

  async function rebindWindowDirectoryFromSession(windowId, session) {
    const normalizedWindowId = normalizeWindowId(windowId)
    const includeModifiedTime = normalizeIncludeModifiedTime(
      windowStateMap.get(normalizedWindowId)?.includeModifiedTime,
    )
    const directoryState = await resolveDirectoryStateFromSession({
      fsModule,
      session,
      includeModifiedTime,
    })
    if (!directoryState.directoryPath) {
      await stopWindowDirectory(windowId)
      return {
        ok: true,
        directoryState,
        directoryPath: null,
        activePath: null,
      }
    }

    const bindingResult = await rebindWindowDirectory(windowId, directoryState.directoryPath, {
      activePath: directoryState.activePath,
      includeModifiedTime,
    })
    if (!isDirectoryBindingMatched(bindingResult, {
      directoryPath: directoryState.directoryPath,
      activePath: directoryState.activePath,
    })) {
      return {
        ok: false,
        reason: 'directory-watch-rebind-failed',
        directoryState,
        directoryPath: bindingResult?.directoryPath || null,
        activePath: bindingResult?.activePath || null,
        error: bindingResult?.error || null,
      }
    }

    return {
      ok: true,
      directoryState,
      directoryPath: bindingResult.directoryPath,
      activePath: bindingResult.activePath,
    }
  }

  return {
    clearWindowDirectory: stopWindowDirectory,
    ensureWindowDirectory,
    getWindowDirectoryBinding,
    getWindowDirectoryReadContext,
    rebindWindowDirectory,
    rebindWindowDirectoryFromSession,
    stopWindowDirectory,
  }
}

export default {
  createDocumentDirectoryWatchService,
}
