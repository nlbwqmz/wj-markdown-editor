import sendUtil from '@/util/channel/sendUtil.js'
import { defineStore } from 'pinia'
import { ref } from 'vue'

// eslint-disable-next-line antfu/no-top-level-await
const configData = await sendUtil.send({ event: 'get-config' })

const useCommonStore = defineStore('common', () => {
  const fileName = ref('')
  const saved = ref(true)
  const isMaximize = ref(false)
  const config = ref(configData)
  const searchBarVisible = ref(false)
  const hasNewVersion = ref(false)
  const isAlwaysOnTop = ref(false)
  return { fileName, saved, isMaximize, config, searchBarVisible, hasNewVersion, isAlwaysOnTop }
})

export { useCommonStore }
