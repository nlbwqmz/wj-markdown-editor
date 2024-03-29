<template>
  <div class="search-bar">
    <div class="title horizontal-vertical-center electron-drag">
      搜索
    </div>
    <input v-model="searchContent" ref="inputRef"/>
    <div class="horizontal-vertical-center result">{{result.activeMatchOrdinal}}/{{result.matches}}</div>
    <div class="action horizontal-vertical-center">
      <div class="icon" @click="handleSearchBarUp">
        <UpOutlined :style="result.matches < 1 ? { color: 'rgba(0, 0, 0, 0.05)' } : {}"/>
      </div>
      <div class="icon" @click="handleSearchBarDown">
        <DownOutlined :style="result.matches < 1 ? { color: 'rgba(0, 0, 0, 0.05)' } : {}"/>
      </div>
      <div class="icon" @click="nodeRequestUtil.toggleSearchBar">
        <CloseOutlined />
      </div>
    </div>
  </div>
</template>

<script setup>
import { UpOutlined, DownOutlined, CloseOutlined } from '@ant-design/icons-vue'
import { onMounted, ref, watch } from 'vue'
import nodeRegisterUtil from '@/util/nodeRegisterUtil'
import nodeRequestUtil from '@/util/nodeRequestUtil'
const searchContent = ref()
const inputRef = ref()
const result = ref({
  activeMatchOrdinal: 0,
  matches: 0
})
onMounted(() => {
  inputRef.value?.focus()
})
watch(() => searchContent.value, (newValue, oldValue) => {
  if (newValue) {
    nodeRequestUtil.findInPage(newValue)
  } else {
    nodeRequestUtil.stopFindInPage()
    result.value.activeMatchOrdinal = 0
    result.value.matches = 0
  }
})

const handleSearchBarUp = () => {
  if (result.value.matches > 0) {
    nodeRequestUtil.findInPageNext(searchContent.value, false)
  }
}
const handleSearchBarDown = () => {
  if (result.value.matches > 0) {
    nodeRequestUtil.findInPageNext(searchContent.value, true)
  }
}
const findInPageResult = value => {
  result.value = value
}
nodeRegisterUtil.findInPageResult(findInPageResult)
</script>

<style scoped lang="less">
.search-bar {
  width: 100%;
  background-color: white;
  display: flex;
  height: 100%;
  justify-content: space-around;
  padding: 10px;
  .title {
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
