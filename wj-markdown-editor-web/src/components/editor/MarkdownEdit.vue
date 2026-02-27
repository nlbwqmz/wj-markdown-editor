<script setup>
import EditorSearchBar from '@/components/editor/EditorSearchBar.vue'
import IconButton from '@/components/editor/IconButton.vue'
import MarkdownMenu from '@/components/editor/MarkdownMenu.vue'
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import TableShape from '@/components/TableShape.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import commonUtil from '@/util/commonUtil.js'
import editorExtensionUtil from '@/util/editor/editorExtensionUtil.js'
import editorUtil from '@/util/editor/editorUtil.js'
import keymapUtil from '@/util/editor/keymap/keymapUtil.js'
import { Compartment, StateEffect, StateField } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { Decoration, keymap } from '@codemirror/view'
import { Form, message } from 'ant-design-vue'
import { EditorView } from 'codemirror'
import Split from 'split-grid'
import { computed, createVNode, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ColorPicker } from 'vue3-colorpicker'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  modelValue: {
    type: String,
    default: () => '',
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
    default: () => 'github-light',
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
})

const emits = defineEmits(['update:modelValue', 'upload', 'save', 'anchorChange', 'imageContextmenu'])

const { t } = useI18n()
const store = useCommonStore()

const toolbarList = ref([])
const shortcutKeyList = ref([])
let splitInstance
const editorSearchBarVisible = computed(() => store.editorSearchBarVisible)
const dynamicExtension = editorExtensionUtil.getDynamicExtension()

function onEditorSearchBarClose() {
  store.editorSearchBarVisible = false
}

const useForm = Form.useForm

const imageNetworkModel = ref(false)
const imageNetworkData = reactive({ name: undefined, url: undefined })
const imageNetworkDataRules = reactive({
  url: [{ required: true, message: '请输入链接' }, { pattern: /^https?:\/\/.+/, message: '链接不正确' }],
})

const { validate } = useForm(imageNetworkData, imageNetworkDataRules)

const gutterRef = ref()
const gutterMenuRef = ref()
let editorView
const editorRef = ref()
const previewRef = ref()
const isComposing = ref(false)
const scrolling = ref({ editor: false, preview: false })
const keymapCompartment = new Compartment()
const themeCompartment = new Compartment()
const editorContainer = ref()
const anchorList = ref([])
const editorScrollTop = ref(0)
const menuVisible = ref(false)
const menuController = ref(false)
const previewVisible = ref(true)
const previewController = ref(true)
const gridAnimation = ref(false)
const linkedHighlightState = ref(null)
let activePreviewHighlightElement = null
const BOTTOM_GAP = '40vh'

// 编辑区联动高亮：通过装饰实现，不影响用户真实选区
const setLinkedSourceHighlightEffect = StateEffect.define()

function isSameLineRange(rangeA, rangeB) {
  if (!rangeA && !rangeB) {
    return true
  }
  if (!rangeA || !rangeB) {
    return false
  }
  return rangeA.startLine === rangeB.startLine && rangeA.endLine === rangeB.endLine
}

function buildLinkedSourceLineDecorations(doc, lineRange) {
  if (!lineRange) {
    return Decoration.none
  }
  const startLine = Math.max(1, Math.min(doc.lines, lineRange.startLine))
  const endLine = Math.max(1, Math.min(doc.lines, lineRange.endLine))
  const rangeStartLine = Math.min(startLine, endLine)
  const rangeEndLine = Math.max(startLine, endLine)
  const decorationList = []
  for (let lineNumber = rangeStartLine; lineNumber <= rangeEndLine; lineNumber++) {
    const line = doc.line(lineNumber)
    let className = 'cm-linked-source-highlight'
    if (rangeStartLine === rangeEndLine) {
      className += ' cm-linked-source-highlight-single'
    } else if (lineNumber === rangeStartLine) {
      className += ' cm-linked-source-highlight-start'
    } else if (lineNumber === rangeEndLine) {
      className += ' cm-linked-source-highlight-end'
    } else {
      className += ' cm-linked-source-highlight-middle'
    }
    decorationList.push(Decoration.line({ class: className }).range(line.from))
  }
  return Decoration.set(decorationList, true)
}

