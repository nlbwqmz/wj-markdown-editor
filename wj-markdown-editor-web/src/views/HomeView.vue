<script setup>
import LayoutContainer from '@/components/layout/LayoutContainer.vue'
import LayoutMenu from '@/components/layout/LayoutMenu.vue'
import LayoutTop from '@/components/layout/LayoutTop.vue'
import { useCommonStore } from '@/stores/counter.js'
import shortcutKeyUtil from '@/util/shortcutKeyUtil.js'
import { onBeforeUnmount, onMounted } from 'vue'

function findShortcutKeyId(keymap) {
  const shortcutKeyList = useCommonStore().config.shortcutKeyList
  for (let i = 0; i < shortcutKeyList.length; i++) {
    const item = shortcutKeyList[i]
    if (item.keymap === keymap && item.enabled === true && item.type === 'web') {
      return item.id
    }
  }
  return null
}

function onKeydown(e) {
  if (shortcutKeyUtil.isShortcutKey(e)) {
    const shortcutKey = shortcutKeyUtil.getShortcutKey(e)
    const shortcutKeyId = findShortcutKeyId(shortcutKey)
    if (shortcutKeyId) {
      shortcutKeyUtil.getWebShortcutKeyHandler(shortcutKeyId, true)
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
  <div class="h-full w-full flex flex-col overflow-hidden bg-bg-primary text-text-primary">
    <LayoutTop />
    <LayoutMenu />
    <div class="h-0 flex-1 overflow-hidden">
      <LayoutContainer />
    </div>
  </div>
</template>
