function createSearchBarController() {
  let cleanupHandler = null
  let targetProvider = null
  let lastTargetElements = []
  let cleanupTargetElements = []

  function normalizeTargetElements(rawElements, { includeDisconnected = false } = {}) {
    if (!rawElements) {
      return []
    }
    const targetList = typeof rawElements.length === 'number'
      ? Array.from(rawElements)
      : [rawElements]
    return targetList.filter((item) => {
      if (!item || item.nodeType !== 1) {
        return false
      }
      if (includeDisconnected === true) {
        return true
      }
      return item.isConnected !== false
    })
  }

  function mergeTargetElements(...targetGroups) {
    const nodeSet = new Set()
    const targetList = []
    targetGroups.flat().forEach((item) => {
      if (!item || item.nodeType !== 1 || nodeSet.has(item)) {
        return
      }
      nodeSet.add(item)
      targetList.push(item)
    })
    return targetList
  }

  function resolveProviderTargetElements(provider = targetProvider, options = {}) {
    if (typeof provider !== 'function') {
      return []
    }
    return normalizeTargetElements(provider(), options)
  }

  function syncLastTargetElements() {
    lastTargetElements = resolveProviderTargetElements(targetProvider, { includeDisconnected: true })
    return lastTargetElements
  }

  function getTargetElements() {
    return resolveProviderTargetElements(targetProvider)
  }

  function getCleanupTargetElements() {
    const currentTargetElements = resolveProviderTargetElements(targetProvider, { includeDisconnected: true })
    return mergeTargetElements(cleanupTargetElements, lastTargetElements, currentTargetElements)
  }

  function registerCleanup(handler) {
    cleanupHandler = typeof handler === 'function' ? handler : null
  }

  function unregisterCleanup(handler) {
    if (!handler || cleanupHandler === handler) {
      const registered = cleanupHandler !== null
      cleanupHandler = null
      return registered
    }
    return false
  }

  function registerTargetProvider(provider) {
    targetProvider = typeof provider === 'function' ? provider : null
    syncLastTargetElements()
  }

  function unregisterTargetProvider(provider, { preserveCleanupTarget = true } = {}) {
    if (!provider || targetProvider === provider) {
      const registered = targetProvider !== null
      targetProvider = null
      if (registered) {
        cleanupTargetElements = preserveCleanupTarget === true ? getCleanupTargetElements() : []
        lastTargetElements = []
      }
      return registered
    }
    return false
  }

  function close(store) {
    const currentCleanupHandler = cleanupHandler
    const currentCleanupTargetElements = getCleanupTargetElements()
    cleanupHandler = null
    currentCleanupHandler?.({ targetElements: currentCleanupTargetElements })
    cleanupTargetElements = []
    store.searchBarVisible = false
  }

  return {
    registerCleanup,
    unregisterCleanup,
    registerTargetProvider,
    unregisterTargetProvider,
    getTargetElements,
    getCleanupTargetElements,
    close,
  }
}

const previewSearchBarController = createSearchBarController()

export {
  createSearchBarController,
  previewSearchBarController,
}
