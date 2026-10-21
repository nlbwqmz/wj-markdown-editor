<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCommonStore } from '@/stores/counter.js'
import {
  requestDocumentActivateTab,
  requestDocumentCloseTab,
} from '@/util/document-session/rendererDocumentCommandUtil.js'

/**
 * 文档标签栏。
 *
 * 标签栏只是文档会话的视图外壳：
 * 1. 标签项只承载展示信息，正文永远从活动会话的完整快照里取
 * 2. 关闭、切换、重排一律发命令给主进程，渲染层不做脏判断、不自己改顺序
 * 3. 标签顺序就是主进程返回的数组顺序，渲染层不排序
 *
 * 布局是纯 flex 流，全程不使用 position：
 * - 标签内部：[脏点槽 6px] 文件名 [关闭槽 14px]，两个槽宽度恒定，
 *   干净标签只是不渲染圆点，槽位仍然占位，所以所有标签的文字起点完全一致
 * - 标签之间：独立的 `.document-tab-separator` 元素（1×16px，两侧各 4px），
 *   由 v-for 生成，数量恒为「标签数 − 1」，不用 border 也不用伪元素
 *
 * 尺寸基准（与现有界面严格对齐）：
 * - 标签栏 32px = 侧边栏 tab 区（p-1 + h-6）；含 1px 顶边框后两者都是 33px
 * - 标签 24px = 侧边栏 tab 按钮 / 工具栏 IconButton 的 h-6
 * - 分隔线 16px = 标题栏那条竖分隔线（LayoutTop 的 h-4 w-px）
 *
 * 状态规则：
 * - 脏点只要有就一直显示，没有任何 hover 规则去隐藏它
 * - 关闭按钮只在 hover 时显示；槽位恒定，显隐不产生任何位移
 *
 * 标签栏自己不画底边框：下方区域在两种视图模式下都已经有一条同位置的顶边框
 * （源码/分栏是 EditorToolbar 的 border-t，纯预览是布局元素的 b-t），
 * 两边都画会出现双线。顶部边框则是必须的：标题栏与标签栏同为 bg-primary，
 * 没有分隔线时两者会连成一片；侧边栏顶部也有同一条边框，两者因此对齐。
 */
const store = useCommonStore()
const { t } = useI18n()

const tabs = computed(() => store.documentSessionSnapshot?.tabs || [])
const activeSessionId = computed(() => store.documentSessionSnapshot?.activeSessionId ?? null)

function getTabLabel(tab) {
  if (!tab) {
    return t('documentTab.untitled')
  }
  return tab.fileName === 'Unnamed' ? t('documentTab.untitled') : tab.fileName
}

function isActiveTab(tab) {
  return Boolean(tab) && tab.sessionId === activeSessionId.value
}

/**
 * 标签的视觉状态类。
 *
 * 激活态用实心胶囊，未激活只靠文字色区分；脏标签额外提亮文字色，
 * 保证「脏」在任何状态下都能被看见，而不是只在 hover 时才出现。
 */
function getTabClassList(tab) {
  const active = isActiveTab(tab)
  return {
    'bg-bg-hover': active,
    'color-text-primary': active || tab?.dirty === true,
    'font-medium': active,
    'color-text-secondary': !active && tab?.dirty !== true,
    'hover:bg-bg-hover': !active,
  }
}

function activateTab(tab) {
  if (!tab?.sessionId || isActiveTab(tab)) {
    return
  }
  requestDocumentActivateTab(tab.sessionId).then(() => {}).catch(() => {})
}

function closeTab(tab) {
  if (!tab?.sessionId) {
    return
  }
  requestDocumentCloseTab(tab.sessionId).then(() => {}).catch(() => {})
}

/**
 * 批量关闭只处理没有未保存内容的标签。
 *
 * 有未保存内容的标签如果被批量关掉，会连续弹多次确认框，
 * 用户无法判断自己到底在确认哪一个；所以这类标签一律保留，让用户单独处理。
 */
function closeTabList(tabList) {
  tabList
    .filter(tab => tab && tab.sessionId && tab.dirty !== true)
    .forEach((tab) => {
      requestDocumentCloseTab(tab.sessionId).then(() => {}).catch(() => {})
    })
}

