<script setup>
import { message } from 'ant-design-vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCommonStore } from '@/stores/counter.js'
import {
  requestDocumentActivateTab,
  requestDocumentCloseTab,
  requestDocumentCloseTabs,
  requestDocumentRevealInFolder,
} from '@/util/document-session/rendererDocumentCommandUtil.js'
import { bindHorizontalWheelScroll } from '@/util/horizontalWheelScrollUtil.js'
import { resolveTabScrollLeftToReveal } from '@/util/overlayScrollbarMathUtil.js'
import { copyTextWithFeedback } from '@/util/previewInlineCodeCopyUtil.js'
import { useOverlayScrollbar } from '@/util/useOverlayScrollbar.js'

/**
 * 文档标签栏。
 *
 * 标签栏只是文档会话的视图外壳：
 * 1. 标签项只承载展示信息，正文永远从活动会话的完整快照里取
 * 2. 关闭、切换、重排一律发命令给主进程，渲染层不做脏判断、不自己改顺序
 * 3. 标签顺序就是主进程返回的数组顺序，渲染层不排序
 *
 * 布局是纯 flex 流，全程不使用 position：
 * - 标签内部：[脏点槽 14px] 文件名 [关闭槽 14px]，两个槽宽度恒定，
 *   干净标签只是不渲染圆点，槽位仍然占位，所以所有标签的文字起点完全一致
 * - 标签内部间距：内边距与 gap 统一为 4px，四段间距完全对称
 *   （4 | 脏点槽 | 4 | 文件名 | 4 | 关闭槽 | 4）
 * - 标签之间：独立的 `.document-tab-separator` 元素（1×16px，两侧各 4px），
 *   由 v-for 生成，数量恒为「标签数 − 1」，不用 border 也不用伪元素
 *
 * 尺寸基准（与现有界面严格对齐）：
 * - 标签栏 32px = 侧边栏 tab 区（p-1 + h-6）；含 1px 顶边框后两者都是 33px
 * - 标签 24px = 侧边栏 tab 按钮 / 工具栏 IconButton 的 h-6
 * - 标签最大宽 240px（max-w-60）：内边距与 gap 统一 4px，固定开销共 44px，
 *   文件名可用 196px；短文件名标签更窄，只有长文件名才会顶到这个上限
 * - 分隔线 16px = 标题栏那条竖分隔线（LayoutTop 的 h-4 w-px）
 *
 * 横向滚动：
 * - 原生滚动条在 Chromium 里始终占位，做不到“浮在内容上方”，所以彻底隐藏，
 *   改由自绘 overlay 滑块（`useOverlayScrollbar`）承担视觉反馈
 * - 滑块是唯一使用绝对定位的元素：纯装饰、不参与布局，标签内部结构仍是纯 flex 流
 * - 滑块只在宽度不够且鼠标在标签栏内时出现，没有滚动轨道
 * - 垂直滚轮转横向滚动由 `bindHorizontalWheelScroll()` 接管，判定规则见该工具
 *
 * 自动滚动（`revealActiveTab`）：
 * - 判定标准是“能不能看全”，不是“能不能看见”：部分可见也要补齐
 * - 例外：用户自己在标签栏里点的标签不补位移，因为他对位置本来就是知情的
 * - 首次（启动恢复标签组）无动画，之后平滑滚动
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

const scrollerRef = ref(null)
const thumbRef = ref(null)

// 记录用户刚在标签栏里点过的 session：这种激活是用户主动发起的，
// 标签位置对他来说是已知的，不需要再补位移。
let localActivationSessionId = null
// 首次补位移（启动恢复标签组）必须无动画，否则标签栏会在启动时自己滑一段。
let hasRevealedOnce = false

const {
  thumbVisible,
  thumbActive,
  thumbStyle,
  refresh: refreshOverlayScrollbar,
  onPointerEnter: handleTabBarPointerEnter,
  onPointerLeave: handleTabBarPointerLeave,
  onThumbPointerDown: handleThumbPointerDown,
} = useOverlayScrollbar({ scrollerRef, thumbRef })

// 垂直滚轮转横向滚动：绑在真实滚动容器上，overlay 滑块不改变任何滚动语义。
// 滚动容器可能晚于挂载才出现，所以监听 ref 而不是在 onMounted 里绑一次。
watch(scrollerRef, (element, _previousElement, onCleanup) => {
  if (!element) {
    return
  }
  onCleanup(bindHorizontalWheelScroll(element))
})

// 标签增删会改变 scrollWidth，而 ResizeObserver 只观察 border-box、感知不到，需要显式重测。
watch(tabs, () => refreshOverlayScrollbar(), { flush: 'post' })

/**
 * 把活动标签完整滚进可视区。
 *
 * 只有“完整可见”才不动；部分可见也要补齐，因为用户需要看清文件名。
 * 不用 `scrollIntoView()`：它会滚动所有可滚动祖先，可能带着整个页面一起跳。
 */
