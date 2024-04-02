import { Button, Input, message, Modal } from 'ant-design-vue'
import commonUtil from '@/util/commonUtil'
import store from '@/store'
import router from '@/router'
import { createApp } from 'vue'
import SaveTo from '@/components/SaveTo.vue'

export default {
  init: () => {
    window.node.loginState(webdavLoginState => {
      store.commit('loginState', webdavLoginState)
    })
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
    window.node.updateFileStateList(fileStateList => {
      store.commit('updateFileStateList', fileStateList)
    })
    window.node.changeTab(id => {
      const routeState = store.state.routeState.find(item => item.id === id)
      router.push({ path: routeState.path, query: { id } }).then(() => {})
    })
    window.node.noticeToSave(data => {
      const div = document.createElement('div')
      const app = createApp(SaveTo, {
        path: store.state.currentWebdavPath,
        id: data.id,
        close: data.close,
        onClose: () => {
          app.unmount()
          div.remove()
        }
      })
      document.body.appendChild(div)
      app.use(Modal).use(Button).use(Input).mount(div)
    })
    window.node.insertScreenshotResult(result => {
      if (result) {
        const editorRef = store.state.editorRefList.find(item => item.id === store.state.id).editorRef
        result.list.forEach(item => {
          if (item) {
            editorRef?.insert(() => {
              /**
               * @return targetValue    待插入内容
               * @return select         插入后是否自动选中内容，默认：true
               * @return deviationStart 插入后选中内容鼠标开始位置，默认：0
               * @return deviationEnd   插入后选中内容鼠标结束位置，默认：0
               */
              return {
                targetValue: `![](${item})\n`,
                select: false,
                deviationStart: 0,
                deviationEnd: 0
              }
            })
          }
        })
      }
    })
    window.node.openWebdavPath(path => {
      store.commit('openWebdavPath', path)
    })
  },
  findInPageResult: fun => {
    window.node.findInPageResult(fun)
  },
  showMaximizeAction: callback => {
    window.node.showMaximizeAction(callback)
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
