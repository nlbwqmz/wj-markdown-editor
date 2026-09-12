import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Button, Modal } from 'ant-design-vue'
import { createVNode, h } from 'vue'
import i18n from '@/i18n/index.js'
import channelUtil from '@/util/channel/channelUtil.js'
import { createClosePromptModalController } from '@/util/channel/closePromptModalController.js'
import { requestDocumentSaveAndClose } from '@/util/document-session/rendererDocumentCommandUtil.js'

const { t } = i18n.global
let saveAndCloseRequestPromise = null

function requestSaveAndCloseOnce() {
  if (saveAndCloseRequestPromise) {
    return saveAndCloseRequestPromise
  }

  const pendingRequest = Promise.resolve()
    .then(() => requestDocumentSaveAndClose())
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
    return {
      centered: true,
      // 四个操作按钮在中英文下需要约 480px 内容宽度，默认 416px 会导致 footer 换行。
      width: 560,
      title: t('prompt'),
      icon: createVNode(ExclamationCircleOutlined),
      content: createVNode('div', {}, [
        h('span', { style: { fontWeight: 'bold' } }, snapshot.fileName),
        h('span', {}, t('closeModal.closePrompt')),
      ]),
      footer: h('div', { style: { width: '100%', display: 'flex', flexWrap: 'nowrap', justifyContent: 'right', gap: '10px', paddingTop: '10px' } }, [
        h(Button, {
          onClick: () => {
            channelUtil.send({ event: 'document.cancel-close' }).then(() => {})
          },
        }, () => t('cancelText')),
        h(Button, {
          type: 'primary',
          onClick: async () => {
            await channelUtil.send({ event: 'document.cancel-close' })
            await channelUtil.send({ event: 'open-setting' })
          },
        }, () => t('closeModal.openSetting')),
        h(Button, {
          type: 'primary',
          onClick: () => requestSaveAndCloseOnce(),
        }, () => t('closeModal.saveAndExit')),
        h(Button, {
          type: 'primary',
          danger: true,
          disabled: snapshot.closePrompt.allowForceClose !== true,
          onClick: () => {
            channelUtil.send({ event: 'document.confirm-force-close' }).then(() => {}).catch(() => {})
          },
        }, () => t('closeModal.directExit')),
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
