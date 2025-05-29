import channelUtil from '@/util/channel/channelUtil.js'
import { defineStore } from 'pinia'
import { ref } from 'vue'

const configData = await channelUtil.send({ event: 'get-config' })
const recentListData = await channelUtil.send({ event: 'get-recent-list' })

const useCommonStore = defineStore('common', () => {
  const fileName = ref('')
  const saved = ref(true)
  const isMaximize = ref(false)
  const config = ref(configData)
  const searchBarVisible = ref(false)
  const editorSearchBarVisible = ref(false)
  const hasNewVersion = ref(false)
  const isAlwaysOnTop = ref(false)
  const recentList = ref(recentListData)
  return { fileName, saved, isMaximize, config, searchBarVisible, hasNewVersion, isAlwaysOnTop, recentList, editorSearchBarVisible }
})

export { useCommonStore }
