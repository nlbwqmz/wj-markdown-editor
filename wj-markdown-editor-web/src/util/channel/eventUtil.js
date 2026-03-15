import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Button, message, Modal } from 'ant-design-vue'
import { createVNode, h } from 'vue'
import i18n from '@/i18n/index.js'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import { createClosePromptModalController } from '@/util/channel/closePromptModalController.js'
import eventEmit from '@/util/channel/eventEmit.js'
import {
  createDocumentSessionEventHandlers,
  createWindowEffectMessageDeduper,
  DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT,
} from '@/util/document-session/documentSessionEventUtil.js'

const { t } = i18n.global
const windowEffectMessageDeduper = createWindowEffectMessageDeduper()
const closePromptModalController = createClosePromptModalController({
  createModal: config => Modal.confirm(config),
  buildModalConfig(snapshot, { afterClose } = {}) {
    return {
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
      afterClose,
    }
  },
})

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
  closePromptModalController.destroy()
}

function syncClosePrompt(snapshot) {
  if (!snapshot?.closePrompt?.visible) {
    destroyClosePromptModal()
    return
  }

  // 关闭确认态会跟随 document snapshot 演进。
  // 只要 prompt 仍然可见，就必须把最新 fileName / allowForceClose 投影到同一个 modal，
  // 不能因为实例已存在就忽略后续快照。
  closePromptModalController.sync(snapshot)
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
