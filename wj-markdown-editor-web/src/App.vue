<script setup>
import { px2remTransformer } from 'ant-design-vue'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'

import { useI18n } from 'vue-i18n'
import SearchBar from '@/components/SearchBar.vue'
import StartupSkippedTabsModal from '@/components/StartupSkippedTabsModal.vue'
import router from '@/router/index.js'
import { useCommonStore } from '@/stores/counter.js'
import constant from '@/util/constant.js'
import { resolveLanguagePreference } from '@/util/languagePreferenceUtil.js'
import { previewSearchBarController } from '@/util/searchBarController.js'
import shortcutKeyUtil from '@/util/shortcutKeyUtil.js'
import { STARTUP_LOADING_DISMISSED_EVENT, STARTUP_LOADING_READY_EVENT } from '@/util/startupLoadingUtil.js'

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
  locale.value = resolveLanguagePreference(newValue, navigator.language)
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
      previewSearchBarController.close(store)
    }
  } else if (shortcutKeyUtil.isShortcutKey(e)) {
    const shortcutKey = shortcutKeyUtil.getShortcutKey(e)
    if (shortcutKey === 'Ctrl+f') { // 搜索在编辑器和web都有需特殊处理
      if (store.editorSearchBarVisible === true) {
        store.editorSearchBarVisible = false
      }
      if (store.searchBarVisible === true) {
        previewSearchBarController.close(store)
      } else if (router.currentRoute.value.name !== 'editor' || store.viewMode !== 'source') {
        // 编辑页的源码态没有预览区，此时不该打开一个空的预览搜索条。
        store.searchBarVisible = true
      }
    }
  }
}

// 已处理标志，避免就绪事件与兜底定时器重复触发移除
let startupLoadingDismissed = false

// 首屏内容可看后立即移除启动遮罩。
// 就绪信号已在 nextTick + requestAnimationFrame 之后派发，此时内容已完成布局，
// 直接移除不会露出空白；不再做淡出动画，避免让用户多等 250ms。
function dismissStartupLoading() {
  if (startupLoadingDismissed) {
    return
  }
  startupLoadingDismissed = true
  document.getElementById('startup-loading')?.remove()
  // 遮罩真正移除后再广播：启动期需要“等遮罩消失再出现”的 UI 以此为准。
  window.dispatchEvent(new CustomEvent(STARTUP_LOADING_DISMISSED_EVENT))
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener(STARTUP_LOADING_READY_EVENT, dismissStartupLoading, { once: true })
  // 兜底：页面异常导致始终没有就绪信号时，15 秒后强制移除遮罩
  setTimeout(dismissStartupLoading, 15 * 1000)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener(STARTUP_LOADING_READY_EVENT, dismissStartupLoading)
})
</script>

<template>
  <a-style-provider :transformers="[px2rem]">
    <a-config-provider :theme="{ token: { fontFamily: 'var(--other-area-font)' } }">
      <router-view />
      <SearchBar v-if="searchBarVisible" />
      <StartupSkippedTabsModal />
    </a-config-provider>
  </a-style-provider>
</template>

<style scoped>
</style>
