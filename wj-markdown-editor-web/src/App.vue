<script setup>
import SearchBar from '@/components/SearchBar.vue'
import router from '@/router/index.js'

import { useCommonStore } from '@/stores/counter.js'
import constant from '@/util/constant.js'
import shortcutKeyUtil from '@/util/shortcutKeyUtil.js'
import { px2remTransformer } from 'ant-design-vue'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'

const searchBarVisible = computed(() => useCommonStore().searchBarVisible)

// 设置ant-design-vue 的 rem 配置
const px2rem = px2remTransformer({
  rootValue: 16,
})

watch(() => useCommonStore().config.theme.global, (newValue) => {
  document.documentElement.setAttribute('theme', newValue)
}, { immediate: true })

watch(() => useCommonStore().config.fontSize, (newValue) => {
  document.documentElement.style.fontSize = `${newValue}px`
}, { immediate: true })

function onKeydown(e) {
  if (constant.notAllowedSearchRouteNameList.includes(router.currentRoute.value.name)) {
    return
  }
  // esc 关闭搜索框
  if (e.key === 'Escape') {
    if (useCommonStore().editorSearchBarVisible === true) {
      useCommonStore().editorSearchBarVisible = false
    }
    if (useCommonStore().searchBarVisible === true) {
      useCommonStore().searchBarVisible = false
    }
  } else if (shortcutKeyUtil.isShortcutKey(e)) {
    const shortcutKey = shortcutKeyUtil.getShortcutKey(e)
    if (shortcutKey === 'Ctrl+f') { // 搜索在编辑器和web都有需特殊处理
      if (useCommonStore().editorSearchBarVisible === true) {
        useCommonStore().editorSearchBarVisible = false
      }
      useCommonStore().searchBarVisible = !useCommonStore().searchBarVisible
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <a-style-provider :transformers="[px2rem]">
    <router-view />
    <SearchBar v-if="searchBarVisible" />
  </a-style-provider>
</template>

<style scoped>
</style>
