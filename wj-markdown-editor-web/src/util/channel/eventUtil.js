import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Button, message, Modal } from 'ant-design-vue'
import { createVNode, h } from 'vue'
import i18n from '@/i18n/index.js'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import eventEmit from '@/util/channel/eventEmit.js'

const { t } = i18n.global
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
      // Electron 计算好的保存状态只在这里落到全局 store，
      // 顶部标题栏是否显示红色 * 也是基于这个字段。
      useCommonStore().saved = data
    })
    eventEmit.on('update-recent', (data) => {
      useCommonStore().$patch({
        recentList: data,
      })
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
        content: t(data.content) || data.content,
        key: data.key,
        duration: data.duration,
      })
    })
    eventEmit.on('file-external-changed', (data) => {
      // Electron 在提醒策略下不会直接改前端内容，
      // 而是把 diff 所需数据发过来，由这里打开弹窗。
      useCommonStore().showExternalFileChange(data)
    })
    eventEmit.on('file-content-reloaded', (data) => {
      // 这里表示 Electron 已经完成了内容收敛：
      // 可能是自动应用，也可能是用户在弹窗里点击了“应用”。
      // 前端只需要被动刷新页面和关闭弹窗。
      window.document.title = data.fileName === 'Unnamed' ? 'wj-markdown-editor' : data.fileName
      const store = useCommonStore()
      store.$patch({
        fileName: data.fileName,
        saved: data.saved,
      })
      store.resetExternalFileChange()
    })
    eventEmit.on('file-missing', (data) => {
      // 文件被外部删除或重命名移走时，Electron 只会同步元信息：
      // - 编辑器当前内容仍然保留
      // - 标题与文件名保持原值
      // - 保存状态按最新的 content/tempContent 对比结果更新
      // 同时需要关闭任何仍停留在界面的外部 diff 弹窗。
      window.document.title = data.fileName === 'Unnamed' ? 'wj-markdown-editor' : data.fileName
      const store = useCommonStore()
      store.$patch({
        fileName: data.fileName,
        saved: data.saved,
      })
      store.resetExternalFileChange()
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
        title: t('prompt'),
        icon: createVNode(ExclamationCircleOutlined),
        content: createVNode('div', {}, [
          h('span', { style: { fontWeight: 'bold' } }, useCommonStore().fileName),
          h('span', {}, t('closeModal.closePrompt')),
        ]),
        footer: h('div', { style: { width: '100%', display: 'flex', justifyContent: 'right', gap: '10px', paddingTop: '10px' } }, [
          h(Button, { onClick: () => modal.destroy() }, () => t('cancelText')),
          h(Button, { type: 'primary', onClick: () => {
            modal.destroy()
            channelUtil.send({ event: 'open-setting' }).then(() => {})
          } }, () => t('closeModal.openSetting')),
          h(Button, {
            type: 'primary',
            danger: true,
            onClick: () => {
              channelUtil.send({ event: 'force-close' }).then(() => {})
              modal.destroy() },
          }, () => t('closeModal.confirmExit')),
        ]),
      })
    })
  },
}
