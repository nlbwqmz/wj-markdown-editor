<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownMenu from '@/components/editor/MarkdownMenu.vue'
import FileManagerPanel from '@/components/layout/FileManagerPanel.vue'
import { useCommonStore } from '@/stores/counter.js'
import { parseOutlineFromMarkdown } from '@/util/editor/outlineParseUtil.js'

/**
 * 侧边栏容器：在「文件」与「大纲」两个面板之间切换。
 *
 * - 文件面板用 v-show 保留搜索词/滚动位置；大纲面板用 v-if，切走即卸载，
 *   避免隐藏状态下继续测量标题位置与重建索引；
 * - 大纲数据直接解析当前文档源文本，不依赖预览组件实例；
 * - 点击大纲后的编辑器跳转通过 store.outlineNavigateHandler 由当前激活页面处理。
 */

const { t } = useI18n()
const store = useCommonStore()

const SIDEBAR_TABS = [
  { key: 'files', labelKey: 'sidebar.tab.files' },
  { key: 'outline', labelKey: 'sidebar.tab.outline' },
]

const outlineList = computed(() => parseOutlineFromMarkdown(store.documentSessionSnapshot?.content ?? ''))

function resolveOutlineScrollContainer() {
  return store.outlineScrollContainer ?? null
}

function onAnchorNavigate(payload) {
  store.outlineNavigateHandler?.(payload)
}
</script>

<template>
  <div class="sidebar-panel h-full min-w-0 flex flex-col overflow-hidden bg-bg-primary text-text-primary">
    <div class="sidebar-panel__tabs flex items-center gap-1 border-b border-b-border-primary border-b-solid p-1">
      <button
        v-for="tab in SIDEBAR_TABS"
        :key="tab.key"
        type="button"
        class="sidebar-panel__tab h-6 min-w-0 flex flex-1 cursor-pointer items-center justify-center rounded border-none px-2 text-center text-sm transition-colors"
        :class="store.sidebarActiveTab === tab.key
          ? 'sidebar-panel__tab--active bg-bg-hover color-text-primary'
          : 'bg-transparent color-text-secondary hover:bg-[var(--wj-markdown-bg-secondary)]'"
        :data-testid="`sidebar-tab-${tab.key}`"
        :data-active="String(store.sidebarActiveTab === tab.key)"
        @click="store.setSidebarActiveTab(tab.key)"
      >
        {{ t(tab.labelKey) }}
      </button>
    </div>
    <div class="sidebar-panel__content relative min-h-0 flex-1 overflow-hidden">
      <div v-show="store.sidebarActiveTab === 'files'" class="absolute inset-0">
        <FileManagerPanel />
      </div>
      <div v-if="store.sidebarActiveTab === 'outline'" class="absolute inset-0">
        <MarkdownMenu
          :anchor-list="outlineList"
          :get-container="resolveOutlineScrollContainer"
          :active-line-number="store.outlineActiveLine"
          :show-header="false"
          @anchor-navigate="onAnchorNavigate"
        />
      </div>
    </div>
  </div>
</template>
