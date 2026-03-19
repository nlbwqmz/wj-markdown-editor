<script setup>
import Mark from 'mark.js'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCommonStore } from '@/stores/counter.js'
import { previewSearchBarController } from '@/util/searchBarController.js'
import { createEmptySearchResult, getNextSearchCurrent, resolveSearchResult } from '@/util/searchBarStateUtil.js'

const inputRef = ref()
const searchBarRef = ref()
const store = useCommonStore()
// 因是跨标签匹配，所以每一项为一个下标数组
const markIndexGroup = ref([])

const searchOption = ref({
  content: '',
  caseSensitive: false,
})

const result = ref(createEmptySearchResult())

// 拖拽相关状态
const isDragging = ref(false)
const startPos = ref({ x: 0, y: 0 })
const modalPos = ref({ x: 0, y: 0 })

function getSearchTargetElements() {
  return previewSearchBarController.getTargetElements()
}

function getCleanupTargetElements() {
  return previewSearchBarController.getCleanupTargetElements()
}

function collectMarkedNodes(className, targetElements = getSearchTargetElements()) {
  const nodeSet = new Set()
  const nodeList = []
  targetElements.forEach((element) => {
    const matchedNodes = element.querySelectorAll(`.${className}`)
    matchedNodes.forEach((node) => {
      if (!nodeSet.has(node)) {
        nodeSet.add(node)
        nodeList.push(node)
      }
    })
  })
  return nodeList
}

function clearActiveMarkHighlight(targetElements = getSearchTargetElements()) {
  collectMarkedNodes('search-mark-highlight', targetElements).forEach((node) => {
    node.classList.remove('search-mark-highlight')
  })
}

function clearSearchMarks(targetElements = getCleanupTargetElements()) {
  if (targetElements.length === 0) {
    return
  }
  new Mark(targetElements).unmark({ element: 'span', className: 'search-mark' })
}

function resetSearchIndex() {
  markIndexGroup.value = []
  result.value = createEmptySearchResult()
}