const linkedSourceHighlightField = StateField.define({
  create: () => {
    return {
      lineRange: null,
      decorations: Decoration.none,
    }
  },
  update: (value, transaction) => {
    let lineRange = value.lineRange
    for (const effect of transaction.effects) {
      if (effect.is(setLinkedSourceHighlightEffect)) {
        lineRange = effect.value
      }
    }
    if (lineRange && transaction.docChanged) {
      const maxLine = transaction.state.doc.lines
      lineRange = {
        startLine: Math.max(1, Math.min(maxLine, lineRange.startLine)),
        endLine: Math.max(1, Math.min(maxLine, lineRange.endLine)),
      }
    }
    if (isSameLineRange(lineRange, value.lineRange) && !transaction.docChanged) {
      return value
    }
    return {
      lineRange,
      decorations: buildLinkedSourceLineDecorations(transaction.state.doc, lineRange),
    }
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
})

function getEditorMaxLineNumber() {
  return editorView ? Math.max(1, editorView.state.doc.lines) : 1
}

function normalizeLineNumber(lineNumber) {
  const maxLine = getEditorMaxLineNumber()
  const numericLine = Number.parseInt(lineNumber, 10)
  if (Number.isNaN(numericLine)) {
    return 1
  }
  return Math.max(1, Math.min(maxLine, numericLine))
}

function normalizeLineRange(startLine, endLine) {
  const normalizedStartLine = normalizeLineNumber(startLine)
  const normalizedEndLine = normalizeLineNumber(endLine)
  if (normalizedStartLine <= normalizedEndLine) {
    return { startLine: normalizedStartLine, endLine: normalizedEndLine }
  }
  return { startLine: normalizedEndLine, endLine: normalizedStartLine }
}

function clearPreviewLinkedHighlight() {
  if (activePreviewHighlightElement) {
    activePreviewHighlightElement.classList.remove('wj-preview-link-highlight')
    activePreviewHighlightElement = null
  }
}

function clearAllLinkedHighlight() {
  clearPreviewLinkedHighlight()
  linkedHighlightState.value = null
  setEditorLinkedHighlight(null)
}

function setPreviewLinkedHighlight(element) {
  if (!element) {
    clearPreviewLinkedHighlight()
    return
  }
  if (activePreviewHighlightElement && activePreviewHighlightElement !== element) {
    activePreviewHighlightElement.classList.remove('wj-preview-link-highlight')
  }
  activePreviewHighlightElement = element
  activePreviewHighlightElement.classList.add('wj-preview-link-highlight')
}

function getLineRangeFromPreviewElement(element) {
  if (!element) {
    return null
  }
  const startLine = Number.parseInt(element.dataset.lineStart, 10)
  if (Number.isNaN(startLine)) {
    return null
  }
  const endLine = Number.parseInt(element.dataset.lineEnd, 10)
  return {
    startLine,
    endLine: Number.isNaN(endLine) ? startLine : endLine,
  }
}

function getPreviewElementDepth(element) {
  let depth = 0
  let current = element
  while (current && current !== previewRef.value) {
    depth++
    current = current.parentElement
  }
  return depth
}

function setEditorLinkedHighlight(lineRange) {
  if (!editorView) {
    return
  }
  editorView.dispatch({
    effects: setLinkedSourceHighlightEffect.of(lineRange),
  })
}

function syncPreviewLinkedHighlightByLine(lineNumber) {
  if (!previewRef.value || !editorView) {
    clearPreviewLinkedHighlight()
    return
  }
  const normalizedLineNumber = normalizeLineNumber(lineNumber)
  const previewElement = findPreviewElement(editorView.state.doc.lines, normalizedLineNumber, true)
  setPreviewLinkedHighlight(previewElement.element)
}

function highlightBothSidesByLineRange(startLine, endLine, preferLine = startLine) {
  if (!editorView || props.associationHighlight !== true) {
    return
  }
  const normalizedLineRange = normalizeLineRange(startLine, endLine)
  const normalizedPreferLine = normalizeLineNumber(preferLine)
  const nextLinkedHighlightState = {
    ...normalizedLineRange,
    preferLine: normalizedPreferLine,
  }
  linkedHighlightState.value = nextLinkedHighlightState
  setEditorLinkedHighlight(normalizedLineRange)
  syncPreviewLinkedHighlightByLine(normalizedPreferLine)
}

function highlightByEditorCursor(state) {
  if (!editorView || props.associationHighlight !== true) {
    return
  }
  const currentState = state || editorView.state
  const lineNumber = currentState.doc.lineAt(currentState.selection.main.to).number
  highlightBothSidesByLineRange(lineNumber, lineNumber, lineNumber)
}

function onPreviewAreaClick(event) {
  if (!previewRef.value || !editorView || props.associationHighlight !== true) {
    return
  }
  if (!(event.target instanceof Element)) {
    return
  }
  const targetLineElement = event.target.closest('[data-line-start]')
  if (!(targetLineElement instanceof Element) || !previewRef.value.contains(targetLineElement)) {
    return
  }
  const lineRange = getLineRangeFromPreviewElement(targetLineElement)
  if (!lineRange) {
    return
  }
  highlightBothSidesByLineRange(lineRange.startLine, lineRange.endLine, lineRange.startLine)
}

function restorePreviewLinkedHighlight() {
  if (props.associationHighlight !== true) {
    clearAllLinkedHighlight()
    return
  }
  if (!linkedHighlightState.value) {
    clearPreviewLinkedHighlight()
    return
  }
  nextTick(() => {
    if (!linkedHighlightState.value) {
      return
    }
    syncPreviewLinkedHighlightByLine(linkedHighlightState.value.preferLine)
  })
}

const linkedHighlightThemeStyle = computed(() => {
  if (store.config.theme.global === 'dark') {
    return {
      '--wj-link-highlight-border': '#69b1ff',
      '--wj-link-highlight-bg': 'rgba(105, 177, 255, 0.2)',
      '--wj-link-highlight-width': '2px',
      '--wj-link-highlight-radius': '4px',
    }
  }
  return {
    '--wj-link-highlight-border': '#1677ff',
    '--wj-link-highlight-bg': 'rgba(22, 119, 255, 0.12)',
    '--wj-link-highlight-width': '2px',
    '--wj-link-highlight-radius': '4px',
  }
})

const editorContainerStyle = computed(() => {
  const style = {
    ...linkedHighlightThemeStyle.value,
    '--wj-editor-bottom-gap': BOTTOM_GAP,
    '--wj-preview-bottom-gap': BOTTOM_GAP,
  }
  if (gridAnimation.value) {
    style.transition = 'grid-template-columns 0.5s ease-in-out'
  }
  return style
})

const previewContainerStyle = computed(() => {
  return {
    paddingBottom: 'calc(var(--wj-preview-bottom-gap) + 0.5rem)',
  }
})

watch(() => props.theme, (newValue) => {
  if (newValue === 'dark') {
    editorView.dispatch({
      effects: themeCompartment.reconfigure([oneDark]),
    })
  } else {
    editorView.dispatch({
      effects: themeCompartment.reconfigure([]),
    })
  }
})

watch(() => props.extension, (newValue) => {
  for (const key in dynamicExtension) {
    if (!newValue || newValue[key] !== false) {
      editorView.dispatch({
        effects: dynamicExtension[key].compartment.reconfigure(dynamicExtension[key].extension),
      })
    } else {
      editorView.dispatch({
        effects: dynamicExtension[key].compartment.reconfigure([]),
      })
    }
  }
}, { deep: true })

function insertImageToEditor(imageInfo) {
  if (imageInfo) {
    const to = editorView.state.selection.main.to
    // 如果当前行不为空的话，则需要使用换行符
    let wrap = false
    const line = editorView.state.doc.lineAt(to)
    if (line.from !== line.to) {
      wrap = true
    }
    const insert = `${wrap === true ? '\n' : ''}![${imageInfo.name}](<${imageInfo.path}>)`

    editorView.dispatch({
      changes: {
        from: to,
        to,
        insert,
      },
      selection: { anchor: to + insert.length },
    })
  }
}

function insertFileToEditor(fileInfo) {
  if (fileInfo) {
    const to = editorView.state.selection.main.to
    // 如果当前行不为空的话，则需要使用换行符
    const insert = `[${fileInfo.name}](<${fileInfo.path}>)`
    editorView.dispatch({
      changes: {
        from: to,
        to,
        insert,
      },
      selection: { anchor: to + insert.length },
    })
  }
}

function onInsertImgNetwork() {
  validate().then(async () => {
    imageNetworkModel.value = false
    const fileInfo = await channelUtil.send({
      event: 'upload-image',
      data: {
        mode: 'network',
        name: imageNetworkData.name,
        url: imageNetworkData.url,
      },
    })
    editorUtil.insertImageToEditor(editorView, fileInfo)
  }).catch(() => {})
}

// function uploadCallback() {
//   const from = editorView.state.selection.main.from
//   const to = editorView.state.selection.main.to
//   return (strList) => {
//     const str = strList.join('\n')
//     editorView.dispatch({
//       changes: { from, to, insert: str },
//     })
//     editorView.dispatch({
//       selection: { anchor: from, head: from + str.length },
//     })
//   }
// }

// 按比例同步滚动逻辑
// function syncScroll(sourceType) {
//   if (scrolling.value) {
//     return
//   }
//   scrolling.value = true
//   // 获取滚动信息
//   const [source, target] = sourceType === 'editor'
//     ? [editorView.scrollDOM, previewRef.value]
//     : [previewRef.value, editorView.scrollDOM]
//
//   // 计算滚动比例
//   const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight)
//   const targetScrollTop = ratio * (target.scrollHeight - target.clientHeight)
//
//   // 同步到目标
//   if (sourceType === 'editor') {
//     previewRef.value.scrollTo({ top: targetScrollTop })
//   } else {
//     editorView.scrollDOM.scrollTo({ top: targetScrollTop })
//   }
//   requestAnimationFrame(() => {
//     scrolling.value = false
//   })
// }

// 查找匹配行号的元素
function findPreviewElement(maxLineNumber, lineNumber, first) {
  const elements = previewRef.value.querySelectorAll('[data-line-start]')
  const waiting = []
  for (const element of elements) {
    const start = +element.dataset.lineStart
    const end = +element.dataset.lineEnd || start
    if (lineNumber >= start && lineNumber <= end) {
      waiting.push({ element, start, end, depth: getPreviewElementDepth(element) })
    }
  }
  if (waiting.length === 0) {
    if (lineNumber < maxLineNumber) {
      return findPreviewElement(maxLineNumber, lineNumber + 1, false)
    } else {
      return { element: null, found: false }
    }
  }
  waiting.sort((a, b) => {
    const spanCompare = (a.end - a.start) - (b.end - b.start)
    if (spanCompare !== 0) {
      return spanCompare
    }
    return b.depth - a.depth
  })
  return { element: waiting[0].element, found: first }
}

let checkScrollCallbackTimer

function checkScrollTop(element, top, callback) {
  // 清除之前的定时器
  checkScrollCallbackTimer && clearTimeout(checkScrollCallbackTimer)

  // 标准化目标滚动位置
  top = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, top))

  // 定义滚动完成的处理函数
  const handleScrollComplete = () => {
    // 移除事件监听器
    element.removeEventListener('scrollend', handleScrollComplete)
    // 清除fallback定时器
    clearTimeout(checkScrollCallbackTimer)
    // 调用回调
    callback && callback()
  }

  // 优先使用现代浏览器的scrollend事件
  if ('onscrollend' in element) {
    element.addEventListener('scrollend', handleScrollComplete, { once: true })

    // 设置fallback定时器，防止scrollend事件因某些原因未触发
    checkScrollCallbackTimer = setTimeout(() => {
      element.removeEventListener('scrollend', handleScrollComplete)
      callback && callback()
    }, 1000) // 1秒超时，确保回调总会执行
  } else {
    // 旧浏览器降级方案：使用requestAnimationFrame进行更精确的轮询
    let lastScrollTop = -1

    const pollScroll = () => {
      // 再次标准化目标位置（元素大小可能变化）
      const normalizedTop = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, top))

      // 检查条件：
      // 1. 滚动已达到目标位置附近（误差小于1px）
      // 2. 滚动已停止（连续两次相同的scrollTop值）
      if (Math.abs(element.scrollTop - normalizedTop) < 1 || element.scrollTop === lastScrollTop) {
        callback && callback()
      } else {
        lastScrollTop = element.scrollTop
        checkScrollCallbackTimer = requestAnimationFrame(pollScroll)
      }
    }

    pollScroll()
  }
}

