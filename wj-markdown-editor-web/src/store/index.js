import { createStore } from 'vuex'
import nodeRequestUtil from '@/util/nodeRequestUtil'

export default createStore({
  state: {
    id: '',
    config: {},
    fileStateList: [],
    routeState: [],
    editorRefList: [],
    showWebdav: false,
    webdavLogin: false,
    loginErrorMessage: '',
    openWebdavPath: '',
    currentWebdavPath: ''
  },
  getters: {
  },
  mutations: {
    updateConfig: (state, value) => {
      state.config = value
    },
    updateFileStateList: (state, fileStateList) => {
      state.routeState = fileStateList.map(fileState => {
        const routeState = state.routeState.find(item => item.id === fileState.id)
        if (routeState) {
          return routeState
        }
        return {
          id: fileState.id,
          path: fileState.originFilePath ? ('/' + state.config.initRoute) : '/edit'
        }
      })
      state.fileStateList = fileStateList
    },
    updateId: (state, id) => {
      nodeRequestUtil.updateActiveFileId(id)
      state.id = id
    },
    updateRouteState: (state, obj) => {
      const current = state.routeState.find(item => item.id === obj.id)
      if (current) {
        current.path = obj.path
      } else {
        state.routeState.push(obj)
      }
    },
    pushEditorRefList: (state, obj) => {
      state.editorRefList.push(obj)
    },
    switchShowWebdav: state => {
      state.showWebdav = !state.showWebdav
    },
    setShowWebdav: (state, value) => {
      state.showWebdav = value
    },
    loginState: (state, webdavLoginState) => {
      state.webdavLogin = webdavLoginState.webdavLogin
      state.loginErrorMessage = webdavLoginState.loginErrorMessage
    },
    openWebdavPath: (state, currentPath) => {
      state.openWebdavPath = currentPath
    },
    currentWebdavPath: (state, currentWebdavPath) => {
      state.currentWebdavPath = currentWebdavPath
    }
  },
  actions: {
  },
  modules: {
  }
})
