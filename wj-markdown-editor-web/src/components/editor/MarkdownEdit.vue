<script setup>
import { EditorView } from '@codemirror/view'
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
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import { createPreviewRefreshCoordinator } from '@/components/editor/previewRefreshCoordinator.js'
import { useCommonStore } from '@/stores/counter.js'
import { requestOpenDroppedMarkdownDocument } from '@/util/document-session/documentDropOpenUtil.js'
import { resolveDocumentScrollAnchorIdentity } from '@/util/document-session/documentScrollAnchorIdentityUtil.js'
import {
  shouldDeferExternalEditorDispatch,
} from '@/util/editor/compositionStateUtil.js'
import {
  resolvePendingContentUpdateMeta,
  shouldDeferStaleContentSync,
} from '@/util/editor/contentUpdateMetaUtil.js'
import { createFlushableDebounce } from '@/util/editor/flushableDebounceUtil.js'
import keymapUtil from '@/util/editor/keymap/keymapUtil.js'
import {
  captureEditorLineAnchor,
  capturePreviewLineAnchor,
  resolveEditorAnchorLineNumber,
  resolvePreviewLineAnchorScrollTop,
  resolvePreviewLineElement,
  resolvePreviewLineNumberOffsetRatio,
} from '@/util/editor/viewScrollAnchorMathUtil.js'
import {
  clearSessionAnchorRecords,
  createViewScrollAnchorSessionStore,
  saveAnchorRecord,
} from '@/util/editor/viewScrollAnchorSessionUtil.js'
import { viewScrollHandoff } from '@/util/editor/viewScrollHandoffUtil.js'
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
let outlineActiveLineRafId = null
// 离开纯预览态时待交给编辑器的行号：纯预览态不做实时反向同步，切换时一次性交接。
let pendingEditorLineFromPreview = null

const editorSearchBarVisible = computed(() => store.editorSearchBarVisible)
const themeRef = computed(() => store.config.theme.global)

