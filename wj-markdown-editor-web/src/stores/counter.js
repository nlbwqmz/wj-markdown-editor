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
    // 每次收到新的外部 diff 数据时，都覆盖掉上一次弹窗状态，
    // 避免旧版本内容残留在弹窗里。
    externalFileChange.value = {
      ...createDefaultExternalFileChange(),
      ...data,
      visible: true,
      loading: false,
    }
  }

  function resetExternalFileChange() {
    // 用户完成决策，或者 Electron 已经自动应用并通知刷新后，统一回到初始状态。
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
