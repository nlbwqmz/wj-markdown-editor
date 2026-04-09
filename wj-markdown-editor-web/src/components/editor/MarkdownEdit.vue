<script setup>
import Split from 'split-grid'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createMarkdownEditPreviewScrollAnchorRestore,
  createMarkdownEditScrollAnchorCapture,
} from '@/components/editor/composables/markdownEditScrollAnchorCaptureUtil.js'
import { isPointerSelectionUpdate } from '@/components/editor/composables/selectionUpdateUtil.js'
import { useAssetInsert } from '@/components/editor/composables/useAssetInsert.js'
import { useAssociationHighlight } from '@/components/editor/composables/useAssociationHighlight.js'
import { useEditorCore } from '@/components/editor/composables/useEditorCore.js'
import { usePreviewSync } from '@/components/editor/composables/usePreviewSync.js'
import { useToolbarBuilder } from '@/components/editor/composables/useToolbarBuilder.js'
import { useViewScrollAnchor } from '@/components/editor/composables/useViewScrollAnchor.js'
import EditorSearchBar from '@/components/editor/EditorSearchBar.vue'
import EditorToolbar from '@/components/editor/EditorToolbar.vue'
import ImageNetworkModal from '@/components/editor/ImageNetworkModal.vue'
import { resolveAdaptiveGridTemplateColumns } from '@/components/editor/markdownEditGridTemplateColumnsUtil.js'
import {
  resolveMarkdownEditLayoutMode,
  resolveMarkdownEditSplitColumnGutters,
} from '@/components/editor/markdownEditLayoutMode.js'
import { createMarkdownEditPreviewLayoutIndexWiring } from '@/components/editor/markdownEditPreviewLayoutIndexWiring.js'
import { resolveMarkdownEditRenderItems } from '@/components/editor/markdownEditRenderItems.js'
import MarkdownMenu from '@/components/editor/MarkdownMenu.vue'
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import { createPreviewRefreshCoordinator } from '@/components/editor/previewRefreshCoordinator.js'
import { useCommonStore } from '@/stores/counter.js'
import {
  resolvePendingContentUpdateMeta,
  shouldDeferStaleContentSync,
} from '@/util/editor/contentUpdateMetaUtil.js'
import { createFlushableDebounce } from '@/util/editor/flushableDebounceUtil.js'
import keymapUtil from '@/util/editor/keymap/keymapUtil.js'
import {
  captureEditorLineAnchor,
  capturePreviewLineAnchor,
  resolveEditorLineAnchorScrollTop,
  resolvePreviewLineAnchorScrollTop,
} from '@/util/editor/viewScrollAnchorMathUtil.js'
import {
  createViewScrollAnchorSessionStore,
} from '@/util/editor/viewScrollAnchorSessionUtil.js'
import { previewSearchBarController } from '@/util/searchBarController.js'
import { closeSearchBarIfVisible } from '@/util/searchBarLifecycleUtil.js'
import { createSearchTargetBridge } from '@/util/searchTargetBridgeUtil.js'
import { collectSearchTargetElements } from '@/util/searchTargetUtil.js'

const props = defineProps({
  modelValue: {
    type: String,
    default: () => '',
  },
  contentUpdateMeta: {
    type: Object,
    default: () => ({
      token: 0,
      cursorPosition: null,
      focus: false,
      scrollIntoView: false,
    }),
  },
  theme: {
    type: String,
    default: () => 'light',
  },
  codeTheme: {
    type: String,
    default: () => 'atom-one-dark',
  },
  previewTheme: {
    type: String,
    default: () => 'github',
  },
  watermark: {
    type: Object,
    default: () => null,
  },
  extension: {
    type: Object,
    default: () => undefined,
  },
  associationHighlight: {
    type: Boolean,
    default: false,
  },
  previewPosition: {
    type: String,
    default: () => 'right',
  },
})

const emits = defineEmits(['update:modelValue', 'upload', 'save', 'anchorChange', 'previewContextmenu', 'assetOpen'])

const { t } = useI18n()
const store = useCommonStore()

const toolbarList = ref([])
const shortcutKeyList = ref([])
let splitInstance
let splitGutterSyncElements = []

const editorSearchBarVisible = computed(() => store.editorSearchBarVisible)
const associationHighlightEnabled = computed(() => props.associationHighlight === true)
const themeRef = computed(() => store.config.theme.global)

