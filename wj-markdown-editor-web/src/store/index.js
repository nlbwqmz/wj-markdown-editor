import { createStore } from 'vuex'

export default createStore({
  state: {
    id: '',
    config: {},
    fileStateList: [],
    routeState: []
  },
  getters: {
  },
  mutations: {
    updateConfig: (state, value) => {
      state.config = value
    },
    updateFileStateList: (state, fileStateList) => {
      console.log(fileStateList)
      state.fileStateList = fileStateList
    },
    updateId: (state, id) => {
      state.id = id
    },
    updateRouteState: (state, obj) => {
      const current = state.routeState.find(item => item.id === obj.id)
      if (current) {
        current.path = obj.path
      } else {
        state.routeState.push(obj)
      }
    }
  },
  actions: {
  },
  modules: {
  }
})
