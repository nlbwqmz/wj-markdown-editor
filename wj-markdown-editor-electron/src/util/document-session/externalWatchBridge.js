import path from 'node:path'
import fileWatchUtil from '../fileWatchUtil.js'

function getContentVersion(content = '') {
  return fileWatchUtil.createContentVersion?.(content) || ''
}

function resetTrackedWatchHistory(watchState) {
  if (!watchState) {
    return
  }

  watchState.currentVersion = 0
  watchState.lastInternalSaveAt = 0
  watchState.lastInternalSavedVersion = null
  watchState.recentInternalSaves = []
  watchState.lastHandledVersionHash = null
  watchState.pendingChange = null
  watchState.fileExists = false
}

function wasWatchEventAccepted(previousObservedFloor, dispatchResult, observedAt) {
  const nextObservedFloor = Number.isFinite(dispatchResult?.session?.watchRuntime?.eventFloorObservedAt)
    ? dispatchResult.session.watchRuntime.eventFloorObservedAt
    : 0

  if (Number.isFinite(observedAt)) {
    return nextObservedFloor === observedAt && nextObservedFloor > previousObservedFloor
  }

  return nextObservedFloor > previousObservedFloor
}

export function createExternalWatchBridge({
  watch,
  watchState = fileWatchUtil.createWatchState(),
  dispatchCommand = async () => null,
  getCurrentBindingToken = () => null,
  getCurrentObservedFloor = () => 0,
} = {}) {
  function stop() {
    fileWatchUtil.stopWatching(watchState)
    return watchState.watcher === null && watchState.subscription === null
  }

  function markInternalSave(content) {
    if (!watchState?.watcher) {
      return null
    }
    return fileWatchUtil.markInternalSave(watchState, content)
  }

  function settlePendingChange(versionHash) {
    return fileWatchUtil.settlePendingChange(watchState, versionHash)
  }

  function ignorePendingChange() {
    return fileWatchUtil.ignorePendingChange(watchState)
  }

  function resetHistory() {
    resetTrackedWatchHistory(watchState)
  }

  function settlePendingChangeIfNeeded({
    versionHash,
    previousObservedFloor,
    observedAt,
    dispatchResult,
  }) {
    if (!versionHash) {
      return
    }

    if (!wasWatchEventAccepted(previousObservedFloor, dispatchResult, observedAt)) {
      return
    }

    const pendingVersionHash = dispatchResult?.session?.externalRuntime?.pendingExternalChange?.versionHash || null
    if (pendingVersionHash === versionHash) {
      return
    }

    if (dispatchResult?.session?.externalRuntime?.lastHandledVersionHash === versionHash) {
      settlePendingChange(versionHash)
    }
  }

  function resetHistoryIfMissingAccepted({
    previousObservedFloor,
    observedAt,
    dispatchResult,
  }) {
    if (!wasWatchEventAccepted(previousObservedFloor, dispatchResult, observedAt)) {
      return
    }

    if (dispatchResult?.session?.documentSource?.exists === false) {
      resetHistory()
    }
  }

  function start(options = {}) {
    const requestedPath = typeof options?.watchingPath === 'string' && options.watchingPath.trim() !== ''
      ? options.watchingPath
      : null
    if (!requestedPath) {
      return {
        ok: false,
        watchingPath: null,
        watchingDirectoryPath: null,
        error: new Error('watch path missing'),
      }
    }

    const bindingToken = Number.isFinite(options?.bindingToken)
      ? options.bindingToken
      : getCurrentBindingToken()
    const currentSubscriptionBindingToken = Number.isFinite(watchState?.subscription?.bindingToken)
      ? watchState.subscription.bindingToken
      : null
    if (watchState.watchingPath === requestedPath
      && watchState.watcher
      && currentSubscriptionBindingToken === bindingToken) {
      return {
        ok: true,
        watchingPath: requestedPath,
        watchingDirectoryPath: watchState.watchingDirectoryPath || path.dirname(requestedPath),
      }
    }

    stop()
    fileWatchUtil.startWatching({
      state: watchState,
      filePath: requestedPath,
      bindingToken,
      watch,
      onExternalChange: async (change, meta = {}) => {
        const observedAt = meta.observedAt ?? change?.observedAt
        const previousObservedFloor = getCurrentObservedFloor()
        const diskContent = change?.content ?? change?.diskContent ?? ''
        const versionHash = change?.versionHash || getContentVersion(diskContent)
        const dispatchResult = await dispatchCommand('watch.file-changed', {
          bindingToken: meta.bindingToken ?? change?.bindingToken ?? bindingToken,
          watchingPath: meta.watchingPath ?? change?.watchingPath ?? requestedPath,
          observedAt,
          diskContent,
          diskStat: meta.diskStat ?? change?.diskStat ?? change?.stat ?? null,
        }, {
          publishSnapshotChanged: 'if-changed',
        })

        settlePendingChangeIfNeeded({
          versionHash,
          previousObservedFloor,
          observedAt,
          dispatchResult,
        })
      },
      onMissing: async (error, meta = {}) => {
        const observedAt = meta.observedAt
        const previousObservedFloor = getCurrentObservedFloor()
        const dispatchResult = await dispatchCommand('watch.file-missing', {
          bindingToken: meta.bindingToken ?? bindingToken,
          watchingPath: meta.watchingPath ?? requestedPath,
          observedAt,
          error,
        }, {
          publishSnapshotChanged: 'if-changed',
        })

        resetHistoryIfMissingAccepted({
          previousObservedFloor,
          observedAt,
          dispatchResult,
        })
      },
      onRestored: async (diskContent, meta = {}) => {
        await dispatchCommand('watch.file-restored', {
          bindingToken: meta.bindingToken ?? bindingToken,
          watchingPath: meta.watchingPath ?? requestedPath,
          observedAt: meta.observedAt,
          diskContent,
          diskStat: meta.diskStat ?? null,
        }, {
          publishSnapshotChanged: 'if-changed',
        })
      },
      onError: (error, meta = {}) => {
        void dispatchCommand('watch.error', {
          bindingToken: meta.bindingToken ?? bindingToken,
          watchingPath: meta.watchingPath ?? requestedPath,
          error,
        })
      },
    })

    return {
      ok: true,
      watchingPath: requestedPath,
      watchingDirectoryPath: watchState.watchingDirectoryPath || path.dirname(requestedPath),
    }
  }

  return {
    state: watchState,
    start,
    stop,
    markInternalSave,
    settlePendingChange,
    ignorePendingChange,
    resetHistory,
  }
}

export default {
  createExternalWatchBridge,
}