const gutterRef = ref()
const gutterMenuRef = ref()
const editorRef = ref()
const previewRef = ref()
const scrolling = ref({ editor: false, preview: false })
const editorContainer = ref()
const anchorList = ref([])
const editorScrollTop = ref(0)
const menuVisible = ref(false)
const menuController = ref(false)
const previewVisible = ref(true)
const previewController = ref(true)
// 仅在预览从“未渲染”重新挂载为“已渲染”时，延后首轮同步到 refreshComplete。
const pendingPreviewResyncAfterRefresh = ref(false)
const layoutMode = computed(() => resolveMarkdownEditLayoutMode({
  previewVisible: previewVisible.value,
  menuVisible: menuVisible.value,
  previewPosition: props.previewPosition,
}))
const handledContentUpdateToken = ref(0)
// 当前滚动锚点只跟随最近一次对外确认过的 session snapshot。
// 这样 capture / restore 都会严格绑定到外层给定的 sessionId + revision。
const currentScrollSnapshot = ref({
  sessionId: '',
  revision: 0,
})
// 恢复期间需要临时冻结左右联动滚动，避免恢复过程被同步逻辑反向覆盖。
const restoreState = ref({
  active: false,
  editorCode: false,
  editorPreview: false,
})
// 记录编辑器最近一次已经向上游暴露的正文，用于识别滞后的 snapshot echo。
const lastExposedContent = ref(props.modelValue)
// 仅在当前 keep-alive 编辑页实例内存活的滚动锚点缓存。
// 不做全局单例，避免不同编辑页实例之间互相污染。
const viewScrollAnchorStore = createViewScrollAnchorSessionStore()

const BOTTOM_GAP = '40vh'
const EDITOR_EMIT_DEBOUNCE_MS = 160
let viewRestoreRequestToken = 0

function getPreviewSearchTargetElements() {
  return collectSearchTargetElements(editorContainer.value)
}
const previewSearchTargetBridge = createSearchTargetBridge({
  controller: previewSearchBarController,
  getTargetElements: () => getPreviewSearchTargetElements(),
})

function onEditorSearchBarClose() {
  store.editorSearchBarVisible = false
}

function closePreviewSearchBar() {
  closeSearchBarIfVisible({
    controller: previewSearchBarController,
    store,
  })
}

const {
  editorView,
  initEditor,
  destroyEditor,
  reconfigureTheme,
  reconfigureExtensions,
  reconfigureKeymap,
} = useEditorCore({ editorRef })

/**
 * 将外层传入的 snapshot 规范化后写入本地引用。
 * sessionId / revision 会同时驱动两份滚动锚点控制器的读取与恢复资格判断。
 *
 * @param {{ sessionId?: string, revision?: number } | undefined} snapshot
 */
function updateCurrentScrollSnapshot(snapshot) {
  currentScrollSnapshot.value = {
    sessionId: typeof snapshot?.sessionId === 'string' ? snapshot.sessionId : '',
    revision: Number.isInteger(snapshot?.revision) ? snapshot.revision : 0,
  }
}

/**
 * 统一收拢恢复状态，避免多个出口重复手写同一组字段。
 */
function resetRestoreState() {
  restoreState.value.active = false
  restoreState.value.editorCode = false
  restoreState.value.editorPreview = false
}

/**
 * 统一设置滚动容器位置。
 * 优先使用 scrollTo，兼容真实 DOM；测试或极简桩对象则退回直接赋值 scrollTop。
 *
 * @param {{ scrollTop?: number, scrollTo?: Function } | null | undefined} scrollElement
 * @param {number} targetScrollTop
 */
function setScrollElementScrollTop(scrollElement, targetScrollTop) {
  if (!scrollElement || Number.isFinite(targetScrollTop) !== true) {
    return
  }

  if (typeof scrollElement.scrollTo === 'function') {
    scrollElement.scrollTo({ top: targetScrollTop })
    return
  }

  scrollElement.scrollTop = targetScrollTop
}

/**
 * 解析预览元素携带的行号字段。
 * Markdown 预览里的 data-line-* 来自 DOM dataset，因此这里统一转成正整数。
 *
 * @param {unknown} value
 * @returns {number | null} 返回合法行号；非法值返回 null。
 */
function parsePreviewLineNumber(value) {
  const lineNumber = Number(value)

  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    return null
  }

  return lineNumber
}

/**
 * 获取预览元素对应的 Markdown 行范围。
 * lineEnd 缺失时退化为单行块，和现有预览渲染约定保持一致。
 *
 * @param {{ dataset?: Record<string, string> } | null | undefined} element
 * @returns {{ lineStart: number, lineEnd: number } | null} 返回元素行范围；缺少有效映射时返回 null。
 */
function getPreviewElementLineRange(element) {
  const lineStart = parsePreviewLineNumber(element?.dataset?.lineStart)
  if (lineStart === null) {
    return null
  }

  const parsedLineEnd = parsePreviewLineNumber(element?.dataset?.lineEnd)
  const lineEnd = parsedLineEnd ?? lineStart

  return {
    lineStart,
    lineEnd: Math.max(lineStart, lineEnd),
  }
}

/**
 * 计算预览元素相对滚动容器内容顶部的真实位置。
 * 这里和 usePreviewSync 保持同一套坐标语义，避免捕获与恢复采用两套不同坐标系。
 *
 * @param {HTMLElement | null | undefined} container
 * @param {HTMLElement | null | undefined} element
 * @returns {number | null} 返回元素真实顶部位置；无法计算时返回 null。
 */
