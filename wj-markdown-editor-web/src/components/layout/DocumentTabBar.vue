<script setup>
import { message, Modal } from 'ant-design-vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCommonStore } from '@/stores/counter.js'
import { requestCurrentWindowOpenPreparation } from '@/util/document-session/currentWindowOpenPreparationService.js'
import {
  requestDocumentActivateTab,
  requestDocumentCloseTab,
  requestDocumentCloseTabs,
  requestDocumentMoveTabToNewWindow,
  requestDocumentReorderTabs,
  requestDocumentRevealInFolder,
} from '@/util/document-session/rendererDocumentCommandUtil.js'
import { bindHorizontalWheelScroll } from '@/util/horizontalWheelScrollUtil.js'
import { resolveTabScrollLeftToReveal } from '@/util/overlayScrollbarMathUtil.js'
import { copyTextWithFeedback } from '@/util/previewInlineCodeCopyUtil.js'
import { useDocumentTabDrag } from '@/util/useDocumentTabDrag.js'
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
 * 拖拽重排：
 * - 交互全部在 `useDocumentTabDrag` 里，这里只负责把目标顺序交给主进程
 * - 拖拽过程不发任何 IPC，松手且顺序真的变了才发一次 `document.reorder-tabs`
 * - 标签顺序仍然是主进程返回的数组顺序，渲染层不自己排序
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

/**
 * “切换标签时”自动保存是否开启。
 *
 * 开关本身是全局配置（不做 per-window 开关，否则用户记不住哪个窗口是什么状态），
 * 但触发时只作用于当前窗口里被切走的那个文档。
 */
const isTabSwitchAutoSaveEnabled = computed(() => {
  const autoSaveList = store.config?.autoSave
  return Array.isArray(autoSaveList) && autoSaveList.includes('switch')
})

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

/**
 * 拖拽重排。
 *
 * `onCommit` 是唯一发 IPC 的地方：拖拽过程完全在渲染层完成，
 * 主进程只负责裁决顺序并广播新快照。
 * 顺序没变时 `useDocumentTabDrag` 不会调用它。
 */
const {
  isDragging,
  handlePointerDown: handleTabPointerDownRaw,
  shouldSuppressClick,
  notifyTabsChanged,
} = useDocumentTabDrag({
  scrollerRef,
  getSessionIds: () => tabs.value.map(tab => tab.sessionId),
  onCommit: nextSessionIds => requestDocumentReorderTabs(nextSessionIds),
  onError: () => message.error(t('documentTab.reorderFailed')),
})

// 垂直滚轮转横向滚动：绑在真实滚动容器上，overlay 滑块不改变任何滚动语义。
// 滚动容器可能晚于挂载才出现，所以监听 ref 而不是在 onMounted 里绑一次。
watch(scrollerRef, (element, _previousElement, onCleanup) => {
  if (!element) {
    return
  }
  onCleanup(bindHorizontalWheelScroll(element))
})

// 标签增删会改变 scrollWidth，而 ResizeObserver 只观察 border-box、感知不到，需要显式重测。
// 同时把最新顺序告诉拖拽层：提交后靠它确认“主进程已经换成目标顺序”，
// 拖拽中被外部改动则直接取消，避免渲染层和主进程各执一份顺序。
watch(tabs, (nextTabs) => {
  refreshOverlayScrollbar()
  notifyTabsChanged((nextTabs || []).map(tab => tab.sessionId))
}, { flush: 'post' })

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
    'hover:bg-[var(--wj-markdown-bg-secondary)]': !active,
  }
}

function handleTabPointerDown(tab, event) {
  if (!tab?.sessionId) {
    return
  }
  handleTabPointerDownRaw(tab.sessionId, event)
}

/**
 * 点击激活。
 *
 * 拖拽结束后那一次 click 必须吞掉：
 * 用户已经表达了“我在拖动”，此时再顺手激活一个后台标签完全不符合预期。
 */
function handleTabClick(tab) {
  if (shouldSuppressClick(tab?.sessionId)) {
    return
  }
  activateTab(tab)
}

