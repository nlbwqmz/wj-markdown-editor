import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Button, message, Modal } from 'ant-design-vue'
import { createVNode, h } from 'vue'
import i18n from '@/i18n/index.js'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import eventEmit from '@/util/channel/eventEmit.js'
import {
  createDocumentSessionEventHandlers,
  createWindowEffectMessageDeduper,
  DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT,
} from '@/util/document-session/documentSessionEventUtil.js'

const { t } = i18n.global
let closePromptModal = null
const windowEffectMessageDeduper = createWindowEffectMessageDeduper()

function setDocumentTitle(title) {
  window.document.title = title || 'wj-markdown-editor'
}

function showWindowEffectMessage(data) {
  if (!data?.type || typeof message[data.type] !== 'function') {
    return
  }
  if (windowEffectMessageDeduper.shouldDisplay(data) !== true) {
    return
  }

  message[data.type]({
    content: t(data.content) || data.content,
    key: data.key,
    duration: data.duration,
  })
}

function destroyClosePromptModal() {
  const modalInstance = closePromptModal
  if (!modalInstance) {
    return
  }

  closePromptModal = null
  modalInstance.destroy()
}

function syncClosePrompt(snapshot) {
  if (!snapshot?.closePrompt?.visible) {
    destroyClosePromptModal()
    return
  }

  if (closePromptModal) {
    return
  }

  const modalInstance = Modal.confirm({
    centered: true,
    title: t('prompt'),
    icon: createVNode(ExclamationCircleOutlined),
    content: createVNode('div', {}, [
      h('span', { style: { fontWeight: 'bold' } }, snapshot.fileName),
      h('span', {}, t('closeModal.closePrompt')),
    ]),
    footer: h('div', { style: { width: '100%', display: 'flex', justifyContent: 'right', gap: '10px', paddingTop: '10px' } }, [
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
        danger: true,
        disabled: snapshot.closePrompt.allowForceClose !== true,
        onClick: () => {
          channelUtil.send({ event: 'document.confirm-force-close' }).then(() => {})
        },
      }, () => t('closeModal.confirmExit')),
    ]),
    afterClose: () => {
      if (closePromptModal === modalInstance) {
        closePromptModal = null
      }
    },
  })
  closePromptModal = modalInstance
}

export default {
  link: () => {
    window.node.sendToShow((obj) => {
      eventEmit.publish(obj.event, obj.data)
    })
  },
  on: () => {
    const store = useCommonStore()
    const documentSessionEventHandlers = createDocumentSessionEventHandlers({
      store,
      publishSnapshotChanged: snapshot => eventEmit.publish(DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT, snapshot),
      showMessage: showWindowEffectMessage,
      setDocumentTitle,
      syncClosePrompt,
    })

    eventEmit.on('always-on-top-changed', (isAlwaysOnTop) => {
      store.isAlwaysOnTop = isAlwaysOnTop
    })
    Object.entries(documentSessionEventHandlers).forEach(([eventName, handler]) => {
      eventEmit.on(eventName, handler)
    })
    // 旧 `message` 事件仍被导出、上传等非 session 流程使用，
    // 因此在 renderer 完成全量迁移前要继续保留兼容入口。
    eventEmit.on('message', (data) => {
      showWindowEffectMessage(data)
    })
    eventEmit.on('has-new-version', (flag) => {
      store.hasNewVersion = flag
    })
    eventEmit.on('window-size', (data) => {
      store.isMaximize = data.isMaximize
    })
    eventEmit.on('update-config', (data) => {
      store.config = data
    })
  },
}