function getPreviewElementToTopDistance(container, element) {
  if (!container || !element) {
    return null
  }

  const containerRect = container.getBoundingClientRect?.()
  const elementRect = element.getBoundingClientRect?.()
  if (!Number.isFinite(containerRect?.top) || !Number.isFinite(elementRect?.top)) {
    return null
  }

  return elementRect.top - containerRect.top - container.clientTop + container.scrollTop
}

/**
 * 统计元素相对预览滚动容器的嵌套深度。
 * 当多个节点共享同一行范围时，优先选择更内层的真实内容节点。
 *
 * @param {HTMLElement | null | undefined} element
 * @returns {number} 返回元素相对预览容器的嵌套深度。
 */
function getPreviewElementDepth(element) {
  let depth = 0
  let current = element

  while (current && current !== previewRef.value) {
    depth++
    current = current.parentElement
  }

  return depth
}

/**
 * 获取当前预览区域中所有带行号映射的节点。
 *
 * @returns {HTMLElement[]} 返回当前预览容器内可用于锚点计算的节点列表。
 */
function getPreviewAnchorElements() {
  if (!previewRef.value) {
    return []
  }

  return Array.from(previewRef.value.querySelectorAll('[data-line-start]'))
}

/**
 * 根据当前 scrollTop 找到预览区最接近顶部的映射元素。
 * 该查找策略与 usePreviewSync 内部逻辑保持一致，确保“当前看到的元素”和“同步映射元素”一致。
 *
 * @param {HTMLElement} container
 * @param {number} scrollTop
 * @returns {HTMLElement | null} 返回当前位置对应的预览元素；找不到时返回 null。
 */
function findPreviewElementAtScrollTop(container, scrollTop) {
  const elements = getPreviewAnchorElements()
  let target = elements[0] ?? null

  for (const element of elements) {
    const elementTop = getPreviewElementToTopDistance(container, element)
    if (Number.isFinite(elementTop) && elementTop <= scrollTop) {
      target = element
    } else {
      break
    }
  }

  return target
}

/**
 * 根据锚点里的行范围反查预览元素。
 * 若存在多个候选节点，则优先选择范围最精确、嵌套更深的那个节点。
 *
 * @param {HTMLElement} container
 * @param {{ lineStart?: number, lineEnd?: number } | null | undefined} anchor
 * @returns {HTMLElement | null} 返回锚点匹配到的预览元素；找不到时返回 null。
 */
function findPreviewElementByAnchor(container, anchor) {
  const lineStart = parsePreviewLineNumber(anchor?.lineStart)
  const lineEnd = parsePreviewLineNumber(anchor?.lineEnd) ?? lineStart

  if (!container || lineStart === null || lineEnd === null) {
    return null
  }

  const waiting = []
  for (const element of getPreviewAnchorElements()) {
    const lineRange = getPreviewElementLineRange(element)
    if (!lineRange) {
      continue
    }
    if (lineRange.lineStart === lineStart && lineRange.lineEnd === lineEnd) {
      waiting.push({
        element,
        depth: getPreviewElementDepth(element),
        span: lineRange.lineEnd - lineRange.lineStart,
      })
    }
  }

  waiting.sort((a, b) => {
    const spanCompare = a.span - b.span
    if (spanCompare !== 0) {
      return spanCompare
    }
    return b.depth - a.depth
  })

  return waiting[0]?.element ?? null
}

const editorCodeScrollAnchor = useViewScrollAnchor({
  store: viewScrollAnchorStore,
  sessionIdGetter: () => currentScrollSnapshot.value.sessionId,
  revisionGetter: () => currentScrollSnapshot.value.revision,
  scrollAreaKey: 'editor-code',
  getScrollElement: () => editorView.value?.scrollDOM ?? null,
  captureAnchor: ({ scrollElement }) => {
    const view = editorView.value
    if (!view || !scrollElement) {
      return null
    }
    return captureEditorLineAnchor({
      view,
      scrollTop: scrollElement.scrollTop,
    })
  },
  restoreAnchor: ({ record, scrollElement }) => {
    const view = editorView.value
    if (!view || !scrollElement) {
      return false
    }
    const targetScrollTop = resolveEditorLineAnchorScrollTop({
      view,
      anchor: record?.anchor,
      fallbackScrollTop: record?.fallbackScrollTop,
    })
    setScrollElementScrollTop(scrollElement, targetScrollTop)
    return true
  },
})

const editorPreviewScrollAnchor = useViewScrollAnchor({
  store: viewScrollAnchorStore,
  sessionIdGetter: () => currentScrollSnapshot.value.sessionId,
  revisionGetter: () => currentScrollSnapshot.value.revision,
  scrollAreaKey: 'editor-preview',
  getScrollElement: () => (previewController.value === true ? previewRef.value : null),
  captureAnchor: ({ scrollElement }) => {
    if (!scrollElement) {
      return null
    }
    const targetElement = findPreviewElementAtScrollTop(scrollElement, scrollElement.scrollTop)
    if (!targetElement) {
      return null
    }
    return capturePreviewLineAnchor({
      container: scrollElement,
      element: targetElement,
      scrollTop: scrollElement.scrollTop,
    })
  },
  restoreAnchor: createMarkdownEditPreviewScrollAnchorRestore({
    findPreviewElementByAnchor,
    resolvePreviewLineAnchorScrollTop,
    setScrollElementScrollTop,
  }),
})

