<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ExternalFileChangeModal from '@/components/ExternalFileChangeModal.vue'
import FileManagerPanel from '@/components/layout/FileManagerPanel.vue'
import {
  createHomeViewFilePanelLayoutController,
  FILE_MANAGER_PANEL_DEFAULT_WIDTH,
  resolveHomeViewFilePanelGridTemplateColumns,
} from '@/components/layout/homeViewFilePanelLayoutUtil.js'
import LayoutContainer from '@/components/layout/LayoutContainer.vue'
import LayoutMenu from '@/components/layout/LayoutMenu.vue'
import LayoutTop from '@/components/layout/LayoutTop.vue'
import { useCommonStore } from '@/stores/counter.js'
import shortcutKeyUtil from '@/util/shortcutKeyUtil.js'

const functionShortcutKeyPattern = /^F(?:[1-9]|1[0-2])$/
const store = useCommonStore()
const route = useRoute()
const fileManagerHostRef = ref()
const fileManagerGutterRef = ref()
const fileManagerPanelWidth = ref(FILE_MANAGER_PANEL_DEFAULT_WIDTH)
const shouldShowFileManagerShell = computed(() => ['editor', 'preview'].includes(String(route.name ?? '')))
const shouldEnableFileManagerSplit = computed(() => shouldShowFileManagerShell.value && Boolean(store.fileManagerPanelVisible))
const homeViewFileManagerHostStyle = computed(() => {
  if (shouldShowFileManagerShell.value === false) {
    return undefined
  }

  if (store.fileManagerPanelVisible) {
    return {
      gridTemplateColumns: resolveHomeViewFilePanelGridTemplateColumns(fileManagerPanelWidth.value),
    }
  }

  return {
    gridTemplateColumns: '24px 1fr',
  }
})
const homeViewFilePanelLayoutController = createHomeViewFilePanelLayoutController({
  hostRef: fileManagerHostRef,
  gutterRef: fileManagerGutterRef,
  panelWidthRef: fileManagerPanelWidth,
  nextTick,
})

function findShortcutKeyId(keymap) {
  const shortcutKeyList = store.config.shortcutKeyList
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
    // 裸 F1-F12 需要先拦截宿主默认行为，避免触发浏览器刷新等内建动作。
    if (functionShortcutKeyPattern.test(shortcutKey)) {
      e.preventDefault()
    }
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
  homeViewFilePanelLayoutController.destroySplitLayout()
})

watch(shouldEnableFileManagerSplit, async (visible) => {
  await homeViewFilePanelLayoutController.rebuildSplitLayout(visible)
}, { immediate: true })
</script>

<template>
  <div class="h-full w-full flex flex-col overflow-hidden bg-bg-primary text-text-primary">
    <LayoutTop />
    <LayoutMenu />
    <div class="h-0 flex-1 overflow-hidden">
      <div
        v-if="shouldShowFileManagerShell"
        ref="fileManagerHostRef"
        data-testid="home-file-manager-host"
        class="grid h-full overflow-hidden"
        :style="homeViewFileManagerHostStyle"
      >
        <div
          v-if="store.fileManagerPanelVisible"
          data-testid="home-file-manager-panel-slot"
          class="h-full min-w-0 overflow-hidden b-r-1 b-r-border-primary b-r-solid"
        >
          <FileManagerPanel />
        </div>
        <div
          v-if="store.fileManagerPanelVisible"
          ref="fileManagerGutterRef"
          data-testid="home-file-manager-gutter"
          class="h-full cursor-col-resize bg-[#E2E2E2] op-0"
        />
        <button
          v-else
          type="button"
          data-testid="home-file-manager-reopen-handle"
          class="bg-bg-secondary h-full w-full flex items-center justify-center border-none px-0 color-text-secondary"
          @click="store.setFileManagerPanelVisible(true)"
        >
          <div class="i-tabler:chevron-right" />
        </button>
        <LayoutContainer />
      </div>
      <LayoutContainer v-else />
    </div>
    <ExternalFileChangeModal />
  </div>
</template>