function revealActiveTab(sessionId, { smooth = true } = {}) {
  const scroller = scrollerRef.value
  if (!scroller) {
    return
  }

  const tabElement = scroller.querySelector(`[data-session-id="${sessionId}"]`)
  if (!tabElement) {
    return
  }

  const targetLeft = resolveTabScrollLeftToReveal({
    tabLeft: tabElement.offsetLeft,
    tabWidth: tabElement.offsetWidth,
    scrollLeft: scroller.scrollLeft,
    clientWidth: scroller.clientWidth,
  })
  // null 表示已经完整可见，不做任何滚动
  if (targetLeft === null) {
    return
  }

  scroller.scrollTo({ left: targetLeft, behavior: smooth ? 'smooth' : 'auto' })
}

watch(activeSessionId, async (sessionId) => {
  const isLocalActivation = sessionId === localActivationSessionId
  localActivationSessionId = null

  // 用户自己在标签栏点的标签不补位移；没有活动标签时也无需处理
  if (!sessionId || isLocalActivation) {
    return
  }

  // 新标签可能刚插入，等 DOM 就位再测量
  await nextTick()
  revealActiveTab(sessionId, { smooth: hasRevealedOnce })
  hasRevealedOnce = true
}, { flush: 'post' })

// 启动恢复标签组时 activeSessionId 在挂载前就已存在，watch 不会触发，
// 这里补一次无动画的定位；若标签栏尚未渲染（无标签）则什么都不做。
onMounted(() => {
  if (!activeSessionId.value) {
    return
  }
  revealActiveTab(activeSessionId.value, { smooth: false })
  hasRevealedOnce = true
})

// 标签标题直接用会话文件名。
// 未命名草稿在数据层就是固定的 `Untitled` 哨兵值，
// 展示层不再做国际化，保证所有语言下看到同一个标识。
const UNTITLED_FILE_NAME = 'Untitled'