const captureViewScrollAnchors = createMarkdownEditScrollAnchorCapture({
  updateCurrentScrollSnapshot,
  editorCodeScrollAnchor,
  editorPreviewScrollAnchor,
  previewControllerRef: previewController,
})

const {
  imageNetworkModel,
  imageNetworkData,
  imageNetworkDataRules,
  insertFileToEditor,
  openNetworkImageModal,
  onInsertImgNetwork,
  pasteOrDrop,
} = useAssetInsert({ editorViewRef: editorView })

const {
  rebuildPreviewLayoutIndex,
  previewSync: {
    jumpToTargetLine,
    syncEditorToPreview,
    syncPreviewToEditor,
    bindEvents,
    unbindEvents,
    clearScrollTimer,
  },
  associationHighlight: {
    linkedSourceHighlightField,
    linkedHighlightThemeStyle,
    cancelScheduledCursorHighlight,
    clearAllLinkedHighlight,
    clearLinkedHighlightDisplay,
    highlightByEditorCursor,
    onPreviewAreaClick,
    restorePreviewLinkedHighlight,
  },
} = createMarkdownEditPreviewLayoutIndexWiring({
  previewRef,
  usePreviewSync,
  previewSyncOptions: {
    editorViewRef: editorView,
    previewRef,
    scrolling,
    editorScrollTop,
    restoreStateRef: restoreState,
  },
  useAssociationHighlight,
  associationHighlightOptions: {
    editorViewRef: editorView,
    previewRef,
    previewController,
    associationHighlight: associationHighlightEnabled,
    themeRef,
  },
})

const { onRefreshComplete } = createPreviewRefreshCoordinator({
  rebuildPreviewLayoutIndex,
  syncPreviewAfterRefresh: () => {
    if (pendingPreviewResyncAfterRefresh.value !== true || previewController.value !== true) {
      return
    }

    pendingPreviewResyncAfterRefresh.value = false
    syncEditorToPreview(true)
  },
  restorePreviewLinkedHighlight,
  closePreviewSearchBar,
})

const {
  buildToolbarList,
} = useToolbarBuilder({
  t,
  shortcutKeyList,
  editorViewRef: editorView,
  emits,
  jumpToTargetLine,
  previewVisible,
  menuVisible,
  previewRef,
  openNetworkImageModal,
  insertFileToEditor,
})

const editorContainerStyle = computed(() => {
  return {
    ...linkedHighlightThemeStyle.value,
    '--wj-editor-bottom-gap': BOTTOM_GAP,
    '--wj-preview-bottom-gap': BOTTOM_GAP,
  }
})

const previewContainerStyle = computed(() => {
  return {
    paddingBottom: 'calc(var(--wj-preview-bottom-gap) + 0.5rem)',
  }
})

const editorContainerClass = computed(() => layoutMode.value.gridTemplateClass)
const layoutRenderItems = computed(() => resolveMarkdownEditRenderItems(layoutMode.value))
const modelSyncScheduler = createFlushableDebounce(() => {
  const view = editorView.value
  if (!view) {
    return
  }
  lastExposedContent.value = view.state.doc.toString()
  emits('update:modelValue', lastExposedContent.value)
}, EDITOR_EMIT_DEBOUNCE_MS)

/**
 * 调度正文向父层上浮。
 * 这里保留原有 160ms 防抖语义，只把实现替换成可 flush 的调度器。
 */
function scheduleModelSync() {
  modelSyncScheduler.schedule()
}

/**
 * 立即冲刷挂起的正文上浮任务。
 * 供页面切换前把最后一次输入同步到外层 session snapshot。
 */
function flushPendingModelSync() {
  return modelSyncScheduler.flush()
}

/**
 * 判断当前是否仍有待执行的正文上浮任务。
 *
 * @returns {boolean} 返回是否仍存在尚未执行的正文同步任务。
 */
function hasPendingModelSync() {
  return modelSyncScheduler.hasPending()
}

function refreshToolbarList() {
  toolbarList.value = buildToolbarList()
}

function refreshKeymap() {
  const searchKeymap = {
    key: 'Ctrl-f',
    preventDefault: true,
    stopPropagation: true,
    run: () => {
      if (store.searchBarVisible === true) {
        previewSearchBarController.close(store)
      }
      store.editorSearchBarVisible = !store.editorSearchBarVisible
      return true
    },
  }
  const keymapList = keymapUtil.createKeymap(shortcutKeyList.value, { 'editor-focus-line': jumpToTargetLine })
  keymapList.push(searchKeymap)
  return keymapList
}

/**
 * 用布局 helper 的列顺序同步当前可见面板，避免组件再维护第二套“左右顺序”判断。
 */
