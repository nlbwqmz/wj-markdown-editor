import {
  findPreviewAnchorTarget,
  resolvePreviewScrollContainer,
  scrollPreviewToAnchor,
} from './previewAnchorScrollUtil.js'

function isFootnoteLinkTarget(event) {
  return Boolean(event?.target?.closest?.('.footnote-ref a, .footnote-backref'))
}

export {
  findPreviewAnchorTarget,
  resolvePreviewScrollContainer,
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

  scrollPreviewToAnchor({
    previewRoot,
    previewScrollContainer,
    href,
    onTargetMissing,
  })

  return true
}