function getTotalLineHeight(start, end) {
  let height = 0
  while (start <= end) {
    height += editorView.lineBlockAt(editorView.state.doc.line(start).from).height
    start++
  }
  return height
}

// 获取指定滚动容器内元素到容器顶部的距离（包含滚动偏移）
function getElementToTopDistance(targetElement, containerElement) {
  // 获取元素和容器的位置信息
  const trRect = targetElement.getBoundingClientRect()
  const containerRect = containerElement.getBoundingClientRect()

  // 计算相对位置（考虑容器边框和滚动位置）
  return trRect.top - containerRect.top - containerElement.clientTop + containerElement.scrollTop
}

function clampScrollRatio(value) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

function jumpToTargetLine() {
  if (!previewRef.value) {
    message.warning('请先打开预览')
    return
  }
  // 找到对应的预览元素
  const main = editorView.state.selection.main
  const line = editorView.state.doc.lineAt(main.to)
  const lineNumber = line.number
  const previewElement = findPreviewElement(editorView.state.doc.lines, lineNumber, true)
  if (previewElement.element && previewRef.value) {
    const startLineNumber = +previewElement.element.dataset.lineStart
    const endLineNumber = +previewElement.element.dataset.lineEnd
    let targetScrollTop
    if (startLineNumber === endLineNumber || previewElement.found === false) {
      targetScrollTop = getElementToTopDistance(previewElement.element, previewRef.value)
    } else {
      const totalLineHeight = getTotalLineHeight(startLineNumber, endLineNumber)
      const offsetHeight = getTotalLineHeight(startLineNumber, lineNumber - 1)
      const scrollRatio = clampScrollRatio(totalLineHeight > 0 ? offsetHeight / totalLineHeight : 0)
      const elementTop = getElementToTopDistance(previewElement.element, previewRef.value)
      const elementHeight = previewElement.element.getBoundingClientRect().height
      // 根据比例调整目标位置
      targetScrollTop = elementTop + (elementHeight * scrollRatio)
    }
    // 平滑滚动到目标位置
    previewRef.value.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth',
    })
  }
}

