function createSearchBarController() {
  let cleanupHandler = null

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

  function close(store) {
    const currentCleanupHandler = cleanupHandler
    cleanupHandler = null
    currentCleanupHandler?.()
    store.searchBarVisible = false
  }

  return {
    registerCleanup,
    unregisterCleanup,
    close,
  }
}

const previewSearchBarController = createSearchBarController()

export {
  createSearchBarController,
  previewSearchBarController,
}
