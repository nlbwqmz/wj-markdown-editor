<script setup>
import { useCommonStore } from '@/stores/counter.js'
import Mark from 'mark.js'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const inputRef = ref()
const searchBarRef = ref()
let markInstance = null
// 因是跨标签匹配，所以每一项为一个下标数组
const markIndexGroup = ref([])

function getMarkInstance() {
  if (!markInstance) {
    markInstance = new Mark('.allow-search')
  }
  return markInstance
}

const searchOption = ref({
  content: '',
  caseSensitive: false,
})

const result = ref({
  total: 0,
  current: 0,
})

// 拖拽相关状态
const isDragging = ref(false)
const startPos = ref({ x: 0, y: 0 })
const modalPos = ref({ x: 0, y: 0 })

function doSearch() {
  const newValue = searchOption.value.content
  const instance = getMarkInstance()
  instance.unmark()
  if (newValue) {
    markIndexGroup.value = []
    instance.mark(newValue, { element: 'span', className: 'search-mark', acrossElements: true, caseSensitive: searchOption.value.caseSensitive, done: () => {
      nextTick(() => {
        const markList = document.querySelectorAll('.search-mark')
        const currentResult = { total: 0, current: 0 }
        let text = ''
        // 跨标签搜索，匹配项可能由好几个下标组成
        for (let i = 0; i < markList.length; i++) {
          const isNew = text === ''
          text = isNew ? markList.item(i).textContent : text + markList.item(i).textContent
          if ((searchOption.value.caseSensitive && text === newValue) || (!searchOption.value.caseSensitive && text.toUpperCase() === newValue.toUpperCase())) {
            currentResult.total++
            text = ''
          }
          if (isNew) {
            markIndexGroup.value.push([i])
          } else {
            if (markIndexGroup.value.length === 0) {
              markIndexGroup.value.push([])
            }
            markIndexGroup.value[markIndexGroup.value.length - 1].push(i)
          }
        }
        result.value = currentResult
      })
    } })
  } else {
    result.value = {
      total: 0,
      current: 0,
    }
  }
}

watch(() => searchOption.value, () => {
  doSearch()
}, { deep: true })

function renderActiveMarkHighlight() {
  const highlightList = document.querySelectorAll('.search-mark-highlight')
  highlightList.forEach((node) => {
    node.classList.remove('search-mark-highlight')
  })
  const markList = document.querySelectorAll('.search-mark')
  let executed = false
  markIndexGroup.value[result.value.current - 1].forEach((index) => {
    markList.item(index).classList.add('search-mark-highlight')
    if (executed === false) {
      markList.item(index).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      executed = true
    }
  })
}

function handleSearchBarUp() {
  if (result.value.total > 0) {
    if (result.value.current <= 1) {
      result.value.current = markIndexGroup.value.length
    } else {
      result.value.current--
    }
    renderActiveMarkHighlight()
  }
}
function handleSearchBarDown() {
  if (result.value.total > 0) {
    if (result.value.current === markIndexGroup.value.length) {
      result.value.current = 1
    } else {
      result.value.current++
    }
    renderActiveMarkHighlight()
  }
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

// 组件卸载时清理
onUnmounted(() => {
  window.removeEventListener('mousemove', handleDrag)
  window.removeEventListener('mouseup', stopDrag)
})

onMounted(() => {
  inputRef.value.focus()
})

function onCloseSearchBar() {
  getMarkInstance().unmark()
  useCommonStore().searchBarVisible = false
}
</script>

<template>
  <div
    ref="searchBarRef"
    class="fixed right-20 top-10 z-100 h-16 flex gap-2 b-1 b-[rgba(0,0,0,0.3)] rounded-2 b-solid bg-white p-2 font-size-4 shadow-[rgba(0,0,0,0.35)_0_5px_15px]"
    :style="{
      transform: `translate(${modalPos.x}px, ${modalPos.y}px)`,
    }"
  >
    <div class="flex select-none items-center justify-center p-l-1 p-r-1 color-gray-500" :style="{ cursor: isDragging ? 'grabbing' : 'grab' }" @mousedown="startDrag">
      搜索
    </div>
    <input
      ref="inputRef"
      v-model="searchOption.content"
      class="h-full w-30 b-b-1 b-b-gray-200 b-none b-b-solid outline-none"
    >
    <div class="h-full flex items-center font-size-5 color-gray-500">
      <div class="cursor-pointer rounded-1 p-1 hover:bg-gray-200" :class="searchOption.caseSensitive ? 'bg-gray-200' : ''" @click="searchOption.caseSensitive = !searchOption.caseSensitive">
        <div class="i-tabler:letter-case" />
      </div>
    </div>
    <div class="bo h-full b-r-1 b-r-gray-200 b-r-solid" />
    <div class="w-16 flex select-none items-center justify-center color-gray-500">
      {{ result.current }}/{{ result.total }}
    </div>
    <div class="bo h-full b-r-1 b-r-gray-200 b-r-solid" />
    <div class="h-full flex items-center font-size-5 color-gray-500">
      <div class="cursor-pointer rounded-1 p-1 hover:bg-gray-200" @click="handleSearchBarUp">
        <div class="i-tabler:chevron-up" />
      </div>
      <div class="cursor-pointer rounded-1 p-1 hover:bg-gray-200" @click="handleSearchBarDown">
        <div class="i-tabler:chevron-down" />
      </div>
      <div class="cursor-pointer rounded-1 p-1 hover:bg-gray-200" @click="onCloseSearchBar">
        <div class="i-tabler:x" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">

</style>