function syncEditorToPreview(refresh) {
  if (scrolling.value.preview) {
    return
  }
  if (!previewRef.value) {
    return
  }

  // 若竖向滚动条值没改变则表示横向滚动 直接跳过
  if (editorScrollTop.value === editorView.scrollDOM.scrollTop) {
    if (refresh !== true) {
      return
    }
  }
  editorScrollTop.value = editorView.scrollDOM.scrollTop
  // 获取编辑器滚动位置和可视区域高度
  const scrollTop = editorView.scrollDOM.scrollTop

  // 获取滚动位置对应的行块信息
  const topBlock = editorView.lineBlockAtHeight(scrollTop)

  // 计算当前行块的滚动比例
  let totalLineHeight
  let scrollOffsetInLine

  // 找到对应的预览元素
  const lineNumber = editorView.state.doc.lineAt(topBlock.from).number
  const previewElement = findPreviewElement(editorView.state.doc.lines, lineNumber, true)
  if (previewElement.element && previewRef.value) {
    let targetScrollTop = 0
    if (previewElement.found) {
      const startLineNumber = +previewElement.element.dataset.lineStart
      const endLineNumber = +previewElement.element.dataset.lineEnd
      if (startLineNumber === endLineNumber) {
        totalLineHeight = topBlock.height
        scrollOffsetInLine = scrollTop - topBlock.top
      } else {
        totalLineHeight = getTotalLineHeight(startLineNumber, endLineNumber)
        scrollOffsetInLine = startLineNumber === lineNumber ? scrollTop - topBlock.top : getTotalLineHeight(startLineNumber, lineNumber - 1) + scrollTop - topBlock.top
      }
      const scrollRatio = clampScrollRatio(totalLineHeight > 0 ? scrollOffsetInLine / totalLineHeight : 0)
      // 计算预览元素的对应滚动位置
      // const elementTop = previewElement.offsetTop
      // 使用offsetTop某些标签会有问题（tr、tbody等表格标签）
      const elementTop = getElementToTopDistance(previewElement.element, previewRef.value)
      const elementHeight = previewElement.element.getBoundingClientRect().height

      // 根据比例调整目标位置
      targetScrollTop = elementTop + (elementHeight * scrollRatio)
    } else {
      targetScrollTop = getElementToTopDistance(previewElement.element, previewRef.value)
    }

    scrolling.value.editor = true

    checkScrollTop(previewRef.value, targetScrollTop, () => {
      scrolling.value.editor = false
    })
    // 平滑滚动到目标位置
    previewRef.value.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth',
    })
  }
}

// 根据滚动位置查找元素
function findElementAtPreviewScroll(scrollTop) {
  const elements = Array.from(previewRef.value.querySelectorAll('[data-line-start]'))
  let target = elements[0]
  for (const element of elements) {
    if (element.offsetTop <= scrollTop) {
      target = element
    } else {
      break
    }
  }
  return target
}

function syncPreviewToEditor() {
  if (scrolling.value.editor) {
    return
  }
  const previewScrollTop = previewRef.value.scrollTop

  // 找到当前预览滚动位置对应的元素
  const element = findElementAtPreviewScroll(previewScrollTop)
  if (element && element.dataset.lineStart) {
    const startLineNumber = +element.dataset.lineStart
    const endLineNumber = +element.dataset.lineEnd

    // 计算元素内滚动比例
    const elementTop = getElementToTopDistance(element, previewRef.value)
    const elementScrollOffset = previewScrollTop - elementTop
    const elementHeight = element.getBoundingClientRect().height
    const scrollRatio = clampScrollRatio(elementHeight > 0 ? elementScrollOffset / elementHeight : 0)

    // 找到编辑器的对应行
    const startLine = editorView.state.doc.line(startLineNumber)
    const totalLineHeight = getTotalLineHeight(startLineNumber, endLineNumber)
    const block = editorView.lineBlockAt(startLine.from)

    // 根据比例计算编辑器滚动位置
    const targetScrollTop = block.top + (totalLineHeight * scrollRatio)
    scrolling.value.preview = true
    checkScrollTop(editorView.scrollDOM, targetScrollTop, () => {
      scrolling.value.preview = false
    })
    // 平滑滚动编辑器
    editorView.scrollDOM.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth',
    })
  }
}

function onEditorWheel(e) {
  // 按住shift表示横向滚动，跳过
  if (e.shiftKey === true) {
    return
  }
  if (previewRef.value) {
    // e.deltaY > 0 表示往下滚动；且滚动条已到达底端
    // e.deltaY < 0 表示往上滚动；且滚动条已到到顶端
    if ((e.deltaY > 0 && editorView.scrollDOM.scrollHeight === editorView.scrollDOM.scrollTop + editorView.scrollDOM.clientHeight)
      || (e.deltaY < 0 && editorView.scrollDOM.scrollTop === 0)
    ) {
      e.preventDefault()
      previewRef.value.scrollBy({ top: e.deltaY, behavior: 'smooth' })
    }
  }
}

onBeforeUnmount(() => {
  clearAllLinkedHighlight()
  // 编辑器滚动监听
  editorView?.scrollDOM.removeEventListener('wheel', onEditorWheel)
  editorView?.scrollDOM.removeEventListener('scroll', syncEditorToPreview)
  // 预览区滚动监听
  // if (previewRef.value) {
  //   previewRef.value.removeEventListener('scroll', syncPreviewToEditor)
  // }
})

