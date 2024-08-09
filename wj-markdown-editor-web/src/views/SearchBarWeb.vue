<template>
  <div
    class="search-bar-container"
    v-show="props.modelValue"
  >
    <div class="search-bar">
      <div class="title horizontal-vertical-center">
        搜索
      </div>
      <input
        v-model="searchContent"
        ref="inputRef"
      />
      <div class="horizontal-vertical-center result">
        {{ result.activeMatchOrdinal }}/{{ result.matches }}
      </div>
      <div class="action horizontal-vertical-center">
        <div
          class="icon"
          @click="handleSearchBarUp"
        >
          <UpOutlined :style="result.matches < 1 ? { color: 'rgba(0, 0, 0, 0.05)' } : {}" />
        </div>
        <div
          class="icon"
          @click="handleSearchBarDown"
        >
          <DownOutlined :style="result.matches < 1 ? { color: 'rgba(0, 0, 0, 0.05)' } : {}" />
        </div>
        <div
          class="icon"
          @click="closeSearchBar"
        >
          <CloseOutlined />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { UpOutlined, DownOutlined, CloseOutlined } from '@ant-design/icons-vue'
import { nextTick, ref, watch } from 'vue'
import router from '@/router'
import Mark from 'mark.js'
const props = defineProps({
  modelValue: { type: Boolean, default: () => false }
})

const emits = defineEmits(['update:modelValue'])

// 取消搜索高亮并关闭搜索条
const closeSearchBar = () => {
  if (markInstance) {
    markInstance.unmark()
  }
  emits('update:modelValue', false)
}
const searchContent = ref()
const inputRef = ref()
const result = ref({
  // 当前激活序号（index + 1）
  activeMatchOrdinal: 0,
  // 总共匹配到的数量
  matches: 0
})

// 因是跨标签匹配，所以每一项为一个下标数组
const markIndexGroup = ref([])
let markInstance = null
const init = () => {
  searchContent.value = ''
  result.value = { matches: 0, activeMatchOrdinal: 0 }
  markInstance = null
}

const getMarkInstance = () => {
  if (!markInstance) {
    markInstance = new Mark('.preview-container')
  }
  return markInstance
}

watch(() => props.modelValue, (newValue, oldValue) => {
  if (newValue === true) {
    init()
    nextTick(() => {
      inputRef.value.focus()
    })
  } else {
    if (markInstance) {
      markInstance.unmark()
    }
  }
})
watch(() => searchContent.value, (newValue, oldValue) => {
  if (newValue) {
    markIndexGroup.value = []
    const instance = getMarkInstance()
    // 取消之前的搜索
    instance.unmark()
    instance.mark(newValue, { element: 'div', className: 'search-mark', acrossElements: true, exclude: ['.float-button'] })
    nextTick(() => {
      const markList = document.querySelectorAll('.search-mark')
      const currentResult = { matches: 0, activeMatchOrdinal: 0 }
      let text = ''
      // 跨标签搜索，匹配项可能由好几个下标组成
      for (let i = 0; i < markList.length; i++) {
        const isNew = text === ''
        text = isNew ? markList.item(i).innerText : text + markList.item(i).innerText
        if (text === newValue) {
          currentResult.matches++
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
  } else {
    getMarkInstance().unmark()
    result.value = { matches: 0, activeMatchOrdinal: 0 }
  }
})

watch(() => router.currentRoute.value.fullPath, (newValue, oldValue) => {
  if (newValue !== oldValue) {
    closeSearchBar()
  }
})

const renderActiveMarkHighlight = () => {
  const highlightList = document.querySelectorAll('.search-mark-highlight')
  highlightList.forEach(node => {
    node.classList.remove('search-mark-highlight')
  })
  const markList = document.querySelectorAll('.search-mark')
  let executed = false
  markIndexGroup.value[result.value.activeMatchOrdinal - 1].forEach(index => {
    markList.item(index).classList.add('search-mark-highlight')
    if (executed === false) {
      markList.item(index).scrollIntoView({ behavior: 'smooth', block: 'start' })
      executed = true
    }
  })
}

const handleSearchBarUp = () => {
  if (result.value.matches > 0) {
    if (result.value.activeMatchOrdinal <= 1) {
      result.value.activeMatchOrdinal = markIndexGroup.value.length
    } else {
      result.value.activeMatchOrdinal--
    }
    renderActiveMarkHighlight()
  }
}
const handleSearchBarDown = () => {
  if (result.value.matches > 0) {
    if (result.value.activeMatchOrdinal === markIndexGroup.value.length) {
      result.value.activeMatchOrdinal = 1
    } else {
      result.value.activeMatchOrdinal++
    }
    renderActiveMarkHighlight()
  }
}
</script>

<style scoped lang="less">
.search-bar-container {
  background-color: white;
  width: 350px;
  height: 60px;
  box-shadow: rgba(0, 0, 0, 0.35) 0 5px 15px;
  position: fixed;
  top: 70px;
  right: 70px;
  border-radius: 10px;
  border: 1px rgba(0, 0, 0, 0.3) solid;
  z-index: 100;
}
.search-bar {
  width: 100%;
  display: flex;
  height: 100%;
  justify-content: space-around;
  padding: 10px;
  .title {
    -webkit-user-select: none;
    width: 80px;
    color: rgba(0, 0, 0, 0.3);
  }
  .result {
    height: 100%;
    width: 80px;
    line-height: 22px; margin: 0 10px;
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 10px;
    user-select:none;
  }
  input {
    height: 100%;
    border: none;
    outline: none;
    width: 120px;
    border-bottom: var(--wj-inner-border);
  }
  .action {
    height: 100%;
    padding-left: 10px;
    border-left: 1px rgba(0, 0, 0, 0.25) solid;
    width: 80px;
    display: flex;
    justify-content: space-between;
  }
  .icon {
    border-radius: 5px;
    padding: 2px;
  }
  .icon:hover {
    background-color: var(--wj-hover-color);
  }
}
</style>
