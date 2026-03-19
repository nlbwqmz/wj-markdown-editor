function closeSearchBarIfVisible({ controller, store }) {
  const shouldClose = store?.searchBarVisible === true
  if (shouldClose) {
    controller?.close?.(store)
  }
  return shouldClose
}

export {
  closeSearchBarIfVisible,
}
