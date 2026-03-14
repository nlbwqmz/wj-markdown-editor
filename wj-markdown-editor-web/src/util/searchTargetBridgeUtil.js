function createSearchTargetBridge({
  controller,
  getTargetElements,
}) {
  let active = false
  const provider = () => typeof getTargetElements === 'function' ? getTargetElements() : []

  function activate() {
    if (active === true) {
      return false
    }
    active = true
    controller?.registerTargetProvider?.(provider)
    return true
  }

  function deactivate(options) {
    if (active === false) {
      return false
    }
    active = false
    controller?.unregisterTargetProvider?.(provider, options)
    return true
  }

  return {
    activate,
    deactivate,
  }
}

export {
  createSearchTargetBridge,
}