function closeOtherTabs(tab) {
  closeTabList(tabs.value.filter(item => item.sessionId !== tab.sessionId))
}

function closeTabsToRight(tab) {
  const targetIndex = tabs.value.findIndex(item => item.sessionId === tab.sessionId)
  if (targetIndex < 0) {
    return
  }
  closeTabList(tabs.value.slice(targetIndex + 1))
}

function copyTabPath(tab) {
  const targetPath = tab?.displayPath || ''
  if (!targetPath) {
    return
  }
  navigator.clipboard?.writeText?.(targetPath).catch(() => {})
}

function getMenuItems(tab) {
  return [
    {
      key: 'close',
      label: t('documentTab.close'),
    },
    {
      key: 'close-others',
      label: t('documentTab.closeOthers'),
    },
    {
      key: 'close-right',
      label: t('documentTab.closeToRight'),
    },
    {
      key: 'copy-path',
      label: t('documentTab.copyPath'),
      disabled: !tab?.displayPath,
    },
  ]
}

function onMenuClick({ key }, tab) {
  if (key === 'close') {
    closeTab(tab)
    return
  }
  if (key === 'close-others') {
    closeOtherTabs(tab)
    return
  }
  if (key === 'close-right') {
    closeTabsToRight(tab)
    return
  }
  if (key === 'copy-path') {
    copyTabPath(tab)
  }
}
</script>

<template>
  <div
    v-if="tabs.length > 0"
    data-testid="document-tab-bar"
    class="document-tab-bar flex shrink-0 items-center overflow-x-auto overflow-y-hidden border-t-1 border-t-border-primary border-t-solid bg-bg-primary px-2 py-1"
  >
    <template v-for="(tab, index) in tabs" :key="tab.sessionId">
      <!-- 独立分隔元素：真实 DOM 节点，数量恒为「标签数 − 1」 -->
      <span
        v-if="index > 0"
        aria-hidden="true"
        data-testid="document-tab-separator"
        class="document-tab-separator mx-1 h-4 w-px shrink-0 self-center bg-border-primary"
      />

      <a-dropdown
        :trigger="['contextmenu']"
        :menu="{ items: getMenuItems(tab), onClick: info => onMenuClick(info, tab) }"
      >
        <div
          :data-testid="`document-tab-${tab.sessionId}`"
          :data-active="isActiveTab(tab) ? 'true' : 'false'"
          :data-dirty="tab.dirty ? 'true' : 'false'"
          class="document-tab group h-6 max-w-50 min-w-0 flex shrink-0 cursor-pointer select-none items-center gap-1 rounded px-1.5 text-sm transition-colors"
          :class="getTabClassList(tab)"
          @click="activateTab(tab)"
          @auxclick.self.prevent="closeTab(tab)"
        >
          <!-- 脏点槽：与关闭槽等宽 14px，圆点在槽内居中；干净标签只是不渲染圆点，槽位仍然占位 -->
          <span class="document-tab__dot-slot size-3.5 flex shrink-0 items-center justify-center">
            <span
              v-if="tab.dirty"
              data-testid="document-tab-dirty-dot"
              class="document-tab__dot h-1.5 w-1.5 rounded-full bg-text-secondary"
            />
          </span>
          <span class="document-tab__label min-w-0 flex-1 truncate">{{ getTabLabel(tab) }}</span>
          <button
            type="button"
            :aria-label="t('documentTab.close')"
            data-testid="document-tab-close"
            class="document-tab__close size-3.5 flex shrink-0 cursor-pointer items-center justify-center border-0 rounded bg-transparent p-0 color-text-secondary opacity-0 transition-opacity hover:bg-bg-primary hover:color-text-primary group-hover:opacity-100"
            @click.stop="closeTab(tab)"
          >
            <span class="i-tabler:x text-xs" />
          </button>
        </div>
      </a-dropdown>
    </template>
  </div>
</template>

<style scoped lang="scss">
.document-tab-bar {
  scrollbar-width: thin;
}
</style>
