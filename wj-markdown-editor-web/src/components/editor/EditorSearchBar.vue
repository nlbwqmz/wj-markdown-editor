<script setup>
import { closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, replaceAll, replaceNext, SearchQuery, setSearchQuery } from '@codemirror/search'
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  editorView: {
    type: Object,
    required: true,
  },
})
const emits = defineEmits(['close'])
const inputRef = ref()
const searchBarRef = ref()

const searchOption = ref({
  search: '',
  replace: '',
  caseSensitive: false,
  regexp: false,
  wholeWord: false,
})

// 拖拽相关状态
const isDragging = ref(false)
const startPos = ref({ x: 0, y: 0 })
const modalPos = ref({ x: 0, y: 0 })

// 组件卸载时清理
onUnmounted(() => {
  closeSearchPanel(props.editorView)
  window.removeEventListener('mousemove', handleDrag)
  window.removeEventListener('mouseup', stopDrag)
})

onMounted(() => {
  // 依赖于默认的搜索组件 已在扩展样式中隐藏
  openSearchPanel(props.editorView)
  inputRef.value.focus()
  const query = getSearchQuery(props.editorView.state)
  searchOption.value.search = query.search
  searchOption.value.replace = query.replace
  searchOption.value.caseSensitive = query.caseSensitive
  searchOption.value.regexp = query.regexp
  searchOption.value.wholeWord = query.wholeWord
})

function doSearch() {
  const query = new SearchQuery({
    search: searchOption.value.search,
    regexp: searchOption.value.regexp,
    caseSensitive: searchOption.value.caseSensitive,
    wholeWord: searchOption.value.wholeWord,
    replace: searchOption.value.replace,
  })
  props.editorView.dispatch({ effects: setSearchQuery.of(query) })
}

watch(() => searchOption.value, () => {
  doSearch()
}, { deep: true })

function onFindPrevious() {
  findPrevious(props.editorView)
}
function onFindNext() {
  findNext(props.editorView)
}

function onReplace() {
  replaceNext(props.editorView)
}

function onReplaceAll() {
  replaceAll(props.editorView)
}

function onCloseSearchBar() {
  emits('close')
}

// 开始拖拽
function startDrag(e) {
  isDragging.value = true
  // 记录初始位置
  startPos.value = {
    x: e.clientX - modalPos.value.x,
    y: e.clientY - modalPos.value.y,
  }

  // 添加全局事件监听
  window.addEventListener('mousemove', handleDrag)
  window.addEventListener('mouseup', stopDrag)
}

// 处理拖拽
function handleDrag(e) {
  if (!isDragging.value)
    return
  // 计算新位置
  modalPos.value = {
    x: e.clientX - startPos.value.x,
    y: e.clientY - startPos.value.y,
  }
}

// 停止拖拽
function stopDrag() {
  isDragging.value = false
  // 移除事件监听
  window.removeEventListener('mousemove', handleDrag)
  window.removeEventListener('mouseup', stopDrag)
}
</script>

<template>
  <div
    ref="searchBarRef"
    class="fixed right-20 top-10 z-100 h-22 flex gap-1 b-1 b-border-primary rounded-2 b-solid bg-bg-primary p-2 font-size-3.5 shadow-[rgba(0,0,0,0.35)_0_5px_15px]"
    :style="{
      transform: `translate(${modalPos.x}px, ${modalPos.y}px)`,
    }"
  >
    <div class="flex select-none items-center justify-center text-text-primary" :style="{ cursor: isDragging ? 'grabbing' : 'grab' }" @mousedown="startDrag">
      编辑框
    </div>
    <div class="h-full b-r-1 b-r-border-primary b-r-solid" />
    <div class="grid grid-rows-[1fr_1fr] h-full flex-col gap-1">
      <div class="flex select-none gap-1">
        <div class="flex items-center justify-center">
          搜索
        </div>
        <input
          ref="inputRef"
          v-model="searchOption.search"
          class="h-full w-30 b-b-1 b-b-border-primary b-none b-b-solid bg-bg-primary outline-none"
          @keydown.enter="onFindNext"
        >
        <div class="h-full flex items-center gap-1 font-size-4.5 color-gray-500">
          <div class="cursor-pointer rounded-1 p-1 hover:bg-bg-hover" :class="searchOption.caseSensitive ? 'bg-bg-hover' : ''" @click="searchOption.caseSensitive = !searchOption.caseSensitive">
            <div class="i-tabler:letter-case" />
          </div>
          <div class="cursor-pointer rounded-1 p-1 hover:bg-bg-hover" :class="searchOption.wholeWord ? 'bg-bg-hover' : ''" @click="searchOption.wholeWord = !searchOption.wholeWord">
            <div class="i-tabler:circle-letter-w" />
          </div>
          <div class="cursor-pointer rounded-1 p-1 hover:bg-bg-hover" :class="searchOption.regexp ? 'bg-bg-hover' : ''" @click="searchOption.regexp = !searchOption.regexp">
            <div class="i-tabler:regex" />
          </div>
        </div>
        <div class="h-full b-r-1 b-r-border-primary b-r-solid" />
        <div class="h-full flex items-center font-size-4.5 color-gray-500">
          <div class="cursor-pointer rounded-1 p-1 hover:bg-bg-hover" @click="onFindPrevious">
            <div class="i-tabler:chevron-up" />
          </div>
          <div class="cursor-pointer rounded-1 p-1 hover:bg-bg-hover" @click="onFindNext">
            <div class="i-tabler:chevron-down" />
          </div>
          <div class="cursor-pointer rounded-1 p-1 hover:bg-bg-hover" @click="onCloseSearchBar">
            <div class="i-tabler:x" />
          </div>
        </div>
      </div>
      <div class="flex select-none items-center gap-1">
        <div class="flex items-center justify-center">
          替换
        </div>
        <input
          v-model="searchOption.replace"
          class="h-full w-30 b-b-1 b-b-border-primary b-none b-b-solid bg-bg-primary outline-none"
          @keydown.enter="onReplace"
        >
        <a-button @click="onReplace">
          替换
        </a-button>
        <a-button @click="onReplaceAll">
          全部替换
        </a-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">

</style>
