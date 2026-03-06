import { defineStore } from 'pinia'
import { ref } from 'vue'
import channelUtil from '@/util/channel/channelUtil.js'

const configData = await channelUtil.send({ event: 'get-config' })
const recentListData = await channelUtil.send({ event: 'get-recent-list' })

function createDefaultExternalFileChange() {
  return {
    visible: false,
    loading: false,
    fileName: '',
    filePath: '',
    version: 0,
    localContent: '',
    externalContent: '',
    saved: true,
    exists: true,
  }
}

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
  const externalFileChange = ref(createDefaultExternalFileChange())

  function showExternalFileChange(data) {
    externalFileChange.value = {
      ...createDefaultExternalFileChange(),
      ...data,
      visible: true,
      loading: false,
    }
  }

  function resetExternalFileChange() {
    externalFileChange.value = createDefaultExternalFileChange()
  }

  function setExternalFileChangeLoading(loading) {
    externalFileChange.value = {
      ...externalFileChange.value,
      loading,
    }
  }

  return {
    fileName,
    saved,
    isMaximize,
    config,
    searchBarVisible,
    hasNewVersion,
    isAlwaysOnTop,
    recentList,
    editorSearchBarVisible,
    externalFileChange,
    showExternalFileChange,
    resetExternalFileChange,
    setExternalFileChangeLoading,
  }
})

export { useCommonStore }