function syncLayoutControllers() {
  previewController.value = layoutMode.value.columnOrder.includes('preview')
  menuController.value = layoutMode.value.columnOrder.includes('menu')
}

/**
 * 按 helper 返回的 gutter 描述解析 Split 需要的真实 DOM。
 * refKey 明确区分预览分隔条与大纲分隔条，避免左侧三栏时绑反。
 *
 * @returns {Array<{ track: number, element: HTMLElement | undefined }>} 返回可直接传给 Split 的 gutter 配置。
 */
function resolveSplitColumnGutters() {
  const gutterRefMap = {
    gutterRef: gutterRef.value,
    gutterMenuRef: gutterMenuRef.value,
  }

  // 真实的 refKey -> gutter element 绑定已下沉到纯函数中，等价于 gutterRefMap[refKey]。
  return resolveMarkdownEditSplitColumnGutters(layoutMode.value.columnGutters, gutterRefMap)
}

/**
 * 把当前布局的计算后列宽快照写回行内样式。
 * split-grid 在拖拽开始时会重新读取轨道定义，这里用于给它提供稳定的 px 结果。
 */
function syncInlineGridTemplateColumnsFromComputedStyle() {
  if (!editorContainer.value) {
    return
  }

  const computedGridTemplateColumns = window.getComputedStyle(editorContainer.value).gridTemplateColumns
  if (!computedGridTemplateColumns) {
    return
  }

  editorContainer.value.style['grid-template-columns'] = computedGridTemplateColumns
}

/**
 * 拖拽结束后把像素列宽重新换回 fr 轨道。
 * 这样既保留本次拖拽得到的相对比例，又不会在窗口缩放后把布局锁死在旧像素值上。
 */
function syncInlineGridTemplateColumnsAsAdaptiveTracks() {
  if (!editorContainer.value) {
    return
  }

  const computedGridTemplateColumns = window.getComputedStyle(editorContainer.value).gridTemplateColumns
  const adaptiveGridTemplateColumns = resolveAdaptiveGridTemplateColumns(computedGridTemplateColumns)
  if (!adaptiveGridTemplateColumns) {
    return
  }

  editorContainer.value.style['grid-template-columns'] = adaptiveGridTemplateColumns
}

/**
 * 给当前 gutter 绑定“拖拽前同步列宽”的 capture 监听。
 * 这样可以确保 split-grid 自己的 mousedown / touchstart 处理前，已经拿到稳定的行内轨道定义。
 *
 * @param {Array<{ element: HTMLElement | undefined }>} columnGutters
 */
function bindSplitGutterSyncListeners(columnGutters) {
  unbindSplitGutterSyncListeners()

  splitGutterSyncElements = Array.from(new Set(
    columnGutters
      .map(({ element }) => element)
      .filter(Boolean),
  ))

  for (const element of splitGutterSyncElements) {
    element.addEventListener('mousedown', syncInlineGridTemplateColumnsFromComputedStyle, true)
    element.addEventListener('touchstart', syncInlineGridTemplateColumnsFromComputedStyle, true)
  }
}

/**
 * 解绑当前 gutter 上的拖拽前同步监听，避免布局切换后继续引用旧 DOM。
 */
function unbindSplitGutterSyncListeners() {
  for (const element of splitGutterSyncElements) {
    element.removeEventListener('mousedown', syncInlineGridTemplateColumnsFromComputedStyle, true)
    element.removeEventListener('touchstart', syncInlineGridTemplateColumnsFromComputedStyle, true)
  }

  splitGutterSyncElements = []
}

/**
 * 释放当前 Split 实例和它留下的行内列宽。
 * 这样布局切换到另一套列模板时，不会继续沿用旧的拖拽结果。
 */
function destroySplitLayout() {
  unbindSplitGutterSyncListeners()

  if (editorContainer.value) {
    editorContainer.value.style['grid-template-columns'] = ''
  }

  splitInstance && splitInstance.destroy(true)
  splitInstance = undefined
}

/**
 * 重新按当前布局初始化 Split。
 * 会先清理旧实例，再按 helper 描述挂载当前需要的 gutter。
 */
function resetSplitLayout() {
  destroySplitLayout()

  const columnGutters = resolveSplitColumnGutters()
  if (columnGutters.length === 0) {
    return
  }

  bindSplitGutterSyncListeners(columnGutters)

  splitInstance = Split({
    columnGutters,
    minSize: 200,
    snapOffset: 0,
    onDragEnd: syncInlineGridTemplateColumnsAsAdaptiveTracks,
  })
}

/**
 * 按固定顺序恢复当前快照对应的滚动位置：
 * 1. 打开恢复保护
 * 2. 恢复左侧编辑区
 * 3. 若右侧预览可见，再恢复右侧预览区
 * 4. 关闭恢复保护
 *
 * 使用 request token 防止旧恢复请求在新恢复开始后回写错误状态。
 *
 * @param {{ sessionId?: string, revision?: number } | undefined} snapshot
 * @returns {Promise<{ editorCode: boolean, editorPreview: boolean }>} 返回左右区域本轮是否实际完成恢复。
 */
