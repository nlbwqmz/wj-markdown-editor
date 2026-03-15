function createPreviewAssetDeleteConfirmController({
  createModal,
} = {}) {
  let currentModal = null

  function open(config) {
    currentModal?.destroy?.()

    let modalRef = null
    modalRef = createModal?.({
      ...config,
      afterClose: () => {
        config?.afterClose?.()
        if (currentModal === modalRef) {
          currentModal = null
        }
      },
    }) || null

    currentModal = modalRef
    return modalRef
  }

  function destroy() {
    const modalToDestroy = currentModal
    currentModal = null
    modalToDestroy?.destroy?.()
  }

  return {
    open,
    destroy,
    getCurrentModal() {
      return currentModal
    },
  }
}

export {
  createPreviewAssetDeleteConfirmController,
}

export default {
  createPreviewAssetDeleteConfirmController,
}
