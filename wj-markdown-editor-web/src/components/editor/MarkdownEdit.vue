<script setup>
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
import { Compartment } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { Form } from 'ant-design-vue'
import { EditorView } from 'codemirror'
import Split from 'split-grid'
import { createVNode, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ColorPicker } from 'vue3-colorpicker'

const props = defineProps({
  modelValue: {
    type: String,
    default: () => '',
  },
  plugins: {
    type: Array,
    default: () => [],
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
})

const emits = defineEmits(['update:modelValue', 'upload', 'save', 'anchorChange', 'imageContextmenu'])
const toolbarList = ref([])
const shortcutKeyList = ref([])
let splitInstance

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
const menuVisible = ref(false)
const editorContainer = ref()
const anchorList = ref([])

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
function findPreviewElement(lineNumber) {
  const elements = previewRef.value.querySelectorAll('[data-line-start]')
  const waiting = []
  for (const element of elements) {
    const start = +element.dataset.lineStart
    const end = +element.dataset.lineEnd || start
    if (lineNumber >= start && lineNumber <= end) {
      waiting.push({ element, start, end })
    }
  }
  if (waiting.length === 0) {
    return null
  }
  waiting.sort((a, b) => (a.end - a.start) - (b.end - b.start))
  return waiting[0].element
}

let checkScrollCallbackTimer

function checkScrollTop(element, top, callback) {
  checkScrollCallbackTimer && clearTimeout(checkScrollCallbackTimer)
  checkScrollCallbackTimer = setTimeout(() => {
    top = Math.max(0, top)
    top = Math.min(element.scrollHeight - element.clientHeight, top)
    if (Math.abs(element.scrollTop - top) < 1) {
      callback && callback()
    } else {
      checkScrollTop(element, top, callback)
    }
  }, 100)
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

function jumpToTargetLine() {
  // 找到对应的预览元素
  const main = editorView.state.selection.main
  const line = editorView.state.doc.lineAt(main.to)
  const lineNumber = line.number
  const previewElement = findPreviewElement(lineNumber)
  if (previewElement && previewRef.value) {
    const startLineNumber = +previewElement.dataset.lineStart
    const endLineNumber = +previewElement.dataset.lineEnd
    let targetScrollTop
    if (startLineNumber === endLineNumber) {
      targetScrollTop = getElementToTopDistance(previewElement, previewRef.value)
    } else {
      const totalLineHeight = getTotalLineHeight(startLineNumber, endLineNumber)
      const offsetHeight = getTotalLineHeight(startLineNumber, lineNumber - 1)
      const scrollRatio = offsetHeight / totalLineHeight
      const elementTop = getElementToTopDistance(previewElement, previewRef.value)
      const elementHeight = previewElement.getBoundingClientRect().height
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

/* function jumpToTargetLine(line) {
  if (scrolling.value.preview) {
    return
  }
  // 找到对应的预览元素
  const lineNumber = line.number
  console.error(lineNumber)
  const previewElement = findPreviewElement(lineNumber)
  if (previewElement && previewRef.value) {
    // 使用offsetTop某些标签会有问题（tr、tbody等表格标签）
    const targetScrollTop = getElementToTopDistance(previewElement, previewRef.value)
    scrolling.value.editor = true
    // 平滑滚动到目标位置
    previewRef.value.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth',
    })
    checkScrollTop(previewRef.value, targetScrollTop, () => {
      scrolling.value.editor = false
    })
  }
} */

function syncEditorToPreview() {
  if (scrolling.value.preview) {
    return
  }
  // 获取编辑器滚动位置和可视区域高度
  const scrollTop = editorView.scrollDOM.scrollTop

  // 获取滚动位置对应的行块信息
  const topBlock = editorView.lineBlockAtHeight(scrollTop)

  // 计算当前行块的滚动比例
  let totalLineHeight
  let scrollOffsetInLine

  // 找到对应的预览元素
  const lineNumber = editorView.state.doc.lineAt(topBlock.from).number
  const previewElement = findPreviewElement(lineNumber)
  if (previewElement && previewRef.value) {
    const startLineNumber = +previewElement.dataset.lineStart
    const endLineNumber = +previewElement.dataset.lineEnd
    if (startLineNumber === endLineNumber) {
      totalLineHeight = topBlock.height
      scrollOffsetInLine = scrollTop - topBlock.top
    } else {
      totalLineHeight = getTotalLineHeight(startLineNumber, endLineNumber)
      scrollOffsetInLine = startLineNumber === lineNumber ? scrollTop - topBlock.top : getTotalLineHeight(startLineNumber, lineNumber - 1) + scrollTop - topBlock.top
    }
    const scrollRatio = scrollOffsetInLine / totalLineHeight
    // 计算预览元素的对应滚动位置
    // const elementTop = previewElement.offsetTop
    // 使用offsetTop某些标签会有问题（tr、tbody等表格标签）
    const elementTop = getElementToTopDistance(previewElement, previewRef.value)
    const elementHeight = previewElement.getBoundingClientRect().height

    // 根据比例调整目标位置
    const targetScrollTop = elementTop + (elementHeight * scrollRatio)
    scrolling.value.editor = true
    // 平滑滚动到目标位置
    previewRef.value.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth',
    })
    checkScrollTop(previewRef.value, targetScrollTop, () => {
      scrolling.value.editor = false
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
    const scrollRatio = elementScrollOffset / element.getBoundingClientRect().height

    // 找到编辑器的对应行
    const startLine = editorView.state.doc.line(startLineNumber)
    const totalLineHeight = getTotalLineHeight(startLineNumber, endLineNumber)
    const block = editorView.lineBlockAt(startLine.from)

    // 根据比例计算编辑器滚动位置
    const targetScrollTop = block.top + (totalLineHeight * scrollRatio)
    scrolling.value.preview = true
    // 平滑滚动编辑器
    editorView.scrollDOM.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth',
    })
    checkScrollTop(editorView.scrollDOM, targetScrollTop, () => {
      scrolling.value.preview = false
    })
  }
}

function onEditorWheel(e) {
  // e.deltaY > 0 表示往下滚动；且滚动条已到达底端
  if (e.deltaY > 0 && editorView.scrollDOM.scrollHeight === editorView.scrollDOM.scrollTop + editorView.scrollDOM.clientHeight) {
    e.preventDefault()
    previewRef.value.scrollBy({ top: e.deltaY, behavior: 'smooth' })
  }
}

onBeforeUnmount(() => {
  // 编辑器滚动监听
  editorView.scrollDOM.removeEventListener('wheel', onEditorWheel)
  editorView.scrollDOM.removeEventListener('scroll', syncEditorToPreview)
  // 预览区滚动监听
  previewRef.value.removeEventListener('scroll', syncPreviewToEditor)
})

// 绑定事件
function bindEvents() {
  // 编辑器滚动监听
  editorView.scrollDOM.addEventListener('wheel', onEditorWheel)
  editorView.scrollDOM.addEventListener('scroll', syncEditorToPreview)
  // 预览区滚动监听
  previewRef.value.addEventListener('scroll', syncPreviewToEditor)
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
  return keymapUtil.createKeymap(shortcutKeyList.value, { 'editor-focus-line': jumpToTargetLine })
}

onMounted(() => {
  menuVisible.value = useCommonStore().config.menuVisible
  const keymapList = refreshKeymap()
  splitInstance = Split({
    columnGutters: [{ track: 1, element: gutterRef.value }],
    // 最小尺寸
    minSize: 200,
    // 自动吸附距离
    snapOffset: 0,
  })
  editorView = new EditorView({
    doc: props.modelValue,
    lineWrapping: true,
    extensions: [
      keymapCompartment.of(keymap.of(keymapList)),
      ...editorExtensionUtil.getDefault(),
      EditorView.updateListener.of((update) => { // 监听更新
        if (update.docChanged && isComposing.value === false) { // 检查文档是否发生变化
          refresh()
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
      label: '加粗',
      icon: 'i-tabler:bold',
      shortcutKey: getKeymapByShortcutKeyId('editor-bold'),
      action: () => { editorUtil.bold(editorView) },
    },
    underline: {
      label: '下划线',
      icon: 'i-tabler:underline',
      shortcutKey: getKeymapByShortcutKeyId('editor-underline'),
      action: () => { editorUtil.underline(editorView) },
    },
    italic: {
      label: '斜体',
      icon: 'i-tabler:italic',
      shortcutKey: getKeymapByShortcutKeyId('editor-italic'),
      action: () => { editorUtil.italic(editorView) },
    },
    strikeThrough: {
      label: '删除线',
      icon: 'i-tabler:a-b-off',
      shortcutKey: getKeymapByShortcutKeyId('editor-del'),
      action: () => { editorUtil.strikeThrough(editorView) },
    },
    heading: {
      label: '标题',
      icon: 'i-tabler:heading',
      menuList: [
        {
          label: getKeymapByShortcutKeyId('editor-heading-1') ? commonUtil.createLabel('一级标题', getKeymapByShortcutKeyId('editor-heading-1')) : '一级标题',
          action: () => { editorUtil.heading(editorView, 1) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-heading-2') ? commonUtil.createLabel('二级标题', getKeymapByShortcutKeyId('editor-heading-2')) : '二级标题',
          action: () => { editorUtil.heading(editorView, 2) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-heading-3') ? commonUtil.createLabel('三级标题', getKeymapByShortcutKeyId('editor-heading-3')) : '三级标题',
          action: () => { editorUtil.heading(editorView, 3) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-heading-4') ? commonUtil.createLabel('四级标题', getKeymapByShortcutKeyId('editor-heading-4')) : '四级标题',
          action: () => { editorUtil.heading(editorView, 4) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-heading-5') ? commonUtil.createLabel('五级标题', getKeymapByShortcutKeyId('editor-heading-5')) : '五级标题',
          action: () => { editorUtil.heading(editorView, 5) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-heading-6') ? commonUtil.createLabel('六级标题', getKeymapByShortcutKeyId('editor-heading-6')) : '六级标题',
          action: () => { editorUtil.heading(editorView, 6) },
        },
      ],
    },
    subscript: {
      label: '下标',
      icon: 'i-tabler:subscript',
      shortcutKey: getKeymapByShortcutKeyId('editor-subscript'),
      action: () => { editorUtil.subscript(editorView) },
    },
    superscript: {
      label: '上标',
      icon: 'i-tabler:superscript',
      shortcutKey: getKeymapByShortcutKeyId('editor-superscript'),
      action: () => { editorUtil.superscript(editorView) },
    },
    quote: {
      label: '引用',
      icon: 'i-tabler:quote-filled',
      shortcutKey: getKeymapByShortcutKeyId('editor-quote'),
      action: () => { editorUtil.quote(editorView) },
    },
    list: {
      label: '无序列表',
      icon: 'i-tabler:list',
      shortcutKey: getKeymapByShortcutKeyId('editor-list'),
      action: () => { editorUtil.list(editorView) },
    },
    numberList: {
      label: '有序列表',
      icon: 'i-tabler:list-numbers',
      shortcutKey: getKeymapByShortcutKeyId('editor-list-numbers'),
      action: () => { editorUtil.numberList(editorView) },
    },
    taskList: {
      label: '任务列表',
      icon: 'i-tabler:list-check',
      shortcutKey: getKeymapByShortcutKeyId('editor-list-check'),
      action: () => { editorUtil.taskList(editorView) },
    },
    code: {
      label: '行内代码',
      icon: 'i-tabler:terminal',
      shortcutKey: getKeymapByShortcutKeyId('editor-code-inline'),
      action: () => { editorUtil.code(editorView) },
    },
    blockCode: {
      label: '代码块',
      icon: 'i-tabler:terminal-2',
      shortcutKey: getKeymapByShortcutKeyId('editor-code-block'),
      action: () => { editorUtil.blockCode(editorView) },
    },
    link: {
      label: '链接',
      icon: 'i-tabler:link',
      shortcutKey: getKeymapByShortcutKeyId('editor-link'),
      action: () => { editorUtil.link(editorView) },
    },
    mark: {
      label: '标记',
      icon: 'i-tabler:brush',
      shortcutKey: getKeymapByShortcutKeyId('editor-mark'),
      action: () => { editorUtil.mark(editorView) },
    },
    table: {
      label: '表格',
      icon: 'i-tabler:table',
      popover: createVNode(TableShape, { col: 6, row: 6, onSelect: (row, col) => {
        const main = editorView.state.selection.main
        editorUtil.insertTable(editorView, row, col, main.from, main.to)
      } }),
    },
    alert: {
      label: '提示',
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
      label: '容器',
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
      label: '图片',
      icon: 'i-tabler:photo',
      menuList: [
        {
          label: getKeymapByShortcutKeyId('editor-image-template') ? commonUtil.createLabel('插入模板', getKeymapByShortcutKeyId('editor-image-template')) : '插入模板',
          action: () => { editorUtil.image(editorView) },
        },
        {
          label: '本地图片',
          action: () => { editorUtil.imageLocal(editorView) },
        },
        {
          label: '网络图片',
          action: () => {
            imageNetworkData.name = undefined
            imageNetworkData.url = undefined
            imageNetworkModel.value = true
          },
        },
        {
          label: getKeymapByShortcutKeyId('editor-screenshot') ? commonUtil.createLabel('直接截图', getKeymapByShortcutKeyId('editor-screenshot')) : '直接截图',
          action: () => { editorUtil.screenshot(editorView, false) },
        },
        {
          label: getKeymapByShortcutKeyId('editor-screenshot-hide') ? commonUtil.createLabel('隐藏截图', getKeymapByShortcutKeyId('editor-screenshot-hide')) : '隐藏截图',
          action: () => { editorUtil.screenshot(editorView, true) },
        },
      ],
    },
    file: {
      label: '文件',
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
    undo: {
      label: '撤销',
      icon: 'i-tabler:arrow-back-up',
      shortcutKey: 'Ctrl+z',
      action: () => { editorUtil.undo(editorView) },
    },
    redo: {
      label: '重做',
      icon: 'i-tabler:arrow-forward-up',
      shortcutKey: 'Ctrl+y',
      action: () => { editorUtil.redo(editorView) },
    },
    focusLine: {
      label: '跳转到目标行',
      icon: 'i-tabler:focus-2',
      shortcutKey: getKeymapByShortcutKeyId('editor-focus-line'),
      action: jumpToTargetLine,
    },
    textColor: {
      label: '文字颜色',
      icon: 'i-tabler:color-picker',
      popover: createVNode(ColorPicker, {
        'is-widget': true,
        'picker-type': 'chrome',
        'use-type': 'both',
        'onPureColorChange': onTextColorChange,
        'onGradientColorChange': onTextColorChange,
      }, { extra: () => h('div', {}, '选中文字颜色语法文本直接更改颜色。') }),
    },
    menuVisible: {
      label: '目录',
      icon: 'i-tabler:menu-2',
      action: () => { menuVisible.value = !menuVisible.value },
    },
    prettier: {
      label: '美化',
      icon: 'i-tabler:circle-letter-p',
      action: () => { editorUtil.doPrettier(editorView) },
    },
    save: {
      label: '保存',
      icon: 'i-tabler:file-check',
      shortcutKey: 'Ctrl+s',
      action: () => { emits('save', editorView.state.doc.toString()) },
    },
  }
  const toolbarListTemp = []
  for (const key in defaultToolbar) {
    toolbarListTemp.push(defaultToolbar[key])
  }
  toolbarList.value = toolbarListTemp
}
watch(() => useCommonStore().config.shortcutKeyList, (newValue) => {
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

const menuController = ref(false)

watch(() => menuVisible.value, (newValue) => {
  editorContainer.value.style['grid-template-columns'] = ''
  if (newValue === true) {
    menuController.value = true
    nextTick(() => {
      splitInstance.addColumnGutter(gutterMenuRef.value, 3)
    })
  } else {
    splitInstance.removeColumnGutter(3, true)
    menuController.value = false
  }
})

function onImageContextmenu(src) {
  emits('imageContextmenu', src)
}
</script>

<template>
  <div
    class="grid grid-rows-[auto_1fr] grid-cols-1 h-full w-full border border-gray-200 border-solid"
  >
    <div
      class="w-full flex flex-wrap items-center justify-start flex-gap2 border-b-1 border-b-gray-200 border-b-solid p-1"
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
    <div ref="editorContainer" class="grid w-full overflow-hidden" :class="menuController ? 'grid-cols-[1fr_2px_1fr_2px_0.4fr]' : 'grid-cols-[1fr_2px_1fr]'">
      <div ref="editorRef" class="h-full overflow-auto" />
      <div ref="gutterRef" class="h-full cursor-col-resize bg-[#E2E2E2] op-0" />
      <div
        ref="previewRef"
        class="allow-search wj-scrollbar h-full p-2"
        :class="menuController ? 'overflow-y-scroll' : 'overflow-y-auto'"
      >
        <MarkdownPreview :content="props.modelValue" :code-theme="codeTheme" :preview-theme="previewTheme" :watermark="watermark" @anchor-change="onAnchorChange" @image-contextmenu="onImageContextmenu" />
      </div>
      <div v-if="menuController" ref="gutterMenuRef" class="h-full cursor-col-resize bg-[#E2E2E2] op-0" />
      <MarkdownMenu v-if="menuController" :anchor-list="anchorList" :get-container="() => previewRef" :close="() => { menuVisible = false }" />
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
  </div>
</template>

<style scoped lang="scss">
</style>
