<script setup>
import Split from 'split-grid'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isPointerSelectionUpdate } from '@/components/editor/composables/selectionUpdateUtil.js'
import { useAssetInsert } from '@/components/editor/composables/useAssetInsert.js'
import { useAssociationHighlight } from '@/components/editor/composables/useAssociationHighlight.js'
import { useEditorCore } from '@/components/editor/composables/useEditorCore.js'
import { usePreviewSync } from '@/components/editor/composables/usePreviewSync.js'
import { useToolbarBuilder } from '@/components/editor/composables/useToolbarBuilder.js'
import EditorSearchBar from '@/components/editor/EditorSearchBar.vue'
import EditorToolbar from '@/components/editor/EditorToolbar.vue'
import ImageNetworkModal from '@/components/editor/ImageNetworkModal.vue'
import MarkdownMenu from '@/components/editor/MarkdownMenu.vue'
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import { useCommonStore } from '@/stores/counter.js'
import commonUtil from '@/util/commonUtil.js'
import keymapUtil from '@/util/editor/keymap/keymapUtil.js'

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
const gridAnimation = ref(false)

const BOTTOM_GAP = '40vh'
const EDITOR_EMIT_DEBOUNCE_MS = 160

function onEditorSearchBarClose() {
  store.editorSearchBarVisible = false
}

const {
  editorView,
  initEditor,
  destroyEditor,
  reconfigureTheme,
  reconfigureExtensions,
  reconfigureKeymap,
} = useEditorCore({ editorRef })

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
  findPreviewElement,
  jumpToTargetLine,
  syncEditorToPreview,
  syncPreviewToEditor,
  bindEvents,
  unbindEvents,
  clearScrollTimer,
} = usePreviewSync({
  editorViewRef: editorView,
  previewRef,
  scrolling,
  editorScrollTop,
})

const {
  linkedSourceHighlightField,
  linkedHighlightThemeStyle,
  cancelScheduledCursorHighlight,
  clearAllLinkedHighlight,
  clearLinkedHighlightDisplay,
  highlightByEditorCursor,
  onPreviewAreaClick,
  restorePreviewLinkedHighlight,
} = useAssociationHighlight({
  editorViewRef: editorView,
  previewRef,
  previewController,
  associationHighlight: associationHighlightEnabled,
  themeRef,
  findPreviewElement,
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

const editorContainerClass = computed(() => {
  if (previewController.value && menuController.value) {
    return 'grid-cols-[1fr_2px_1fr_2px_0.4fr]'
  } else if (previewController.value) {
    return 'grid-cols-[1fr_2px_1fr_0px_0fr]'
  } else {
    return 'grid-cols-[1fr_0px_0fr_0px_0fr]'
  }
})

const refresh = commonUtil.debounce(() => {
  const view = editorView.value
  if (!view) {
    return
  }
  emits('update:modelValue', view.state.doc.toString())
}, EDITOR_EMIT_DEBOUNCE_MS)

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

function onAnchorChange(changedAnchorList) {
  anchorList.value = changedAnchorList
  emits('anchorChange', changedAnchorList)
}

function onImageContextmenu(src) {
  emits('imageContextmenu', src)
}

function onPreviewRefreshComplete() {
  restorePreviewLinkedHighlight()
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

watch(() => store.config.shortcutKeyList, (newValue) => {
  shortcutKeyList.value = newValue
  refreshToolbarList()
  reconfigureKeymap(refreshKeymap())
}, { deep: true, immediate: true })

watch(() => [menuVisible.value, previewVisible.value], () => {
  if (editorContainer.value) {
    editorContainer.value.style['grid-template-columns'] = ''
  }
  splitInstance && splitInstance.destroy(true)
  gridAnimation.value = true

  if (menuVisible.value && previewVisible.value) {
    previewController.value = true
    menuController.value = true
    nextTick(() => {
      splitInstance = Split({
        columnGutters: [{ track: 1, element: gutterRef.value }, { track: 3, element: gutterMenuRef.value }],
        minSize: 200,
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
        minSize: 200,
        snapOffset: 0,
      })
      setTimeout(() => {
        syncEditorToPreview(true)
        restorePreviewLinkedHighlight()
      }, 500)
    })
  } else {
    previewController.value = false
    clearLinkedHighlightDisplay()
  }

  setTimeout(() => {
    gridAnimation.value = false
  }, 500)
})

onMounted(() => {
  menuVisible.value = store.config.menuVisible
  splitInstance = Split({
    columnGutters: [{ track: 1, element: gutterRef.value }],
    minSize: 200,
    snapOffset: 0,
  })

  initEditor({
    doc: props.modelValue,
    theme: props.theme,
    extensionOptions: props.extension,
    keymapList: refreshKeymap(),
    extraExtensions: [linkedSourceHighlightField],
    onDocChange: refresh,
    onSelectionChange: (update) => {
      if (isPointerSelectionUpdate(update)) {
        return
      }
      highlightByEditorCursor(update.state)
    },
    onCompositionEnd: refresh,
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

onBeforeUnmount(() => {
  cancelScheduledCursorHighlight()
  clearAllLinkedHighlight()
  unbindEvents()
  clearScrollTimer()
  splitInstance && splitInstance.destroy(true)
  destroyEditor()
})
</script>

<template>
  <div
    class="grid grid-rows-[auto_1fr] grid-cols-1 h-full w-full"
  >
    <EditorToolbar :toolbar-list="toolbarList" />
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
        <MarkdownPreview
          :content="props.modelValue"
          :code-theme="codeTheme"
          :preview-theme="previewTheme"
          :watermark="watermark"
          @refresh-complete="onPreviewRefreshComplete"
          @anchor-change="onAnchorChange"
          @image-contextmenu="onImageContextmenu"
        />
      </div>
      <div v-if="menuController && previewController" ref="gutterMenuRef" class="h-full cursor-col-resize bg-[#E2E2E2] op-0" />
      <MarkdownMenu
        v-if="menuController && previewController"
        :anchor-list="anchorList"
        :get-container="() => previewRef"
        :close="() => { menuVisible = false }"
        class="allow-search"
      />
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
