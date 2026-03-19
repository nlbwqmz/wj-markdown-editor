function normalizeHashAnchor(href) {
  if (typeof href !== 'string' || !href.startsWith('#') || href === '#') {
    return []
  }

  const rawAnchor = href.slice(1).trim()
  if (!rawAnchor) {
    return []
  }

  const anchorValueSet = new Set([rawAnchor])
  try {
    anchorValueSet.add(decodeURIComponent(rawAnchor))
  } catch {
    // 保留原始值，兼容非法编码或无需解码的锚点
  }

  return Array.from(anchorValueSet)
}

function isFootnoteLinkTarget(event) {
  return Boolean(event?.target?.closest?.('.footnote-ref a, .footnote-backref'))
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
  const anchorValueList = normalizeHashAnchor(href)
  if (anchorValueList.length === 0 || !previewRoot?.querySelectorAll) {
    return null
  }

  const candidateList = previewRoot.querySelectorAll('[id], a[name]')
  for (const candidate of candidateList) {
    const candidateAnchorValueList = normalizeHashAnchor(`#${candidate?.id || candidate?.getAttribute?.('name') || ''}`)
    if (candidateAnchorValueList.some(anchorValue => anchorValueList.includes(anchorValue))) {
      return candidate
    }
  }

  return null
}

export function handlePreviewHashAnchorClick({
  event,
  previewRoot,
  previewScrollContainer,
  onTargetMissing,
}) {
  if (isFootnoteLinkTarget(event)) {
    return false
  }

  const linkElement = event?.target?.closest?.('a[href]')
  const href = linkElement?.getAttribute?.('href')
  if (!href?.startsWith('#')) {
    return false
  }

  // 只要已经识别为 hash 锚点，就应接管默认行为，避免浏览器继续走 location/hash 或 `_blank` 打开链路。
  event.preventDefault?.()
  if (href === '#') {
    return true
  }

  const targetElement = findPreviewAnchorTarget({
    previewRoot,
    href,
  })
  if (!targetElement) {
    onTargetMissing?.({ href })
    return true
  }

  const container = resolvePreviewScrollContainer({
    previewRoot,
    previewScrollContainer,
  })
  if (!container?.scrollTo || !container?.getBoundingClientRect || !targetElement?.getBoundingClientRect) {
    onTargetMissing?.({ href })
    return true
  }

  const containerRect = container.getBoundingClientRect()
  const targetRect = targetElement.getBoundingClientRect()
  const targetTop = targetRect.top - containerRect.top - container.clientTop + container.scrollTop

  container.scrollTo({
    top: targetTop,
    behavior: 'smooth',
  })

  return true
}
