import { useCommonStore } from '@/stores/counter.js'
import eventEmit from '@/util/channel/eventEmit.js'
import sendUtil from '@/util/channel/sendUtil.js'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Button, message, Modal } from 'ant-design-vue'
import { createVNode, h } from 'vue'

export default {
  link: () => {
    window.node.sendToShow((obj) => {
      eventEmit.publish(obj.event, obj.data)
    })
  },
  on: () => {
    eventEmit.on('always-on-top-changed', (isAlwaysOnTop) => {
      useCommonStore().isAlwaysOnTop = isAlwaysOnTop
    })
    eventEmit.on('file-is-saved', (data) => {
      useCommonStore().saved = data
    })
    eventEmit.on('save-success', (data) => {
      window.document.title = data.fileName === 'Unnamed' ? 'wj-markdown-editor' : data.fileName
      useCommonStore().$patch({
        fileName: data.fileName,
        saved: data.saved,
      })
    })
    eventEmit.on('has-new-version', (flag) => {
      useCommonStore().hasNewVersion = flag
    })
    eventEmit.on('message', (data) => {
      message[data.type]({
        content: data.content,
        key: data.key,
        duration: data.duration,
      })
    })
    eventEmit.on('window-size', (data) => {
      useCommonStore().isMaximize = data.isMaximize
    })
    eventEmit.on('update-config', (data) => {
      useCommonStore().$patch({
        config: data,
      })
    })
    eventEmit.on('unsaved', () => {
      const modal = Modal.confirm({
        centered: true,
        title: '提示',
        icon: createVNode(ExclamationCircleOutlined),
        content: `${useCommonStore().fileName}未保存，是否直接退出？`,
        footer: h('div', { style: { width: '100%', display: 'flex', justifyContent: 'right', gap: '10px', paddingTop: '10px' } }, [
          h(Button, { onClick: () => modal.destroy() }, () => '取消'),
          h(Button, {
            type: 'primary',
            danger: true,
            onClick: () => {
              sendUtil.send({ event: 'force-close' }).then(() => {})
              modal.destroy() },
          }, () => '直接退出'),
        ]),
      })
    })
  },
}
