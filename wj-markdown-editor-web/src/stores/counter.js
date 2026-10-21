import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import channelUtil from '@/util/channel/channelUtil.js'
import {
  createDefaultDocumentSessionSnapshot,
  createDefaultExternalFileChangeState,
  deriveDocumentSessionStoreState,
  normalizeRecentList,
} from '@/util/document-session/documentSessionSnapshotUtil.js'
import {
  createViewModeBySessionStore,
  isValidViewMode,
  normalizeViewMode,
  pruneViewModeBySession,
  resolveViewModeForSession,
  seedViewModesForTabList,
  setViewModeForSession,
} from '@/util/document-session/viewModeBySessionUtil.js'

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
  // 每个标签页各自持有视图模式：source（仅源码）/ split（双栏）/ preview（仅预览）。
  // 未记录的会话一律回落到 startView，所以「新建标签」永远从配置的启动视图开始；
  // 不持久化，重启后所有标签都回到 startView。
  const viewModeBySessionId = ref(createViewModeBySessionStore())
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

  // 当前活动标签对应的会话 id。activeSessionId 缺失时回退 sessionId，
  // 保证主进程尚未投影窗口标签列表时也能拿到稳定身份。
  const activeSessionId = computed(() => {
    const snapshot = documentSessionSnapshot.value

    return snapshot.activeSessionId ?? snapshot.sessionId ?? null
  })

  /**
   * 读取当前的 startView 配置。
   * 它只用于给「首次出现的标签」确定初始视图模式，不会实时驱动已有标签，
   * 所以设置页改 startView 只影响之后打开的标签。
   *
   * @returns {string} 返回合法的视图模式。
   */
  function resolveStartViewMode() {
    return normalizeViewMode(config.value?.startView, 'split')
  }

  // 对外仍然是可读写的 viewMode：读取方无需感知“每个标签一份”。
  // 提供 setter，让任何直接赋值也能落到当前标签上。
  const viewMode = computed({
    get: () => resolveViewModeForSession(
      viewModeBySessionId.value,
      activeSessionId.value,
      resolveStartViewMode(),
    ),
    set: mode => setViewMode(mode),
  })

  function applyDocumentSessionSnapshot(snapshot) {
    const nextState = deriveDocumentSessionStoreState(snapshot, externalFileChange.value)
    documentSessionSnapshot.value = nextState.documentSessionSnapshot
    fileName.value = nextState.fileName
    saved.value = nextState.saved
    externalFileChange.value = nextState.externalFileChange
    syncViewModeBySession(nextState.documentSessionSnapshot)
    return nextState.documentSessionSnapshot
  }

  /**
   * 按快照同步视图模式记录：
   * 1. 新出现的标签用**当前** startView 固化初始模式（已有记录一律不覆盖）
   * 2. 再清掉已关闭标签的记录
   *
   * @param {object | null | undefined} snapshot
   */
  function syncViewModeBySession(snapshot) {
    const tabList = Array.isArray(snapshot?.tabs) ? snapshot.tabs : []

    viewModeBySessionId.value = seedViewModesForTabList(
      viewModeBySessionId.value,
      tabList,
      resolveStartViewMode(),
    )

    // tabs 为空时（首帧默认快照）不清理，避免把已有记录误清空。
    if (tabList.length === 0) {
      return
    }

    const openSessionIdList = tabList
      .map(tab => tab?.sessionId)
      .filter(sessionId => typeof sessionId === 'string' && sessionId !== '')

    viewModeBySessionId.value = pruneViewModeBySession(
      viewModeBySessionId.value,
      openSessionIdList,
      snapshot?.activeSessionId ?? snapshot?.sessionId ?? null,
    )
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
    if (!isValidViewMode(mode)) {
      return
    }

    const sessionId = activeSessionId.value
    if (!sessionId) {
      // 首帧快照未到时没有可归属的标签，直接忽略，避免把值写到错误的会话上。
      return
    }

    viewModeBySessionId.value = setViewModeForSession(viewModeBySessionId.value, sessionId, mode)
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
