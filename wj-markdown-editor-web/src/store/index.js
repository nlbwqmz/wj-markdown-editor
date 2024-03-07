import { createStore } from 'vuex'

export default createStore({
  state: {
    config: {}
  },
  getters: {
  },
  mutations: {
    updateConfig: (state, value) => {
      state.config = value
    }
  },
  actions: {
  },
  modules: {
  }
})
