import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import channelUtil from '@/util/channel/channelUtil.js'
import {
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
  const isMaximize = ref(false)
  const isFullScreen = ref(false)
  const config = ref(configData)
  // 侧边栏是否可见：由“默认视图”配置初始化，会话内切换不写盘
  const sidebarVisible = ref(configData.sidebarDefaultView !== 'close')
  // 侧边栏当前 tab：会话内记住上次选择，不持久化
  const sidebarActiveTab = ref(configData.sidebarDefaultView === 'outline' ? 'outline' : 'files')
  // 编辑页视图模式：source（仅源码）/ split（双栏）/ preview（仅预览）。
  // 会话内切换不持久化；startView 配置由后续步骤引入，当前先用 split 兜底。
  const viewMode = ref(configData.startView ?? 'split')
  const searchBarVisible = ref(false)
  const editorSearchBarVisible = ref(false)
  const hasNewVersion = ref(false)
  const isAlwaysOnTop = ref(false)
  const recentList = ref(normalizeRecentList(recentListData))
  const externalFileChange = ref(createDefaultExternalFileChangeState())
  // 大纲滚动联动容器（有预览时为预览容器；无预览时为 null，改由 outlineActiveLine 驱动）
  const outlineScrollContainer = shallowRef(null)
  // 无预览时由编辑区滚动驱动的活动行号（有预览时为 null）
  const outlineActiveLine = shallowRef(null)
  // 当前激活页面提供的大纲导航处理器（编辑页据此跳转编辑器行）
  const outlineNavigateHandler = shallowRef(null)

  function applyDocumentSessionSnapshot(snapshot) {
    const nextState = deriveDocumentSessionStoreState(snapshot, externalFileChange.value)
    documentSessionSnapshot.value = nextState.documentSessionSnapshot
    fileName.value = nextState.fileName
    saved.value = nextState.saved
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

  function setSidebarVisible(visible) {
    sidebarVisible.value = Boolean(visible)
  }

  function setSidebarActiveTab(tab) {
    sidebarActiveTab.value = tab === 'outline' ? 'outline' : 'files'
  }

  function setViewMode(mode) {
    if (['source', 'split', 'preview'].includes(mode)) {
      viewMode.value = mode
    }
  }

  function setOutlineScrollContainer(element) {
    outlineScrollContainer.value = element ?? null
  }

  function setOutlineActiveLine(lineNumber) {
    outlineActiveLine.value = Number.isFinite(lineNumber) ? lineNumber : null
  }

  function setOutlineNavigateHandler(handler) {
    outlineNavigateHandler.value = typeof handler === 'function' ? handler : null
  }

  return {
    documentSessionSnapshot,
    fileName,
    saved,
    isMaximize,
    isFullScreen,
    config,
    sidebarVisible,
    sidebarActiveTab,
    viewMode,
    searchBarVisible,
    hasNewVersion,
    isAlwaysOnTop,
    recentList,
    editorSearchBarVisible,
    externalFileChange,
    outlineScrollContainer,
    outlineActiveLine,
    outlineNavigateHandler,
    applyDocumentSessionSnapshot,
    replaceRecentList,
    setExternalFileChangeLoading,
    setSidebarVisible,
    setSidebarActiveTab,
    setViewMode,
    setOutlineScrollContainer,
    setOutlineActiveLine,
    setOutlineNavigateHandler,
  }
})

export { useCommonStore }
