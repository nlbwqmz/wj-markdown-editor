function createSnapshotSignature(snapshot) {
  return JSON.stringify({
    sessionId: snapshot?.sessionId ?? null,
    documentPath: snapshot?.resourceContext?.documentPath ?? null,
    content: typeof snapshot?.content === 'string' ? snapshot.content : '',
  })
}

function createPreviewAssetSessionController({
  onContextInvalidated,
} = {}) {
  let currentSignature = null
  let currentVersion = 0
  let currentSessionId = null
  let currentDocumentPath = null

  function syncSnapshot(snapshot) {
    const nextSignature = createSnapshotSignature(snapshot)
    const nextSessionId = snapshot?.sessionId ?? null
    const nextDocumentPath = snapshot?.resourceContext?.documentPath ?? null

    if (currentSignature === null) {
      currentSignature = nextSignature
      currentSessionId = nextSessionId
      currentDocumentPath = nextDocumentPath
      return false
    }

    if (nextSignature === currentSignature) {
      currentSessionId = nextSessionId
      currentDocumentPath = nextDocumentPath
      return false
    }

    currentVersion += 1
    currentSignature = nextSignature
    currentSessionId = nextSessionId
    currentDocumentPath = nextDocumentPath
    onContextInvalidated?.(snapshot)
    return true
  }

  function captureActionContext() {
    return {
      version: currentVersion,
      sessionId: currentSessionId,
      documentPath: currentDocumentPath,
    }
  }

  function isActiveContext(actionContext) {
    return actionContext?.version === currentVersion
      && actionContext?.sessionId === currentSessionId
      && actionContext?.documentPath === currentDocumentPath
  }

  function createRequestContext(actionContext = captureActionContext()) {
    return {
      sessionId: actionContext?.sessionId ?? null,
      documentPath: actionContext?.documentPath ?? null,
    }
  }

  function invalidateActiveContext(meta = {}) {
    if (currentSignature === null && currentSessionId === null && currentDocumentPath === null) {
      return false
    }

    // keep-alive 只是停用页面，不会卸载组件。
    // 这里必须让旧 actionContext 立刻失效，避免隐藏页面上的确认框继续删文件。
    currentVersion += 1
    onContextInvalidated?.(meta)
    return true
  }

  return {
    syncSnapshot,
    captureActionContext,
    isActiveContext,
    createRequestContext,
    invalidateActiveContext,
  }
}

export {
  createPreviewAssetSessionController,
}

export default {
  createPreviewAssetSessionController,
}