async function scheduleRestoreForCurrentSnapshot(snapshot) {
  updateCurrentScrollSnapshot(snapshot)
  const requestToken = ++viewRestoreRequestToken

  editorCodeScrollAnchor.cancelPendingRestore()
  editorPreviewScrollAnchor.cancelPendingRestore()
  restoreState.value.active = true
  restoreState.value.editorCode = false
  restoreState.value.editorPreview = false

  const restoreResult = {
    editorCode: false,
    editorPreview: false,
  }

  try {
    restoreState.value.editorCode = true
    try {
      restoreResult.editorCode = await editorCodeScrollAnchor.scheduleRestoreForCurrentSnapshot()
    } finally {
      if (requestToken === viewRestoreRequestToken) {
        restoreState.value.editorCode = false
      }
    }

    if (previewController.value === true) {
      restoreState.value.editorPreview = true
      try {
        restoreResult.editorPreview = await editorPreviewScrollAnchor.scheduleRestoreForCurrentSnapshot()
      } finally {
        if (requestToken === viewRestoreRequestToken) {
          restoreState.value.editorPreview = false
        }
      }
    }

    return restoreResult
  } finally {
    if (requestToken === viewRestoreRequestToken) {
      resetRestoreState()
    }
  }
}

/**
 * 取消当前挂起的滚动恢复请求，并立即解除恢复保护状态。
 */
function cancelPendingViewScrollRestore() {
  viewRestoreRequestToken++
  editorCodeScrollAnchor.cancelPendingRestore()
  editorPreviewScrollAnchor.cancelPendingRestore()
  resetRestoreState()
}

function onAnchorChange(changedAnchorList) {
  anchorList.value = changedAnchorList
  emits('anchorChange', changedAnchorList)
}

function onPreviewContextmenu(context) {
  emits('previewContextmenu', context)
}

function onAssetOpen(assetInfo) {
  emits('assetOpen', assetInfo)
}

function setEditorElement(element) {
  editorRef.value = element
}

function setPreviewElement(element) {
  previewRef.value = element
}

function setPreviewGutterElement(element) {
  gutterRef.value = element
}

function setMenuGutterElement(element) {
  gutterMenuRef.value = element
}

async function onInsertNetworkImage() {
  try {
    await onInsertImgNetwork()
  } catch {
    // 表单校验失败时保持弹窗状态，不做额外处理
  }
}

watch(() => props.theme, (newValue) => {
  reconfigureTheme(newValue)
})

watch(() => props.extension, (newValue) => {
  reconfigureExtensions(newValue)
}, { deep: true })

watch(() => [props.modelValue, props.contentUpdateMeta?.token], ([newValue]) => {
  const view = editorView.value
  if (view) {
    const currentValue = view.state.doc.toString()
    const pendingContentUpdateMeta = resolvePendingContentUpdateMeta({
      handledToken: handledContentUpdateToken.value,
      contentUpdateMeta: props.contentUpdateMeta,
    })
    handledContentUpdateToken.value = pendingContentUpdateMeta.nextHandledToken

    const cursorPosition = pendingContentUpdateMeta.shouldApplySelection
      ? Math.max(0, Math.min(newValue.length, pendingContentUpdateMeta.cursorPosition))
      : null

    // 编辑器已经继续输入、但父层这时只回放了上一轮已上浮内容时，说明拿到的是滞后的 echo。
    // 这类内容如果整段重放，会把 CodeMirror 光标错误映射到文首。
    if (shouldDeferStaleContentSync({
      currentContent: currentValue,
      nextContent: newValue,
      lastExposedContent: lastExposedContent.value,
      hasExplicitSelection: pendingContentUpdateMeta.shouldApplySelection,
    })) {
      restorePreviewLinkedHighlight()
      return
    }

    if (currentValue !== newValue) {
      const transaction = {
        changes: {
          from: 0,
          to: currentValue.length,
          insert: newValue,
        },
      }
      if (cursorPosition !== null) {
        transaction.selection = {
          anchor: cursorPosition,
          head: cursorPosition,
        }
        transaction.scrollIntoView = pendingContentUpdateMeta.scrollIntoView
      }
      view.dispatch(transaction)
    } else if (cursorPosition !== null) {
      view.dispatch({
        selection: {
          anchor: cursorPosition,
          head: cursorPosition,
        },
        scrollIntoView: pendingContentUpdateMeta.scrollIntoView,
      })
    }

    if (cursorPosition !== null && pendingContentUpdateMeta.focus === true) {
      view.focus()
    }
  }
  lastExposedContent.value = newValue
  restorePreviewLinkedHighlight()
})

watch(() => props.associationHighlight, (enabled) => {
  if (enabled === true) {
    nextTick(() => {
      highlightByEditorCursor()
    })
  } else {
    clearAllLinkedHighlight()
  }
})

watch(() => store.config.shortcutKeyList, (newValue) => {
  shortcutKeyList.value = newValue
  refreshToolbarList()
  reconfigureKeymap(refreshKeymap())
}, { deep: true, immediate: true })

