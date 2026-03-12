function normalizeReferenceCount(referenceCount) {
  const normalizedCount = Number.parseInt(referenceCount, 10)
  return Number.isNaN(normalizedCount) || normalizedCount <= 1 ? 1 : normalizedCount
}

export function getPreviewAssetDeleteReasonMessageKey(reason) {
  if (reason === 'invalid-resource-url' || reason === 'invalid-resource-payload') {
    return 'message.invalidLocalResourceLink'
  }
  if (reason === 'relative-resource-without-document') {
    return 'message.relativeResourceRequiresSavedFile'
  }
  if (reason === 'not-found') {
    return 'message.theFileDoesNotExist'
  }
  if (reason === 'unsupported-target') {
    return 'previewAssetMenu.deleteUnsupportedTarget'
  }
  if (reason === 'directory-not-allowed') {
    return 'previewAssetMenu.deleteDirectoryNotAllowed'
  }
  return null
}

export function resolvePreviewAssetDeletePlan(resourceInfo, referenceCount) {
  const normalizedReferenceCount = normalizeReferenceCount(referenceCount)
  const basePlan = {
    mode: normalizedReferenceCount > 1 ? 'multi' : 'single',
    deleteFileEnabled: false,
    deleteAllReferencesEnabled: normalizedReferenceCount > 1,
    reason: 'resolved',
    reasonMessageKey: null,
    blockMessageKey: null,
  }

  if (resourceInfo?.isDirectory === true) {
    return {
      ...basePlan,
      mode: 'blocked',
      deleteAllReferencesEnabled: false,
      reason: 'directory-not-allowed',
      reasonMessageKey: 'previewAssetMenu.deleteDirectoryNotAllowed',
      blockMessageKey: 'previewAssetMenu.deleteDirectoryNotAllowed',
    }
  }

  if (resourceInfo?.ok === true && resourceInfo.exists === true && resourceInfo.isFile === true) {
    return {
      ...basePlan,
      deleteFileEnabled: true,
    }
  }

  const reason = resourceInfo?.ok !== true
    ? (resourceInfo?.reason || 'invalid-resource-url')
    : resourceInfo?.exists !== true
      ? 'not-found'
      : 'unsupported-target'

  return {
    ...basePlan,
    reason,
    reasonMessageKey: getPreviewAssetDeleteReasonMessageKey(reason),
  }
}

export function shouldContinueMarkdownCleanup(reason) {
  return [
    'invalid-resource-url',
    'invalid-resource-payload',
    'relative-resource-without-document',
    'not-found',
    'unsupported-target',
    'directory-not-allowed',
  ].includes(reason)
}

export default {
  getPreviewAssetDeleteReasonMessageKey,
  resolvePreviewAssetDeletePlan,
  shouldContinueMarkdownCleanup,
}