const gutterRef = ref()
// 每个标签一个 CodeMirror 挂载容器，由模板的 v-for 渲染。
// 切换标签只切 v-show，编辑器实例与它自己的 DOM 都不会被销毁。
const editorContainers = new Map()
// 保留给 useEditorCore 作为默认容器兵底；
// 实际创建 view 时总是显式传 container，所以它不会承载任何标签。
const editorRef = ref()
const previewRef = ref()
const scrolling = ref({ editor: false, preview: false })
const editorContainer = ref()
const editorScrollTop = ref(0)
// 视图模式来自 store：source 关闭预览，split / preview 都保留预览列；
// preview-only 只是把编辑列压到 0 宽，编辑器实例不会被销毁。
const viewMode = computed(() => store.viewMode)
const previewVisible = computed(() => viewMode.value !== 'source')
// 纯预览态编辑器不可见：关联滚动改为模式切换时一次性交接，不做实时反向同步。
const isEditorVisible = computed(() => viewMode.value !== 'preview')
// 关联高亮只在双栏态有意义：源码态没有预览区，纯预览态没有可操作的编辑器光标。
// 其余模式一律停用，避免无效的装饰更新与 CodeMirror 事务。
const associationHighlightEnabled = computed(() => props.associationHighlight === true && viewMode.value === 'split')
const previewController = ref(true)
// 当前活动标签的 sessionId。模板用它决定显示哪个编辑器容器，
// `setEditorElement` 用它判断是否需要补建 view。
const activeEditorSessionId = computed(() => store.documentSessionSnapshot?.activeSessionId ?? null)
// 标签顺序由主进程决定，这里只做映射，不排序。
const editorTabSessionIds = computed(() => {
  const tabList = store.documentSessionSnapshot?.tabs
  return Array.isArray(tabList) ? tabList.map(tab => tab.sessionId) : []
})
// 仅在预览从“未渲染”重新挂载为“已渲染”时，延后首轮同步到 refreshComplete。
const pendingPreviewResyncAfterRefresh = ref(false)
const layoutMode = computed(() => resolveMarkdownEditLayoutMode({
  viewMode: viewMode.value,
  previewPosition: props.previewPosition,
}))
const handledContentUpdateToken = ref(0)
// 当前滚动锚点只跟随最近一次对外确认过的 session snapshot。
// 这样 capture / restore 都会严格绑定到外层给定的文档身份（documentKey）与 sessionId + revision。
const currentScrollSnapshot = ref({
  documentKey: '',
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
const pendingExternalSync = ref(null)
// 仅在当前 keep-alive 编辑页实例内存活的滚动锚点缓存。
// 不做全局单例，避免不同编辑页实例之间互相污染。
const viewScrollAnchorStore = createViewScrollAnchorSessionStore()
// 上一次看到的标签列表，用于识别“哪些标签被关掉了”，
// 从而销毁它们的 EditorView 并清理滚动锚点缓存。
let lastKnownDocumentTabList = []

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
  isCompositionActive,
  initEditor,
  activateEditorView,
  destroyEditorView,
  hasEditorView,
  destroyEditor,
  reconfigureTheme,
  reconfigureExtensions,
  reconfigureKeymap,
} = useEditorCore({ editorRef, t })

/**
 * 将外层传入的 snapshot 规范化后写入本地引用。
 * documentKey 决定锚点缓存 bucket，sessionId / revision 决定同会话恢复资格，
 * 三者会同时驱动两份滚动锚点控制器的读取与恢复资格判断。
 *
 * @param {object | null | undefined} snapshot
 */
function updateCurrentScrollSnapshot(snapshot) {
  currentScrollSnapshot.value = resolveDocumentScrollAnchorIdentity(snapshot)
}

/**
 * 消费跨视图交接记录，并把公共源码行号换算成本区域的交接锚点写回缓存。
 * 命中交接记录时，编辑区始终写入一条 line-handoff 锚点；
 * 若当前预览可见，则同时为预览区写入同一条锚点，保证双栏按同一行号恢复。
 * 真正的几何换算延后到各自恢复入口执行。
 */
function applyHandoffAnchorToStore() {
  const { documentKey, sessionId, revision } = currentScrollSnapshot.value
  const handoffRecord = viewScrollHandoff.consume({ sessionId, revision })

  if (!handoffRecord) {
    return
  }

  const anchor = {
    type: 'line-handoff',
    lineNumber: handoffRecord.lineNumber,
    lineOffsetRatio: handoffRecord.lineOffsetRatio,
  }

  saveAnchorRecord(viewScrollAnchorStore, {
    documentKey,
    sessionId,
    scrollAreaKey: 'editor-code',
    revision,
    anchor,
    fallbackScrollTop: 0,
    savedAt: Date.now(),
  })

  if (previewController.value === true) {
    saveAnchorRecord(viewScrollAnchorStore, {
      documentKey,
      sessionId,
      scrollAreaKey: 'editor-preview',
      revision,
      anchor,
      fallbackScrollTop: 0,
      savedAt: Date.now(),
    })
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
 * 根据源码行号反查预览元素。
 * 交接记录只携带公共行号，因此这里先把它落到当前预览的锚点元素上，
 * 后续再由恢复入口复用既有几何工具完成精确换算。
 *
 * @param {HTMLElement} container
 * @param {number} lineNumber
 * @returns {HTMLElement | null} 返回包含该行号的预览元素；找不到时返回 null。
 */
function findPreviewElementByLineNumber(container, lineNumber) {
  if (!container) {
    return null
  }

  return resolvePreviewLineElement(getPreviewAnchorElements(), lineNumber)
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

/**
 * 按行号取回文档里的对应行。
 * CodeMirror 在行号越界时会直接抛 RangeError，这里统一收成 null。
 *
 * @param {any} view
 * @param {number} lineNumber
 * @returns {{ from: number } | null} 返回命中的行；无法解析时返回 null。
 */
function resolveEditorLineByNumber(view, lineNumber) {
  try {
    return view?.state?.doc?.line(lineNumber) ?? null
  } catch {
    return null
  }
}

/**
 * 延迟解除恢复保护。
 * 恢复与校正写入 scrollTop 后，浏览器派发的 scroll 事件可能晚于本轮恢复结束；
 * 立即解除保护会让预览区同步逻辑（按行高比例）反向改写编辑区位置，
 * 因此这里等到第二帧再解除，把恢复期间派发的滚动事件全部吸收掉。
 *
 * @param {number} requestToken
 */
function scheduleRestoreStateReset(requestToken) {
  const runReset = () => {
    if (requestToken !== viewRestoreRequestToken) {
      return
    }
    resetRestoreState()
  }

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(runReset)
    })
    return
  }

  setTimeout(runReset, 32)
}

const editorCodeScrollAnchor = useViewScrollAnchor({
  store: viewScrollAnchorStore,
  documentKeyGetter: () => currentScrollSnapshot.value.documentKey,
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
  restoreAnchor: ({ record }) => {
    const view = editorView.value
    if (!view) {
      return false
    }

    // 编辑区恢复只认行号：把记录里的那一行滚到视口顶部，不做任何像素换算。
    //
    // 像素方案（行高 × 行内比例）依赖 CodeMirror 的高度测量，
    // 而换入 `EditorState` 后整份 height map 会被重建，
    // 未渲染区域只有估算高度，往返一次就会系统性偏移。
    //
    // 这里交给 `EditorView.scrollIntoView`：它会把 `scrollTarget` 一直保留到
    // 目标行真正进入视口并完成测量为止（跨帧迭代），因此估算高度不影响结果。
    const lineNumber = resolveEditorAnchorLineNumber(record?.anchor)
    const line = lineNumber === null ? null : resolveEditorLineByNumber(view, lineNumber)

    if (line) {
      view.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
      })
      return true
    }

    // 没有行号可依据时（旧记录 / 空文档），退回记录的原始滚动值。
    if (Number.isFinite(record?.fallbackScrollTop)) {
      setScrollElementScrollTop(editorView.value?.scrollDOM ?? null, record.fallbackScrollTop)
      return true
    }

    return false
  },
})

