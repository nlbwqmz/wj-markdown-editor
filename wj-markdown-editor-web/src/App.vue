<script setup>
import SearchBar from '@/components/SearchBar.vue'
import router from '@/router/index.js'

import { useCommonStore } from '@/stores/counter.js'
import constant from '@/util/constant.js'
import shortcutKeyUtil from '@/util/shortcutKeyUtil.js'
import { px2remTransformer } from 'ant-design-vue'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const defaultFontFamily = {
  editArea: `source-code-pro,Menlo,Monaco,Consolas,'Courier New',monospace`,
  otherArea: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'`,
  previewArea: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'`,
  codeArea: `Menlo, Monaco, Consolas, 'Courier New', monospace`,
}

const { locale } = useI18n()
const store = useCommonStore()
const searchBarVisible = computed(() => store.searchBarVisible)
// 设置ant-design-vue 的 rem 配置
const px2rem = px2remTransformer({
  rootValue: 16,
})

watch(() => store.config.theme.global, (newValue) => {
  document.documentElement.setAttribute('theme', newValue)
}, { immediate: true })

watch(() => store.config.fontSize, (newValue) => {
  document.documentElement.style.fontSize = `${newValue}px`
}, { immediate: true })

watch(() => store.config.language, (newValue) => {
  locale.value = newValue
}, { immediate: true })

watch(() => store.config.fontFamily.editArea, (newValue) => {
  document.body.style.setProperty('--edit-area-font', newValue ? `'${newValue}', ${defaultFontFamily.editArea}` : defaultFontFamily.editArea)
}, { immediate: true })

watch(() => store.config.fontFamily.otherArea, (newValue) => {
  document.body.style.setProperty('--other-area-font', newValue ? `'${newValue}', ${defaultFontFamily.otherArea}` : defaultFontFamily.otherArea)
}, { immediate: true })

watch(() => store.config.fontFamily.previewArea, (newValue) => {
  document.body.style.setProperty('--preview-area-font', newValue ? `'${newValue}', ${defaultFontFamily.previewArea}` : defaultFontFamily.previewArea)
}, { immediate: true })

watch(() => store.config.fontFamily.codeArea, (newValue) => {
  document.body.style.setProperty('--code-area-font', newValue ? `'${newValue}', ${defaultFontFamily.codeArea}` : defaultFontFamily.codeArea)
}, { immediate: true })

function onKeydown(e) {
  if (constant.notAllowedSearchRouteNameList.includes(router.currentRoute.value.name)) {
    return
  }
  // esc 关闭搜索框
  if (e.key === 'Escape') {
    if (store.editorSearchBarVisible === true) {
      store.editorSearchBarVisible = false
    }
    if (store.searchBarVisible === true) {
      store.searchBarVisible = false
    }
  } else if (shortcutKeyUtil.isShortcutKey(e)) {
    const shortcutKey = shortcutKeyUtil.getShortcutKey(e)
    if (shortcutKey === 'Ctrl+f') { // 搜索在编辑器和web都有需特殊处理
      if (store.editorSearchBarVisible === true) {
        store.editorSearchBarVisible = false
      }
      store.searchBarVisible = !store.searchBarVisible
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  setTimeout(() => {
    const startupLoading = document.getElementById('startup-loading')
    if (startupLoading) {
      startupLoading.children[0].addEventListener(
        'animationend',
        () => {
          startupLoading.remove()
        },
        { once: true },
      )
      startupLoading.children[0].style.animation = 'startup-load-leave 0.8s linear forwards'
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <a-style-provider :transformers="[px2rem]">
    <a-config-provider :theme="{ token: { fontFamily: 'var(--other-area-font)' } }">
      <router-view />
      <SearchBar v-if="searchBarVisible" />
    </a-config-provider>
  </a-style-provider>
</template>

<style scoped>
</style>