watch(layoutMode, (nextLayoutMode, previousLayoutMode) => {
  closePreviewSearchBar()
  syncLayoutControllers()
  destroySplitLayout()

  const previewWasVisible = previousLayoutMode?.columnOrder?.includes('preview') === true
  const previewNowVisible = nextLayoutMode.columnOrder.includes('preview')
  if (previewNowVisible !== true) {
    pendingPreviewResyncAfterRefresh.value = false
  } else if (previewWasVisible !== true) {
    // 预览重新挂载后的首轮重同步只能由 refreshComplete 消费；
    // 在预览仍未完成刷新前，即使继续发生布局变化，也必须保留这次待执行标记。
    pendingPreviewResyncAfterRefresh.value = true
  }

  if (previewController.value !== true) {
    pendingPreviewResyncAfterRefresh.value = false
    clearLinkedHighlightDisplay()
  }

  nextTick(() => {
    resetSplitLayout()
    if (previewController.value !== true) {
      return
    }

    if (pendingPreviewResyncAfterRefresh.value === true) {
      return
    }

    syncEditorToPreview(true)
    restorePreviewLinkedHighlight()
  })
})

onMounted(() => {
  menuVisible.value = store.config.menuVisible
  previewSearchTargetBridge.activate()
  syncLayoutControllers()
  nextTick(() => {
    resetSplitLayout()
  })

  initEditor({
    doc: props.modelValue,
    theme: props.theme,
    extensionOptions: props.extension,
    keymapList: refreshKeymap(),
    extraExtensions: [linkedSourceHighlightField],
    onDocChange: scheduleModelSync,
    onSelectionChange: (update) => {
      if (isPointerSelectionUpdate(update)) {
        return
      }
      highlightByEditorCursor(update.state)
    },
    onCompositionEnd: scheduleModelSync,
    onPaste: (event, view) => {
      const clipboardData = event.clipboardData
      if (!clipboardData) {
        return
      }
      pasteOrDrop(event, view, clipboardData.types, clipboardData.files)
    },
    onClick: view => highlightByEditorCursor(view.state),
    onDrop: (event, view) => {
      const dataTransfer = event.dataTransfer
      if (!dataTransfer) {
        return
      }
      pasteOrDrop(event, view, dataTransfer.types, dataTransfer.files)
    },
  })

  nextTick(() => {
    bindEvents()
    if (props.associationHighlight === true) {
      highlightByEditorCursor()
    }
  })
})

onActivated(() => {
  previewSearchTargetBridge.activate()
  closePreviewSearchBar()
})

onDeactivated(() => {
  cancelPendingViewScrollRestore()
  closePreviewSearchBar()
  previewSearchTargetBridge.deactivate()
})

onBeforeUnmount(() => {
  modelSyncScheduler.cancel()
  cancelPendingViewScrollRestore()
  closePreviewSearchBar()
  previewSearchTargetBridge.deactivate({ preserveCleanupTarget: false })
  cancelScheduledCursorHighlight()
  clearAllLinkedHighlight()
  unbindEvents()
  clearScrollTimer()
  destroySplitLayout()
  destroyEditor()
})

defineExpose({
  flushPendingModelSync,
  hasPendingModelSync,
  captureViewScrollAnchors,
  scheduleRestoreForCurrentSnapshot,
  cancelPendingViewScrollRestore,
})
</script>

<template>
  <div
    class="grid grid-rows-[auto_1fr] grid-cols-1 h-full w-full"
  >
    <EditorToolbar :toolbar-list="toolbarList" />
    <div ref="editorContainer" data-testid="markdown-edit-layout" class="markdown-edit-layout grid w-full overflow-hidden" :class="editorContainerClass" :style="editorContainerStyle">
      <template v-for="item in layoutRenderItems" :key="item.key">
        <div
          v-if="item.type === 'editor'"
          :ref="setEditorElement"
          data-layout-item="editor"
          class="markdown-edit-layout__editor h-full overflow-auto"
        />
        <div
          v-else-if="item.type === 'gutter-preview'"
          :ref="setPreviewGutterElement"
          data-layout-item="gutter-preview"
          class="markdown-edit-layout__gutter markdown-edit-layout__gutter--preview wj-sash wj-sash--vertical h-full"
        />
        <div
          v-else-if="item.type === 'preview'"
          :ref="setPreviewElement"
          data-layout-item="preview"
          class="wj-scrollbar allow-search markdown-edit-layout__preview h-full overflow-y-auto p-2"
          :style="previewContainerStyle"
          @scroll="syncPreviewToEditor"
          @click="onPreviewAreaClick"
        >
          <MarkdownPreview
            :content="props.modelValue"
            :code-theme="codeTheme"
            :preview-theme="previewTheme"
            :preview-scroll-container="() => previewRef"
            :watermark="watermark"
            @refresh-complete="onRefreshComplete"
            @anchor-change="onAnchorChange"
            @preview-contextmenu="onPreviewContextmenu"
            @asset-open="onAssetOpen"
          />
        </div>
        <div
          v-else-if="item.type === 'gutter-menu'"
          :ref="setMenuGutterElement"
          data-layout-item="gutter-menu"
          class="markdown-edit-layout__gutter wj-sash wj-sash--vertical markdown-edit-layout__gutter--menu h-full"
        />
        <MarkdownMenu
          v-else-if="item.type === 'menu'"
          :anchor-list="anchorList"
          :get-container="() => previewRef"
          :close="() => { menuVisible = false }"
          :show-header="false"
          data-layout-item="menu"
          class="allow-search markdown-edit-layout__menu"
        />
      </template>
    </div>

    <ImageNetworkModal
      v-model:open="imageNetworkModel"
      :form-data="imageNetworkData"
      :form-rules="imageNetworkDataRules"
      @update:name="(value) => { imageNetworkData.name = value }"
      @update:url="(value) => { imageNetworkData.url = value }"
      @ok="onInsertNetworkImage"
    />

    <EditorSearchBar
      v-if="editorSearchBarVisible"
      :editor-view="editorView"
      @close="onEditorSearchBarClose"
    />
  </div>