function getTabLabel(tab) {
  return tab?.fileName || UNTITLED_FILE_NAME
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
  // 用户自己点的标签不需要事后补位移，记下本次激活目标供 watch 消费
  localActivationSessionId = tab.sessionId
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
 *
 * 必须一次请求发给主进程，不能 forEach 逐个发：
 * 逐个关闭时主进程每个命令都会先激活目标、再推一次快照，
 * 渲染层会看到活动标签一路跳过去（标签循环切换）。
 */
function closeTabList(tabList) {
  const sessionIds = tabList
    .filter(tab => tab && tab.sessionId && tab.dirty !== true)
    .map(tab => tab.sessionId)
  if (sessionIds.length === 0) {
    return
  }
  requestDocumentCloseTabs(sessionIds).then(() => {}).catch(() => {})
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

function closeTabsToLeft(tab) {
  const targetIndex = tabs.value.findIndex(item => item.sessionId === tab.sessionId)
  if (targetIndex < 0) {
    return
  }
  closeTabList(tabs.value.slice(0, targetIndex))
}

function copyTextToClipboard(text) {
  if (!text) {
    return
  }
  copyTextWithFeedback({
    text,
    writeText: async value => await navigator.clipboard.writeText(value),
    onEmpty() {
      message.warning(t('message.noCopyableContent'))
    },
    onSuccess() {
      message.success(t('message.copySucceeded'))
    },
    onError() {
      message.error(t('message.copyFailed'))
    },
  })
}

function copyTabFileName(tab) {
  copyTextToClipboard(tab?.fileName || '')
}

function copyTabPath(tab) {
  copyTextToClipboard(tab?.displayPath || '')
}

function revealTabInExplorer(tab) {
  const targetPath = tab?.displayPath || ''
  if (!targetPath) {
    return
  }
  requestDocumentRevealInFolder(targetPath)
    .then((result) => {
      if (result?.ok === true) {
        return
      }
      if (result?.reason === 'not-found') {
        message.warning(t('message.fileNotFound'))
      }
    })
    .catch(() => {})
}

function getMenuItems(tab) {
  const hasPath = Boolean(tab?.displayPath)
  const tabIndex = tabs.value.findIndex(item => item.sessionId === tab?.sessionId)

  // 批量关闭只会跳过脏标签（脏标签要逐个确认，不能批量弹窗），
  // 所以禁用态看的是“位置上还有没有可批量关闭的干净标签”：
  // 右侧只剩脏标签时，关闭右侧其实什么也不会发生，菜单必须置灰。
  const isBatchClosable = item => Boolean(item?.sessionId) && item.dirty !== true
  const leftTabs = tabIndex > 0 ? tabs.value.slice(0, tabIndex) : []
  const rightTabs = tabIndex >= 0 ? tabs.value.slice(tabIndex + 1) : []
  const otherTabs = tabs.value.filter(item => item.sessionId !== tab?.sessionId)

  const hasClosableOthers = otherTabs.some(isBatchClosable)
  const hasClosableLeft = leftTabs.some(isBatchClosable)
  const hasClosableRight = rightTabs.some(isBatchClosable)

  return [
    {
      key: 'close',
      label: t('documentTab.close'),
    },
    // 关闭类动作一组：它们都只影响标签存在性
    {
      key: 'close-others',
      label: t('documentTab.closeOthers'),
      disabled: !hasClosableOthers,
    },
    {
      key: 'close-left',
      label: t('documentTab.closeToLeft'),
      disabled: !hasClosableLeft,
    },
    {
      key: 'close-right',
      label: t('documentTab.closeToRight'),
      disabled: !hasClosableRight,
    },
    // 分隔线把“关闭”与“文件操作”分开
    {
      type: 'divider',
    },
    {
      key: 'copy-file-name',
      label: t('documentTab.copyFileName'),
    },
    {
      key: 'copy-path',
      label: t('documentTab.copyPath'),
      disabled: !hasPath,
    },
    {
      key: 'reveal-in-explorer',
      label: t('documentTab.revealInExplorer'),
      disabled: !hasPath,
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
  if (key === 'close-left') {
    closeTabsToLeft(tab)
    return
  }
  if (key === 'close-right') {
    closeTabsToRight(tab)
    return
  }
  if (key === 'copy-file-name') {
    copyTabFileName(tab)
    return
  }
  if (key === 'copy-path') {
    copyTabPath(tab)
    return
  }
  if (key === 'reveal-in-explorer') {
    revealTabInExplorer(tab)
  }
}
</script>

<template>
  <div
    v-if="tabs.length > 0"
    data-testid="document-tab-bar"
    class="document-tab-bar relative flex shrink-0 items-center border-t-1 border-t-border-primary border-t-solid bg-bg-primary"
    @mouseenter="handleTabBarPointerEnter"
    @mouseleave="handleTabBarPointerLeave"
  >
    <div
      ref="scrollerRef"
      data-testid="document-tab-scroller"
      class="document-tab-bar__scroller min-w-0 flex flex-1 items-center overflow-x-auto overflow-y-hidden px-2 py-1"
    >
      <template v-for="(tab, index) in tabs" :key="tab.sessionId">
        <!-- 独立分隔元素：真实 DOM 节点，数量恒为「标签数 − 1」 -->
        <span
          v-if="index > 0"
          aria-hidden="true"
          data-testid="document-tab-separator"
          class="document-tab-separator mx-1 h-4 w-px shrink-0 self-center bg-border-primary"
        />

        <a-dropdown :trigger="['contextmenu']" placement="bottomLeft">
          <div
            :data-testid="`document-tab-${tab.sessionId}`"
            :data-session-id="tab.sessionId"
            :data-active="isActiveTab(tab) ? 'true' : 'false'"
            :data-dirty="tab.dirty ? 'true' : 'false'"
            class="document-tab group h-6 max-w-60 min-w-0 flex shrink-0 cursor-pointer select-none items-center gap-1 rounded px-1 text-sm transition-colors"
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
          <!--
            菜单必须走 overlay 插槽。ant-design-vue 4.x 的 Dropdown 虽然声明了 `menu` prop，
            但 renderOverlay() 只读 props.overlay 与 slots.overlay，传 menu 会静默失效（右键弹不出任何东西）。
          -->
          <template #overlay>
            <a-menu :items="getMenuItems(tab)" @click="info => onMenuClick(info, tab)" />
          </template>
        </a-dropdown>
      </template>
    </div>

    <!-- 唯一使用绝对定位的元素：装饰性 overlay 滑块，不参与布局 -->
    <div
      v-show="thumbVisible"
      ref="thumbRef"
      data-testid="document-tab-scrollbar-thumb"
      class="document-tab-bar__thumb absolute bottom-0.5 h-1 cursor-pointer rounded-full transition-opacity duration-150"
      :class="thumbActive ? 'opacity-100' : 'opacity-0'"
      :style="thumbStyle"
      @pointerdown="handleThumbPointerDown"
    />
  </div>
</template>

<style scoped lang="scss">
.document-tab-bar__scroller {
  /*
   * 原生滚动条在 Chromium 里始终占位，做不到“浮在内容上方”，
   * 所以彻底隐藏，改由 overlay 滑块承担视觉反馈。
   * `scrollbar-width` 在新版 Chromium 里会同时让 `::-webkit-scrollbar` 失效，
   * 两者都写以覆盖旧内核。
   */
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.document-tab-bar__thumb {
  /* 与统一滚动条共用同一套颜色变量，避免自绘滑块另起一套配色 */
  background-color: var(--wj-scrollbar-thumb-bg);

  &:hover {
    background-color: var(--wj-scrollbar-thumb-bg-hover);
  }

  &:active {
    background-color: var(--wj-scrollbar-thumb-bg-active);
  }
}
</style>
