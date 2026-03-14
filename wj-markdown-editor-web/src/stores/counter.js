import { defineStore } from 'pinia'
import { ref } from 'vue'
import channelUtil from '@/util/channel/channelUtil.js'
import {
  createDefaultClosePromptState,
  createDefaultDocumentSessionSnapshot,
  createDefaultExternalFileChangeState,
  deriveDocumentSessionStoreState,
  normalizeRecentList,
} from '@/util/document-session/documentSessionSnapshotUtil.js'

const configData = await channelUtil.send({ event: 'get-config' })
const recentListData = await channelUtil.send({ event: 'recent.get-list' })

const useCommonStore = defineStore('common', () => {
  const documentSessionSnapshot = ref(createDefaultDocumentSessionSnapshot())
  const fileName = ref(documentSessionSnapshot.value.fileName)
  const saved = ref(true)
  const displayPath = ref(null)
  const recentMissingPath = ref(null)
  const exists = ref(false)
  const isMaximize = ref(false)
  const config = ref(configData)
  const searchBarVisible = ref(false)
  const editorSearchBarVisible = ref(false)
  const hasNewVersion = ref(false)
  const isAlwaysOnTop = ref(false)
  const recentList = ref(normalizeRecentList(recentListData))
  const closePrompt = ref(createDefaultClosePromptState())
  const externalFileChange = ref(createDefaultExternalFileChangeState())

  function applyDocumentSessionSnapshot(snapshot) {
    const nextState = deriveDocumentSessionStoreState(snapshot, externalFileChange.value)
    documentSessionSnapshot.value = nextState.documentSessionSnapshot
    fileName.value = nextState.fileName
    saved.value = nextState.saved
    displayPath.value = nextState.displayPath
    recentMissingPath.value = nextState.recentMissingPath
    exists.value = nextState.exists
    closePrompt.value = nextState.closePrompt
    externalFileChange.value = nextState.externalFileChange
    return nextState.documentSessionSnapshot
  }

  function replaceRecentList(nextRecentList) {
    const normalizedRecentList = normalizeRecentList(nextRecentList)
    recentList.value = normalizedRecentList
    return normalizedRecentList
  }

  function setExternalFileChangeLoading(loading) {
    externalFileChange.value = {
      ...externalFileChange.value,
      loading,
    }
  }

  return {
    documentSessionSnapshot,
    fileName,
    saved,
    displayPath,
    recentMissingPath,
    exists,
    isMaximize,
    config,
    searchBarVisible,
    hasNewVersion,
    isAlwaysOnTop,
    recentList,
    editorSearchBarVisible,
    closePrompt,
    externalFileChange,
    applyDocumentSessionSnapshot,
    replaceRecentList,
    setExternalFileChangeLoading,
  }
})

export { useCommonStore }
