function createRendererSessionEventSubscription({
  eventName,
  listener,
  addListener,
  removeListener,
} = {}) {
  let active = false
  let disposed = false

  function activate() {
    if (disposed === true || active === true) {
      return false
    }

    addListener?.(eventName, listener)
    active = true
    return true
  }

  function deactivate() {
    if (active === false) {
      return false
    }

    removeListener?.(eventName, listener)
    active = false
    return true
  }

  function dispose() {
    if (disposed === true) {
      return false
    }

    deactivate()
    disposed = true
    return true
  }

  return {
    activate,
    deactivate,
    dispose,
  }
}

export {
  createRendererSessionEventSubscription,
}

export default {
  createRendererSessionEventSubscription,
}
