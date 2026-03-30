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

export function createDocumentDirectoryWatchService({
  fsModule = fs,
  fsWatch: directoryWatch = fsWatch,
  readDirectoryState = async () => null,
  publishDirectoryChanged = async () => null,
  debounceMs = 120,
} = {}) {
  const windowStateMap = new Map()
  let nextBindingToken = 0

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

  function scheduleWindowRescan(windowId, bindingToken) {
    const normalizedWindowId = normalizeWindowId(windowId)
    const windowState = normalizedWindowId ? windowStateMap.get(normalizedWindowId) : null
    if (!windowState || windowState.bindingToken !== bindingToken) {
      return
    }

    clearWindowTimer(windowState)
    windowState.debounceTimer = setTimeout(async () => {
      const currentWindowState = windowStateMap.get(normalizedWindowId)
      if (!currentWindowState || currentWindowState.bindingToken !== bindingToken) {
        return
      }

      const directoryState = await readDirectoryState({
        directoryPath: currentWindowState.directoryPath,
        activePath: currentWindowState.activePath,
      })
      await publishDirectoryChanged({
        windowId: normalizedWindowId,
        directoryState,
      })
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

    await stopWindowDirectory(normalizedWindowId)
    const bindingToken = ++nextBindingToken
    const watchHandle = createWatchHandle(normalizedWindowId, directoryPath, bindingToken)

    windowStateMap.set(normalizedWindowId, {
      directoryPath,
      activePath: options.activePath ?? null,
      watchHandle,
      debounceTimer: null,
      bindingToken,
    })

    return getWindowDirectoryBinding(normalizedWindowId)
  }

  async function ensureWindowDirectory(windowId, directoryPath, options = {}) {
    const normalizedWindowId = normalizeWindowId(windowId)
    if (!normalizedWindowId || !directoryPath) {
      return null
    }

    const currentWindowState = windowStateMap.get(normalizedWindowId)
    if (currentWindowState?.directoryPath === directoryPath) {
      currentWindowState.activePath = options.activePath ?? null
      return getWindowDirectoryBinding(normalizedWindowId)
    }

    return await rebindWindowDirectory(normalizedWindowId, directoryPath, options)
  }

  async function rebindWindowDirectoryFromSession(windowId, session) {
    const directoryState = await resolveDirectoryStateFromSession({
      fsModule,
      session,
    })
    if (!directoryState.directoryPath) {
      await stopWindowDirectory(windowId)
      return directoryState
    }

    await rebindWindowDirectory(windowId, directoryState.directoryPath, {
      activePath: directoryState.activePath,
    })
    return directoryState
  }

  return {
    clearWindowDirectory: stopWindowDirectory,
    ensureWindowDirectory,
    getWindowDirectoryBinding,
    rebindWindowDirectory,
    rebindWindowDirectoryFromSession,
    stopWindowDirectory,
  }
}

export default {
  createDocumentDirectoryWatchService,
}