const editorPreviewScrollAnchor = useViewScrollAnchor({
  store: viewScrollAnchorStore,
  documentKeyGetter: () => currentScrollSnapshot.value.documentKey,
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
    findPreviewElementByLineNumber,
    capturePreviewLineAnchor,
    resolvePreviewLineAnchorScrollTop,
    resolvePreviewLineNumberOffsetRatio,
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
    jumpEditorToLine,
    suppressNextPreviewToEditorSync,
    resetSuppressedSyncCounters,
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
    isEditorVisibleRef: isEditorVisible,
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

// 纯预览态用配置的预览宽度做居中留白；双栏态不设置宽度，保持原有满宽行为。
const previewCenterStyle = computed(() => {
  if (viewMode.value !== 'preview') {
    return {}
  }

  return {
    width: `${store.config.previewWidth}%`,
  }
})

// 纯预览态且正文为空时展示空状态，引导用户回到双栏继续编辑。
const showPreviewEmptyState = computed(() => viewMode.value === 'preview' && !props.modelValue)

// 纯预览态不渲染工具栏，需要在布局容器顶部补回横线，保持与其它页面视觉一致。
const editorContainerClass = computed(() => [
  layoutMode.value.gridTemplateClass,
  viewMode.value === 'preview' ? 'b-t-1 b-t-border-primary b-t-solid' : '',
])
const layoutRenderItems = computed(() => resolveMarkdownEditRenderItems(layoutMode.value))
const modelSyncScheduler = createFlushableDebounce(() => {
  const view = editorView.value
  if (!view) {
    return
  }
  lastExposedContent.value = view.state.doc.toString()
  // 输入稳定后再刷新关联高亮，避免在原生输入/DOMObserver 处理中追加第二次编辑器事务。
  highlightByEditorCursor(view.state)
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
}

/**
 * 按 helper 返回的 gutter 描述解析 Split 需要的真实 DOM。
 *
 * @returns {Array<{ track: number, element: HTMLElement | undefined }>} 返回可直接传给 Split 的 gutter 配置。
 */
function resolveSplitColumnGutters() {
  const gutterRefMap = {
    gutterRef: gutterRef.value,
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
  const nextGridTemplateColumns = resolveAdaptiveGridTemplateColumns(computedGridTemplateColumns)
  if (!nextGridTemplateColumns) {
    return
  }

  editorContainer.value.style['grid-template-columns'] = nextGridTemplateColumns
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
 * @param {object | null | undefined} snapshot
 * @param {{ mode?: 'same-session' | 'document' }} [options]
 * @returns {Promise<{ editorCode: boolean, editorPreview: boolean }>} 返回左右区域本轮是否实际完成恢复。
 */
async function scheduleRestoreForCurrentSnapshot(snapshot, options = {}) {
  updateCurrentScrollSnapshot(snapshot)
  applyHandoffAnchorToStore()
  const requestToken = ++viewRestoreRequestToken
  const mode = options?.mode

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
      restoreResult.editorCode = await editorCodeScrollAnchor.scheduleRestoreForCurrentSnapshot({ mode })
    } finally {
      if (requestToken === viewRestoreRequestToken) {
        restoreState.value.editorCode = false
      }
    }

    if (previewController.value === true) {
      restoreState.value.editorPreview = true
      try {
        restoreResult.editorPreview = await editorPreviewScrollAnchor.scheduleRestoreForCurrentSnapshot({ mode })
      } finally {
        if (requestToken === viewRestoreRequestToken) {
          restoreState.value.editorPreview = false
        }
      }
    }

    return restoreResult
  } finally {
    if (requestToken === viewRestoreRequestToken) {
      // 恢复与后续校正可能派发延迟 scroll 事件，
      // 因此延迟两帧再解除保护，避免预览区同步逻辑覆盖恢复结果。
      scheduleRestoreStateReset(requestToken)
    }
  }
}

/**
 * 组装创建某个标签 EditorView 所需的全部参数。
 *
 * 回调对所有标签共用：它们内部只操作「事务自己的 view」或「当前活动 view」，
 * 不会把后台标签的内容写到前台。
 *
 * @param {string} sessionId
 * @param {string} [content] 首次创建 view 时使用的正文
 * @returns {object} 可直接传给 initEditor 的选项
 */
function createEditorViewOptions(sessionId, content) {
  return {
    sessionId,
    container: editorContainers.get(sessionId) ?? null,
    doc: typeof content === 'string' ? content : props.modelValue,
    theme: props.theme,
    extensionOptions: props.extension,
    keymapList: refreshKeymap(),
    extraExtensions: [linkedSourceHighlightField],
    onDocChange: scheduleModelSync,
    // scroll 监听随 view 一起创建：每个标签自带自己的监听，
    // 切换标签天然生效，不再依赖外部重新绑定的时机。
    onScroll: () => scheduleOutlineActiveLineSync(),
    onSelectionChange: (update) => {
      if (isPointerSelectionUpdate(update)) {
        return
      }
      // 组合输入期间完全跳过联动高亮，避免输入法仍在占用 DOM 时再触发额外读写。
      if (isCompositionActive() === true) {
        return
      }
      // 普通输入会同时带来 docChanged + selectionSet。
      // 这类原生输入尚未稳定时，只刷新预览侧联动高亮；
      // 编辑区装饰统一延后到正文上浮阶段补做一次，避免在 DOMObserver 仍处理输入变更时追加第二次编辑器事务。
      if (update.docChanged === true) {
        highlightByEditorCursor(update.state, { previewOnly: true })
        return
      }
      highlightByEditorCursor(update.state)
    },
    onCompositionIdle: () => {
      const handledExternalSync = flushPendingExternalSync()
      if (handledExternalSync !== true) {
        scheduleModelSync()
      }
      highlightByEditorCursor()
    },
    onPaste: (event, view) => {
      const clipboardData = event.clipboardData
      if (!clipboardData) {
        return
      }
      pasteOrDrop(event, view, clipboardData.types, clipboardData.files)
    },
    onClick: (view) => {
      if (isCompositionActive() === true) {
        return
      }
      highlightByEditorCursor(view.state)
    },
    onDrop: (event, view) => {
      const dataTransfer = event.dataTransfer
      if (!dataTransfer) {
        return false
      }
      // 拖入 Markdown 文档时按“打开文档”处理，不能落入资源插入链路；
      // 返回 true 让 CodeMirror 阻止内建处理，同时通知 window 级监听无需重复接管。
      if (requestOpenDroppedMarkdownDocument(dataTransfer.files)) {
        return true
      }
      pasteOrDrop(event, view, dataTransfer.types, dataTransfer.files)
      return false
    },
  }
}

/**
 * 确保某个标签已经有自己的 EditorView，并把它设为活动 view。
 *
 * 容器由模板的 v-for 渲染，所以首次激活某个标签时才创建它的 view；
 * 之后切换只改引用，view 自带的正文、选区、undo 历史与滚动位置全部保留。
 *
 * @param {string} sessionId
 * @param {string} [content] 首次创建 view 时使用的正文
 * @returns {boolean} 是否可用
 */
function ensureEditorViewForSession(sessionId, content) {
  if (!sessionId) {
    return false
  }

  if (hasEditorView(sessionId) === true) {
    activateEditorView(sessionId)
    // 切回来时立即刷新一次高亮：DOM 保留所以不会触发 scroll，
    // 但行号可能已经因为别的标签的编辑而失效。
    syncOutlineActiveLine()
    // 滚动监听跟着当前 view 走，否则新标签的编辑器滚动不会驱动预览。
    bindEvents()
    return true
  }

  const container = editorContainers.get(sessionId)
  if (!container) {
    // 容器还没挂载（新标签刚插入），交给下一次快照或 nextTick 重试
    return false
  }

  initEditor(createEditorViewOptions(sessionId, content))
  syncOutlineActiveLine()
  bindEvents()
  return true
}

/**
 * 标签被关掉时，清理它的编辑器状态与滚动锚点缓存。
 *
 * 这里用“上一次看到的标签列表”与当前列表做差集，
 * 因为快照里只会有仍然打开的标签，已关闭的标签需要靠差集识别。
 */
function pruneClosedDocumentTabCaches() {
  const tabList = Array.isArray(store.documentSessionSnapshot?.tabs)
    ? store.documentSessionSnapshot.tabs
    : []

  if (tabList.length === 0) {
    return
  }

  const openSessionIdSet = new Set(tabList.map(tab => tab.sessionId))
  for (const closedTab of lastKnownDocumentTabList) {
    if (openSessionIdSet.has(closedTab.sessionId)) {
      continue
    }
    // 标签关闭：销毁它自己的 EditorView，并释放容器引用
    destroyEditorView(closedTab.sessionId)
    editorContainers.delete(closedTab.sessionId)
    // 滚动锚点按文档身份索引：必须走与采集侧同一个 key 生成函数，
    // 不能在这里手拼 `displayPath || session:<id>`——
    // 否则两边取值规则一旦分叉，桶就删不掉，内存泄漏。
    clearSessionAnchorRecords(
      viewScrollAnchorStore,
      resolveDocumentScrollAnchorIdentity(closedTab).documentKey,
    )
  }

  lastKnownDocumentTabList = tabList.map(tab => ({
    sessionId: tab.sessionId,
    displayPath: tab.displayPath ?? null,
  }))
}

// 标签列表变化时销毁已关闭标签的 view 并清理锚点缓存。
// 生命周期跟随标签，而不是靠一个数量上限兜底。
watch(
  () => store.documentSessionSnapshot?.tabs,
  () => pruneClosedDocumentTabCaches(),
)

/**
 * 处理“同一视图内切换到另一文档”。
 *
 * 每标签一个 EditorView 后，这里不再需要换入换出 EditorState：
 * 每个标签的 view 自带正文、选区、undo 历史，DOM 也一直保留，
 * 所以滚动位置天然跟随标签。这里只负责：
 * 1. 采集即将离开的标签的滚动位置（供 keep-alive 失活等跨视图场景复用）
 * 2. 把活动 view 切到目标标签（首次进入时创建）
 * 3. 按 document 模式恢复滚动锚点（新 session 的 revision 从 0 开始，不能用严格模式）
 *
 * 注意顺序：采集必须在 updateCurrentScrollSnapshot 之前。
 * 一旦先把身份切到目标标签，采集就会写进目标标签的 bucket，
 * 离开的那个标签位置直接丢失。
 *
 * @param {object | null | undefined} snapshot
 * @returns {Promise<{ editorCode: boolean, editorPreview: boolean }>} 返回左右区域本轮是否实际完成恢复。
 */
async function handleDocumentContextSwitch(snapshot) {
  // 按当前身份采集即将离开的标签的滚动位置（不传 snapshot 即不切身份）。
  captureViewScrollAnchors()
  // 挂起的外部同步带着上一份文档的光标坐标，换文档后一律作废，
  // 否则会把旧坐标应用到新文档上，产生越界选区。
  pendingExternalSync.value = null

  updateCurrentScrollSnapshot(snapshot)
  // 切换到目标标签自己的 view；首次进入某个标签时在这里创建。
  ensureEditorViewForSession(currentScrollSnapshot.value.sessionId, snapshot?.content)

  // 按文档身份恢复（新 session 的 revision 从 0 开始，不能用严格模式）
  const restoreResult = await scheduleRestoreForCurrentSnapshot(snapshot, { mode: 'document' })

  // 无记录的区域显式归零，避免沿用上一个文档的 scrollTop
  if (restoreResult.editorCode !== true) {
    editorCodeScrollAnchor.resetToTop()
  }
  if (previewController.value === true && restoreResult.editorPreview !== true) {
    editorPreviewScrollAnchor.resetToTop()
  }

  return restoreResult
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

function onOutlineNavigate(payload) {
  const lineStart = Number(payload?.lineStart)
  if (!Number.isInteger(lineStart) || lineStart <= 0) {
    return
  }

  if (payload?.didPreviewScroll === true) {
    // 预览已经自己滚到目标：抑制「预览 → 编辑器」的反向覆盖，
    // 同时抑制编辑器跳转回推预览，避免两侧来回拉扯。
    suppressNextPreviewToEditorSync()
    jumpEditorToLine(lineStart, { suppressEditorToPreviewSync: true })
    return
  }

  // 预览没有滚动（源码态没有预览区，或预览滚动失败）：这里只跳编辑器。
  // 此时不能设置抑制标记，否则标记会残留到下一次模式切换，
  // 把切到双栏/预览时该做的位置同步吃掉。
  jumpEditorToLine(lineStart)
}

/**
 * 把当前页面的大纲联动容器与导航处理器注册到 store，供侧边栏大纲使用。
 * keep-alive 下只有激活页面会注册，失活时清理，避免两页互相覆盖。
 */
function registerSidebarBridges() {
  store.setOutlineScrollContainer(resolveOutlineScrollContainer())
  store.setOutlineNavigateHandler(onOutlineNavigate)
}

function unregisterSidebarBridges() {
  store.setOutlineScrollContainer(null)
  store.setOutlineActiveLine(null)
  store.setOutlineNavigateHandler(null)
}

// 编辑页是否激活（keep-alive 场景下失活页面不参与联动）
const isEditorPageActive = ref(false)

// 是否需要编辑区行号上抛：页面激活 + 侧边栏可见 + 停留在大纲 tab
const shouldSyncOutlineActiveLine = computed(() =>
  isEditorPageActive.value === true
  && store.sidebarVisible === true
  && store.sidebarActiveTab === 'outline',
)

/**
 * 解析侧边栏大纲的滚动联动容器。
 * 有预览时交给预览容器做 DOM 测量；无预览时返回 null，改由编辑区滚动上抛行号驱动。
 */
function resolveOutlineScrollContainer() {
  return previewVisible.value === true ? (previewRef.value ?? null) : null
}

/**
 * 解析编辑区顶部行号。
 * 视图可能处于过渡状态（尚未完全初始化），这里先做能力检测再读取。
 */
function resolveEditorTopLineNumber(view) {
  if (typeof view?.lineBlockAtHeight !== 'function' || !view.scrollDOM) {
    return null
  }

  const topBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
  const topLine = view.state?.doc?.lineAt?.(topBlock.from)

  return topLine?.number ?? null
}

/**
 * 无预览时把编辑区顶部行号同步给侧边栏大纲，用于滚动联动高亮；
 * 有预览时清空，避免两套来源互相覆盖。
 *
 * scroll 监听现在随每个 view 一起创建（见 `useEditorCore` 的 `onScroll`），
 * 所以后台标签滚不到这里；这里只需关心“当前该不该上抛”。
 */
function syncOutlineActiveLine() {
  const view = editorView.value
  if (shouldSyncOutlineActiveLine.value !== true || !view || previewVisible.value === true) {
    store.setOutlineActiveLine(null)
    return
  }

  store.setOutlineActiveLine(resolveEditorTopLineNumber(view))
}

function scheduleOutlineActiveLineSync() {
  if (shouldSyncOutlineActiveLine.value !== true || outlineActiveLineRafId !== null) {
    return
  }

  outlineActiveLineRafId = window.requestAnimationFrame(() => {
    outlineActiveLineRafId = null
    syncOutlineActiveLine()
  })
}

/** 取消已排队的行号上抛（组件卸载时调用）。 */
function cancelScheduledOutlineActiveLineSync() {
  if (outlineActiveLineRafId !== null) {
    window.cancelAnimationFrame(outlineActiveLineRafId)
    outlineActiveLineRafId = null
  }
}

watch(shouldSyncOutlineActiveLine, (enabled) => {
  if (enabled === true) {
    syncOutlineActiveLine()
    return
  }
  cancelScheduledOutlineActiveLineSync()
  store.setOutlineActiveLine(null)
})

function onPreviewContextmenu(context) {
  emits('previewContextmenu', context)
}

function onAssetOpen(assetInfo) {
  emits('assetOpen', assetInfo)
}

/**
 * 记录某个标签的编辑器容器。
 *
 * 容器由模板的 v-for 渲染，可能在 view 创建之前就出现（新标签插入），
 * 也可能在 view 创建之后才出现（首次挂载）。两种情况都要兼容：
 * 如果当前正好需要这个标签的 view，就在这里补建。
 *
 * @param {string} sessionId
 * @param {HTMLElement | null} element
 */
function setEditorElement(sessionId, element) {
  if (!sessionId) {
    return
  }

  if (!element) {
    editorContainers.delete(sessionId)
    return
  }

  editorContainers.set(sessionId, element)

  // 容器晚于首次请求出现时补建 view（例如首次挂载、或新标签刚插入）
  if (hasEditorView(sessionId) !== true && sessionId === activeEditorSessionId.value) {
    ensureEditorViewForSession(sessionId, props.modelValue)
  }
}

function setPreviewElement(element) {
  previewRef.value = element
}

function setPreviewGutterElement(element) {
  gutterRef.value = element
}

function getCurrentEditorContent(view = editorView.value) {
  return view?.state?.doc?.toString?.() ?? ''
}

function markHandledContentUpdateToken(token) {
  if (Number.isInteger(token) !== true || token <= handledContentUpdateToken.value) {
    return
  }

  handledContentUpdateToken.value = token
}

function createPendingExternalSyncPayload({
  nextContent,
  pendingContentUpdateMeta,
  cursorPosition,
}) {
  return {
    nextContent,
    pendingContentUpdateMeta,
    cursorPosition,
    contentUpdateToken: pendingContentUpdateMeta.nextHandledToken,
  }
}

/**
 * 把编辑器当前选区夹到指定长度内。
 *
 * 用于「整篇替换正文」时显式给出新选区：只要事务带上 selection，
 * CodeMirror 就不会去映射旧选区，也就不会在旧选区越界时抛
 * `Position X is out of range for changeset of length Y`。
 *
 * @param {any} view
 * @param {number} targetLength
 * @returns {{ anchor: number, head: number }} 夹到目标长度内的选区
 */
function resolveClampedSelectionRange(view, targetLength) {
  const main = view?.state?.selection?.main
  const anchor = Number.isInteger(main?.anchor) ? main.anchor : 0
  const head = Number.isInteger(main?.head) ? main.head : 0

  return {
    anchor: Math.max(0, Math.min(targetLength, anchor)),
    head: Math.max(0, Math.min(targetLength, head)),
  }
}

/**
 * 派发事务；失败时把视图状态的关键位置一并打出来。
 *
 * `Position X is out of range for changeset of length Y` 这类错误发生在 CodeMirror
 * 内部（选区映射、语法解析上下文映射），堆栈里只看到 CodeMirror 自己的帧，
 * 看不到是哪个字段越界，所以在这里统一补一份现场快照。
 *
 * @param {any} view
 * @param {any} transaction
 * @param {object} [context] 额外的排查上下文
 */
function dispatchEditorTransaction(view, transaction, context = {}) {
  try {
    view.dispatch(transaction)
  } catch (error) {
    // 越界错误发生在 CodeMirror 内部，堆栈里看不到具体字段，
    // 这里补上文档长度与选区，便于排查。
    console.error('[doc-state] 派发事务失败', {
      error: error?.message,
      ...context,
      docLength: view.state.doc.length,
      selection: view.state.selection.main,
    })
    throw error
  }
}

function applyExternalEditorSync({
  view,
  nextContent,
  pendingContentUpdateMeta,
  cursorPosition,
}) {
  const currentValue = getCurrentEditorContent(view)
  // 光标位置必须夹到「本次同步后的文档长度」内。
  // 否则会向 CodeMirror 写入一个超出文档范围的选区：这种状态本身不报错，
  // 但下一次带 changes 的事务在映射选区时就会抛
  // `Position X is out of range for changeset of length Y`。
  // 多标签换入 EditorState 后，上一份文档的光标坐标很容易变成这种超界值。
  const safeCursorPosition = Number.isInteger(cursorPosition)
    ? Math.max(0, Math.min(nextContent.length, cursorPosition))
    : null

  // 整篇替换时**必须**显式给出新选区，不能留空。
  //
  // 留空会让 CodeMirror 走 `Transaction.newSelection` 里的
  // `startState.selection.map(changes)`，一旦视图里残留的选区越界，
  // `ChangeDesc.mapPos` 就会抛
  // `Position X is out of range for changeset of length Y`。
  //
  // 这条路径只在「父层不指定光标」时才会走到（例如文档切换、外部变更推快照），
  // 所以只夹取 cursorPosition 是盖不住的：那时 cursorPosition 本来就是 null。
  const selection = safeCursorPosition !== null
    ? { anchor: safeCursorPosition, head: safeCursorPosition }
    : resolveClampedSelectionRange(view, nextContent.length)

  if (currentValue !== nextContent) {
    dispatchEditorTransaction(view, {
      changes: {
        from: 0,
        to: currentValue.length,
        insert: nextContent,
      },
      selection,
      scrollIntoView: pendingContentUpdateMeta.scrollIntoView,
    }, {
      currentValueLength: currentValue.length,
      nextContentLength: nextContent.length,
      cursorPosition,
    })
  } else if (safeCursorPosition !== null) {
    view.dispatch({
      selection,
      scrollIntoView: pendingContentUpdateMeta.scrollIntoView,
    })
  }

  if (safeCursorPosition !== null && pendingContentUpdateMeta.focus === true) {
    view.focus()
  }

  lastExposedContent.value = nextContent
  restorePreviewLinkedHighlight()
}

function flushPendingExternalSync() {
  const payload = pendingExternalSync.value
  if (!payload) {
    return false
  }

  const view = editorView.value
  if (!view) {
    return false
  }

  const currentValue = getCurrentEditorContent(view)
  const compositionActive = isCompositionActive()
  if (shouldDeferExternalEditorDispatch({
    compositionActive,
    currentContent: currentValue,
    nextContent: payload.nextContent,
    shouldApplySelection: payload.pendingContentUpdateMeta.shouldApplySelection,
  })) {
    return false
  }

  pendingExternalSync.value = null

  if (shouldDeferStaleContentSync({
    currentContent: currentValue,
    nextContent: payload.nextContent,
    lastExposedContent: lastExposedContent.value,
    hasExplicitSelection: payload.pendingContentUpdateMeta.shouldApplySelection,
  })) {
    markHandledContentUpdateToken(payload.contentUpdateToken)
    restorePreviewLinkedHighlight()
    return true
  }

  applyExternalEditorSync({
    view,
    nextContent: payload.nextContent,
    pendingContentUpdateMeta: payload.pendingContentUpdateMeta,
    cursorPosition: payload.cursorPosition,
  })
  markHandledContentUpdateToken(payload.contentUpdateToken)
  return true
}

function syncExternalModelValue(newValue = props.modelValue) {
  const view = editorView.value
  const pendingContentUpdateMeta = resolvePendingContentUpdateMeta({
    handledToken: handledContentUpdateToken.value,
    contentUpdateMeta: props.contentUpdateMeta,
  })

  const cursorPosition = pendingContentUpdateMeta.shouldApplySelection
    ? Math.max(0, Math.min(newValue.length, pendingContentUpdateMeta.cursorPosition))
    : null

  if (!view) {
    pendingExternalSync.value = pendingContentUpdateMeta.shouldApplySelection === true
      ? createPendingExternalSyncPayload({
          nextContent: newValue,
          pendingContentUpdateMeta,
          cursorPosition,
        })
      : null
    lastExposedContent.value = newValue
    restorePreviewLinkedHighlight()
    return
  }

  const currentValue = getCurrentEditorContent(view)

  // 编辑器已经继续输入、但父层这时只回放了上一轮已上浮内容时，说明拿到的是滞后的 echo。
  // 这类内容如果整段重放，会把 CodeMirror 光标错误映射到文首。
  if (shouldDeferStaleContentSync({
    currentContent: currentValue,
    nextContent: newValue,
    lastExposedContent: lastExposedContent.value,
    hasExplicitSelection: pendingContentUpdateMeta.shouldApplySelection,
  })) {
    pendingExternalSync.value = null
    markHandledContentUpdateToken(pendingContentUpdateMeta.nextHandledToken)
    restorePreviewLinkedHighlight()
    return
  }

  const compositionActive = isCompositionActive()
  if (shouldDeferExternalEditorDispatch({
    compositionActive,
    currentContent: currentValue,
    nextContent: newValue,
    shouldApplySelection: pendingContentUpdateMeta.shouldApplySelection,
  })) {
    pendingExternalSync.value = createPendingExternalSyncPayload({
      nextContent: newValue,
      pendingContentUpdateMeta,
      cursorPosition,
    })
    restorePreviewLinkedHighlight()
    return
  }

  // 一旦当前这次外部同步已经可以直接落到编辑器，先丢弃更早的挂起 payload，
  // 避免 onCompositionIdle 的延后冲刷把更新过的新快照回滚成旧状态。
  pendingExternalSync.value = null

  applyExternalEditorSync({
    view,
    nextContent: newValue,
    pendingContentUpdateMeta,
    cursorPosition,
  })
  markHandledContentUpdateToken(pendingContentUpdateMeta.nextHandledToken)
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
  syncExternalModelValue(newValue)
}, { immediate: true })

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

// 纯预览态的布局类名：只有它会让编辑器不可见，离开时需要单独做一次位置交接。
const PREVIEW_ONLY_LAYOUT_CLASS = 'markdown-edit-layout--preview-only'

/**
 * 解析预览区当前顶部对应的源码行号。
 * 纯预览态不做实时反向同步，离开该模式时靠这个行号把浏览位置交给编辑器。
 *
 * @returns {number | null} 返回行号；预览不存在或无法判定时返回 null。
 */
function resolvePreviewTopLineNumber() {
  const previewElementRoot = previewRef.value
  if (!previewElementRoot) {
    return null
  }

  const targetElement = findPreviewElementAtScrollTop(previewElementRoot, previewElementRoot.scrollTop)
  const lineNumber = Number.parseInt(targetElement?.dataset?.lineStart, 10)

  return Number.isInteger(lineNumber) && lineNumber > 0 ? lineNumber : null
}

/**
 * 把离开纯预览时留档的行号应用到编辑器。
 * 必须在布局更新之后执行，确保编辑器已按新宽度完成重排。
 */
function applyPendingEditorLineFromPreview() {
  const lineNumber = pendingEditorLineFromPreview
  pendingEditorLineFromPreview = null
  if (Number.isInteger(lineNumber) !== true) {
    return
  }

  // 这里不抑制「编辑区 → 预览」同步：编辑器跳到该行后让预览跟随，两侧位置才会一致。
  // 若抑制，标记会残留到下一次切换（离开纯预览时不会发生反向同步来消费它），
  // 反而会把之后真正需要的同步吃掉。
  jumpEditorToLine(lineNumber)
}

watch(layoutMode, (nextLayoutMode, previousLayoutMode) => {
  closePreviewSearchBar()
  syncLayoutControllers()
  destroySplitLayout()
  // 抑制标记是一次性的，跨模式残留会吃掉新模式下的首次同步，这里统一清零。
  resetSuppressedSyncCounters()

  const previewWasVisible = previousLayoutMode?.columnOrder?.includes('preview') === true
  const previewNowVisible = nextLayoutMode.columnOrder.includes('preview')

  const previewOnlyWasActive = previousLayoutMode?.gridTemplateClass === PREVIEW_ONLY_LAYOUT_CLASS
  const previewOnlyNowActive = nextLayoutMode.gridTemplateClass === PREVIEW_ONLY_LAYOUT_CLASS
  if (previewOnlyWasActive === true && previewOnlyNowActive !== true) {
    // 离开纯预览：先在布局变化前读走预览位置，等 DOM 更新后再交给编辑器。
    pendingEditorLineFromPreview = resolvePreviewTopLineNumber()
  }

  if (previewNowVisible !== true) {
    pendingPreviewResyncAfterRefresh.value = false
  } else if (previewWasVisible !== true) {
    // 预览重新挂载后的首轮重同步只能由 refreshComplete 消费；
    // 在预览仍未完成刷新前，即使继续发生布局变化，也必须保留这次待执行标记。
    pendingPreviewResyncAfterRefresh.value = true
  }

  if (previewController.value !== true) {
    // 源码态没有预览区，待重同步标记没有意义。
    pendingPreviewResyncAfterRefresh.value = false
  }

  // 关联高亮只在双栏态有效：源码态没有预览、纯预览态没有可操作的编辑器，都要收起已有高亮。
  // 注意不能顺带清掉待重同步标记：源码切纯预览时，正是靠它在预览刷新完成后
  // 把编辑器位置带过去，清掉就会退回顶部。
  if (viewMode.value !== 'split') {
    clearLinkedHighlightDisplay()
  }

  // 纯预览态编辑器不可见，编辑搜索栏没有意义，切换过去时直接收起，避免残留浮层。
  if (viewMode.value === 'preview') {
    onEditorSearchBarClose()
  }

  nextTick(() => {
    resetSplitLayout()
    store.setOutlineScrollContainer(resolveOutlineScrollContainer())
    syncOutlineActiveLine()
    if (previewOnlyWasActive === true && previewOnlyNowActive !== true) {
      applyPendingEditorLineFromPreview()
    }
    if (previewController.value !== true) {
      return
    }

    if (pendingPreviewResyncAfterRefresh.value === true) {
      return
    }

    syncEditorToPreview(true)
    restorePreviewLinkedHighlight()
    // 关联高亮只在双栏态可用，而 props 的 watch 不会因视图模式变化触发，
    // 这里补一次主动高亮，否则从其它模式切回双栏后编辑器侧高亮要等下次光标移动才出现。
    highlightByEditorCursor()
  })
})

onMounted(() => {
  previewSearchTargetBridge.activate()
  syncLayoutControllers()
  nextTick(() => {
    resetSplitLayout()
    registerSidebarBridges()
  })

  // 首次挂载：为当前活动标签创建它的 EditorView。
  // 容器由模板的 v-for 渲染，此时已经就绪。
  ensureEditorViewForSession(activeEditorSessionId.value, props.modelValue)

  nextTick(() => {
    flushPendingExternalSync()
    bindEvents()
    isEditorPageActive.value = true
    if (props.associationHighlight === true) {
      highlightByEditorCursor()
    }
  })
})

onActivated(() => {
  isEditorPageActive.value = true
  previewSearchTargetBridge.activate()
  closePreviewSearchBar()
  nextTick(() => {
    registerSidebarBridges()
    flushPendingExternalSync()
  })
})

onDeactivated(() => {
  isEditorPageActive.value = false
  modelSyncScheduler.cancel()
  cancelPendingViewScrollRestore()
  closePreviewSearchBar()
  previewSearchTargetBridge.deactivate()
  unregisterSidebarBridges()
})

onBeforeUnmount(() => {
  isEditorPageActive.value = false
  modelSyncScheduler.cancel()
  cancelPendingViewScrollRestore()
  closePreviewSearchBar()
  previewSearchTargetBridge.deactivate({ preserveCleanupTarget: false })
  cancelScheduledCursorHighlight()
  clearAllLinkedHighlight()
  unbindEvents()
  cancelScheduledOutlineActiveLineSync()
  clearScrollTimer()
  destroySplitLayout()
  destroyEditor()
  pendingExternalSync.value = null
  unregisterSidebarBridges()
})

defineExpose({
  flushPendingModelSync,
  hasPendingModelSync,
  captureViewScrollAnchors,
  scheduleRestoreForCurrentSnapshot,
  cancelPendingViewScrollRestore,
  handleDocumentContextSwitch,
})
</script>

<template>
  <div
    class="grid grid-rows-[auto_1fr] grid-cols-1 h-full w-full"
  >
    <EditorToolbar v-if="viewMode !== 'preview'" :toolbar-list="toolbarList" />
    <div ref="editorContainer" data-testid="markdown-edit-layout" class="markdown-edit-layout grid w-full overflow-hidden" :class="editorContainerClass" :style="editorContainerStyle">
      <template v-for="item in layoutRenderItems" :key="item.key">
        <div
          v-if="item.type === 'editor'"
          data-layout-item="editor"
          class="markdown-edit-layout__editor h-full overflow-auto"
        >
          <!--
            每个标签一个 CodeMirror 容器，用 v-show 切换。
            不销毁 DOM：view 自带正文 / 选区 / undo 历史，滚动位置也随 DOM 保留。
          -->
          <div
            v-for="sessionId in editorTabSessionIds"
            v-show="sessionId === activeEditorSessionId"
            :key="sessionId"
            :ref="el => setEditorElement(sessionId, el)"
            class="h-full"
          />
        </div>
        <div
          v-else-if="item.type === 'gutter-preview'"
          :ref="setPreviewGutterElement"
          data-layout-item="gutter-preview"
          class="wj-sash wj-sash--vertical markdown-edit-layout__gutter markdown-edit-layout__gutter--preview h-full"
          :class="{ 'markdown-edit-layout__gutter--preview-hidden': viewMode === 'preview' }"
        />
        <div
          v-else-if="item.type === 'preview'"
          :ref="setPreviewElement"
          data-layout-item="preview"
          class="allow-search wj-scrollbar markdown-edit-layout__preview h-full overflow-y-auto p-2"
          :style="previewContainerStyle"
          @scroll="syncPreviewToEditor"
          @click="onPreviewAreaClick"
        >
          <div class="markdown-edit-layout__preview-center" :style="previewCenterStyle">
            <div v-if="showPreviewEmptyState" class="h-full flex items-center justify-center">
              <a-empty>
                <template #description>
                  <span>{{ t('editor.emptyDocument') }}</span>
                </template>
                <a-button type="primary" ghost @click="store.setViewMode('split')">
                  {{ t('editor.goToEdit') }}
                </a-button>
              </a-empty>
            </div>
            <MarkdownPreview
              v-else
              :content="props.modelValue"
              :code-theme="codeTheme"
              :preview-theme="previewTheme"
              :preview-scroll-container="() => previewRef"
              :watermark="watermark"
              :defer-watermark-until-ready="true"
              @refresh-complete="onRefreshComplete"
              @preview-contextmenu="onPreviewContextmenu"
              @asset-open="onAssetOpen"
            />
          </div>
        </div>
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

.markdown-edit-layout__gutter--preview {
  grid-area: gutter-preview;
}

// 纯预览态没有可拖拽分隔条，隐藏 gutter 元素，避免留下多余竖线。
.markdown-edit-layout__gutter--preview-hidden {
  display: none;
}

.markdown-edit-layout--editor-only {
  // split-grid 只能解析 px / fr / % / auto，不能直接吃 minmax(...)。
  grid-template-columns: 1fr 0px 0fr;
  grid-template-areas: 'editor gutter-preview preview';
}

.markdown-edit-layout--editor-preview {
  grid-template-columns: 1fr 1px 1fr;
  grid-template-areas: 'editor gutter-preview preview';
}

.markdown-edit-layout--preview-editor {
  grid-template-columns: 1fr 1px 1fr;
  grid-template-areas: 'preview gutter-preview editor';
}

.markdown-edit-layout--preview-only {
  // 编辑器保持全宽（与源码态一致）：尺寸不变，CodeMirror 的测量结果才不会被破坏。
  // 若把 editor 列压到 0 宽，列宽变化会触发重测，而 0 宽下算出的内容高度是错的，
  // 会导致 scrollTop 被 clamp 回顶部、视口只渲染部分行。
  grid-template-columns: 1fr 0px 0fr;
  grid-template-areas: 'editor gutter-preview preview';
}

.markdown-edit-layout--preview-only .markdown-edit-layout__editor {
  // 占满整行但不可见；不能用 0 宽或 display: none，否则同样会破坏编辑器测量。
  grid-area: 1 / 1 / 2 / 4;
  visibility: hidden;
  pointer-events: none;
}

.markdown-edit-layout--preview-only .markdown-edit-layout__preview {
  // 与编辑器同占一整行并叠在其上；这里用网格定位而不是绝对定位，
  // 避免绝对定位在网格里的包含块歧义导致预览拿不到宽度。
  grid-area: 1 / 1 / 2 / 4;
  z-index: 1;
  background-color: var(--wj-markdown-bg-primary);
}

.markdown-edit-layout__preview-center {
  margin: 0 auto;
  height: 100%;
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