</template>

<style scoped lang="scss">
.markdown-edit-layout__editor {
  grid-area: editor;
  min-width: 0;
}

.markdown-edit-layout__preview {
  grid-area: preview;
  min-width: 0;
}

.markdown-edit-layout__menu {
  grid-area: menu;
  min-width: 0;
}

.markdown-edit-layout__gutter--preview {
  grid-area: gutter-preview;
}

.markdown-edit-layout__gutter--menu {
  grid-area: gutter-menu;
}

.markdown-edit-layout--editor-only {
  // split-grid 只能解析 px / fr / % / auto，不能直接吃 minmax(...)。
  grid-template-columns: 1fr 0px 0fr 0px 0fr;
  grid-template-areas: 'editor gutter-preview preview gutter-menu menu';
}

.markdown-edit-layout--editor-preview {
  grid-template-columns: 1fr 1px 1fr 0px 0fr;
  grid-template-areas: 'editor gutter-preview preview gutter-menu menu';
}

.markdown-edit-layout--editor-preview-menu {
  grid-template-columns: 1fr 1px 1fr 1px 0.4fr;
  grid-template-areas: 'editor gutter-preview preview gutter-menu menu';
}

.markdown-edit-layout--preview-editor {
  grid-template-columns: 1fr 1px 1fr 0px 0fr;
  grid-template-areas: 'preview gutter-preview editor gutter-menu menu';
}

.markdown-edit-layout--menu-preview-editor {
  grid-template-columns: 0.4fr 1px 1fr 1px 1fr;
  grid-template-areas: 'menu gutter-menu preview gutter-preview editor';
}

:deep(.wj-preview-link-highlight) {
  border-radius: var(--wj-link-highlight-radius);
  // background-color: var(--wj-link-highlight-bg);
  outline: var(--wj-link-highlight-width) solid var(--wj-link-highlight-border);
  //outline-offset: var(--wj-link-highlight-width);
}

:deep(.cm-linked-source-highlight) {
  // background-color: var(--wj-link-highlight-bg);
  box-shadow:
    inset var(--wj-link-highlight-width) 0 0 var(--wj-link-highlight-border),
    inset calc(var(--wj-link-highlight-width) * -1) 0 0 var(--wj-link-highlight-border);
}

:deep(.cm-linked-source-highlight-start) {
  border-top-left-radius: var(--wj-link-highlight-radius);
  border-top-right-radius: var(--wj-link-highlight-radius);
  box-shadow:
    inset var(--wj-link-highlight-width) 0 0 var(--wj-link-highlight-border),
    inset calc(var(--wj-link-highlight-width) * -1) 0 0 var(--wj-link-highlight-border),
    inset 0 var(--wj-link-highlight-width) 0 var(--wj-link-highlight-border);
}

:deep(.cm-linked-source-highlight-end) {
  border-bottom-left-radius: var(--wj-link-highlight-radius);
  border-bottom-right-radius: var(--wj-link-highlight-radius);
  box-shadow:
    inset var(--wj-link-highlight-width) 0 0 var(--wj-link-highlight-border),
    inset calc(var(--wj-link-highlight-width) * -1) 0 0 var(--wj-link-highlight-border),
    inset 0 calc(var(--wj-link-highlight-width) * -1) 0 var(--wj-link-highlight-border);
}

:deep(.cm-linked-source-highlight-single) {
  border-radius: var(--wj-link-highlight-radius);
  box-shadow:
    inset var(--wj-link-highlight-width) 0 0 var(--wj-link-highlight-border),
    inset calc(var(--wj-link-highlight-width) * -1) 0 0 var(--wj-link-highlight-border),
    inset 0 var(--wj-link-highlight-width) 0 var(--wj-link-highlight-border),
    inset 0 calc(var(--wj-link-highlight-width) * -1) 0 var(--wj-link-highlight-border);
}
</style>
