function createResourceRequestContext(snapshot) {
  return {
    sessionId: snapshot?.sessionId ?? null,
    documentPath: snapshot?.resourceContext?.documentPath ?? null,
  }
}

export {
  createResourceRequestContext,
}

export default {
  createResourceRequestContext,
}
