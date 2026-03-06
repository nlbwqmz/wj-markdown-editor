import crypto from 'node:crypto'
import fs from 'node:fs/promises'

function createContentVersion(content = '') {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

function createWatchState() {
  return {
    watcher: null,
    watchingPath: null,
    debounceTimer: null,
    generation: 0,
    latestRunToken: 0,
    currentVersion: 0,
    internalSaveWindowMs: 1500,
    lastInternalSaveAt: 0,
    lastInternalSavedVersion: null,
    ignoredVersionHash: null,
    pendingChange: null,
    stopped: false,
  }
}

function resetTrackedState(state) {
  state.currentVersion = 0
  state.lastInternalSaveAt = 0
  state.lastInternalSavedVersion = null
  state.ignoredVersionHash = null
  state.pendingChange = null
  state.latestRunToken = 0
}

function isCurrentRun(state, generation, runToken) {
  return state.stopped !== true
    && state.generation === generation
    && state.latestRunToken === runToken
}

function markInternalSave(state, content) {
  state.lastInternalSaveAt = Date.now()
  state.lastInternalSavedVersion = createContentVersion(content)
  state.pendingChange = null
}

function resolveExternalChange(state, diskContent) {
  if (!state || state.stopped === true) {
    return {
      changed: false,
      reason: 'stopped',
    }
  }

  const versionHash = createContentVersion(diskContent)

  if (
    versionHash === state.lastInternalSavedVersion
    && Date.now() - state.lastInternalSaveAt <= state.internalSaveWindowMs
  ) {
    return {
      changed: false,
      reason: 'internal-save',
      versionHash,
    }
  }

  if (versionHash === state.ignoredVersionHash) {
    return {
      changed: false,
      reason: 'ignored',
      versionHash,
    }
  }

  if (state.pendingChange?.versionHash === versionHash) {
    return {
      changed: false,
      reason: 'duplicate-pending',
      versionHash,
      change: state.pendingChange,
    }
  }

  state.currentVersion += 1
  state.pendingChange = {
    version: state.currentVersion,
    versionHash,
    content: diskContent,
  }

  return {
    changed: true,
    reason: 'external-change',
    versionHash,
    change: state.pendingChange,
  }
}

function ignorePendingChange(state) {
  if (!state.pendingChange) {
    return null
  }

  state.ignoredVersionHash = state.pendingChange.versionHash
  state.pendingChange = null
  return state.ignoredVersionHash
}

async function runResolveChange({
  state,
  filePath,
  readFile,
  onExternalChange,
  onError,
  generation,
  runToken,
}) {
  if (!isCurrentRun(state, generation, runToken)) {
    return null
  }

  let diskContent

  try {
    diskContent = await readFile(filePath)
  } catch (error) {
    if (isCurrentRun(state, generation, runToken)) {
      onError && onError(error, { stage: 'read' })
    }
    return {
      changed: false,
      reason: 'read-error',
      error,
    }
  }

  if (!isCurrentRun(state, generation, runToken)) {
    return {
      changed: false,
      reason: 'stale',
    }
  }

  const result = resolveExternalChange(state, diskContent)

  if (result.changed !== true || !onExternalChange || !isCurrentRun(state, generation, runToken)) {
    return result
  }

  try {
    await onExternalChange(result.change, result)
  } catch (error) {
    if (isCurrentRun(state, generation, runToken)) {
      onError && onError(error, { stage: 'callback' })
    }
    return {
      ...result,
      changed: false,
      reason: 'callback-error',
      error,
    }
  }

  return result
}

function startWatching({
  state,
  filePath,
  debounceMs = 120,
  readFile = targetPath => fs.readFile(targetPath, 'utf-8'),
  onExternalChange,
  onError,
  watch,
}) {
  const createWatcher = watch
  if (typeof createWatcher !== 'function') {
    throw new TypeError('watch 必须是函数')
  }

  stopWatching(state)

  state.stopped = false
  state.generation += 1
  state.watchingPath = filePath
  const generation = state.generation

  const scheduleResolve = async () => {
    if (state.stopped === true || state.generation !== generation) {
      return null
    }

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
    }

    const runToken = state.latestRunToken + 1
    state.latestRunToken = runToken

    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null
      if (!isCurrentRun(state, generation, runToken)) {
        return
      }

      runResolveChange({
        state,
        filePath,
        readFile,
        onExternalChange,
        onError,
        generation,
        runToken,
      }).catch(() => {})
    }, debounceMs)

    return null
  }

  state.watcher = createWatcher(filePath, scheduleResolve)
  return state.watcher
}

function stopWatching(state) {
  if (!state) {
    return
  }

  state.stopped = true
  state.generation += 1

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer)
    state.debounceTimer = null
  }

  if (state.watcher && typeof state.watcher.close === 'function') {
    state.watcher.close()
  }

  state.watcher = null
  state.watchingPath = null
  resetTrackedState(state)
}

export default {
  createContentVersion,
  createWatchState,
  markInternalSave,
  resolveExternalChange,
  ignorePendingChange,
  startWatching,
  stopWatching,
}
