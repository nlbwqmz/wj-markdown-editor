import { message } from 'ant-design-vue'
import i18n from '@/i18n/index.js'
import { useCommonStore } from '@/stores/counter.js'
import { syncClosePromptSnapshot } from '@/util/channel/closePromptSyncService.js'
import eventEmit from '@/util/channel/eventEmit.js'
import { resolveWindowMessageContent } from '@/util/channel/windowEffectMessageUtil.js'
import {
  createDocumentSessionEventHandlers,
  DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT,
} from '@/util/document-session/documentSessionEventUtil.js'
import { handleFlushRequest } from '@/util/document-session/rendererSessionContentFlushService.js'

const { t } = i18n.global

function setDocumentTitle(title) {
  window.document.title = title || 'wj-markdown-editor'
}

function showWindowEffectMessage(data) {
  if (!data?.type || typeof message[data.type] !== 'function') {
    return
  }

  const content = resolveWindowMessageContent(data, t)
  if (!content) {
    return
  }

  message[data.type]({
    content,
    key: data.key,
    duration: data.duration,
  })
}

function syncClosePrompt(snapshot) {
  syncClosePromptSnapshot(snapshot)
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
    eventEmit.on('full-screen-changed', (isFullScreen) => {
      store.isFullScreen = isFullScreen
    })
    Object.entries(documentSessionEventHandlers).forEach(([eventName, handler]) => {
      eventEmit.on(eventName, handler)
    })
    // session 路径的一次性提示已经收口到 `window.effect.message`。
    // 这里继续保留 legacy `message` 监听，只为了兼容导出、上传等非 session 流程。
    // 关窗口时主进程会反向要求渲染层把各标签的当前正文推上来，
    // 收到 ack 后它才会进入保存流程；提前 ack 等于让它拿旧正文写盘。
    eventEmit.on('document.flush-request', (data) => {
      handleFlushRequest(data).catch(() => {})
    })
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