function buildMarkIndexGroup(markList, searchContent, caseSensitive) {
  const nextMarkIndexGroup = []
  let total = 0
  let text = ''

  for (let i = 0; i < markList.length; i++) {
    const currentNode = markList[i]
    const currentText = currentNode.textContent || ''
    const isNew = text === ''

    text = isNew ? currentText : text + currentText

    if ((caseSensitive && text === searchContent) || (!caseSensitive && text.toUpperCase() === searchContent.toUpperCase())) {
      total++
      text = ''
    }

    if (isNew) {
      nextMarkIndexGroup.push([i])
    } else {
      if (nextMarkIndexGroup.length === 0) {
        nextMarkIndexGroup.push([])
      }
      nextMarkIndexGroup[nextMarkIndexGroup.length - 1].push(i)
    }
  }

  return {
    total,
    nextMarkIndexGroup,
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

function clearSearchHighlight({ targetElements } = {}) {
  const cleanupTargetElements = targetElements || getCleanupTargetElements()
  clearActiveMarkHighlight(cleanupTargetElements)
  clearSearchMarks(cleanupTargetElements)
  resetSearchIndex()
}

async function rebuildSearchIndex() {
  const currentContent = searchOption.value.content
  const targetElements = getSearchTargetElements()

  clearActiveMarkHighlight()
  clearSearchMarks(targetElements)
  markIndexGroup.value = []

  if (!currentContent || targetElements.length === 0) {
    resetSearchIndex()
    return result.value
  }

  return await new Promise((resolve) => {
    new Mark(targetElements).mark(currentContent, {
      element: 'span',
      className: 'search-mark',
      acrossElements: true,
      caseSensitive: searchOption.value.caseSensitive,
      done: () => {
        nextTick(() => {
          const markList = collectMarkedNodes('search-mark')
          const { total, nextMarkIndexGroup } = buildMarkIndexGroup(markList, currentContent, searchOption.value.caseSensitive)
          markIndexGroup.value = nextMarkIndexGroup
          result.value = resolveSearchResult({
            total,
            previousCurrent: result.value.current,
            preserveCurrent: false,
          })
          if (result.value.current > 0) {
            applyCurrentHighlight({ scrollIntoView: false })
          }
          resolve(result.value)
        })
      },
    })
  })
}

function applyCurrentHighlight({ scrollIntoView = true } = {}) {
  clearActiveMarkHighlight()

  const currentIndexGroup = markIndexGroup.value[result.value.current - 1]
  if (!currentIndexGroup || currentIndexGroup.length === 0) {
    return false
  }

  const markList = collectMarkedNodes('search-mark')
  let executed = false

  for (const index of currentIndexGroup) {
    const targetNode = markList[index]
    if (!targetNode) {
      return false
    }
    targetNode.classList.add('search-mark-highlight')
    if (executed === false && scrollIntoView === true) {
      targetNode.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      executed = true
    }
  }

  return true
}

function handleSearchBarUp() {
  if (!searchOption.value.content || result.value.total === 0) {
    return
  }

  result.value.current = getNextSearchCurrent({
    current: result.value.current,
    total: result.value.total,
    direction: 'up',
  })

  if (applyCurrentHighlight({ scrollIntoView: true }) === false) {
    previewSearchBarController.close(store)
  }
}

function handleSearchBarDown() {
  if (!searchOption.value.content || result.value.total === 0) {
    return
  }

  result.value.current = getNextSearchCurrent({
    current: result.value.current,
    total: result.value.total,
    direction: 'down',
  })

  if (applyCurrentHighlight({ scrollIntoView: true }) === false) {
    previewSearchBarController.close(store)
  }
}

watch(() => searchOption.value, async () => {
  await rebuildSearchIndex()
}, { deep: true })

// 组件卸载时清理
onUnmounted(() => {
  const shouldCleanupOnUnmount = previewSearchBarController.unregisterCleanup(clearSearchHighlight)
  if (shouldCleanupOnUnmount) {
    clearSearchHighlight()
  }
  window.removeEventListener('mousemove', handleDrag)
  window.removeEventListener('mouseup', stopDrag)
})

onMounted(() => {
  previewSearchBarController.registerCleanup(clearSearchHighlight)
  inputRef.value.focus()
})

function onCloseSearchBar() {
  previewSearchBarController.close(store)
}
</script>

<template>
  <div
    ref="searchBarRef"
    class="fixed right-20 top-10 z-100 h-14 flex gap-1 b-1 b-border-primary rounded-2 b-solid bg-bg-primary p-2 font-size-3.5 text-text-primary shadow-[rgba(0,0,0,0.35)_0_5px_15px]"
    :style="{
      transform: `translate(${modalPos.x}px, ${modalPos.y}px)`,
    }"
  >
    <div class="flex select-none items-center justify-center text-text-primary" :style="{ cursor: isDragging ? 'grabbing' : 'grab' }" @mousedown="startDrag">
      搜索
    </div>
    <input
      ref="inputRef"
      v-model="searchOption.content"
      class="h-full w-30 b-b-1 b-b-border-primary b-none b-b-solid bg-bg-primary outline-none"
    >
    <div class="h-full flex items-center font-size-4.5 color-gray-500">
      <div class="cursor-pointer rounded-1 p-1 hover:bg-bg-hover" :class="searchOption.caseSensitive ? 'bg-bg-hover' : ''" @click="searchOption.caseSensitive = !searchOption.caseSensitive">
        <div class="i-tabler:letter-case" />
      </div>
    </div>
    <div class="h-full b-r-1 b-r-border-primary b-r-solid" />
    <div class="w-16 flex select-none items-center justify-center color-gray-500">
      {{ result.current }}/{{ result.total }}
    </div>
    <div class="h-full b-r-1 b-r-border-primary b-r-solid" />
    <div class="h-full flex items-center font-size-4.5 color-gray-500">
      <div class="cursor-pointer rounded-1 p-1 hover:bg-bg-hover" @click="handleSearchBarUp">
        <div class="i-tabler:chevron-up" />
      </div>
      <div class="cursor-pointer rounded-1 p-1 hover:bg-bg-hover" @click="handleSearchBarDown">
        <div class="i-tabler:chevron-down" />
      </div>
      <div class="cursor-pointer rounded-1 p-1 hover:bg-bg-hover" @click="onCloseSearchBar">
        <div class="i-tabler:x" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">

</style>
