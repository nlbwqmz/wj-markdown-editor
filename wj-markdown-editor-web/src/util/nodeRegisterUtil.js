import { message } from 'ant-design-vue'
import commonUtil from '@/util/commonUtil'
import store from '@/store'
export default {
  init: () => {
    window.node.showMessage((content, type, duration = 2, destroyBefore) => {
      if (destroyBefore) {
        message.destroy()
      }
      message[type](content, duration)
    })
    window.node.closeMessage(() => {
      message.destroy()
    })
    // window.node.exitModal(() => {
    //   if (!currentExitModal) {
    //     currentExitModal = Modal.confirm({
    //       title: '提示',
    //       centered: true,
    //       width: '500px',
    //       icon: h(ExclamationCircleOutlined),
    //       content: h(
    //         'div', {}, '数据未保存，是否确认退出?'),
    //       footer: h('div', { style: { width: '100%', textAlign: 'right', marginTop: '20px' } },
    //         [
    //           h(Button, { onclick: () => { currentExitModal.destroy(); currentExitModal = undefined }, style: { marginLeft: '10px' } }, () => '取消'),
    //           h(Button, { danger: true, type: 'primary', style: { marginLeft: '10px' }, onclick: () => { nodeRequestUtil.exit() } }, () => '不保存直接退出'),
    //           h(Button, { type: 'primary', style: { marginLeft: '10px' }, onclick: () => { nodeRequestUtil.save(true) } }, () => '保存并退出')]
    //       )
    //     })
    //   }
    // })
    window.node.toggleView(commonUtil.toggleView)
    window.node.shouldUpdateConfig(config => {
      store.commit('updateConfig', config)
    })
  },
  findInPageResult: fun => {
    window.node.findInPageResult(fun)
  },
  insertScreenshotResult: callback => {
    window.node.insertScreenshotResult(callback)
  },
  showMaximizeAction: callback => {
    window.node.showMaximizeAction(callback)
  },
  refreshTitle: callback => {
    window.node.refreshTitle(callback)
  },
  messageToAbout: callback => {
    window.node.messageToAbout(callback)
  },
  updaterDownloadProgress: callback => {
    window.node.updaterDownloadProgress(callback)
  },
  downloadFinish: callback => {
    window.node.downloadFinish(callback)
  }
}