// 绑定事件
function bindEvents() {
  // 编辑器滚动监听
  editorView.scrollDOM.addEventListener('wheel', onEditorWheel)
  editorView.scrollDOM.addEventListener('scroll', syncEditorToPreview)
  // 预览区滚动监听
  // previewRef.value.addEventListener('scroll', syncPreviewToEditor)
}

// function updateEditorContent(newContent) {
//   const transaction = editorView.state.update({
//     changes: { from: 0, to: editorView.state.doc.length, insert: newContent },
//   })
//   editorView.dispatch(transaction)
// }

const refresh = commonUtil.debounce(() => {
  const doc = editorView.state.doc.toString()
  emits('update:modelValue', doc)
}, 100)

watch(() => props.modelValue, () => {
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

// function refresh() {
//   const doc = editorView.state.doc.toString()
//   emits('update:modelValue', doc)
// }

function pasteOrDrop(event, view, types, files) {
  if (types.includes('Files')) {
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i)
      if (file.type && file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = async function (event) {
          const fileInfo = await channelUtil.send({
            event: 'upload-image',
            data: {
              mode: 'local',
              type: file.type,
              name: file.name,
              base64: event.target.result,
            },
          })
          insertImageToEditor(fileInfo)
        }
        reader.readAsDataURL(file)
      } else {
        const filePath = channelUtil.getWebFilePath(file)
        channelUtil.send({ event: 'file-upload', data: filePath }).then((fileInfo) => {
          insertFileToEditor(fileInfo)
        }).catch(() => {})
      }
    }
    // emits('upload', clipboardData.files, uploadCallback())
    event.preventDefault()
  }
}

function refreshKeymap() {
  const searchKeymap = {
    key: 'Ctrl-f',
    preventDefault: true,
    stopPropagation: true,
    run: () => {
      if (store.searchBarVisible === true) {
        store.searchBarVisible = false
      }
      store.editorSearchBarVisible = !store.editorSearchBarVisible
      return true
    },
  }
  const keymapList = keymapUtil.createKeymap(shortcutKeyList.value, { 'editor-focus-line': jumpToTargetLine })
  keymapList.push(searchKeymap)
  return keymapList
}

onMounted(() => {
  menuVisible.value = store.config.menuVisible
  const keymapList = refreshKeymap()
  splitInstance = Split({
    columnGutters: [{ track: 1, element: gutterRef.value }],
    // 最小尺寸
    minSize: 200,
    // 自动吸附距离
    snapOffset: 0,
  })
  const dynamicExtensionList = []
  for (const key in dynamicExtension) {
    if (!props.extension || props.extension[key] !== false) {
      dynamicExtensionList.push(dynamicExtension[key].compartment.of(dynamicExtension[key].extension))
    }
  }
  editorView = new EditorView({
    doc: props.modelValue,
    lineWrapping: true,
    extensions: [
      themeCompartment.of(props.theme === 'dark' ? [oneDark] : []),
      keymapCompartment.of(keymap.of(keymapList)),
      linkedSourceHighlightField,
      ...editorExtensionUtil.getDefault(),
      ...dynamicExtensionList,
      EditorView.updateListener.of((update) => { // 监听更新
        if (update.docChanged && isComposing.value === false) { // 检查文档是否发生变化
          refresh()
        }
        if (update.selectionSet) {
          highlightByEditorCursor(update.state)
        }
      }),
      EditorView.domEventHandlers({
        // 监听 IME 输入开始事件
        compositionstart: () => {
          // @codemirror/view固定为6.27.0版本，新版本(6.36.2)该事件不会正确触发
          isComposing.value = true
        },
        // 监听 IME 输入结束事件
        compositionend: () => {
          // @codemirror/view固定为6.27.0版本，新版本(6.36.2)该事件不会正确触发
          isComposing.value = false
          refresh()
        },
        paste: (event, view) => {
          const clipboardData = event.clipboardData
          pasteOrDrop(event, view, clipboardData.types, clipboardData.files)
        },
        click: (_event, view) => {
          highlightByEditorCursor(view.state)
        },
        drop: (event, view) => {
          const dataTransfer = event.dataTransfer
          pasteOrDrop(event, view, dataTransfer.types, dataTransfer.files)
          /* if (files.length > 0) {
            event.preventDefault()
            const file = files[0]
            console.error(file)
            const reader = new FileReader()
            if (file.type.startsWith('image/')) {
              // 处理图片文件
              reader.onload = function (e) {
                const imageUrl = e.target.result
                view.dispatch({
                  changes: {
                    from: view.state.selection.main.from,
                    insert: `![image](${imageUrl})`,
                  },
                })
              }
              reader.readAsDataURL(file)
            } else {
              // 处理文本文件
              reader.onload = function (e) {
                const fileContent = e.target.result
                view.dispatch({
                  changes: {
                    from: view.state.selection.main.from,
                    insert: fileContent,
                  },
                })
              }
              reader.readAsText(file)
            }
          } */
        },
      }),
    ],
    parent: editorRef.value,
  })
  nextTick(() => {
    bindEvents()
    if (props.associationHighlight === true) {
      highlightByEditorCursor()
    }
  })
})

function getKeymapByShortcutKeyId(id) {
  const shortcutKey = shortcutKeyList.value.find(item => item.id === id && item.enabled === true)
  if (shortcutKey) {
    return shortcutKey.keymap
  }
  return ''
}

/**
 * 处理字符串指定范围内的颜色标记
 * @param {string} originalStr 原始字符串
 * @param {string} color 颜色值(如"red"或"#ff0000")
 * @param {number} startIndex 开始坐标
 * @param {number} endIndex 结束坐标
 * @returns {string} 处理后的字符串
 */
