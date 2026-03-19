async function handleStartupOpenRequest({
  targetPath,
  baseDir,
  openDocumentPath,
  createDraftWindow,
}) {
  const openResult = await openDocumentPath(targetPath, {
    trigger: 'startup',
    baseDir,
  })
  if (openResult?.ok === true) {
    return openResult
  }

  await createDraftWindow()
  return openResult
}

async function handleSecondInstanceOpenRequest({
  targetPath,
  baseDir,
  openDocumentPath,
}) {
  return await openDocumentPath(targetPath, {
    trigger: 'second-instance',
    baseDir,
  })
}

export {
  handleSecondInstanceOpenRequest,
  handleStartupOpenRequest,
}

export default {
  handleSecondInstanceOpenRequest,
  handleStartupOpenRequest,
}
