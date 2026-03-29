import { normalizeLocalResourcePath } from '../resourceUrlUtil.js'

function normalizeStringValue(value) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue || null
}

function normalizeClientCoordinate(value) {
  return Number.isFinite(value) ? Math.trunc(value) : null
}

function normalizeAssetSource(value) {
  const normalizedValue = normalizeStringValue(value)
  return normalizedValue ? normalizeLocalResourcePath(normalizedValue) : null
}

function getDatasetValue(element, datasetKey, attributeName) {
  const datasetValue = element?.dataset?.[datasetKey]
  if (typeof datasetValue === 'string' && datasetValue.trim()) {
    return datasetValue
  }

  const attributeValue = element?.getAttribute?.(attributeName)
  if (typeof attributeValue === 'string' && attributeValue.trim()) {
    return attributeValue
  }

  return null
}

function resolvePreviewImageElement(hitElement) {
  if (!hitElement || typeof hitElement !== 'object') {
    return null
  }

  const directSource = getDatasetValue(hitElement, 'wjResourceSrc', 'data-wj-resource-src')
  const directKind = getDatasetValue(hitElement, 'wjResourceKind', 'data-wj-resource-kind')
  if (directSource && (!directKind || directKind === 'image')) {
    return hitElement
  }

  if (typeof hitElement.closest !== 'function') {
    return null
  }

  return hitElement.closest('img[data-wj-resource-src]') || null
}

function matchPreviewImageResource(hitElement, asset) {
  if (asset?.assetType !== 'image') {
    return false
  }

  const imageElement = resolvePreviewImageElement(hitElement)
  if (!imageElement) {
    return false
  }

  const hitSource = normalizeAssetSource(getDatasetValue(imageElement, 'wjResourceSrc', 'data-wj-resource-src'))
  const assetSource = normalizeAssetSource(asset?.rawSrc) || normalizeAssetSource(asset?.rawPath)
  if (!hitSource || !assetSource) {
    return false
  }

  return hitSource === assetSource
}

export async function preparePreviewAssetCopyImagePayload(options = {}) {
  await options.closeMenu?.()
  await options.waitForNextFrame?.()

  const x = normalizeClientCoordinate(options.menuPosition?.x)
  const y = normalizeClientCoordinate(options.menuPosition?.y)
  if (x === null || y === null) {
    return {
      ok: false,
      reason: 'invalid-copy-image-target',
    }
  }

  const hitElement = options.resolveElementFromPoint?.(x, y) || null
  if (matchPreviewImageResource(hitElement, options.asset) !== true) {
    return {
      ok: false,
      reason: 'copy-image-target-unavailable',
    }
  }

  return {
    ok: true,
    payload: {
      ...options.basePayload,
      copyTarget: { x, y },
    },
  }
}

export default {
  preparePreviewAssetCopyImagePayload,
}