function applyColorToRange(originalStr, color, startIndex, endIndex) {
  // 检查坐标是否有效
  if (startIndex < 0 || endIndex > originalStr.length || startIndex > endIndex) {
    throw new Error('Invalid range coordinates')
  }

  // 提取目标子字符串
  const targetSubstring = originalStr.substring(startIndex, endIndex)

  // 检查是否已被颜色语法包裹
  const colorSyntaxRegex = /^\{([^}]+)\}\(([^)]+)\)$/
  const isWrapped = colorSyntaxRegex.test(targetSubstring)

  // 处理不同情况
  if (isWrapped) {
    // 情况1：已被包裹，只修改颜色值
    const match = targetSubstring.match(colorSyntaxRegex)
    const newWrapped = `{${color}}(${match[2]})`
    return (
      originalStr.substring(0, startIndex)
      + newWrapped
      + originalStr.substring(endIndex)
    )
  } else {
    // 情况2：未被包裹，添加颜色语法
    const newWrapped = `{${color}}(${targetSubstring})`
    return (
      originalStr.substring(0, startIndex)
      + newWrapped
      + originalStr.substring(endIndex)
    )
  }
}

function onTextColorChange(color) {
  const main = editorView.state.selection.main
  if (main.from === main.to) {
    return
  }
  const fromLine = editorView.state.doc.lineAt(main.from)
  const toLine = editorView.state.doc.lineAt(main.to)
  if (fromLine.number !== toLine.number) {
    return
  }
  const lineText = fromLine.text
  const convertedText = applyColorToRange(lineText, color, main.from - fromLine.from, main.to - fromLine.from)
  editorView.dispatch({
    changes: {
      from: fromLine.from,
      to: fromLine.to,
      insert: convertedText,
    },
    selection: { anchor: main.from, head: fromLine.from + convertedText.length - (fromLine.to - main.to) },
  })
}

