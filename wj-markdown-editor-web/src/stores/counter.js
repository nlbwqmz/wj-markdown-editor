import eventEmit from '@/util/channel/eventEmit.js'
import sendUtil from '@/util/channel/sendUtil.js'
import { defineStore } from 'pinia'
import { ref } from 'vue'

// eslint-disable-next-line antfu/no-top-level-await
const configData = await sendUtil.send({ event: 'get-config' })

const useCommonStore = defineStore('common', () => {
  const fileName = ref('')
  const content = ref('')
  const saved = ref(false)
  const isMaximize = ref(false)
  const config = ref(configData)
  const searchBarVisible = ref(false)
  const hasNewVersion = ref(false)
  return { fileName, content, saved, isMaximize, config, searchBarVisible, hasNewVersion }
}, {
  persist: {
    storage: sessionStorage,
  },
})

eventEmit.on('file-is-saved', (data) => {
  useCommonStore().saved = data
})

export { useCommonStore }
