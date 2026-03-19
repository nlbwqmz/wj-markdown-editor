export function createLayoutTopOpenFolderAction({
  sendCommand,
  notifyDocumentNotSaved,
}) {
  return async function openFolder() {
    const result = await sendCommand({ event: 'document.open-in-folder' })
    if (result?.ok === false && result.reason === 'document-not-saved') {
      notifyDocumentNotSaved()
    }
    return result
  }
}

export default {
  createLayoutTopOpenFolderAction,
}