function refreshToolbarList() {
  const defaultToolbar = {
    bold: {
      label: t('shortcutKey.editor-bold'),
      icon: 'i-tabler:bold',
      shortcutKey: getKeymapByShortcutKeyId('editor-bold'),
      action: () => { editorUtil.bold(editorView) },
    },
    underline: {
      label: t('shortcutKey.editor-underline'),
      icon: 'i-tabler:underline',
      shortcutKey: getKeymapByShortcutKeyId('editor-underline'),
      action: () => { editorUtil.underline(editorView) },
    },
    italic: {
      label: t('shortcutKey.editor-italic'),
      icon: 'i-tabler:italic',
      shortcutKey: getKeymapByShortcutKeyId('editor-italic'),
      action: () => { editorUtil.italic(editorView) },
    },
    strikeThrough: {
      label: t('shortcutKey.editor-del'),
      icon: 'i-tabler:a-b-off',
      shortcutKey: getKeymapByShortcutKeyId('editor-del'),
      action: () => { editorUtil.strikeThrough(editorView) },
    },
    heading: {
      label: t('editor.heading'),
      icon: 'i-tabler:heading',
      menuList: [
        {
          label: getKeymapByShortcutKeyId('editor-heading-1') ? commonUtil.createLabel(t('shortcutKey.editor-heading-1'), getKeymapByShortcutKeyId('editor-heading-1')) : t('shortcutKey.editor-heading-1'),
          action: () => { editorUtil.heading(editorView, 1) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-heading-2') ? commonUtil.createLabel(t('shortcutKey.editor-heading-2'), getKeymapByShortcutKeyId('editor-heading-2')) : t('shortcutKey.editor-heading-2'),
          action: () => { editorUtil.heading(editorView, 2) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-heading-3') ? commonUtil.createLabel(t('shortcutKey.editor-heading-3'), getKeymapByShortcutKeyId('editor-heading-3')) : t('shortcutKey.editor-heading-3'),
          action: () => { editorUtil.heading(editorView, 3) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-heading-4') ? commonUtil.createLabel(t('shortcutKey.editor-heading-4'), getKeymapByShortcutKeyId('editor-heading-4')) : t('shortcutKey.editor-heading-4'),
          action: () => { editorUtil.heading(editorView, 4) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-heading-5') ? commonUtil.createLabel(t('shortcutKey.editor-heading-5'), getKeymapByShortcutKeyId('editor-heading-5')) : t('shortcutKey.editor-heading-5'),
          action: () => { editorUtil.heading(editorView, 5) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-heading-6') ? commonUtil.createLabel(t('shortcutKey.editor-heading-6'), getKeymapByShortcutKeyId('editor-heading-6')) : t('shortcutKey.editor-heading-6'),
          action: () => { editorUtil.heading(editorView, 6) },
        },
      ],
    },
    subscript: {
      label: t('shortcutKey.editor-subscript'),
      icon: 'i-tabler:subscript',
      shortcutKey: getKeymapByShortcutKeyId('editor-subscript'),
      action: () => { editorUtil.subscript(editorView) },
    },
    superscript: {
      label: t('shortcutKey.editor-superscript'),
      icon: 'i-tabler:superscript',
      shortcutKey: getKeymapByShortcutKeyId('editor-superscript'),
      action: () => { editorUtil.superscript(editorView) },
    },
    quote: {
      label: t('shortcutKey.editor-quote'),
      icon: 'i-tabler:quote-filled',
      shortcutKey: getKeymapByShortcutKeyId('editor-quote'),
      action: () => { editorUtil.quote(editorView) },
    },
    list: {
      label: t('shortcutKey.editor-list'),
      icon: 'i-tabler:list',
      shortcutKey: getKeymapByShortcutKeyId('editor-list'),
      action: () => { editorUtil.list(editorView) },
    },
    numberList: {
      label: t('shortcutKey.editor-list-numbers'),
      icon: 'i-tabler:list-numbers',
      shortcutKey: getKeymapByShortcutKeyId('editor-list-numbers'),
      action: () => { editorUtil.numberList(editorView) },
    },
    taskList: {
      label: t('shortcutKey.editor-list-check'),
      icon: 'i-tabler:list-check',
      shortcutKey: getKeymapByShortcutKeyId('editor-list-check'),
      action: () => { editorUtil.taskList(editorView) },
    },
    code: {
      label: t('shortcutKey.editor-code-inline'),
      icon: 'i-tabler:terminal',
      shortcutKey: getKeymapByShortcutKeyId('editor-code-inline'),
      action: () => { editorUtil.code(editorView) },
    },
    blockCode: {
      label: t('shortcutKey.editor-code-block'),
      icon: 'i-tabler:terminal-2',
      shortcutKey: getKeymapByShortcutKeyId('editor-code-block'),
      action: () => { editorUtil.blockCode(editorView) },
    },
    link: {
      label: t('shortcutKey.editor-link'),
      icon: 'i-tabler:link',
      shortcutKey: getKeymapByShortcutKeyId('editor-link'),
      action: () => { editorUtil.link(editorView) },
    },
    mark: {
      label: t('shortcutKey.editor-mark'),
      icon: 'i-tabler:brush',
      shortcutKey: getKeymapByShortcutKeyId('editor-mark'),
      action: () => { editorUtil.mark(editorView) },
    },
    table: {
      label: t('editor.table'),
      icon: 'i-tabler:table',
      popover: createVNode(TableShape, { col: 6, row: 6, onSelect: (row, col) => {
        const main = editorView.state.selection.main
        editorUtil.insertTable(editorView, row, col, main.from, main.to)
      } }),
    },
    alert: {
      label: t('editor.alert'),
      icon: 'i-tabler:alert-square',
      menuList: [
        { label: 'note', action: () => { editorUtil.alertContainer(editorView, 'note') } },
        { label: 'tip', action: () => { editorUtil.alertContainer(editorView, 'tip') } },
        { label: 'important', action: () => { editorUtil.alertContainer(editorView, 'important') } },
        { label: 'warning', action: () => { editorUtil.alertContainer(editorView, 'warning') } },
        { label: 'caution', action: () => { editorUtil.alertContainer(editorView, 'caution') } },
      ],
    },
    container: {
      label: t('editor.container'),
      icon: 'i-tabler:container',
      menuList: [
        { label: 'info', action: () => { editorUtil.container(editorView, 'info') } },
        { label: 'tip', action: () => { editorUtil.container(editorView, 'tip') } },
        { label: 'important', action: () => { editorUtil.container(editorView, 'important') } },
        { label: 'warning', action: () => { editorUtil.container(editorView, 'warning') } },
        { label: 'danger', action: () => { editorUtil.container(editorView, 'danger') } },
        { label: 'details', action: () => { editorUtil.container(editorView, 'details') } },
      ],
    },
    image: {
      label: t('editor.image'),
      icon: 'i-tabler:photo',
      menuList: [
        {
          label: getKeymapByShortcutKeyId('editor-image-template') ? commonUtil.createLabel(t('shortcutKey.editor-image-template'), getKeymapByShortcutKeyId('editor-image-template')) : t('shortcutKey.editor-image-template'),
          action: () => { editorUtil.image(editorView) },
        },
        {
          label: t('editor.localImage'),
          action: () => { editorUtil.imageLocal(editorView) },
        },
        {
          label: t('editor.networkImage'),
          action: () => {
            imageNetworkData.name = undefined
            imageNetworkData.url = undefined
            imageNetworkModel.value = true
          },
        },
        {
          label: getKeymapByShortcutKeyId('editor-screenshot') ? commonUtil.createLabel(t('shortcutKey.editor-screenshot'), getKeymapByShortcutKeyId('editor-screenshot')) : t('shortcutKey.editor-screenshot'),
          action: () => { editorUtil.screenshot(editorView, false) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-screenshot-hide') ? commonUtil.createLabel(t('shortcutKey.editor-screenshot-hide'), getKeymapByShortcutKeyId('editor-screenshot-hide')) : t('shortcutKey.editor-screenshot-hide'),
          action: () => { editorUtil.screenshot(editorView, true) },
        },
      ],
    },
    file: {
      label: t('editor.file'),
      icon: 'i-tabler:file',
      action: () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.addEventListener('change', (event) => {
          if (event.target && event.target.files && event.target.files.length > 0) {
            const file = event.target.files[0]
            const filePath = channelUtil.getWebFilePath(file)
            channelUtil.send({ event: 'file-upload', data: filePath }).then((fileInfo) => {
              insertFileToEditor(fileInfo)
            }).catch(() => {})
          }
        })
        input.click()
        editorView.focus()
      },
    },
    video: {
      label: t('editor.video'),
      icon: 'i-tabler:video',
      menuList: [
        {
          label: t('editor.insertTemplate'),
          action: () => { editorUtil.video(editorView) },
        },
        {
          label: t('editor.localVideo'),
          action: () => { editorUtil.videoLocal(editorView) },
        },
      ],
    },
    audio: {
      label: t('editor.audio'),
      icon: 'i-tabler:device-audio-tape',
      menuList: [
        {
          label: t('editor.insertTemplate'),
          action: () => { editorUtil.audio(editorView) },
        },
        {
          label: t('editor.localAudio'),
          action: () => { editorUtil.audioLocal(editorView) },
        },
      ],
    },
    undo: {
      label: t('editor.undo'),
      icon: 'i-tabler:arrow-back-up',
      shortcutKey: 'Ctrl+z',
      action: () => { editorUtil.undo(editorView) },
    },
    redo: {
      label: t('editor.redo'),
      icon: 'i-tabler:arrow-forward-up',
      shortcutKey: 'Ctrl+y',
      action: () => { editorUtil.redo(editorView) },
    },
    textColor: {
      label: t('editor.textColor'),
      icon: 'i-tabler:color-picker',
      popover: createVNode(ColorPicker, {
        'is-widget': true,
        'picker-type': 'chrome',
        'use-type': 'both',
        'onPureColorChange': onTextColorChange,
        'onGradientColorChange': onTextColorChange,
      }, { extra: () => h('div', {}, t('editor.textColorTip')) }),
    },
    focusLine: {
      label: t('shortcutKey.editor-focus-line'),
      icon: 'i-tabler:focus-2',
      shortcutKey: getKeymapByShortcutKeyId('editor-focus-line'),
      action: jumpToTargetLine,
    },
    previewVisible: {
      label: t('editor.preview'),
      icon: 'i-tabler:eye',
      action: () => { previewVisible.value = !previewVisible.value },
    },
    menuVisible: {
      label: t('outline'),
      icon: 'i-tabler:menu-2',
      action: () => {
        if (previewRef.value) {
          menuVisible.value = !menuVisible.value
        } else {
          message.warning(t('editor.outlineTip'))
        }
      },
    },
    prettier: {
      label: t('editor.prettier'),
      icon: 'i-tabler:circle-letter-p',
      action: () => { editorUtil.doPrettier(editorView) },
    },
    save: {
      label: t('shortcutKey.save'),
      icon: 'i-tabler:file-check',
      shortcutKey: getKeymapByShortcutKeyId('save'),
      action: () => { emits('save', editorView.state.doc.toString()) },
    },
  }
  const toolbarListTemp = []
  for (const key in defaultToolbar) {
    toolbarListTemp.push(defaultToolbar[key])
  }
  toolbarList.value = toolbarListTemp
}
watch(() => store.config.shortcutKeyList, (newValue) => {
  shortcutKeyList.value = newValue
  refreshToolbarList()
  if (editorView) {
    editorView.dispatch({
      effects: keymapCompartment.reconfigure(keymap.of(refreshKeymap())),
    })
  }
}, { deep: true, immediate: true })

function onAnchorChange(changedAnchorList) {
  anchorList.value = changedAnchorList
  emits('anchorChange', changedAnchorList)
}

watch(() => [menuVisible.value, previewVisible.value], () => {
  editorContainer.value.style['grid-template-columns'] = ''
  splitInstance.destroy(true)
  gridAnimation.value = true
  if (menuVisible.value && previewVisible.value) {
    previewController.value = true
    menuController.value = true
    nextTick(() => {
      splitInstance = Split({
        columnGutters: [{ track: 1, element: gutterRef.value }, { track: 3, element: gutterMenuRef.value }],
        // 最小尺寸
        minSize: 200,
        // 自动吸附距离
        snapOffset: 0,
      })
      setTimeout(() => {
        syncEditorToPreview(true)
        restorePreviewLinkedHighlight()
      }, 500)
    })
  } else if (previewVisible.value) {
    previewController.value = true
    menuController.value = false
    nextTick(() => {
      splitInstance = Split({
        columnGutters: [{ track: 1, element: gutterRef.value }],
        // 最小尺寸
        minSize: 200,
        // 自动吸附距离
        snapOffset: 0,
      })
      setTimeout(() => {
        syncEditorToPreview(true)
        restorePreviewLinkedHighlight()
      }, 500)
    })
  } else {
    previewController.value = false
    clearPreviewLinkedHighlight()
  }
  setTimeout(() => {
    gridAnimation.value = false
  }, 500)
})

function onImageContextmenu(src) {
  emits('imageContextmenu', src)
}

function onPreviewRefreshComplete() {
  restorePreviewLinkedHighlight()
}

const editorContainerClass = computed(() => {
  if (previewController.value && menuController.value) {
    return 'grid-cols-[1fr_2px_1fr_2px_0.4fr]'
  } else if (previewController.value) {
    return 'grid-cols-[1fr_2px_1fr_0px_0fr]'
  } else {
    return 'grid-cols-[1fr_0px_0fr_0px_0fr]'
  }
})
</script>

<template>
  <div
    class="grid grid-rows-[auto_1fr] grid-cols-1 h-full w-full"
  >
    <div
      class="w-full flex flex-wrap items-center justify-start flex-gap2 border-b-1 border-t-1 border-b-border-primary border-t-border-primary border-b-solid border-t-solid p-1"
    >
      <IconButton
        v-for="(item, index) in toolbarList" :key="index" :icon="item.icon"
        :label="item.label"
        :shortcut-key="item.shortcutKey"
        :menu-list="item.menuList"
        :action="item.action"
        :popover="item.popover"
      />
    </div>
    <div ref="editorContainer" class="grid w-full overflow-hidden" :class="editorContainerClass" :style="editorContainerStyle">
      <div ref="editorRef" class="h-full overflow-auto" />
      <div v-if="previewController" ref="gutterRef" class="h-full cursor-col-resize bg-[#E2E2E2] op-0" />
      <div
        v-if="previewController"
        ref="previewRef"
        class="allow-search wj-scrollbar h-full p-2"
        :style="previewContainerStyle"
        :class="menuController ? 'overflow-y-scroll' : 'overflow-y-auto'"
        @scroll="syncPreviewToEditor"
        @click="onPreviewAreaClick"
      >
        <MarkdownPreview :content="props.modelValue" :code-theme="codeTheme" :preview-theme="previewTheme" :watermark="watermark" @refresh-complete="onPreviewRefreshComplete" @anchor-change="onAnchorChange" @image-contextmenu="onImageContextmenu" />
      </div>
      <div v-if="menuController && previewController" ref="gutterMenuRef" class="h-full cursor-col-resize bg-[#E2E2E2] op-0" />
      <MarkdownMenu v-if="menuController && previewController" :anchor-list="anchorList" :get-container="() => previewRef" :close="() => { menuVisible = false }" class="allow-search" />
    </div>
    <a-modal v-model:open="imageNetworkModel" title="网络图片" ok-text="确定" cancel-text="取消" centered destroy-on-close @ok="onInsertImgNetwork">
      <a-form
        :model="imageNetworkData"
        :rules="imageNetworkDataRules"
        autocomplete="off"
        :label-col="{ span: 4 }"
      >
        <a-form-item
          label="名称"
          name="name"
        >
          <a-input v-model:value="imageNetworkData.name" />
        </a-form-item>
        <a-form-item
          label="链接"
          name="url"
        >
          <a-input v-model:value="imageNetworkData.url" />
        </a-form-item>
      </a-form>
    </a-modal>
    <EditorSearchBar v-if="editorSearchBarVisible" :editor-view="editorView" @close="onEditorSearchBarClose" />
  </div>
</template>

<style scoped lang="scss">
:deep(.wj-preview-link-highlight) {
  border-radius: var(--wj-link-highlight-radius);
  background-color: var(--wj-link-highlight-bg);
  outline: var(--wj-link-highlight-width) solid var(--wj-link-highlight-border);
  outline-offset: var(--wj-link-highlight-width);
}

:deep(.cm-linked-source-highlight) {
  background-color: var(--wj-link-highlight-bg);
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
