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
    // 保留原始值，兼容非法编码或无需解码的锚点。
  }

  return Array.from(anchorValueSet)
}

function resolvePreviewAnchorCandidateList({
  previewRoot,
  candidateList,
}) {
  if (Array.isArray(candidateList)) {
    return candidateList
  }

  if (!previewRoot?.querySelectorAll) {
    return []
  }

  return Array.from(previewRoot.querySelectorAll('[id], a[name]'))
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
  candidateList,
}) {
  const anchorValueList = normalizeHashAnchor(href)
  if (anchorValueList.length === 0) {
    return null
  }

  const resolvedCandidateList = resolvePreviewAnchorCandidateList({
    previewRoot,
    candidateList,
  })
  for (const candidate of resolvedCandidateList) {
    const candidateAnchorValueList = normalizeHashAnchor(`#${candidate?.id || candidate?.getAttribute?.('name') || ''}`)
    if (candidateAnchorValueList.some(anchorValue => anchorValueList.includes(anchorValue))) {
      return candidate
    }
  }

  return null
}

export function resolvePreviewAnchorScrollTop({
  container,
  targetElement,
}) {
  if (!container?.getBoundingClientRect || !targetElement?.getBoundingClientRect) {
    return null
  }

  const containerRect = container.getBoundingClientRect()
  const targetRect = targetElement.getBoundingClientRect()
  return targetRect.top - containerRect.top - container.clientTop + container.scrollTop
}

export function scrollPreviewToAnchor({
  previewRoot,
  previewScrollContainer,
  href,
  onTargetMissing,
  candidateList,
  targetElement,
}) {
  const resolvedTargetElement = targetElement || findPreviewAnchorTarget({
    previewRoot,
    href,
    candidateList,
  })
  if (!resolvedTargetElement) {
    onTargetMissing?.({ href })
    return null
  }

  const container = resolvePreviewScrollContainer({
    previewRoot,
    previewScrollContainer,
  })
  if (!container?.scrollTo) {
    onTargetMissing?.({ href })
    return null
  }

  const targetTop = resolvePreviewAnchorScrollTop({
    container,
    targetElement: resolvedTargetElement,
  })
  if (Number.isFinite(targetTop) !== true) {
    onTargetMissing?.({ href })
    return null
  }

  container.scrollTo({
    top: targetTop,
  })

  return {
    container,
    targetElement: resolvedTargetElement,
    targetTop,
  }
}