async function activateTab(tab) {
  if (!tab?.sessionId || isActiveTab(tab)) {
    return
  }

  // 切标签前必须先把挂起的正文同步进主进程，
  // 否则主进程的切换自动保存会拿到上一个版本。
  // 只有开启“切换标签时”自动保存才需要这次往返。
  //
  // 同步失败时传 autoSave: false：宁可不保存，
  // 也不能拿旧内容写盘并伪装成“已保存”。
  let autoSaveReady = true
  if (isTabSwitchAutoSaveEnabled.value) {
    try {
      const preparation = await requestCurrentWindowOpenPreparation()
      autoSaveReady = preparation?.ok !== false
    }
    catch {
      autoSaveReady = false
    }
  }

  // 用户自己点的标签不需要事后补位移，记下本次激活目标供 watch 消费
  localActivationSessionId = tab.sessionId
  requestDocumentActivateTab(tab.sessionId, { autoSave: autoSaveReady }).then(() => {}).catch(() => {})
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

/**
 * 把标签移动到新窗口。
 *
 * 会话整体搬走：正文、脏状态、外部变更待处理态都保留，所以脏标签和未命名标签都能移。
 * 但撤销历史存在渲染进程的 EditorState 里，新窗口拿不到，
 * 所以必须二次确认并明确告知这条限制。
 *
 * 迁移前要先把挂起的正文同步进主进程：
 * 活动标签的正文可能还在 160ms 防抖窗口里，不 flush 就迁移会让最后一次输入随旧窗口一起消失。
 * 后台标签的正文在切走那一刻就已经同步过了，不需要多这一次往返。
 */
async function moveTabToNewWindow(tab) {
  if (!tab?.sessionId) {
    return
  }

  const confirmed = await new Promise((resolve) => {
    Modal.confirm({
      title: t('documentTab.moveToNewWindowConfirmTitle'),
      content: t('documentTab.moveToNewWindowConfirmContent', {
        fileName: getTabLabel(tab),
      }),
      okText: t('okText'),
      cancelText: t('cancelText'),
      centered: true,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
  if (!confirmed) {
    return
  }

  if (isActiveTab(tab)) {
    try {
      await requestCurrentWindowOpenPreparation()
    }
    catch {}
  }

  try {
    const movedWindowId = await requestDocumentMoveTabToNewWindow(tab.sessionId)
    if (!movedWindowId) {
      message.error(t('documentTab.moveToNewWindowFailed'))
      return
    }
    message.success(t('documentTab.moveToNewWindowSucceeded'))
  }
  catch {
    message.error(t('documentTab.moveToNewWindowFailed'))
  }
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
    // 分隔线把“关闭”与“窗口动作”分开
    {
      type: 'divider',
    },
    {
      key: 'move-to-new-window',
      label: t('documentTab.moveToNewWindow'),
      // 只有一个标签时“移动到新窗口”等于把整个窗口搬走：
      // 结果和“关窗口 + 开新窗口”一样，只会平白丢掉撤销历史。
      disabled: tabs.value.length <= 1,
    },
    // 分隔线把“窗口动作”与“文件操作”分开
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
  if (key === 'move-to-new-window') {
    moveTabToNewWindow(tab)
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
    :class="{ 'is-dragging': isDragging }"
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
            class="group document-tab h-6 max-w-60 min-w-0 flex shrink-0 cursor-pointer select-none items-center gap-1 rounded px-1 text-sm transition-colors"
            :class="getTabClassList(tab)"
            @pointerdown="handleTabPointerDown(tab, $event)"
            @click="handleTabClick(tab)"
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
.document-tab {
  /*
   * 常驻 transform 过渡：拖拽时的让位、以及“顺序没变”时的回弹都靠它。
   * 提交成功后由 JS 临时设 `transition: none` 瞬清，
   * 避免元素从旧位置的让位偏移滑向新位置的自然位置。
   *
   * 这里显式列出 color / background-color，是为了覆盖 UnoCSS 的
   * `transition-colors` 时不把原有的颜色过渡一起丢掉。
   */
  transition:
    transform 140ms cubic-bezier(0.2, 0.7, 0.3, 1),
    color 150ms,
    background-color 150ms;
}

.document-tab-bar.is-dragging {
  cursor: grabbing;

  .document-tab {
    cursor: grabbing;
    will-change: transform;
  }

  /*
   * 拖拽期间禁用非活动标签的 hover 高亮，避免和让位动画打架。
   * 活动标签保持原有背景，否则用户会以为拖拽把激活态弄丢了。
   */
  .document-tab[data-active='false']:hover {
    background-color: transparent;
  }

  /*
   * 分隔线只是 1px 的视觉元素，让位算法只按标签本身计算。
   * 隐藏但保留占位，松手后主进程重排、DOM 重建时自然恢复。
   */
  .document-tab-separator {
    opacity: 0;
  }

  /* 拖拽中关闭按钮不该看起来可点 */
  .document-tab__close {
    opacity: 0;
  }
}

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
