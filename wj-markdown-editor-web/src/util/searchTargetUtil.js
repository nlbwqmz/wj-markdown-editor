function collectSearchTargetElements(rootElement) {
  if (!rootElement) {
    return []
  }

  const targetElements = []

  if (typeof rootElement.matches === 'function' && rootElement.matches('.allow-search')) {
    targetElements.push(rootElement)
  }

  if (typeof rootElement.querySelectorAll === 'function') {
    targetElements.push(...rootElement.querySelectorAll('.allow-search'))
  }

  return Array.from(new Set(targetElements))
}

export {
  collectSearchTargetElements,
}
