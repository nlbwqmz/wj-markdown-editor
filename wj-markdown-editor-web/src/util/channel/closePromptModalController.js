function createClosePromptModalController({
  createModal,
  buildModalConfig,
} = {}) {
  let currentModal = null

  // 只允许“当前仍然活着的那一个 modal”清空引用。
  // 这样旧实例的 afterClose 即使晚到，也不会把新实例误清掉。
  function clearCurrentModal(targetModal) {
    if (!targetModal || currentModal !== targetModal) {
      return
    }
    currentModal = null
  }

  // 外部主动销毁时，先断开当前引用，再调用实例销毁。
  // 这样即使 destroy 内部同步触发 afterClose，也不会再次污染状态。
  function destroy() {
    const modalToDestroy = currentModal
    if (!modalToDestroy) {
      return
    }

    currentModal = null
    modalToDestroy.destroy?.()
  }

  // `sync()` 是唯一入口：
  // 1. prompt 不可见时销毁实例
  // 2. prompt 仍可见且已有实例时原地 update
  // 3. 没有实例时创建新 modal
  //
  // 这样 eventUtil 每次吃到最新 snapshot 时都只需要把快照喂进来，
  // 不再自己判断“当前该 create / update / destroy 哪一种”。
  function sync(snapshot) {
    if (!snapshot?.closePrompt?.visible) {
      destroy()
      return null
    }

    if (currentModal && typeof currentModal.update === 'function') {
      const modalToUpdate = currentModal
      currentModal.update(buildModalConfig?.(snapshot, {
        afterClose: () => {
          clearCurrentModal(modalToUpdate)
        },
      }) || {})
      return currentModal
    }

    if (currentModal) {
      destroy()
    }

    let createdModal = null
    const modalConfig = buildModalConfig?.(snapshot, {
      afterClose: () => {
        clearCurrentModal(createdModal)
      },
    }) || {}
    createdModal = createModal?.(modalConfig) || null
    currentModal = createdModal
    return currentModal
  }

  return {
    sync,
    destroy,
    getCurrentModal() {
      return currentModal
    },
  }
}

export {
  createClosePromptModalController,
}

export default {
  createClosePromptModalController,
}
