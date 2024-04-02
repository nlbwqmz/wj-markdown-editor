import { Button, Input, message, Modal, notification } from 'ant-design-vue'
import commonUtil from '@/util/commonUtil'
import store from '@/store'
import router from '@/router'
import { createApp, h } from 'vue'
import SaveTo from '@/components/SaveTo.vue'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import { SmileOutlined } from '@ant-design/icons-vue'

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
    window.node.hasNewVersion(() => {
      const key = `notification${Date.now()}`
      notification.info({
        top: '70px',
        message: '消息',
        description: '发现新版本！',
        btn: () =>
          h(
            Button,
            {
              type: 'primary',
              size: 'small',
              onClick: () => { notification.close(key); nodeRequestUtil.openAboutWin() }
            },
            {
              default: () => '去更新'
            }
          ),
        icon: () =>
          h(SmileOutlined, {
            style: 'color: #108ee9'
          }),
        key
      })
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
