import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Button, Modal } from 'ant-design-vue'
import { createVNode, h } from 'vue'
import i18n from '@/i18n/index.js'
import channelUtil from '@/util/channel/channelUtil.js'
import { createClosePromptModalController } from '@/util/channel/closePromptModalController.js'
import { requestDocumentSaveAndClose } from '@/util/document-session/rendererDocumentCommandUtil.js'

const { t } = i18n.global
let saveAndCloseRequestPromise = null

function requestSaveAndCloseOnce(scope = 'window') {
  if (saveAndCloseRequestPromise) {
    return saveAndCloseRequestPromise
  }

  const pendingRequest = Promise.resolve()
    .then(() => requestDocumentSaveAndClose({ scope }))
    .catch(() => null)
    .finally(() => {
      if (saveAndCloseRequestPromise === pendingRequest) {
        saveAndCloseRequestPromise = null
      }
    })
  saveAndCloseRequestPromise = pendingRequest
  return pendingRequest
}

function resetSaveAndCloseRequest() {
  saveAndCloseRequestPromise = null
}

const closePromptModalController = createClosePromptModalController({
  createModal: config => Modal.confirm(config),
  buildModalConfig(snapshot, { afterClose } = {}) {
    const closePrompt = snapshot.closePrompt || {}
    const isTabScope = closePrompt.scope === 'tab'
    // 多标签下的关闭确认是“笼统提示”：只告诉用户有多少个标签页没保存，
    // 不逐条列出文件名，避免弹窗变成清单。
    const unsavedTabCount = Number.isInteger(closePrompt.unsavedTabCount) && closePrompt.unsavedTabCount > 0
      ? closePrompt.unsavedTabCount
      : 1
    const showFileName = unsavedTabCount <= 1
    const promptMessage = unsavedTabCount > 1
      ? t('closeModal.closePromptMultiple', { count: unsavedTabCount })
      : (isTabScope ? t('closeModal.closeTabPrompt') : t('closeModal.closePrompt'))

    return {
      centered: true,
      // 四个操作按钮在中英文下需要约 480px 内容宽度，默认 416px 会导致 footer 换行。
      width: 560,
      title: t('prompt'),
      icon: createVNode(ExclamationCircleOutlined),
      content: createVNode('div', {}, [
        ...(showFileName
          ? [h('span', { style: { fontWeight: 'bold' } }, snapshot.fileName)]
          : []),
        h('span', {}, promptMessage),
      ]),
      footer: h('div', { style: { width: '100%', display: 'flex', flexWrap: 'nowrap', justifyContent: 'right', gap: '10px', paddingTop: '10px' } }, [
        h(Button, {
          onClick: () => {
            channelUtil.send({ event: 'document.cancel-close' }).then(() => {})
          },
        }, () => t('cancelText')),
        // 关单个标签时，“打开设置”与本次决策无关，不占按钮位。
        ...(isTabScope
          ? []
          : [h(Button, {
              type: 'primary',
              onClick: async () => {
                await channelUtil.send({ event: 'document.cancel-close' })
                await channelUtil.send({ event: 'open-setting' })
              },
            }, () => t('closeModal.openSetting'))]),
        h(Button, {
          type: 'primary',
          onClick: () => requestSaveAndCloseOnce(isTabScope ? 'tab' : 'window'),
        }, () => (isTabScope ? t('closeModal.saveAndClose') : t('closeModal.saveAndExit'))),
        h(Button, {
          type: 'primary',
          danger: true,
          disabled: closePrompt.allowForceClose !== true,
          onClick: () => {
            channelUtil.send({ event: 'document.confirm-force-close' }).then(() => {}).catch(() => {})
          },
        }, () => (isTabScope ? t('closeModal.directClose') : t('closeModal.directExit'))),
      ]),
      afterClose,
    }
  },
})

function destroyClosePromptModal() {
  resetSaveAndCloseRequest()
  closePromptModalController.destroy()
}

function syncClosePromptSnapshot(snapshot) {
  if (!snapshot?.closePrompt?.visible) {
    destroyClosePromptModal()
    return
  }

  // closePrompt 的可见态来自统一的 session snapshot，
  // 因此 bootstrap / push / force-close 收敛都必须走这一条 service，
  // 不能让不同页面各自决定“什么时候该弹、什么时候该关”。
  closePromptModalController.sync(snapshot)
}

export {
  destroyClosePromptModal,
  syncClosePromptSnapshot,
}

export default {
  destroyClosePromptModal,
  syncClosePromptSnapshot,
}
