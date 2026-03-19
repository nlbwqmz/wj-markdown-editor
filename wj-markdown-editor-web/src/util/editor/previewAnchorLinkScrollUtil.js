function normalizeHashAnchor(href) {
  if (typeof href !== 'string' || !href.startsWith('#') || href === '#') {
    return ''
  }

  const rawAnchor = href.slice(1).trim()
  if (!rawAnchor) {
    return ''
  }

  try {
    return decodeURIComponent(rawAnchor)
  } catch {
    return rawAnchor
  }
}

export function resolvePreviewScrollContainer({
  previewRoot,
  previewScrollContainer,
}) {
  if (typeof previewScrollContainer === 'function') {
    return previewScrollContainer({ previewRoot }) || previewRoot
  }

  return previewScrollContainer || previewRoot
}

export function findPreviewAnchorTarget({
  previewRoot,
  href,
}) {
  const anchor = normalizeHashAnchor(href)
  if (!anchor || !previewRoot?.querySelectorAll) {
    return null
  }

  const candidateList = previewRoot.querySelectorAll('[id], a[name]')
  for (const candidate of candidateList) {
    if (candidate?.id === anchor || candidate?.getAttribute?.('name') === anchor) {
      return candidate
    }
  }

  return null
}

export function handlePreviewHashAnchorClick({
  event,
  previewRoot,
  previewScrollContainer,
}) {
  const linkElement = event?.target?.closest?.('a[href]')
  const href = linkElement?.getAttribute?.('href')
  if (!href?.startsWith('#') || href === '#') {
    return false
  }

  const targetElement = findPreviewAnchorTarget({
    previewRoot,
    href,
  })
  if (!targetElement) {
    return false
  }

  const container = resolvePreviewScrollContainer({
    previewRoot,
    previewScrollContainer,
  })
  if (!container?.scrollTo || !container?.getBoundingClientRect || !targetElement?.getBoundingClientRect) {
    return false
  }

  const containerRect = container.getBoundingClientRect()
  const targetRect = targetElement.getBoundingClientRect()
  const targetTop = targetRect.top - containerRect.top - container.clientTop + container.scrollTop

  event.preventDefault?.()
  container.scrollTo({
    top: targetTop,
    behavior: 'smooth',
  })

  return true
}
